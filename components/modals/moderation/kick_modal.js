import { Permissions } from '../../../constants.js';
import { getModerationError } from '../../../lib/moderation.js';
import { DiscordRequest, auditLogReason, getModalValues, parseCustomId, replyAfter } from '../../../utils.js';

export const customId = 'kick_modal';
export const requiredPermission = Permissions.KICK_MEMBERS;

export async function execute(interaction, res) {
  const [userId] = parseCustomId(interaction.data.custom_id).args;
  const { reason } = getModalValues(interaction.data.components);

  await replyAfter(interaction, res, async () => {
    const moderationError = await getModerationError(interaction, userId, 'kick');
    if (moderationError) return moderationError;

    await DiscordRequest(`guilds/${interaction.guild_id}/members/${userId}`, {
      method: 'DELETE',
      headers: auditLogReason(reason),
    });
    return `Pow ! The user <@${userId}> got kick for ${reason} reason. 🚪`;
  });
}
