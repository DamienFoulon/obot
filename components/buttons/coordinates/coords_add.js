import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';

export const customId = 'coords_add';

export async function execute(interaction, res) {
  return res.send(await coordinateHandlers.openAdd(interaction));
}
