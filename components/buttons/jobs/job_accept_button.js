import { ButtonStyleTypes, InteractionResponseFlags, MessageComponentTypes } from 'discord-interactions';
import { getDatabase } from '../../../database.js';
import { jobOfferContainer } from '../../../lib/jobOffer.js';
import { addReaction, replyAfter, sendDM, sendMessage } from '../../../utils.js';

export const customId = 'job_accept_button';

export async function execute(interaction, res) {
  const { message } = interaction;
  const validator = interaction.member.user;

  await replyAfter(interaction, res, async () => {
    const [jobs] = await getDatabase().execute('SELECT * FROM jobs WHERE id = ?', [message.id]);
    const job = jobs[0];
    if (!job) return `The ticket disappeared from my ticket's box 😭`;

    await sendMessage(process.env.JOB_CHANNEL_ID, {
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      allowed_mentions: { parse: [] },
      components: [
        jobOfferContainer(job, `The job was validated by ${validator.username}`, [
          {
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              { type: MessageComponentTypes.BUTTON, style: ButtonStyleTypes.LINK, label: 'Reply', url: `https://discord.com/users/${job.author}`, emoji: { name: '📨' } },
            ],
          },
        ]),
      ],
    });

    await sendDM(job.author, `Hey <@${job.author}> 👋\nYour job offer was approved by <@${validator.id}> ! 🎉`);
    await addReaction(message.channel_id, message.id, '✅');
    return 'Beep boop ! The job offer has been successfully validated ! 🤖';
  });
}
