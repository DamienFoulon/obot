import { controlMusicButton } from '../../../lib/music/control.js';

export const customId = 'music_pause';

// One button for both: its label follows the state
export async function execute(interaction, res) {
  return res.send(controlMusicButton(interaction, (player) => (player.paused ? player.resume() : player.pause())));
}
