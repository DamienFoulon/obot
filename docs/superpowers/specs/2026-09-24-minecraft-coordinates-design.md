# Minecraft coordinates — design

Date: 2026-09-24
Branch: `feat/coordinates` (from `master`)

## Goal

In the forum channel `les-coordonées` (`1552039881520320522`), each post is a world of a Minecraft server
(today: Pixelmon, Cobblemon). In each post, the bot keeps a single panel to **add**, **edit / delete** and
**list** the coordinates of that world. The post stays clean: every message other than the post's original
message and the bot's panel is deleted, and the bot only answers with ephemeral messages.

## Decisions

- **Panel**: posted in each post of the forum (new posts on creation, existing posts at startup), reposted
  if deleted. Components V2, 3 buttons: *Ajouter*, *Modifier*, *Lister*.
- **Message cleanup**: in a post of the forum, every message is deleted except the post's original message
  (its id equals the thread id) and the bot's panel. This includes other bots, webhooks and system messages.
- **Everybody** can add, edit and delete any coordinate of the world. Each coordinate records who created
  it and who last edited it.
- **Fields**: name (required, ≤ 50 chars, unique per world, case-insensitive), coordinates X Y Z in one field
  (Discord modals are limited to 5 components), dimension (select: Overworld default, Nether, End),
  note (optional, ≤ 200 chars).
- **Coordinates field** accepts `120 64 -340`, `120, 64, -340`, `120;64;-340`, `x:120 y:64 z:-340`
  (case-insensitive, extra spaces). Integers only. X and Z in [−30 000 000, 30 000 000], Y in [−2048, 2048].
- **Language**: French for this feature (the rest of the bot stays in English).
- **Storage**: MySQL on alwaysdata, through the existing `database.js` (`mysql2`).
- **World isolation**: every coordinate belongs to a `thread_id`. Every handler checks that the interaction
  comes from a post of the forum and that the targeted coordinate belongs to that post.

## Architecture

```
lib/coordinates/
├── store.js       -> MySQL access: add, update, remove, get, list (paged), count, panels
├── parse.js       -> modal values -> coordinate fields, or a French error message (pure)
├── messages.js    -> panel, list page, edit picker, detail card, delete confirmation, modal (pure)
├── forum.js       -> thread -> parent cache, isWorldThread, ensurePanel, shouldDeleteMessage
└── handlers.js    -> shared checks for the components (world thread, coordinate of this world, DB errors)
components/buttons/coordinates/  -> coords_add, coords_edit, coords_list, coords_page, coords_pick_page,
                                    coords_modify, coords_delete, coords_delete_confirm, coords_back
components/modals/coordinates/   -> coords_add_modal, coords_edit_modal
components/selects/coordinates/  -> coords_pick
events/threads/                  -> thread_create, thread_update
events/messages/message_create.js (modified) -> + cleanup of world posts (slow mode unchanged)
events/messages/message_delete.js -> reposts the panel when it is deleted
events/basics/guild_create.js (modified) -> + thread cache and panels of the existing posts
scripts/coordinates-schema.sql
```

`app.js` already routes every `MESSAGE_COMPONENT` (buttons and selects) and `MODAL_SUBMIT` to `components/`
by the first part of the `custom_id`: selects need no change there.

### Custom ids

Discord limits `custom_id` to 100 characters. Arguments are ids and page numbers only:

| custom_id | Where | Effect |
|---|---|---|
| `coords_add` | panel | opens the add modal |
| `coords_edit` | panel | ephemeral edit picker, page 0 |
| `coords_list` | panel | ephemeral list, page 0 |
| `coords_page:<page>` | list | updates the list to that page |
| `coords_pick_page:<page>` | picker | updates the picker to that page |
| `coords_pick` | picker (select) | shows the detail card of the chosen coordinate |
| `coords_modify:<id>` | card | opens the edit modal, prefilled |
| `coords_delete:<id>` | card | asks for confirmation |
| `coords_delete_confirm:<id>` | confirmation | deletes, shows a confirmation |
| `coords_back:<page>` | card / confirmation | back to the picker page |
| `coords_add_modal` | modal | inserts, ephemeral confirmation |
| `coords_edit_modal:<id>` | modal | updates, ephemeral confirmation |

The world is never in the `custom_id`: it is always `interaction.channel_id` (the post), so a component can't
target another world.

### Responses

- Panel buttons answer with a new ephemeral message (`CHANNEL_MESSAGE_WITH_SOURCE` + `EPHEMERAL`), or a
  `MODAL` for *Ajouter*.
- Buttons and selects inside an ephemeral message update it in place (`UPDATE_MESSAGE`), except
  `coords_modify` which opens a `MODAL`.
- Modal submits answer with an ephemeral message.
- Database calls are fast enough for the 3 s limit; no deferred responses.

## Data

```sql
CREATE TABLE coordinates (
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

CREATE TABLE coordinate_panels (
  thread_id VARCHAR(32) PRIMARY KEY,
  message_id VARCHAR(32) NOT NULL
) DEFAULT CHARSET = utf8mb4;
```

The case-insensitive collation makes the unique key refuse "Base" when "base" exists. A duplicate insert
(`ER_DUP_ENTRY`) gives "Une coordonnée « X » existe déjà dans ce monde".

