import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';
import { parseCustomId } from '../../../utils.js';

export const customId = 'coords_delete_confirm';

// coords_delete_confirm:<id>:<page>
export async function execute(interaction, res) {
  const [id, page] = parseCustomId(interaction.data.custom_id).args;
  return res.send(await coordinateHandlers.confirmDelete(interaction, id, Number(page)));
}
