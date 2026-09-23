import 'dotenv/config';
import express from 'express';
import { InteractionResponseType, InteractionType, verifyKeyMiddleware } from 'discord-interactions';
import { hasPermission } from './constants.js';
import { connectGateway } from './gateway.js';
import { checkYtDlp } from './lib/music/ytdlp.js';
import { ERROR_MESSAGE, ephemeralReply, loadModules, parseCustomId } from './utils.js';

// Slash commands and user commands, by command name
const commands = new Map((await loadModules('commands')).map((command) => [command.data.name, command]));
// Buttons and modals, by the first part of their custom_id ("ban_modal:<userId>" -> "ban_modal")
const components = new Map((await loadModules('components')).map((component) => [component.customId, component]));

console.log(`Loaded ${commands.size} commands and ${components.size} components 🟢`);

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;

function getHandler(interaction) {
  switch (interaction.type) {
    case InteractionType.APPLICATION_COMMAND:
      return commands.get(interaction.data.name);
    case InteractionType.MESSAGE_COMPONENT:
    case InteractionType.MODAL_SUBMIT:
      return components.get(parseCustomId(interaction.data.custom_id).name);
  }
}

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const interaction = req.body;

  /**
   * Handle verification requests
   */
  if (interaction.type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  const handler = getHandler(interaction);
  if (!handler) {
    console.error('unknown interaction', interaction.type, interaction.data?.name ?? interaction.data?.custom_id);
    return res.status(400).json({ error: 'unknown interaction' });
  }

  // default_member_permissions only hides commands by default (server admins can change it),
  // and a component custom_id carries its target: always check the permission server side
  if (handler.requiredPermission && !hasPermission(interaction, handler.requiredPermission)) {
    return res.send(ephemeralReply("You don't have the permission to do that 👮"));
  }

  const user = interaction.member?.user ?? interaction.user;
  console.log(`${user.username} triggered ${interaction.data.name ?? interaction.data.custom_id} 🤖`);

  try {
    await handler.execute(interaction, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.send(ephemeralReply(ERROR_MESSAGE));
  }
});

// Without yt-dlp, the music commands say so and the rest of the bot works
await checkYtDlp();

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});

// Gateway connection for server events and the bot activity (see gateway.js)
await connectGateway();
