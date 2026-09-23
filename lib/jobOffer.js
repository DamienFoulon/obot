import { MessageComponentTypes } from 'discord-interactions';
import { parseColor } from '../utils.js';

// Components V2 container describing a job offer, shared by the validation and the public posts
export function jobOfferContainer(job, footer, extraComponents = []) {
  return {
    type: MessageComponentTypes.CONTAINER,
    accent_color: parseColor(process.env.OBOT_COLOR),
    components: [
      { type: MessageComponentTypes.TEXT_DISPLAY, content: `## ${job.title}\n-# Posted by <@${job.author}>` },
      { type: MessageComponentTypes.TEXT_DISPLAY, content: job.description },
      { type: MessageComponentTypes.SEPARATOR },
      {
        type: MessageComponentTypes.TEXT_DISPLAY,
        content: `**Remuneration**\n\`\`\`${job.remuneration}\`\`\`\n**Required skills**\n\`\`\`${job.requiredSkills}\`\`\``,
      },
      ...(footer ? [{ type: MessageComponentTypes.TEXT_DISPLAY, content: `-# ${footer}` }] : []),
      ...extraComponents,
    ],
  };
}
