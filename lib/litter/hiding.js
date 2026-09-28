/**
 * How the server is hidden from a member in the litter: a role with deny overwrites on every channel and
 * category outside the litter, and allow overwrites inside it. All the other roles are removed, so only
 * @everyone remains and the role's deny wins
 * See https://docs.discord.com/developers/topics/permissions#permission-overwrites
 */

const VIEW_CHANNEL = 1n << 10n;
const SEND_MESSAGES = 1n << 11n;
const CONNECT = 1n << 20n;
const SPEAK = 1n << 21n;

export const ROLE_NAME = '💩';
// Permissions "0": the role grants nothing on its own. Hoisted: shown apart in the member list
export const ROLE_BODY = { name: ROLE_NAME, permissions: '0', color: 0x7b3f00, hoist: true, mentionable: false };

export const HIDDEN = { allow: '0', deny: String(VIEW_CHANNEL | CONNECT) };
export const SHOWN = { allow: String(VIEW_CHANNEL | SEND_MESSAGES | CONNECT | SPEAK), deny: '0' };

export function findLitterRole(roles) {
  return roles.find((role) => role.name === ROLE_NAME) ?? null;
}

// The litter channel and its category, or null when the channel is not in this list (another server)
export function litterScope(channels, litterChannelId) {
  const litter = channels.find((channel) => channel.id === litterChannelId);
  return litter ? { channelId: litter.id, categoryId: litter.parent_id ?? null } : null;
}

function isInLitter(channel, scope) {
  return channel.id === scope.channelId
    || channel.id === scope.categoryId
    || (scope.categoryId !== null && channel.parent_id === scope.categoryId);
}

const hasBits = (value, bits) => (BigInt(value ?? 0) & BigInt(bits)) === BigInt(bits);

// The overwrites to write for the role, only where the current one is missing or incomplete.
// Writing on the channels and on their category keeps them "synced" for Discord (sync is equality)
export function missingOverwrites(channels, roleId, scope) {
  return channels.flatMap((channel) => {
    const wanted = isInLitter(channel, scope) ? SHOWN : HIDDEN;
    const current = (channel.permission_overwrites ?? []).find((overwrite) => overwrite.id === roleId && overwrite.type === 0);
    if (current && hasBits(current.allow, wanted.allow) && hasBits(current.deny, wanted.deny)) return [];
    return [{ channelId: channel.id, ...wanted }];
  });
}
