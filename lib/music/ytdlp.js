import { execFile, spawn } from 'node:child_process';

/**
 * yt-dlp reads YouTube and SoundCloud, see https://github.com/yt-dlp/yt-dlp
 * YouTube often blocks datacenter IPs ("Sign in to confirm you're not a bot"): YTDLP_COOKIES gives it
 * the cookies of a Google account, see the README
 */

const ytDlpPath = () => process.env.YTDLP_PATH || 'yt-dlp';

export class YtDlpError extends Error {
  constructor(stderr) {
    const lines = String(stderr).trim().split('\n').filter(Boolean);
    super(lines.at(-1) ?? 'yt-dlp failed');
    this.botCheck = /confirm you.re not a bot/i.test(stderr);
  }
}

export function warnIfBotCheck(err) {
  if (err instanceof YtDlpError && err.botCheck) {
    console.error('YouTube asks yt-dlp to sign in ("confirm you\'re not a bot"): set YTDLP_COOKIES, see the README 🍪');
  }
}

// yt-dlp needs a JavaScript runtime for YouTube: Node is already there
function baseArgs() {
  const args = ['--no-warnings', '--js-runtimes', 'node'];
  if (process.env.YTDLP_COOKIES) args.push('--cookies', process.env.YTDLP_COOKIES);
  return args;
}

export function runYtDlp(args, timeout = 30_000) {
  return new Promise((resolve, reject) => {
    execFile(ytDlpPath(), [...baseArgs(), ...args], { timeout, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout);
      reject(err.code === 'ENOENT' ? err : new YtDlpError(stderr || err.message));
    });
  });
}

export async function runYtDlpJson(args) {
  return JSON.parse(await runYtDlp(['-J', ...args]));
}

// In its own process group: the standalone yt-dlp binary is a bootloader running the real yt-dlp as its child
export function spawnYtDlp(args) {
  return spawn(ytDlpPath(), [...baseArgs(), ...args], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
}

// Kills the whole group, otherwise the real yt-dlp would be orphaned and keep downloading
export function killYtDlp(child) {
  child.stdout?.destroy();
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // Already gone, or never started
    child.kill('SIGKILL');
  }
}

let available = false;

// Called once at startup: without yt-dlp, the music commands say so and the rest of the bot works
export async function checkYtDlp() {
  try {
    const version = (await runYtDlp(['--version'], 10_000)).trim();
    available = true;
    console.log(`yt-dlp ${version} found, music is available 🎶`);
  } catch (err) {
    available = false;
    console.warn(`yt-dlp is missing or too old (${err.message}): music commands are disabled, see the README`);
  }
}

export function isYtDlpAvailable() {
  return available;
}
