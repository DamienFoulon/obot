import { DuplicateNameError } from './errors.js';
import { getDatabase } from '../../database.js';

/**
 * Coordinates are always read and written with their world (thread_id): a coordinate id alone never
 * reaches another world
 */

function toCoordinate(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    name: row.name,
    dimension: row.dimension,
    x: row.x,
    y: row.y,
    z: row.z,
    note: row.note,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

async function write(sql, params) {
  try {
    const [result] = await getDatabase().execute(sql, params);
    return result;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new DuplicateNameError();
    throw err;
  }
}

export async function countCoordinates(threadId) {
  const [rows] = await getDatabase().execute('SELECT COUNT(*) AS total FROM coordinates WHERE thread_id = ?', [threadId]);
  return Number(rows[0].total);
}

// ENUM columns sort by their declaration order: Overworld, Nether, End
// query() instead of execute(): LIMIT placeholders are refused by some MySQL versions in prepared statements
export async function listCoordinates(threadId, { offset, limit }) {
  const [rows] = await getDatabase().query(
    'SELECT * FROM coordinates WHERE thread_id = ? ORDER BY dimension, name LIMIT ? OFFSET ?',
    [threadId, limit, offset],
  );
  return rows.map(toCoordinate);
}

export async function getCoordinate(threadId, id) {
  const [rows] = await getDatabase().execute('SELECT * FROM coordinates WHERE id = ? AND thread_id = ?', [id, threadId]);
  return rows[0] ? toCoordinate(rows[0]) : null;
}

export async function addCoordinate(threadId, { name, dimension, x, y, z, note }, userId) {
  const result = await write(
    'INSERT INTO coordinates (thread_id, name, dimension, x, y, z, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [threadId, name, dimension, x, y, z, note, userId],
  );
  return result.insertId;
}

// false when the coordinate doesn't exist (anymore) in this world
export async function updateCoordinate(threadId, id, { name, dimension, x, y, z, note }, userId) {
  const result = await write(
    'UPDATE coordinates SET name = ?, dimension = ?, x = ?, y = ?, z = ?, note = ?, updated_by = ? WHERE id = ? AND thread_id = ?',
    [name, dimension, x, y, z, note, userId, id, threadId],
  );
  return result.affectedRows > 0;
}

export async function deleteCoordinate(threadId, id) {
  const result = await write('DELETE FROM coordinates WHERE id = ? AND thread_id = ?', [id, threadId]);
  return result.affectedRows > 0;
}

export async function getPanel(threadId) {
  const [rows] = await getDatabase().execute('SELECT message_id FROM coordinate_panels WHERE thread_id = ?', [threadId]);
  return rows[0]?.message_id ?? null;
}

export async function setPanel(threadId, messageId) {
  await write(
    'INSERT INTO coordinate_panels (thread_id, message_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE message_id = VALUES(message_id)',
    [threadId, messageId],
  );
}
