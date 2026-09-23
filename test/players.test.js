import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlayerRegistry } from '../lib/music/players.js';
import { FakeEngine, FakeUi, flush } from './helpers/fakes.js';

const options = { guildId: 'g1', channelId: 'c1', textChannelId: 't1' };

test('two /play at once share one voice connection and one player', async () => {
  let connects = 0;
  const registry = createPlayerRegistry({
    connect: async () => { connects++; await flush(); return new FakeEngine(); },
    createUi: () => new FakeUi(),
  });
  const [first, second] = await Promise.all([registry.getOrCreatePlayer(options), registry.getOrCreatePlayer(options)]);
  assert.equal(connects, 1);
  assert.equal(first, second);
  assert.equal(registry.getPlayer('g1'), first);
  first.stop();
  assert.equal(registry.getPlayer('g1'), null);
});

test('a failed connection can be tried again', async () => {
  let attempts = 0;
  const registry = createPlayerRegistry({
    connect: async () => { attempts++; if (attempts === 1) throw new Error('no voice'); return new FakeEngine(); },
    createUi: () => new FakeUi(),
  });
  await assert.rejects(registry.getOrCreatePlayer(options), /no voice/);
  assert.ok(await registry.getOrCreatePlayer(options));
});
