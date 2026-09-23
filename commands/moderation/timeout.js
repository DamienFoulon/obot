import { InteractionResponseType, MessageComponentTypes, TextStyleTypes } from 'discord-interactions';
import { CommandTypes, Contexts, IntegrationTypes, Permissions } from '../../constants.js';

// User command: right click on a member > Apps > Timeout
export const data = {
  name: 'Timeout',
  type: CommandTypes.USER,
  default_member_permissions: Permissions.MODERATE_MEMBERS,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
};

export async function execute(interaction, res) {
  return res.send({
    type: InteractionResponseType.MODAL,
    data: {
      // The targeted user is carried by the custom_id, so the modal handler knows who to timeout
      custom_id: `timeout_modal:${interaction.data.target_id}`,
      title: 'Timeout Form',
      components: [
        {
          type: MessageComponentTypes.LABEL,
          label: 'Reason',
          component: { type: MessageComponentTypes.INPUT_TEXT, custom_id: 'reason', style: TextStyleTypes.SHORT, max_length: 512 },
        },
        {
          type: MessageComponentTypes.LABEL,
          label: 'Duration (in seconds)',
          description: 'Up to 28 days. Leave empty to remove the timeout',
          component: { type: MessageComponentTypes.INPUT_TEXT, custom_id: 'duration', style: TextStyleTypes.SHORT, required: false },
        },
      ],
    },
  });
}
