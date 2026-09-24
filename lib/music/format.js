import { escapeMarkdown } from '../../utils.js';
import { PLAYLIST_LIMIT, QUEUE_LIMIT } from './limits.js';

const MAX_TITLE_LENGTH = 80;
const QUEUE_PREVIEW = 10;

function shorten(text) {
  return text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1)}…` : text;
}

// 65 -> "1:05", 3661 -> "1:01:01"
export function formatDuration(seconds) {
  if (seconds == null) return '--:--';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

export function formatTrack(track) {
  return `**${escapeMarkdown(shorten(track.title))}** — ${escapeMarkdown(shorten(track.author))}`;
}

export function formatAdded({ title, tracks, truncated }, added) {
  if (added === 0) return `The queue is full (${QUEUE_LIMIT} tracks) 🚫`;
  if (tracks.length === 1) return `✅ Added ${formatTrack(tracks[0])}`;
  let text = `✅ Added ${added} tracks${title ? ` from **${escapeMarkdown(shorten(title))}**` : ''}`;
  if (truncated) text += ` (limited to the first ${PLAYLIST_LIMIT})`;
  if (added < tracks.length) text += `, the queue is full: ${tracks.length - added} tracks were not added`;
  return text;
}

export function formatQueue({ current, queue, loop, paused }) {
  if (!current && !queue.length) return 'The queue is empty 🔇';
  const lines = [];
  if (current) lines.push(`${paused ? '⏸️' : '🎶'} **Now playing:** ${formatTrack(current)} (${formatDuration(current.duration)})`);
  queue.slice(0, QUEUE_PREVIEW).forEach((track, i) => lines.push(`${i + 1}. ${formatTrack(track)} (${formatDuration(track.duration)})`));
  if (queue.length > QUEUE_PREVIEW) lines.push(`… and ${queue.length - QUEUE_PREVIEW} more`);
  const total = [current, ...queue].filter(Boolean).reduce((sum, track) => sum + (track.duration ?? 0), 0);
  lines.push('', `${queue.length} tracks in the queue · ${formatDuration(total)} in total · loop: ${loop}`);
  return lines.join('\n');
}
