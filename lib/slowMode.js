// Members in slow mode, by user id
// Kept in memory, like the original bot: the list is emptied when the bot restarts
const slowModeMembers = new Set();

// Returns true when the member is now in slow mode
export function toggleSlowMode(userId) {
  if (slowModeMembers.delete(userId)) return false;
  slowModeMembers.add(userId);
  return true;
}

export function removeFromSlowMode(userId) {
  slowModeMembers.delete(userId);
}

export function isInSlowMode(userId) {
  return slowModeMembers.has(userId);
}
