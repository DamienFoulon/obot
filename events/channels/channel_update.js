import { tempVoice } from '../../lib/tempVoice/index.js';

export const name = 'CHANNEL_UPDATE';

// A voice room renamed by hand keeps the name its owner chose
export async function execute(channel) {
  tempVoice.onChannelUpdate(channel);
}
