# Minecraft Coordinates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the forum `les-coordonées`, each post (a Minecraft world) gets a permanent panel to add, edit / delete and list the coordinates of that world; every other message of the post is deleted and the bot only answers with ephemeral messages.

**Architecture:** Pure modules (`parse.js`, `messages.js`) build and validate everything; `handlers.js` turns an interaction into a response with an injected store (MySQL in production, in memory in tests); thin component files route the buttons, select and modals to the handlers; `forum.js` + Gateway events post the panels and clean the posts.

**Tech Stack:** Node.js ESM, Express HTTP interactions, `@discordjs/ws` Gateway events, `mysql2` (existing `database.js`), Components V2, modals with Labels and a string select, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-24-minecraft-coordinates-design.md`

## Global Constraints

- Work in the worktree `/home/dfoulon/projects/alt/obot-coordinates`, branch `feat/coordinates`. Stage with explicit paths, never `git add -A` / `git commit -a`.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- ESM, 2 spaces, single quotes, semicolons, trailing commas, like the existing files. Code comments in English; **bot messages of this feature in French**.
- No new dependency. Tests with `node:test` only, no network, no database.
- The world is always `interaction.channel_id`; a `custom_id` only carries coordinate ids and page numbers. Every store read / write filters on the thread id.
- The feature is on only when both `COORDINATES_FORUM_ID` and `DB_HOST` are set (`isCoordinatesEnabled()`); otherwise nothing is posted or deleted.
- Limits: name ≤ 50, note ≤ 200, X and Z in [−30 000 000, 30 000 000], Y in [−2048, 2048], integers only; list 10 per page, picker 25 per page.
- Every message sent by the feature disables mentions (`allowed_mentions: { parse: [] }`) and escapes Markdown in user values.
- Messages built with Components V2 can't be turned back into plain `content`: in-place updates (`UPDATE_MESSAGE`) of the list / picker / card always send Components V2; plain-text errors are sent as **new** ephemeral messages.
- Nothing under `lib/` imports `gateway.js`.

## Review Focus

- A `custom_id` carrying the id of a coordinate of another world (an old ephemeral message, a forged id): it must behave as "n'existe plus" and change nothing → tests in Task 5 (`another world's coordinate…`).
- Renaming a coordinate: another coordinate's name in any case is refused, but changing only the case of its own name is allowed → test in Task 5 (`renaming…`).
- Real-life coordinate typing: `-120, +64 ,-340`, `X: -12 Y: 70 Z: 5`, tabs and double spaces → tests in Task 2.
- The panel's own `MESSAGE_CREATE` can arrive before its id is stored: the bot's messages are never deleted → test in Task 7 (`keeps the bot's messages`).
- A page number beyond the last page (coordinates deleted since the message was shown): the last page is shown → test in Task 5 (`a page past the end…`).

---

## File map

| File | Responsibility |
|---|---|
| `utils.js` (modify) | + `escapeMarkdown` (moved from `lib/music/format.js`) |
| `lib/music/format.js` (modify) | imports `escapeMarkdown` from `utils.js` |
| `lib/channelPermissions.js` | `computeChannelPermissions`, `fetchBotChannelPermissions` (moved from `lib/music/voicePermissions.js`) |
| `lib/music/voicePermissions.js` (modify) | uses `lib/channelPermissions.js` |
| `lib/coordinates/parse.js` | `DIMENSIONS`, `LIMITS`, `parseCoordinates`, `parseCoordinateForm` |
| `lib/coordinates/messages.js` | panel, list page, picker, card, confirmations, modal |
| `lib/coordinates/errors.js` | `DuplicateNameError` |
| `lib/coordinates/store.js` | MySQL queries |
| `lib/coordinates/handlers.js` | interaction → response, world isolation, errors |
| `lib/coordinates/forum.js` | channel cache, `isWorldThread`, message cleanup, panels, startup setup |
| `components/buttons/coordinates/*.js`, `components/selects/coordinates/coords_pick.js`, `components/modals/coordinates/*.js` | thin routing to the handlers |
| `events/basics/guild_create.js`, `events/messages/message_create.js` (modify); `events/threads/thread_create.js`, `events/threads/thread_update.js`, `events/messages/message_delete.js` | Gateway wiring |
| `scripts/coordinates-schema.sql` | tables |
| `test/coordinates/*.test.js`, `test/helpers/fakeCoordinateStore.js` | tests |

---

### Task 1: Shared helpers

**Files:**
- Modify: `utils.js`, `lib/music/format.js`, `lib/music/voicePermissions.js`
- Create: `lib/channelPermissions.js`
- Test: existing `test/format.test.js`, `test/voicePermissions.test.js` (must stay green)

**Interfaces:**
- Produces: `escapeMarkdown(text) → string` in `utils.js`; `computeChannelPermissions({ guildId, userId, memberRoleIds, roles, overwrites }) → bigint` and `fetchBotChannelPermissions(guildId, channelId) → Promise<bigint>` in `lib/channelPermissions.js`.

- [ ] **Step 1: Install and check the baseline**

```bash
cd /home/dfoulon/projects/alt/obot-coordinates
npm ci
PATH=~/.local/bin:$PATH npm test
```

Expected: `tests 68`, `pass 68`.

- [ ] **Step 2: Move `escapeMarkdown` to `utils.js`**

Append to `utils.js`:

```js
// User values shown in bold / italic must not break (or inject) Markdown
export function escapeMarkdown(text) {
  return String(text).replace(/([*_`~|\\>])/g, '\\$1');
}
```

In `lib/music/format.js`, delete the local `escapeMarkdown` function and add `import { escapeMarkdown } from '../../utils.js';` next to the other import.

- [ ] **Step 3: Extract the channel permissions** — create `lib/channelPermissions.js`

```js
import { DiscordRequest } from '../utils.js';

/**
 * The bot's permissions in a channel, computed like Discord does
 * See https://docs.discord.com/developers/topics/permissions#permission-overwrites
 */

const ADMINISTRATOR = 1n << 3n;
const ALL = (1n << 64n) - 1n;

// The @everyone role and the @everyone overwrite have the id of the guild
export function computeChannelPermissions({ guildId, userId, memberRoleIds, roles, overwrites }) {
  const roleIds = new Set([guildId, ...memberRoleIds]);
  let permissions = 0n;
  for (const role of roles) if (roleIds.has(role.id)) permissions |= BigInt(role.permissions);
  if (permissions & ADMINISTRATOR) return ALL;

  const apply = (overwrite) => {
    if (overwrite) permissions = (permissions & ~BigInt(overwrite.deny)) | BigInt(overwrite.allow);
  };
  apply(overwrites.find((o) => o.id === guildId));
  // Role overwrites are merged first: an allow on one role wins over a deny on another
  let allow = 0n;
  let deny = 0n;
  for (const o of overwrites) {
    if (o.type === 0 && o.id !== guildId && memberRoleIds.includes(o.id)) {
      allow |= BigInt(o.allow);
      deny |= BigInt(o.deny);
    }
  }
  apply({ allow, deny });
  apply(overwrites.find((o) => o.type === 1 && o.id === userId));
  return permissions;
}

// A bot user has the same id as its application
export async function fetchBotChannelPermissions(guildId, channelId) {
  const userId = process.env.APP_ID;
  const [roles, channel, member] = await Promise.all([
    DiscordRequest(`guilds/${guildId}/roles`).then((res) => res.json()),
    DiscordRequest(`channels/${channelId}`).then((res) => res.json()),
    DiscordRequest(`guilds/${guildId}/members/${userId}`).then((res) => res.json()),
  ]);
  return computeChannelPermissions({
    guildId, userId, memberRoleIds: member.roles, roles, overwrites: channel.permission_overwrites ?? [],
  });
}
```

- [ ] **Step 4: Make `lib/music/voicePermissions.js` use it** — replace the whole file with:

```js
import { computeChannelPermissions, fetchBotChannelPermissions } from '../channelPermissions.js';

/**
 * The bot's permissions in a voice channel
 * Needed because a bot without Speak can still join: it would "play" in silence
 */

export { computeChannelPermissions };

export const VoicePermissions = {
  VIEW_CHANNEL: 1n << 10n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
};

const NAMES = [
  [VoicePermissions.VIEW_CHANNEL, 'View Channel'],
  [VoicePermissions.CONNECT, 'Connect'],
  [VoicePermissions.SPEAK, 'Speak'],
];

function missingVoicePermissions(permissions) {
  return NAMES.filter(([flag]) => (permissions & flag) !== flag).map(([, name]) => name);
}

export function getMissingVoicePermissions(context) {
  return missingVoicePermissions(computeChannelPermissions(context));
}

// Returns the voice permissions the bot lacks in this channel
export async function fetchMissingVoicePermissions(guildId, channelId) {
  return missingVoicePermissions(await fetchBotChannelPermissions(guildId, channelId));
}
```

- [ ] **Step 5: Run the tests**

Run: `PATH=~/.local/bin:$PATH npm test`
Expected: `tests 68`, `pass 68` (behaviour unchanged).

- [ ] **Step 6: Commit**

```bash
git add utils.js lib/music/format.js lib/channelPermissions.js lib/music/voicePermissions.js
git commit -m "Share the Markdown escaping and the channel permissions computation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Parsing the coordinate form

