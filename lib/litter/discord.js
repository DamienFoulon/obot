import { DiscordRequest, auditLogReason, sendMessage } from '../../utils.js';

/**
 * The Discord calls of the litter, behind one object so that the tests can swap it
 */

const json = (res) => res.json();

export const discordApi = {
  fetchGuild: (guildId) => DiscordRequest(`guilds/${guildId}`).then(json),
  fetchRoles: (guildId) => DiscordRequest(`guilds/${guildId}/roles`).then(json),
  fetchChannels: (guildId) => DiscordRequest(`guilds/${guildId}/channels`).then(json),
  fetchChannel: (channelId) => DiscordRequest(`channels/${channelId}`).then(json),

  // null when the user is not in the server
  async fetchMember(guildId, userId) {
    try {
      return await DiscordRequest(`guilds/${guildId}/members/${userId}`).then(json);
    } catch (err) {
      if (err.message.includes('Discord API error 404')) return null;
      throw err;
    }
  },

  patchMember: (guildId, userId, body, reason) => DiscordRequest(`guilds/${guildId}/members/${userId}`, {
    method: 'PATCH', headers: auditLogReason(reason), body,
  }),

  // A member who is not in a voice channel can't be moved: Discord answers with the error code 40032, ignored here
  async moveToVoice(guildId, userId, channelId) {
    try {
      await DiscordRequest(`guilds/${guildId}/members/${userId}`, { method: 'PATCH', body: { channel_id: channelId } });
    } catch (err) {
      if (!err.message.includes('40032')) throw err;
    }
  },

  createRole: (guildId, body) => DiscordRequest(`guilds/${guildId}/roles`, {
    method: 'POST', headers: auditLogReason('Litière de Pipette'), body,
  }).then(json),

  // type 0: a role overwrite
  putOverwrite: (channelId, roleId, { allow, deny }) => DiscordRequest(`channels/${channelId}/permissions/${roleId}`, {
    method: 'PUT', body: { type: 0, allow, deny },
  }),

  sendMessage,
  editMessage: (channelId, messageId, body) => DiscordRequest(`channels/${channelId}/messages/${messageId}`, { method: 'PATCH', body }),
};
