const dotenv = require('dotenv');
dotenv.config();

module.exports = {
    name: 'guildMemberAdd',
    execute(member) {
        console.log(`${member.user.tag} joined the server ! 🎉`);
        const welcomeChannel = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
        welcomeChannel.send(`${process.env.WELCOME_PUBLIC_MESSAGE}`);
    }
}