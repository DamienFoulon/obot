import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { killYtDlp, spawnYtDlp } from '../lib/music/ytdlp.js';

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('killing yt-dlp also kills the processes it started', async (t) => {
  process.env.YTDLP_PATH = fileURLToPath(new URL('fixtures/fake-ytdlp.sh', import.meta.url));
  t.after(() => delete process.env.YTDLP_PATH);

  const ytdlp = spawnYtDlp([]);
  const [chunk] = await once(ytdlp.stdout, 'data');
  const childPid = Number(String(chunk).trim());
  t.after(() => { if (isAlive(childPid)) process.kill(childPid, 'SIGKILL'); });
  assert.ok(isAlive(childPid));

  killYtDlp(ytdlp);
  await once(ytdlp, 'close');
  // The orphaned child is reaped by init: give it a moment
  for (let i = 0; i < 20 && isAlive(childPid); i++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(isAlive(childPid), false);
});
