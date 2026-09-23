import { getModalValues, parseCustomId, replyAfter, sendDM } from '../../../utils.js';

export const customId = 'warn_modal';

export async function execute(interaction, res) {
  const [userId] = parseCustomId(interaction.data.custom_id).args;
  const { reason } = getModalValues(interaction.data.components);

  await replyAfter(interaction, res, async () => {
    const sent = await sendDM(
      userId,
      `Halt ! You got warned for ${reason} reason. 👮‍♂️ \nNo sanction will be applied for this one, but next time, you'll get one.`,
    );
    return sent
      ? `Pow ! The user <@${userId}> got warn for ${reason} reason. 🚨`
      : `The user <@${userId}> make me cat eyes 👀 Their DMs are closed, I can't warn them...`;
  });
}
