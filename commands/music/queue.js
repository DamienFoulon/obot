import { CommandTypes, Contexts, IntegrationTypes } from '../../constants.js';
import { formatQueue } from '../../lib/music/format.js';
import { getPlayer } from '../../lib/music/players.js';
import { ephemeralReply } from '../../utils.js';

export const data = {
  name: 'queue',
  description: 'Show the tracks in the queue',
  type: CommandTypes.CHAT_INPUT,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
};

// Readable from anywhere in the server: it changes nothing
export async function execute(interaction, res) {
  const player = getPlayer(interaction.guild_id);
  return res.send(ephemeralReply(player ? formatQueue(player.state) : 'The queue is empty 🔇'));
}
