import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ownerOverwrite } from '../../lib/tempVoice/discord.js';
import { RENAME_WINDOW, createRoomRegistry } from '../../lib/tempVoice/rooms.js';
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

test("the room follows the owner's game", async () => {
  const { api, games, registry } = setup();
  const room = await createRoom({ api, registry }, 'u1');
  games.u1 = 'VALORANT';
  await registry.onPresence('g1', 'u1');
  games.u1 = null;
  await registry.onPresence('g1', 'u1');
  assert.deepEqual(api.of('rename'), [['rename', room, '🎮 VALORANT · u1'], ['rename', room, '🔊 u1']]);
});

test('a presence update without a game change renames nothing', async () => {
  const { api, games, registry } = setup();
  games.u1 = 'VALORANT';
  await createRoom({ api, registry }, 'u1');
  await registry.onPresence('g1', 'u1');
  await registry.onPresence('g1', 'u1');
  await registry.onPresence('g1', 'u2');
  await registry.onPresence('g2', 'u1');
  assert.equal(api.of('rename').length, 0);
});

test('after 2 renames in 10 minutes, the room waits and takes the latest game', async () => {
  const { api, games, registry, timers } = setup();
  const room = await createRoom({ api, registry }, 'u1');
  for (const game of ['A', 'B', 'C', 'D']) {
    games.u1 = game;
    await registry.onPresence('g1', 'u1');
    await timers.advance(1000);
  }
  assert.deepEqual(api.of('rename').map(([, , name]) => name), ['🎮 A · u1', '🎮 B · u1']);
  await timers.advance(RENAME_WINDOW);
  assert.deepEqual(api.of('rename').map(([, , name]) => name), ['🎮 A · u1', '🎮 B · u1', '🎮 D · u1']);
});

test('a queued rename is dropped when the owner goes back to their first game', async () => {
  const { api, games, registry, timers } = setup();
  await createRoom({ api, registry }, 'u1');
  for (const game of ['A', 'B', 'C', 'B']) {
    games.u1 = game;
    await registry.onPresence('g1', 'u1');
  }
  await timers.advance(RENAME_WINDOW);
  assert.deepEqual(api.of('rename').map(([, , name]) => name), ['🎮 A · u1', '🎮 B · u1']);
});

test('a 429 is tried again after its retry_after', async () => {
  const { api, games, registry, timers } = setup();
  const room = await createRoom({ api, registry }, 'u1');
  api.failing.rename = [Object.assign(new Error('Discord API error 429 on channels/x: {}'), { retryAfter: 5000 })];
  games.u1 = 'VALORANT';
  await registry.onPresence('g1', 'u1');
  await timers.advance(5000);
  assert.deepEqual(api.of('rename'), [['rename', room, '🎮 VALORANT · u1'], ['rename', room, '🎮 VALORANT · u1']]);
  assert.equal(registry.getRoom(room).name, '🎮 VALORANT · u1');
});

test('a room renamed by hand is not renamed anymore', async () => {
  const { api, games, registry } = setup();
  const room = await createRoom({ api, registry }, 'u1');
  registry.onChannelUpdate({ id: room, name: 'Chez Yaguaa' });
  games.u1 = 'VALORANT';
  await registry.onPresence('g1', 'u1');
  assert.equal(api.of('rename').length, 0);
});

test("the bot's own renames are not taken for manual ones", async () => {
  const { api, games, registry } = setup();
  const room = await createRoom({ api, registry }, 'u1');
  games.u1 = 'A';
  await registry.onPresence('g1', 'u1');
  games.u1 = 'B';
  await registry.onPresence('g1', 'u1');
  // The CHANNEL_UPDATE of the first rename arrives after the second one was asked
  registry.onChannelUpdate({ id: room, name: '🎮 A · u1' });
  registry.onChannelUpdate({ id: room, name: '🎮 B · u1' });
  // Other changes (user limit, permissions) keep the name
  registry.onChannelUpdate({ id: room, name: '🎮 B · u1' });
  assert.equal(registry.getRoom(room).manual, false);
});

test('a room renamed by hand drops its queued rename', async () => {
  const { api, games, registry, timers } = setup();
  const room = await createRoom({ api, registry }, 'u1');
  for (const game of ['A', 'B', 'C']) {
    games.u1 = game;
    await registry.onPresence('g1', 'u1');
  }
  registry.onChannelUpdate({ id: room, name: 'Chez Yaguaa' });
  await timers.advance(RENAME_WINDOW);
  assert.equal(api.of('rename').length, 2);
});

test('a room deleted by hand is forgotten, its queued rename too', async () => {
  const { api, games, registry, timers } = setup();
  const room = await createRoom({ api, registry }, 'u1');
  for (const game of ['A', 'B', 'C']) {
    games.u1 = game;
    await registry.onPresence('g1', 'u1');
  }
  registry.onChannelDelete({ id: room });
  await timers.advance(RENAME_WINDOW);
  assert.equal(api.of('rename').length, 2);
  assert.equal(api.of('delete').length, 0);
  assert.equal(registry.getRoom(room), undefined);
  assert.equal(timers.timers.length, 0);
});

test('a room deleted because it is empty drops its queued rename', async () => {
  const { api, games, registry, timers } = setup();
  const room = await createRoom({ api, registry }, 'u1');
  for (const game of ['A', 'B', 'C']) {
    games.u1 = game;
    await registry.onPresence('g1', 'u1');
  }
  await move(registry, 'u1', room, null);
  await timers.advance(RENAME_WINDOW);
  assert.equal(api.of('rename').length, 2);
  assert.equal(timers.timers.length, 0);
});

const OWNER = String((1n << 4n) | (1n << 28n) | (1n << 24n));

