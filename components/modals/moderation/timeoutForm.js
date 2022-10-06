module.exports = {
    data: {
        name: `timeoutForm`,
    },
    async execute (interaction) {
        try {
            const timeoutReason = interaction.fields.getTextInputValue('timeoutFormReason');
            const timeoutDuration = parseInt(interaction.fields.getTextInputValue('timeoutFormDuration'));
            const timeoutUser = global.timeoutUser;
            timeoutUser.timeout( timeoutDuration*1000, timeoutReason );
            await interaction.reply({ content: `Pow ! The user ${timeoutUser.user} got timeout ${timeoutDuration}s for ${timeoutReason} reason. 🔫`, ephemeral: true });
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops! The user left my field of vision 👀 Please retry !', ephemeral: true });
        }
    }
}