**Files:**
- Create: `lib/coordinates/parse.js`
- Test: `test/coordinates/parse.test.js`

**Interfaces:**
- Produces: `DIMENSIONS = { overworld: { label: 'Overworld', emoji: '🌍' }, nether: { label: 'Nether', emoji: '🔥' }, end: { label: 'End', emoji: '🌌' } }`; `LIMITS = { name: 50, note: 200, xz: 30_000_000, y: 2048 }`; `parseCoordinates(text) → { x, y, z } | null`; `parseCoordinateForm({ name, coordinates, dimension: string[]|undefined, note }) → { value: { name, dimension, x, y, z, note: string|null } } | { error: string }`.

- [ ] **Step 1: Write the failing test** — `test/coordinates/parse.test.js`

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCoordinateForm, parseCoordinates } from '../../lib/coordinates/parse.js';

test('the accepted coordinate formats', () => {
  const expected = { x: 120, y: 64, z: -340 };
  assert.deepEqual(parseCoordinates('120 64 -340'), expected);
  assert.deepEqual(parseCoordinates('120, 64, -340'), expected);
  assert.deepEqual(parseCoordinates('120;64;-340'), expected);
  assert.deepEqual(parseCoordinates('x:120 y:64 z:-340'), expected);
  assert.deepEqual(parseCoordinates('X: 120 Y: 64 Z: -340'), expected);
  assert.deepEqual(parseCoordinates('  120\t 64   -340 '), expected);
  assert.deepEqual(parseCoordinates('-120, +64 ,-340'), { x: -120, y: 64, z: -340 });
});

test('the refused coordinates', () => {
  assert.equal(parseCoordinates('120 64'), null);
  assert.equal(parseCoordinates('120 64 -340 12'), null);
  assert.equal(parseCoordinates('120 abc -340'), null);
  assert.equal(parseCoordinates('120.5 64 -340'), null);
  assert.equal(parseCoordinates(''), null);
});

const form = (values) => parseCoordinateForm({ name: 'Base', coordinates: '120 64 -340', dimension: ['nether'], note: '', ...values });

test('a valid form', () => {
  assert.deepEqual(form({ name: '  Base principale ', note: ' ferme à fer ' }).value, {
    name: 'Base principale', dimension: 'nether', x: 120, y: 64, z: -340, note: 'ferme à fer',
  });
  assert.equal(form({ note: '   ' }).value.note, null);
  assert.equal(form({ dimension: undefined }).value.dimension, 'overworld');
  assert.equal(form({ dimension: ['moon'] }).value.dimension, 'overworld');
  assert.equal(form({ dimension: ['toString'] }).value.dimension, 'overworld');
});

