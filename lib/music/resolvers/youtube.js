import { parseYtDlpInfo, resolveWithYtDlp } from './ytdlpInfo.js';
import { runYtDlpJson } from '../ytdlp.js';

export const hosts = ['youtube.com', 'youtu.be', 'music.youtube.com'];

export const resolve = resolveWithYtDlp;

// First YouTube result for a text, or null
export async function search(query, requestedBy) {
  const info = await runYtDlpJson(['--flat-playlist', `ytsearch1:${query}`]);
  return parseYtDlpInfo(info, requestedBy, 1).tracks[0] ?? null;
}
