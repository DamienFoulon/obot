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
  assert.deepEqual(await clickBy(vote.id, 'fay'), { type: UPDATE, data: { components: [] } });
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
  assert.deepEqual(await clickBy(vote.id, 'carl'), { type: UPDATE, data: { components: [] } });
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
  assert.deepEqual(await clickBy('42', 'carl'), { type: UPDATE, data: { components: [] } });
});
