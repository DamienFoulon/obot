import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { ALONE_TIMEOUT, IDLE_TIMEOUT, Player } from '../lib/music/player.js';
import { FakeEngine, FakeUi, flush, tracks } from './helpers/fakes.js';

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

function setup() {
  const engine = new FakeEngine();
  const ui = new FakeUi();
  let destroyed = 0;
  const player = new Player({ engine, ui, onDestroy: () => destroyed++ });
  return { engine, ui, player, destroyedCount: () => destroyed };
}

test('plays the tracks in order', async () => {
  const { engine, player } = setup();
  assert.equal(player.add(tracks('a', 'b')), 2);
  await flush();
  assert.deepEqual(engine.played, ['a']);
  assert.equal(player.current.title, 'a');
  engine.finish();
  await flush();
  assert.deepEqual(engine.played, ['a', 'b']);
});

test('the queue is capped, the current track included', async () => {
  const { player } = setup();
  player.add(tracks('first'));
  await flush();
  const many = Array.from({ length: 600 }, (_, i) => ({ title: `t${i}` }));
  assert.equal(player.add(many), 499);
  assert.equal(player.add(tracks('one more')), 0);
});

test('skip goes to the next track, even when looping on the track', async () => {
  const { engine, player } = setup();
  player.add(tracks('a', 'b'));
  await flush();
  player.setLoop('track');
  assert.equal(player.skip(), true);
  await flush();
  assert.deepEqual(engine.played, ['a', 'b']);
});

test('loop on the track replays it, loop on the queue cycles', async () => {
  const { engine, player } = setup();
  player.add(tracks('a', 'b'));
  await flush();
  player.setLoop('track');
  engine.finish();
  await flush();
  assert.deepEqual(engine.played, ['a', 'a']);
  player.setLoop('queue');
  engine.finish();
  await flush();
  engine.finish();
  await flush();
  assert.deepEqual(engine.played, ['a', 'a', 'b', 'a']);
});

test('skipping a track that is still loading plays the next one once it has started', async () => {
  const { engine, player } = setup();
  let release;
  engine.gate = new Promise((resolve) => { release = resolve; });
  player.add(tracks('a', 'b', 'c'));
  await flush();
  assert.equal(player.skip(), true);
  assert.equal(engine.stopped, 0);
  engine.gate = null;
  release();
  await flush();
  assert.equal(engine.stopped, 1);
  assert.deepEqual(engine.played, ['a', 'b']);
});

test('destroying while a track is loading plays nothing afterwards', async () => {
  const { engine, ui, player } = setup();
  let release;
  engine.gate = new Promise((resolve) => { release = resolve; });
  player.add(tracks('a', 'b'));
  await flush();
  player.stop();
  engine.gate = null;
  release();
  await flush();
  assert.equal(engine.destroyed, true);
  assert.deepEqual(engine.played, ['a']);
  assert.deepEqual(ui.calls.at(-1), ['end', 'stopped']);
});

test('a failing track is announced and skipped', async () => {
  const { engine, ui, player } = setup();
  engine.failing.add('a');
  player.add(tracks('a', 'b'));
  await flush();
  assert.deepEqual(engine.played, ['a', 'b']);
  assert.ok(ui.calls.some(([type, text]) => type === 'warn' && text === "⚠️ Couldn't play **a**, skipping"));
  assert.equal(player.current.title, 'b');
});

test('3 failures in a row stop the playback', async () => {
  const { engine, ui, player, destroyedCount } = setup();
  for (const title of ['a', 'b', 'c']) engine.failing.add(title);
  player.add(tracks('a', 'b', 'c', 'd'));
  await flush();
  assert.deepEqual(engine.played, ['a', 'b', 'c']);
  assert.equal(ui.ended, 'failed');
  assert.equal(engine.destroyed, true);
  assert.equal(destroyedCount(), 1);
});

test('leaves after 5 minutes without anything to play', async () => {
  const { engine, ui, player } = setup();
  player.add(tracks('a'));
  await flush();
  engine.finish();
  await flush();
  assert.equal(player.current, null);
  mock.timers.tick(IDLE_TIMEOUT - 1);
  assert.equal(ui.ended, null);
  mock.timers.tick(1);
  assert.equal(ui.ended, 'idle');
});

test('a new track cancels the idle timer', async () => {
  const { engine, ui, player } = setup();
  player.add(tracks('a'));
  await flush();
  engine.finish();
  await flush();
  player.add(tracks('b'));
  await flush();
  mock.timers.tick(IDLE_TIMEOUT);
  assert.equal(ui.ended, null);
});

test('leaves after 60 s alone, unless someone comes back', async () => {
  const { ui, player } = setup();
  player.add(tracks('a'));
  await flush();
  player.setAlone(true);
  mock.timers.tick(ALONE_TIMEOUT / 2);
  player.setAlone(false);
  mock.timers.tick(ALONE_TIMEOUT);
  assert.equal(ui.ended, null);
  player.setAlone(true);
  mock.timers.tick(ALONE_TIMEOUT);
  assert.equal(ui.ended, 'alone');
});

test('a lost voice connection destroys the player', async () => {
  const { engine, ui, player } = setup();
  player.add(tracks('a'));
  await flush();
  engine.disconnect();
  assert.equal(ui.ended, 'disconnected');
  assert.equal(player.destroyed, true);
});

test('pause, resume and volume', async () => {
  const { engine, player } = setup();
  assert.equal(player.pause(), false);
  player.add(tracks('a'));
  await flush();
  assert.equal(player.pause(), true);
  assert.equal(engine.paused, true);
  assert.equal(player.pause(), false);
  assert.equal(player.resume(), true);
  assert.equal(engine.paused, false);
  player.setVolume(150);
  assert.equal(engine.volume, 1.5);
  assert.equal(player.volume, 150);
});

test('a pause refused by the engine (audio still buffering) leaves the player playing', async () => {
  const { engine, ui, player } = setup();
  player.add(tracks('a'));
  await flush();
  engine.canPause = false;
  const updates = ui.calls.length;
  assert.equal(player.pause(), false);
  assert.equal(player.paused, false);
  assert.equal(ui.calls.length, updates);
});
