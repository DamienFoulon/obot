import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { clearPresences, getGame, setGuildPresences, updatePresence } from '../../lib/tempVoice/presences.js';

beforeEach(() => clearPresences());

const playing = (name) => ({ type: 0, name });

test('the game is the "Playing" activity', () => {
  updatePresence({ guild_id: 'g1', user: { id: 'u1' }, activities: [{ type: 4, name: 'Custom Status' }, playing('VALORANT')] });
  assert.equal(getGame('g1', 'u1'), 'VALORANT');
});

test('listening, streaming or a custom status is not a game', () => {
  updatePresence({ guild_id: 'g1', user: { id: 'u1' }, activities: [{ type: 2, name: 'Spotify' }, { type: 4, name: 'Custom Status' }] });
  assert.equal(getGame('g1', 'u1'), null);
});

test('stopping the game forgets it', () => {
  updatePresence({ guild_id: 'g1', user: { id: 'u1' }, activities: [playing('Minecraft')] });
  updatePresence({ guild_id: 'g1', user: { id: 'u1' }, activities: [] });
  assert.equal(getGame('g1', 'u1'), null);
});

test('presences are kept per guild', () => {
  updatePresence({ guild_id: 'g1', user: { id: 'u1' }, activities: [playing('Minecraft')] });
  assert.equal(getGame('g2', 'u1'), null);
});

test('GUILD_CREATE fills the presences of the guild', () => {
  setGuildPresences({ id: 'g1', presences: [{ user: { id: 'u1' }, activities: [playing('Counter-Strike 2')] }] });
  assert.equal(getGame('g1', 'u1'), 'Counter-Strike 2');
  setGuildPresences({ id: 'g2' });
  assert.equal(getGame('g2', 'u1'), null);
});
