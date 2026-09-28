import { CommandTypes, Contexts, IntegrationTypes } from '../../constants.js';
import { litter } from '../../lib/litter/index.js';
import { replyAfter } from '../../utils.js';

// User command: right click on a member > Apps > Litière 💩
// No default_member_permissions: everybody can open a vote, administrators act directly (checked in the handler)
export const data = {
  name: 'Litière 💩',
  type: CommandTypes.USER,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
};

// Several Discord calls: deferred, ephemeral
export async function execute(interaction, res) {
  await replyAfter(interaction, res, () => litter.command(interaction));
}
