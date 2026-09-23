import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAdded, formatDuration, formatQueue, formatTrack } from '../lib/music/format.js';

const track = (title, duration = 60) => ({ title, author: 'Artist', duration, requestedBy: 'u1' });

test('durations', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3661), '1:01:01');
  assert.equal(formatDuration(null), '--:--');
});

test('titles are escaped and shortened', () => {
  assert.equal(formatTrack(track('**Bold**')), '**\\*\\*Bold\\*\\*** — Artist');
  assert.ok(formatTrack(track('x'.repeat(200))).length < 120);
});

test('added texts', () => {
  assert.equal(formatAdded({ title: null, tracks: [track('A')], truncated: false }, 1), '✅ Added **A** — Artist');
  assert.equal(formatAdded({ title: 'Mix', tracks: [track('A'), track('B')], truncated: true }, 2),
    '✅ Added 2 tracks from **Mix** (limited to the first 100)');
  assert.equal(formatAdded({ title: 'Mix', tracks: [track('A'), track('B'), track('C')], truncated: false }, 1),
    '✅ Added 1 tracks from **Mix**, the queue is full: 2 tracks were not added');
  assert.equal(formatAdded({ title: null, tracks: [track('A')], truncated: false }, 0), 'The queue is full (500 tracks) 🚫');
});

test('the queue shows the next 10 tracks', () => {
  const state = { current: track('Now', 100), queue: Array.from({ length: 12 }, (_, i) => track(`T${i + 1}`, 10)), loop: 'queue', paused: false };
  const text = formatQueue(state);
  assert.match(text, /🎶 \*\*Now playing:\*\* \*\*Now\*\* — Artist \(1:40\)/);
  assert.match(text, /^10\. \*\*T10\*\*/m);
  assert.doesNotMatch(text, /T11/);
  assert.match(text, /… and 2 more/);
  assert.match(text, /12 tracks in the queue · 3:40 in total · loop: queue/);
  assert.equal(formatQueue({ current: null, queue: [], loop: 'off', paused: false }), 'The queue is empty 🔇');
});
