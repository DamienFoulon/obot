# Litière de Pipette (💩) — design

Date: 2026-09-28
Branch: `feat/litter` (from `master`)

## Goal

A running joke for the server *Les Copains*: when someone messes up, they are moved to *la litière de
Pipette*, the category `🐈LitièreDePipette` (`1343619523907162222`) and its only channel, the voice channel
`💩` (`1343619564902154260`). While there, the member has none of their roles, wears the role `💩` and the
nickname `💩`, and sees nothing else of the server. They stay until the action is revoked.

An administrator applies or revokes it instantly. Anybody else can start a vote: at 4 votes (strictly more
than 3) the action applies. Votes are a joke of the moment, they expire after 5 minutes.

## Decisions

- **Command**: a user command (right click on a member > Apps), visible to everyone, no
  `default_member_permissions`. Name `Litière 💩`; if Discord refuses the emoji at registration, `Litière`.
- **Admin** = the Discord *Administrator* permission (`hasPermission(interaction, Permissions.ADMINISTRATOR)`).
  Moderators vote like everybody else.
- **Toggle**: on a member who is not in the litter, the command sends them there (admin) or opens a *litter*
  vote; on a member already in the litter, it releases them (admin) or opens a *release* vote.
- **Refusals** (ephemeral): the target is a bot, the server owner, the author themself, or has a role at or
  above the bot's highest role (today: `GOAT`). The whole feature is off when `LITTER_CHANNEL_ID` is not set.
- **Vote**: threshold 4 voices, the author counts for 1, one voice per member, the target and bots can't vote,
  one open vote per target and per kind (litter / release). Expires 5 minutes after opening. Votes live in
  memory: a restart forgets them, a click on a stale button answers "ce vote est terminé" and removes the
  button.
- **Hiding the server**: a role `💩` (created by the bot when missing) with deny overwrites on every category
  and every channel outside the litter, allow overwrites on the litter category and channel. Since all the
  other roles are removed, only `@everyone` remains and the role deny wins.
- **Lock**: the bot re-applies the litter whenever a Gateway event shows a drift (roles given back, nickname
  changed, leave and rejoin) as long as the member is recorded in the database.
- **Storage**: the members in the litter (saved roles and nickname) in MySQL through `database.js`, like the
  coordinates. Votes in memory only.
- **Language**: French for this feature (like the coordinates); the rest of the bot stays in English.

## Behaviour

### The command

| Target | Administrator | Other member |
|---|---|---|
| Not in the litter | Sent to the litter now | Opens a litter vote, or adds a voice to the open one |
| In the litter | Released now | Opens a release vote, or adds a voice to the open one |

The command answers with a deferred ephemeral message (`replyAfter`): the public announcement or the vote
message is posted in the same channel with `sendMessage`.

### Sending to the litter

