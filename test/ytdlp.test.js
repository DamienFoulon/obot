import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { YtDlpError, killYtDlp, runYtDlp, spawnYtDlp } from '../lib/music/ytdlp.js';

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

test('a yt-dlp timeout gives a short message, without the command line and its cookies path', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ytdlp-'));
  const slow = path.join(dir, 'slow-ytdlp.sh');
  writeFileSync(slow, '#!/bin/sh\nsleep 5\n');
  chmodSync(slow, 0o755);
  process.env.YTDLP_PATH = slow;
  process.env.YTDLP_COOKIES = '/secret/cookies.txt';
  t.after(() => {
    delete process.env.YTDLP_PATH;
    delete process.env.YTDLP_COOKIES;
  });

  const err = await runYtDlp(['-J', 'https://example.com'], 200).catch((e) => e);
  assert.ok(err instanceof YtDlpError);
  assert.equal(err.message, 'yt-dlp took too long to answer');
  assert.doesNotMatch(err.message, /cookies/);
});
