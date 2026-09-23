import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseDeezer, parseDeezerUrl } from '../../lib/music/resolvers/deezer.js';
import { ResolveError } from '../../lib/music/resolvers/errors.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));

test('Deezer URLs, with or without language', () => {
  assert.deepEqual(parseDeezerUrl(new URL('https://www.deezer.com/fr/track/3135556')), { type: 'track', id: '3135556' });
  assert.deepEqual(parseDeezerUrl(new URL('https://www.deezer.com/album/302127?utm_source=x')), { type: 'album', id: '302127' });
  assert.deepEqual(parseDeezerUrl(new URL('https://www.deezer.com/en-gb/playlist/908622995')), { type: 'playlist', id: '908622995' });
  assert.equal(parseDeezerUrl(new URL('https://www.deezer.com/fr/artist/27')), null);
});

test('a Deezer track', () => {
  const { title, tracks } = parseDeezer('track', fixture('deezer-track.json'), 'u1', 100);
  assert.equal(title, null);
  assert.equal(tracks[0].title, 'Harder, Better, Faster, Stronger');
  assert.equal(tracks[0].author, 'Daft Punk');
  assert.equal(tracks[0].duration, 226);
  assert.equal(tracks[0].query, 'Daft Punk Harder, Better, Faster, Stronger');
});

test('a Deezer album', () => {
  const { title, tracks } = parseDeezer('album', fixture('deezer-album.json'), 'u1', 100);
  assert.equal(title, 'Discovery');
  assert.equal(tracks.length, 14);
  assert.equal(tracks[0].title, 'One More Time');
  assert.match(tracks[0].thumbnail, /^https:\/\//);
});

test('a Deezer playlist, truncated to the limit', () => {
  const { title, tracks, truncated } = parseDeezer('playlist', fixture('deezer-playlist.json'), 'u1', 2);
  assert.ok(title);
  assert.equal(tracks.length, 2);
  assert.equal(truncated, true);
});

test('a missing Deezer track', () => {
  assert.throws(() => parseDeezer('track', fixture('deezer-error.json'), 'u1', 100), ResolveError);
});
