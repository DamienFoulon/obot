import { CommandTypes, Contexts, IntegrationTypes } from '../../constants.js';
import { ephemeralReply } from '../../utils.js';

export const data = {
  name: 'obot',
  description: "Get the Obot's informations",
  type: CommandTypes.CHAT_INPUT,
  // Available when installed on a server or on a user account, everywhere
  integration_types: [IntegrationTypes.GUILD_INSTALL, IntegrationTypes.USER_INSTALL],
  contexts: [Contexts.GUILD, Contexts.BOT_DM, Contexts.PRIVATE_CHANNEL],
};

export async function execute(interaction, res) {
  return res.send(ephemeralReply('Obot is a bot made by @Yaguaa 🤖'));
}
