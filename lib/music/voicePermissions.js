import { computeChannelPermissions, fetchBotChannelPermissions } from '../channelPermissions.js';

/**
 * The bot's permissions in a voice channel
 * Needed because a bot without Speak can still join: it would "play" in silence
 */

export { computeChannelPermissions };

export const VoicePermissions = {
  VIEW_CHANNEL: 1n << 10n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
};

const NAMES = [
  [VoicePermissions.VIEW_CHANNEL, 'View Channel'],
  [VoicePermissions.CONNECT, 'Connect'],
  [VoicePermissions.SPEAK, 'Speak'],
];

function missingVoicePermissions(permissions) {
  return NAMES.filter(([flag]) => (permissions & flag) !== flag).map(([, name]) => name);
}

export function getMissingVoicePermissions(context) {
  return missingVoicePermissions(computeChannelPermissions(context));
}

// Returns the voice permissions the bot lacks in this channel
export async function fetchMissingVoicePermissions(guildId, channelId) {
  return missingVoicePermissions(await fetchBotChannelPermissions(guildId, channelId));
}
