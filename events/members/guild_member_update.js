import { litter } from '../../lib/litter/index.js';

export const name = 'GUILD_MEMBER_UPDATE';

// Roles or nickname changed: a member of the litter is put back in it
export async function execute(member) {
  await litter.enforce(member.guild_id, member);
}
