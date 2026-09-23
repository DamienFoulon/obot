import { CommandTypes, Contexts, IntegrationTypes } from '../../constants.js';
import { controlMusicReply } from '../../lib/music/control.js';

export const data = {
  name: 'pause',
  description: 'Pause the music',
  type: CommandTypes.CHAT_INPUT,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
};

export async function execute(interaction, res) {
  return res.send(controlMusicReply(interaction, (player) => (player.pause() ? '⏸️ Paused' : 'Nothing to pause 🤷')));
}
