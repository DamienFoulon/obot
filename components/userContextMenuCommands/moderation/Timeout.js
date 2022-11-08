const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Timeout')
        .setType(ApplicationCommandType.User)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        async execute(interaction) {
            try {
                global.timeoutUser = interaction.targetMember;
                const timeoutForm = new ModalBuilder()
                    .setCustomId('timeoutForm')
                    .setTitle('Timeout Form')
    
                const reasonInput = new TextInputBuilder()
                    .setCustomId('timeoutFormReason')
                    .setLabel('Reason')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
    
                const durationInput = new TextInputBuilder()
                    .setCustomId('timeoutFormDuration')
                    .setLabel('Duration (in seconds)')
                    .setPlaceholder('null for remove timeout')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);
    
                const reasonComponent = new ActionRowBuilder().addComponents(reasonInput);
                const durationComponent = new ActionRowBuilder().addComponents(durationInput);
    
                timeoutForm.addComponents(reasonComponent, durationComponent);
    
                await interaction.showModal(timeoutForm);
            } catch (error) {
                console.log(error);
                await interaction.reply({ content: 'Ooops! The user left my field of vision 👀 Please retry !', ephemeral: true });
            }
        }
}
