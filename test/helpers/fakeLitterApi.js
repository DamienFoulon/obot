// The API of lib/litter/discord.js against a small fake server, recording what the litter does
export function createFakeApi() {
  const guild = {
    id: 'g',
    owner_id: 'own',
    roles: [
      { id: 'g', name: '@everyone', position: 0, managed: false, permissions: '0' },
      { id: 'booster', name: 'Server Booster', position: 4, managed: true, permissions: '0' },
      { id: 'cop', name: 'COP1', position: 5, managed: false, permissions: '0' },
      { id: 'botrole', name: 'OBOT', position: 10, managed: true, permissions: '0' },
      { id: 'goat', name: 'GOAT', position: 12, managed: false, permissions: '0' },
    ],
  };
  const channels = [
    { id: 'cat-litter', guild_id: 'g', type: 4, parent_id: null, permission_overwrites: [] },
    { id: 'litter', guild_id: 'g', type: 2, parent_id: 'cat-litter', permission_overwrites: [] },
    { id: 'cat-chat', guild_id: 'g', type: 4, parent_id: null, permission_overwrites: [] },
    { id: 'general', guild_id: 'g', type: 0, parent_id: 'cat-chat', permission_overwrites: [] },
  ];
  const member = (id, roles = [], nick = null, user = {}) => [id, { user: { id, username: id, ...user }, roles, nick }];
  const members = new Map([
    member('bot', ['botrole'], null, { bot: true }),
    member('own', ['cop']),
    member('adm', ['cop']),
    member('alice', ['cop', 'booster'], 'Ali'),
    member('bob'),
    member('greg', ['goat']),
  ]);
  const calls = [];
  const messages = [];
  let nextRoleId = 1;
  let nextMessageId = 1;

  const api = {
    guild, channels, members, calls, messages, edits: 0, failSend: false,
    // Channel ids whose overwrite PUT is refused, and whether the member PATCH is refused
    failPutOn: new Set(), failPatch: false,

    async fetchGuild() { return guild; },
    async fetchRoles() { return guild.roles; },
    async fetchChannels() { return channels; },
    async fetchChannel(channelId) { return channels.find((channel) => channel.id === channelId) ?? null; },
    async fetchMember(guildId, userId) { return members.get(userId) ?? null; },

    async patchMember(guildId, userId, body) {
      if (api.failPatch) throw new Error('Discord API error 403 on guilds/g/members/x: {"message":"Missing Permissions","code":50013}');
      calls.push(['patchMember', userId, body]);
      Object.assign(members.get(userId), body);
    },
    async moveToVoice(guildId, userId, channelId) {
      calls.push(['moveToVoice', userId, channelId]);
    },
    async createRole(guildId, body) {
      calls.push(['createRole']);
      const role = { id: `role${nextRoleId++}`, position: 1, managed: false, ...body };
      guild.roles.push(role);
      return role;
    },
    async putOverwrite(channelId, roleId, { allow, deny }) {
      if (api.failPutOn.has(channelId)) throw new Error(`Discord API error 403 on channels/${channelId}/permissions/x: {"message":"Missing Access","code":50001}`);
      calls.push(['putOverwrite', channelId]);
      const channel = channels.find((candidate) => candidate.id === channelId);
      channel.permission_overwrites = [
        ...(channel.permission_overwrites ?? []).filter((overwrite) => overwrite.id !== roleId),
        { id: roleId, type: 0, allow, deny },
      ];
    },
    async sendMessage(channelId, body) {
      if (api.failSend) throw new Error('Discord API error 403 on channels/x/messages: {}');
      const message = { id: `m${nextMessageId++}`, channelId, ...body };
      messages.push(message);
      return message;
    },
    async editMessage(channelId, messageId, body) {
      api.edits++;
      Object.assign(messages.find((message) => message.id === messageId), body);
    },
  };
  return api;
}
