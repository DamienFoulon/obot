import { litter } from '../../../lib/litter/index.js';

export const customId = 'litter_vote';

// litter_vote:<voteId>. The response goes first (3 s limit), the vote message is edited afterwards
export async function execute(interaction, res) {
  const { after, ...response } = await litter.voteButton(interaction);
  res.send(response);
  if (after) await after();
}
