import { tempVoice } from '../../lib/tempVoice/index.js';
import { updatePresence } from '../../lib/tempVoice/presences.js';

export const name = 'PRESENCE_UPDATE';

// A member starts, changes or stops a game: their room follows
export async function execute(presence) {
  updatePresence(presence);
  if (presence.guild_id && presence.user?.id) await tempVoice.onPresence(presence.guild_id, presence.user.id);
}
