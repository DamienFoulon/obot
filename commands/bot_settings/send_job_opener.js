const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ButtonComponent, PermissionFlagsBits } = require('discord.js');

const dotenv = require('dotenv');
dotenv.config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('send_job_opener')
        .setDescription('Send a job opener to the server!')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option => option.setName('channel')
            .setDescription('The channel to send the job opener in')
            .setRequired(true)),
    async execute(interaction) {
        try {
            const jobOpenerChannel = interaction.options.getChannel('channel');
            const jobOpenerEmbed = new EmbedBuilder()
                .setColor(process.env.OBOT_COLOR)
                .setTitle('Job Opener')
                .setDescription('You can create a job offer by following the instructions below!')
                .addFields(
                    { name: '\u200B', value: `1️⃣ Click on the button 'Post a job offer'` },
                    { name: '\u200B', value: `2️⃣ Fill the form` },
                    { name: '\u200B', value: `3️⃣ Wait for the staff validation` },
                    { name: '\u200B', value: `4️⃣ Your job offer will be posted in the channel ${interaction.guild.channels.cache.get(process.env.JOB_CHANNEL_ID)}` },
                )
                .setThumbnail(process.env.OBOT_LOGO_LINK);

            const jobOpenerButton = new ButtonBuilder()
                .setStyle(ButtonStyle.Primary)
                .setLabel('Post a job offer')
                .setCustomId('job_opener_button')
                .setEmoji('📝');

            const jobOpenerRow = new ActionRowBuilder()
                .addComponents(jobOpenerButton);

            await jobOpenerChannel.send({ embeds: [jobOpenerEmbed], components: [jobOpenerRow] });
            await interaction.reply({ content: `Job opener sent in ${jobOpenerChannel}! 📨`, ephemeral: true });
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops... ! I felt into the stairs 🤕 Can you please try again ?', ephemeral: true });
        }
    },
}