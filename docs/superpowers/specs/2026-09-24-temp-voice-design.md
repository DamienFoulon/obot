# Temporary voice channels — design

Date: 2026-09-24
Branch: `feat/temp-voice` (from `master`)

## Goal

On « Les Copains », the 7 fixed voice channels of the `🔊 Vocal` category are replaced by temporary ones.
A member who joins **« ➕ Créer un salon »** gets their own voice channel, named after the game they play, and the
channel disappears when nobody is left in it.

## Decisions

- **Creator channel**: a fixed voice channel whose id is `TEMP_VOICE_CREATOR_ID`. Without it, the feature is off.
  Rooms are created in the creator's category, right below it.
- **Name**: `🎮 {game} · {name}`, e.g. `🎮 VALORANT · Yaguaa`. Without a game: `🔊 {name}`. `{game}` is the
  activity name as Discord gives it. `{name}` is the member's server nickname, else their global name, else
  their username.
- **The name follows the owner's game**: when the owner starts, changes or stops playing, the room is renamed.
- **Manual rename wins**: once the room's name is changed by someone else than the bot, the bot stops renaming it.
- **Owner rights** (native Discord, no custom UI): the owner gets, on their room only, *Manage Channel*
  (rename, user limit), *Manage Permissions* (lock the room) and *Move Members* (disconnect someone).
- **Owner leaves, others stay**: ownership goes to a member still in the room (the one who joined first among
  them). The owner overwrite moves to them, and the name follows their game.
- **Empty room** (no human left, bots don't count, so Obot alone playing music counts as empty): deleted.
- **One room per owner**: an owner who joins the creator again is moved back to their room.
- **Restart**: no database. At `GUILD_CREATE`, every voice channel of the creator's category other than the creator
  and other than a fixed channel is a room candidate: its owner is the member whose overwrite allows
  *Manage Channel*. Candidates with no such overwrite are left alone (fixed channels created by hand).
  Empty rooms are deleted, occupied rooms are tracked again, with manual rename detection starting fresh.

## Architecture

```
lib/tempVoice/
├── names.js       -> buildRoomName({ game, name }) (pure)
├── presences.js   -> userId -> current game, per guild (activity type 0 "Playing")
└── rooms.js       -> the rooms: create, move, owner transfer, delete, rename queue, restore at startup
events/voice/voice_state_update.js   (modified) -> + temp voice, BEFORE updateVoiceState (needs the old channel)
events/presences/presence_update.js  (new)      -> game change -> rename the rooms of that owner
events/channels/channel_update.js    (new)      -> a name the bot didn't set -> manual rename
events/channels/channel_delete.js    (new)      -> a room deleted by hand -> forgotten
events/basics/guild_create.js        (modified) -> + presences, restore the rooms, delete the empty ones
gateway.js                            (modified) -> + GuildPresences intent (privileged)
```

`rooms.js` gets its Discord calls injected (`createRoomRegistry({ api, now })`), like the music player
registry, so the tests run with a fake API and a fake clock.

### Data kept in memory

```
rooms: Map<channelId, {
  guildId, ownerId,
  members: string[],     // humans in the room, in join order (from voiceStates)
  lastBotName,           // the last name the bot asked for
  manual: boolean,       // renamed by someone else: no more automatic renames
  renames: number[],     // timestamps of the bot's renames, for the rate limit
  pendingName, timer,    // queued rename
}>
creating: Set<userId>    // creations in progress, a double VOICE_STATE_UPDATE must not create two rooms
```

### Flows

**Join the creator** (`channel_id === TEMP_VOICE_CREATOR_ID`, human):
1. If the user already owns a room → move them there, stop.
2. If a creation is in progress for them → stop.
3. `POST /guilds/{id}/channels`: type 2, `parent_id` = creator's category, `position` = creator's + 1,
   the category's overwrites + the owner overwrite, name from `names.js`.
4. `PATCH /guilds/{id}/members/{user}` `{ channel_id }` to move them.
5. If the move fails (they already left the creator) → delete the room.

**Leave a room** (old channel is a room, new channel is anything else):
- No human left → `DELETE /channels/{id}`, forget it.
- The owner left → transfer to the first remaining member: `PUT` their overwrite, `DELETE` the old owner's,
  rename to their game.

**Presence update** (the game of a user changes): for the room they own, if not `manual`, queue a rename.

**Rename queue**: Discord allows 2 renames of a channel per 10 minutes. The registry keeps the timestamps of its
renames: when 2 happened in the last 10 minutes, it keeps only the latest wanted name and applies it when the
window allows. A 429 answer (another cause) reschedules with its `retry_after`. A queued rename is dropped when
the room is deleted or becomes `manual`.

**Channel update**: for a room, `channel.name !== lastBotName` → `manual = true`, pending rename dropped.

### Permissions

The owner overwrite: `{ id: userId, type: 1, allow: MANAGE_CHANNELS | MANAGE_ROLES | MOVE_MEMBERS }`
(bits 4, 28, 24). Discord never lets a member grant, through *Manage Permissions*, a permission they don't have.

The bot needs *Manage Channels* and *Move Members* on the category (it's administrator on « Les Copains »).
At startup, a missing permission is logged, like the coordinates forum.

## Names

`names.js`:

- Discord allows 100 characters in a channel name: the member's name is cut first (with `…`), then the game.
- Markdown and mentions don't render in channel names: no escaping needed.

## Error handling

- Creation or move failing (permissions, API error): logged, the member stays in the creator, a created room is
  deleted.
- Delete failing with 404 (already deleted by hand): forgotten silently.
- Rename failing (other than 429): logged, the room keeps its name.
- Every handler is already wrapped by `gateway.js`, which logs the error without crashing.

## Tests (`node --test`)

- `names.js`: format with and without game, fallback name order (nickname, global name, username),
  100 characters cut.
- `presences.js`: Playing activity picked, other activity types ignored, no activity → no game.
- `rooms.js` with a fake API and clock: creation and move, second join moves back to the existing room,
  double event creates one room, move failure deletes the room, last human leaves → deleted, bots don't count,
  owner transfer (overwrites and rename), rename queue (2 per 10 min, only the last name applied, 429 retry),
  manual rename stops renames, restore at startup (owner from overwrites, empty rooms deleted, channels without
  owner overwrite ignored).

## Setup (after merge and deploy)

1. Developer Portal → Bot → enable **Presence Intent**.
2. Create the voice channel « ➕ Créer un salon » at the top of `🔊 Vocal`, set `TEMP_VOICE_CREATOR_ID` in the
   production `.env`, restart.
3. Once it works, delete the 7 old voice channels of `🔊 Vocal` (`💩` and `Soirée-ciné` stay).
4. `README.md` and `.env.sample`: document the feature as a private feature, with how to remove it.

## Out of scope

- A control panel with buttons in the room's chat.
- Persisting rooms in MySQL.
- Temporary rooms on the other servers of the bot.
