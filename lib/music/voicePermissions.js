import { DiscordRequest } from '../../utils.js';

/**
 * The bot's permissions in a voice channel, computed like Discord does
 * Needed because a bot without Speak can still join: it would "play" in silence
 * See https://docs.discord.com/developers/topics/permissions#permission-overwrites
 */

export const VoicePermissions = {
  VIEW_CHANNEL: 1n << 10n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
};

const ADMINISTRATOR = 1n << 3n;
const ALL = (1n << 64n) - 1n;

const NAMES = [
  [VoicePermissions.VIEW_CHANNEL, 'View Channel'],
  [VoicePermissions.CONNECT, 'Connect'],
  [VoicePermissions.SPEAK, 'Speak'],
];

// The @everyone role and the @everyone overwrite have the id of the guild
export function computeChannelPermissions({ guildId, userId, memberRoleIds, roles, overwrites }) {
  const roleIds = new Set([guildId, ...memberRoleIds]);
  let permissions = 0n;
  for (const role of roles) if (roleIds.has(role.id)) permissions |= BigInt(role.permissions);
  if (permissions & ADMINISTRATOR) return ALL;

  const apply = (overwrite) => {
    if (overwrite) permissions = (permissions & ~BigInt(overwrite.deny)) | BigInt(overwrite.allow);
  };
  apply(overwrites.find((o) => o.id === guildId));
  // Role overwrites are merged first: an allow on one role wins over a deny on another
  let allow = 0n;
  let deny = 0n;
  for (const o of overwrites) {
    if (o.type === 0 && o.id !== guildId && memberRoleIds.includes(o.id)) {
      allow |= BigInt(o.allow);
      deny |= BigInt(o.deny);
    }
  }
  apply({ allow, deny });
  apply(overwrites.find((o) => o.type === 1 && o.id === userId));
  return permissions;
}

export function getMissingVoicePermissions(context) {
  const permissions = computeChannelPermissions(context);
  return NAMES.filter(([flag]) => (permissions & flag) !== flag).map(([, name]) => name);
}

// Returns the voice permissions the bot lacks in this channel
export async function fetchMissingVoicePermissions(guildId, channelId) {
  const userId = process.env.APP_ID;
  const [roles, channel, member] = await Promise.all([
    DiscordRequest(`guilds/${guildId}/roles`).then((res) => res.json()),
    DiscordRequest(`channels/${channelId}`).then((res) => res.json()),
    DiscordRequest(`guilds/${guildId}/members/${userId}`).then((res) => res.json()),
  ]);
  return getMissingVoicePermissions({
    guildId, userId, memberRoleIds: member.roles, roles, overwrites: channel.permission_overwrites ?? [],
  });
}
