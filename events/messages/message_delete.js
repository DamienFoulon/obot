import { handlePanelDeleted } from '../../lib/coordinates/forum.js';

export const name = 'MESSAGE_DELETE';

// A deleted coordinates panel is posted again
export async function execute(message) {
  await handlePanelDeleted(message);
}
