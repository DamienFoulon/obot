module.exports = {
    data: {
        name: `warnForm`,
    },
    async execute (interaction) {
        try {
            const warnReason = interaction.fields.getTextInputValue('warnFormReason');
            const warnUser = global.warnUser;
            warnUser.send({ content: `Halt ! You got warned for ${warnReason} reason. 👮‍♂️ \nNo sanction will be applied for this one, but next time, you'll get one.`});
            await interaction.reply({ content: `Pow ! The user ${warnUser.user} got warn for ${warnReason} reason. 🚨`, ephemeral: true });
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops! The user left make me cat eyes 👀 I can\'t warn him... Please try again !', ephemeral: true });
        }
    }
}