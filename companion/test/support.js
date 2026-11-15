import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { writeFile } from 'node:fs/promises';
import { createSettings } from '../src/settings.js';
import { createStore } from '../src/store.js';

export const makeHome = () => mkdtemp(path.join(os.tmpdir(), 'ytst-test-'));

export const makeSettings = async (home) => {
  const store = createStore({ dataDir: path.join(home, '.data') });
  const settings = createSettings({ store, homeDir: home });
  await settings.load();
  return { store, settings };
};

export const availableBinaries = () => ({
  ytdlp: { available: true, path: 'yt-dlp', version: '2026.11.15', error: null },
  ffmpeg: { available: true, path: path.join('fake', 'ffmpeg.exe'), version: '7.1', error: null }
});

const fakeChild = () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
  return child;
};

export const completingLauncher = ({ fileName = 'Sample [dQw4w9WgXcQ].mp4', content = 'video-data', fail = false } = {}) => (job) => {
  const child = fakeChild();
  setImmediate(async () => {
    child.stdout.write('[download]  50.0% of 10.00MiB at 2.00MiB/s ETA 00:05\n');
    if (fail) child.stderr.write('ERROR: broken pipe\n');
    else await writeFile(path.join(job.dir, fileName), content);
    child.stdout.end();
    child.stderr.end();
    child.emit('close', fail ? 1 : 0, null);
  });
  return child;
};

export const stuckLauncher = ({ progress = true } = {}) => () => {
  const child = fakeChild();
  child.kill = () => {
    setImmediate(() => child.emit('close', null, 'SIGTERM'));
  };
  if (progress) child.stdout.write('[download]  42.0% of 10.00MiB at 1.00MiB/s ETA 00:09\n');
  return child;
};

export const waitFor = async (predicate, timeoutMs = 3000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for condition.');
};
