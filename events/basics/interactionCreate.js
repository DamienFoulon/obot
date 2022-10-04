module.exports = {
	name: 'interactionCreate',
	execute(interaction) {
        console.log(interaction.isModalSubmit());
        if(interaction.isCommand()) {
            console.log(`${interaction.user.tag} in #${interaction.channel.name} triggered the ${interaction.commandName} command. 🤖`);
        }
        else {
            console.log(`${interaction.user.tag} in #${interaction.channel.name} triggered the ${interaction.customId} interaction. 🤖`);
        }
	},
};