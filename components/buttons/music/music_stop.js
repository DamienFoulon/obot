import { controlMusicButton } from '../../../lib/music/control.js';

export const customId = 'music_stop';

export async function execute(interaction, res) {
  return res.send(controlMusicButton(interaction, (player) => player.stop()));
}
