const { ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { execute } = require('../../buttons/jobs/job_opener_button');

const mysql = require('mysql');
const dotenv = require('dotenv');
dotenv.config();

module.exports = {
    data: {
        name: `job_opener_modal`,
    },
    async execute(interaction) {
        try {
            let jobTitle = interaction.fields.getTextInputValue('jobTitle');
            let jobDescription = interaction.fields.getTextInputValue('jobDescription');
            let jobRemuneration = interaction.fields.getTextInputValue('jobRemuneration');
            let jobRequiredSkills = interaction.fields.getTextInputValue('jobRequiredSkills') || 'None';
            let jobUserCreator = interaction.user;
            let jobValidationChannel = interaction.guild.channels.cache.get(process.env.JOB_VALIDATION_CHANNEL_ID);

            const jobEmbed = new EmbedBuilder()
                .setColor(process.env.OBOT_COLOR)
                .setTitle(jobTitle)
                .setAuthor({ name: jobUserCreator.username, iconURL: jobUserCreator.displayAvatarURL() })
                .setDescription(jobDescription)
                .addFields(
                    { name: 'Remuneration', value: "```" + jobRemuneration + "```", inline: true },
                    { name: 'Required skills', value: "```" + jobRequiredSkills + "```", inline: true },
                )
                .setTimestamp();

            const jobEmbedActionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('job_accept_button')
                        .setLabel('Accept')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId('job_decline_button')
                        .setLabel('Decline')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('❌')
                );
            await jobValidationChannel.send({ embeds: [jobEmbed], components: [jobEmbedActionRow] }).then((message) => {
                global.database.query('INSERT INTO jobs (id, title, description, remuneration, requiredSkills, author) VALUES (?, ?, ?, ?, ?, ?)', [message.id, jobTitle, jobDescription, jobRemuneration, jobRequiredSkills, jobUserCreator.id, message.id], (error, results) => {
                    if (error) throw error;
                    console.log(`The job was added to the database with the id ${results.insertId} ! 🚀`);
                    jobUserCreator.send({ content: `Hey ${jobUserCreator} 👋\nYour job offer was successfully sended to the validation channel ! 🚀\nWait for the staff to deliver their opinion ⏳` });
                });
            });
            await interaction.reply({ content: `Your job offer has been sent to the validation channel ! 📨`, ephemeral: true });

        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops... ! I fell into the stairs 🤕 Can you please try again ?', ephemeral: true });
        }
    }
}