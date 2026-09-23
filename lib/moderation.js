import { Permissions } from '../constants.js';
import { DiscordRequest } from '../utils.js';

/**
 * Discord refuses to sanction some members, whatever the bot permissions: check it before acting,
 * to answer with a clear message instead of a "Missing Permissions" error
 * See https://docs.discord.com/developers/topics/permissions#permission-hierarchy
 */

async function fetchMember(guildId, userId) {
  try {
    const res = await DiscordRequest(`guilds/${guildId}/members/${userId}`);
    return res.json();
  } catch (err) {
    if (err.message.includes('Discord API error 404')) return null;
    throw err;
  }
}

// Position of the highest role of a member (0 for @everyone only)
function highestRolePosition(member, roles) {
  return Math.max(0, ...roles.filter((role) => member.roles.includes(role.id)).map((role) => role.position));
}

function isAdministrator(member, roles, guildId) {
  const administrator = BigInt(Permissions.ADMINISTRATOR);
  // The @everyone role has the same id as the guild
  return roles
    .filter((role) => role.id === guildId || member.roles.includes(role.id))
    .some((role) => (BigInt(role.permissions) & administrator) === administrator);
}

/**
 * Returns why the member of the interaction can't `action` ("ban", "kick" or "timeout") the target,
 * or null when they can
 */
export async function getModerationError(interaction, targetId, action) {
  const guildId = interaction.guild_id;
  const [guild, target, bot] = await Promise.all([
    DiscordRequest(`guilds/${guildId}`).then((res) => res.json()),
    fetchMember(guildId, targetId),
    // A bot user has the same id as its application
    fetchMember(guildId, interaction.application_id),
  ]);

  // Users who are not in the server can still be banned, to prevent them from joining
  if (!target) return action === 'ban' ? null : `<@${targetId}> is not in the server anymore 👀`;
  if (targetId === guild.owner_id) return `I can't ${action} the owner of the server 👑`;
  if (action === 'timeout' && isAdministrator(target, guild.roles, guildId)) {
    return `Discord doesn't allow to timeout <@${targetId}>, they are an administrator 🛡️`;
  }

  const targetPosition = highestRolePosition(target, guild.roles);
  if (targetPosition >= highestRolePosition(bot, guild.roles)) {
    return `<@${targetId}> has a role higher than mine, move my role above theirs in the server settings to ${action} them ⬆️`;
  }
  const moderator = interaction.member;
  if (moderator.user.id !== guild.owner_id && targetPosition >= highestRolePosition(moderator, guild.roles)) {
    return `You can't ${action} <@${targetId}>, their role is not below yours 👮`;
  }
  return null;
}
