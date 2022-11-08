const mysql = require('mysql');

module.exports = {
    data: {
        name: `job_decline_button`,
    },
    async execute(interaction) {
        try {
            global.database.query("DELETE FROM jobs WHERE id='" + interaction.message.id + "'", (error) => {
                if (error) throw error;
                interaction.reply({ content: `The job offer was successfully deleted from the database ! 🗑️`, ephemeral: true });
                let author = interaction.guild.members.cache.find(member => member.user.username === interaction.message.embeds[0].author.name)
                author.send({ content: `Hey ${author} 👋\nYour job offer was declined by ${interaction.user} ! 😢` }).catch(() => {
                    console.log(`The user has disabled the DMs !`);
                });
                interaction.message.react('🗑️');
            })
        } catch (error) {
            console.log(error);
            await interaction.reply({ content: 'Ooops... ! I fell into the stairs 🤕 Can you please try again ?', ephemeral: true });
        }
    },
}