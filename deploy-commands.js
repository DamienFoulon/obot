const { REST, Routes } = require('discord.js');

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

const commands = [];

const rest = new REST({ version: '10'}).setToken(process.env.TOKEN);

const commandsPath = path.join(__dirname, 'commands');
const commandsFolders = fs.readdirSync(commandsPath);
for (const folder of commandsFolders) {
    const commandFiles = fs.readdirSync(path.join(commandsPath, folder)).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        console.log(`Loading command ${file} from ${folder} folder...`);
        try {
            const filePath = path.join(commandsPath, folder, file);
            const command = require(filePath);
            commands.push(command.data.toJSON());
            console.log(`Command ${file} from ${folder} folder loaded ! 🟢`);
        } catch (error) {
            console.log(`Error while loading command ${file} from ${folder} folder ! 🟠 `);
            console.log(error);
        }
    }
}

rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands })
    .then(data => console.log(`Successfully registered ${data.length} commands.`))
    .catch(console.error);