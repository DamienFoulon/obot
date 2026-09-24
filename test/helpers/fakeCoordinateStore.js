import { DuplicateNameError } from '../../lib/coordinates/errors.js';

const ORDER = ['overworld', 'nether', 'end'];

// The API of lib/coordinates/store.js, in memory, with the same world and name rules
export function createFakeStore() {
  const rows = [];
  const panels = new Map();
  let nextId = 1;

  const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
  const find = (threadId, id) => rows.find((row) => row.threadId === threadId && row.id === Number(id)) ?? null;
  const world = (threadId) => rows
    .filter((row) => row.threadId === threadId)
    .sort((a, b) => ORDER.indexOf(a.dimension) - ORDER.indexOf(b.dimension) || a.name.localeCompare(b.name));

  return {
    rows,
    async countCoordinates(threadId) {
      return world(threadId).length;
    },
    async listCoordinates(threadId, { offset, limit }) {
      return world(threadId).slice(offset, offset + limit).map((row) => ({ ...row }));
    },
    async getCoordinate(threadId, id) {
      const row = find(threadId, id);
      return row && { ...row };
    },
    async addCoordinate(threadId, fields, userId) {
      if (rows.some((row) => row.threadId === threadId && sameName(row.name, fields.name))) throw new DuplicateNameError();
      const row = { id: nextId++, threadId, ...fields, createdBy: userId, updatedBy: null };
      rows.push(row);
      return row.id;
    },
    async updateCoordinate(threadId, id, fields, userId) {
      const row = find(threadId, id);
      if (!row) return false;
      if (rows.some((other) => other !== row && other.threadId === threadId && sameName(other.name, fields.name))) {
        throw new DuplicateNameError();
      }
      Object.assign(row, fields, { updatedBy: userId });
      return true;
    },
    async deleteCoordinate(threadId, id) {
      const index = rows.findIndex((row) => row.threadId === threadId && row.id === Number(id));
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    },
    async getPanel(threadId) {
      return panels.get(threadId) ?? null;
    },
    async setPanel(threadId, messageId) {
      panels.set(threadId, messageId);
    },
  };
}
