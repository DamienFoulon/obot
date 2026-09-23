import { spawn } from 'node:child_process';
import { StreamType, createAudioResource } from '@discordjs/voice';
import { search } from './resolvers/youtube.js';
import { YtDlpError, spawnYtDlp, warnIfBotCheck } from './ytdlp.js';

const START_TIMEOUT = 30_000;

// Keeps the end of a process error output, to explain a failure
function collectStderr(child) {
  let text = '';
  child.stderr.on('data', (chunk) => { text = (text + chunk).slice(-2000); });
  return () => text;
}

/**
 * yt-dlp downloads the audio, ffmpeg turns it into the raw audio @discordjs/voice encodes (48 kHz stereo)
 * Resolves once the audio flows, rejects when it can't start (video unavailable, blocked by YouTube...)
 */
export async function createTrackStream(track) {
  // Spotify, Deezer and Apple Music tracks are searched on YouTube when they are about to play
  if (!track.url) {
    const found = await search(track.query, track.requestedBy);
    if (!found) throw new Error(`no YouTube result for "${track.query}"`);
    track.url = found.url;
  }

  const ytdlp = spawnYtDlp(['-f', 'bestaudio/best', '-o', '-', '--quiet', '--no-playlist', track.url]);
  const ffmpeg = spawn('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'],
    { stdio: ['pipe', 'pipe', 'ignore'] });
  const kill = () => {
    ytdlp.kill('SIGKILL');
    ffmpeg.kill('SIGKILL');
  };
  // Killing one side breaks the pipe (EPIPE): expected when a track is skipped
  for (const stream of [ytdlp.stdout, ffmpeg.stdin, ffmpeg.stdout]) stream.on('error', () => {});
  ytdlp.stdout.pipe(ffmpeg.stdin);
  const stderr = collectStderr(ytdlp);

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('yt-dlp took too long to start')), START_TIMEOUT);
      const settle = (callback) => (value) => {
        clearTimeout(timer);
        callback(value);
      };
      ytdlp.stdout.once('data', settle(resolve));
      ytdlp.on('error', settle(reject));
      ffmpeg.on('error', settle(reject));
      ytdlp.once('close', settle((code) => (code === 0 ? resolve() : reject(new YtDlpError(stderr())))));
    });
  } catch (err) {
    kill();
    warnIfBotCheck(err);
    throw err;
  }

  return { resource: createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw, inlineVolume: true }), kill };
}
