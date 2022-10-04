const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: `announceForm`,
    },
    async execute (interaction) {
        try {
            const announceTitle = interaction.fields.getTextInputValue('announceFormTitle');
            const announceContent = interaction.fields.getTextInputValue('announceFormContent');
            const announceImage = interaction.fields.getTextInputValue('announceFormImage');
            const announceColor = interaction.fields.getTextInputValue('announceFormColor');

            const announceEmbed = new EmbedBuilder()
                .setTitle(announceTitle)
                .setDescription(announceContent)
                // if announceImage is not empty, set the image
                .setImage(announceImage ? announceImage : null)
                // if announceColor is not empty, set the color
                .setColor(announceColor ? announceColor : "#0193CF")

            global.announceChannel.send({ embeds: [announceEmbed] });
            await interaction.reply({ content: `Annoucement sent successfully !`, ephemeral: true });
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: `Ouuups, I feel stressed to announce that. Please try again later. 😖`, ephemeral: true });
        }
    }
}