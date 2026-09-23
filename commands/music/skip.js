import { CommandTypes, Contexts, IntegrationTypes } from '../../constants.js';
import { controlMusicReply } from '../../lib/music/control.js';
import { formatTrack } from '../../lib/music/format.js';

export const data = {
  name: 'skip',
  description: 'Skip the current track',
  type: CommandTypes.CHAT_INPUT,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
};

export async function execute(interaction, res) {
  return res.send(controlMusicReply(interaction, (player) => {
    const track = player.current;
    return player.skip() ? `⏭️ Skipped ${formatTrack(track)}` : 'Nothing to skip 🤷';
  }));
}
