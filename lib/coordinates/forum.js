import { buildPanel } from './messages.js';
import { getPanel, setPanel } from './store.js';
import { fetchBotChannelPermissions } from '../channelPermissions.js';
import { DiscordRequest, sendMessage } from '../../utils.js';

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

// A post of the forum that is not archived: an unarchived post may have no panel yet
// (archived at startup, or its panel could not be posted), THREAD_CREATE is not sent then
export async function isActiveWorld(thread) {
  return thread.thread_metadata?.archived === false && isWorldThread(thread.id, thread.parent_id);
}

// The original message of a forum post has the id of the post. The bot's panel is recognised by its buttons,
// even before its id is stored; any other message (a music "Now playing" posted there, for instance) goes
export function shouldDeleteMessage(message) {
  if (message.id === message.channel_id) return false;
  const isPanel = message.author?.id === process.env.APP_ID
    && JSON.stringify(message.components ?? []).includes('"custom_id":"coords_add"');
  return !isPanel;
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
// Archived posts get theirs when they are unarchived (THREAD_UPDATE)
export async function setupGuild(guild) {
  for (const channel of [...(guild.channels ?? []), ...(guild.threads ?? [])]) rememberChannel(channel);
  if (!isCoordinatesEnabled() || !guild.channels?.some((channel) => channel.id === forumId())) return;
  await checkForumPermissions(guild.id);
  for (const thread of guild.threads ?? []) {
    if (thread.parent_id === forumId()) await ensurePanel(thread.id);
  }
}
