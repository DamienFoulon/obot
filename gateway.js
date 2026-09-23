import 'dotenv/config';
import { REST } from '@discordjs/rest';
import { WebSocketManager, WebSocketShardEvents } from '@discordjs/ws';
import { GatewayIntentBits, GatewayOpcodes, PresenceUpdateStatus } from 'discord-api-types/v10';
import { loadModules } from './utils.js';

/**
 * Gateway (WebSocket) connection, used only for what HTTP interactions can't do:
 * listening to server events (members joining / leaving, messages) and setting the bot activity
 * See https://docs.discord.com/developers/events/gateway
 */

// Gateway events handlers, by event name ("GUILD_MEMBER_ADD", "MESSAGE_CREATE"...)
const events = new Map((await loadModules('events')).map((event) => [event.name, event]));

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const manager = new WebSocketManager({
  token: process.env.DISCORD_TOKEN,
  // Guild Members is a privileged intent: it must be enabled on the Bot page of the Developer Portal
  // Message Content is not needed: the slow mode only looks at who sends a message
  intents: GatewayIntentBits.Guilds | GatewayIntentBits.GuildMembers | GatewayIntentBits.GuildMessages,
  rest,
});

manager.on(WebSocketShardEvents.Dispatch, async (payload) => {
  const event = events.get(payload.t);
  if (!event) return;
  try {
    await event.execute(payload.d);
  } catch (err) {
    console.error(`Error while handling the ${payload.t} event`, err);
  }
});

// Last activity set with setActivity, lost when the bot restarts (like the original bot)
let currentPresence = null;

function sendPresence(shardId) {
  return manager.send(shardId, { op: GatewayOpcodes.PresenceUpdate, d: currentPresence });
}

// A new session (after an invalid session for instance) starts without activity: set it again
// Resumed sessions keep their presence, so there is nothing to do for them
manager.on(WebSocketShardEvents.Ready, async (data, shardId) => {
  if (currentPresence) await sendPresence(shardId);
});

manager.on(WebSocketShardEvents.Error, (err, shardId) => {
  console.error(`Gateway error on shard ${shardId}`, err);
});

export async function connectGateway() {
  await manager.connect();
  console.log(`Gateway connected with ${events.size} events handlers 📡`);
}

// Activity types, see https://docs.discord.com/developers/events/gateway-events#activity-object-activity-types
export const ActivityTypes = { Playing: 0, Listening: 2, Watching: 3 };

export async function setActivity(name, type) {
  currentPresence = {
    since: null,
    activities: [{ name, type }],
    status: PresenceUpdateStatus.Online,
    afk: false,
  };
  const shardIds = await manager.getShardIds();
  await Promise.all(shardIds.map(sendPresence));
}
