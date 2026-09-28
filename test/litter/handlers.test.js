import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createLitter } from '../../lib/litter/handlers.js';
import { createVotes } from '../../lib/litter/votes.js';
import { createFakeApi } from '../helpers/fakeLitterApi.js';
import { createFakeLitterStore } from '../helpers/fakeLitterStore.js';

const ADMINISTRATOR = String(1n << 3n);

let api;
let store;
let votes;
let timers;
let litter;
let now;

beforeEach(() => {
  process.env.LITTER_CHANNEL_ID = 'litter';
  process.env.DB_HOST = 'db';
  process.env.APP_ID = 'bot';
  now = 1_000_000;
  api = createFakeApi();
  store = createFakeLitterStore();
  votes = createVotes({ now: () => now });
  timers = [];
  litter = createLitter({ api, store, votes, schedule: (fn, ms) => timers.push({ fn, ms }) });
});

// The user command, as Discord sends it
const command = (targetId, { userId = 'bob', admin = false, channelId = 'general' } = {}) => ({
  guild_id: 'g',
  channel_id: channelId,
  application_id: 'bot',
  data: { name: 'Litière 💩', target_id: targetId },
  member: { user: { id: userId, username: userId }, permissions: admin ? ADMINISTRATOR : '0' },
});
const admin = { userId: 'adm', admin: true };

const litterRole = () => api.guild.roles.find((role) => role.name === '💩');
const callsOf = (name) => api.calls.filter(([call]) => call === name);

test('an admin sends a member to the litter: role created, server hidden, roles saved and swapped, nickname, voice', async () => {
  const reply = await litter.command(command('alice', admin));
  assert.equal(reply, "C'est fait, direction la litière 💩");
  const role = litterRole();
  assert.deepEqual({ permissions: role.permissions, hoist: role.hoist }, { permissions: '0', hoist: true });
  assert.deepEqual(callsOf('putOverwrite').map(([, id]) => id), ['cat-litter', 'litter', 'cat-chat', 'general']);
  assert.deepEqual(store.rows.get('g:alice'), { roles: ['cop'], nick: 'Ali' });
  assert.deepEqual(callsOf('patchMember'), [['patchMember', 'alice', { roles: ['booster', role.id], nick: '💩' }]]);
  assert.deepEqual(callsOf('moveToVoice'), [['moveToVoice', 'alice', 'litter']]);
  assert.equal(api.messages.length, 1);
  assert.equal(api.messages[0].channelId, 'general');
  assert.equal(api.messages[0].content, '💩 <@alice> a fait de la merde : direction la litière de Pipette ! (par <@adm>)');
  assert.deepEqual(api.messages[0].allowed_mentions, { users: ['alice', 'adm'] });
});

test('a second sending reuses the role and the overwrites', async () => {
  await litter.command(command('alice', admin));
  await litter.command(command('bob', admin));
  assert.equal(callsOf('createRole').length, 1);
  assert.equal(callsOf('putOverwrite').length, 4);
  assert.deepEqual(store.rows.get('g:bob'), { roles: [], nick: null });
  assert.deepEqual(api.members.get('bob').roles, [litterRole().id]);
});

test('an admin releases: saved roles back, nickname back, row gone', async () => {
  await litter.command(command('alice', admin));
  const reply = await litter.command(command('alice', admin));
  assert.equal(reply, "C'est fait, Pipette a nettoyé 🕊️");
  assert.deepEqual(api.members.get('alice').roles, ['booster', 'cop']);
  assert.equal(api.members.get('alice').nick, 'Ali');
  assert.equal(store.rows.has('g:alice'), false);
  assert.equal(api.messages.at(-1).content, '🕊️ <@alice> sort de la litière (par <@adm>), Pipette a nettoyé.');
});

test('a saved role that was deleted is not given back', async () => {
  await litter.command(command('alice', admin));
  api.guild.roles = api.guild.roles.filter((role) => role.id !== 'cop');
  await litter.command(command('alice', admin));
  assert.deepEqual(api.members.get('alice').roles, ['booster']);
});

