import { InteractionResponseType, MessageComponentTypes, TextStyleTypes } from 'discord-interactions';
import { CommandTypes, Contexts, IntegrationTypes, Permissions } from '../../constants.js';

export const data = {
  name: 'announcement',
  description: 'Announce something to the server!',
  type: CommandTypes.CHAT_INPUT,
  default_member_permissions: Permissions.MANAGE_MESSAGES,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
  options: [
    {
      type: 7, // CHANNEL
      name: 'channel',
      description: 'The channel to announce in',
      channel_types: [0, 5], // GUILD_TEXT, GUILD_ANNOUNCEMENT
      required: true,
    },
  ],
};

export async function execute(interaction, res) {
  const channelId = interaction.data.options.find((option) => option.name === 'channel').value;

  return res.send({
    type: InteractionResponseType.MODAL,
    data: {
      // The channel is carried by the custom_id, so the modal handler knows where to post
      custom_id: `announce_modal:${channelId}`,
      title: 'Announcement',
      components: [
        {
          type: MessageComponentTypes.LABEL,
          label: 'Title',
          component: { type: MessageComponentTypes.INPUT_TEXT, custom_id: 'title', style: TextStyleTypes.SHORT, max_length: 256 },
        },
        {
          type: MessageComponentTypes.LABEL,
          label: 'Content',
          component: { type: MessageComponentTypes.INPUT_TEXT, custom_id: 'content', style: TextStyleTypes.PARAGRAPH },
        },
        {
          type: MessageComponentTypes.LABEL,
          label: 'Image URL',
          component: { type: MessageComponentTypes.INPUT_TEXT, custom_id: 'image', style: TextStyleTypes.SHORT, required: false },
        },
        {
          type: MessageComponentTypes.LABEL,
          label: 'Color',
          description: 'Hexadecimal color, e.g. #0193CF',
          component: { type: MessageComponentTypes.INPUT_TEXT, custom_id: 'color', style: TextStyleTypes.SHORT, required: false, max_length: 7 },
        },
      ],
    },
  });
}
