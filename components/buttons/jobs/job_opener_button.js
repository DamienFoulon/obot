const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: {
        name: `job_opener_button`,
    },
    async execute (interaction) {
        try {
            const jobOpenerModal = new ModalBuilder()
                .setTitle('Job Opener')
                .setCustomId('job_opener_modal');

            const jobTitleInput = new TextInputBuilder()
                .setCustomId('jobTitleInput')
                .setLabel('Job title')
                .setPlaceholder('E.G: Backend developer for backoffice')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const jobDescriptionInput = new TextInputBuilder()
                .setCustomId('jobDescriptionInput')
                .setLabel('Job description')
                .setPlaceholder('E.G: We are looking for a backend developer to work on our backoffice')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const jobRemunerationInput = new TextInputBuilder()
                .setCustomId('jobRemunerationInput')
                .setLabel('Job remuneration')
                .setPlaceholder('E.G: 2000€/month or 20€/hour 100€ or 0')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const jobTitleActionRow = new ActionRowBuilder().addComponents(jobTitleInput);
            const jobDescriptionActionRow = new ActionRowBuilder().addComponents(jobDescriptionInput);
            const jobRemunerationActionRow = new ActionRowBuilder().addComponents(jobRemunerationInput);

            jobOpenerModal.addComponents(jobTitleActionRow, jobDescriptionActionRow, jobRemunerationActionRow);

            await interaction.showModal(jobOpenerModal);
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops... ! I fell into the stairs 🤕 Can you please try again ?', ephemeral: true });
        }
    }
}