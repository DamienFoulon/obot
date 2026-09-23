import { CommandTypes, Contexts, IntegrationTypes, Permissions } from '../../constants.js';
import { ActivityTypes, setActivity } from '../../gateway.js';
import { replyAfter } from '../../utils.js';

export const data = {
  name: 'set_bot_activity',
  description: 'Set the bot activity',
  type: CommandTypes.CHAT_INPUT,
  default_member_permissions: Permissions.MANAGE_GUILD,
  integration_types: [IntegrationTypes.GUILD_INSTALL],
  contexts: [Contexts.GUILD],
  options: [
    {
      type: 3, // STRING
      name: 'type',
      description: 'The type of activity',
      required: true,
      choices: Object.keys(ActivityTypes).map((type) => ({ name: type, value: type })),
    },
    {
      type: 3, // STRING
      name: 'activity',
      description: 'The activity you want to set',
      required: true,
      max_length: 128,
    },
  ],
};

export const requiredPermission = Permissions.MANAGE_GUILD;

export async function execute(interaction, res) {
  const option = (name) => interaction.data.options.find((opt) => opt.name === name).value;
  const type = option('type');
  const activity = option('activity');

  await replyAfter(interaction, res, async () => {
    await setActivity(activity, ActivityTypes[type]);
    return `I'm now ${type} ${activity}`;
  });
}
