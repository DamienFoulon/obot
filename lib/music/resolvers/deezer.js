import { ResolveError } from './errors.js';
import { fetchJson } from './http.js';
import { createTrack, searchQuery } from '../track.js';

// Deezer's public API needs no key, see https://developers.deezer.com/api
export const hosts = ['deezer.com'];

// /track/{id}, /fr/album/{id}, /en-gb/playlist/{id}
const PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|playlist)\/(\d+)/;

export function parseDeezerUrl(url) {
  const match = url.pathname.match(PATH);
  return match ? { type: match[1], id: match[2] } : null;
}

export function parseDeezer(type, data, requestedBy, limit) {
  // Errors come with a 200 status: {"error": {"type": "DataException", "message": "no data"}}
  if (data.error) throw new ResolveError("This Deezer link doesn't exist or is private 🔒");

  const toTrack = (track, cover) => createTrack({
    title: track.title,
    author: track.artist?.name,
    duration: track.duration,
    thumbnail: track.album?.cover_medium ?? cover,
    query: searchQuery(track.artist?.name ?? '', track.title),
  }, requestedBy);

  if (type === 'track') return { title: null, tracks: [toTrack(data)], truncated: false };
  const items = data.tracks?.data ?? [];
  const cover = data.cover_medium ?? data.picture_medium;
  return {
    title: data.title ?? null,
    tracks: items.slice(0, limit).map((track) => toTrack(track, cover)),
    truncated: items.length > limit || (data.nb_tracks ?? 0) > limit,
  };
}

export async function resolve(url, { requestedBy, limit }) {
  const link = parseDeezerUrl(url);
  if (!link) throw new ResolveError('Only Deezer tracks, albums and playlists are supported 🎧');
  const data = await fetchJson(`https://api.deezer.com/${link.type}/${link.id}`);
  return parseDeezer(link.type, data, requestedBy, limit);
}
