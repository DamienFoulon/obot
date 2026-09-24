import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';
import { parseCustomId } from '../../../utils.js';

export const customId = 'coords_back';

// coords_back:<page>: back to the picker page the coordinate was chosen from
export async function execute(interaction, res) {
  const [page] = parseCustomId(interaction.data.custom_id).args;
  return res.send(await coordinateHandlers.showPicker(interaction, Number(page), { edit: true }));
}
