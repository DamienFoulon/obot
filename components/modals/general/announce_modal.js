import { MessageComponentTypes, InteractionResponseFlags } from 'discord-interactions';
import { getModalValues, parseColor, parseCustomId, replyAfter, sendMessage } from '../../../utils.js';

export const customId = 'announce_modal';

export async function execute(interaction, res) {
  const [channelId] = parseCustomId(interaction.data.custom_id).args;
  const { title, content, image, color } = getModalValues(interaction.data.components);

  await replyAfter(interaction, res, async () => {
    // Components V2 message: the container replaces the old embed
    // See https://docs.discord.com/developers/components/reference#container
    await sendMessage(channelId, {
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      components: [
        {
          type: MessageComponentTypes.CONTAINER,
          accent_color: parseColor(color),
          components: [
            { type: MessageComponentTypes.TEXT_DISPLAY, content: `## ${title}` },
            { type: MessageComponentTypes.TEXT_DISPLAY, content },
            ...(image
              ? [{ type: MessageComponentTypes.MEDIA_GALLERY, items: [{ media: { url: image } }] }]
              : []),
          ],
        },
      ],
    });
    return `Announcement sent successfully in <#${channelId}> ! 📢`;
  });
}
