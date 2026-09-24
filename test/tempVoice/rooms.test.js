import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ownerOverwrite } from '../../lib/tempVoice/discord.js';
import { createRoomRegistry } from '../../lib/tempVoice/rooms.js';
import { FakeTimers, FakeVoiceApi } from '../helpers/fakeVoiceApi.js';

function setup({ creator = 'creator' } = {}) {
  const api = new FakeVoiceApi([
    { id: 'creator', type: 2, parent_id: 'cat', position: 0 },
    { id: 'cat', type: 4, permission_overwrites: [{ id: 'g1', type: 0, allow: '0', deny: '1024' }] },
  ]);
  const timers = new FakeTimers();
  const games = {};
  const logs = [];
  const registry = createRoomRegistry({
    api,
    creatorId: () => creator,
    getGame: (guildId, userId) => games[userId] ?? null,
    now: () => timers.now,
    setTimer: timers.set,
    clearTimer: timers.clear,
    log: (...args) => logs.push(args.join(' ')),
  });
  return { api, timers, games, logs, registry };
}

const member = (id) => ({ user: { id, username: id } });
const move = (registry, userId, oldChannelId, newChannelId, bot = false) => registry.onVoiceState({
  guildId: 'g1', userId, member: bot ? { user: { id: userId, username: userId, bot: true } } : member(userId), bot, oldChannelId, newChannelId,
});

// A member joins the creator and lands in their new room, like the Gateway tells it
async function createRoom({ api, registry }, userId) {
  await move(registry, userId, null, 'creator');
  const channelId = api.of('move').at(-1)[2];
  await move(registry, userId, 'creator', channelId);
  return channelId;
}

test('joining the creator creates a room named after the game, next to the creator', async () => {
  const { api, games, registry } = setup();
  games.u1 = 'VALORANT';
  await move(registry, 'u1', null, 'creator');
  assert.equal(api.created.name, '🎮 VALORANT · u1');
  assert.equal(api.created.type, 2);
  assert.equal(api.created.parent_id, 'cat');
  assert.equal(api.created.position, 1);
  // The category's overwrites are copied, the owner gets their rights
  assert.deepEqual(api.created.permission_overwrites, [{ id: 'g1', type: 0, allow: '0', deny: '1024' }, ownerOverwrite('u1')]);
  assert.deepEqual(api.of('move'), [['move', 'u1', 'room100']]);
  assert.equal(registry.getRoom('room100').ownerId, 'u1');
});

test('a member who plays nothing gets a room with their name', async () => {
  const { api, registry } = setup();
  await move(registry, 'u1', null, 'creator');
  assert.equal(api.created.name, '🔊 u1');
});

test('two events for the same join create one room', async () => {
  const { api, registry } = setup();
  await Promise.all([move(registry, 'u1', null, 'creator'), move(registry, 'u1', null, 'creator')]);
  assert.equal(api.of('create').length, 1);
});

test('two members get two rooms', async () => {
  const { api, registry } = setup();
  await createRoom({ api, registry }, 'u1');
  await createRoom({ api, registry }, 'u2');
  assert.equal(api.of('create').length, 2);
  assert.equal(registry.getRoom('room101').ownerId, 'u2');
});

test('a member who left before being moved leaves no room behind', async () => {
  const { api, logs, registry } = setup();
  api.failing.move = new Error('Discord API error 400 on guilds/g1/members/u1: {"message":"Target user is not connected to voice."}');
  await move(registry, 'u1', null, 'creator');
  assert.deepEqual(api.of('delete'), [['delete', 'room100']]);
  assert.equal(registry.getRoom('room100'), undefined);
  assert.equal(logs.length, 1);
});

test('a failed creation is logged and the member stays in the creator', async () => {
  const { api, logs, registry } = setup();
  api.failing.create = new Error('Discord API error 403 on guilds/g1/channels: {"message":"Missing Permissions"}');
  await move(registry, 'u1', null, 'creator');
  assert.equal(api.of('move').length, 0);
  assert.match(logs[0], /Missing Permissions/);
  // The next join tries again
  api.failing.create = null;
  await move(registry, 'u1', 'creator', null);
  await move(registry, 'u1', null, 'creator');
  assert.equal(api.of('create').length, 2);
});

test('the room is deleted when the last human leaves, bots do not count', async () => {
  const { api, registry } = setup();
  const room = await createRoom({ api, registry }, 'u1');
  await move(registry, 'bot', null, room, true);
  await move(registry, 'u1', room, null);
  assert.deepEqual(api.of('delete'), [['delete', room]]);
  assert.equal(registry.getRoom(room), undefined);
});

test('the room stays while someone is inside', async () => {
  const { api, registry } = setup();
  const room = await createRoom({ api, registry }, 'u1');
  await move(registry, 'u2', null, room);
  await move(registry, 'u2', room, null);
  assert.equal(api.of('delete').length, 0);
  assert.deepEqual(registry.getRoom(room).members, ['u1']);
});

test('mute, deafen or stream updates keep the same channel: nothing happens', async () => {
  const { api, registry } = setup();
  const room = await createRoom({ api, registry }, 'u1');
  const calls = api.calls.length;
  await move(registry, 'u1', room, room);
  await move(registry, 'u1', room, room);
  assert.equal(api.calls.length, calls);
  assert.deepEqual(registry.getRoom(room).members, ['u1']);
});

test('when the owner leaves, the first member still inside gets the room and its name', async () => {
  const { api, games, registry } = setup();
  const room = await createRoom({ api, registry }, 'u1');
  await move(registry, 'u2', null, room);
  await move(registry, 'u3', null, room);
  games.u2 = 'Minecraft';
  await move(registry, 'u1', room, null);
  assert.equal(registry.getRoom(room).ownerId, 'u2');
  assert.deepEqual(api.of('owner'), [['owner', room, 'u2']]);
  assert.deepEqual(api.of('unowner'), [['unowner', room, 'u1']]);
  assert.deepEqual(api.of('rename'), [['rename', room, '🎮 Minecraft · u2']]);
});

test('an owner who goes back to the creator gives their room away and gets a new one', async () => {
  const { api, registry } = setup();
  const room = await createRoom({ api, registry }, 'u1');
  await move(registry, 'u2', null, room);
  await move(registry, 'u1', room, 'creator');
  assert.equal(registry.getRoom(room).ownerId, 'u2');
  assert.equal(api.of('create').length, 2);
});

test('without a creator channel, nothing happens', async () => {
  const { api, registry } = setup({ creator: null });
  await move(registry, 'u1', null, 'creator');
  await move(registry, 'u1', 'creator', null);
  assert.equal(api.calls.length, 0);
});