test('releasing a member who left only forgets them', async () => {
  await litter.command(command('alice', admin));
  api.members.delete('alice');
  const patches = callsOf('patchMember').length;
  const reply = await litter.command(command('alice', admin));
  assert.equal(reply, "C'est fait, Pipette a nettoyé 🕊️");
  assert.equal(store.rows.has('g:alice'), false);
  assert.equal(callsOf('patchMember').length, patches);
});

test('refusals: self, bot, owner, above the bot, gone, not configured', async () => {
  assert.equal(await litter.command(command('adm', admin)), 'Tu ne peux pas te mettre toi-même à la litière 💩');
  assert.equal(await litter.command(command('bot', admin)), 'Je ne peux pas envoyer un bot à la litière 🤖');
  assert.equal(await litter.command(command('own', admin)), 'Je ne peux pas envoyer le propriétaire du serveur à la litière 👑');
  assert.equal(await litter.command(command('greg', admin)), '<@greg> a un rôle au-dessus du mien, je ne peux pas y toucher ⬆️');
  assert.equal(await litter.command(command('nobody', admin)), "<@nobody> n'est plus sur le serveur 👀");
  assert.equal(store.rows.size, 0);
  assert.equal(api.messages.length, 0);
  assert.equal(api.calls.length, 0);
  delete process.env.LITTER_CHANNEL_ID;
  assert.equal(await litter.command(command('alice', admin)), "La litière n'est pas configurée 🐈");
});

test('a member of the litter promoted above the bot can no longer be released', async () => {
  await litter.command(command('alice', admin));
  api.members.get('alice').roles.push('goat');
  assert.equal(await litter.command(command('alice', admin)), '<@alice> a un rôle au-dessus du mien, je ne peux pas y toucher ⬆️');
  assert.equal(store.rows.has('g:alice'), true);
});

// The vote button, as Discord sends it
const click = (voteId, userId) => ({
  guild_id: 'g',
  channel_id: 'general',
  data: { custom_id: `litter_vote:${voteId}` },
  member: { user: { id: userId, username: userId }, permissions: '0' },
});
// Clicks and runs the deferred work, like components/buttons/litter/litter_vote.js
const clickBy = async (voteId, userId) => {
  const { after, ...response } = await litter.voteButton(click(voteId, userId));
  if (after) await after();
  return response;
};
const DEFERRED_UPDATE = 6;
const UPDATE = 7;

test('a member opens a vote: public message with the button, author counted, expiry scheduled', async () => {
  const reply = await litter.command(command('alice', { userId: 'bob' }));
  assert.equal(reply, 'Vote lancé 👇');
  const vote = votes.find('g', 'alice', 'litter');
  assert.deepEqual(vote.voters, ['bob']);
  assert.equal(vote.channelId, 'general');
  assert.equal(vote.messageId, api.messages[0].id);
  assert.equal(api.messages[0].content, "🗳️ <@bob> propose d'envoyer <@alice> dans la litière de Pipette 💩 · **1/4** · votes : <@bob>");
  assert.equal(api.messages[0].components[0].components[0].custom_id, `litter_vote:${vote.id}`);
  assert.deepEqual(timers.map((timer) => timer.ms), [5 * 60 * 1000]);
  assert.equal(store.rows.size, 0);
  assert.equal(callsOf('patchMember').length, 0);
});

test('clicks add voices and the 4th one sends the member', async () => {
  await litter.command(command('alice', { userId: 'bob' }));
  const vote = votes.find('g', 'alice', 'litter');
  assert.equal((await clickBy(vote.id, 'carl')).type, DEFERRED_UPDATE);
  assert.equal(api.messages[0].content, "🗳️ <@bob> propose d'envoyer <@alice> dans la litière de Pipette 💩 · **2/4** · votes : <@bob>, <@carl>");
  assert.equal((await clickBy(vote.id, 'carl')).data.content, 'Tu as déjà voté 🗳️');
  assert.equal((await clickBy(vote.id, 'alice')).data.content, 'Tu ne peux pas voter contre toi-même 💩');
  await clickBy(vote.id, 'dan');
  assert.equal(store.rows.size, 0);
  await clickBy(vote.id, 'eve');
  assert.equal(api.messages[0].content, '💩 Le peuple a parlé : <@alice> part à la litière de Pipette ! (4 votes : <@bob>, <@carl>, <@dan>, <@eve>)');
  assert.deepEqual(api.messages[0].components, []);
  assert.deepEqual(store.rows.get('g:alice'), { roles: ['cop'], nick: 'Ali' });
  assert.equal(api.members.get('alice').nick, '💩');
  assert.deepEqual(callsOf('moveToVoice'), [['moveToVoice', 'alice', 'litter']]);
  assert.equal(votes.get(vote.id), null);
  // A click on the finished vote removes what is left of the button
  assert.deepEqual(await clickBy(vote.id, 'fay'), { type: UPDATE, data: { content: '⌛ Ce vote est terminé.', allowed_mentions: { users: [] }, components: [] } });
});

