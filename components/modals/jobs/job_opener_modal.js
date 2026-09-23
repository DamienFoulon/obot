import { ButtonStyleTypes, InteractionResponseFlags, MessageComponentTypes } from 'discord-interactions';
import { getDatabase } from '../../../database.js';
import { jobOfferContainer } from '../../../lib/jobOffer.js';
import { getModalValues, replyAfter, sendDM, sendMessage } from '../../../utils.js';

export const customId = 'job_opener_modal';

export async function execute(interaction, res) {
  const values = getModalValues(interaction.data.components);
  const job = {
    title: values.title,
    description: values.description,
    remuneration: values.remuneration,
    requiredSkills: values.required_skills || 'None',
    author: interaction.member.user.id,
  };

  await replyAfter(interaction, res, async () => {
    const validationMessage = await sendMessage(process.env.JOB_VALIDATION_CHANNEL_ID, {
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      // Only display the mention, never ping anyone from a user-written offer
      allowed_mentions: { parse: [] },
      components: [
        jobOfferContainer(job, null, [
          {
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              { type: MessageComponentTypes.BUTTON, style: ButtonStyleTypes.SECONDARY, custom_id: 'job_accept_button', label: 'Accept', emoji: { name: '✅' } },
              { type: MessageComponentTypes.BUTTON, style: ButtonStyleTypes.SECONDARY, custom_id: 'job_decline_button', label: 'Decline', emoji: { name: '❌' } },
            ],
          },
        ]),
      ],
    });

    // The validation message id is the job id, so the buttons can find the job back
    await getDatabase().execute(
      'INSERT INTO jobs (id, title, description, remuneration, requiredSkills, author) VALUES (?, ?, ?, ?, ?, ?)',
      [validationMessage.id, job.title, job.description, job.remuneration, job.requiredSkills, job.author],
    );
    console.log(`The job was added to the database with the id ${validationMessage.id} ! 🚀`);

    await sendDM(job.author, `Hey <@${job.author}> 👋\nYour job offer was successfully sent to the validation channel ! 🚀\nWait for the staff to deliver their opinion ⏳`);
    return 'Your job offer has been sent to the validation channel ! 📨';
  });
}
