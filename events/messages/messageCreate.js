const dotenv = require('dotenv');
dotenv.config();

module.exports = {
    name: 'messageCreate',
    execute(message) {
        const user = message.guild.members.cache.get(message.author.id);
        try {
            if(global.slowModeMembers.includes(user.id)) {
                user.timeout( 30000, 'SlowMode' );
                message.reply({ content: `You're a slowed user ! 🐢 You have to wait 30s until your next message`, ephemeral: true });
            }
        } catch (error) {
            console.log(error);
        }
    }
}