import { InteractionResponseType, MessageComponentTypes, TextStyleTypes } from 'discord-interactions';

export const customId = 'job_opener_button';

function textInput(label, custom_id, style, placeholder, required = true) {
  return {
    type: MessageComponentTypes.LABEL,
    label,
    component: { type: MessageComponentTypes.INPUT_TEXT, custom_id, style, placeholder, required },
  };
}

export async function execute(interaction, res) {
  return res.send({
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: 'job_opener_modal',
      title: 'Job Opener',
      components: [
        textInput('Job title', 'title', TextStyleTypes.SHORT, 'E.G: Backend developer for backoffice'),
        textInput('Job description', 'description', TextStyleTypes.PARAGRAPH, 'E.G: We are looking for a backend developer to work on our backoffice'),
        textInput('Job remuneration', 'remuneration', TextStyleTypes.SHORT, 'E.G: 2000€/month or 20€/hour 100€ or 0'),
        textInput('Job required skills', 'required_skills', TextStyleTypes.SHORT, 'E.G: NodeJS, Express, MongoDB, etc...', false),
      ],
    },
  });
}
