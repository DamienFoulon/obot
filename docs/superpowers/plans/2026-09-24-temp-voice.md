# Temporary voice channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member who joins « ➕ Créer un salon » gets their own voice channel, named after the game they play, deleted when nobody is left in it.

**Architecture:** Three small modules in `lib/tempVoice/`: `names.js` (pure naming), `presences.js` (who plays what, from the Gateway), `rooms.js` (a registry built by `createRoomRegistry({ api, ... })` with its Discord calls and clock injected, like `createPlayerRegistry` in `lib/music/players.js`). `discord.js` holds the real Discord calls, `index.js` wires the singleton and the startup. Gateway events feed the registry; nothing is stored in MySQL: after a restart, the rooms are found again from their owner's permission overwrite.

**Tech Stack:** Node.js ≥ 20.12, ES modules, `node:test` + `node:assert/strict`, raw Discord REST through `DiscordRequest` (`utils.js`), `@discordjs/ws` Gateway (`gateway.js`).

**Spec:** `docs/superpowers/specs/2026-09-24-temp-voice-design.md`

## Global Constraints

- Work in the worktree `/home/dfoulon/projects/alt/obot-temp-voice` (branch `feat/temp-voice`). Run `npm ci` there once before the first test run: the worktree has no `node_modules`.
- Tests: `npm test` runs `node --test "test/**/*.test.js"`. New tests go in `test/tempVoice/`.
- Code style: 2 spaces, single quotes, semicolons, short English comments explaining *why*, like the surrounding code. Channel names are French-free (only emoji, game, member name); log messages in English.
- Feature switch: `TEMP_VOICE_CREATOR_ID` (voice channel id). Unset → the feature does nothing.
- Room name: `🎮 {game} · {name}` or `🔊 {name}`; `{game}` = activity name as Discord gives it; `{name}` = nick, else `user.global_name`, else `user.username`; name cut at 32 code points, then the game cut so the whole name is ≤ 100 code points, cuts end with `…`.
- Owner overwrite: `{ id: userId, type: 1, allow: String((1n << 4n) | (1n << 28n) | (1n << 24n)), deny: '0' }` (Manage Channels, Manage Roles, Move Members).
- Rename limit: 2 renames per 10 minutes per room (`RENAME_WINDOW = 600000` ms).
- Commits: explicit paths with `git add <paths>` (never `-A`), message ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

- Mute / deafen / stream toggles send a `VOICE_STATE_UPDATE` with the same channel: nothing must happen (no member added twice, no room deleted). Pinned in Task 4.
- Presence updates arrive for every status change (online → idle…) without a game change: no rename call. Pinned in Task 5.
- A room deleted by hand while a rename is queued: the timer must not rename a deleted channel. Pinned in Task 5.
- The bot restarts while the owner already left the room, others still inside: ownership moves to someone present. Pinned in Task 6.
- The Gateway reconnects and `GUILD_CREATE` comes again: no duplicated room, no stale room kept for a channel deleted meanwhile. Pinned in Task 6.

---

### Task 1: Room names

**Files:**
- Create: `lib/tempVoice/names.js`
- Test: `test/tempVoice/names.test.js`

**Interfaces:**
- Produces: `displayName(member) -> string` (member = Discord guild member object `{ nick?, user: { username, global_name? } }`), `buildRoomName({ game: string|null, name: string }) -> string`, `MAX_ROOM_NAME = 100`.

- [ ] **Step 1: Install the dependencies in the worktree**

Run: `cd /home/dfoulon/projects/alt/obot-temp-voice && npm ci`
Expected: `added … packages`, no error.

- [ ] **Step 2: Write the failing test**

```js
// test/tempVoice/names.test.js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/tempVoice/names.test.js`
Expected: FAIL, `Cannot find module '…/lib/tempVoice/names.js'`.

- [ ] **Step 4: Write the implementation**

```js
// lib/tempVoice/names.js
/**
 * Names of the temporary voice rooms: "🎮 VALORANT · Yaguaa", or "🔊 Yaguaa" when the owner plays nothing
 */

// Discord's limit for a channel name
export const MAX_ROOM_NAME = 100;
// Discord's own limit for a member name
const MAX_MEMBER_NAME = 32;
const GAME_PREFIX = '🎮 ';
const IDLE_PREFIX = '🔊 ';
const SEPARATOR = ' · ';

// Counted in code points, so an emoji is never cut in half
function cut(text, max) {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

const length = (text) => [...text].length;

export function displayName(member) {
  return member.nick ?? member.user.global_name ?? member.user.username;
}

export function buildRoomName({ game, name }) {
  const owner = cut(name, MAX_MEMBER_NAME);
  if (!game) return `${IDLE_PREFIX}${owner}`;
  const room = MAX_ROOM_NAME - length(GAME_PREFIX) - length(SEPARATOR) - length(owner);
  return `${GAME_PREFIX}${cut(game, room)}${SEPARATOR}${owner}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/tempVoice/names.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/tempVoice/names.js test/tempVoice/names.test.js
