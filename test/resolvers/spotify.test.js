import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ResolveError } from '../../lib/music/resolvers/errors.js';
import { parseSpotifyEmbed, parseSpotifyUrl } from '../../lib/music/resolvers/spotify.js';

const fixture = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

test('Spotify URLs, with tracking parameters and localized paths', () => {
  assert.deepEqual(parseSpotifyUrl(new URL('https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV?si=abc')), { type: 'track', id: '0DiWol3AO6WpXZgp0goxAV' });
  assert.deepEqual(parseSpotifyUrl(new URL('https://open.spotify.com/intl-fr/album/2noRn2Aes5aoNVsU6iWThc')), { type: 'album', id: '2noRn2Aes5aoNVsU6iWThc' });
  assert.deepEqual(parseSpotifyUrl(new URL('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')), { type: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' });
  assert.equal(parseSpotifyUrl(new URL('https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi')), null);
});

test('a Spotify track', () => {
  const { title, tracks, truncated } = parseSpotifyEmbed(fixture('spotify-track.html'), 'u1', 100);
  assert.equal(title, null);
  assert.equal(truncated, false);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].title, 'One More Time');
  assert.equal(tracks[0].author, 'Daft Punk');
  assert.equal(tracks[0].duration, 320);
  assert.equal(tracks[0].query, 'Daft Punk One More Time');
  assert.equal(tracks[0].url, null);
});

test('a Spotify album', () => {
  const { title, tracks } = parseSpotifyEmbed(fixture('spotify-album.html'), 'u1', 100);
  assert.equal(title, 'Discovery');
  assert.equal(tracks.length, 14);
  assert.equal(tracks[0].query, 'Daft Punk One More Time');
});

test('a Spotify playlist, truncated to the limit', () => {
  const all = parseSpotifyEmbed(fixture('spotify-playlist.html'), 'u1', 100);
  assert.ok(all.tracks.length > 3);
  assert.ok(all.tracks.every((t) => t.title && t.author && t.query));
  const limited = parseSpotifyEmbed(fixture('spotify-playlist.html'), 'u1', 3);
  assert.equal(limited.tracks.length, 3);
  assert.equal(limited.truncated, true);
});

test('a page without data', () => {
  assert.throws(() => parseSpotifyEmbed('<html></html>', 'u1', 100), ResolveError);
});

test('a Spotify playlist of 100 tracks may be longer: the embed page stops at 100', () => {
  const trackList = Array.from({ length: 100 }, (_, i) => ({ title: `T${i}`, subtitle: 'Artist', duration: 1000 }));
  const data = { props: { pageProps: { state: { data: { entity: { type: 'playlist', name: 'Big', trackList } } } } } };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
  const { tracks, truncated } = parseSpotifyEmbed(html, 'u1', 100);
  assert.equal(tracks.length, 100);
  assert.equal(truncated, true);
});
