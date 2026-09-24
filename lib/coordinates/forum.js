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
