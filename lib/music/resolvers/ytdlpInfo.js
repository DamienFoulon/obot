import { createTrack } from '../track.js';
import { runYtDlpJson } from '../ytdlp.js';

// Deleted and private videos stay in YouTube playlists, with nothing to play
const UNAVAILABLE = /^\[(deleted|private) video\]$/i;

// "https://soundcloud.com/flume/say-nothing-feat-may-a" -> "Say nothing feat may a"
export function titleFromUrl(url) {
  const slug = new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? url;
  const words = decodeURIComponent(slug).replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function entryToTrack(entry, requestedBy, playlistAuthor) {
  const url = entry.webpage_url ?? entry.url;
  return createTrack({
    // SoundCloud playlists only give the track URL in flat mode
    title: entry.title ?? titleFromUrl(url),
    author: entry.channel ?? entry.uploader ?? playlistAuthor,
    duration: entry.duration,
    thumbnail: entry.thumbnail ?? entry.thumbnails?.at(-1)?.url,
    url,
  }, requestedBy);
}

export function parseYtDlpInfo(info, requestedBy, limit) {
  if (info._type !== 'playlist') {
    return { title: null, tracks: [entryToTrack(info, requestedBy)], truncated: false };
  }
  const entries = (info.entries ?? [])
    .filter((entry) => entry && (entry.webpage_url || entry.url) && !UNAVAILABLE.test(entry.title ?? ''));
  return {
    title: info.title ?? null,
    tracks: entries.slice(0, limit).map((entry) => entryToTrack(entry, requestedBy, info.uploader ?? info.channel)),
    truncated: entries.length > limit,
  };
}

// --flat-playlist reads a whole playlist in one request; --no-playlist makes a video opened from a playlist
// ("watch?v=...&list=...") play alone. One more entry than the limit tells if the playlist was truncated
export async function resolveWithYtDlp(url, { requestedBy, limit }) {
  const info = await runYtDlpJson(['--flat-playlist', '--no-playlist', '--playlist-end', String(limit + 1), url.href]);
  return parseYtDlpInfo(info, requestedBy, limit);
}
