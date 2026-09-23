import { ResolveError } from './errors.js';
import { fetchJson, fetchText } from './http.js';
import { createTrack, searchQuery } from '../track.js';

/**
 * Songs and albums come from the public iTunes lookup API, see
 * https://performance-partners.apple.com/search-api
 * Playlists have no public API: their tracks are read from the page data, the least reliable source
 */

export const hosts = ['music.apple.com'];

// /us/album/discovery/697194953?i=697195462, /fr/song/one-more-time/697195462, /us/playlist/todays-hits/pl.xxx
const PATH = /^\/([a-z]{2})\/(album|song|playlist)\/(?:[^/]+\/)?([^/]+)\/?$/;

export function parseAppleMusicUrl(url) {
  const match = url.pathname.match(PATH);
  if (!match) return null;
  const [, country, type, id] = match;
  // A song opened from its album: /album/{album}/{albumId}?i={songId}
  const songId = url.searchParams.get('i');
  if (type === 'album' && songId) return { country, type: 'song', id: songId };
  return { country, type, id };
}

export function parseItunesLookup(data, requestedBy, limit) {
  const results = data.results ?? [];
  const songs = results.filter((result) => result.wrapperType === 'track' && result.kind === 'song');
  if (!songs.length) throw new ResolveError("This Apple Music link doesn't exist or isn't available 🤷");
  const album = results.find((result) => result.wrapperType === 'collection');
  return {
    title: album?.collectionName ?? null,
    tracks: songs.slice(0, limit).map((song) => createTrack({
      title: song.trackName,
      author: song.artistName,
      duration: song.trackTimeMillis / 1000,
      thumbnail: song.artworkUrl100?.replace('100x100', '600x600'),
      query: searchQuery(song.artistName, song.trackName),
    }, requestedBy)),
    truncated: songs.length > limit,
  };
}

// The page data is a tree of sections: the tracks are the items of the "trackLockup" section
function findTrackItems(node) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const items = findTrackItems(child);
      if (items) return items;
    }
  } else if (node && typeof node === 'object') {
    if (node.itemKind === 'trackLockup' && Array.isArray(node.items)) return node.items;
    for (const child of Object.values(node)) {
      const items = findTrackItems(child);
      if (items) return items;
    }
  }
  return null;
}

export function parseApplePlaylistPage(html, requestedBy, limit) {
  const data = html.match(/<script type="application\/json" id="serialized-server-data">(.*?)<\/script>/s)?.[1];
  const items = data && findTrackItems(JSON.parse(data));
  if (!items) throw new ResolveError("I couldn't read this Apple Music playlist, is it public ? 🔒");
  const metadata = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/s)?.[1];

  return {
    title: metadata ? JSON.parse(metadata).name ?? null : null,
    tracks: items.slice(0, limit).map((item) => createTrack({
      title: item.title,
      author: item.artistName,
      duration: item.duration / 1000,
      // "https://.../{w}x{h}bb.{f}" -> "https://.../300x300bb.jpg"
      thumbnail: item.artwork?.dictionary?.url?.replace('{w}', '300').replace('{h}', '300').replace('{f}', 'jpg'),
      query: searchQuery(item.artistName ?? '', item.title),
    }, requestedBy)),
    truncated: items.length > limit,
  };
}

export async function resolve(url, { requestedBy, limit }) {
  const link = parseAppleMusicUrl(url);
  if (!link) throw new ResolveError('Only Apple Music songs, albums and playlists are supported 🎧');
  if (link.type === 'playlist') return parseApplePlaylistPage(await fetchText(url.href), requestedBy, limit);

  const lookup = link.type === 'song'
    ? `https://itunes.apple.com/lookup?id=${link.id}&country=${link.country}`
    : `https://itunes.apple.com/lookup?id=${link.id}&entity=song&country=${link.country}`;
  return parseItunesLookup(await fetchJson(lookup), requestedBy, limit);
}
