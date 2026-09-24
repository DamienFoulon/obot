import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';
import { parseCustomId } from '../../../utils.js';

export const customId = 'coords_modify';

// coords_modify:<id>
export async function execute(interaction, res) {
  const [id] = parseCustomId(interaction.data.custom_id).args;
  return res.send(await coordinateHandlers.openEdit(interaction, id));
}
