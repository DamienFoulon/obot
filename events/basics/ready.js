module.exports = {
	name: 'ready',
	once: true,
	execute(client) {
		console.log(`Now come on, get to it as ${client.user.tag} ! 🚀`);
		global.slowModeMembers = [];
	},
};