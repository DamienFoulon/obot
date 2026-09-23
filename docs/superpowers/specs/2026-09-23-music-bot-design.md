# Music bot — design

Date: 2026-09-23
Branch: `feat/music` (from `feat/http-interactions`)

## Goal

Let members of the server play music in a voice channel: `/play <link or text>` makes the bot join the
member's voice channel and play the track, with a queue and full controls (pause, volume, loop, buttons).

Supported sources: YouTube (incl. YouTube Music), SoundCloud, Spotify, Deezer, Apple Music — single tracks,
playlists and albums — plus free text search.

## Context and constraints

- **Usage**: mostly one server, owned by the user. No multi-server scaling concern, low ToS exposure.
- **Hosting**: alwaysdata (PaaS). Outgoing connections are all open (Discord voice UDP should work, to be
  confirmed first, see Verification). Datacenter IP: YouTube will likely ask to "sign in to confirm you're
  not a bot", hence optional cookies for yt-dlp. Memory is limited: no extra runtime (no Java / Lavalink).
- **Architecture**: the bot has no discord.js client. Interactions come over HTTP (`app.js`), server events
  over a raw `@discordjs/ws` Gateway connection (`gateway.js`). Voice must plug into that Gateway.
- **Voice E2EE (DAVE)** is mandatory on Discord: `@discordjs/voice` ≥ 0.19 (bundles `@snazzah/davey`).
- **DRM sources**: Spotify, Deezer and Apple Music audio can't be streamed. Their links only give
  metadata ("artist title"), then the track is searched on YouTube. The match can be a different version
  (live, remix): accepted limitation.
- **Spotify Web API** is not used: since February 2026, development mode apps need a Premium owner and
  can't read other users' playlists. The public embed page (`open.spotify.com/embed/{type}/{id}`) exposes
  title, artist and duration for tracks, albums and playlists without any key (checked 2026-09-23).
- **Deezer**: public API (`api.deezer.com`), no key.
- **Apple Music**: iTunes lookup API (`itunes.apple.com/lookup`) for tracks and albums, public page
  (JSON embedded in the HTML) for playlists — the least reliable source.
- Interactions must be answered within 3 seconds: `/play` uses the existing `replyAfter` helper
  (deferred ephemeral reply, then edit).
- Bot messages are in English, like the rest of the bot.
- All state is in memory: a restart empties the queues (like the bot activity today).

## Architecture

```
lib/music/
├── voiceAdapter.js   -> @discordjs/voice adapter over the existing Gateway
├── voiceStates.js    -> who is in which voice channel, per guild
├── resolvers/        -> link or text -> list of tracks
│   ├── index.js      -> picks the resolver from the URL
│   ├── youtube.js    -> YouTube + text search (yt-dlp)
│   ├── soundcloud.js -> SoundCloud (yt-dlp)
│   ├── spotify.js    -> Spotify embed page
│   ├── deezer.js     -> Deezer public API
│   └── appleMusic.js -> iTunes lookup API, public page for playlists
├── audio.js          -> yt-dlp + ffmpeg -> audio resource
├── player.js         -> one player per guild: queue, loop, volume, pause, auto leave
├── permissions.js    -> canControlMusic
└── nowPlaying.js     -> the "Now playing" message and its buttons

commands/music/       -> play, skip, stop, queue, pause, resume, volume, loop
components/buttons/   -> music_pause (toggles pause/resume), music_skip, music_loop, music_stop
events/voice/         -> voice_state_update, voice_server_update
events/basics/        -> guild_create (voice states snapshot)
test/                 -> node:test tests + fixtures
```

Changes to existing files:

- `gateway.js`: add the `GuildVoiceStates` intent, export `sendGatewayPayload(guildId, payload)` which sends
  a payload on the shard of that guild (shard id = `(guild_id >> 22) % shardCount`).
- `package.json`: add `@discordjs/voice` (^0.19) and `opusscript` (pure JS Opus encoder, no native build,
  needed for the inline volume), and a `test` script (`node --test`).
