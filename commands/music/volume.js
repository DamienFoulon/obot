import { CommandTypes, Contexts, IntegrationTypes } from '../../constants.js';
import { controlMusicReply } from '../../lib/music/control.js';

export const data = {
  name: 'volume',
  description: 'Change the music volume',
  type: CommandTypes.CHAT_INPUT,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
  options: [
    {
      type: 4, // INTEGER
      name: 'level',
      description: 'Volume in percent, 100 by default',
      required: true,
      min_value: 0,
      max_value: 150,
    },
  ],
};

export async function execute(interaction, res) {
  const level = interaction.data.options.find((option) => option.name === 'level').value;
  return res.send(controlMusicReply(interaction, (player) => {
    player.setVolume(level);
    return `🔊 Volume set to ${level}%`;
  }));
}
