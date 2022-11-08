module.exports = {
    data: {
        name: `banForm`,
    },
    async execute (interaction) {
        try {
            const banReason = interaction.fields.getTextInputValue('banFormReason');
            const banDuration = parseInt(interaction.fields.getTextInputValue('banFormDuration'));
            const banUser = global.banUser;
            banUser.ban({ reason: banReason, days: banDuration });
            await interaction.reply({ content: `Pow ! The user ${banUser.user} got banned ${banDuration} days for ${banReason} reason. 🔫`, ephemeral: true });
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops! The user left my field of vision 👀 Please retry !', ephemeral: true });
        }
    }
}