function guild({ rooms = [], voiceStates = [], members = [] } = {}) {
  return {
    id: 'g1',
    channels: [
      { id: 'cat', type: 4, name: 'Vocal' },
      { id: 'creator', type: 2, parent_id: 'cat', name: '➕ Créer un salon', permission_overwrites: [] },
      // A fixed channel of the category: no owner overwrite
      { id: 'fixed', type: 2, parent_id: 'cat', name: 'LaGrosseBertha', permission_overwrites: [{ id: 'u9', type: 1, allow: '1049600', deny: '0' }] },
      // A channel of another category, with a user who can manage it
      { id: 'elsewhere', type: 2, parent_id: 'other', name: 'Soirée-ciné', permission_overwrites: [{ id: 'u9', type: 1, allow: OWNER, deny: '0' }] },
      ...rooms,
    ],
    voice_states: voiceStates,
    members,
  };
}

const room = (id, ownerId, name = `🔊 ${ownerId}`) => ({
  id, type: 2, parent_id: 'cat', name, permission_overwrites: [{ id: 'g1', type: 0, allow: '0', deny: '0' }, { id: ownerId, type: 1, allow: OWNER, deny: '0' }],
});

test('at startup, the occupied rooms are tracked again, the empty ones deleted', async () => {
  const { api, registry } = setup();
  await registry.restore(guild({
    rooms: [room('r1', 'u1'), room('r2', 'u2')],
    voiceStates: [{ user_id: 'u1', channel_id: 'r1' }, { user_id: 'u9', channel_id: 'fixed' }],
    members: [member('u1'), member('u9')],
  }));
  assert.equal(registry.getRoom('r1').ownerId, 'u1');
  assert.deepEqual(registry.getRoom('r1').members, ['u1']);
  assert.deepEqual(api.of('delete'), [['delete', 'r2']]);
  // Fixed channels and channels of other categories are left alone
  assert.equal(registry.getRoom('fixed'), undefined);
  assert.equal(registry.getRoom('elsewhere'), undefined);
  assert.equal(api.of('rename').length, 0);
});

test('at startup, a room with only a bot inside is deleted', async () => {
  const { api, registry } = setup();
  await registry.restore(guild({
    rooms: [room('r1', 'u1')],
    voiceStates: [{ user_id: 'bot', channel_id: 'r1' }],
    members: [{ user: { id: 'bot', username: 'Obot', bot: true } }],
  }));
  assert.deepEqual(api.of('delete'), [['delete', 'r1']]);
});

test('at startup, a room whose owner left goes to a member still inside', async () => {
  const { api, games, registry } = setup();
  games.u2 = 'Minecraft';
  await registry.restore(guild({
    rooms: [room('r1', 'u1')],
    voiceStates: [{ user_id: 'u2', channel_id: 'r1' }],
    members: [member('u2')],
  }));
  assert.equal(registry.getRoom('r1').ownerId, 'u2');
  assert.deepEqual(api.of('owner'), [['owner', 'r1', 'u2']]);
  assert.deepEqual(api.of('unowner'), [['unowner', 'r1', 'u1']]);
  assert.deepEqual(api.of('rename'), [['rename', 'r1', '🎮 Minecraft · u2']]);
});

test("at startup, the room takes the owner's current game", async () => {
  const { api, games, registry } = setup();
  games.u1 = 'VALORANT';
  await registry.restore(guild({ rooms: [room('r1', 'u1')], voiceStates: [{ user_id: 'u1', channel_id: 'r1' }], members: [member('u1')] }));
  assert.deepEqual(api.of('rename'), [['rename', 'r1', '🎮 VALORANT · u1']]);
});

test('after a restart, a room renamed by hand is named again once, then a new manual rename wins', async () => {
  const { api, games, registry } = setup();
  await registry.restore(guild({ rooms: [room('r1', 'u1', 'Chez moi')], voiceStates: [{ user_id: 'u1', channel_id: 'r1' }], members: [member('u1')] }));
  // Nothing tells the bot it was renamed by hand before the restart (accepted in the spec)
  assert.deepEqual(api.of('rename'), [['rename', 'r1', '🔊 u1']]);
  registry.onChannelUpdate({ id: 'r1', name: 'Chez nous' });
  games.u1 = 'VALORANT';
  await registry.onPresence('g1', 'u1');
  assert.equal(api.of('rename').length, 1);
});

test('a second GUILD_CREATE (reconnection) neither duplicates nor keeps deleted rooms', async () => {
  const { api, games, registry, timers } = setup();
  const created = await createRoom({ api, registry }, 'u1');
  for (const game of ['A', 'B', 'C']) {
    games.u1 = game;
    await registry.onPresence('g1', 'u1');
  }
  // Meanwhile, the room was deleted by hand while the bot was disconnected
  await registry.restore(guild({ rooms: [room('r1', 'u2')], voiceStates: [{ user_id: 'u2', channel_id: 'r1' }], members: [member('u2')] }));
  assert.equal(registry.getRoom(created), undefined);
  assert.equal(timers.timers.length, 0);
  await registry.restore(guild({ rooms: [room('r1', 'u2')], voiceStates: [{ user_id: 'u2', channel_id: 'r1' }], members: [member('u2')] }));
  assert.deepEqual(registry.getRoom('r1').members, ['u2']);
  assert.equal(api.of('delete').length, 0);
});

test('a guild without the creator channel is left alone', async () => {
  const { api, registry } = setup();
  await registry.restore({ id: 'g2', channels: [room('r1', 'u1')], voice_states: [], members: [] });
  assert.equal(api.calls.length, 0);
  assert.equal(registry.getRoom('r1'), undefined);
});
