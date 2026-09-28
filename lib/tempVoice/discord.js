import { fetchBotChannelPermissions } from '../channelPermissions.js';
import { DiscordRequest, auditLogReason } from '../../utils.js';

/**
 * The Discord calls of the temporary rooms, given to the registry (rooms.js) so the tests can replace them
 */

const MANAGE_CHANNELS = 1n << 4n;
const MOVE_MEMBERS = 1n << 24n;
const MANAGE_ROLES = 1n << 28n;

// The owner's rights on their room: rename it and set its user limit, lock it, disconnect someone
export const OWNER_PERMISSIONS = String(MANAGE_CHANNELS | MANAGE_ROLES | MOVE_MEMBERS);

export function ownerOverwrite(userId) {
  return { id: userId, type: 1, allow: OWNER_PERMISSIONS, deny: '0' };
}

export function isNotFound(err) {
  return err.message.includes('Discord API error 404');
}

// DiscordRequest puts the error body in its message: a 429 body has retry_after, in seconds
export function retryAfterMs(err) {
  const match = err.message.match(/^Discord API error 429 on [^:]+: (.*)$/s);
  if (!match) return null;
  try {
    const seconds = JSON.parse(match[1]).retry_after;
    return typeof seconds === 'number' ? Math.ceil(seconds * 1000) : null;
  } catch {
    return null;
  }
}

const ROOM_PERMISSIONS = [
  [1n << 10n, 'View Channel'],
  [1n << 20n, 'Connect'],
  [MANAGE_CHANNELS, 'Manage Channels'],
  [MANAGE_ROLES, 'Manage Roles'],
  [MOVE_MEMBERS, 'Move Members'],
];

export function missingRoomPermissions(permissions) {
  return ROOM_PERMISSIONS.filter(([flag]) => (permissions & flag) !== flag).map(([, name]) => name);
}

// The rooms are created next to the creator channel: the bot needs these permissions there
export async function checkCreatorPermissions(guildId, creatorId) {
  try {
    const missing = missingRoomPermissions(await fetchBotChannelPermissions(guildId, creatorId));
    if (missing.length) console.warn(`The temporary voice rooms need these bot permissions: ${missing.join(', ')} 🔒`);
  } catch (err) {
    console.error('Cannot check the temporary voice rooms permissions:', err.message);
  }
}

const headers = auditLogReason('Temporary voice room');

export const discordApi = {
  async getChannel(channelId) {
    return (await DiscordRequest(`channels/${channelId}`)).json();
  },
  async createChannel(guildId, body) {
    return (await DiscordRequest(`guilds/${guildId}/channels`, { method: 'POST', body, headers })).json();
  },
  async moveMember(guildId, userId, channelId) {
    await DiscordRequest(`guilds/${guildId}/members/${userId}`, { method: 'PATCH', body: { channel_id: channelId }, headers });
  },
  async deleteChannel(channelId) {
    await DiscordRequest(`channels/${channelId}`, { method: 'DELETE', headers });
  },
  // Discord allows 2 renames per 10 minutes: a 429 tells when to try again
  async renameChannel(channelId, name) {
    try {
      await DiscordRequest(`channels/${channelId}`, { method: 'PATCH', body: { name }, headers });
    } catch (err) {
      const retryAfter = retryAfterMs(err);
      if (retryAfter !== null) err.retryAfter = retryAfter;
      throw err;
    }
  },
  async setOwner(channelId, userId) {
    const { id, ...overwrite } = ownerOverwrite(userId);
    await DiscordRequest(`channels/${channelId}/permissions/${id}`, { method: 'PUT', body: overwrite, headers });
  },
  async removeOverwrite(channelId, userId) {
    await DiscordRequest(`channels/${channelId}/permissions/${userId}`, { method: 'DELETE', headers });
  },
};
