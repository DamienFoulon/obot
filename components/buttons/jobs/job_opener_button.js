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
                .setCustomId('jobTitle')
                .setLabel('Job title')
                .setPlaceholder('E.G: Backend developer for backoffice')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const jobDescriptionInput = new TextInputBuilder()
                .setCustomId('jobDescription')
                .setLabel('Job description')
                .setPlaceholder('E.G: We are looking for a backend developer to work on our backoffice')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const jobRemunerationInput = new TextInputBuilder()
                .setCustomId('jobRemuneration')
                .setLabel('Job remuneration')
                .setPlaceholder('E.G: 2000€/month or 20€/hour 100€ or 0')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const jobRequiredSkillsInput = new TextInputBuilder()
                .setCustomId('jobRequiredSkills')
                .setLabel('Job required skills')
                .setPlaceholder('E.G: NodeJS, Express, MongoDB, etc...')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            const jobTitleActionRow = new ActionRowBuilder().addComponents(jobTitleInput);
            const jobDescriptionActionRow = new ActionRowBuilder().addComponents(jobDescriptionInput);
            const jobRemunerationActionRow = new ActionRowBuilder().addComponents(jobRemunerationInput);
            const jobRequiredSkillsActionRow = new ActionRowBuilder().addComponents(jobRequiredSkillsInput);

            jobOpenerModal.addComponents(jobTitleActionRow, jobDescriptionActionRow, jobRemunerationActionRow, jobRequiredSkillsActionRow);

            await interaction.showModal(jobOpenerModal);
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops... ! I fell into the stairs 🤕 Can you please try again ?', ephemeral: true });
        }
    }
}