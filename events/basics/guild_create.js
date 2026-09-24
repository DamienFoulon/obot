import { setupGuild } from '../../lib/coordinates/forum.js';
import { setGuildVoiceStates } from '../../lib/music/voiceStates.js';
import { setupTempVoice } from '../../lib/tempVoice/index.js';

export const name = 'GUILD_CREATE';

// Sent for each guild when the bot connects: who is in the voice channels, the channels, active threads and presences
export async function execute(guild) {
  if (guild.unavailable) return;
  setGuildVoiceStates(guild);
  // First: its rooms must be tracked before the voice events that follow GUILD_CREATE are handled
  await setupTempVoice(guild);
  await setupGuild(guild);
}
