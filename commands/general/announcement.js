const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announcement')
        .setDescription('Announce something to the server!')
        .addChannelOption(option => option.setName('channel')
            .setDescription('The channel to announce in')
            .setRequired(true)),
    async execute(interaction) {
        try {
            global.announceChannel = interaction.options.getChannel('channel');
        const announceForm = new ModalBuilder()
            .setCustomId('announceForm')
            .setTitle('Announcement');

        const announceTitleInput = new TextInputBuilder()
            .setCustomId('announceFormTitle')
            .setLabel('Title')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const announceContentInput = new TextInputBuilder()
            .setCustomId('announceFormContent')
            .setLabel('Content')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const announceImageInput = new TextInputBuilder()
            .setCustomId('announceFormImage')
            .setLabel('Image URL')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

        const announceColorInput = new TextInputBuilder()
            .setCustomId('announceFormColor')
            .setLabel('Color')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        const announceTitleComponent = new ActionRowBuilder().addComponents(announceTitleInput);
        const announceContentComponent = new ActionRowBuilder().addComponents(announceContentInput);
        const announceImageComponent = new ActionRowBuilder().addComponents(announceImageInput);
        const announceColorComponent = new ActionRowBuilder().addComponents(announceColorInput);

        announceForm.addComponents(announceTitleComponent, announceContentComponent, announceImageComponent, announceColorComponent);

        await interaction.showModal(announceForm);
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops... ! I felt into the stairs 🤕 Can you please try again ?', ephemeral: true });
        }
    }

}