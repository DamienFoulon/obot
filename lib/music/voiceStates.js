/**
 * Who is in which voice channel, per guild: to join the channel of a member, and to leave when nobody listens
 * Filled by GUILD_CREATE and kept up to date by VOICE_STATE_UPDATE
 * See https://docs.discord.com/developers/resources/voice#voice-state-object
 */

// guildId -> Map(userId -> { channelId, bot })
const guilds = new Map();

// The voice states of GUILD_CREATE have no member: the bot flag comes from the members list
export function setGuildVoiceStates(guild) {
  const states = new Map();
  for (const state of guild.voice_states ?? []) {
    const member = guild.members?.find((m) => m.user.id === state.user_id);
    states.set(state.user_id, { channelId: state.channel_id, bot: Boolean(member?.user.bot) });
  }
  guilds.set(guild.id, states);
}

export function updateVoiceState(state) {
  if (!state.guild_id) return;
  if (!guilds.has(state.guild_id)) guilds.set(state.guild_id, new Map());
  const states = guilds.get(state.guild_id);
  // A null channel means the user left the voice channels of the guild
  if (state.channel_id) states.set(state.user_id, { channelId: state.channel_id, bot: Boolean(state.member?.user.bot) });
  else states.delete(state.user_id);
}

export function getUserChannel(guildId, userId) {
  return guilds.get(guildId)?.get(userId)?.channelId ?? null;
}

// A bot user has the same id as its application
export function getBotChannel(guildId) {
  return getUserChannel(guildId, process.env.APP_ID);
}

export function countHumans(guildId, channelId) {
  let count = 0;
  for (const state of guilds.get(guildId)?.values() ?? []) {
    if (state.channelId === channelId && !state.bot) count++;
  }
  return count;
}

// For the tests
export function clearVoiceStates() {
  guilds.clear();
}
