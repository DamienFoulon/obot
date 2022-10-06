module.exports = {
    data: {
        name: `kickForm`,
    },
    async execute (interaction) {
        try {
            const kickReason = interaction.fields.getTextInputValue('kickFormReason');
            const kickUser = global.kickUser;
            kickUser.kick({ reason: kickReason});
            await interaction.reply({ content: `Pow ! The user ${kickUser.user} got kick for ${kickReason} reason. 🚪`, ephemeral: true });
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops! The user left my field of vision 👀 Please retry !', ephemeral: true });
        }
    }
}