const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('SlowMode')
        .setType(ApplicationCommandType.User)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        try {
            switch(global.slowModeMembers.includes(interaction.targetMember.id)) {
                case true:
                    global.slowModeMembers.map((member) => {
                        if (member === interaction.targetMember.id) global.slowModeMembers.splice(global.slowModeMembers.indexOf(member), 1);
                    })
                    await interaction.reply({ content: 'The user is suuuupaaafast now ! 🏃', ephemeral: true });
                    break;
                case false:
                    global.slowModeMembers.push(interaction.targetMember.id);
                    await interaction.reply({ content: 'The user got splashed with honey ! 🐢', ephemeral: true });
                    break;
            }
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops! The user left my field of vision 👀 Please retry !', ephemeral: true });
        }
    }
}