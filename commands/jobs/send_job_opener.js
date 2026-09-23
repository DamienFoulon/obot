import { ButtonStyleTypes, InteractionResponseFlags, MessageComponentTypes } from 'discord-interactions';
import { CommandTypes, Contexts, IntegrationTypes, Permissions } from '../../constants.js';
import { parseColor, replyAfter, sendMessage } from '../../utils.js';

export const data = {
  name: 'send_job_opener',
  description: 'Send a job opener to the server!',
  type: CommandTypes.CHAT_INPUT,
  default_member_permissions: Permissions.ADMINISTRATOR,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
  options: [
    {
      type: 7, // CHANNEL
      name: 'channel',
      description: 'The channel to send the job opener in',
      channel_types: [0], // GUILD_TEXT
      required: true,
    },
  ],
};

export async function execute(interaction, res) {
  const channelId = interaction.data.options.find((option) => option.name === 'channel').value;

  const instructions = {
    type: MessageComponentTypes.TEXT_DISPLAY,
    content: [
      '## Job Opener',
      'You can create a job offer by following the instructions below!',
      `1️⃣ Click on the button 'Post a job offer'`,
      '2️⃣ Fill the form',
      '3️⃣ Wait for the staff validation',
      `4️⃣ Your job offer will be posted in the channel <#${process.env.JOB_CHANNEL_ID}>`,
    ].join('\n'),
  };

  await replyAfter(interaction, res, async () => {
    await sendMessage(channelId, {
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      components: [
        {
          type: MessageComponentTypes.CONTAINER,
          accent_color: parseColor(process.env.OBOT_COLOR),
          components: [
            // A section displays the logo next to the text, when there is one
            process.env.OBOT_LOGO_LINK
              ? {
                  type: MessageComponentTypes.SECTION,
                  components: [instructions],
                  accessory: { type: MessageComponentTypes.THUMBNAIL, media: { url: process.env.OBOT_LOGO_LINK } },
                }
              : instructions,
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.BUTTON,
                  style: ButtonStyleTypes.PRIMARY,
                  label: 'Post a job offer',
                  custom_id: 'job_opener_button',
                  emoji: { name: '📝' },
                },
              ],
            },
          ],
        },
      ],
    });
    return `Job opener sent in <#${channelId}>! 📨`;
  });
}
