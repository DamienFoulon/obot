import { createNowPlaying } from './nowPlaying.js';
import { Player } from './player.js';
import { connectVoiceEngine } from './voiceEngine.js';
import { countHumans, getBotChannel } from './voiceStates.js';

// One player per guild. `connect` and `createUi` are given, so the tests can replace them
export function createPlayerRegistry({ connect, createUi }) {
  const players = new Map();
  // Connections in progress: two /play at the same time must not join twice
  const joining = new Map();

  function getPlayer(guildId) {
    return players.get(guildId) ?? null;
  }

  function getOrCreatePlayer({ guildId, channelId, textChannelId }) {
    if (players.has(guildId)) return Promise.resolve(players.get(guildId));
    if (!joining.has(guildId)) {
      joining.set(guildId, (async () => {
        try {
          const engine = await connect({ guildId, channelId });
          const player = new Player({ engine, ui: createUi(textChannelId), onDestroy: () => players.delete(guildId) });
          players.set(guildId, player);
          return player;
        } finally {
          joining.delete(guildId);
        }
      })());
    }
    return joining.get(guildId);
  }

  return { getPlayer, getOrCreatePlayer };
}

export const { getPlayer, getOrCreatePlayer } = createPlayerRegistry({ connect: connectVoiceEngine, createUi: createNowPlaying });

// On every voice change of the guild: leave when nobody listens anymore
export function checkListeners(guildId) {
  const player = getPlayer(guildId);
  const channelId = getBotChannel(guildId);
  if (player && channelId) player.setAlone(countHumans(guildId, channelId) === 0);
}