1. Make sure the role `💩` and the overwrites exist (idempotent, see *Hiding*).
2. Fetch the member. Save in `litter_members` their role ids (managed roles excluded: bot roles and Server
   Booster can't be removed nor given back by anybody) and their nickname (`NULL` when none).
3. One `PATCH guilds/{guild}/members/{user}`: `roles` = the member's managed roles + `💩`, `nick` = `💩`,
   with an audit log reason.
4. A second `PATCH` with `channel_id` = the litter voice channel, whose "not connected to voice" error
   (Discord code 40032) is ignored: a member in another voice channel is dragged to the litter.
5. Public message in the channel of the interaction.

### Releasing

1. Read the saved roles and nickname, delete the row.
2. Keep only the saved roles that still exist and are below the bot's highest role. `PATCH` the member with
   these roles + their managed roles, and `nick` = the saved nickname (`null` clears it).
3. Public message. Releasing a member who left the server only deletes the row: they come back free.

### The vote

The vote message is posted publicly in the channel of the command, with one button (`litter_vote:<voteId>`).
The button answers with a deferred update (`DEFERRED_UPDATE_MESSAGE`) then edits the message through
`PATCH channels/{channel}/messages/{message}`, so the edit does not depend on the interaction token.

- A click by a new voter: the message shows `n/4` and the voters. The clicker gets no ephemeral reply, the
  updated message is the feedback.
- A click by someone who already voted, by the target or by a bot: ephemeral refusal, message unchanged.
- The command by a non-admin while a vote of the same kind is open for that target: adds their voice (same
  rules) and answers ephemeral with a link to the vote message.
- 4th voice: the action applies (the same code path as the admin), the message is rewritten as a result
  without button. When the target can't be sent anymore (left, role above the bot), the message says why and
  nothing is applied.
- 5 minutes after opening without 4 voices: a timer rewrites the message as expired and removes the button.
  A click that arrives late (bot restarted, timer lost) gets the same treatment.

### The lock

- `GUILD_MEMBER_UPDATE`: if the member is in `litter_members` and their roles (managed ones aside) are not
  exactly `💩` or their nickname is not `💩`, `PATCH` them back. When they already match, nothing is done:
  the bot's own `PATCH` triggers this event and must not loop.
- `GUILD_MEMBER_ADD`: if the member is in `litter_members`, apply again (same roles and nickname as above).
- `GUILD_MEMBER_REMOVE`: nothing, the row stays so a rejoin is caught.
- Discord errors while re-applying are logged, never retried.

### Hiding

`ensureHidden()` runs at startup (`GUILD_CREATE`), on `CHANNEL_CREATE` and `CHANNEL_UPDATE` (for that
channel only), and before each sending. It fetches the guild roles and channels and:

- creates the role `💩` when no role has that name: `permissions: "0"`, colour `0x7B3F00`, `hoist: true`
  (shown apart in the member list), `mentionable: false`;
- for every category and every channel that is neither the litter category nor inside it: `PUT` an overwrite
  `{ id: role, type: 0, deny: VIEW_CHANNEL | CONNECT }` when missing or incomplete. Writing on channels *and*
  their category keeps the channels "synced" in Discord's eyes (sync is equality of overwrites), and a
  channel created synced copies the deny;
- for the litter category and its channels: `PUT` an overwrite allowing
  `VIEW_CHANNEL | CONNECT | SPEAK | SEND_MESSAGES` when missing or incomplete.

The role id is looked up by name at each need (one `GET guilds/{guild}/roles`): a role deleted by hand is
recreated at the next need, and the overwrites follow at the next `ensureHidden()`.

No Gateway intent to add: `Guilds` covers the channel events, `GuildMembers` the member events.

## Architecture

```
lib/litter/
├── discord.js    -> REST: guild roles / channels / member, patch member, put overwrite, create role,
│                    edit message; the "not in voice" error is swallowed here
├── hiding.js     -> pure: the overwrites missing for a list of channels given the role and the litter
│                    category; the role to create
├── state.js      -> pure: why a target can't be sent (bot, owner, self, hierarchy), the roles and nick
│                    expected in the litter, whether a member drifted, the roles restorable at release
├── votes.js      -> in memory: open / add a voice / expire, threshold 4, ttl 5 min, injectable clock
├── messages.js   -> pure: French texts, vote message with its button, results, ephemeral replies
├── store.js      -> MySQL: get / save / delete a litter member
├── handlers.js   -> command and button -> responses, with api + store injected (like coordinates)
└── index.js      -> isEnabled(), the wiring used by the events
commands/moderation/litter.js            -> user command « Litière 💩 »
components/buttons/litter/litter_vote.js -> litter_vote:<voteId>
events/basics/guild_create.js (modified) -> + ensureHidden()
events/members/guild_member_add.js (modified) -> + re-apply
events/members/guild_member_update.js (new) -> re-apply on drift
events/channels/channel_create.js (new), channel_update.js (new) -> ensureHidden(channel)
lib/moderation.js (modified) -> exports highestRolePosition
scripts/litter-schema.sql
test/litter/hiding.test.js, state.test.js, votes.test.js, handlers.test.js
test/helpers/fakeLitterApi.js, fakeLitterStore.js
```

The `feat/temp-voice` branch also creates `events/channels/channel_update.js` and modifies
`guild_create.js`: the event files stay one-line calls so that the merge is trivial.

### Custom ids

| custom_id | Where | Effect |
|---|---|---|
| `litter_vote:<voteId>` | vote message | adds the clicker's voice; at 4 applies the action |

The vote id is an in-memory counter; the vote holds its kind, target, channel and message ids, voters and
expiry.

## Data

```sql
CREATE TABLE IF NOT EXISTS litter_members (
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  roles JSON NOT NULL,          -- ids of the roles removed
  nick VARCHAR(32) NULL,        -- original nickname, NULL when the member had none
  since TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id)
) DEFAULT CHARSET = utf8mb4;
```

## Configuration

`.env`: `LITTER_CHANNEL_ID=1343619564902154260` (the voice channel; the category is its `parent_id`). The
database settings are the existing ones (`DB_*`). Without `LITTER_CHANNEL_ID` the command answers "La
litière n'est pas configurée" and the events do nothing.

## Messages (French)

Public messages mention only the target and the author (`allowed_mentions`).

- Sent by an admin: `💩 <T> a fait de la merde : direction la litière de Pipette ! (par <A>)`
- Litter vote: `🗳️ <A> propose d'envoyer <T> dans la litière de Pipette 💩 · **n/4** · votes : <A>, <B>…`
  + red button `💩 Voter`
- Litter vote reached: `💩 Le peuple a parlé : <T> part à la litière de Pipette ! (4 votes : …)`
- Released by an admin: `🕊️ <T> sort de la litière (par <A>), Pipette a nettoyé.`
- Release vote: `🗳️ <A> propose de libérer <T> de la litière 🕊️ · **n/4** · votes : …` + green button
  `🕊️ Voter`; reached: `🕊️ Le peuple pardonne : <T> sort de la litière.`
- Expired: `⌛ Vote expiré : <T> reste où il est.` (button removed)
- Vote reached but the target can't be sent: `⌛ Trop tard : <reason>` (button removed)

Ephemeral replies: `Vote lancé 👇`, `Ta voix est comptée (n/4)`, `Tu as déjà voté`, `Tu ne peux pas voter
contre toi-même`, `Ce vote est terminé`, `Je ne peux pas envoyer un bot à la litière 🤖`, `Je ne peux pas
envoyer le propriétaire du serveur à la litière 👑`, `<T> a un rôle au-dessus du mien, je ne peux pas y
toucher ⬆️`, `<T> n'est plus sur le serveur 👀`, `La litière n'est pas configurée`, and the generic
`ERROR_MESSAGE` of `utils.js` on unexpected errors.

## Edge cases

- Target no longer sendable when the vote reaches 4 (left, role above the bot): the message says why,
  nothing is applied.
- Role `💩` deleted by hand: recreated at the next need; members in the litter get it back through the lock.
- Saved role deleted or now above the bot at release: skipped, the others are restored.
- Member with a managed role (Server Booster): the managed role stays in the litter and is not part of the
  saved roles.
- Nickname: `💩` is 1 character, always within Discord's 32 limit; a saved nickname is restored as is.
- The command's own Discord message limits: the voters list is at most 4 mentions.

## Testing

`node --test`, like the rest of the project. Discord is never called from the tests.

- `hiding.test.js`: missing overwrites for a mix of categories, channels, the litter category and its
  channel, a deny already present, an incomplete deny.
- `state.test.js`: refusals (bot, owner, self, hierarchy), roles to remove vs managed roles, drift detected
  or not, restorable roles.
- `votes.test.js`: first voice, duplicate, target can't vote, 4th voice reaches, expiry at 5 minutes with a
  fake clock, one open vote per target and kind, unknown vote id.
- `handlers.test.js`: admin sends / releases, non-admin opens a vote, button adds a voice, 4th voice
  applies, stale vote, feature not configured, refusals, with a fake API and a fake store (pattern of
  `test/helpers/fakeCoordinateStore.js`).
- The REST wrappers and the one-line event files are not unit tested (like the coordinates).
