import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as appleMusic from '../../lib/music/resolvers/appleMusic.js';
import * as deezer from '../../lib/music/resolvers/deezer.js';
import { isShortLink, parseUrl, pickResolver } from '../../lib/music/resolvers/index.js';
import * as soundcloud from '../../lib/music/resolvers/soundcloud.js';
import * as spotify from '../../lib/music/resolvers/spotify.js';
import * as youtube from '../../lib/music/resolvers/youtube.js';

const pick = (link) => pickResolver(new URL(link));

test('texts are not URLs', () => {
  assert.equal(parseUrl('daft punk one more time'), null);
  assert.equal(parseUrl('spotify:track:0DiWol3AO6WpXZgp0goxAV'), null);
  assert.equal(parseUrl('ftp://example.com/song.mp3'), null);
  assert.equal(parseUrl('https://youtu.be/FGBhQbmPwH8').hostname, 'youtu.be');
});

test('every URL form goes to the right resolver', () => {
  assert.equal(pick('https://www.youtube.com/watch?v=FGBhQbmPwH8&si=abc'), youtube);
  assert.equal(pick('https://m.youtube.com/watch?v=FGBhQbmPwH8'), youtube);
  assert.equal(pick('https://youtu.be/FGBhQbmPwH8'), youtube);
  assert.equal(pick('https://music.youtube.com/watch?v=FGBhQbmPwH8'), youtube);
  assert.equal(pick('https://YOUTUBE.com/playlist?list=PL1'), youtube);
  assert.equal(pick('https://soundcloud.com/flume/sets/palaces'), soundcloud);
  assert.equal(pick('https://m.soundcloud.com/flume/dhlc'), soundcloud);
  assert.equal(pick('https://open.spotify.com/intl-fr/track/0DiWol3AO6WpXZgp0goxAV?si=x'), spotify);
  assert.equal(pick('https://www.deezer.com/fr/track/3135556'), deezer);
  assert.equal(pick('https://music.apple.com/fr/album/discovery/697194953?i=697195462'), appleMusic);
  assert.equal(pick('https://example.com/song.mp3'), null);
});

test('share links are expanded first', () => {
  assert.equal(isShortLink(new URL('https://spotify.link/ZKr2ueNoXVb')), true);
  assert.equal(isShortLink(new URL('https://link.deezer.com/s/31ZqlXdpVsJoFJdbyWXC6')), true);
  assert.equal(isShortLink(new URL('https://deezer.page.link/abc')), true);
  assert.equal(isShortLink(new URL('https://on.soundcloud.com/abc')), true);
  assert.equal(isShortLink(new URL('https://youtu.be/FGBhQbmPwH8')), false);
});
