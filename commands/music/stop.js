import { CommandTypes, Contexts, IntegrationTypes } from '../../constants.js';
import { controlMusicReply } from '../../lib/music/control.js';

export const data = {
  name: 'stop',
  description: 'Stop the music, clear the queue and leave the voice channel',
  type: CommandTypes.CHAT_INPUT,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
};

export async function execute(interaction, res) {
  return res.send(controlMusicReply(interaction, (player) => {
    player.stop();
    return '⏹️ Stopped, see you 👋';
  }));
}