test('the command on a target with an open vote adds a voice and links the vote', async () => {
  await litter.command(command('alice', { userId: 'bob' }));
  const vote = votes.find('g', 'alice', 'litter');
  const link = `https://discord.com/channels/g/general/${vote.messageId}`;
  assert.equal(await litter.command(command('alice', { userId: 'carl' })), `Ta voix est comptée (2/4) 🗳️ ${link}`);
  assert.equal(await litter.command(command('alice', { userId: 'carl' })), `Tu as déjà voté 🗳️ ${link}`);
  assert.equal(api.messages.length, 1);
  assert.match(api.messages[0].content, /\*\*2\/4\*\*/);
  await litter.command(command('alice', { userId: 'dan' }));
  assert.equal(await litter.command(command('alice', { userId: 'eve' })), `Le peuple a parlé 👇 ${link}`);
  assert.equal(api.members.get('alice').nick, '💩');
});

test('a vote expires after 5 minutes: the message says so, a late click removes the button, a new vote can start', async () => {
  await litter.command(command('alice', { userId: 'bob' }));
  const vote = votes.find('g', 'alice', 'litter');
  now += 5 * 60 * 1000;
  await timers[0].fn();
  assert.equal(api.messages[0].content, '⌛ Vote expiré : <@alice> reste où il est.');
  assert.deepEqual(api.messages[0].components, []);
  assert.deepEqual(await clickBy(vote.id, 'carl'), { type: UPDATE, data: { content: '⌛ Ce vote est terminé.', allowed_mentions: { users: [] }, components: [] } });
  assert.equal(await litter.command(command('alice', { userId: 'carl' })), 'Vote lancé 👇');
  assert.equal(api.messages.length, 2);
});

test('a click on a vote that expired before its timer fired closes it, and the timer then has nothing to do', async () => {
  await litter.command(command('alice', { userId: 'bob' }));
  const vote = votes.find('g', 'alice', 'litter');
  now += 5 * 60 * 1000;
  const response = await clickBy(vote.id, 'carl');
  assert.equal(response.type, UPDATE);
  assert.equal(response.data.content, '⌛ Vote expiré : <@alice> reste où il est.');
  assert.deepEqual(response.data.components, []);
  const edits = api.edits;
  await timers[0].fn();
  assert.equal(api.edits, edits);
});

test('a release vote frees a member of the litter', async () => {
  await litter.command(command('alice', admin));
  assert.equal(await litter.command(command('alice', { userId: 'bob' })), 'Vote lancé 👇');
  const vote = votes.find('g', 'alice', 'release');
  assert.equal(api.messages[1].content, '🗳️ <@bob> propose de libérer <@alice> de la litière 🕊️ · **1/4** · votes : <@bob>');
  assert.equal(api.messages[1].components[0].components[0].label, '🕊️ Voter');
  for (const userId of ['carl', 'dan', 'eve']) await clickBy(vote.id, userId);
  assert.equal(api.messages[1].content, '🕊️ Le peuple pardonne : <@alice> sort de la litière. (4 votes : <@bob>, <@carl>, <@dan>, <@eve>)');
  assert.deepEqual(api.members.get('alice').roles, ['booster', 'cop']);
  assert.equal(api.members.get('alice').nick, 'Ali');
  assert.equal(store.rows.has('g:alice'), false);
});