- `.env.sample`: `YTDLP_PATH` (default `yt-dlp`), `YTDLP_COOKIES` (optional cookies file path),
  `DJ_ROLE_ID` (optional).
- `README.md`: music feature, yt-dlp install, cookies procedure, alwaysdata deployment notes, bot
  permissions `Connect` and `Speak` added to the install link.

## Commands

All commands: `integration_types: [GUILD_INSTALL]`, `contexts: [GUILD]`, ephemeral replies.

| Command | Effect | Needs control right |
|---|---|---|
| `/play query:<link or text>` | adds to the queue, joins the member's channel if needed | no |
| `/queue` | current track + next 10, total count and remaining duration | no |
| `/skip` | next track | yes |
| `/stop` | clears the queue and leaves | yes |
| `/pause`, `/resume` | pause / resume | yes |
| `/volume level:<0-150>` | volume, 100 by default, kept for the whole player lifetime | yes |
| `/loop mode:<off/track/queue>` | loop mode | yes |

Rules, in `lib/music/permissions.js`:

- Every music command and button requires the member to be in a voice channel. When the bot is already
  connected in the guild, the member must be in the **same** channel as the bot (this applies to `/play`
  too). `/queue` is the exception: readable from anywhere in the guild.
- **Control right**: when `DJ_ROLE_ID` is set, only members with that role or administrators; otherwise any
  member allowed by the rule above.
- Not done through `requiredPermission`: it depends on the live voice state, not on a fixed Discord
  permission.

`/play` answers: `✅ Added **Title**` or `✅ Added 42 tracks from **Playlist**`
(plus `(limited to the first 100)` when truncated).

## "Now playing" message

One message per guild, in the text channel where the first `/play` of the session was used. It uses
Components V2 (a container with the thumbnail, title, author, duration, requester and next track) and an
action row: `⏯️ Pause/Resume`, `⏭️ Skip`, `🔁 Loop: <mode>`, `⏹️ Stop`.

- Edited (not reposted) on track change, pause/resume and loop change. If editing fails because the message
  was deleted, a new one is posted.
- When playback ends: edited to `⏹️ Playback ended` (or `⏹️ Disconnected`) without buttons.
- Buttons follow the same rules as the commands. Volume is command only.
- No live progress bar.

## Resolvers

`resolve(query, requestedBy)` returns `{ title?, tracks: Track[], truncated }`, where

```
Track = { title, author, duration (seconds, may be null), thumbnail?, url?, query?, requestedBy }
```

- `url` is set for YouTube / SoundCloud tracks; `query` ("artist title") for Spotify / Deezer / Apple Music,
  resolved to a YouTube URL only when the track is about to play.
- Resolver selection by hostname: `youtube.com`, `youtu.be`, `music.youtube.com`, `soundcloud.com`,
  `on.soundcloud.com`, `open.spotify.com`, `spotify.link`, `deezer.com`, `deezer.page.link`, `link.deezer.com`,
  `music.apple.com`. Short links (`spotify.link`, `deezer.page.link`, `link.deezer.com`, `on.soundcloud.com`)
  are expanded by following the redirect first. Any other URL: "unsupported link" error. Not a URL: YouTube
  search (`ytsearch1:`).
- YouTube / SoundCloud: `yt-dlp --flat-playlist -J <url>` (fast even for playlists). A YouTube watch URL with
  a `list=` parameter plays the single video.
- Limits: 100 tracks per playlist / album (truncated, the answer says so), 500 tracks in a queue (the
  answer says how many were added before the queue was full).
- Network calls have a 10 s timeout.

## Audio pipeline (`audio.js`)

When a track reaches the head of the queue:

1. No `url` → `yt-dlp --print webpage_url "ytsearch1:<query>"`. No result → the track fails.
2. `yt-dlp -f bestaudio -o - --quiet <url>` piped into `ffmpeg -i pipe:0 -f s16le -ar 48000 -ac 2 pipe:1`.
3. `createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw, inlineVolume: true })`, volume set from
   the player.