git commit -m "Name the temporary voice rooms after the owner's game

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Presences (who plays what)

**Files:**
- Create: `lib/tempVoice/presences.js`
- Test: `test/tempVoice/presences.test.js`

**Interfaces:**
- Produces: `setGuildPresences(guild)` (reads `guild.id`, `guild.presences[]`), `updatePresence(presence)` (Gateway `PRESENCE_UPDATE` payload: `{ guild_id, user: { id }, activities: [{ type, name }] }`), `getGame(guildId, userId) -> string|null`, `clearPresences()` (tests).

- [ ] **Step 1: Write the failing test**

```js
// test/tempVoice/presences.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/tempVoice/presences.test.js`
Expected: FAIL, `Cannot find module '…/lib/tempVoice/presences.js'`.

- [ ] **Step 3: Write the implementation**

```js
// lib/tempVoice/presences.js
/**
 * The game each member plays, per guild: the temporary rooms are named after it
 * Filled by GUILD_CREATE and kept up to date by PRESENCE_UPDATE (the privileged Presence intent)
 * See https://docs.discord.com/developers/events/gateway-events#presence-update
 */

// Activity type 0 is "Playing"; listening, streaming and custom statuses are not games
const PLAYING = 0;

// "guildId:userId" -> game
const games = new Map();

export function updatePresence(presence) {
  if (!presence.guild_id || !presence.user?.id) return;
  const key = `${presence.guild_id}:${presence.user.id}`;
  const game = presence.activities?.find((activity) => activity.type === PLAYING)?.name;
  if (game) games.set(key, game);
  else games.delete(key);
}

// The presences of GUILD_CREATE have no guild_id
export function setGuildPresences(guild) {
  for (const presence of guild.presences ?? []) updatePresence({ ...presence, guild_id: guild.id });
}

export function getGame(guildId, userId) {
  return games.get(`${guildId}:${userId}`) ?? null;
}

// For the tests
export function clearPresences() {
  games.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/tempVoice/presences.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tempVoice/presences.js test/tempVoice/presences.test.js
git commit -m "Track the game each member plays

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Discord calls of the rooms

**Files:**
- Create: `lib/tempVoice/discord.js`
- Test: `test/tempVoice/discord.test.js`

**Interfaces:**
- Consumes: `DiscordRequest(endpoint, options)` and `auditLogReason(reason)` from `utils.js`; `fetchBotChannelPermissions(guildId, channelId) -> bigint` from `lib/channelPermissions.js`. `DiscordRequest` throws `Error('Discord API error <status> on <endpoint>: <JSON body>')`.
- Produces:
  - `isNotFound(err) -> boolean`
  - `retryAfterMs(err) -> number|null` (429 → `retry_after` seconds × 1000, rounded up)
  - `missingRoomPermissions(permissions: bigint) -> string[]`
  - `checkCreatorPermissions(guildId, creatorId) -> Promise<void>` (logs a warning)
  - `discordApi` with: `getChannel(id) -> channel`, `createChannel(guildId, body) -> channel`, `moveMember(guildId, userId, channelId)`, `deleteChannel(channelId)`, `renameChannel(channelId, name)` (a 429 error gets `err.retryAfter` in ms), `setOwner(channelId, userId)`, `removeOverwrite(channelId, userId)`.
  - `OWNER_PERMISSIONS` (string) and `ownerOverwrite(userId)`.

- [ ] **Step 1: Write the failing test**

```js
// test/tempVoice/discord.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/tempVoice/discord.test.js`
Expected: FAIL, `Cannot find module '…/lib/tempVoice/discord.js'`.

- [ ] **Step 3: Write the implementation**

