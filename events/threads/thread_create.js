import { ensurePanel, isWorldThread, rememberChannel } from '../../lib/coordinates/forum.js';

export const name = 'THREAD_CREATE';

// A new post in the coordinates forum is a new world: it gets its panel
export async function execute(thread) {
  rememberChannel(thread);
  if (await isWorldThread(thread.id, thread.parent_id)) await ensurePanel(thread.id);
}
