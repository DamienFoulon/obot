// The API of lib/litter/store.js, in memory. rows: "guildId:userId" -> { roles, nick }
export function createFakeLitterStore() {
  const rows = new Map();
  const key = (guildId, userId) => `${guildId}:${userId}`;
  return {
    rows,
    async getLitterMember(guildId, userId) {
      const row = rows.get(key(guildId, userId));
      return row ? { roles: [...row.roles], nick: row.nick } : null;
    },
    // Like INSERT IGNORE: the first save wins
    async saveLitterMember(guildId, userId, { roles, nick }) {
      if (!rows.has(key(guildId, userId))) rows.set(key(guildId, userId), { roles: [...roles], nick });
    },
    async deleteLitterMember(guildId, userId) {
      rows.delete(key(guildId, userId));
    },
  };
}