```js
// lib/tempVoice/discord.js
import { fetchBotChannelPermissions } from '../channelPermissions.js';
import { DiscordRequest, auditLogReason } from '../../utils.js';

/**
 * The Discord calls of the temporary rooms, given to the registry (rooms.js) so the tests can replace them
 */

const MANAGE_CHANNELS = 1n << 4n;
const MOVE_MEMBERS = 1n << 24n;
const MANAGE_ROLES = 1n << 28n;

// The owner's rights on their room: rename it and set its user limit, lock it, disconnect someone
export const OWNER_PERMISSIONS = String(MANAGE_CHANNELS | MANAGE_ROLES | MOVE_MEMBERS);

export function ownerOverwrite(userId) {
  return { id: userId, type: 1, allow: OWNER_PERMISSIONS, deny: '0' };
}

export function isNotFound(err) {
  return err.message.includes('Discord API error 404');
}

// DiscordRequest puts the error body in its message: a 429 body has retry_after, in seconds
export function retryAfterMs(err) {
  const match = err.message.match(/^Discord API error 429 on [^:]+: (.*)$/s);
  if (!match) return null;
  try {
    const seconds = JSON.parse(match[1]).retry_after;
    return typeof seconds === 'number' ? Math.ceil(seconds * 1000) : null;
  } catch {
    return null;
  }
}

const ROOM_PERMISSIONS = [
  [1n << 10n, 'View Channel'],
  [1n << 20n, 'Connect'],
  [MANAGE_CHANNELS, 'Manage Channels'],
  [MANAGE_ROLES, 'Manage Roles'],
  [MOVE_MEMBERS, 'Move Members'],
];

export function missingRoomPermissions(permissions) {
  return ROOM_PERMISSIONS.filter(([flag]) => (permissions & flag) !== flag).map(([, name]) => name);
}

// The rooms are created next to the creator channel: the bot needs these permissions there
export async function checkCreatorPermissions(guildId, creatorId) {
  try {
    const missing = missingRoomPermissions(await fetchBotChannelPermissions(guildId, creatorId));
    if (missing.length) console.warn(`The temporary voice rooms need these bot permissions: ${missing.join(', ')} 🔒`);
  } catch (err) {
    console.error('Cannot check the temporary voice rooms permissions:', err.message);
  }
}

const headers = auditLogReason('Temporary voice room');

export const discordApi = {
  async getChannel(channelId) {
    return (await DiscordRequest(`channels/${channelId}`)).json();
  },
  async createChannel(guildId, body) {
    return (await DiscordRequest(`guilds/${guildId}/channels`, { method: 'POST', body, headers })).json();
  },
  async moveMember(guildId, userId, channelId) {
    await DiscordRequest(`guilds/${guildId}/members/${userId}`, { method: 'PATCH', body: { channel_id: channelId }, headers });
  },
  async deleteChannel(channelId) {
    await DiscordRequest(`channels/${channelId}`, { method: 'DELETE', headers });
  },
  // Discord allows 2 renames per 10 minutes: a 429 tells when to try again
  async renameChannel(channelId, name) {
    try {
      await DiscordRequest(`channels/${channelId}`, { method: 'PATCH', body: { name }, headers });
    } catch (err) {
      const retryAfter = retryAfterMs(err);
      if (retryAfter !== null) err.retryAfter = retryAfter;
      throw err;
    }
  },
  async setOwner(channelId, userId) {
    const { id, ...overwrite } = ownerOverwrite(userId);
    await DiscordRequest(`channels/${channelId}/permissions/${id}`, { method: 'PUT', body: overwrite, headers });
  },
  async removeOverwrite(channelId, userId) {
    await DiscordRequest(`channels/${channelId}/permissions/${userId}`, { method: 'DELETE', headers });
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/tempVoice/discord.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tempVoice/discord.js test/tempVoice/discord.test.js
git commit -m "Add the Discord calls of the temporary voice rooms

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Room registry — create, move, leave, transfer

**Files:**
- Create: `lib/tempVoice/rooms.js`
- Create: `test/helpers/fakeVoiceApi.js`
- Test: `test/tempVoice/rooms.test.js`

**Interfaces:**
- Consumes: `buildRoomName`, `displayName` (Task 1); `isNotFound`, `ownerOverwrite` (Task 3); an `api` object with the `discordApi` methods of Task 3.
- Produces: `createRoomRegistry({ api, creatorId: () => string|undefined, getGame: (guildId, userId) => string|null, now?, setTimer?, clearTimer?, log? })` returning `{ onVoiceState, onPresence, onChannelUpdate, onChannelDelete, restore, getRoom }`. This task implements `onVoiceState` and `getRoom`, and the internal `scheduleRename(channelId)` used by transfers (its rate limit comes in Task 5). `onVoiceState({ guildId, userId, member, bot, oldChannelId, newChannelId }) -> Promise<void>`. `getRoom(channelId) -> { guildId, ownerId, members, name, knownNames, manual, renames, timer } | undefined`. `RENAME_WINDOW`, `RENAMES_PER_WINDOW`.

- [ ] **Step 1: Write the fakes**

```js
// test/helpers/fakeVoiceApi.js
// Records the Discord calls of the rooms registry. `failing.<method>` makes a call throw:
// an Error for every call, or an array of errors used one per call
export class FakeVoiceApi {
  calls = [];
  failing = {};
  nextId = 100;
  created = null;
  channels = new Map();

  constructor(channels = []) {
    for (const channel of channels) this.channels.set(channel.id, channel);
  }

