import { sendMessage } from '../../utils.js';

export const name = 'GUILD_MEMBER_REMOVE';

export async function execute({ user }) {
  console.log(`${user.username} left the server ! 😭`);
  if (!process.env.LEAVE_CHANNEL_ID || !process.env.LEAVE_PUBLIC_MESSAGE) return;
  // The member already left: "{user}" is replaced by their name, a mention would not resolve
  await sendMessage(process.env.LEAVE_CHANNEL_ID, {
    content: process.env.LEAVE_PUBLIC_MESSAGE.replaceAll('{user}', user.username),
  });
}
