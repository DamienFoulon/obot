
![Logo](https://i.imgur.com/Uafhwhg.png)


# Obot

A Discord bot built the way Discord's official
[getting started guide](https://docs.discord.com/developers/quick-start/getting-started) does it 🤖

Obot started as a clean bot base and grew into the bot of a private Discord server: next to the generic
features (moderation, welcome messages, announcements...), it carries features written for that server's
own needs, like the music player and the Minecraft coordinates. They are kept in the code as they are:
reuse them if they suit you, or remove them if you don't need them (see [Private features](#private-features)).

Discord sends every interaction (slash command, button click, modal submit...) as an HTTP request
to your app, which answers it. Next to it, a lightweight [Gateway](https://docs.discord.com/developers/events/gateway)
connection receives what HTTP can't: server events (members joining or leaving, messages) and the bot activity.

Built with [Express](https://expressjs.com), [discord-interactions](https://github.com/discord/discord-interactions-js)
and [@discordjs/ws](https://www.npmjs.com/package/@discordjs/ws) for the Gateway,
following the structure of the [official example app](https://github.com/discord/discord-example-app).


## Features

### The base

- Slash commands and user commands (right click on a member > Apps)
- Buttons, select menus and modals, using the latest components ([Labels](https://docs.discord.com/developers/components/reference#label) in modals, [Components V2](https://docs.discord.com/developers/components/reference#container) in messages)
- Commands and components handling: just drop a file in the right folder
- Installation contexts support (server install / user install)
- Events handling (Gateway): just drop a file in the `events` folder
- Tests with the Node.js test runner (`npm test`)

### Generic features

| Feature | Commands | Needs |
|---|---|---|
| Moderation | `Ban`, `Kick`, `Timeout`, `Warn`, `SlowMode` (right click on a member > Apps) | - |
| Welcome and leave messages | - | `WELCOME_*` / `LEAVE_*` variables |
| Bot activity (Playing / Listening / Watching) | `/set_bot_activity` | - |
| Announcements | `/announcement` | - |
| Job offers, with a staff validation step | `/send_job_opener` | `JOB_*` variables, MySQL |
| Bot information | `/obot` | - |

### Private features

These ones were written for a private server. They work on any server, but they are more specific:

| Feature | Commands | Needs |
|---|---|---|
| Music: a YouTube, SoundCloud, Spotify, Deezer or Apple Music link (tracks, albums, playlists) or a search, with a queue, pause, volume, loop and buttons | `/play`, `/queue`, `/skip`, `/pause`, `/resume`, `/stop`, `/volume`, `/loop` | yt-dlp, ffmpeg, a host where Discord voice works |
| Minecraft coordinates: in a forum, each post is a world with a panel to add, edit and list its coordinates (the posts stay clean) | - (buttons in the forum) | `COORDINATES_FORUM_ID`, MySQL |
| Temporary voice rooms: join « ➕ Créer un salon » to get your own voice channel, named after your game, deleted when empty | - | `TEMP_VOICE_CREATOR_ID`, the Presence intent |

They turn themselves off when they are not configured: without yt-dlp the music commands answer that they are
not available, without `COORDINATES_FORUM_ID` the forum is left alone, without `TEMP_VOICE_CREATOR_ID` nobody
gets a room. To remove them from the code, see
[Removing a feature](#removing-a-feature).


## Project structure

```
├── commands        -> one file per command (payload + handler)
│   ├── general
│   ├── jobs
│   ├── moderation
│   └── music
├── components      -> one file per button / modal handler
│   ├── buttons
│   ├── selects      -> one file per select menu handler
│   └── modals
├── events          -> one file per Gateway event handler
├── lib             -> feature specific helpers (lib/music, lib/coordinates, lib/tempVoice...)
├── docs            -> designs and implementation plans of the music, coordinates and temporary voice features
├── scripts         -> maintenance scripts (voice-probe.js, coordinates-schema.sql)
├── test            -> tests (npm test)
├── .env            -> your credentials and IDs
├── app.js          -> main entrypoint, receives the interactions
├── commands.js     -> registers the commands on Discord
├── constants.js    -> Discord constants (permissions, contexts...)
├── database.js     -> MySQL connection
├── gateway.js      -> Gateway connection (events, bot activity)
├── utils.js        -> Discord API helpers
└── package.json
```


## Installation

Requires Node.js 20.12 or newer.

```bash
  git clone https://github.com/DamienFoulon/obot
  cd obot
  npm install
  cp .env.sample .env
```

### 1. Create your Discord app

In the [Developer Portal](https://discord.com/developers/applications), create an application, then fill your `.env` :

- **General Information** page : copy the **Application ID** into `APP_ID` and the **Public Key** into `PUBLIC_KEY`
- **Bot** page : reset and copy the **Token** into `DISCORD_TOKEN`, and enable the **Server Members Intent**
  (a [privileged intent](https://docs.discord.com/developers/events/gateway#privileged-intents), needed for the welcome and leave messages)
  and the **Presence Intent** (needed for the names of the temporary voice rooms)

On the **Installation** page :

- In **Installation Contexts**, select **Guild Install** (and **User Install** if you want commands like `/obot` to be usable everywhere)
- In **Default Install Settings** > **Guild Install**, add the scopes `applications.commands` and `bot`,
  and the bot permissions `Send Messages`, `Add Reactions`, `Kick Members`, `Ban Members`, `Moderate Members`, `Connect` and `Speak`
  (drop the ones of the features you don't use)
- Open the **Install Link** in your browser to add the bot to your server

### 2. Register the commands

```bash
  npm run register
```

Commands are registered globally. While developing, set `GUILD_ID` in your `.env` to register them
on your test server only: updates will be instant.

### 3. Run the app and expose it

```bash
  npm start
  # or, restarting on each change
  npm run dev
```

Discord needs a public HTTPS URL to reach your app. Locally, you can use [ngrok](https://ngrok.com/) :

```bash
  ngrok http 3000
```

Then, on the **General Information** page of your app, set the **Interactions Endpoint URL** to
`https://<your-ngrok-url>/interactions` and save. Discord checks the URL right away, so the app must be running.

`npm start` also opens the Gateway connection: the bot shows up online and starts listening to the server events.

And here you are ! 🎉


## Environment Variables

All the variables are listed in `.env.sample`. In the welcome and leave messages, `{user}` is replaced by the member.
The minimum is :

`APP_ID`
`DISCORD_TOKEN`
`PUBLIC_KEY`

The job offers feature also needs a MySQL database with this table :

```sql
CREATE TABLE jobs (
    id VARCHAR(32) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    remuneration VARCHAR(255) NOT NULL,
    requiredSkills VARCHAR(255),
    author VARCHAR(32) NOT NULL
);
```


## Music (private feature)

The music commands need [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [ffmpeg](https://ffmpeg.org).
Without yt-dlp, the bot starts anyway and the music commands say they are not available.

```bash
  # yt-dlp standalone binary, no Python needed
  mkdir -p ~/.local/bin
  curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o ~/.local/bin/yt-dlp
  chmod +x ~/.local/bin/yt-dlp
  # Keep it up to date: YouTube changes often
  yt-dlp -U
```

Set `YTDLP_PATH` when yt-dlp is not in the `PATH` of the bot.

Spotify, Deezer and Apple Music protect their audio: the bot reads the title and the artist of their links and
plays the first YouTube result. It can be another version of the track (live, remix...).
Playlists and albums are limited to 100 tracks, the queue to 500.

### YouTube blocks the bot

On a server (VPS, PaaS...), YouTube often answers "Sign in to confirm you're not a bot". Give yt-dlp the cookies
of a Google account, preferably a secondary one, following the
[yt-dlp guide](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies), then set
`YTDLP_COOKIES` to the path of the cookies file.

### Check that your host can play music

Discord voice uses UDP. Before deploying, stop the bot and run on the host:

```bash
  node scripts/voice-probe.js <guildId> <voiceChannelId>
```

The bot joins the channel and plays a 10 s tone.

### DJ role

By default, everybody in the voice channel of the bot controls the music. Set `DJ_ROLE_ID` to keep skip, stop,
pause, volume and loop for this role and the administrators.


## Minecraft coordinates (private feature)

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


## Configuration

### Setup Commands

Create a file in a sub-folder of `commands`. It exports the command payload (`data`) and its handler (`execute`) :

```js
import { CommandTypes, Contexts, IntegrationTypes } from '../../constants.js';
import { ephemeralReply } from '../../utils.js';

export const data = {
  name: 'command-name',
  description: 'command-description',
  type: CommandTypes.CHAT_INPUT,
  integration_types: [IntegrationTypes.GUILD_INSTALL, IntegrationTypes.USER_INSTALL],
  contexts: [Contexts.GUILD, Contexts.BOT_DM, Contexts.PRIVATE_CHANNEL],
};

export async function execute(interaction, res) {
  return res.send(ephemeralReply('Command reply'));
}
```

Then run `npm run register` again.

### Setup Components

Buttons and modals work the same way, in a sub-folder of `components`. The handler is picked with the `custom_id` of the component :

```js
import { ephemeralReply } from '../../../utils.js';

export const customId = 'switch_button';

export async function execute(interaction, res) {
  return res.send(ephemeralReply('Button clicked !'));
}
```

When a component does something sensitive, export a `requiredPermission` : it is checked on every interaction.
Don't rely on the command's `default_member_permissions` alone, server admins can change it.

```js
import { Permissions } from '../../../constants.js';

export const requiredPermission = Permissions.BAN_MEMBERS;
```

A `custom_id` can carry data after a `:`, e.g. `ban_modal:<userId>` is handled by the `ban_modal` component,
which reads the user id with `parseCustomId(interaction.data.custom_id).args`.

### Slow actions

Discord waits **3 seconds** at most for an answer. When a handler calls the Discord API or the database,
wrap the work in `replyAfter` : it acknowledges the interaction first, then edits the reply with the returned text.

```js
await replyAfter(interaction, res, async () => {
  await sendMessage(channelId, { content: 'Hello' });
  return 'Message sent ! 📨';
});
```


### Setup Events

Create a file in a sub-folder of `events`. The name is the [Gateway event](https://docs.discord.com/developers/events/gateway-events#receive-events)
name, and the handler receives the raw event data :

```js
import { sendMessage } from '../../utils.js';

export const name = 'GUILD_MEMBER_ADD';

export async function execute(member) {
  console.log(`User : ${member.user.username} joined the server 🛬`);
}
```

Some events need an extra intent, to add in `gateway.js`. Before adding a privileged one,
check [whether you really need it](https://docs.discord.com/developers/gateway/you-might-not-need-a-privileged-intent).


## Removing a feature

Commands, components and events are loaded from their folders: deleting their files is enough for them to
disappear. Run `npm run register` afterwards, so Discord forgets the removed commands.

### Music

1. Delete `commands/music`, `components/buttons/music`, `lib/music`, `events/voice`, `scripts/voice-probe.js`
   and the music tests (the `test/*.test.js` files, `test/resolvers`, `test/fixtures` and `test/helpers/fakes.js`)
2. In `events/basics/guild_create.js`, remove `setGuildVoiceStates`
3. In `app.js`, remove `checkYtDlp`
4. In `gateway.js`, remove `setVoicePayloadSender` and the `GuildVoiceStates` intent
5. `npm uninstall @discordjs/voice opusscript`, and remove the `YTDLP_*` and `DJ_ROLE_ID` variables

### Minecraft coordinates

1. Delete `lib/coordinates`, the `coordinates` folders of `components`, `events/messages/message_delete.js`,
   `events/threads`, `scripts/coordinates-schema.sql` and `test/coordinates`
2. In `events/basics/guild_create.js`, remove `setupGuild`
3. In `events/messages/message_create.js`, remove `cleanWorldMessage`
4. Remove the `COORDINATES_FORUM_ID` variable, and drop the `coordinates` and `coordinate_panels` tables

### Temporary voice channels

1. Delete `lib/tempVoice`, `events/presences`, `events/channels`, `test/tempVoice` and `test/helpers/fakeVoiceApi.js`
2. In `events/voice/voice_state_update.js`, remove `tempVoice` and `oldChannelId`
3. In `events/basics/guild_create.js`, remove `setupTempVoice`
4. In `gateway.js`, remove the `GuildPresences` intent, and disable the Presence Intent in the Developer Portal
5. Remove the `TEMP_VOICE_CREATOR_ID` variable

### Job offers

Delete `commands/jobs`, the `jobs` folders of `components` and `lib/jobOffer.js`, then remove the `JOB_*` variables.
Without the coordinates, nothing else uses MySQL: `database.js`, the `DB_*` variables and `mysql2` can go too.

`lib/channelPermissions.js` is shared by the music, the coordinates and the temporary voice rooms: delete it only
when all three are gone. The temporary voice rooms also use `events/voice/voice_state_update.js`,
`lib/music/voiceStates.js` and the `GuildVoiceStates` intent: keep them when you remove only the music.

`npm test` then tells you if something still points to a removed file.


## Good to know

The slow mode list and the bot activity are kept in memory: they are reset when the bot restarts.

Discord never lets the bot sanction the server owner, a member whose role is above the bot's role,
or timeout an administrator. The moderation commands check it first and explain why they can't act,
so remember to move the bot's role high enough in the server settings.


## Resources

- [Discord developers documentation](https://docs.discord.com/developers/guides/bots)
- [Receiving and responding to interactions](https://docs.discord.com/developers/interactions/receiving-and-responding)
- [Components reference](https://docs.discord.com/developers/components/reference)


## Authors

- [@DamienFoulon](https://www.github.com/DamienFoulon)
