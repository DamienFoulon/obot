
![Logo](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/th5xamgrr6se0x5ro4g6.png)


# Obot Base Discord Bot (v14.5.0)

Here is a clean v14 discord bot base, you can use it to build your
bot 🤖


## Features

- Commands Handling
- Events Handling
- Component Handling
- Commands Deployments


## Installation

Install my-project with npm

```bash
  git clone https://github.com/DamienFoulon/base_discord_bot_v14
  npm install
  touch .env
```



## Environment Variables

To run this project, you will need to add the following environment variables to your .env file

`TOKEN`
`CLIENT_ID`
`GUILD_ID`

And here you are ! 🎉
## Configuration
### Setup Commands
To setup commands, you had to go into `/commands` folder.
Then create a folder which will contains your command. 

E.G:
```bash
commands
├───general
└───moderation
    └─── ban.js
```

*This file file tree structure will permit you to create a lot of command
and find them easely 😁*

Now, there is a command file example : 
```js
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('command-name')
        .setDescription('command-description'),
    async execute(interaction) {
        try {
            await interaction.reply({ content: 'Command reply', ephemeral: true });
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops... ! I felt into the stairs 🤕 Can you please try again ?', ephemeral: true });
        }
    }
}
```

### Setup Events
Same as command's setup, you'll had to go into the `events` folder and create a sub-folder.

E.G:
```bash
commands
├───guild
└───members
    └─── guildMemberAdd.js
```

Here is an example of event file :

```js
module.exports = {
	name: 'guildMemberAdd',
	execute(interaction) {
        console.log(`User : ${interaction.user} joined the server 🛬`);
	},
};
```

### Setup Component
We'll take the example of creating a button but, it'll be the same for all components so dw 😖

So we had to go into `components/buttons` folder and create a subfolder.

E.G:
```bash
components
├───modals
└───buttons
    └─── switch-button.js
```

To get files examples, let's check the [Discord.js Guide](https://discordjs.guide/#before-you-begin)
## Authors

- [@DamienFoulon](https://www.github.com/DamienFoulon)