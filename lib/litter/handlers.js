import { InteractionResponseType } from 'discord-interactions';
import { Permissions, hasPermission } from '../../constants.js';
import { isLitterEnabled, litterChannelId } from './config.js';
import { ROLE_BODY, findLitterRole, litterScope, missingOverwrites } from './hiding.js';
import {
  REFUSALS, REPLIES, buildReleased, buildSent, buildVote, buildVoteExpired, buildVoteFailed, buildVoteForgotten, buildVoteOverruled,
  buildVoteReached, voteLink,
} from './messages.js';
import { getTargetRefusal, hasDrifted, litterState, restorableRoles } from './state.js';
import { VOTE_TTL_MS } from './votes.js';
import { ephemeralReply, parseCustomId } from '../../utils.js';

// A bot user has the same id as its application
const botId = () => process.env.APP_ID;

/**
 * The litter: what the command, the vote button and the Gateway events do, with the Discord API, the
 * store and the votes injected (real ones in lib/litter/index.js, fakes in the tests)
 */
export function createLitter({ api, store, votes, schedule = setTimeout }) {
  // The role and the overwrites of the whole server, created or completed when needed.
  // Returns the role, or null when the litter channel is not in this server
  async function ensureHidden(guildId, { roles, channels } = {}) {
    roles ??= await api.fetchRoles(guildId);
    channels ??= await api.fetchChannels(guildId);
    const scope = litterScope(channels, litterChannelId());
    if (!scope) return null;
    const role = findLitterRole(roles) ?? await api.createRole(guildId, ROLE_BODY);
    // One by one: the first run writes an overwrite per channel, and Discord rate limits them.
    // A channel the bot can't manage is logged and skipped: the others must still be hidden
    for (const overwrite of missingOverwrites(channels, role.id, scope)) {
      try {
        await api.putOverwrite(overwrite.channelId, role.id, overwrite);
      } catch (err) {
        console.error(`Cannot hide the channel ${overwrite.channelId} from the litter:`, err.message);
      }
    }
    return role;
  }

  async function fetchActors(guildId, targetId) {
    const [guild, target, bot] = await Promise.all([
      api.fetchGuild(guildId), api.fetchMember(guildId, targetId), api.fetchMember(guildId, botId()),
    ]);
    return { guild, target, bot, refusal: getTargetRefusal({ guild, target, targetId, bot }) };
  }

  // Sends the target to the litter. Returns a refusal key (see REFUSALS), or null when done
  async function send(guildId, targetId, reason) {
    const { guild, target, refusal } = await fetchActors(guildId, targetId);
    if (refusal) return refusal;
    const role = await ensureHidden(guildId, { roles: guild.roles });
    if (!role) return 'notConfigured';
    const state = litterState(target, guild.roles, role.id);
    // The row is the lock: written first, but a member whose PATCH is refused must not stay locked
    const wasInLitter = Boolean(await store.getLitterMember(guildId, targetId));
    await store.saveLitterMember(guildId, targetId, { roles: state.saved, nick: target.nick ?? null });
    try {
      await api.patchMember(guildId, targetId, { roles: state.roles, nick: state.nick }, reason);
    } catch (err) {
      if (!wasInLitter) await store.deleteLitterMember(guildId, targetId);
      throw err;
    }
    await api.moveToVoice(guildId, targetId, litterChannelId());
    return null;
  }

  // Releases the target: saved roles and nickname given back. Returns a refusal key, or null when done
  async function release(guildId, targetId, reason) {
    const saved = await store.getLitterMember(guildId, targetId);
    if (!saved) return null;
    const { guild, target, bot, refusal } = await fetchActors(guildId, targetId);
    // A member who left comes back free: only the row goes
    if (target && refusal) return refusal;
    await store.deleteLitterMember(guildId, targetId);
    if (!target) return null;
    const roles = restorableRoles(saved.roles, target, guild.roles, bot);
    await api.patchMember(guildId, targetId, { roles, nick: saved.nick }, reason);
    return null;
  }

  // The user command « Litière 💩 »: returns the text of the ephemeral answer
  async function command(interaction) {
    if (!isLitterEnabled()) return REFUSALS.notConfigured();
    const guildId = interaction.guild_id;
    const targetId = interaction.data.target_id;
    const actor = interaction.member.user;
    if (targetId === actor.id) return REFUSALS.self();

    const inLitter = Boolean(await store.getLitterMember(guildId, targetId));
    if (hasPermission(interaction, Permissions.ADMINISTRATOR)) {
      const act = inLitter ? release : send;
      const refusal = await act(guildId, targetId, `Litière de Pipette, par ${actor.username}`);
      if (refusal) return REFUSALS[refusal](targetId);
      await closeVotes(guildId, targetId);
      await api.sendMessage(interaction.channel_id, inLitter ? buildReleased(targetId, actor.id) : buildSent(targetId, actor.id));
      return inLitter ? REPLIES.released() : REPLIES.sent();
    }
    return vote(interaction, inLitter ? 'release' : 'litter');
  }

  // A member (not an admin) uses the command: opens a vote, or adds their voice to the open one
  async function vote(interaction, kind) {
    const guildId = interaction.guild_id;
    const targetId = interaction.data.target_id;
    const actorId = interaction.member.user.id;
    // A vote against someone the bot can't touch is pointless: refused before it opens
    const { refusal } = await fetchActors(guildId, targetId);
    if (refusal) return REFUSALS[refusal](targetId);

    const open = votes.find(guildId, targetId, kind);
    if (open) {
      const outcome = votes.cast(open, actorId);
      await afterCast(open, outcome);
      return `${REPLIES[outcome](open)} ${voteLink(open)}`;
    }

    const vote = votes.open({ guildId, targetId, kind, authorId: actorId, channelId: interaction.channel_id });
    try {
      const message = await api.sendMessage(interaction.channel_id, buildVote(vote));
      vote.messageId = message.id;
    } catch (err) {
      votes.close(vote);
      throw err;
    }
    schedule(() => expire(vote).catch((err) => console.error('Litter vote expiry error:', err)), VOTE_TTL_MS);
    return REPLIES.started();
  }

  // The vote message is posted right after the vote opens: a voice cast in between has nothing to edit yet
  async function editVote(vote, body) {
    if (vote.messageId) await api.editMessage(vote.channelId, vote.messageId, body);
  }

  // 5 minutes without the 4 voices: the vote is over (unless it was reached or closed by a late click)
  async function expire(vote) {
    if (!votes.get(vote.id)) return;
    votes.close(vote);
    await editVote(vote, buildVoteExpired(vote));
  }

  // An admin acted on the target: their open votes are pointless now
  async function closeVotes(guildId, targetId) {
    for (const kind of ['litter', 'release']) {
      const vote = votes.find(guildId, targetId, kind);
      if (!vote) continue;
      votes.close(vote);
      await editVote(vote, buildVoteOverruled(vote));
    }
  }

  // A voice was cast: the vote message shows it, and the 4th one applies the action
  async function afterCast(vote, outcome) {
    if (outcome === 'counted') await editVote(vote, buildVote(vote));
    if (outcome !== 'reached') return;
    const act = vote.kind === 'release' ? release : send;
    const refusal = await act(vote.guildId, vote.targetId, 'Litière de Pipette, par vote');
    await editVote(vote, refusal ? buildVoteFailed(vote, REFUSALS[refusal](vote.targetId)) : buildVoteReached(vote));
  }

  // The vote button: returns the interaction response; `after` is the work to do once it is sent
  async function voteButton(interaction) {
    const [voteId] = parseCustomId(interaction.data.custom_id).args;
    const vote = votes.get(voteId);
    // A vote the bot forgot (restart) or already closed: the message says so and the button goes away
    if (!vote) return { type: InteractionResponseType.UPDATE_MESSAGE, data: buildVoteForgotten() };
    const outcome = votes.cast(vote, interaction.member.user.id);
    if (outcome === 'closed') return { type: InteractionResponseType.UPDATE_MESSAGE, data: buildVoteExpired(vote) };
    if (outcome === 'duplicate' || outcome === 'target') return ephemeralReply(REPLIES[outcome](vote));
    return { type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE, after: () => afterCast(vote, outcome) };
  }

  // GUILD_MEMBER_ADD / GUILD_MEMBER_UPDATE: a member of the litter who drifted is put back.
  // The bot's own PATCH comes back as an event too: nothing is done when the member already matches.
  // Errors are logged, never retried: the event handler (the welcome message) goes on
  async function enforce(guildId, member) {
    if (!isLitterEnabled()) return;
    try {
      if (!(await store.getLitterMember(guildId, member.user.id))) return;
      const roles = await api.fetchRoles(guildId);
      const found = findLitterRole(roles);
      if (found && !hasDrifted(member, roles, found.id)) return;
      const role = found ?? await ensureHidden(guildId, { roles });
      if (!role) return;
      const state = litterState(member, roles, role.id);
      await api.patchMember(guildId, member.user.id, { roles: state.roles, nick: state.nick }, 'Litière de Pipette, retour à la niche');
    } catch (err) {
      console.error(`Cannot keep ${member.user.id} in the litter:`, err.message);
    }
  }

  // GUILD_CREATE: the role and the overwrites of the whole server (nothing on a server without the litter)
  async function setup(guild) {
    if (!isLitterEnabled()) return;
    await ensureHidden(guild.id, { roles: guild.roles, channels: guild.channels });
  }

  // CHANNEL_CREATE / CHANNEL_UPDATE: the overwrite of that channel. Our own PUT comes back as an update: no-op then
  async function channelChanged(channel) {
    if (!isLitterEnabled() || !channel.guild_id) return;
    const [roles, litter] = await Promise.all([api.fetchRoles(channel.guild_id), api.fetchChannel(litterChannelId())]);
    const role = findLitterRole(roles);
    if (!role || !litter || litter.guild_id !== channel.guild_id) return;
    const scope = { channelId: litter.id, categoryId: litter.parent_id ?? null };
    for (const overwrite of missingOverwrites([channel], role.id, scope)) {
      await api.putOverwrite(channel.id, role.id, overwrite);
    }
  }

  return { ensureHidden, send, release, command, voteButton, enforce, setup, channelChanged };
}
