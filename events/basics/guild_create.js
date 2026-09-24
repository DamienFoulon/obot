import { setupGuild } from '../../lib/coordinates/forum.js';
import { setGuildVoiceStates } from '../../lib/music/voiceStates.js';

export const name = 'GUILD_CREATE';

// Sent for each guild when the bot connects: who is in the voice channels, the channels and active threads
export async function execute(guild) {
  if (guild.unavailable) return;
  setGuildVoiceStates(guild);
  await setupGuild(guild);
}
