const dotenv = require('dotenv');
dotenv.config();

module.exports = {
    name: 'guildMemberRemove',
    execute(member) {
        console.log(`${member.user.tag} left the server ! 😭`);
        const welcomeChannel = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
        welcomeChannel.send(`${member.user} just be catched by aliens ! 🛸`);
    }
}