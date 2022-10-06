const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Kick')
        .setType(ApplicationCommandType.User)
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    async execute(interaction) {
        try {
            global.kickUser = interaction.targetMember;
            const kickForm = new ModalBuilder()
                .setCustomId('kickForm')
                .setTitle('Kick Form')

            const reasonInput = new TextInputBuilder()
                .setCustomId('kickFormReason')
                .setLabel('Reason')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const reasonComponent = new ActionRowBuilder().addComponents(reasonInput);
            kickForm.addComponents(reasonComponent);
            
            await interaction.showModal(kickForm);
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops! The user left my field of vision 👀 Please retry !', ephemeral: true });
        }
    }
}
