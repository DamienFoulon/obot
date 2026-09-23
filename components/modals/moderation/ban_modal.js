import { Permissions } from '../../../constants.js';
import { DiscordRequest, auditLogReason, getModalValues, parseCustomId, replyAfter } from '../../../utils.js';

export const customId = 'ban_modal';
export const requiredPermission = Permissions.BAN_MEMBERS;

export async function execute(interaction, res) {
  const [userId] = parseCustomId(interaction.data.custom_id).args;
  const { reason, delete_messages_days } = getModalValues(interaction.data.components);
  const days = Math.min(Math.max(parseInt(delete_messages_days) || 0, 0), 7);

  await replyAfter(interaction, res, async () => {
    await DiscordRequest(`guilds/${interaction.guild_id}/bans/${userId}`, {
      method: 'PUT',
      headers: auditLogReason(reason),
      body: { delete_message_seconds: days * 24 * 60 * 60 },
    });
    return `Pow ! The user <@${userId}> got banned for ${reason} reason (${days} days of messages deleted). 🔫`;
  });
}