4. `--cookies $YTDLP_COOKIES` added to every yt-dlp call when set.
5. Both processes are killed when the track ends, is skipped or the player is destroyed (no orphans).
6. yt-dlp stderr is kept (last lines) to build the error message; "Sign in to confirm you're not a bot"
   gives a dedicated log message pointing to `YTDLP_COOKIES`.

At startup, `yt-dlp --version` is run once. If it fails, a warning is logged and the music commands answer
"Music is not available on this bot (yt-dlp is missing)"; the rest of the bot works normally.

## Voice connection

- `voiceAdapter.js` implements the `@discordjs/voice` adapter: `sendPayload` → `sendGatewayPayload`
  (op 4 Voice State Update); `VOICE_STATE_UPDATE` (bot user only) and `VOICE_SERVER_UPDATE` are forwarded to
  the adapter methods of the matching guild.
- `voiceStates.js`: `Map<guildId, Map<userId, channelId>>`, filled by `GUILD_CREATE` (`voice_states`) and
  updated by `VOICE_STATE_UPDATE`. Exposes `getUserChannel(guildId, userId)` and
  `getChannelMembers(guildId, channelId)`.
- `events/voice/voice_state_update.js` updates `voiceStates`, forwards to the adapter and notifies the
  player (for "alone in channel" and "bot moved / kicked"). One file, since the event loader accepts a single
  handler per event name.

## Player (`player.js`)

One player per guild, in a `Map<guildId, Player>`. Created by the first `/play`, destroyed by `/stop`,
auto leave or unrecoverable disconnection.

State: `queue`, `current`, `loop` (`off` / `track` / `queue`), `volume`, `paused`, `textChannelId`,
`nowPlayingMessageId`, `consecutiveFailures`.

- Track end (`Idle`): `track` loop replays `current`; `queue` loop pushes `current` to the end; then next.
- Empty queue → idle; after 5 minutes idle the bot leaves.
- Bot alone in its channel (only bots left) for 60 s → leaves. Cancelled if someone joins back.
- Bot moved to another channel → follows (keeps playing). Bot kicked from the channel (channel id null)
  → player destroyed.
- Voice connection `Disconnected`: wait up to 5 s for `Signalling` / `Connecting`; otherwise destroy.
- Failures: a failing track posts `⚠️ Couldn't play **X**, skipping` in the text channel and goes on.
  After 3 consecutive failures: `⚠️ Something is wrong with playback, stopping` and the player is destroyed.
  A successful start resets the counter.
- Missing `Connect` / `Speak` permission or a full channel: `/play` answers with a clear error, no player
  is kept.
- The audio engine (`audio.js`) and the voice connection factory are injected, so the queue logic can be
  tested without Discord or yt-dlp.

## Tests

`node --test`, no extra dependency, no network (recorded fixtures in `test/fixtures/`):

- resolver selection for every URL form (`youtu.be`, `music.youtube.com`, `spotify.link`,
  `deezer.page.link`, `?si=` parameters, Apple Music storefronts, free text, unsupported URL);
- Spotify / Deezer / Apple Music parsing from recorded responses;
- player with a fake audio engine: queue order, skip, the 3 loop modes, 500 cap, stop after 3 failures,
  auto leave timers (mocked timers);
- `canControlMusic`: with / without `DJ_ROLE_ID`, administrator, member outside the bot's channel;
- `voiceStates`: join, leave, move.

## Verification (manual)

1. **First, on alwaysdata**: a minimal probe (join a channel, play a local file) to confirm outgoing UDP and
   DAVE work there, before building the rest.
2. Locally: one link of each source (track and playlist), buttons, auto leave, bot moved / kicked.
3. On alwaysdata: YouTube with and without cookies.

## Out of scope

Live progress bar, lyrics, seek, shuffle, filters, persistence of the queues across restarts, multiple
"now playing" channels, voice commands, autoplay of related tracks.
