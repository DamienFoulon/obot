import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseYtDlpInfo, titleFromUrl } from '../../lib/music/resolvers/ytdlpInfo.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));

test('a YouTube video', () => {
  const result = parseYtDlpInfo(fixture('youtube-video.json'), 'u1', 100);
  assert.equal(result.title, null);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.tracks, [{
    title: 'Daft Punk - One More Time (Official Video)',
    author: 'Daft Punk',
    duration: 321,
    thumbnail: result.tracks[0].thumbnail,
    url: 'https://www.youtube.com/watch?v=FGBhQbmPwH8',
    query: null,
    requestedBy: 'u1',
  }]);
  assert.match(result.tracks[0].thumbnail, /^https:\/\/i\.ytimg\.com\//);
});

test('a YouTube playlist', () => {
  const result = parseYtDlpInfo(fixture('youtube-playlist.json'), 'u1', 100);
  assert.equal(result.title, 'Daft Punk - Discovery (Full Album)');
  assert.equal(result.tracks.length, 14);
  assert.equal(result.tracks[0].title, 'Daft Punk - One More Time (Official Audio)');
  assert.equal(result.tracks[0].url, 'https://www.youtube.com/watch?v=A2VpR8HahKc');
  assert.equal(result.truncated, false);
});

test('a playlist longer than the limit is truncated', () => {
  const result = parseYtDlpInfo(fixture('youtube-playlist.json'), 'u1', 5);
  assert.equal(result.tracks.length, 5);
  assert.equal(result.truncated, true);
});

test('skips deleted and private videos', () => {
  const info = {
    _type: 'playlist',
    title: 'Mixed',
    entries: [
      { title: '[Deleted video]', url: 'https://www.youtube.com/watch?v=a' },
      { title: '[Private video]', url: 'https://www.youtube.com/watch?v=b' },
      null,
      { title: 'Fine', channel: 'Someone', duration: 10, url: 'https://www.youtube.com/watch?v=c' },
    ],
  };
  const result = parseYtDlpInfo(info, 'u1', 100);
  assert.deepEqual(result.tracks.map((t) => t.title), ['Fine']);
});

test('a SoundCloud set, whose flat entries only have a URL', () => {
  const result = parseYtDlpInfo(fixture('soundcloud-set.json'), 'u1', 100);
  assert.equal(result.title, 'Palaces');
  assert.equal(result.tracks[0].title, 'Highest building feat oklou');
  assert.equal(result.tracks[0].author, 'Flume');
  assert.equal(result.tracks[0].url, 'https://soundcloud.com/flume/highest-building-feat-oklou');
});

test('titleFromUrl', () => {
  assert.equal(titleFromUrl('https://soundcloud.com/flume/say-nothing-feat-may-a'), 'Say nothing feat may a');
});
