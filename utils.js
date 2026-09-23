import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { InteractionResponseFlags, InteractionResponseType } from 'discord-interactions';

export const ERROR_MESSAGE = 'Ooops... ! I fell into the stairs 🤕 Can you please try again ?';

export async function DiscordRequest(endpoint, options = {}) {
  // append endpoint to root API URL
  const url = 'https://discord.com/api/v10/' + endpoint;
  // Stringify payloads
  if (options.body) options.body = JSON.stringify(options.body);
  // Use fetch to make requests
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'User-Agent': 'DiscordBot (https://github.com/DamienFoulon/base_discord_bot_v14, 2.0.0)',
      ...options.headers,
    },
  });
  // throw API errors
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Discord API error ${res.status} on ${endpoint}: ${JSON.stringify(data)}`);
  }
  // return original response
  return res;
}

export async function InstallCommands(appId, commands, guildId) {
  // Guild commands are available instantly, global commands can take a while to propagate
  // See https://docs.discord.com/developers/interactions/application-commands#registering-a-command
  const endpoint = guildId
    ? `applications/${appId}/guilds/${guildId}/commands`
    : `applications/${appId}/commands`;

  // This is calling the bulk overwrite endpoint
  await DiscordRequest(endpoint, { method: 'PUT', body: commands });
}

// Recursively import every .js module of a project folder (commands, components...)
export async function loadModules(folderName) {
  const folder = fileURLToPath(new URL(folderName, import.meta.url));
  const entries = await readdir(folder, { withFileTypes: true, recursive: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(entry.parentPath, entry.name));
  return Promise.all(files.map((file) => import(pathToFileURL(file).href)));
}

// Read the values of a submitted modal, as { custom_id: value }
export function getModalValues(components) {
  const values = {};
  for (const component of components) {
    // Label (type 18) wraps a single component, legacy action rows wrap a list
    const children = component.component ? [component.component] : component.components ?? [];
    for (const child of children) {
      values[child.custom_id] = child.value ?? child.values;
    }
  }
  return values;
}

// "my_modal:123" -> { name: "my_modal", args: ["123"] }
export function parseCustomId(customId) {
  const [name, ...args] = customId.split(':');
  return { name, args };
}

export function ephemeralReply(content) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: InteractionResponseFlags.EPHEMERAL },
  };
}

// Interactions must be answered within 3 seconds: acknowledge first, do the (slow) work,
// then edit the "thinking..." message with the text returned by `work`
// See https://docs.discord.com/developers/interactions/receiving-and-responding#responding-to-an-interaction
export async function replyAfter(interaction, res, work) {
  res.send({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: InteractionResponseFlags.EPHEMERAL },
  });

  let content;
  try {
    content = await work();
  } catch (err) {
    console.error(err);
    content = ERROR_MESSAGE;
  }

  await DiscordRequest(`webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
    method: 'PATCH',
    body: { content },
  });
}

export async function sendMessage(channelId, body) {
  const res = await DiscordRequest(`channels/${channelId}/messages`, { method: 'POST', body });
  return res.json();
}

// Returns false when the user has disabled their DMs
export async function sendDM(userId, content) {
  try {
    const res = await DiscordRequest('users/@me/channels', { method: 'POST', body: { recipient_id: userId } });
    const channel = await res.json();
    await sendMessage(channel.id, { content });
    return true;
  } catch (err) {
    console.log(`Cannot DM the user ${userId} (DMs disabled ?)`, err.message);
    return false;
  }
}

export async function addReaction(channelId, messageId, emoji) {
  await DiscordRequest(`channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`, {
    method: 'PUT',
  });
}

// Audit log reasons are sent through a header, which must be URI encoded
export function auditLogReason(reason) {
  return { 'X-Audit-Log-Reason': encodeURIComponent(reason) };
}

// "#0193CF" -> 0x0193CF, or `fallback` when the color is invalid
export function parseColor(color, fallback = 0x0193cf) {
  const value = parseInt(String(color ?? '').replace('#', ''), 16);
  return Number.isNaN(value) ? fallback : value;
}
