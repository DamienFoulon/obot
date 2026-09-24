import { ensurePanel, isActiveWorld, rememberChannel } from '../../lib/coordinates/forum.js';

export const name = 'THREAD_UPDATE';

// Archived posts come back through here when someone writes in them: a world archived at startup
// has no panel yet. ensurePanel does nothing when the panel is already there
export async function execute(thread) {
  rememberChannel(thread);
  if (await isActiveWorld(thread)) await ensurePanel(thread.id);
}
