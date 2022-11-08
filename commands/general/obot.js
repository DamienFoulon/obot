const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('obot')
        .setDescription('Get the Obot\'s informations'),
    async execute(interaction) {
        try {
            await interaction.reply({ content: 'Obot is a bot made by @Yaguaa#1861', ephemeral: true });
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops... ! I felt into the stairs 🤕 Can you please try again ?', ephemeral: true });
        }
    }
}