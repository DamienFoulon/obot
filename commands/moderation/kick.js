import { InteractionResponseType, MessageComponentTypes, TextStyleTypes } from 'discord-interactions';
import { CommandTypes, Contexts, IntegrationTypes, Permissions } from '../../constants.js';

// User command: right click on a member > Apps > Kick
export const data = {
  name: 'Kick',
  type: CommandTypes.USER,
  default_member_permissions: Permissions.KICK_MEMBERS,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
};

export async function execute(interaction, res) {
  return res.send({
    type: InteractionResponseType.MODAL,
    data: {
      // The targeted user is carried by the custom_id, so the modal handler knows who to kick
      custom_id: `kick_modal:${interaction.data.target_id}`,
      title: 'Kick Form',
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
