import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';

export const customId = 'coords_edit';

export async function execute(interaction, res) {
  return res.send(await coordinateHandlers.showPicker(interaction, 0));
}