  #fail(method) {
    const failure = this.failing[method];
    const err = Array.isArray(failure) ? failure.shift() : failure;
    if (err) throw err;
  }

  of(type) { return this.calls.filter(([name]) => name === type); }

  async getChannel(id) { this.calls.push(['get', id]); return this.channels.get(id); }
  async createChannel(guildId, body) {
    this.calls.push(['create', body.name]);
    this.#fail('create');
    this.created = body;
    const channel = { id: `room${this.nextId++}`, ...body };
    this.channels.set(channel.id, channel);
    return channel;
  }
  async moveMember(guildId, userId, channelId) { this.calls.push(['move', userId, channelId]); this.#fail('move'); }
  async deleteChannel(channelId) { this.calls.push(['delete', channelId]); this.#fail('delete'); }
  async renameChannel(channelId, name) { this.calls.push(['rename', channelId, name]); this.#fail('rename'); }
  async setOwner(channelId, userId) { this.calls.push(['owner', channelId, userId]); }
  async removeOverwrite(channelId, userId) { this.calls.push(['unowner', channelId, userId]); }
}

// setTimeout / clearTimeout / Date.now on a clock moved by hand
export class FakeTimers {
  now = 0;
  timers = [];
  set = (fn, delay) => {
    const timer = { fn, at: this.now + delay };
    this.timers.push(timer);
    return timer;
  };
  clear = (timer) => { this.timers = this.timers.filter((t) => t !== timer); };
  async advance(ms) {
    this.now += ms;
    const due = this.timers.filter((t) => t.at <= this.now);
    this.timers = this.timers.filter((t) => t.at > this.now);
    for (const timer of due) await timer.fn();
  }
}
```

- [ ] **Step 2: Write the failing test**

```js
// test/tempVoice/rooms.test.js
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
  const { api, registry } = setup({ creator: undefined });
  await move(registry, 'u1', null, 'creator');
  await move(registry, 'u1', 'creator', null);
  assert.equal(api.calls.length, 0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/tempVoice/rooms.test.js`
Expected: FAIL, `Cannot find module '…/lib/tempVoice/rooms.js'`.

- [ ] **Step 4: Write the implementation**

```js
// lib/tempVoice/rooms.js
import { isNotFound, ownerOverwrite } from './discord.js';
import { buildRoomName, displayName } from './names.js';

/**
 * The temporary voice rooms: joining the creator channel creates one, named after the owner's game.
 * The owner who leaves gives it to the next member, the last human who leaves deletes it.
 * The Discord calls and the clock are given, so the tests can replace them
 */

// Discord allows 2 renames of a channel per 10 minutes
export const RENAME_WINDOW = 10 * 60 * 1000;
export const RENAMES_PER_WINDOW = 2;
const VOICE = 2;
// The names the bot asked last, to recognise the CHANNEL_UPDATE they cause (several can be in flight)
const KNOWN_NAMES = 5;

export function createRoomRegistry({
  api, creatorId, getGame, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, log = console.error,
}) {
  // channelId -> room
  const rooms = new Map();
  // userId -> display name, from the voice states
  const names = new Map();
  // Creations in progress: two events for the same join must not create two rooms
  const creating = new Set();

  const roomName = (guildId, userId) => buildRoomName({ game: getGame(guildId, userId), name: names.get(userId) ?? userId });

  function track(channelId, { guildId, ownerId, members, name }) {
    rooms.set(channelId, { guildId, ownerId, members, name, knownNames: [name], manual: false, renames: [], timer: null });
  }

  async function deleteRoom(channelId) {
    const room = rooms.get(channelId);
    if (!room) return;
    if (room.timer) clearTimer(room.timer);
    rooms.delete(channelId);
    try {
      await api.deleteChannel(channelId);
    } catch (err) {
      if (!isNotFound(err)) log(`Cannot delete the voice room ${channelId}:`, err.message);
    }
  }

  async function rename(channelId, name) {
    const room = rooms.get(channelId);
    room.name = name;
    room.knownNames = [...room.knownNames, name].slice(-KNOWN_NAMES);
    room.renames.push(now());
    try {
      await api.renameChannel(channelId, name);
    } catch (err) {
      if (!isNotFound(err)) log(`Cannot rename the voice room ${channelId}:`, err.message);
    }
  }

  // The name follows the owner's game, unless someone renamed the room by hand
  async function scheduleRename(channelId) {
    const room = rooms.get(channelId);
    if (!room || room.manual) return;
    const name = roomName(room.guildId, room.ownerId);
    if (name !== room.name) await rename(channelId, name);
  }

  async function transfer(channelId, room) {
    const previous = room.ownerId;
    room.ownerId = room.members[0];
    try {
      await api.setOwner(channelId, room.ownerId);
      await api.removeOverwrite(channelId, previous);
    } catch (err) {
      if (!isNotFound(err)) log(`Cannot give the voice room ${channelId} to ${room.ownerId}:`, err.message);
    }
    await scheduleRename(channelId);
  }

  async function leaveRoom(channelId, userId) {
    const room = rooms.get(channelId);
    room.members = room.members.filter((id) => id !== userId);
    if (room.members.length === 0) await deleteRoom(channelId);
    else if (room.ownerId === userId) await transfer(channelId, room);
  }

  async function createRoom(guildId, userId) {
    if (creating.has(userId)) return;
    creating.add(userId);
    let channelId = null;
    try {
      const creator = await api.getChannel(creatorId());
      const category = creator.parent_id ? await api.getChannel(creator.parent_id) : null;
      const name = roomName(guildId, userId);
      const channel = await api.createChannel(guildId, {
        name,
        type: VOICE,
        parent_id: creator.parent_id ?? null,
        position: creator.position + 1,
        // Like a channel created in the category by hand, plus the owner's rights
        permission_overwrites: [
          ...(category?.permission_overwrites ?? []).filter((overwrite) => overwrite.id !== userId),
          ownerOverwrite(userId),
        ],
      });
      channelId = channel.id;
      track(channelId, { guildId, ownerId: userId, members: [], name });
      await api.moveMember(guildId, userId, channelId);
    } catch (err) {
      // The member may have left the creator before being moved: the room would stay empty
      log(`Cannot create a voice room for ${userId}:`, err.message);
      if (channelId) await deleteRoom(channelId);
    } finally {
      creating.delete(userId);
    }
  }

  async function onVoiceState({ guildId, userId, member, bot, oldChannelId, newChannelId }) {
    // Bots never own a room and don't keep one alive
    if (bot) return;
    if (member?.user) names.set(userId, displayName(member));
    // Mute, deafen, stream...: same channel
    if (oldChannelId === newChannelId) return;
    if (oldChannelId && rooms.has(oldChannelId)) await leaveRoom(oldChannelId, userId);
    const room = newChannelId ? rooms.get(newChannelId) : null;
    if (room && !room.members.includes(userId)) room.members.push(userId);
    if (newChannelId && creatorId() && newChannelId === creatorId()) await createRoom(guildId, userId);
  }

  return {
    onVoiceState,
    getRoom: (channelId) => rooms.get(channelId),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/tempVoice/rooms.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/tempVoice/rooms.js test/helpers/fakeVoiceApi.js test/tempVoice/rooms.test.js
git commit -m "Create a voice room when a member joins the creator channel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Renames — presence, rate limit, manual rename, deleted by hand

**Files:**
- Modify: `lib/tempVoice/rooms.js` (`rename`, `scheduleRename`, new `onPresence`, `onChannelUpdate`, `onChannelDelete`)
- Test: `test/tempVoice/rooms.test.js` (append)

**Interfaces:**
- Consumes: Task 4's registry internals, `FakeTimers`.
- Produces: `onPresence(guildId, userId) -> Promise<void>`, `onChannelUpdate(channel)` (`{ id, name }`), `onChannelDelete(channel)` (`{ id }`), added to the returned object. A 429 from `api.renameChannel` carries `err.retryAfter` (ms).

- [ ] **Step 1: Write the failing tests** (append to `test/tempVoice/rooms.test.js`, and add `RENAME_WINDOW` to the `rooms.js` import)

```js
// at the top: import { RENAME_WINDOW, createRoomRegistry } from '../../lib/tempVoice/rooms.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/tempVoice/rooms.test.js`
Expected: FAIL, `registry.onPresence is not a function` (and the Task 4 tests still pass).

- [ ] **Step 3: Write the implementation**

In `lib/tempVoice/rooms.js`, replace `rename` and `scheduleRename` with:

```js
  // Called by the timer of a queued rename: the name is computed again, the owner's game may have changed
  const retry = (channelId) => () => {
    const room = rooms.get(channelId);
    if (!room) return;
    room.timer = null;
    return scheduleRename(channelId);
  };

  async function rename(channelId, name) {
    const room = rooms.get(channelId);
    const previous = room.name;
    room.name = name;
    room.knownNames = [...room.knownNames, name].slice(-KNOWN_NAMES);
    room.renames.push(now());
    try {
      await api.renameChannel(channelId, name);
    } catch (err) {
      if (rooms.get(channelId) !== room) return;
      room.name = previous;
      if (err.retryAfter) room.timer = setTimer(retry(channelId), err.retryAfter);
      else if (!isNotFound(err)) log(`Cannot rename the voice room ${channelId}:`, err.message);
    }
  }

  // The name follows the owner's game, unless someone renamed the room by hand.
  // Discord allows 2 renames per 10 minutes: past that, one timer waits for the window
  async function scheduleRename(channelId) {
    const room = rooms.get(channelId);
    if (!room || room.manual || room.timer) return;
    const name = roomName(room.guildId, room.ownerId);
    if (name === room.name) return;
    room.renames = room.renames.filter((time) => now() - time < RENAME_WINDOW);
    if (room.renames.length < RENAMES_PER_WINDOW) return rename(channelId, name);
    room.timer = setTimer(retry(channelId), room.renames[0] + RENAME_WINDOW - now());
  }

  function forget(channelId) {
    const room = rooms.get(channelId);
    if (room?.timer) clearTimer(room.timer);
    rooms.delete(channelId);
  }
```

Then make `deleteRoom` use `forget`:

```js
  async function deleteRoom(channelId) {
    if (!rooms.has(channelId)) return;
    forget(channelId);
    try {
      await api.deleteChannel(channelId);
    } catch (err) {
      if (!isNotFound(err)) log(`Cannot delete the voice room ${channelId}:`, err.message);
    }
  }
```

Add, before the `return`:

```js
  // The owner's game changed (or only their status: then the name is the same and nothing happens)
  async function onPresence(guildId, userId) {
    const owned = [...rooms].filter(([, room]) => room.guildId === guildId && room.ownerId === userId);
    await Promise.all(owned.map(([channelId]) => scheduleRename(channelId)));
  }

  // A name the bot didn't ask for: someone renamed the room by hand, their choice wins
  function onChannelUpdate(channel) {
    const room = rooms.get(channel.id);
    if (!room || room.manual || room.knownNames.includes(channel.name)) return;
    room.manual = true;
    if (room.timer) clearTimer(room.timer);
    room.timer = null;
  }

  // Deleted by hand: nothing left to delete
  function onChannelDelete(channel) {
    forget(channel.id);
  }
```

And return them:

```js
  return {
    onVoiceState,
    onPresence,
    onChannelUpdate,
    onChannelDelete,
    getRoom: (channelId) => rooms.get(channelId),
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/tempVoice/rooms.test.js`
Expected: PASS, 22 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tempVoice/rooms.js test/tempVoice/rooms.test.js
git commit -m "Rename the voice rooms when the owner changes game

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Restore the rooms at startup

**Files:**
- Modify: `lib/tempVoice/rooms.js` (new `restore`)
- Test: `test/tempVoice/rooms.test.js` (append)

**Interfaces:**
- Consumes: Task 4/5 internals (`track`, `forget`, `deleteRoom`, `transfer`, `scheduleRename`, `names`).
- Produces: `restore(guild) -> Promise<void>`; `guild` is the Gateway `GUILD_CREATE` payload: `{ id, channels[{ id, type, parent_id, name, permission_overwrites[{ id, type, allow, deny }] }], voice_states[{ user_id, channel_id }], members[{ user: { id, username, global_name?, bot? }, nick? }] }`.

- [ ] **Step 1: Write the failing tests** (append)

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/tempVoice/rooms.test.js`
Expected: FAIL, `registry.restore is not a function`.

- [ ] **Step 3: Write the implementation**

In `lib/tempVoice/rooms.js`, add after the constants:

```js
const MANAGE_CHANNELS = 1n << 4n;
```

Add before the `return`:

```js
  // At startup (and on each reconnection): no database, a room is a voice channel of the creator's category
  // with a member overwrite that allows Manage Channels, the owner. Fixed channels have none
  async function restore(guild) {
    const creator = guild.channels?.find((channel) => channel.id === creatorId());
    if (!creator) return;
    for (const member of guild.members ?? []) {
      if (!member.user.bot) names.set(member.user.id, displayName(member));
    }
    const bots = new Set((guild.members ?? []).filter((member) => member.user.bot).map((member) => member.user.id));
    // The rooms of this guild tracked before a reconnection: channels deleted meanwhile are forgotten
    for (const [channelId, room] of [...rooms]) {
      if (room.guildId === guild.id) forget(channelId);
    }
    for (const channel of guild.channels) {
      if (channel.type !== VOICE || channel.id === creator.id) continue;
      if ((channel.parent_id ?? null) !== (creator.parent_id ?? null)) continue;
      const owner = channel.permission_overwrites?.find((overwrite) => overwrite.type === 1
        && (BigInt(overwrite.allow) & MANAGE_CHANNELS) === MANAGE_CHANNELS);
      if (!owner) continue;
      const members = (guild.voice_states ?? [])
        .filter((state) => state.channel_id === channel.id && !bots.has(state.user_id))
        .map((state) => state.user_id);
      track(channel.id, { guildId: guild.id, ownerId: owner.id, members, name: channel.name });
      if (members.length === 0) await deleteRoom(channel.id);
      else if (!members.includes(owner.id)) await transfer(channel.id, rooms.get(channel.id));
      else await scheduleRename(channel.id);
    }
  }
```

Add `restore` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/tempVoice/rooms.test.js`
Expected: PASS, 29 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tempVoice/rooms.js test/tempVoice/rooms.test.js
git commit -m "Find the voice rooms again after a restart

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Wire it to the Gateway, document it

**Files:**
- Create: `lib/tempVoice/index.js`
- Create: `events/presences/presence_update.js`
- Create: `events/channels/channel_update.js`
- Create: `events/channels/channel_delete.js`
- Modify: `events/voice/voice_state_update.js`
- Modify: `events/basics/guild_create.js`
- Modify: `gateway.js:20-26` (intents and their comment)
- Modify: `.env.sample` (end of file)
- Modify: `README.md` (features table, project structure, a « Temporary voice channels (private feature) » section, Developer Portal intents, « Removing a feature »)

**Interfaces:**
- Consumes: `createRoomRegistry` (Tasks 4-6), `discordApi`, `checkCreatorPermissions` (Task 3), `getGame`, `setGuildPresences`, `updatePresence` (Task 2), `getUserChannel` from `lib/music/voiceStates.js`.
- Produces: `tempVoice` (the registry singleton) and `setupTempVoice(guild)` from `lib/tempVoice/index.js`.

- [ ] **Step 1: Write the wiring module**

```js
// lib/tempVoice/index.js
import { checkCreatorPermissions, discordApi } from './discord.js';
import { getGame, setGuildPresences } from './presences.js';
import { createRoomRegistry } from './rooms.js';

const creatorId = () => process.env.TEMP_VOICE_CREATOR_ID;

export const tempVoice = createRoomRegistry({ api: discordApi, creatorId, getGame });

// GUILD_CREATE: who plays what, then the rooms left by the previous run
export async function setupTempVoice(guild) {
  setGuildPresences(guild);
  if (!creatorId() || !guild.channels?.some((channel) => channel.id === creatorId())) return;
  await checkCreatorPermissions(guild.id, creatorId());
  await tempVoice.restore(guild);
}
```

- [ ] **Step 2: Write the events**

```js
// events/presences/presence_update.js
import { tempVoice } from '../../lib/tempVoice/index.js';
import { updatePresence } from '../../lib/tempVoice/presences.js';

export const name = 'PRESENCE_UPDATE';

// A member starts, changes or stops a game: their room follows
export async function execute(presence) {
  updatePresence(presence);
  if (presence.guild_id && presence.user?.id) await tempVoice.onPresence(presence.guild_id, presence.user.id);
}
```

```js
// events/channels/channel_update.js
import { tempVoice } from '../../lib/tempVoice/index.js';

export const name = 'CHANNEL_UPDATE';

// A voice room renamed by hand keeps the name its owner chose
export async function execute(channel) {
  tempVoice.onChannelUpdate(channel);
}
```

```js
// events/channels/channel_delete.js
import { tempVoice } from '../../lib/tempVoice/index.js';

export const name = 'CHANNEL_DELETE';

export async function execute(channel) {
  tempVoice.onChannelDelete(channel);
}
```

Replace `events/voice/voice_state_update.js` with:

```js
import { checkListeners } from '../../lib/music/players.js';
import { forwardVoiceStateUpdate } from '../../lib/music/voiceAdapter.js';
import { getUserChannel, updateVoiceState } from '../../lib/music/voiceStates.js';
import { tempVoice } from '../../lib/tempVoice/index.js';

export const name = 'VOICE_STATE_UPDATE';

export async function execute(state) {
  // The channel the member leaves is only known before the voice states are updated
  const oldChannelId = state.guild_id ? getUserChannel(state.guild_id, state.user_id) : null;
  updateVoiceState(state);
  forwardVoiceStateUpdate(state);
  if (!state.guild_id) return;
  checkListeners(state.guild_id);
  await tempVoice.onVoiceState({
    guildId: state.guild_id,
    userId: state.user_id,
    member: state.member,
    bot: Boolean(state.member?.user?.bot),
    oldChannelId,
    newChannelId: state.channel_id,
  });
}
```

Replace `events/basics/guild_create.js` with:

```js
import { setupGuild } from '../../lib/coordinates/forum.js';
import { setGuildVoiceStates } from '../../lib/music/voiceStates.js';
import { setupTempVoice } from '../../lib/tempVoice/index.js';

export const name = 'GUILD_CREATE';

// Sent for each guild when the bot connects: who is in the voice channels, the channels, active threads and presences
export async function execute(guild) {
  if (guild.unavailable) return;
  setGuildVoiceStates(guild);
  await setupGuild(guild);
  await setupTempVoice(guild);
}
```

- [ ] **Step 3: Add the Presence intent** in `gateway.js`, replacing the intents lines:

```js
  // Guild Members is a privileged intent: it must be enabled on the Bot page of the Developer Portal
  // Message Content is not needed: the slow mode only looks at who sends a message
  // Guild Voice States: to join the voice channel of a member and to connect the music player
  // Guild Presences (privileged too): the game of each member, to name the temporary voice rooms
  intents: GatewayIntentBits.Guilds | GatewayIntentBits.GuildMembers | GatewayIntentBits.GuildMessages
    | GatewayIntentBits.GuildVoiceStates | GatewayIntentBits.GuildPresences,
```

- [ ] **Step 4: Document the variable** — append to `.env.sample`:

```
# Temporary voice rooms: joining this voice channel creates a room named after your game (needs the Presence intent)
TEMP_VOICE_CREATOR_ID=
```

- [ ] **Step 5: Document the feature in `README.md`**

In « Private features », add a row to the table:

```
| Temporary voice rooms: join « ➕ Créer un salon » to get your own voice channel, named after your game, deleted when empty | - | `TEMP_VOICE_CREATOR_ID`, the Presence intent |
```

and change the sentence under the table to: `They turn themselves off when they are not configured: without yt-dlp the music commands answer that they are not available, without COORDINATES_FORUM_ID the forum is left alone, without TEMP_VOICE_CREATOR_ID nobody gets a room.` (keep the backticks around the variable names).

In « 1. Create your Discord app », replace the Bot page line with:

```
- **Bot** page : reset and copy the **Token** into `DISCORD_TOKEN`, and enable the **Server Members Intent**
  (a [privileged intent](https://docs.discord.com/developers/events/gateway#privileged-intents), needed for the welcome and leave messages)
  and the **Presence Intent** (needed for the names of the temporary voice rooms)
```

After the « Minecraft coordinates (private feature) » section, add:

```markdown
## Temporary voice channels (private feature)

Set `TEMP_VOICE_CREATOR_ID` to a voice channel, e.g. « ➕ Créer un salon ». A member who joins it gets their own
voice channel, created right below it in the same category and named after the game they play
(`🎮 VALORANT · Yaguaa`, or `🔊 Yaguaa` when they play nothing). The name follows their game; once someone renames
the room by hand, the bot leaves the name alone.

The owner can rename the room, set its user limit, lock it and disconnect someone. When they leave, the room goes
to the next member; when the last member leaves, it is deleted (bots don't count).

Nothing is stored: after a restart, the rooms are the voice channels of the category with an owner (a member
allowed to manage the channel). Other channels of the category are left alone.

The feature needs the **Presence Intent** (Developer Portal > Bot), and the bot needs **Manage Channels**,
**Manage Roles** and **Move Members** in the category. A missing permission is logged at startup.
```

In « Project structure », change the `lib` line to `├── lib             -> feature specific helpers (lib/music, lib/coordinates, lib/tempVoice...)`.

In « Removing a feature », after the « Minecraft coordinates » subsection, add:

```markdown
### Temporary voice channels

1. Delete `lib/tempVoice`, `events/presences`, `events/channels`, `test/tempVoice` and `test/helpers/fakeVoiceApi.js`
2. In `events/voice/voice_state_update.js`, remove `tempVoice` and `oldChannelId`
3. In `events/basics/guild_create.js`, remove `setupTempVoice`
4. In `gateway.js`, remove the `GuildPresences` intent, and disable the Presence Intent in the Developer Portal
5. Remove the `TEMP_VOICE_CREATOR_ID` variable
```

And update the shared helper line: `lib/channelPermissions.js` is shared by the music, the coordinates and the temporary voice rooms: delete it only when all three are gone.

- [ ] **Step 6: Run the whole test suite**

Run: `npm test`
Expected: all tests pass (97 existing + 44 new), `fail 0`.

- [ ] **Step 7: Check the app starts**

Run: `timeout 8 node --input-type=module -e "await import('./events/voice/voice_state_update.js'); await import('./events/basics/guild_create.js'); await import('./events/presences/presence_update.js'); await import('./events/channels/channel_update.js'); await import('./events/channels/channel_delete.js'); console.log('events load')"`
Expected: `events load` (the modules import without error; the Gateway is not opened).

- [ ] **Step 8: Commit**

```bash
git add lib/tempVoice/index.js events/presences/presence_update.js events/channels/channel_update.js events/channels/channel_delete.js events/voice/voice_state_update.js events/basics/guild_create.js gateway.js .env.sample README.md
git commit -m "Wire the temporary voice rooms to the Gateway and document them

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## After the plan (manual, with the user)

These touch production and the live server: they are done with the user, not by the implementer.

1. Merge `feat/temp-voice`, deploy.
2. Developer Portal → Bot → enable **Presence Intent**.
3. Create « ➕ Créer un salon » at the top of `🔊 Vocal`, set `TEMP_VOICE_CREATOR_ID` in the production `.env`, restart.
4. Try it: join the creator, change game, leave, check the room is deleted.
5. Delete the 7 old voice channels of `🔊 Vocal` (`💩` and `Soirée-ciné` stay).
