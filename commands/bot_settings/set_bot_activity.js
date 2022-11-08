const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActivityType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_bot_activity')
        .setDescription('Set the bot activity')
        .addStringOption(option => option.setName('type')
            .setDescription('The type of activity')
            .setRequired(true)
            .addChoices(
                { name: 'Playing', value: 'Playing' },
                { name: 'Listening', value: 'Listening' },
                { name: 'Watching', value: 'Watching' }
            ))
        .addStringOption(option => option.setName('activity')
            .setDescription('The activity you want to set')
            .setRequired(true)),

    async execute(interaction) {
        const activity = interaction.options.getString('activity');
        const activityTypeSelected = interaction.options.getString('type');
        let activityType;
        switch (activityTypeSelected) {
            case 'Playing':
                activityType = ActivityType.Playing;
                break;
            case 'Listening':
                activityType = ActivityType.Listening;
                break;
            case 'Watching':
                activityType = ActivityType.Watching;
                break;
        }
        try {
            interaction.client.user.setActivity(activity, { type: activityType });
            await interaction.reply({ content: `I'm now ${activityTypeSelected} ${activity}`, ephemeral: true });
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops... ! I felt into the stairs 🤕 Can you please try again ?', ephemeral: true });
        }
    }
}