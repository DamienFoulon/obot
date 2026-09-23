import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { Permissions } from '../constants.js';
import { canControlMusic, getMusicAccessError } from '../lib/music/permissions.js';

const member = (roles = [], permissions = '0') => ({ member: { roles, permissions, user: { id: 'u1' } } });
const admin = member([], Permissions.ADMINISTRATOR);

beforeEach(() => {
  delete process.env.DJ_ROLE_ID;
});

test('without DJ_ROLE_ID, everybody controls the music', () => {
  assert.equal(canControlMusic(member()), true);
});

test('with DJ_ROLE_ID, only DJs and administrators do', () => {
  process.env.DJ_ROLE_ID = 'dj';
  assert.equal(canControlMusic(member()), false);
  assert.equal(canControlMusic(member(['dj'])), true);
  assert.equal(canControlMusic(admin), true);
});

test('the member must be in the voice channel of the bot', () => {
  assert.equal(getMusicAccessError(member(), { userChannelId: null, botChannelId: null, needsControl: false }), 'Join a voice channel first 🎧');
  assert.equal(getMusicAccessError(member(), { userChannelId: 'c1', botChannelId: null, needsControl: false }), null);
  assert.equal(getMusicAccessError(member(), { userChannelId: 'c2', botChannelId: 'c1', needsControl: false }), "I'm playing in <#c1>, join me there 🎧");
  assert.equal(getMusicAccessError(member(), { userChannelId: 'c1', botChannelId: 'c1', needsControl: true }), null);
});

test('controls need the DJ role when it is set', () => {
  process.env.DJ_ROLE_ID = 'dj';
  assert.equal(getMusicAccessError(member(), { userChannelId: 'c1', botChannelId: 'c1', needsControl: true }), 'Only DJs can do that 🎚️');
  assert.equal(getMusicAccessError(member(), { userChannelId: 'c1', botChannelId: 'c1', needsControl: false }), null);
});