test('a vote reached on a target who left says so and applies nothing', async () => {
  await litter.command(command('alice', { userId: 'bob' }));
  const vote = votes.find('g', 'alice', 'litter');
  api.members.delete('alice');
  for (const userId of ['carl', 'dan', 'eve']) await clickBy(vote.id, userId);
  assert.equal(api.messages[0].content, "⌛ Trop tard : <@alice> n'est plus sur le serveur 👀");
  assert.deepEqual(api.messages[0].components, []);
  assert.equal(store.rows.size, 0);
  assert.equal(callsOf('patchMember').length, 0);
});

test('a vote against an untouchable target is refused before it opens', async () => {
  assert.equal(await litter.command(command('greg', { userId: 'bob' })), '<@greg> a un rôle au-dessus du mien, je ne peux pas y toucher ⬆️');
  assert.equal(await litter.command(command('own', { userId: 'bob' })), 'Je ne peux pas envoyer le propriétaire du serveur à la litière 👑');
  assert.equal(await litter.command(command('bob', { userId: 'bob' })), 'Tu ne peux pas te mettre toi-même à la litière 💩');
  assert.equal(api.messages.length, 0);
  assert.equal(votes.find('g', 'greg', 'litter'), null);
});

test('when the vote message cannot be sent, no vote stays open', async () => {
  api.failSend = true;
  await assert.rejects(litter.command(command('alice', { userId: 'bob' })), /403/);
  assert.equal(votes.find('g', 'alice', 'litter'), null);
  assert.equal(timers.length, 0);
});

test('a click on a vote the bot forgot removes the button', async () => {
  assert.deepEqual(await clickBy('42', 'carl'), { type: UPDATE, data: { content: '⌛ Ce vote est terminé.', allowed_mentions: { users: [] }, components: [] } });
});

const event = (userId, roles, nick) => ({ user: { id: userId, username: userId }, roles, nick });

test("the bot's own change arrives as an event and changes nothing; a drift is put back", async () => {
  await litter.command(command('alice', admin));
  const role = litterRole();
  const before = callsOf('patchMember').length;
  await litter.enforce('g', event('alice', ['booster', role.id], '💩'));
  assert.equal(callsOf('patchMember').length, before);
  // A role given back
  await litter.enforce('g', event('alice', ['booster', role.id, 'cop'], '💩'));
  assert.deepEqual(api.calls.at(-1), ['patchMember', 'alice', { roles: ['booster', role.id], nick: '💩' }]);
  // The nickname changed
  await litter.enforce('g', event('alice', ['booster', role.id], 'Ali'));
  assert.deepEqual(api.calls.at(-1), ['patchMember', 'alice', { roles: ['booster', role.id], nick: '💩' }]);
  // The litter role removed
  await litter.enforce('g', event('alice', ['booster'], '💩'));
  assert.equal(callsOf('patchMember').length, before + 3);
  // A free member is never touched
  await litter.enforce('g', event('bob', ['cop'], 'Bobby'));
  assert.equal(callsOf('patchMember').length, before + 3);
});

test('a member of the litter who comes back is put back, even when the role was deleted meanwhile', async () => {
  await litter.command(command('alice', admin));
  api.guild.roles = api.guild.roles.filter((role) => role.name !== '💩');
  await litter.enforce('g', event('alice', [], null));
  const role = litterRole();
  assert.ok(role, 'the role is created again');
  assert.deepEqual(api.calls.at(-1), ['patchMember', 'alice', { roles: [role.id], nick: '💩' }]);
  // The overwrites now name the new role
  assert.equal(api.channels[3].permission_overwrites.at(-1).id, role.id);
});

test('the lock does nothing when the feature is off', async () => {
  await litter.command(command('alice', admin));
  delete process.env.LITTER_CHANNEL_ID;
  const before = api.calls.length;
  await litter.enforce('g', event('alice', ['cop'], 'Ali'));
  assert.equal(api.calls.length, before);
});

test('setup hides the server at startup, once', async () => {
  await litter.setup({ id: 'g', roles: api.guild.roles, channels: api.channels });
  assert.equal(callsOf('createRole').length, 1);
  assert.deepEqual(callsOf('putOverwrite').map(([, id]) => id), ['cat-litter', 'litter', 'cat-chat', 'general']);
  await litter.setup({ id: 'g', roles: api.guild.roles, channels: api.channels });
  assert.equal(api.calls.length, 5);
});

