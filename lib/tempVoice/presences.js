/**
 * The game each member plays, per guild: the temporary rooms are named after it
 * Filled by GUILD_CREATE and kept up to date by PRESENCE_UPDATE (the privileged Presence intent)
 * See https://docs.discord.com/developers/events/gateway-events#presence-update
 */

// Activity type 0 is "Playing"; listening, streaming and custom statuses are not games
const PLAYING = 0;

// "guildId:userId" -> game
const games = new Map();

export function updatePresence(presence) {
  if (!presence.guild_id || !presence.user?.id) return;
  const key = `${presence.guild_id}:${presence.user.id}`;
  const game = presence.activities?.find((activity) => activity.type === PLAYING)?.name;
  if (game) games.set(key, game);
  else games.delete(key);
}

// The presences of GUILD_CREATE have no guild_id
export function setGuildPresences(guild) {
  for (const presence of guild.presences ?? []) updatePresence({ ...presence, guild_id: guild.id });
}

export function getGame(guildId, userId) {
  return games.get(`${guildId}:${userId}`) ?? null;
}

// For the tests
export function clearPresences() {
  games.clear();
}
