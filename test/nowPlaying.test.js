import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEndedMessage, buildNowPlayingMessage } from '../lib/music/nowPlaying.js';

const track = { title: 'One More Time', author: 'Daft Punk', duration: 320, thumbnail: 'https://img/x.jpg', requestedBy: 'u1' };
const container = (message) => message.components[0];
const buttons = (message) => container(message).components.at(-1).components;

test('a playing track, with its thumbnail and the controls', () => {
  const message = buildNowPlayingMessage({ current: track, queue: [], loop: 'off', paused: false });
  const [section] = container(message).components;
  assert.equal(section.type, 9);
  assert.equal(section.accessory.media.url, 'https://img/x.jpg');
  assert.match(section.components[0].content, /🎶 Now playing[\s\S]*One More Time[\s\S]*5:20 · requested by <@u1>/);
  assert.deepEqual(buttons(message).map((b) => b.custom_id), ['music_pause', 'music_skip', 'music_loop', 'music_stop']);
  assert.deepEqual(message.allowed_mentions, { parse: [] });
});

test('paused and looping', () => {
  const message = buildNowPlayingMessage({ current: { ...track, thumbnail: null }, queue: [track], loop: 'queue', paused: true });
  const [text] = container(message).components;
  assert.equal(text.type, 10);
  assert.match(text.content, /⏸️ Paused[\s\S]*\*\*Next:\*\* \*\*One More Time\*\*/);
  assert.equal(buttons(message)[0].label, 'Resume');
  assert.equal(buttons(message)[2].label, 'Loop: queue');
});

test('nothing playing: only the stop button', () => {
  const message = buildNowPlayingMessage({ current: null, queue: [], loop: 'off', paused: false });
  assert.deepEqual(buttons(message).map((b) => b.custom_id), ['music_stop']);
});

test('ended messages have no buttons', () => {
  const message = buildEndedMessage('disconnected');
  assert.equal(container(message).components.length, 1);
  assert.match(container(message).components[0].content, /Disconnected/);
});
