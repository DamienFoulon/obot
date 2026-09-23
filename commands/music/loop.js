import { CommandTypes, Contexts, IntegrationTypes } from '../../constants.js';
import { controlMusicReply } from '../../lib/music/control.js';

export const data = {
  name: 'loop',
  description: 'Loop on the current track or on the whole queue',
  type: CommandTypes.CHAT_INPUT,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
  options: [
    {
      type: 3, // STRING
      name: 'mode',
      description: 'What to loop on',
      required: true,
      choices: [
        { name: 'Off', value: 'off' },
        { name: 'Current track', value: 'track' },
        { name: 'Whole queue', value: 'queue' },
      ],
    },
  ],
};

export async function execute(interaction, res) {
  const mode = interaction.data.options.find((option) => option.name === 'mode').value;
  return res.send(controlMusicReply(interaction, (player) => {
    player.setLoop(mode);
    return `🔁 Loop: ${mode}`;
  }));
}
