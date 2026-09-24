import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OWNER_PERMISSIONS, isNotFound, missingRoomPermissions, ownerOverwrite, retryAfterMs,
} from '../../lib/tempVoice/discord.js';

test('a 429 gives its retry_after in milliseconds', () => {
  const err = new Error('Discord API error 429 on channels/1: {"message":"You are being rate limited.","retry_after":12.3,"global":false}');
  assert.equal(retryAfterMs(err), 12300);
});

test('other errors have no retry_after', () => {
  assert.equal(retryAfterMs(new Error('Discord API error 403 on channels/1: {"message":"Missing Permissions"}')), null);
  assert.equal(retryAfterMs(new Error('Discord API error 429 on channels/1: not json')), null);
  assert.equal(retryAfterMs(new Error('fetch failed')), null);
});

test('a 404 is recognised', () => {
  assert.equal(isNotFound(new Error('Discord API error 404 on channels/1: {"message":"Unknown Channel"}')), true);
  assert.equal(isNotFound(new Error('Discord API error 403 on channels/1: {}')), false);
});

test('the owner can manage the channel, its permissions and move members', () => {
  assert.equal(OWNER_PERMISSIONS, String((1n << 4n) | (1n << 28n) | (1n << 24n)));
  assert.deepEqual(ownerOverwrite('u1'), { id: 'u1', type: 1, allow: OWNER_PERMISSIONS, deny: '0' });
});

test('the missing bot permissions are named', () => {
  const all = (1n << 4n) | (1n << 28n) | (1n << 24n) | (1n << 10n) | (1n << 20n);
  assert.deepEqual(missingRoomPermissions(all), []);
  assert.deepEqual(missingRoomPermissions(all & ~(1n << 24n)), ['Move Members']);
});
