
![Logo](https://i.imgur.com/Uafhwhg.png)


# Obot Base Discord Bot

A clean Discord bot base, built the way Discord's official
[getting started guide](https://docs.discord.com/developers/quick-start/getting-started) does it 🤖

Discord sends every interaction (slash command, button click, modal submit...) as an HTTP request
to your app, which answers it. Next to it, a lightweight [Gateway](https://docs.discord.com/developers/events/gateway)
connection receives what HTTP can't: server events (members joining or leaving, messages) and the bot activity.

Built with [Express](https://expressjs.com), [discord-interactions](https://github.com/discord/discord-interactions-js)
and [@discordjs/ws](https://www.npmjs.com/package/@discordjs/ws) for the Gateway,
following the structure of the [official example app](https://github.com/discord/discord-example-app).


## Features

- Slash commands and user commands (right click on a member > Apps)
- Buttons and modals, using the latest components ([Labels](https://docs.discord.com/developers/components/reference#label) in modals, [Components V2](https://docs.discord.com/developers/components/reference#container) in messages)
- Commands and components handling: just drop a file in the right folder
- Installation contexts support (server install / user install)
- Events handling (Gateway): just drop a file in the `events` folder
- Moderation: ban, kick, timeout, warn and slow mode
- Welcome and leave messages
- Bot activity (Playing / Listening / Watching)
- Announcements and job offers (with a staff validation step, stored in MySQL)


## Project structure

```
├── commands        -> one file per command (payload + handler)
│   ├── general
│   ├── jobs
│   └── moderation
├── components      -> one file per button / modal handler
│   ├── buttons
│   └── modals
├── events          -> one file per Gateway event handler
├── lib             -> feature specific helpers
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
  git clone https://github.com/DamienFoulon/base_discord_bot_v14
  cd base_discord_bot_v14
  npm install
  cp .env.sample .env
```

### 1. Create your Discord app

In the [Developer Portal](https://discord.com/developers/applications), create an application, then fill your `.env` :

- **General Information** page : copy the **Application ID** into `APP_ID` and the **Public Key** into `PUBLIC_KEY`
- **Bot** page : reset and copy the **Token** into `DISCORD_TOKEN`, and enable the **Server Members Intent**
  (a [privileged intent](https://docs.discord.com/developers/events/gateway#privileged-intents), needed for the welcome and leave messages)

On the **Installation** page :

- In **Installation Contexts**, select **Guild Install** (and **User Install** if you want commands like `/obot` to be usable everywhere)
- In **Default Install Settings** > **Guild Install**, add the scopes `applications.commands` and `bot`,
  and the bot permissions `Send Messages`, `Add Reactions`, `Kick Members`, `Ban Members` and `Moderate Members`
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


## Good to know

The slow mode list and the bot activity are kept in memory: they are reset when the bot restarts.


## Resources

- [Discord developers documentation](https://docs.discord.com/developers/guides/bots)
- [Receiving and responding to interactions](https://docs.discord.com/developers/interactions/receiving-and-responding)
- [Components reference](https://docs.discord.com/developers/components/reference)


## Authors

- [@DamienFoulon](https://www.github.com/DamienFoulon)
