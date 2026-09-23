import 'dotenv/config';
import { InstallCommands, loadModules } from './utils.js';

const ALL_COMMANDS = (await loadModules('commands')).map((command) => command.data);

// Without GUILD_ID, commands are installed globally (like Discord's official example app)
// With GUILD_ID, they are installed on that server only: handy while developing, as updates are instant
await InstallCommands(process.env.APP_ID, ALL_COMMANDS, process.env.GUILD_ID);

console.log(`Successfully registered ${ALL_COMMANDS.length} commands ${process.env.GUILD_ID ? `on the guild ${process.env.GUILD_ID}` : 'globally'} 🚀`);
