import { litter } from '../../lib/litter/index.js';
import { sendMessage } from '../../utils.js';

export const name = 'GUILD_MEMBER_ADD';

export async function execute(member) {
  console.log(`${member.user.username} joined the server ! 🎉`);
  // A member of the litter who left comes back in it
  await litter.enforce(member.guild_id, member);
  if (!process.env.WELCOME_CHANNEL_ID || !process.env.WELCOME_PUBLIC_MESSAGE) return;
  // "{user}" in the message is replaced by a mention of the new member
  await sendMessage(process.env.WELCOME_CHANNEL_ID, {
    content: process.env.WELCOME_PUBLIC_MESSAGE.replaceAll('{user}', `<@${member.user.id}>`),
  });
}
