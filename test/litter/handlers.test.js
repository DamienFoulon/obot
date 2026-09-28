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
