import { discordApi } from './discord.js';
import { createLitter } from './handlers.js';
import * as store from './store.js';
import { createVotes } from './votes.js';

export { isLitterEnabled } from './config.js';

// The litter wired to Discord and MySQL; the tests build their own with fakes
export const litter = createLitter({ api: discordApi, store, votes: createVotes() });
