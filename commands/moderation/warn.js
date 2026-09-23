import { InteractionResponseType, MessageComponentTypes, TextStyleTypes } from 'discord-interactions';
import { CommandTypes, Contexts, IntegrationTypes, Permissions } from '../../constants.js';

// User command: right click on a member > Apps > Warn
export const data = {
  name: 'Warn',
  type: CommandTypes.USER,
  default_member_permissions: Permissions.MODERATE_MEMBERS,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
};

export async function execute(interaction, res) {
  return res.send({
    type: InteractionResponseType.MODAL,
    data: {
      // The targeted user is carried by the custom_id, so the modal handler knows who to warn
      custom_id: `warn_modal:${interaction.data.target_id}`,
      title: 'Warn Form',
      components: [
        {
          type: MessageComponentTypes.LABEL,
          label: 'Reason',
          component: { type: MessageComponentTypes.INPUT_TEXT, custom_id: 'reason', style: TextStyleTypes.SHORT, max_length: 512 },
        },
      ],
    },
  });
}
