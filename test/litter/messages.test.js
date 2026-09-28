import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REFUSALS, REPLIES, buildReleased, buildSent, buildVote, buildVoteExpired, buildVoteFailed, buildVoteReached, voteLink,
} from '../../lib/litter/messages.js';

const vote = (extra = {}) => ({
  id: '7', kind: 'litter', guildId: 'g', targetId: 't', voters: ['a', 'b'], channelId: 'c', messageId: 'm', expiresAt: 0, ...extra,
});

test('the vote message names the proposal, the count, the voters and carries the button', () => {
  const message = buildVote(vote());
  assert.equal(message.content, "🗳️ <@a> propose d'envoyer <@t> dans la litière de Pipette 💩 · **2/4** · votes : <@a>, <@b>");
  assert.deepEqual(message.allowed_mentions, { users: ['t', 'a', 'b'] });
  assert.deepEqual(message.components, [
    { type: 1, components: [{ type: 2, style: 4, label: '💩 Voter', custom_id: 'litter_vote:7' }] },
  ]);
  const release = buildVote(vote({ kind: 'release' }));
  assert.equal(release.content, '🗳️ <@a> propose de libérer <@t> de la litière 🕊️ · **2/4** · votes : <@a>, <@b>');
  assert.deepEqual(release.components[0].components[0], { type: 2, style: 3, label: '🕊️ Voter', custom_id: 'litter_vote:7' });
});

test('the results drop the button', () => {
  const full = vote({ voters: ['a', 'b', 'c', 'd'] });
  const reached = buildVoteReached(full);
  assert.equal(reached.content, '💩 Le peuple a parlé : <@t> part à la litière de Pipette ! (4 votes : <@a>, <@b>, <@c>, <@d>)');
  assert.deepEqual(reached.components, []);
  assert.deepEqual(reached.allowed_mentions, { users: ['t', 'a', 'b', 'c', 'd'] });
  assert.equal(
    buildVoteReached({ ...full, kind: 'release' }).content,
    '🕊️ Le peuple pardonne : <@t> sort de la litière. (4 votes : <@a>, <@b>, <@c>, <@d>)',
  );
  assert.deepEqual(buildVoteExpired(full), {
    content: '⌛ Vote expiré : <@t> reste où il est.', allowed_mentions: { users: ['t'] }, components: [],
  });
  assert.equal(buildVoteFailed(full, "<@t> n'est plus sur le serveur 👀").content, "⌛ Trop tard : <@t> n'est plus sur le serveur 👀");
  assert.equal(voteLink(full), 'https://discord.com/channels/g/c/m');
});

test('announcements mention the target and the author only', () => {
  assert.deepEqual(buildSent('t', 'a'), {
    content: '💩 <@t> a fait de la merde : direction la litière de Pipette ! (par <@a>)',
    allowed_mentions: { users: ['t', 'a'] },
    components: [],
  });
  assert.equal(buildReleased('t', 'a').content, '🕊️ <@t> sort de la litière (par <@a>), Pipette a nettoyé.');
});

test('refusals and replies', () => {
  assert.equal(REFUSALS.notConfigured(), "La litière n'est pas configurée 🐈");
  assert.equal(REFUSALS.self(), 'Tu ne peux pas te mettre toi-même à la litière 💩');
  assert.equal(REFUSALS.gone('t'), "<@t> n'est plus sur le serveur 👀");
  assert.equal(REFUSALS.bot(), 'Je ne peux pas envoyer un bot à la litière 🤖');
  assert.equal(REFUSALS.owner(), 'Je ne peux pas envoyer le propriétaire du serveur à la litière 👑');
  assert.equal(REFUSALS.above('t'), '<@t> a un rôle au-dessus du mien, je ne peux pas y toucher ⬆️');
  assert.equal(REPLIES.sent(), "C'est fait, direction la litière 💩");
  assert.equal(REPLIES.released(), "C'est fait, Pipette a nettoyé 🕊️");
  assert.equal(REPLIES.started(), 'Vote lancé 👇');
  assert.equal(REPLIES.counted(vote()), 'Ta voix est comptée (2/4) 🗳️');
  assert.equal(REPLIES.duplicate(), 'Tu as déjà voté 🗳️');
  assert.equal(REPLIES.target(), 'Tu ne peux pas voter contre toi-même 💩');
  assert.equal(REPLIES.reached(), 'Le peuple a parlé 👇');
  assert.equal(REPLIES.closed(), 'Ce vote est terminé ⌛');
});
