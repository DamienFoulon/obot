const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: `announceForm`,
    },
    async execute (interaction) {
        console.log(interaction);
        try {
            const announceTitle = interaction.fields.getTextInputValue('announceFormTitle');
            const announceContent = interaction.fields.getTextInputValue('announceFormContent');
            const announceImage = interaction.fields.getTextInputValue('announceFormImage');
            const announceColor = interaction.fields.getTextInputValue('announceFormColor');

            const announceEmbed = new EmbedBuilder()
                .setTitle(announceTitle)
                .setDescription(announceContent)
                if(announceImage !== undefined || announceImage !== null) {
                    announceEmbed.setImage(announceImage);
                }
                if(announceColor !== undefined || announceColor !== null) {
                    announceEmbed.setColor(announceColor);
                } else {
                    announceEmbed.setColor('#0193CF');
                }

            global.announceChannel.send({ embeds: [announceEmbed] });
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: `Ouuups, I feel stressed to announce that. Please try again later. 😖`, ephemeral: true });
        }
    }
}