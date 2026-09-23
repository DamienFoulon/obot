import { forwardVoiceServerUpdate } from '../../lib/music/voiceAdapter.js';

export const name = 'VOICE_SERVER_UPDATE';

export async function execute(data) {
  forwardVoiceServerUpdate(data);
}
