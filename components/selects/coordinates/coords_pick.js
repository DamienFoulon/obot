import { coordinateHandlers } from '../../../lib/coordinates/handlers.js';
import { parseCustomId } from '../../../utils.js';

export const customId = 'coords_pick';

// coords_pick:<page>, the chosen coordinate id is the selected value
export async function execute(interaction, res) {
  const [page] = parseCustomId(interaction.data.custom_id).args;
  const [id] = interaction.data.values;
  return res.send(await coordinateHandlers.showCard(interaction, id, Number(page)));
}
