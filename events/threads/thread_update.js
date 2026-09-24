import { rememberChannel } from '../../lib/coordinates/forum.js';

export const name = 'THREAD_UPDATE';

// Archived posts come back through here when someone writes in them
export async function execute(thread) {
  rememberChannel(thread);
}
