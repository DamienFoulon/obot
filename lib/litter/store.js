import { getDatabase } from '../../database.js';

/**
 * The members in the litter. The row is the lock: as long as it exists, the bot puts the member back
 */

export async function getLitterMember(guildId, userId) {
  const [rows] = await getDatabase().execute(
    'SELECT roles, nick FROM litter_members WHERE guild_id = ? AND user_id = ?', [guildId, userId],
  );
  if (!rows[0]) return null;
  // mysql2 parses JSON columns, except on some MariaDB versions where they come back as text
  const roles = typeof rows[0].roles === 'string' ? JSON.parse(rows[0].roles) : rows[0].roles;
  return { roles, nick: rows[0].nick };
}

// A member already in the litter keeps their first saved roles: the insert is ignored
export async function saveLitterMember(guildId, userId, { roles, nick }) {
  await getDatabase().execute(
    'INSERT IGNORE INTO litter_members (guild_id, user_id, roles, nick) VALUES (?, ?, ?, ?)',
    [guildId, userId, JSON.stringify(roles), nick],
  );
}

export async function deleteLitterMember(guildId, userId) {
  await getDatabase().execute('DELETE FROM litter_members WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}
