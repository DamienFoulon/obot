import { Permissions } from '../../../constants.js';
import { getModerationError } from '../../../lib/moderation.js';
import { DiscordRequest, auditLogReason, getModalValues, parseCustomId, replyAfter } from '../../../utils.js';

export const customId = 'timeout_modal';
export const requiredPermission = Permissions.MODERATE_MEMBERS;

// Discord does not allow a timeout longer than 28 days
const MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60;

export async function execute(interaction, res) {
  const [userId] = parseCustomId(interaction.data.custom_id).args;
  const { reason, duration } = getModalValues(interaction.data.components);
  const seconds = parseInt(duration);
  // An empty or invalid duration removes the timeout
  const removeTimeout = Number.isNaN(seconds) || seconds <= 0;

  await replyAfter(interaction, res, async () => {
    const moderationError = await getModerationError(interaction, userId, 'timeout');
    if (moderationError) return moderationError;

    const timeoutSeconds = Math.min(seconds, MAX_TIMEOUT_SECONDS);
    await DiscordRequest(`guilds/${interaction.guild_id}/members/${userId}`, {
      method: 'PATCH',
      headers: auditLogReason(reason),
      body: {
        communication_disabled_until: removeTimeout ? null : new Date(Date.now() + timeoutSeconds * 1000).toISOString(),
      },
    });
    return removeTimeout
      ? `The user <@${userId}> is free to talk again. 🕊️`
      : `Pow ! The user <@${userId}> got timeout ${timeoutSeconds}s for ${reason} reason. 🔫`;
  });
}
