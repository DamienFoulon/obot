import { CommandTypes, Contexts, IntegrationTypes } from '../../constants.js';
import { DiscordRequest, ephemeralReply } from '../../utils.js';

export const data = {
  name: 'obot',
  description: "Get the Obot's informations",
  type: CommandTypes.CHAT_INPUT,
  // Available when installed on a server or on a user account, everywhere
  integration_types: [IntegrationTypes.GUILD_INSTALL, IntegrationTypes.USER_INSTALL],
  contexts: [Contexts.GUILD, Contexts.BOT_DM, Contexts.PRIVATE_CHANNEL],
};

// The bot owner, fetched once from the application
// See https://docs.discord.com/developers/resources/application#get-current-application
let ownerIdPromise;

function getOwnerId() {
  ownerIdPromise ??= DiscordRequest('applications/@me')
    .then((res) => res.json())
    // When the app belongs to a team, "owner" is a fake user: take the team owner instead
    .then((application) => application.team?.owner_user_id ?? application.owner.id)
    .catch((err) => {
      ownerIdPromise = undefined; // try again on the next command
      throw err;
    });
  return ownerIdPromise;
}

export async function execute(interaction, res) {
  const ownerId = await getOwnerId();
  // "<@id>" is a clickable mention, allowed_mentions avoids pinging the owner
  const reply = ephemeralReply(`Obot is a bot made by <@${ownerId}> 🤖`);
  reply.data.allowed_mentions = { parse: [] };
  return res.send(reply);
}
