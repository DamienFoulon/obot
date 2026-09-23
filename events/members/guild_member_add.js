import { sendMessage } from '../../utils.js';

export const name = 'GUILD_MEMBER_ADD';

export async function execute(member) {
  console.log(`${member.user.username} joined the server ! 🎉`);
  if (!process.env.WELCOME_CHANNEL_ID || !process.env.WELCOME_PUBLIC_MESSAGE) return;
  // "{user}" in the message is replaced by a mention of the new member
  await sendMessage(process.env.WELCOME_CHANNEL_ID, {
    content: process.env.WELCOME_PUBLIC_MESSAGE.replaceAll('{user}', `<@${member.user.id}>`),
  });
}
