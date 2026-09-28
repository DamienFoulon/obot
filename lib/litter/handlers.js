import { InteractionResponseType } from 'discord-interactions';
import { Permissions, hasPermission } from '../../constants.js';
import { isLitterEnabled, litterChannelId } from './config.js';
import { ROLE_BODY, findLitterRole, litterScope, missingOverwrites } from './hiding.js';
import {
  REFUSALS, REPLIES, buildReleased, buildSent, buildVote, buildVoteExpired, buildVoteFailed, buildVoteReached, voteLink,
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
    // One by one: the first run writes an overwrite per channel, and Discord rate limits them
    for (const overwrite of missingOverwrites(channels, role.id, scope)) {
      await api.putOverwrite(overwrite.channelId, role.id, overwrite);
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
    await store.saveLitterMember(guildId, targetId, { roles: state.saved, nick: target.nick ?? null });
    await api.patchMember(guildId, targetId, { roles: state.roles, nick: state.nick }, reason);
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
      await api.sendMessage(interaction.channel_id, inLitter ? buildReleased(targetId, actor.id) : buildSent(targetId, actor.id));
      return inLitter ? REPLIES.released() : REPLIES.sent();
    }
    return vote(interaction, inLitter ? 'release' : 'litter');
  }

  // Task 7 replaces this stub with the vote
  async function vote() {
    throw new Error('not implemented');
  }

  return { ensureHidden, send, release, command };
}
