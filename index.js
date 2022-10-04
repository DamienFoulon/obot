const { Client, GatewayIntentBits, Collection } = require('discord.js');

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// Load all commands
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandsFolders = fs.readdirSync(commandsPath);
for (const folder of commandsFolders) {
    const commandFiles = fs.readdirSync(path.join(commandsPath, folder)).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        console.log(`Loading command ${file} from ${folder} folder...`);
        try {
            const filePath = path.join(commandsPath, folder, file);
            const command = require(filePath);
            client.commands.set(command.data.name, command);
            console.log(`Command ${file} from ${folder} folder loaded ! 🟢`);
        } catch (error) {
            console.log(`Error while loading command ${file} from ${folder} folder ! 🟠 `);
            console.log(error);
        }
    }
}

// Load all events
client.events = new Collection();

const eventsPath = path.join(__dirname, 'events');
const eventsFolders = fs.readdirSync(eventsPath);
for (const folder of eventsFolders) {
    const eventFiles = fs.readdirSync(path.join(eventsPath, folder)).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        console.log(`Loading event ${file} from ${folder} folder...`);
        try {
            const filePath = path.join(eventsPath, folder, file);
            const event = require(filePath);
            if(event.once) {
                client.once(event.name, (...args) => event.execute(...args, client));
            } else {
                client.on(event.name, (...args) => event.execute(...args, client));
            }
        } catch (error) {
            console.log(error);
        }
    }
}

// Load all components
client.components = new Collection();

const componentsPath = path.join(__dirname, 'components');
const componentsFolders = fs.readdirSync(componentsPath);
for (const folders of componentsFolders) {
    const componentsSubPath = path.join(componentsPath, folders);
    const componentsSubFolders = fs.readdirSync(componentsSubPath);
    for (const folder of componentsSubFolders) {
        const componentsFiles = fs.readdirSync(path.join(componentsSubPath, folder)).filter(file => file.endsWith('.js'));
        for (const file of componentsFiles) {
            console.log(`Loading component ${file} from ${folder} folder...`);
            try {
                const filePath = path.join(componentsSubPath, folder, file);
                const component = require(filePath);
                client.components.set(component.name, component);
                console.log(`Component ${file} from ${folder} folder loaded ! 🟢`);
            } catch (error) {
                console.log(`Error while loading component ${file} from ${folder} folder ! 🟠 `);
                console.log(error);
            }
        }
    }
}

client.on('interactionCreate', async interaction => {
    // Handling Commands
    if (interaction.isChatInputCommand) {
        const command = interaction.client.commands.get(interaction.commandName);

        if(command) {
            try {
                await command.execute(interaction);
            } catch (error) {
                console.log(error);
                await interaction.reply({ content: 'Ooops... ! I felt into the stairs 🤕 Can you please try again ?', ephemeral: true });
            }
        } else {
            return
        }
    } else if (interaction.isButton) {
        const button = interaction.client.components.get(interaction.customId);

        if(button) {
            try {
                await button.execute(interaction);
            } catch (error) {
                console.log(error);
                await interaction.reply({ content: 'Ooops... ! I felt into the stairs 🤕 Can you please try again ?', ephemeral: true });
            }
        }
    } else if (interaction.isSelectMenu) {
        const selectMenu = interaction.client.components.get(interaction.customId);

        if(selectMenu) {
            try {
                await selectMenu.execute(interaction);
            } catch (error) {
                console.log(error);
                await interaction.reply({ content: 'Ooops... ! I felt into the stairs 🤕 Can you please try again ?', ephemeral: true });
            }
        }
    } else if (interaction.isModalSubmit) {
        const modal = interaction.client.components.get(interaction.customId);

        if(modal) {
            try {
                await modal.execute(interaction);
            } catch (error) {
                console.log(error);
                await interaction.reply({ content: 'Ooops... ! I felt into the stairs 🤕 Can you please try again ?', ephemeral: true });
            }
        }
    } else if (interaction.isContextMenuCommand) {
        const contextMenu = interaction.client.components.get(interaction.customId);

        if(contextMenu) {
            try {
                await contextMenu.execute(interaction);
            } catch (error) {
                console.log(error);
                await interaction.reply({ content: 'Ooops... ! I felt into the stairs 🤕 Can you please try again ?', ephemeral: true });
            }
        }
    } 
    
    else {
        return
    }
});

client.login(process.env.TOKEN);