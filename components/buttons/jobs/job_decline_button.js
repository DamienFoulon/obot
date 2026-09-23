import { getDatabase } from '../../../database.js';
import { addReaction, replyAfter, sendDM } from '../../../utils.js';

export const customId = 'job_decline_button';

export async function execute(interaction, res) {
  const { message } = interaction;
  const validator = interaction.member.user;

  await replyAfter(interaction, res, async () => {
    const [jobs] = await getDatabase().execute('SELECT author FROM jobs WHERE id = ?', [message.id]);
    const job = jobs[0];
    if (!job) return `The ticket disappeared from my ticket's box 😭`;

    await getDatabase().execute('DELETE FROM jobs WHERE id = ?', [message.id]);
    await sendDM(job.author, `Hey <@${job.author}> 👋\nYour job offer was declined by <@${validator.id}> ! 😢`);
    await addReaction(message.channel_id, message.id, '🗑️');
    return 'The job offer was successfully deleted from the database ! 🗑️';
  });
}
