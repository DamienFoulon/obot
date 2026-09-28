import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HIDDEN, SHOWN, findLitterRole, litterScope, missingOverwrites } from '../../lib/litter/hiding.js';

const channels = () => [
  { id: 'cat-litter', type: 4, parent_id: null, permission_overwrites: [] },
  { id: 'litter', type: 2, parent_id: 'cat-litter', permission_overwrites: [] },
  { id: 'cat-chat', type: 4, parent_id: null, permission_overwrites: [] },
  { id: 'general', type: 0, parent_id: 'cat-chat', permission_overwrites: [] },
  // No category, and no permission_overwrites key at all
  { id: 'lonely', type: 0, parent_id: null },
];
const scope = () => litterScope(channels(), 'litter');

test('the litter scope is the channel and its category', () => {
  assert.deepEqual(scope(), { channelId: 'litter', categoryId: 'cat-litter' });
  assert.equal(litterScope(channels(), 'nope'), null);
});

test('every channel and category outside the litter gets a deny, the litter gets an allow', () => {
  assert.deepEqual(missingOverwrites(channels(), 'role', scope()), [
    { channelId: 'cat-litter', ...SHOWN },
    { channelId: 'litter', ...SHOWN },
    { channelId: 'cat-chat', ...HIDDEN },
    { channelId: 'general', ...HIDDEN },
    { channelId: 'lonely', ...HIDDEN },
  ]);
  assert.equal(HIDDEN.deny, String((1n << 10n) | (1n << 20n)));
  assert.equal(SHOWN.allow, String((1n << 10n) | (1n << 11n) | (1n << 20n) | (1n << 21n)));
});

test('a complete overwrite is left alone, an incomplete or wrong one is rewritten', () => {
  const list = channels();
  list[3].permission_overwrites = [{ id: 'role', type: 0, allow: '0', deny: HIDDEN.deny }]; // complete
  list[2].permission_overwrites = [{ id: 'role', type: 0, allow: '0', deny: String(1n << 10n) }]; // VIEW_CHANNEL only
  list[1].permission_overwrites = [{ id: 'role', type: 0, allow: '0', deny: HIDDEN.deny }]; // the litter hidden by mistake
  list[0].permission_overwrites = [{ id: 'role', type: 1, allow: SHOWN.allow, deny: '0' }]; // a member overwrite, not the role's
  list[4].permission_overwrites = [{ id: 'role', type: 0, allow: String(1n << 10n), deny: '0' }]; // allowed by hand
  const ids = missingOverwrites(list, 'role', scope()).map((overwrite) => overwrite.channelId);
  assert.deepEqual(ids, ['cat-litter', 'litter', 'cat-chat', 'lonely']);
});

test('a channel of the litter category is shown even when the litter channel is elsewhere in the list', () => {
  const list = [{ id: 'litter-text', type: 0, parent_id: 'cat-litter', permission_overwrites: [] }];
  assert.deepEqual(missingOverwrites(list, 'role', { channelId: 'litter', categoryId: 'cat-litter' }), [
    { channelId: 'litter-text', ...SHOWN },
  ]);
  // Without a known category, only the litter channel itself is shown
  assert.deepEqual(missingOverwrites(list, 'role', { channelId: 'litter', categoryId: null }), [
    { channelId: 'litter-text', ...HIDDEN },
  ]);
});

test('the litter role is found by name', () => {
  assert.equal(findLitterRole([{ id: 'a', name: 'GOAT' }, { id: 'b', name: '💩' }]).id, 'b');
  assert.equal(findLitterRole([{ id: 'a', name: 'GOAT' }]), null);
});
