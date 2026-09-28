import { highestRolePosition } from '../moderation.js';

/**
 * What a member looks like in the litter, and whether the bot may touch them
 * See https://docs.discord.com/developers/topics/permissions#permission-hierarchy
 */

export const NICK = '💩';

// Why the target can't be handled, or null when they can
export function getTargetRefusal({ guild, target, targetId, bot }) {
  if (!target) return 'gone';
  if (target.user?.bot) return 'bot';
  if (targetId === guild.owner_id) return 'owner';
  if (highestRolePosition(target, guild.roles) >= highestRolePosition(bot, guild.roles)) return 'above';
  return null;
}

// Managed roles (bots, Server Booster) can't be removed nor given by anybody: they are left as they are
const managedRoleIds = (member, roles) => member.roles.filter((id) => roles.find((role) => role.id === id)?.managed);

// The roles to save, and the roles + nickname to write, when sending a member to the litter
export function litterState(member, roles, litterRoleId) {
  const managed = managedRoleIds(member, roles);
  return {
    saved: member.roles.filter((id) => !managed.includes(id) && id !== litterRoleId),
    roles: [...managed, litterRoleId],
    nick: NICK,
  };
}

// Has a member of the litter got a role back, lost the litter role or changed their nickname?
export function hasDrifted(member, roles, litterRoleId) {
  return litterState(member, roles, litterRoleId).saved.length > 0
    || !member.roles.includes(litterRoleId)
    || member.nick !== NICK;
}

// The roles to write at release: the managed ones, plus the saved roles that still exist below the bot
export function restorableRoles(savedIds, member, roles, bot) {
  const botPosition = highestRolePosition(bot, roles);
  const restored = savedIds.filter((id) => {
    const role = roles.find((candidate) => candidate.id === id);
    return role && !role.managed && role.position < botPosition;
  });
  return [...managedRoleIds(member, roles), ...restored];
}
