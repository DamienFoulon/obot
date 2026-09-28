import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_ROOM_NAME, buildRoomName, displayName } from '../../lib/tempVoice/names.js';

const length = (text) => [...text].length;

test('a room is named after the game and the owner', () => {
  assert.equal(buildRoomName({ game: 'VALORANT', name: 'Yaguaa' }), '🎮 VALORANT · Yaguaa');
});

test('without a game, only the owner', () => {
  assert.equal(buildRoomName({ game: null, name: 'Yaguaa' }), '🔊 Yaguaa');
});

test('the display name is the nickname, else the global name, else the username', () => {
  assert.equal(displayName({ nick: 'Tomeuh', user: { username: 'asutoki', global_name: 'Tom' } }), 'Tomeuh');
  assert.equal(displayName({ nick: null, user: { username: 'asutoki', global_name: 'Tom' } }), 'Tom');
  assert.equal(displayName({ user: { username: 'asutoki' } }), 'asutoki');
});

test('long names are cut to fit in 100 characters', () => {
  const name = buildRoomName({ game: 'G'.repeat(150), name: 'N'.repeat(50) });
  assert.equal(length(name), MAX_ROOM_NAME);
  assert.ok(name.endsWith(` · ${'N'.repeat(31)}…`));
  assert.ok(name.includes('G…'));
  assert.equal(length(buildRoomName({ game: null, name: 'N'.repeat(50) })), 2 + 32);
});

test('emoji in a game name are not split', () => {
  const name = buildRoomName({ game: '🐉'.repeat(120), name: 'Ines' });
  assert.equal(length(name), MAX_ROOM_NAME);
  assert.ok(!name.includes('�'));
  assert.equal([...name].filter((c) => c === '🐉').length, MAX_ROOM_NAME - 2 - 3 - 4 - 1);
});
