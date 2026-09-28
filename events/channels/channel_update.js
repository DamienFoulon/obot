import { litter } from '../../lib/litter/index.js';
import { tempVoice } from '../../lib/tempVoice/index.js';

export const name = 'CHANNEL_UPDATE';

// A voice room renamed by hand keeps the name its owner chose; the litter overwrite is checked again
export async function execute(channel) {
  tempVoice.onChannelUpdate(channel);
  await litter.channelChanged(channel);
}