Order of the list and the picker: Overworld, Nether, End, then name.

## Messages (French)

- Panel: container with `## 📍 Coordonnées — <post name>`, a short explanation, buttons
  `➕ Ajouter`, `✏️ Modifier`, `📜 Lister`.
- List line: `🌍 **Base principale** — 120 64 -340` + `· *note*` when set + `· ajoutée par <@id>`
  (`modifiée par <@id>` when edited). Icons: 🌍 Overworld, 🔥 Nether, 🌌 End. 10 per page, footer
  `Page 2/5 · 43 coordonnées`, buttons `◀ Précédent` / `Suivant ▶` disabled at the ends.
  Empty world: `Aucune coordonnée dans ce monde pour l'instant. Utilise ➕ Ajouter.`
- Picker: a string select of 25 coordinates per page (label = name, description = dimension + X Y Z),
  plus previous / next buttons when there are more than 25.
- Card: name, dimension, X Y Z, note, author, last editor, buttons `✏️ Modifier`, `🗑️ Supprimer`, `↩ Retour`.
- Delete confirmation: `Supprimer **X** ? Tout le monde perdra cette coordonnée.` + `🗑️ Oui, supprimer` /
  `↩ Annuler`.
- Confirmations: `✅ Coordonnée **X** enregistrée : 🌍 120 64 -340`, `✅ Coordonnée **X** modifiée…`,
  `🗑️ Coordonnée **X** supprimée.`
- Errors: parse errors (e.g. `Les coordonnées doivent être 3 nombres entiers, par exemple 120 64 -340`),
  `Cette coordonnée n'existe plus.`, `Ce bouton ne fonctionne que dans un monde du forum des coordonnées.`,
  `Impossible d'accéder aux coordonnées pour le moment, réessaie dans un instant.`
- Every message disables mentions (`allowed_mentions: { parse: [] }`) and escapes Markdown in user values.

## Forum tracking (`forum.js`)

- `threadParents: Map<threadId, parentId>`, filled by `GUILD_CREATE` (`threads`), `THREAD_CREATE`,
  `THREAD_UPDATE`; on a miss, one `GET /channels/{id}` then cached.
- `isWorldThread(channelId)` → parent is `COORDINATES_FORUM_ID`.
- `shouldDeleteMessage(message, panelId)` (pure): false when not in a world thread, when `message.id ===
  message.channel_id` (original message), when the author is the bot (`APP_ID`) and the message is the panel;
  true otherwise.
- `ensurePanel(threadId)`: posts the panel when `coordinate_panels` has no row for the thread, or when the
  stored message doesn't exist anymore (404); stores the new id.
- On `GUILD_CREATE` of the forum's guild: `ensurePanel` for every active post of the forum. Archived posts
  keep their panel (it can't be deleted while nobody can post there).
- `THREAD_CREATE` with `parent_id === COORDINATES_FORUM_ID` → `ensurePanel`.
- `MESSAGE_CREATE` → `shouldDeleteMessage` → `DELETE /channels/{id}/messages/{id}`; errors are logged
  (missing *Manage Messages*).
- `MESSAGE_DELETE` of a stored panel id → `ensurePanel` (reposts).
- Without `COORDINATES_FORUM_ID` or without database settings, the feature is off and nothing is deleted.

## Bot permissions in the forum

View Channel, Send Messages in Threads, Manage Messages, Read Message History. Checked at startup for the
forum with the same computation as `lib/music/voicePermissions.js` (reused / generalised); a missing one
is logged.

## Error handling

- Parse errors, duplicate names, missing coordinates: ephemeral French message, nothing written.
- Database errors: logged, ephemeral "réessaie dans un instant".
- A coordinate id from a `custom_id` that doesn't belong to `interaction.channel_id`: treated as missing.

## Tests

`node:test`, no network nor database (a fake store for the handlers):

- `parse.js`: accepted formats, rejected inputs (2 numbers, letters, decimals, out of range), name / note
  lengths, empty name, dimension default.
- `messages.js`: panel buttons, list page (order, icons, paging, disabled buttons, empty world, escaping),
  picker (25 per page), card, delete confirmation, prefilled modal.
- `shouldDeleteMessage`: original message, panel, other bot messages, other channels.
- World isolation: a component targeting a coordinate of another thread gets "n'existe plus"; a panel
  button outside the forum gets the "ne fonctionne que dans un monde" error.

`store.js` is checked by hand against the alwaysdata database.

## Setup and deployment

- `.env.sample` / README: `COORDINATES_FORUM_ID`, the SQL schema (`scripts/coordinates-schema.sql`), the
  forum permissions.
- alwaysdata (API): MySQL database `damienfoulon_obot` and a dedicated user with a generated password,
  `DB_*` and `COORDINATES_FORUM_ID` added to `~/obot/.env` without printing the password, schema applied.
- PR to `master`; after merge: `git pull` on alwaysdata and service restart. No command to register.
- Manual checks with the user: add / edit / delete / list, message cleanup, new post gets its panel,
  Pixelmon and Cobblemon coordinates stay separate.

## Out of scope

Coordinate search, distance computation, Nether ↔ Overworld conversion, export, shared coordinates between
worlds, automatic cleanup of coordinates of deleted posts.
