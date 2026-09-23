import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoicePermissions, computeChannelPermissions, getMissingVoicePermissions } from '../lib/music/voicePermissions.js';

const { VIEW_CHANNEL, CONNECT, SPEAK } = VoicePermissions;
const ADMINISTRATOR = 1n << 3n;
const voice = VIEW_CHANNEL | CONNECT | SPEAK;

const base = {
  guildId: 'g',
  userId: 'bot',
  memberRoleIds: ['r1'],
  roles: [{ id: 'g', permissions: String(voice) }, { id: 'r1', permissions: '0' }, { id: 'r2', permissions: '0' }],
  overwrites: [],
};

test('without overwrites, the roles give the permissions', () => {
  assert.equal(computeChannelPermissions(base), voice);
  assert.deepEqual(getMissingVoicePermissions(base), []);
});

test('a channel overwrite can deny Speak', () => {
  const channel = { ...base, overwrites: [{ id: 'g', type: 0, allow: '0', deny: String(SPEAK) }] };
  assert.deepEqual(getMissingVoicePermissions(channel), ['Speak']);
});

test('a role overwrite allow wins over the @everyone deny, a member overwrite wins over both', () => {
  const everyoneDeny = { id: 'g', type: 0, allow: '0', deny: String(CONNECT | SPEAK) };
  const roleAllow = { id: 'r1', type: 0, allow: String(CONNECT | SPEAK), deny: '0' };
  const memberDeny = { id: 'bot', type: 1, allow: '0', deny: String(SPEAK) };
  assert.deepEqual(getMissingVoicePermissions({ ...base, overwrites: [everyoneDeny, roleAllow] }), []);
  assert.deepEqual(getMissingVoicePermissions({ ...base, overwrites: [everyoneDeny, roleAllow, memberDeny] }), ['Speak']);
});

test('overwrites of roles the bot does not have are ignored', () => {
  const channel = { ...base, overwrites: [{ id: 'r2', type: 0, allow: '0', deny: String(voice) }] };
  assert.deepEqual(getMissingVoicePermissions(channel), []);
});

test('administrators have every permission, whatever the overwrites', () => {
  const admin = {
    ...base,
    roles: [{ id: 'g', permissions: '0' }, { id: 'r1', permissions: String(ADMINISTRATOR) }],
    overwrites: [{ id: 'g', type: 0, allow: '0', deny: String(voice) }],
  };
  assert.deepEqual(getMissingVoicePermissions(admin), []);
});

test('lists every missing voice permission', () => {
  const none = { ...base, roles: [{ id: 'g', permissions: '0' }] };
  assert.deepEqual(getMissingVoicePermissions(none), ['View Channel', 'Connect', 'Speak']);
});
