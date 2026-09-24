import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';

export const customId = 'coords_add_modal';

export async function execute(interaction, res) {
  return res.send(await coordinateHandlers.submitAdd(interaction));
}
