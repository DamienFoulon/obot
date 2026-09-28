import { rememberChannel } from '../../lib/coordinates/forum.js';

export const name = 'THREAD_CREATE';

// A new post in the coordinates forum gets its panel with its original message (MESSAGE_CREATE):
// Discord refuses any message in a post before it
export async function execute(thread) {
  rememberChannel(thread);
}
