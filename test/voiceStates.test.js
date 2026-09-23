import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  clearVoiceStates, countHumans, getBotChannel, getUserChannel, setGuildVoiceStates, updateVoiceState,
} from '../lib/music/voiceStates.js';

beforeEach(() => {
  clearVoiceStates();
  process.env.APP_ID = 'bot';
});

test('GUILD_CREATE fills the voice states, the bot flag comes from the members', () => {
  setGuildVoiceStates({
    id: 'g1',
    voice_states: [{ user_id: 'u1', channel_id: 'c1' }, { user_id: 'bot', channel_id: 'c1' }],
    members: [{ user: { id: 'u1' } }, { user: { id: 'bot', bot: true } }],
  });
  assert.equal(getUserChannel('g1', 'u1'), 'c1');
  assert.equal(getBotChannel('g1'), 'c1');
  assert.equal(countHumans('g1', 'c1'), 1);
});

test('a member joins, moves and leaves', () => {
  updateVoiceState({ guild_id: 'g1', user_id: 'u1', channel_id: 'c1', member: { user: { id: 'u1' } } });
  assert.equal(getUserChannel('g1', 'u1'), 'c1');
  updateVoiceState({ guild_id: 'g1', user_id: 'u1', channel_id: 'c2', member: { user: { id: 'u1' } } });
  assert.equal(getUserChannel('g1', 'u1'), 'c2');
  assert.equal(countHumans('g1', 'c1'), 0);
  assert.equal(countHumans('g1', 'c2'), 1);
  updateVoiceState({ guild_id: 'g1', user_id: 'u1', channel_id: null, member: { user: { id: 'u1' } } });
  assert.equal(getUserChannel('g1', 'u1'), null);
});

test('bots are not counted as listeners', () => {
  updateVoiceState({ guild_id: 'g1', user_id: 'b2', channel_id: 'c1', member: { user: { id: 'b2', bot: true } } });
  assert.equal(countHumans('g1', 'c1'), 0);
});

test('unknown guilds and users', () => {
  assert.equal(getUserChannel('nope', 'u1'), null);
  assert.equal(getBotChannel('nope'), null);
  assert.equal(countHumans('nope', 'c1'), 0);
});
