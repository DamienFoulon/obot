import * as appleMusic from './appleMusic.js';
import * as deezer from './deezer.js';
import { ResolveError } from './errors.js';
import { followRedirects } from './http.js';
import * as soundcloud from './soundcloud.js';
import * as spotify from './spotify.js';
import * as youtube from './youtube.js';
import { PLAYLIST_LIMIT } from '../limits.js';

/**
 * Turns what the member typed in /play into tracks: a link of a supported service, or a text searched on YouTube
 */

const RESOLVERS = [youtube, soundcloud, spotify, deezer, appleMusic];

// Share links, which redirect to the real page
const SHORT_LINK_HOSTS = ['spotify.link', 'deezer.page.link', 'link.deezer.com', 'on.soundcloud.com'];

export function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(/^(www|m)\./, '');
}

export function parseUrl(query) {
  try {
    const url = new URL(query);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

export function pickResolver(url) {
  const host = normalizeHost(url.hostname);
  return RESOLVERS.find((resolver) => resolver.hosts.includes(host)) ?? null;
}

export function isShortLink(url) {
  return SHORT_LINK_HOSTS.includes(normalizeHost(url.hostname));
}

export async function resolve(query, requestedBy) {
  const text = query.trim();
  let url = parseUrl(text);
  if (!url) {
    const track = await youtube.search(text, requestedBy);
    if (!track) throw new ResolveError(`No results for **${text}** 🔍`);
    return { title: null, tracks: [track], truncated: false };
  }

  if (isShortLink(url)) url = await followRedirects(url);
  const resolver = pickResolver(url);
  if (!resolver) throw new ResolveError('This link is not supported: use YouTube, SoundCloud, Spotify, Deezer or Apple Music 🎧');
  return resolver.resolve(url, { requestedBy, limit: PLAYLIST_LIMIT });
}
