import { cleanWorldMessage } from '../../lib/coordinates/forum.js';
import { isInSlowMode, removeFromSlowMode } from '../../lib/slowMode.js';
import { DiscordRequest, auditLogReason, sendMessage } from '../../utils.js';

export const name = 'MESSAGE_CREATE';

const SLOW_MODE_SECONDS = 30;

export async function execute(message) {
  // In the coordinates forum, only the posts' original messages and the panels stay
  if (await cleanWorldMessage(message)) return;

  if (!message.guild_id || message.author.bot || !isInSlowMode(message.author.id)) return;

  try {
    await DiscordRequest(`guilds/${message.guild_id}/members/${message.author.id}`, {
      method: 'PATCH',
      headers: auditLogReason('SlowMode'),
      body: { communication_disabled_until: new Date(Date.now() + SLOW_MODE_SECONDS * 1000).toISOString() },
    });
  } catch (err) {
    // The member can't be timed out anymore (they became administrator, got a higher role...):
    // stop the slow mode instead of failing on each of their messages
    if (!err.message.includes('Discord API error 403')) throw err;
    removeFromSlowMode(message.author.id);
    console.log(`${message.author.username} can't be timed out anymore, slow mode removed 🐢`);
    return;
  }
  await sendMessage(message.channel_id, {
    content: `You're a slowed user ! 🐢 You have to wait ${SLOW_MODE_SECONDS}s until your next message`,
    message_reference: { message_id: message.id, fail_if_not_exists: false },
  });
}
