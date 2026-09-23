import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  parseAppleMusicUrl, parseApplePlaylistPage, parseItunesLookup,
} from '../../lib/music/resolvers/appleMusic.js';
import { ResolveError } from '../../lib/music/resolvers/errors.js';

const text = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

test('Apple Music URLs', () => {
  assert.deepEqual(parseAppleMusicUrl(new URL('https://music.apple.com/us/album/discovery/697194953?i=697195462')), { country: 'us', type: 'song', id: '697195462' });
  assert.deepEqual(parseAppleMusicUrl(new URL('https://music.apple.com/fr/album/discovery/697194953')), { country: 'fr', type: 'album', id: '697194953' });
  assert.deepEqual(parseAppleMusicUrl(new URL('https://music.apple.com/us/song/one-more-time/697195462')), { country: 'us', type: 'song', id: '697195462' });
  assert.deepEqual(parseAppleMusicUrl(new URL('https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb')), { country: 'us', type: 'playlist', id: 'pl.f4d106fed2bd41149aaacabb233eb5eb' });
  assert.equal(parseAppleMusicUrl(new URL('https://music.apple.com/us/artist/daft-punk/5468295')), null);
});

test('an Apple Music song', () => {
  const { title, tracks } = parseItunesLookup(JSON.parse(text('itunes-song.json')), 'u1', 100);
  assert.equal(title, null);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].title, 'One More Time');
  assert.equal(tracks[0].author, 'Daft Punk');
  assert.equal(tracks[0].duration, 320);
  assert.match(tracks[0].thumbnail, /600x600/);
});

test('an Apple Music album', () => {
  const { title, tracks } = parseItunesLookup(JSON.parse(text('itunes-album.json')), 'u1', 100);
  assert.equal(title, 'Discovery');
  assert.equal(tracks.length, 14);
});

test('an empty lookup', () => {
  assert.throws(() => parseItunesLookup({ resultCount: 0, results: [] }, 'u1', 100), ResolveError);
});

test('an Apple Music playlist page', () => {
  const { title, tracks } = parseApplePlaylistPage(text('apple-playlist.html'), 'u1', 100);
  assert.equal(title, 'Today’s Hits');
  assert.ok(tracks.length > 3);
  assert.ok(tracks.every((t) => t.title && t.author !== 'Unknown artist' && t.duration));
  assert.match(tracks[0].thumbnail, /300x300bb\.jpg$/);
});

test('a playlist page without data', () => {
  assert.throws(() => parseApplePlaylistPage('<html></html>', 'u1', 100), ResolveError);
});
