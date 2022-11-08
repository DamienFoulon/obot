const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Ban')
        .setType(ApplicationCommandType.User)
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction) {
        try {
            global.banUser = interaction.targetMember;
            const banForm = new ModalBuilder()
                .setCustomId('banForm')
                .setTitle('Ban Form')

            const reasonInput = new TextInputBuilder()
                .setCustomId('banFormReason')
                .setLabel('Reason')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const durationInput = new TextInputBuilder()
                .setCustomId('banFormDuration')
                .setLabel('Duration (in days)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const reasonComponent = new ActionRowBuilder().addComponents(reasonInput);
            const durationComponent = new ActionRowBuilder().addComponents(durationInput);

            banForm.addComponents(reasonComponent, durationComponent);


            await interaction.showModal(banForm);
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops! The user left my field of vision 👀 Please retry !', ephemeral: true });
        }
    }
}
