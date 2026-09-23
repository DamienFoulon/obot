import { InteractionResponseType, MessageComponentTypes, TextStyleTypes } from 'discord-interactions';
import { CommandTypes, Contexts, IntegrationTypes, Permissions } from '../../constants.js';

// User command: right click on a member > Apps > Ban
export const data = {
  name: 'Ban',
  type: CommandTypes.USER,
  default_member_permissions: Permissions.BAN_MEMBERS,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
};

export async function execute(interaction, res) {
  return res.send({
    type: InteractionResponseType.MODAL,
    data: {
      // The targeted user is carried by the custom_id, so the modal handler knows who to ban
      custom_id: `ban_modal:${interaction.data.target_id}`,
      title: 'Ban Form',
      components: [
        {
          type: MessageComponentTypes.LABEL,
          label: 'Reason',
          component: { type: MessageComponentTypes.INPUT_TEXT, custom_id: 'reason', style: TextStyleTypes.SHORT, max_length: 512 },
        },
        {
          type: MessageComponentTypes.LABEL,
          label: 'Delete message history (in days)',
          description: 'Messages sent by the user during the last N days (0 to 7) will be deleted',
          component: { type: MessageComponentTypes.INPUT_TEXT, custom_id: 'delete_messages_days', style: TextStyleTypes.SHORT, required: false, placeholder: '0', max_length: 1 },
        },
      ],
    },
  });
}
