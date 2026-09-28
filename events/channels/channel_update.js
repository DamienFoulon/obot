import { litter } from '../../lib/litter/index.js';

export const name = 'CHANNEL_UPDATE';

// A channel moved or its permissions edited: the litter overwrite is checked again
export async function execute(channel) {
  await litter.channelChanged(channel);
}
