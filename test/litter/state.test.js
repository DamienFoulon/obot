import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NICK, getTargetRefusal, hasDrifted, litterState, restorableRoles } from '../../lib/litter/state.js';

const roles = () => [
  { id: 'g', name: '@everyone', position: 0, managed: false, permissions: '0' },
  { id: 'poop', name: '💩', position: 1, managed: false, permissions: '0' },
  { id: 'booster', name: 'Server Booster', position: 4, managed: true, permissions: '0' },
  { id: 'cop', name: 'COP1', position: 5, managed: false, permissions: '0' },
  { id: 'botrole', name: 'OBOT', position: 10, managed: true, permissions: '0' },
  { id: 'goat', name: 'GOAT', position: 12, managed: false, permissions: '0' },
];
const guild = () => ({ id: 'g', owner_id: 'own', roles: roles() });
const member = (id, memberRoles = [], nick = null, user = {}) => ({ user: { id, username: id, ...user }, roles: memberRoles, nick });
const bot = member('bot', ['botrole'], null, { bot: true });

test('refusals: gone, bot, owner, at or above the bot', () => {
  const refusal = (target, targetId = target?.user.id) => getTargetRefusal({ guild: guild(), target, targetId, bot });
  assert.equal(refusal(null, 'x'), 'gone');
  assert.equal(refusal(member('other', [], null, { bot: true })), 'bot');
  assert.equal(refusal(member('own')), 'owner');
  assert.equal(refusal(member('greg', ['goat'])), 'above');
  assert.equal(refusal(member('twin', ['botrole'])), 'above');
  assert.equal(refusal(member('alice', ['cop', 'booster'])), null);
  assert.equal(refusal(member('bob')), null);
});

test('the litter state saves the removable roles and keeps the managed ones', () => {
  assert.equal(NICK, '💩');
  assert.deepEqual(litterState(member('alice', ['cop', 'booster'], 'Ali'), roles(), 'poop'), {
    saved: ['cop'], roles: ['booster', 'poop'], nick: '💩',
  });
  assert.deepEqual(litterState(member('bob'), roles(), 'poop'), { saved: [], roles: ['poop'], nick: '💩' });
  // Already in the litter: nothing more to save
  assert.deepEqual(litterState(member('bob', ['poop'], '💩'), roles(), 'poop').saved, []);
});

test('drift: a role back, the litter role lost or the nickname changed', () => {
  assert.equal(hasDrifted(member('a', ['poop', 'booster'], '💩'), roles(), 'poop'), false);
  assert.equal(hasDrifted(member('a', ['poop', 'cop'], '💩'), roles(), 'poop'), true);
  assert.equal(hasDrifted(member('a', ['booster'], '💩'), roles(), 'poop'), true);
  assert.equal(hasDrifted(member('a', ['poop'], 'Ali'), roles(), 'poop'), true);
  assert.equal(hasDrifted(member('a', ['poop'], null), roles(), 'poop'), true);
});

test('release restores the saved roles that still exist below the bot, plus the managed ones', () => {
  const restored = restorableRoles(['cop', 'deleted', 'goat', 'booster'], member('a', ['poop', 'booster'], '💩'), roles(), bot);
  assert.deepEqual(restored, ['booster', 'cop']);
  assert.deepEqual(restorableRoles([], member('a', ['poop'], '💩'), roles(), bot), []);
});
