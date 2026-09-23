import { ResolveError } from './errors.js';
import { fetchText } from './http.js';
import { createTrack, searchQuery } from '../track.js';

/**
 * Spotify's Web API needs a Premium owner and can't read other users' playlists since February 2026:
 * the public embed page gives the tracks without any key
 */

export const hosts = ['open.spotify.com'];

// The embed page lists 100 tracks at most, without the total: a full page may hide more
const EMBED_MAX_TRACKS = 100;

// /track/{id}, /intl-fr/album/{id}, /playlist/{id}
const PATH = /^\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/;

export function parseSpotifyUrl(url) {
  const match = url.pathname.match(PATH);
  return match ? { type: match[1], id: match[2] } : null;
}

export function parseSpotifyEmbed(html, requestedBy, limit) {
  const json = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)?.[1];
  const entity = json && JSON.parse(json).props?.pageProps?.state?.data?.entity;
  if (!entity) throw new ResolveError("I couldn't read this Spotify link, is it public ? 🔒");

  const thumbnail = entity.visualIdentity?.image?.[0]?.url ?? entity.coverArt?.sources?.[0]?.url;
  const toTrack = (title, author, durationMs) => createTrack({
    title, author, duration: durationMs / 1000, thumbnail, query: searchQuery(author, title),
  }, requestedBy);

  if (entity.type === 'track') {
    const author = entity.artists?.map((artist) => artist.name).join(', ');
    return { title: null, tracks: [toTrack(entity.name, author, entity.duration)], truncated: false };
  }
  const items = entity.trackList ?? [];
  return {
    title: entity.name,
    tracks: items.slice(0, limit).map((item) => toTrack(item.title, item.subtitle, item.duration)),
    truncated: items.length > limit || items.length >= EMBED_MAX_TRACKS,
  };
}

export async function resolve(url, { requestedBy, limit }) {
  const link = parseSpotifyUrl(url);
  if (!link) throw new ResolveError('Only Spotify tracks, albums and playlists are supported 🎧');
  const html = await fetchText(`https://open.spotify.com/embed/${link.type}/${link.id}`);
  return parseSpotifyEmbed(html, requestedBy, limit);
}
