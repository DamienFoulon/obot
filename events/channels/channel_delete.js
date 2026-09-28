import { tempVoice } from '../../lib/tempVoice/index.js';

export const name = 'CHANNEL_DELETE';

export async function execute(channel) {
  tempVoice.onChannelDelete(channel);
}
