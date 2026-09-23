import { controlMusicButton } from '../../../lib/music/control.js';
import { LOOP_MODES } from '../../../lib/music/player.js';

export const customId = 'music_loop';

// off -> track -> queue -> off
export async function execute(interaction, res) {
  return res.send(controlMusicButton(interaction, (player) => {
    player.setLoop(LOOP_MODES[(LOOP_MODES.indexOf(player.loop) + 1) % LOOP_MODES.length]);
  }));
}
