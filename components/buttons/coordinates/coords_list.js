import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';

export const customId = 'coords_list';

export async function execute(interaction, res) {
  return res.send(await coordinateHandlers.showList(interaction, 0));
}
