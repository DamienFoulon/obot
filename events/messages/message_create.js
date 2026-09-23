import { isInSlowMode } from '../../lib/slowMode.js';
import { DiscordRequest, auditLogReason, sendMessage } from '../../utils.js';

export const name = 'MESSAGE_CREATE';

const SLOW_MODE_SECONDS = 30;

export async function execute(message) {
  if (!message.guild_id || message.author.bot || !isInSlowMode(message.author.id)) return;

  await DiscordRequest(`guilds/${message.guild_id}/members/${message.author.id}`, {
    method: 'PATCH',
    headers: auditLogReason('SlowMode'),
    body: { communication_disabled_until: new Date(Date.now() + SLOW_MODE_SECONDS * 1000).toISOString() },
  });
  await sendMessage(message.channel_id, {
    content: `You're a slowed user ! 🐢 You have to wait ${SLOW_MODE_SECONDS}s until your next message`,
    message_reference: { message_id: message.id, fail_if_not_exists: false },
  });
}
