import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { THRESHOLD, VOTE_TTL_MS, createVotes } from '../../lib/litter/votes.js';

let now;
let votes;

beforeEach(() => {
  now = 1_000_000;
  votes = createVotes({ now: () => now });
});

const open = ({ targetId = 't', kind = 'litter', authorId = 'a', guildId = 'g' } = {}) => (
  votes.open({ guildId, targetId, kind, authorId, channelId: 'c' })
);

test('the threshold is 4 voices and a vote lives 5 minutes', () => {
  assert.equal(THRESHOLD, 4);
  assert.equal(VOTE_TTL_MS, 5 * 60 * 1000);
});

test('opening a vote counts the author, and the vote is found by target and kind', () => {
  const vote = open();
  assert.deepEqual(vote, {
    id: '1', guildId: 'g', targetId: 't', kind: 'litter', voters: ['a'], channelId: 'c', messageId: null, expiresAt: now + VOTE_TTL_MS,
  });
  assert.equal(votes.find('g', 't', 'litter'), vote);
  assert.equal(votes.find('g', 't', 'release'), null);
  assert.equal(votes.find('other', 't', 'litter'), null);
  assert.equal(votes.get('1'), vote);
  assert.equal(votes.get('nope'), null);
  assert.equal(open({ targetId: 'u' }).id, '2');
});

test('a voice per member, none for the target, the 4th one reaches and closes the vote', () => {
  const vote = open();
  assert.equal(votes.cast(vote, 'a'), 'duplicate');
  assert.equal(votes.cast(vote, 't'), 'target');
  assert.equal(votes.cast(vote, 'b'), 'counted');
  assert.equal(votes.cast(vote, 'c'), 'counted');
  assert.equal(votes.cast(vote, 'd'), 'reached');
  assert.deepEqual(vote.voters, ['a', 'b', 'c', 'd']);
  assert.equal(votes.get(vote.id), null);
  assert.equal(votes.find('g', 't', 'litter'), null);
  assert.equal(votes.cast(vote, 'e'), 'closed');
});

test('a vote expires after 5 minutes', () => {
  const vote = open();
  now += VOTE_TTL_MS - 1;
  assert.equal(votes.isExpired(vote), false);
  assert.equal(votes.find('g', 't', 'litter'), vote);
  now += 1;
  assert.equal(votes.isExpired(vote), true);
  assert.equal(votes.find('g', 't', 'litter'), null);
  assert.equal(votes.cast(vote, 'b'), 'closed');
  assert.equal(votes.get(vote.id), null);
});

test('closing a vote forgets it', () => {
  const vote = open();
  votes.close(vote);
  assert.equal(votes.get(vote.id), null);
  assert.equal(votes.cast(vote, 'b'), 'closed');
});
