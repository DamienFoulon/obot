import { litter } from '../../lib/litter/index.js';

export const name = 'CHANNEL_CREATE';

// A new channel is hidden from the litter role
export async function execute(channel) {
  await litter.channelChanged(channel);
}
