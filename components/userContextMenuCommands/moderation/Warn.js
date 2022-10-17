const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Warn')
        .setType(ApplicationCommandType.User)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        try {
            global.warnUser = interaction.targetMember;
            const warnForm = new ModalBuilder()
                .setCustomId('warnForm')
                .setTitle('warn Form')

            const reasonInput = new TextInputBuilder()
                .setCustomId('warnFormReason')
                .setLabel('Reason')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const reasonComponent = new ActionRowBuilder().addComponents(reasonInput);
            warnForm.addComponents(reasonComponent);
            
            await interaction.showModal(warnForm);
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops! The user left my field of vision 👀 Please retry !', ephemeral: true });
        }
    }
}
