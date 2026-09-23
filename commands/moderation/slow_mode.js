import { CommandTypes, Contexts, IntegrationTypes, Permissions } from '../../constants.js';
import { toggleSlowMode } from '../../lib/slowMode.js';
import { ephemeralReply } from '../../utils.js';

// User command: right click on a member > Apps > SlowMode
export const data = {
  name: 'SlowMode',
  type: CommandTypes.USER,
  default_member_permissions: Permissions.MODERATE_MEMBERS,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
};

export const requiredPermission = Permissions.MODERATE_MEMBERS;

export async function execute(interaction, res) {
  const slowed = toggleSlowMode(interaction.data.target_id);
  return res.send(ephemeralReply(slowed ? 'The user got splashed with honey ! 🐢' : 'The user is suuuupaaafast now ! 🏃'));
}
