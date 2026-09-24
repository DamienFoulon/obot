import { isNotFound, ownerOverwrite } from './discord.js';
import { buildRoomName, displayName } from './names.js';

/**
 * The temporary voice rooms: joining the creator channel creates one, named after the owner's game.
 * The owner who leaves gives it to the next member, the last human who leaves deletes it.
 * The Discord calls and the clock are given, so the tests can replace them
 */

// Discord allows 2 renames of a channel per 10 minutes
export const RENAME_WINDOW = 10 * 60 * 1000;
export const RENAMES_PER_WINDOW = 2;
const VOICE = 2;
// The names the bot asked last, to recognise the CHANNEL_UPDATE they cause (several can be in flight)
const KNOWN_NAMES = 5;
const MANAGE_CHANNELS = 1n << 4n;

export function createRoomRegistry({
  api, creatorId, getGame, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, log = console.error,
}) {
  // channelId -> room
  const rooms = new Map();
  // userId -> display name, from the voice states
  const names = new Map();
  // Creations in progress: two events for the same join must not create two rooms
  const creating = new Set();

  const roomName = (guildId, userId) => buildRoomName({ game: getGame(guildId, userId), name: names.get(userId) ?? userId });

  function track(channelId, { guildId, ownerId, members, name }) {
    rooms.set(channelId, { guildId, ownerId, members, name, knownNames: [name], manual: false, renames: [], timer: null });
  }

  async function deleteRoom(channelId) {
    if (!rooms.has(channelId)) return;
    forget(channelId);
    try {
      await api.deleteChannel(channelId);
    } catch (err) {
      if (!isNotFound(err)) log(`Cannot delete the voice room ${channelId}:`, err.message);
    }
  }

  // Called by the timer of a queued rename: the name is computed again, the owner's game may have changed
  const retry = (channelId) => () => {
    const room = rooms.get(channelId);
    if (!room) return;
    room.timer = null;
    return scheduleRename(channelId);
  };

  async function rename(channelId, name) {
    const room = rooms.get(channelId);
    const previous = room.name;
    room.name = name;
    room.knownNames = [...room.knownNames, name].slice(-KNOWN_NAMES);
    room.renames.push(now());
    try {
      await api.renameChannel(channelId, name);
    } catch (err) {
      if (rooms.get(channelId) !== room) return;
      room.name = previous;
      if (err.retryAfter) room.timer = setTimer(retry(channelId), err.retryAfter);
      else if (!isNotFound(err)) log(`Cannot rename the voice room ${channelId}:`, err.message);
    }
  }

  // The name follows the owner's game, unless someone renamed the room by hand.
  // Discord allows 2 renames per 10 minutes: past that, one timer waits for the window
  async function scheduleRename(channelId) {
    const room = rooms.get(channelId);
    if (!room || room.manual || room.timer) return;
    const name = roomName(room.guildId, room.ownerId);
    if (name === room.name) return;
    room.renames = room.renames.filter((time) => now() - time < RENAME_WINDOW);
    if (room.renames.length < RENAMES_PER_WINDOW) return rename(channelId, name);
    room.timer = setTimer(retry(channelId), room.renames[0] + RENAME_WINDOW - now());
  }

  function forget(channelId) {
    const room = rooms.get(channelId);
    if (room?.timer) clearTimer(room.timer);
    rooms.delete(channelId);
  }

  async function transfer(channelId, room) {
    const previous = room.ownerId;
    room.ownerId = room.members[0];
    try {
      await api.setOwner(channelId, room.ownerId);
      await api.removeOverwrite(channelId, previous);
    } catch (err) {
      if (!isNotFound(err)) log(`Cannot give the voice room ${channelId} to ${room.ownerId}:`, err.message);
    }
    await scheduleRename(channelId);
  }

  async function leaveRoom(channelId, userId) {
    const room = rooms.get(channelId);
    room.members = room.members.filter((id) => id !== userId);
    if (room.members.length === 0) await deleteRoom(channelId);
    else if (room.ownerId === userId) await transfer(channelId, room);
  }

  async function createRoom(guildId, userId) {
    if (creating.has(userId)) return;
    creating.add(userId);
    let channelId = null;
    try {
      const creator = await api.getChannel(creatorId());
      const category = creator.parent_id ? await api.getChannel(creator.parent_id) : null;
      const name = roomName(guildId, userId);
      const channel = await api.createChannel(guildId, {
        name,
        type: VOICE,
        parent_id: creator.parent_id ?? null,
        position: creator.position + 1,
        // Like a channel created in the category by hand, plus the owner's rights
        permission_overwrites: [
          ...(category?.permission_overwrites ?? []).filter((overwrite) => overwrite.id !== userId),
          ownerOverwrite(userId),
        ],
      });
      channelId = channel.id;
      track(channelId, { guildId, ownerId: userId, members: [], name });
      await api.moveMember(guildId, userId, channelId);
    } catch (err) {
      // The member may have left the creator before being moved: the room would stay empty
      log(`Cannot create a voice room for ${userId}:`, err.message);
      if (channelId) await deleteRoom(channelId);
    } finally {
      creating.delete(userId);
    }
  }

  async function onVoiceState({ guildId, userId, member, bot, oldChannelId, newChannelId }) {
    // Bots never own a room and don't keep one alive
    if (bot) return;
    if (member?.user) names.set(userId, displayName(member));
    // Mute, deafen, stream...: same channel
    if (oldChannelId === newChannelId) return;
    if (oldChannelId && rooms.has(oldChannelId)) await leaveRoom(oldChannelId, userId);
    const room = newChannelId ? rooms.get(newChannelId) : null;
    if (room && !room.members.includes(userId)) room.members.push(userId);
    if (newChannelId && creatorId() && newChannelId === creatorId()) await createRoom(guildId, userId);
  }

  // The owner's game changed (or only their status: then the name is the same and nothing happens)
  async function onPresence(guildId, userId) {
    const owned = [...rooms].filter(([, room]) => room.guildId === guildId && room.ownerId === userId);
    await Promise.all(owned.map(([channelId]) => scheduleRename(channelId)));
  }

  // A name the bot didn't ask for: someone renamed the room by hand, their choice wins
  function onChannelUpdate(channel) {
    const room = rooms.get(channel.id);
    if (!room || room.manual || room.knownNames.includes(channel.name)) return;
    room.manual = true;
    if (room.timer) clearTimer(room.timer);
    room.timer = null;
  }

  // Deleted by hand: nothing left to delete
  function onChannelDelete(channel) {
    forget(channel.id);
  }

  // At startup (and on each reconnection): no database, a room is a voice channel of the creator's category
  // with a member overwrite that allows Manage Channels, the owner. Fixed channels have none
  async function restore(guild) {
    const creator = guild.channels?.find((channel) => channel.id === creatorId());
    if (!creator) return;
    for (const member of guild.members ?? []) {
      if (!member.user.bot) names.set(member.user.id, displayName(member));
    }
    const bots = new Set((guild.members ?? []).filter((member) => member.user.bot).map((member) => member.user.id));
    // The rooms of this guild tracked before a reconnection: channels deleted meanwhile are forgotten
    for (const [channelId, room] of [...rooms]) {
      if (room.guildId === guild.id) forget(channelId);
    }
    for (const channel of guild.channels) {
      if (channel.type !== VOICE || channel.id === creator.id) continue;
      if ((channel.parent_id ?? null) !== (creator.parent_id ?? null)) continue;
      const owner = channel.permission_overwrites?.find((overwrite) => overwrite.type === 1
        && (BigInt(overwrite.allow) & MANAGE_CHANNELS) === MANAGE_CHANNELS);
      if (!owner) continue;
      const members = (guild.voice_states ?? [])
        .filter((state) => state.channel_id === channel.id && !bots.has(state.user_id))
        .map((state) => state.user_id);
      track(channel.id, { guildId: guild.id, ownerId: owner.id, members, name: channel.name });
      if (members.length === 0) await deleteRoom(channel.id);
      else if (!members.includes(owner.id)) await transfer(channel.id, rooms.get(channel.id));
      else await scheduleRename(channel.id);
    }
  }

  return {
    restore,
    onVoiceState,
    onPresence,
    onChannelUpdate,
    onChannelDelete,
    getRoom: (channelId) => rooms.get(channelId),
  };
}