test('setup ignores a server without the litter channel', async () => {
  await litter.setup({ id: 'other', roles: [], channels: [{ id: 'x', guild_id: 'other', type: 0, parent_id: null, permission_overwrites: [] }] });
  assert.equal(api.calls.length, 0);
});

test("a new channel gets its overwrite, one in the litter gets an allow, the bot's own update and another server change nothing", async () => {
  // Before the role exists, there is nothing to write
  await litter.channelChanged(api.channels[3]);
  assert.equal(api.calls.length, 0);

  await litter.setup({ id: 'g', roles: api.guild.roles, channels: api.channels });
  const fresh = { id: 'new', guild_id: 'g', type: 0, parent_id: 'cat-chat', permission_overwrites: [] };
  api.channels.push(fresh);
  await litter.channelChanged(fresh);
  assert.deepEqual(api.calls.at(-1), ['putOverwrite', 'new']);
  assert.equal(fresh.permission_overwrites[0].deny, String((1n << 10n) | (1n << 20n)));
  const afterNew = api.calls.length;
  await litter.channelChanged(fresh);
  assert.equal(api.calls.length, afterNew);

  const inLitter = { id: 'litter-text', guild_id: 'g', type: 0, parent_id: 'cat-litter', permission_overwrites: [] };
  api.channels.push(inLitter);
  await litter.channelChanged(inLitter);
  assert.equal(inLitter.permission_overwrites[0].allow, String((1n << 10n) | (1n << 11n) | (1n << 20n) | (1n << 21n)));

  const afterLitter = api.calls.length;
  await litter.channelChanged({ id: 'far', guild_id: 'other', type: 0, parent_id: null, permission_overwrites: [] });
  assert.equal(api.calls.length, afterLitter);
});

test('a channel where the overwrite is refused is logged and skipped, the others are still hidden', async () => {
  api.failPutOn.add('cat-chat');
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const reply = await litter.command(command('alice', admin));
    assert.equal(reply, "C'est fait, direction la litière 💩");
    assert.deepEqual(callsOf('putOverwrite').map(([, id]) => id), ['cat-litter', 'litter', 'general']);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /cat-chat/);
    // The refused channel is tried again at the next need
    await litter.setup({ id: 'g', roles: api.guild.roles, channels: api.channels });
    assert.equal(errors.length, 2);
  } finally {
    console.error = original;
  }
});

test('a click on a vote the bot forgot says the vote is over and removes the button', async () => {
  assert.deepEqual(await clickBy('42', 'carl'), {
    type: UPDATE, data: { content: '⌛ Ce vote est terminé.', allowed_mentions: { users: [] }, components: [] },
  });
});

test('the lock logs a Discord error instead of throwing, so the event handler goes on', async () => {
  await litter.command(command('alice', admin));
  api.failPatch = true;
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    await litter.enforce('g', event('alice', ['cop'], 'Ali'));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Missing Permissions/);
  } finally {
    console.error = original;
  }
});

test('when the PATCH fails on a sending, the member is not recorded in the litter', async () => {
  api.failPatch = true;
  await assert.rejects(litter.send('g', 'alice', 'test'), /Missing Permissions/);
  assert.equal(store.rows.has('g:alice'), false);
  // A member already in the litter keeps their row when a later PATCH fails
  api.failPatch = false;
  await litter.send('g', 'alice', 'test');
  api.failPatch = true;
  await assert.rejects(litter.send('g', 'alice', 'test'));
  assert.deepEqual(store.rows.get('g:alice'), { roles: ['cop'], nick: 'Ali' });
});

test('an admin action closes the open votes of the target', async () => {
  await litter.command(command('alice', { userId: 'bob' }));
  const vote = votes.find('g', 'alice', 'litter');
  await litter.command(command('alice', admin));
  assert.equal(votes.get(vote.id), null);
  assert.equal(api.messages[0].content, '⌛ Vote clos : un admin a tranché pour <@alice>.');
  assert.deepEqual(api.messages[0].components, []);
  assert.deepEqual(timers.length, 1);
  await timers[0].fn();
  assert.equal(api.messages[0].content, '⌛ Vote clos : un admin a tranché pour <@alice>.');
});
