import { CommandTypes, Contexts, IntegrationTypes, Permissions } from '../../constants.js';
import { getModerationError } from '../../lib/moderation.js';
import { isInSlowMode, toggleSlowMode } from '../../lib/slowMode.js';
import { replyAfter } from '../../utils.js';

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
  const userId = interaction.data.target_id;

  await replyAfter(interaction, res, async () => {
    // The slow mode times the member out: check it is possible before enabling it (disabling is always fine)
    if (!isInSlowMode(userId)) {
      const moderationError = await getModerationError(interaction, userId, 'timeout');
      if (moderationError) return moderationError;
    }
    return toggleSlowMode(userId) ? 'The user got splashed with honey ! 🐢' : 'The user is suuuupaaafast now ! 🏃';
  });
}