test('the form errors, in French', () => {
  assert.equal(form({ name: '  ' }).error, 'Le nom est obligatoire.');
  assert.equal(form({ name: 'x'.repeat(51) }).error, 'Le nom ne doit pas dépasser 50 caractères.');
  assert.equal(form({ note: 'x'.repeat(201) }).error, 'La note ne doit pas dépasser 200 caractères.');
  assert.equal(form({ coordinates: '1 2' }).error, 'Les coordonnées doivent être 3 nombres entiers, par exemple `120 64 -340`.');
  assert.equal(form({ coordinates: '30000001 64 0' }).error, 'X et Z doivent être entre -30000000 et 30000000.');
  assert.equal(form({ coordinates: '0 64 -30000001' }).error, 'X et Z doivent être entre -30000000 et 30000000.');
  assert.equal(form({ coordinates: '0 2049 0' }).error, 'Y doit être entre -2048 et 2048.');
  assert.ok(form({ coordinates: '30000000 -2048 -30000000' }).value);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '…/lib/coordinates/parse.js'`.

- [ ] **Step 3: Implement** — `lib/coordinates/parse.js`

```js
export const DIMENSIONS = {
  overworld: { label: 'Overworld', emoji: '🌍' },
  nether: { label: 'Nether', emoji: '🔥' },
  end: { label: 'End', emoji: '🌌' },
};

// Y is wider than vanilla (-64 to 320): modded servers can go further
export const LIMITS = { name: 50, note: 200, xz: 30_000_000, y: 2048 };

// "120 64 -340", "120, 64, -340", "120;64;-340", "x:120 y:64 z:-340" -> { x, y, z }, or null
export function parseCoordinates(text) {
  const parts = String(text)
    .replace(/[xyz]\s*[:=]/gi, ' ')
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (parts.length !== 3 || !parts.every((part) => /^[+-]?\d+$/.test(part))) return null;
  const [x, y, z] = parts.map(Number);
  return { x, y, z };
}

// Values of the add / edit modal -> { value } or { error } (a French message for the member)
export function parseCoordinateForm({ name, coordinates, dimension, note }) {
  const cleanName = String(name ?? '').trim();
  if (!cleanName) return { error: 'Le nom est obligatoire.' };
  if (cleanName.length > LIMITS.name) return { error: `Le nom ne doit pas dépasser ${LIMITS.name} caractères.` };

  const cleanNote = String(note ?? '').trim();
  if (cleanNote.length > LIMITS.note) return { error: `La note ne doit pas dépasser ${LIMITS.note} caractères.` };

  const position = parseCoordinates(coordinates ?? '');
  if (!position) return { error: 'Les coordonnées doivent être 3 nombres entiers, par exemple `120 64 -340`.' };
  const { x, y, z } = position;
  if (Math.abs(x) > LIMITS.xz || Math.abs(z) > LIMITS.xz) {
    return { error: `X et Z doivent être entre -${LIMITS.xz} et ${LIMITS.xz}.` };
  }
  if (Math.abs(y) > LIMITS.y) return { error: `Y doit être entre -${LIMITS.y} et ${LIMITS.y}.` };

  // The select sends a list of values
  const chosen = dimension?.[0];
  return {
    value: {
      name: cleanName,
      dimension: Object.hasOwn(DIMENSIONS, chosen ?? '') ? chosen : 'overworld',
      x, y, z,
      note: cleanNote || null,
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, `tests 72`.

- [ ] **Step 5: Commit**

```bash
git add lib/coordinates/parse.js test/coordinates/parse.test.js
git commit -m "Parse the coordinate form

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Messages

**Files:**
- Create: `lib/coordinates/messages.js`
- Test: `test/coordinates/messages.test.js`

**Interfaces:**
- Consumes: `DIMENSIONS`, `LIMITS` (Task 2), `escapeMarkdown`, `parseColor` (`utils.js`).
- Produces (all pure). `Coordinate = { id, threadId, name, dimension, x, y, z, note: string|null, createdBy, updatedBy: string|null }`; `Page = { coordinates: Coordinate[], total: number, page: number }`.
  - `LIST_PAGE_SIZE = 10`, `PICKER_PAGE_SIZE = 25`
  - `formatPosition({ dimension, x, y, z }) → '🌍 120 64 -340'`, `formatCoordinateLine(coordinate) → string`
  - `buildPanel() → message body with flags IS_COMPONENTS_V2`
  - `buildListPage(Page)`, `buildPicker(Page)`, `buildCard(coordinate, page)`, `buildDeleteConfirmation(coordinate, page)`, `buildDeleted(coordinate, page)`, `buildMissing(page)` → `{ components, allowed_mentions }` (no flags: the handlers add them)
  - `buildCoordinateModal({ customId, title, coordinate? }) → modal data`
  - custom ids produced: `coords_add`, `coords_edit`, `coords_list`, `coords_page:<page>`, `coords_pick:<page>` (select), `coords_pick_page:<page>`, `coords_modify:<id>`, `coords_delete:<id>:<page>`, `coords_delete_confirm:<id>:<page>`, `coords_back:<page>`; modal fields `name`, `coordinates`, `dimension` (select), `note`.

- [ ] **Step 1: Write the failing test** — `test/coordinates/messages.test.js`

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCard, buildCoordinateModal, buildDeleteConfirmation, buildListPage, buildPanel, buildPicker, formatCoordinateLine,
} from '../../lib/coordinates/messages.js';

const coordinate = (id, extra = {}) => ({
  id, threadId: 't1', name: `Lieu ${id}`, dimension: 'overworld', x: 120, y: 64, z: -340,
  note: null, createdBy: 'u1', updatedBy: null, ...extra,
});
const inner = (message) => message.components[0].components;
const texts = (message) => inner(message).filter((c) => c.type === 10).map((c) => c.content).join('\n');
const buttons = (message) => inner(message).filter((c) => c.type === 1).flatMap((row) => row.components).filter((c) => c.type === 2);

test('the panel has the 3 buttons and is a Components V2 message', () => {
  const panel = buildPanel();
  assert.equal(panel.flags, 32768);
  assert.deepEqual(buttons(panel).map((b) => b.custom_id), ['coords_add', 'coords_edit', 'coords_list']);
  assert.deepEqual(panel.allowed_mentions, { parse: [] });
});

test('a list line: icon, escaped name and note, author or last editor', () => {
  assert.equal(formatCoordinateLine(coordinate(1, { name: '*Base*', dimension: 'nether', note: 'près du _portail_' })),
    '🔥 **\\*Base\\*** — 120 64 -340 · *près du \\_portail\\_* · ajoutée par <@u1>');
  assert.equal(formatCoordinateLine(coordinate(1, { updatedBy: 'u2' })), '🌍 **Lieu 1** — 120 64 -340 · modifiée par <@u2>');
});

test('a list page with its paging buttons', () => {
  const coordinates = Array.from({ length: 10 }, (_, i) => coordinate(i + 1));
  const first = buildListPage({ coordinates, total: 23, page: 0 });
  assert.match(texts(first), /Lieu 10/);
  assert.match(texts(first), /Page 1\/3 · 23 coordonnées/);
  const [previous, next] = buttons(first);
  assert.equal(previous.custom_id, 'coords_page:-1');
  assert.equal(previous.disabled, true);
  assert.equal(next.custom_id, 'coords_page:1');
  assert.equal(next.disabled, false);
  const last = buildListPage({ coordinates: coordinates.slice(0, 3), total: 23, page: 2 });
  assert.equal(buttons(last)[1].disabled, true);
});

test('an empty world', () => {
  assert.match(texts(buildListPage({ coordinates: [], total: 0, page: 0 })), /Aucune coordonnée dans ce monde/);
  assert.match(texts(buildPicker({ coordinates: [], total: 0, page: 0 })), /Aucune coordonnée dans ce monde/);
});

test('the picker: a select of the page, paging only above 25', () => {
  const coordinates = Array.from({ length: 25 }, (_, i) => coordinate(i + 1));
  const picker = buildPicker({ coordinates, total: 30, page: 0 });
  const select = inner(picker).find((c) => c.type === 1 && c.components[0].type === 3).components[0];
  assert.equal(select.custom_id, 'coords_pick:0');
  assert.equal(select.options.length, 25);
  assert.deepEqual(select.options[0], { label: 'Lieu 1', value: '1', description: 'Overworld · 120 64 -340', emoji: { name: '🌍' } });
  assert.deepEqual(buttons(picker).map((b) => b.custom_id), ['coords_pick_page:-1', 'coords_pick_page:1']);
  assert.deepEqual(buttons(buildPicker({ coordinates: coordinates.slice(0, 3), total: 3, page: 0 })), []);
});

test('the card and the delete confirmation keep the picker page', () => {
  const card = buildCard(coordinate(7, { note: 'ferme', updatedBy: 'u2' }), 2);
  assert.match(texts(card), /Overworld[\s\S]*120 64 -340[\s\S]*ferme[\s\S]*<@u1>[\s\S]*<@u2>/);
  assert.deepEqual(buttons(card).map((b) => b.custom_id), ['coords_modify:7', 'coords_delete:7:2', 'coords_back:2']);
  const confirmation = buildDeleteConfirmation(coordinate(7), 2);
  assert.deepEqual(buttons(confirmation).map((b) => b.custom_id), ['coords_delete_confirm:7:2', 'coords_back:2']);
});

test('the modal, empty or prefilled', () => {
  const empty = buildCoordinateModal({ customId: 'coords_add_modal', title: 'Ajouter une coordonnée' });
  assert.equal(empty.custom_id, 'coords_add_modal');
  assert.deepEqual(empty.components.map((label) => label.component.custom_id), ['name', 'coordinates', 'dimension', 'note']);
  assert.equal(empty.components[2].component.options.find((o) => o.default).value, 'overworld');

  const filled = buildCoordinateModal({ customId: 'coords_edit_modal:7', title: 'Modifier une coordonnée', coordinate: coordinate(7, { dimension: 'end', note: 'ferme' }) });
  assert.equal(filled.components[0].component.value, 'Lieu 7');
  assert.equal(filled.components[1].component.value, '120 64 -340');
  assert.equal(filled.components[2].component.options.find((o) => o.default).value, 'end');
  assert.equal(filled.components[3].component.value, 'ferme');
  assert.equal(filled.components[3].component.required, false);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '…/lib/coordinates/messages.js'`.

- [ ] **Step 3: Implement** — `lib/coordinates/messages.js`

```js
import { ButtonStyleTypes, InteractionResponseFlags, MessageComponentTypes, TextStyleTypes } from 'discord-interactions';
import { DIMENSIONS, LIMITS } from './parse.js';
import { escapeMarkdown, parseColor } from '../../utils.js';

/**
 * Every message of the coordinates feature, in French, as Components V2
 * See https://docs.discord.com/developers/components/reference#container
 */

export const LIST_PAGE_SIZE = 10;
// A select menu holds 25 options at most
export const PICKER_PAGE_SIZE = 25;

const EMPTY_WORLD = "Aucune coordonnée dans ce monde pour l'instant. Utilise ➕ Ajouter.";

function button(customId, label, style = ButtonStyleTypes.SECONDARY, disabled = false) {
  return { type: MessageComponentTypes.BUTTON, custom_id: customId, label, style, disabled };
}

function row(...components) {
  return { type: MessageComponentTypes.ACTION_ROW, components };
}

function text(content) {
  return { type: MessageComponentTypes.TEXT_DISPLAY, content };
}

function container(...components) {
  return {
    components: [{ type: MessageComponentTypes.CONTAINER, accent_color: parseColor(process.env.OBOT_COLOR), components }],
    allowed_mentions: { parse: [] },
  };
}

function pageCount(total, size) {
  return Math.max(1, Math.ceil(total / size));
}

function countLabel(total) {
  return `${total} coordonnée${total > 1 ? 's' : ''}`;
}

export function formatPosition({ dimension, x, y, z }) {
  return `${DIMENSIONS[dimension].emoji} ${x} ${y} ${z}`;
}

export function formatCoordinateLine(coordinate) {
  const { dimension, name, x, y, z, note, createdBy, updatedBy } = coordinate;
  let line = `${DIMENSIONS[dimension].emoji} **${escapeMarkdown(name)}** — ${x} ${y} ${z}`;
  if (note) line += ` · *${escapeMarkdown(note)}*`;
  return line + (updatedBy ? ` · modifiée par <@${updatedBy}>` : ` · ajoutée par <@${createdBy}>`);
}

// The permanent message of each world: a regular message, so it carries its own flags
export function buildPanel() {
  return {
    ...container(
      text('## 📍 Coordonnées\nAjoute, modifie ou retrouve les coordonnées de ce monde. Les réponses ne sont visibles que par toi.'),
      row(
        button('coords_add', '➕ Ajouter', ButtonStyleTypes.SUCCESS),
        button('coords_edit', '✏️ Modifier', ButtonStyleTypes.PRIMARY),
        button('coords_list', '📜 Lister'),
      ),
    ),
    flags: InteractionResponseFlags.IS_COMPONENTS_V2,
  };
}

export function buildListPage({ coordinates, total, page }) {
  if (!total) return container(text(`## 📜 Coordonnées\n${EMPTY_WORLD}`));
  const pages = pageCount(total, LIST_PAGE_SIZE);
  return container(
    text(`## 📜 Coordonnées\n${coordinates.map(formatCoordinateLine).join('\n')}`),
    text(`-# Page ${page + 1}/${pages} · ${countLabel(total)}`),
    row(
      button(`coords_page:${page - 1}`, '◀ Précédent', ButtonStyleTypes.SECONDARY, page <= 0),
      button(`coords_page:${page + 1}`, 'Suivant ▶', ButtonStyleTypes.SECONDARY, page >= pages - 1),
    ),
  );
}

export function buildPicker({ coordinates, total, page }) {
  if (!total) return container(text(`## ✏️ Modifier\n${EMPTY_WORLD}`));
  const pages = pageCount(total, PICKER_PAGE_SIZE);
  const components = [
    text('## ✏️ Modifier\nChoisis la coordonnée à modifier ou à supprimer.'),
    row({
      type: MessageComponentTypes.STRING_SELECT,
      // The page comes back with the choice, for the "Retour" button of the card
      custom_id: `coords_pick:${page}`,
      placeholder: 'Choisis une coordonnée',
      options: coordinates.map(({ id, name, dimension, x, y, z }) => ({
        label: name,
        value: String(id),
        description: `${DIMENSIONS[dimension].label} · ${x} ${y} ${z}`,
        emoji: { name: DIMENSIONS[dimension].emoji },
      })),
    }),
  ];
  if (pages > 1) {
    components.push(
      text(`-# Page ${page + 1}/${pages} · ${countLabel(total)}`),
      row(
        button(`coords_pick_page:${page - 1}`, '◀ Précédent', ButtonStyleTypes.SECONDARY, page <= 0),
        button(`coords_pick_page:${page + 1}`, 'Suivant ▶', ButtonStyleTypes.SECONDARY, page >= pages - 1),
      ),
    );
  }
  return container(...components);
}

export function buildCard(coordinate, page) {
  const { id, name, dimension, x, y, z, note, createdBy, updatedBy } = coordinate;
  const lines = [
    `## ${DIMENSIONS[dimension].emoji} ${escapeMarkdown(name)}`,
    `**Dimension :** ${DIMENSIONS[dimension].label}`,
    `**Position :** ${x} ${y} ${z}`,
  ];
  if (note) lines.push(`**Note :** ${escapeMarkdown(note)}`);
  lines.push(`**Ajoutée par :** <@${createdBy}>`);
  if (updatedBy) lines.push(`**Modifiée par :** <@${updatedBy}>`);
  return container(
    text(lines.join('\n')),
    row(
      button(`coords_modify:${id}`, '✏️ Modifier', ButtonStyleTypes.PRIMARY),
      button(`coords_delete:${id}:${page}`, '🗑️ Supprimer', ButtonStyleTypes.DANGER),
      button(`coords_back:${page}`, '↩ Retour'),
    ),
  );
}

// Everybody can delete: ask once more
export function buildDeleteConfirmation(coordinate, page) {
  return container(
    text(`Supprimer **${escapeMarkdown(coordinate.name)}** ? Tout le monde perdra cette coordonnée.`),
    row(
      button(`coords_delete_confirm:${coordinate.id}:${page}`, '🗑️ Oui, supprimer', ButtonStyleTypes.DANGER),
      button(`coords_back:${page}`, '↩ Annuler'),
    ),
  );
}

export function buildDeleted(coordinate, page) {
  return container(
    text(`🗑️ Coordonnée **${escapeMarkdown(coordinate.name)}** supprimée.`),
    row(button(`coords_back:${page}`, '↩ Retour')),
  );
}

export function buildMissing(page) {
  return container(text("Cette coordonnée n'existe plus."), row(button(`coords_back:${page}`, '↩ Retour')));
}

// Modals hold 5 components at most: X, Y and Z share one field
// See https://docs.discord.com/developers/components/reference#label
export function buildCoordinateModal({ customId, title, coordinate }) {
  const label = (labelText, component, description) => ({
    type: MessageComponentTypes.LABEL, label: labelText, ...(description && { description }), component,
  });
  const input = (id, style, options) => ({ type: MessageComponentTypes.INPUT_TEXT, custom_id: id, style, ...options });
  const chosen = coordinate?.dimension ?? 'overworld';

  return {
    custom_id: customId,
    title,
    components: [
      label('Nom', input('name', TextStyleTypes.SHORT, { max_length: LIMITS.name, value: coordinate?.name, placeholder: 'Base principale' })),
      label(
        'Coordonnées',
        input('coordinates', TextStyleTypes.SHORT, {
          max_length: 60,
          value: coordinate ? `${coordinate.x} ${coordinate.y} ${coordinate.z}` : undefined,
          placeholder: '120 64 -340',
        }),
        'X Y Z, par exemple 120 64 -340',
      ),
      label('Dimension', {
        type: MessageComponentTypes.STRING_SELECT,
        custom_id: 'dimension',
        options: Object.entries(DIMENSIONS).map(([value, { label: name, emoji }]) => ({
          label: name, value, emoji: { name: emoji }, default: value === chosen,
        })),
      }),
      label('Note', input('note', TextStyleTypes.PARAGRAPH, {
        max_length: LIMITS.note, required: false, value: coordinate?.note ?? undefined, placeholder: 'Facultatif',
      })),
    ],
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, `tests 79`.

- [ ] **Step 5: Commit**

```bash
git add lib/coordinates/messages.js test/coordinates/messages.test.js
git commit -m "Build the coordinates messages and form

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Storage

**Files:**
- Create: `lib/coordinates/errors.js`, `lib/coordinates/store.js`, `scripts/coordinates-schema.sql`, `test/helpers/fakeCoordinateStore.js`

**Interfaces:**
- Consumes: `getDatabase()` (`database.js`).
- Produces: `DuplicateNameError`; store functions (all `threadId`-scoped, ids may be strings or numbers):
  `countCoordinates(threadId) → number`, `listCoordinates(threadId, { offset, limit }) → Coordinate[]` (ordered Overworld, Nether, End, then name), `getCoordinate(threadId, id) → Coordinate|null`, `addCoordinate(threadId, fields, userId) → id` (throws `DuplicateNameError`), `updateCoordinate(threadId, id, fields, userId) → boolean` (throws `DuplicateNameError`), `deleteCoordinate(threadId, id) → boolean`, `getPanel(threadId) → messageId|null`, `setPanel(threadId, messageId)`. `fields = { name, dimension, x, y, z, note }`.
  `createFakeStore()` → the same API in memory, plus `rows`.

- [ ] **Step 1: Schema** — `scripts/coordinates-schema.sql`

```sql
-- Minecraft coordinates, one world per post of the coordinates forum (thread_id)
-- The case-insensitive collation makes the unique key refuse "Base" when "base" exists
CREATE TABLE IF NOT EXISTS coordinates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  thread_id VARCHAR(32) NOT NULL,
  name VARCHAR(50) NOT NULL,
  dimension ENUM('overworld', 'nether', 'end') NOT NULL DEFAULT 'overworld',
  x INT NOT NULL,
  y INT NOT NULL,
  z INT NOT NULL,
  note VARCHAR(200) NULL,
  created_by VARCHAR(32) NOT NULL,
  updated_by VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY coordinates_thread_name (thread_id, name),
  KEY coordinates_thread (thread_id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- The panel message of each world
CREATE TABLE IF NOT EXISTS coordinate_panels (
  thread_id VARCHAR(32) PRIMARY KEY,
  message_id VARCHAR(32) NOT NULL
) DEFAULT CHARSET = utf8mb4;
```

- [ ] **Step 2: Errors** — `lib/coordinates/errors.js`

```js
// Another coordinate of the same world already has this name (case-insensitive)
export class DuplicateNameError extends Error {}
```

- [ ] **Step 3: Store** — `lib/coordinates/store.js`

```js
import { DuplicateNameError } from './errors.js';
import { getDatabase } from '../../database.js';

/**
 * Coordinates are always read and written with their world (thread_id): a coordinate id alone never
 * reaches another world
 */

function toCoordinate(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    name: row.name,
    dimension: row.dimension,
    x: row.x,
    y: row.y,
    z: row.z,
    note: row.note,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

async function write(sql, params) {
  try {
    const [result] = await getDatabase().execute(sql, params);
    return result;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new DuplicateNameError();
    throw err;
  }
}

export async function countCoordinates(threadId) {
  const [rows] = await getDatabase().execute('SELECT COUNT(*) AS total FROM coordinates WHERE thread_id = ?', [threadId]);
  return Number(rows[0].total);
}

// ENUM columns sort by their declaration order: Overworld, Nether, End
// query() instead of execute(): LIMIT placeholders are refused by some MySQL versions in prepared statements
export async function listCoordinates(threadId, { offset, limit }) {
  const [rows] = await getDatabase().query(
    'SELECT * FROM coordinates WHERE thread_id = ? ORDER BY dimension, name LIMIT ? OFFSET ?',
    [threadId, limit, offset],
  );
  return rows.map(toCoordinate);
}

export async function getCoordinate(threadId, id) {
  const [rows] = await getDatabase().execute('SELECT * FROM coordinates WHERE id = ? AND thread_id = ?', [id, threadId]);
  return rows[0] ? toCoordinate(rows[0]) : null;
}

export async function addCoordinate(threadId, { name, dimension, x, y, z, note }, userId) {
  const result = await write(
    'INSERT INTO coordinates (thread_id, name, dimension, x, y, z, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [threadId, name, dimension, x, y, z, note, userId],
  );
  return result.insertId;
}

// false when the coordinate doesn't exist (anymore) in this world
export async function updateCoordinate(threadId, id, { name, dimension, x, y, z, note }, userId) {
  const result = await write(
    'UPDATE coordinates SET name = ?, dimension = ?, x = ?, y = ?, z = ?, note = ?, updated_by = ? WHERE id = ? AND thread_id = ?',
    [name, dimension, x, y, z, note, userId, id, threadId],
  );
  return result.affectedRows > 0;
}

export async function deleteCoordinate(threadId, id) {
  const result = await write('DELETE FROM coordinates WHERE id = ? AND thread_id = ?', [id, threadId]);
  return result.affectedRows > 0;
}

export async function getPanel(threadId) {
  const [rows] = await getDatabase().execute('SELECT message_id FROM coordinate_panels WHERE thread_id = ?', [threadId]);
  return rows[0]?.message_id ?? null;
}

export async function setPanel(threadId, messageId) {
  await write(
    'INSERT INTO coordinate_panels (thread_id, message_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE message_id = VALUES(message_id)',
    [threadId, messageId],
  );
}
```

- [ ] **Step 4: Fake store for the tests** — `test/helpers/fakeCoordinateStore.js`

```js
import { DuplicateNameError } from '../../lib/coordinates/errors.js';

const ORDER = ['overworld', 'nether', 'end'];

// The API of lib/coordinates/store.js, in memory, with the same world and name rules
export function createFakeStore() {
  const rows = [];
  const panels = new Map();
  let nextId = 1;

  const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
  const find = (threadId, id) => rows.find((row) => row.threadId === threadId && row.id === Number(id)) ?? null;
  const world = (threadId) => rows
    .filter((row) => row.threadId === threadId)
    .sort((a, b) => ORDER.indexOf(a.dimension) - ORDER.indexOf(b.dimension) || a.name.localeCompare(b.name));

  return {
    rows,
    async countCoordinates(threadId) {
      return world(threadId).length;
    },
    async listCoordinates(threadId, { offset, limit }) {
      return world(threadId).slice(offset, offset + limit).map((row) => ({ ...row }));
    },
    async getCoordinate(threadId, id) {
      const row = find(threadId, id);
      return row && { ...row };
    },
    async addCoordinate(threadId, fields, userId) {
      if (rows.some((row) => row.threadId === threadId && sameName(row.name, fields.name))) throw new DuplicateNameError();
      const row = { id: nextId++, threadId, ...fields, createdBy: userId, updatedBy: null };
      rows.push(row);
      return row.id;
    },
    async updateCoordinate(threadId, id, fields, userId) {
      const row = find(threadId, id);
      if (!row) return false;
      if (rows.some((other) => other !== row && other.threadId === threadId && sameName(other.name, fields.name))) {
        throw new DuplicateNameError();
      }
      Object.assign(row, fields, { updatedBy: userId });
      return true;
    },
    async deleteCoordinate(threadId, id) {
      const index = rows.findIndex((row) => row.threadId === threadId && row.id === Number(id));
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    },
    async getPanel(threadId) {
      return panels.get(threadId) ?? null;
    },
    async setPanel(threadId, messageId) {
      panels.set(threadId, messageId);
    },
  };
}
```

- [ ] **Step 5: Check the syntax and the tests**

```bash
node --check lib/coordinates/store.js && node --check lib/coordinates/errors.js && node --check test/helpers/fakeCoordinateStore.js
npm test
```

Expected: no syntax error, `tests 79`, all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/coordinates/errors.js lib/coordinates/store.js scripts/coordinates-schema.sql test/helpers/fakeCoordinateStore.js
git commit -m "Store the coordinates in MySQL, one world per forum post

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Interaction handlers

**Files:**
- Create: `lib/coordinates/handlers.js`, and a first version of `lib/coordinates/forum.js` holding only what the handlers need (Task 7 completes it)
- Test: `test/coordinates/handlers.test.js`

**Interfaces:**
- Consumes: Tasks 2–4; `getModalValues`, `escapeMarkdown` (`utils.js`).
- Produces:
  - `forum.js`: `isCoordinatesEnabled() → boolean`, `rememberChannel(channel)`, `isWorldThread(channelId, knownParentId?) → Promise<boolean>`.
  - `handlers.js`: `ERRORS = { notInWorld, unavailable, missing }`; `createCoordinateHandlers(store)` → `{ openAdd(i), submitAdd(i), showList(i, page, { edit }?), showPicker(i, page, { edit }?), showCard(i, id, page), openEdit(i, id), submitEdit(i, id), askDelete(i, id, page), confirmDelete(i, id, page) }`, each resolving to an interaction response `{ type, data }`; `coordinateHandlers` (bound to the MySQL store).

- [ ] **Step 1: First version of `lib/coordinates/forum.js`**

```js
import { DiscordRequest } from '../../utils.js';

/**
 * The coordinates forum: each of its posts (threads) is a Minecraft world
 */

// channelId -> parentId, for every channel and thread seen (null when it has no parent)
const channelParents = new Map();

const forumId = () => process.env.COORDINATES_FORUM_ID;

// The feature needs the forum and the database
export function isCoordinatesEnabled() {
  return Boolean(forumId() && process.env.DB_HOST);
}

export function rememberChannel(channel) {
  if (channel?.id) channelParents.set(channel.id, channel.parent_id ?? null);
}

async function getParent(channelId) {
  if (channelParents.has(channelId)) return channelParents.get(channelId);
  try {
    const channel = await (await DiscordRequest(`channels/${channelId}`)).json();
    rememberChannel(channel);
    return channel.parent_id ?? null;
  } catch (err) {
    console.error(`Cannot read the channel ${channelId}:`, err.message);
    return null;
  }
}

// Interactions give the parent of their channel: no request needed then
export async function isWorldThread(channelId, knownParentId) {
  if (!isCoordinatesEnabled()) return false;
  const parentId = knownParentId ?? (await getParent(channelId));
  return parentId === forumId();
}
```

- [ ] **Step 2: Write the failing test** — `test/coordinates/handlers.test.js`

```js
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { ERRORS, createCoordinateHandlers } from '../../lib/coordinates/handlers.js';
import { createFakeStore } from '../helpers/fakeCoordinateStore.js';

const REPLY = 4;
const UPDATE = 7;
const MODAL = 9;

let store;
let handlers;

beforeEach(() => {
  process.env.COORDINATES_FORUM_ID = 'forum';
  process.env.DB_HOST = 'db';
  store = createFakeStore();
  handlers = createCoordinateHandlers(store);
});

const interaction = (threadId, data = {}, parentId = 'forum', userId = 'u1') => ({
  channel_id: threadId, channel: { id: threadId, parent_id: parentId }, member: { user: { id: userId } }, data,
});

// A submitted modal, as Discord sends it: labels wrapping the inputs and the select
const submitted = ({ name = 'Base', coordinates = '120 64 -340', dimension = 'overworld', note = '' } = {}) => ({
  components: [
    { type: 18, component: { type: 4, custom_id: 'name', value: name } },
    { type: 18, component: { type: 4, custom_id: 'coordinates', value: coordinates } },
    { type: 18, component: { type: 3, custom_id: 'dimension', values: [dimension] } },
    { type: 18, component: { type: 4, custom_id: 'note', value: note } },
  ],
});

const allText = (response) => JSON.stringify(response.data);

test('adding a coordinate', async () => {
  const response = await handlers.submitAdd(interaction('t1', submitted({ name: 'Base', dimension: 'nether' })));
  assert.equal(response.type, REPLY);
  assert.equal(response.data.flags, 64);
  assert.equal(response.data.content, '✅ Coordonnée **Base** enregistrée : 🔥 120 64 -340');
  assert.deepEqual(store.rows.map((row) => [row.threadId, row.name, row.createdBy]), [['t1', 'Base', 'u1']]);
});

test('an invalid form or a duplicate name writes nothing', async () => {
  const invalid = await handlers.submitAdd(interaction('t1', submitted({ coordinates: '1 2' })));
  assert.match(invalid.data.content, /^❌ Les coordonnées doivent être 3 nombres entiers/);
  await handlers.submitAdd(interaction('t1', submitted({ name: 'Base' })));
  const duplicate = await handlers.submitAdd(interaction('t1', submitted({ name: 'BASE' })));
  assert.equal(duplicate.data.content, '❌ Une coordonnée « BASE » existe déjà dans ce monde.');
  assert.equal(store.rows.length, 1);
});

test('the same name in two worlds is fine', async () => {
  await handlers.submitAdd(interaction('t1', submitted({ name: 'Base' })));
  const other = await handlers.submitAdd(interaction('t2', submitted({ name: 'Base' })));
  assert.match(other.data.content, /^✅/);
  assert.equal(store.rows.length, 2);
});

test('outside the coordinates forum, every handler refuses', async () => {
  const outside = interaction('t1', submitted(), 'other');
  for (const response of [await handlers.openAdd(outside), await handlers.submitAdd(outside), await handlers.showList(outside, 0)]) {
    assert.equal(response.type, REPLY);
    assert.equal(response.data.content, ERRORS.notInWorld);
  }
  assert.equal(store.rows.length, 0);
});

test('the add button opens the modal', async () => {
  const response = await handlers.openAdd(interaction('t1'));
  assert.equal(response.type, MODAL);
  assert.equal(response.data.custom_id, 'coords_add_modal');
});

test('the list only shows the coordinates of its world, paged', async () => {
  for (let i = 1; i <= 12; i++) await store.addCoordinate('t1', { name: `A${String(i).padStart(2, '0')}`, dimension: 'overworld', x: i, y: 64, z: 0, note: null }, 'u1');
  await store.addCoordinate('t2', { name: 'Ailleurs', dimension: 'overworld', x: 0, y: 64, z: 0, note: null }, 'u1');

  const first = await handlers.showList(interaction('t1'), 0);
  assert.equal(first.type, REPLY);
  assert.equal(first.data.flags, 64 | 32768);
  assert.match(allText(first), /A01[\s\S]*A10/);
  assert.doesNotMatch(allText(first), /A11|Ailleurs/);

  const second = await handlers.showList(interaction('t1'), 1, { edit: true });
  assert.equal(second.type, UPDATE);
  assert.match(allText(second), /A11[\s\S]*A12/);
  assert.match(allText(second), /Page 2\/2 · 12 coordonnées/);
});

test('a page past the end shows the last page', async () => {
  await store.addCoordinate('t1', { name: 'Seule', dimension: 'end', x: 0, y: 64, z: 0, note: null }, 'u1');
  const response = await handlers.showList(interaction('t1'), 5, { edit: true });
  assert.match(allText(response), /Seule/);
  assert.match(allText(response), /Page 1\/1/);
});

test('editing: card, prefilled modal, update', async () => {
  const id = await store.addCoordinate('t1', { name: 'Base', dimension: 'overworld', x: 1, y: 2, z: 3, note: null }, 'u1');
  const card = await handlers.showCard(interaction('t1'), String(id), 0);
  assert.equal(card.type, UPDATE);
  assert.match(allText(card), /coords_modify:1/);

  const modal = await handlers.openEdit(interaction('t1'), String(id));
  assert.equal(modal.type, MODAL);
  assert.equal(modal.data.custom_id, 'coords_edit_modal:1');
  assert.equal(modal.data.components[1].component.value, '1 2 3');

  const done = await handlers.submitEdit(interaction('t1', submitted({ name: 'base', coordinates: '4 5 6', dimension: 'end' }), 'forum', 'u2'), String(id));
  assert.equal(done.data.content, '✅ Coordonnée **base** modifiée : 🌌 4 5 6');
  assert.deepEqual(store.rows[0], { id, threadId: 't1', name: 'base', dimension: 'end', x: 4, y: 5, z: 6, note: null, createdBy: 'u1', updatedBy: 'u2' });
});

test('renaming to the name of another coordinate is refused', async () => {
  await store.addCoordinate('t1', { name: 'Base', dimension: 'overworld', x: 0, y: 0, z: 0, note: null }, 'u1');
  const id = await store.addCoordinate('t1', { name: 'Ferme', dimension: 'overworld', x: 0, y: 0, z: 0, note: null }, 'u1');
  const response = await handlers.submitEdit(interaction('t1', submitted({ name: 'base' })), String(id));
  assert.equal(response.data.content, '❌ Une coordonnée « base » existe déjà dans ce monde.');
  assert.equal(store.rows[1].name, 'Ferme');
});

test('deleting asks for confirmation, then deletes', async () => {
  const id = await store.addCoordinate('t1', { name: 'Base', dimension: 'overworld', x: 0, y: 0, z: 0, note: null }, 'u1');
  const ask = await handlers.askDelete(interaction('t1'), String(id), 3);
  assert.match(allText(ask), /coords_delete_confirm:1:3/);
  assert.equal(store.rows.length, 1);
  const done = await handlers.confirmDelete(interaction('t1'), String(id), 3);
  assert.equal(done.type, UPDATE);
  assert.match(allText(done), /Coordonnée \*\*Base\*\* supprimée/);
  assert.equal(store.rows.length, 0);
});

test("another world's coordinate behaves as missing and is never changed", async () => {
  const id = String(await store.addCoordinate('t1', { name: 'Base', dimension: 'overworld', x: 1, y: 2, z: 3, note: null }, 'u1'));
  const fromOtherWorld = interaction('t2', submitted({ name: 'Piratée', coordinates: '9 9 9' }));

  assert.match(allText(await handlers.showCard(fromOtherWorld, id, 0)), /Cette coordonnée n'existe plus/);
  assert.equal((await handlers.openEdit(fromOtherWorld, id)).data.content, ERRORS.missing);
  assert.equal((await handlers.submitEdit(fromOtherWorld, id)).data.content, ERRORS.missing);
  assert.match(allText(await handlers.askDelete(fromOtherWorld, id, 0)), /n'existe plus/);
  assert.match(allText(await handlers.confirmDelete(fromOtherWorld, id, 0)), /n'existe plus/);
  assert.deepEqual(store.rows.map((row) => [row.name, row.x]), [['Base', 1]]);
});

test('a database error gives a polite message', async () => {
  const broken = createCoordinateHandlers({ ...store, countCoordinates: async () => { throw new Error('ECONNREFUSED'); } });
  const original = console.error;
  console.error = () => {};
  try {
    const response = await broken.showList(interaction('t1'), 0);
    assert.equal(response.data.content, ERRORS.unavailable);
  } finally {
    console.error = original;
  }
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '…/lib/coordinates/handlers.js'`.

- [ ] **Step 4: Implement** — `lib/coordinates/handlers.js`

```js
import { InteractionResponseFlags, InteractionResponseType } from 'discord-interactions';
import { DuplicateNameError } from './errors.js';
import { isWorldThread } from './forum.js';
import {
  LIST_PAGE_SIZE, PICKER_PAGE_SIZE,
  buildCard, buildCoordinateModal, buildDeleteConfirmation, buildDeleted, buildListPage, buildMissing, buildPicker, formatPosition,
} from './messages.js';
import { parseCoordinateForm } from './parse.js';
import * as mysqlStore from './store.js';
import { escapeMarkdown, getModalValues } from '../../utils.js';

export const ERRORS = {
  notInWorld: 'Ce bouton ne fonctionne que dans un monde du forum des coordonnées.',
  unavailable: "Impossible d'accéder aux coordonnées pour le moment, réessaie dans un instant.",
  missing: "Cette coordonnée n'existe plus.",
};

const { EPHEMERAL, IS_COMPONENTS_V2 } = InteractionResponseFlags;

// A new ephemeral text message: errors and confirmations
function reply(content) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } },
  };
}

// A new ephemeral Components V2 message: the list and the picker opened from the panel
function replyWith(message) {
  return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { ...message, flags: EPHEMERAL | IS_COMPONENTS_V2 } };
}

// Updates the ephemeral message the button or the select belongs to
function update(message) {
  return { type: InteractionResponseType.UPDATE_MESSAGE, data: { ...message, flags: IS_COMPONENTS_V2 } };
}

function modal(data) {
  return { type: InteractionResponseType.MODAL, data };
}

const duplicate = (name) => reply(`❌ Une coordonnée « ${escapeMarkdown(name)} » existe déjà dans ce monde.`);

/**
 * Coordinates interactions -> responses. The world is always the post the interaction comes from:
 * custom ids only carry coordinate ids and pages, and every store call is scoped to the post
 */
export function createCoordinateHandlers(store) {
  async function inWorld(interaction, action) {
    if (!(await isWorldThread(interaction.channel_id, interaction.channel?.parent_id))) return reply(ERRORS.notInWorld);
    try {
      return await action(interaction.channel_id, interaction.member.user.id);
    } catch (err) {
      console.error('Coordinates error:', err);
      return reply(ERRORS.unavailable);
    }
  }

  // The page is clamped: coordinates may have been deleted since the message was shown
  async function loadPage(threadId, page, size) {
    const total = await store.countCoordinates(threadId);
    const last = Math.max(0, Math.ceil(total / size) - 1);
    const current = Math.min(Math.max(0, Number(page) || 0), last);
    return { coordinates: await store.listCoordinates(threadId, { offset: current * size, limit: size }), total, page: current };
  }

  function readForm(interaction) {
    return parseCoordinateForm(getModalValues(interaction.data.components));
  }

  return {
    openAdd: (interaction) => inWorld(interaction, async () => (
      modal(buildCoordinateModal({ customId: 'coords_add_modal', title: 'Ajouter une coordonnée' }))
    )),

    submitAdd: (interaction) => inWorld(interaction, async (threadId, userId) => {
      const { value, error } = readForm(interaction);
      if (error) return reply(`❌ ${error}`);
      try {
        await store.addCoordinate(threadId, value, userId);
      } catch (err) {
        if (err instanceof DuplicateNameError) return duplicate(value.name);
        throw err;
      }
      return reply(`✅ Coordonnée **${escapeMarkdown(value.name)}** enregistrée : ${formatPosition(value)}`);
    }),

    showList: (interaction, page, { edit = false } = {}) => inWorld(interaction, async (threadId) => {
      const message = buildListPage(await loadPage(threadId, page, LIST_PAGE_SIZE));
      return edit ? update(message) : replyWith(message);
    }),

    showPicker: (interaction, page, { edit = false } = {}) => inWorld(interaction, async (threadId) => {
      const message = buildPicker(await loadPage(threadId, page, PICKER_PAGE_SIZE));
      return edit ? update(message) : replyWith(message);
    }),

    showCard: (interaction, id, page) => inWorld(interaction, async (threadId) => {
      const coordinate = await store.getCoordinate(threadId, id);
      return update(coordinate ? buildCard(coordinate, page) : buildMissing(page));
    }),

    openEdit: (interaction, id) => inWorld(interaction, async (threadId) => {
      const coordinate = await store.getCoordinate(threadId, id);
      if (!coordinate) return reply(ERRORS.missing);
      return modal(buildCoordinateModal({ customId: `coords_edit_modal:${coordinate.id}`, title: 'Modifier une coordonnée', coordinate }));
    }),

    submitEdit: (interaction, id) => inWorld(interaction, async (threadId, userId) => {
      if (!(await store.getCoordinate(threadId, id))) return reply(ERRORS.missing);
      const { value, error } = readForm(interaction);
      if (error) return reply(`❌ ${error}`);
      let updated;
      try {
        updated = await store.updateCoordinate(threadId, id, value, userId);
      } catch (err) {
        if (err instanceof DuplicateNameError) return duplicate(value.name);
        throw err;
      }
      if (!updated) return reply(ERRORS.missing);
      return reply(`✅ Coordonnée **${escapeMarkdown(value.name)}** modifiée : ${formatPosition(value)}`);
    }),

    askDelete: (interaction, id, page) => inWorld(interaction, async (threadId) => {
      const coordinate = await store.getCoordinate(threadId, id);
      return update(coordinate ? buildDeleteConfirmation(coordinate, page) : buildMissing(page));
    }),

    confirmDelete: (interaction, id, page) => inWorld(interaction, async (threadId) => {
      const coordinate = await store.getCoordinate(threadId, id);
      if (!coordinate || !(await store.deleteCoordinate(threadId, id))) return update(buildMissing(page));
      return update(buildDeleted(coordinate, page));
    }),
  };
}

export const coordinateHandlers = createCoordinateHandlers(mysqlStore);
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS, `tests 91`.

- [ ] **Step 6: Commit**

```bash
git add lib/coordinates/forum.js lib/coordinates/handlers.js test/coordinates/handlers.test.js
git commit -m "Handle the coordinates interactions, one world per post

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Component files

**Files:**
- Create: `components/buttons/coordinates/coords_add.js`, `coords_edit.js`, `coords_list.js`, `coords_page.js`, `coords_pick_page.js`, `coords_modify.js`, `coords_delete.js`, `coords_delete_confirm.js`, `coords_back.js`; `components/selects/coordinates/coords_pick.js`; `components/modals/coordinates/coords_add_modal.js`, `coords_edit_modal.js`

**Interfaces:**
- Consumes: `coordinateHandlers` (Task 5), `parseCustomId` (`utils.js`). `app.js` routes components by `customId` (first part of the `custom_id`); selects are `MESSAGE_COMPONENT` too, no change needed.

- [ ] **Step 1: Write the 12 files**

`components/buttons/coordinates/coords_add.js`:

```js
import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';

export const customId = 'coords_add';

export async function execute(interaction, res) {
  return res.send(await coordinateHandlers.openAdd(interaction));
}
```

`components/buttons/coordinates/coords_edit.js`:

```js
import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';

export const customId = 'coords_edit';

export async function execute(interaction, res) {
  return res.send(await coordinateHandlers.showPicker(interaction, 0));
}
```

`components/buttons/coordinates/coords_list.js`:

```js
import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';

export const customId = 'coords_list';

export async function execute(interaction, res) {
  return res.send(await coordinateHandlers.showList(interaction, 0));
}
```

`components/buttons/coordinates/coords_page.js`:

```js
import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';
import { parseCustomId } from '../../../utils.js';

export const customId = 'coords_page';

// coords_page:<page>
export async function execute(interaction, res) {
  const [page] = parseCustomId(interaction.data.custom_id).args;
  return res.send(await coordinateHandlers.showList(interaction, Number(page), { edit: true }));
}
```

`components/buttons/coordinates/coords_pick_page.js`:

```js
import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';
import { parseCustomId } from '../../../utils.js';

export const customId = 'coords_pick_page';

// coords_pick_page:<page>
export async function execute(interaction, res) {
  const [page] = parseCustomId(interaction.data.custom_id).args;
  return res.send(await coordinateHandlers.showPicker(interaction, Number(page), { edit: true }));
}
```

`components/buttons/coordinates/coords_back.js`:

```js
import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';
import { parseCustomId } from '../../../utils.js';

export const customId = 'coords_back';

// coords_back:<page>: back to the picker page the coordinate was chosen from
export async function execute(interaction, res) {
  const [page] = parseCustomId(interaction.data.custom_id).args;
  return res.send(await coordinateHandlers.showPicker(interaction, Number(page), { edit: true }));
}
```

`components/buttons/coordinates/coords_modify.js`:

```js
import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';
import { parseCustomId } from '../../../utils.js';

export const customId = 'coords_modify';

// coords_modify:<id>
export async function execute(interaction, res) {
  const [id] = parseCustomId(interaction.data.custom_id).args;
  return res.send(await coordinateHandlers.openEdit(interaction, id));
}
```

`components/buttons/coordinates/coords_delete.js`:

```js
import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';
import { parseCustomId } from '../../../utils.js';

export const customId = 'coords_delete';

// coords_delete:<id>:<page>
export async function execute(interaction, res) {
  const [id, page] = parseCustomId(interaction.data.custom_id).args;
  return res.send(await coordinateHandlers.askDelete(interaction, id, Number(page)));
}
```

`components/buttons/coordinates/coords_delete_confirm.js`:

```js
import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';
import { parseCustomId } from '../../../utils.js';

export const customId = 'coords_delete_confirm';

// coords_delete_confirm:<id>:<page>
export async function execute(interaction, res) {
  const [id, page] = parseCustomId(interaction.data.custom_id).args;
  return res.send(await coordinateHandlers.confirmDelete(interaction, id, Number(page)));
}
```

`components/selects/coordinates/coords_pick.js`:

```js
import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';
import { parseCustomId } from '../../../utils.js';

export const customId = 'coords_pick';

// coords_pick:<page>, the chosen coordinate id is the selected value
export async function execute(interaction, res) {
  const [page] = parseCustomId(interaction.data.custom_id).args;
  const [id] = interaction.data.values;
  return res.send(await coordinateHandlers.showCard(interaction, id, Number(page)));
}
```

`components/modals/coordinates/coords_add_modal.js`:

```js
import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';

export const customId = 'coords_add_modal';

export async function execute(interaction, res) {
  return res.send(await coordinateHandlers.submitAdd(interaction));
}
```

`components/modals/coordinates/coords_edit_modal.js`:

```js
import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';
import { parseCustomId } from '../../../utils.js';

export const customId = 'coords_edit_modal';

// coords_edit_modal:<id>
export async function execute(interaction, res) {
  const [id] = parseCustomId(interaction.data.custom_id).args;
  return res.send(await coordinateHandlers.submitEdit(interaction, id));
}
```

- [ ] **Step 2: Check they load**

```bash
node --input-type=module -e "
import { loadModules } from './utils.js';
const components = await loadModules('components');
const ids = components.map((c) => c.customId).filter((id) => id.startsWith('coords_')).sort();
console.log(components.length, ids.join(' '));
"
npm test
```

Expected: `25 coords_add coords_add_modal coords_back coords_delete coords_delete_confirm coords_edit coords_edit_modal coords_list coords_modify coords_page coords_pick coords_pick_page`, and `tests 91` passing.

- [ ] **Step 3: Commit**

```bash
git add components/buttons/coordinates components/selects/coordinates components/modals/coordinates
git commit -m "Route the coordinates buttons, select and modals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Forum panels and message cleanup

**Files:**
- Modify: `lib/coordinates/forum.js`, `events/basics/guild_create.js`, `events/messages/message_create.js`
- Create: `events/threads/thread_create.js`, `events/threads/thread_update.js`, `events/messages/message_delete.js`
- Test: `test/coordinates/forum.test.js`

**Interfaces:**
- Consumes: `buildPanel` (Task 3), `getPanel` / `setPanel` (Task 4), `fetchBotChannelPermissions` (Task 1), `DiscordRequest`, `sendMessage` (`utils.js`).
- Produces in `forum.js`: `shouldDeleteMessage(message) → boolean`, `missingForumPermissions(permissions: bigint) → string[]`, `cleanWorldMessage(message) → Promise<boolean>` (true when the message is in a world, whether deleted or kept), `ensurePanel(threadId) → Promise<void>`, `handlePanelDeleted(message)`, `setupGuild(guild)`.

- [ ] **Step 1: Write the failing test** — `test/coordinates/forum.test.js`

```js
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  isWorldThread, missingForumPermissions, rememberChannel, shouldDeleteMessage,
} from '../../lib/coordinates/forum.js';

beforeEach(() => {
  process.env.COORDINATES_FORUM_ID = 'forum';
  process.env.DB_HOST = 'db';
  process.env.APP_ID = 'bot';
});

test("keeps the post's original message and the bot's messages, deletes the rest", () => {
  assert.equal(shouldDeleteMessage({ id: 't1', channel_id: 't1', author: { id: 'u1' } }), false);
  assert.equal(shouldDeleteMessage({ id: 'm1', channel_id: 't1', author: { id: 'bot' } }), false);
  assert.equal(shouldDeleteMessage({ id: 'm2', channel_id: 't1', author: { id: 'u1' } }), true);
  assert.equal(shouldDeleteMessage({ id: 'm3', channel_id: 't1', author: { id: 'other-bot', bot: true } }), true);
});

test('world threads are the posts of the coordinates forum', async () => {
  rememberChannel({ id: 't1', parent_id: 'forum' });
  rememberChannel({ id: 'general', parent_id: 'category' });
  assert.equal(await isWorldThread('t1'), true);
  assert.equal(await isWorldThread('general'), false);
  assert.equal(await isWorldThread('t9', 'forum'), true);
});

test('the feature is off without the forum id or the database', async () => {
  rememberChannel({ id: 't1', parent_id: 'forum' });
  delete process.env.DB_HOST;
  assert.equal(await isWorldThread('t1'), false);
  process.env.DB_HOST = 'db';
  delete process.env.COORDINATES_FORUM_ID;
  assert.equal(await isWorldThread('t1', 'forum'), false);
});

test('the forum permissions the bot needs', () => {
  const all = (1n << 10n) | (1n << 38n) | (1n << 13n) | (1n << 16n);
  assert.deepEqual(missingForumPermissions(all), []);
  assert.deepEqual(missingForumPermissions(all & ~(1n << 13n)), ['Manage Messages']);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test`
Expected: FAIL, `shouldDeleteMessage` / `missingForumPermissions` are not exported.

- [ ] **Step 3: Complete `lib/coordinates/forum.js`**

Replace the import line with:

```js
import { buildPanel } from './messages.js';
import { getPanel, setPanel } from './store.js';
import { fetchBotChannelPermissions } from '../channelPermissions.js';
import { DiscordRequest, sendMessage } from '../../utils.js';
```

Append:

```js
// The original message of a forum post has the id of the post. The bot only posts its panel there
// (its answers are ephemeral): its messages are kept, even before the panel id is stored
export function shouldDeleteMessage(message) {
  return message.id !== message.channel_id && message.author?.id !== process.env.APP_ID;
}

// Returns true when the message is in a world: the other features must ignore it
export async function cleanWorldMessage(message) {
  if (!message.guild_id || !(await isWorldThread(message.channel_id))) return false;
  if (shouldDeleteMessage(message)) {
    try {
      await DiscordRequest(`channels/${message.channel_id}/messages/${message.id}`, { method: 'DELETE' });
    } catch (err) {
      console.error(`Cannot delete a message in the world ${message.channel_id} (Manage Messages ?):`, err.message);
    }
  }
  return true;
}

const FORUM_PERMISSIONS = [
  [1n << 10n, 'View Channel'],
  [1n << 38n, 'Send Messages in Threads'],
  [1n << 13n, 'Manage Messages'],
  [1n << 16n, 'Read Message History'],
];

export function missingForumPermissions(permissions) {
  return FORUM_PERMISSIONS.filter(([flag]) => (permissions & flag) !== flag).map(([, name]) => name);
}

async function checkForumPermissions(guildId) {
  try {
    const missing = missingForumPermissions(await fetchBotChannelPermissions(guildId, forumId()));
    if (missing.length) console.warn(`The coordinates forum needs these bot permissions: ${missing.join(', ')} 🔒`);
  } catch (err) {
    console.error('Cannot check the coordinates forum permissions:', err.message);
  }
}

async function messageExists(threadId, messageId) {
  try {
    await DiscordRequest(`channels/${threadId}/messages/${messageId}`);
    return true;
  } catch (err) {
    if (err.message.includes('Discord API error 404')) return false;
    throw err;
  }
}

// Panels being posted, by thread: GUILD_CREATE and THREAD_CREATE must not post two
const posting = new Map();

// Posts the panel of a world when it has none (or when it was deleted)
export function ensurePanel(threadId) {
  if (!posting.has(threadId)) {
    posting.set(threadId, (async () => {
      try {
        const panelId = await getPanel(threadId);
        if (panelId && (await messageExists(threadId, panelId))) return;
        const message = await sendMessage(threadId, buildPanel());
        await setPanel(threadId, message.id);
      } catch (err) {
        console.error(`Cannot post the coordinates panel in ${threadId}:`, err.message);
      } finally {
        posting.delete(threadId);
      }
    })());
  }
  return posting.get(threadId);
}

export async function handlePanelDeleted(message) {
  if (!message.guild_id || !(await isWorldThread(message.channel_id))) return;
  try {
    if ((await getPanel(message.channel_id)) === message.id) await ensurePanel(message.channel_id);
  } catch (err) {
    console.error(`Cannot check the coordinates panel of ${message.channel_id}:`, err.message);
  }
}

// At startup: remember the channels, check the permissions, give their panel to the active posts
// Archived posts keep theirs: nobody can post (nor delete) there while they are archived
export async function setupGuild(guild) {
  for (const channel of [...(guild.channels ?? []), ...(guild.threads ?? [])]) rememberChannel(channel);
  if (!isCoordinatesEnabled() || !guild.channels?.some((channel) => channel.id === forumId())) return;
  await checkForumPermissions(guild.id);
  for (const thread of guild.threads ?? []) {
    if (thread.parent_id === forumId()) await ensurePanel(thread.id);
  }
}
```

- [ ] **Step 4: Wire the events**

`events/basics/guild_create.js` — replace with:

```js
import { setupGuild } from '../../lib/coordinates/forum.js';
import { setGuildVoiceStates } from '../../lib/music/voiceStates.js';

export const name = 'GUILD_CREATE';

// Sent for each guild when the bot connects: who is in the voice channels, the channels and active threads
export async function execute(guild) {
  if (guild.unavailable) return;
  setGuildVoiceStates(guild);
  await setupGuild(guild);
}
```

`events/messages/message_create.js` — add the import and make the cleanup run first:

```js
import { cleanWorldMessage } from '../../lib/coordinates/forum.js';
```

and, as the first line of `execute`:

```js
  // In the coordinates forum, only the posts' original messages and the panels stay
  if (await cleanWorldMessage(message)) return;
```

`events/threads/thread_create.js`:

```js
import { ensurePanel, isWorldThread, rememberChannel } from '../../lib/coordinates/forum.js';

export const name = 'THREAD_CREATE';

// A new post in the coordinates forum is a new world: it gets its panel
export async function execute(thread) {
  rememberChannel(thread);
  if (await isWorldThread(thread.id, thread.parent_id)) await ensurePanel(thread.id);
}
```

`events/threads/thread_update.js`:

```js
import { rememberChannel } from '../../lib/coordinates/forum.js';

export const name = 'THREAD_UPDATE';

// Archived posts come back through here when someone writes in them
export async function execute(thread) {
  rememberChannel(thread);
}
```

`events/messages/message_delete.js`:

```js
import { handlePanelDeleted } from '../../lib/coordinates/forum.js';

export const name = 'MESSAGE_DELETE';

// A deleted coordinates panel is posted again
export async function execute(message) {
  await handlePanelDeleted(message);
}
```

- [ ] **Step 5: Run the tests and check the events load**

```bash
npm test
node --input-type=module -e "import { loadModules } from './utils.js'; console.log((await loadModules('events')).map((e) => e.name).sort().join(' '))"
```

Expected: `tests 95` passing; `GUILD_CREATE GUILD_MEMBER_ADD GUILD_MEMBER_REMOVE MESSAGE_CREATE MESSAGE_DELETE READY THREAD_CREATE THREAD_UPDATE VOICE_SERVER_UPDATE VOICE_STATE_UPDATE`.

- [ ] **Step 6: Commit**

```bash
git add lib/coordinates/forum.js events/basics/guild_create.js events/messages/message_create.js events/messages/message_delete.js events/threads/thread_create.js events/threads/thread_update.js test/coordinates/forum.test.js
git commit -m "Keep a coordinates panel in each world and clean the posts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Documentation

**Files:**
- Modify: `.env.sample`, `README.md`

- [ ] **Step 1: `.env.sample`** — append:

```
# Minecraft coordinates: the forum whose posts are the worlds (needs the database settings above)
COORDINATES_FORUM_ID=
```

- [ ] **Step 2: `README.md`**

1. In **Features**, add: `- Minecraft coordinates: in a forum, each post is a world with a panel to add, edit and list its coordinates (the posts stay clean)`
2. In **Project structure**, add `│   ├── selects      -> one file per select menu handler` under `components`.
3. After the **Music** section, add:

````markdown
## Minecraft coordinates

Set `COORDINATES_FORUM_ID` to a forum channel: each post of the forum is a world of your Minecraft server.
In each post, the bot keeps a panel to add, edit, delete and list the coordinates of that world (name, X Y Z,
dimension, optional note). Everybody can manage them, the answers are only visible to the member who clicked.
Every other message posted in the forum's posts is deleted, except the post's original message.

The feature needs the MySQL database (`DB_*` variables) with these tables:

```bash
  mysql -h <DB_HOST> -u <DB_USER> -p <DB_NAME> < scripts/coordinates-schema.sql
```

In the forum, the bot needs **View Channel**, **Send Messages in Threads**, **Manage Messages** and
**Read Message History**. A missing permission is logged at startup.
````

- [ ] **Step 3: Commit**

```bash
git add .env.sample README.md
git commit -m "Document the Minecraft coordinates feature

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Database, deployment and checks (controller + user, not a subagent)

- [ ] **Step 1: alwaysdata database** (API, key given by the user): create a MySQL user `damienfoulon_obot` with a password generated on the alwaysdata host (`openssl rand -base64 24`), a database `damienfoulon_obot` with FULL permissions for that user; write `DB_HOST=mysql-damienfoulon.alwaysdata.net`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` and `COORDINATES_FORUM_ID=1552039881520320522` into `~/obot/.env` without printing the password.
- [ ] **Step 2: Schema**: run `scripts/coordinates-schema.sql` against it from the alwaysdata host; check `SHOW TABLES`.
- [ ] **Step 3: Store check**: from the alwaysdata host, a node snippet that adds, lists, renames (case change), duplicates (expect `DuplicateNameError`), deletes a coordinate in a fake thread id, then cleans up.
- [ ] **Step 4: PR** `feat/coordinates` → `master`; after the user merges: `git pull --ff-only` in `~/obot`, service restart, logs show the panels posted in Pixelmon and Cobblemon and no missing permission.
- [ ] **Step 5: Manual checks with the user**: add / edit / delete / list, the "n'existe plus" case, a message typed in a post disappears, a new post gets its panel, Pixelmon and Cobblemon coordinates stay separate.
