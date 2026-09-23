import { setGuildVoiceStates } from '../../lib/music/voiceStates.js';

export const name = 'GUILD_CREATE';

// Sent for each guild when the bot connects: it gives who is already in the voice channels
export async function execute(guild) {
  if (guild.unavailable) return;
  setGuildVoiceStates(guild);
}
