/**
 * Names of the temporary voice rooms: "🎮 VALORANT · Yaguaa", or "🔊 Yaguaa" when the owner plays nothing
 */

// Discord's limit for a channel name
export const MAX_ROOM_NAME = 100;
// Discord's own limit for a member name
const MAX_MEMBER_NAME = 32;
const GAME_PREFIX = '🎮 ';
const IDLE_PREFIX = '🔊 ';
const SEPARATOR = ' · ';

// Counted in code points, so an emoji is never cut in half
function cut(text, max) {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

const length = (text) => [...text].length;

export function displayName(member) {
  return member.nick ?? member.user.global_name ?? member.user.username;
}

export function buildRoomName({ game, name }) {
  const owner = cut(name, MAX_MEMBER_NAME);
  if (!game) return `${IDLE_PREFIX}${owner}`;
  const room = MAX_ROOM_NAME - length(GAME_PREFIX) - length(SEPARATOR) - length(owner);
  return `${GAME_PREFIX}${cut(game, room)}${SEPARATOR}${owner}`;
}
