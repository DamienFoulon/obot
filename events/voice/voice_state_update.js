import { forwardVoiceStateUpdate } from '../../lib/music/voiceAdapter.js';
import { updateVoiceState } from '../../lib/music/voiceStates.js';

export const name = 'VOICE_STATE_UPDATE';

export async function execute(state) {
  updateVoiceState(state);
  forwardVoiceStateUpdate(state);
}
