import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  isWorldThread, missingForumPermissions, rememberChannel, shouldDeleteMessage,
} from '../../lib/coordinates/forum.js';

beforeEach(() => {
  process.env.COORDINATES_FORUM_ID = 'forum';
  process.env.DB_HOST = 'db';
  process.env.APP_ID = 'bot';
});

test("keeps the post's original message and the bot's messages, deletes the rest", () => {
  assert.equal(shouldDeleteMessage({ id: 't1', channel_id: 't1', author: { id: 'u1' } }), false);
  assert.equal(shouldDeleteMessage({ id: 'm1', channel_id: 't1', author: { id: 'bot' } }), false);
  assert.equal(shouldDeleteMessage({ id: 'm2', channel_id: 't1', author: { id: 'u1' } }), true);
  assert.equal(shouldDeleteMessage({ id: 'm3', channel_id: 't1', author: { id: 'other-bot', bot: true } }), true);
});

test('world threads are the posts of the coordinates forum', async () => {
  rememberChannel({ id: 't1', parent_id: 'forum' });
  rememberChannel({ id: 'general', parent_id: 'category' });
  assert.equal(await isWorldThread('t1'), true);
  assert.equal(await isWorldThread('general'), false);
  assert.equal(await isWorldThread('t9', 'forum'), true);
});

test('the feature is off without the forum id or the database', async () => {
  rememberChannel({ id: 't1', parent_id: 'forum' });
  delete process.env.DB_HOST;
  assert.equal(await isWorldThread('t1'), false);
  process.env.DB_HOST = 'db';
  delete process.env.COORDINATES_FORUM_ID;
  assert.equal(await isWorldThread('t1', 'forum'), false);
});

test('the forum permissions the bot needs', () => {
  const all = (1n << 10n) | (1n << 38n) | (1n << 13n) | (1n << 16n);
  assert.deepEqual(missingForumPermissions(all), []);
  assert.deepEqual(missingForumPermissions(all & ~(1n << 13n)), ['Manage Messages']);
});
