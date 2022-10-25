const { ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const mysql = require('mysql');

module.exports = {
    data: {
        name: `job_accept_button`,
    },
    async execute(interaction) {
        try {
            console.log(`SELECT * FROM jobs WHERE id='${interaction.message.id}'`);
            global.database.query("SELECT * FROM jobs WHERE id='" + interaction.message.id+"'", (error, results) => {
                if (error) throw error;
                let jobTitle = results[0].title;
                let jobDescription = results[0].description;
                let jobRemuneration = results[0].remuneration;
                let jobRequiredSkills = results[0].requiredSkills;
                let jobUserCreator = interaction.guild.members.cache.get(results[0].author);
                let jobChannel = interaction.guild.channels.cache.get(process.env.JOB_CHANNEL_ID);
                let jobUserValidator = interaction.user;

                const jobEmbed = new EmbedBuilder()
                    .setColor(process.env.OBOT_COLOR)
                    .setTitle(jobTitle)
                    .setAuthor({ name: jobUserCreator.user.username, iconURL: jobUserCreator.user.displayAvatarURL() })
                    .setDescription(jobDescription)
                    .addFields(
                        { name: 'Remuneration', value: "```" + jobRemuneration + "```", inline: true },
                        { name: 'Required skills', value: "```" + jobRequiredSkills + "```", inline: true },
                    )
                    .setFooter({ text: `The job was validated by ${interaction.user.username}` })
                    .setTimestamp();

                const jobEmbedActionRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('Reply')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`https://discord.com/users/${jobUserCreator.user.id}`)
                            .setEmoji('📨')
                    );

                jobChannel.send({ embeds: [jobEmbed], components: [jobEmbedActionRow] });
                interaction.reply({ content: `Beep boop ! The job offer has been successfully validated ! 🤖`, ephemeral: true});
                jobUserCreator.send({ content: `Hey ${jobUserCreator} 👋\nYour job offer was approved by ${interaction.user} ! 🎉` });
                interaction.message.react('✅');
            });
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops... ! I fell into the stairs 🤕 Can you please try again ?', ephemeral: true });
        }
    },
}