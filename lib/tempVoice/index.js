import { checkCreatorPermissions, discordApi } from './discord.js';
import { getGame, setGuildPresences } from './presences.js';
import { createRoomRegistry } from './rooms.js';

const creatorId = () => process.env.TEMP_VOICE_CREATOR_ID;

export const tempVoice = createRoomRegistry({ api: discordApi, creatorId, getGame });

// GUILD_CREATE: who plays what, then the rooms left by the previous run
export async function setupTempVoice(guild) {
  setGuildPresences(guild);
  if (!creatorId() || !guild.channels?.some((channel) => channel.id === creatorId())) return;
  // Called before any await: the rooms are tracked before the next voice events are handled
  const restoring = tempVoice.restore(guild);
  await checkCreatorPermissions(guild.id, creatorId());
  await restoring;
}
