import assert from 'node:assert/strict';
import * as nodeFs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createJobManager } from '../src/jobs.js';
import {
  availableBinaries,
  fakeEngine,
  fakeMedia,
  makeHome,
  makeSettings,
  stallingEngine,
  waitFor
} from './support.js';

const { access, mkdir, readFile, rm, writeFile } = nodeFs;

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const OTHER = 'https://www.youtube.com/watch?v=abcdefghijk';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const setup = async (t, {
  media = fakeMedia(),
  engine = fakeEngine(),
  binaries = availableBinaries(),
  settingsPatch = null,
  maxQueue = 20,
  fs = nodeFs
} = {}) => {
  const home = await makeHome();
  const { settings } = await makeSettings(home);
  if (settingsPatch) await settings.update(settingsPatch);

  const manager = createJobManager({
    getSettings: () => settings.get(),
    binaries,
    media,
    engine,
    homeDir: home,
    maxQueue,
    fs
  });

  t.after(async () => {
    await manager.shutdown();
    await delay(50);
    await rm(home, { recursive: true, force: true });
  });

  return { home, manager, media, engine, settings };
};

test('moves a finished download into the output directory', async (t) => {
  const { home, manager } = await setup(t);
  const created = await manager.create({ url: VIDEO, mode: 'video', quality: '1080', container: 'mp4' });

  await waitFor(() => manager.get(created.id)?.state === 'completed');
  const job = manager.get(created.id);

  assert.equal(path.dirname(job.outputPath), path.join(home, 'Downloads', 'YT SuperTool'));
  assert.equal(await readFile(job.outputPath, 'utf8'), 'video-data');
  assert.equal(job.progress, 1);
  assert.equal(job.error, null);
  assert.equal(job.totalBytes, 10);
});

test('passes connection and speed settings to the engine', async (t) => {
  const calls = [];
  const engine = {
    download: async (input) => {
      calls.push(input);
      await writeFile(input.filePath, Buffer.alloc(Number(input.size) || 1, 1));
    }
  };
  const { manager } = await setup(t, { engine, settingsPatch: { connections: 4, speedLimitKbps: 128 } });
  const created = await manager.create({ url: VIDEO });
  await waitFor(() => manager.get(created.id)?.state === 'completed');

  assert.equal(calls.length, 2);
  assert.equal(calls[0].connections, 4);
  assert.equal(calls[0].speedLimitBps, 128000);
  assert.match(calls[0].url, /^https:\/\/media\.test\//);
});

test('download fails when the configured cookie file disappeared', async (t) => {
  const { home, manager, settings } = await setup(t);
  const file = path.join(home, 'cookies.txt');
  await writeFile(file, '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tvalue\n');
  await settings.update({ cookiesFile: file });
  await rm(file, { force: true });

  const created = await manager.create({ url: VIDEO });
  await waitFor(() => manager.get(created.id)?.state === 'failed');
  assert.match(manager.get(created.id).error.message, /Cookie file was not found/);
});

test('rejects a duplicate job for the same video', async (t) => {
  const { manager } = await setup(t, { engine: stallingEngine() });
  const first = await manager.create({ url: VIDEO });
  await waitFor(() => manager.get(first.id)?.state === 'running');

  await assert.rejects(() => manager.create({ url: VIDEO }), (error) => error.code === 'JOB_EXISTS');
});

test('rejects new jobs when the queue is full', async (t) => {
  const { manager } = await setup(t, { engine: stallingEngine(), maxQueue: 1 });
  const first = await manager.create({ url: VIDEO });
  await waitFor(() => manager.get(first.id)?.state === 'running');
  const second = await manager.create({ url: OTHER });
  assert.equal(manager.get(second.id).state, 'queued');

  await assert.rejects(
    () => manager.create({ url: 'https://www.youtube.com/watch?v=zzzzzzzzzzz' }),
    (error) => error.code === 'QUEUE_FULL'
  );
});

test('cancels a running job and reports progress first', async (t) => {
  const { manager } = await setup(t, { engine: stallingEngine() });
  const created = await manager.create({ url: VIDEO });
  await waitFor(() => manager.get(created.id)?.state === 'running');
  await waitFor(() => manager.get(created.id)?.progress > 0);

  const cancelled = await manager.cancel(created.id);
  assert.equal(cancelled.state, 'cancelled');
  await waitFor(() => manager.get(created.id)?.state === 'cancelled');
  assert.equal(manager.get(created.id).error, null);
});

test('cancels a queued job', async (t) => {
  const { manager } = await setup(t, { engine: stallingEngine(), settingsPatch: { concurrentDownloads: 1 } });
  const first = await manager.create({ url: VIDEO });
  await waitFor(() => manager.get(first.id)?.state === 'running');
  const second = await manager.create({ url: OTHER });
  assert.equal(manager.get(second.id).state, 'queued');

  const cancelled = await manager.cancel(second.id);
  assert.equal(cancelled.state, 'cancelled');

  await manager.cancel(first.id);
  await waitFor(() => manager.get(first.id)?.state === 'cancelled');
});

test('lists finished jobs', async (t) => {
  const { manager } = await setup(t);
  const created = await manager.create({ url: VIDEO });
  await waitFor(() => manager.get(created.id)?.state === 'completed');
  assert.equal(manager.list().length, 1);
});

test('records a failed download', async (t) => {
  const engine = fakeEngine({ fail: Object.assign(new Error('interrupted'), { code: 'DOWNLOAD_FAILED' }) });
  const media = fakeMedia();
  media.fallback = async () => {
    throw Object.assign(new Error('The media server refused the download (HTTP 403).'), { code: 'DOWNLOAD_FAILED' });
  };
  const { manager } = await setup(t, { engine, media });
  const created = await manager.create({ url: VIDEO });

  await waitFor(() => manager.get(created.id)?.state === 'failed');
  const job = manager.get(created.id);

  assert.equal(job.error.code, 'DOWNLOAD_FAILED');
  assert.equal(job.outputPath, null);
});

test('reports a temporary folder that cannot be created', async (t) => {
  const failure = new Error("EACCES: permission denied, mkdir 'C:\\Users\\Cheems\\Downloads\\YT SuperTool\\.ytst-tmp'");
  failure.code = 'EACCES';
  const fs = {
    ...nodeFs,
    mkdir: async () => {
      throw failure;
    }
  };
  const { manager } = await setup(t, { fs });

  await assert.rejects(
    () => manager.create({ url: VIDEO }),
    (error) => error.code === 'OUTPUT_DIR_INVALID' && error.status === 503 && error.message === 'The output folder is not writable.'
  );
});

test('does not overwrite an existing file', async (t) => {
  const { home, manager, media } = await setup(t);
  const outputDir = path.join(home, 'Downloads', 'YT SuperTool');
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, `Sample [dQw4w9WgXcQ].${media === null ? 'mp4' : 'mp4'}`), 'old');

  const created = await manager.create({ url: VIDEO });
  await waitFor(() => manager.get(created.id)?.state === 'completed');

  assert.match(manager.get(created.id).outputPath, /Sample \[dQw4w9WgXcQ\] \(1\)\.mp4$/);
  assert.equal(await readFile(path.join(outputDir, 'Sample [dQw4w9WgXcQ].mp4'), 'utf8'), 'old');
});

test('requires both binaries before creating a job', async (t) => {
  const noYtdlp = await setup(t, { binaries: { ytdlp: { available: false }, ffmpeg: { available: true } } });
  await assert.rejects(() => noYtdlp.manager.create({ url: VIDEO }), (error) => error.code === 'YTDLP_MISSING');

  const noFfmpeg = await setup(t, { binaries: { ytdlp: { available: true }, ffmpeg: { available: false } } });
  await assert.rejects(() => noFfmpeg.manager.create({ url: VIDEO }), (error) => error.code === 'FFMPEG_MISSING');
});

test('validates url and mode', async (t) => {
  const { manager } = await setup(t);
  await assert.rejects(() => manager.create({ url: 'https://example.com/watch?v=dQw4w9WgXcQ' }), (error) => error.code === 'INVALID_URL');
  await assert.rejects(() => manager.create({ url: VIDEO, mode: 'video', quality: '999' }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => manager.create({ url: VIDEO, mode: 'audio', audioFormat: 'wav' }), (error) => error.code === 'BAD_REQUEST');
});

test('returns null for unknown jobs and rejects their cancellation', async (t) => {
  const { manager } = await setup(t);
  assert.equal(manager.get('missing'), null);
  await assert.rejects(() => manager.cancel('missing'), (error) => error.code === 'NOT_FOUND');
});

test('rejects cancel for a finished job', async (t) => {
  const { manager } = await setup(t);
  const created = await manager.create({ url: VIDEO });
  await waitFor(() => manager.get(created.id)?.state === 'completed');
  await assert.rejects(() => manager.cancel(created.id), (error) => error.code === 'JOB_FINISHED');
});

test('names an audio download with the requested format', async (t) => {
  const { manager } = await setup(t);
  const created = await manager.create({ url: VIDEO, mode: 'audio', audioFormat: 'm4a', audioQuality: 256 });
  await waitFor(() => manager.get(created.id)?.state === 'completed');
  assert.match(manager.get(created.id).outputPath, /\.m4a$/);
});

test('falls back to yt-dlp when no direct media url is available', async (t) => {
  const fallback = Object.assign(new Error('no direct url'), { fallback: true });
  const media = fakeMedia({ resolveError: fallback });
  const { manager } = await setup(t, { media });
  const created = await manager.create({ url: VIDEO });

  await waitFor(() => manager.get(created.id)?.state === 'completed');
  assert.equal(media.calls.fallback, 1);
  assert.equal(await readFile(manager.get(created.id).outputPath, 'utf8'), 'video-data');
});

test('falls back to yt-dlp when the engine cannot download a stream', async (t) => {
  const failure = new Error('The media server refused the download (HTTP 403).');
  failure.code = 'DOWNLOAD_FAILED';
  const { manager, media } = await setup(t, { engine: fakeEngine({ fail: failure }) });
  const created = await manager.create({ url: VIDEO, mode: 'video', quality: '1080', container: 'mp4' });
  await waitFor(() => manager.get(created.id)?.state === 'completed');
  assert.equal(media.calls.fallback, 1);
  assert.match(manager.get(created.id).outputPath, /Sample \[dQw4w9WgXcQ\]\.mp4$/);
});

test('reports a merge failure', async (t) => {
  const media = fakeMedia({ mergeError: Object.assign(new Error('ffmpeg failed'), { code: 'DOWNLOAD_FAILED' }) });
  const { manager } = await setup(t, { media });
  const created = await manager.create({ url: VIDEO });

  await waitFor(() => manager.get(created.id)?.state === 'failed');
  assert.equal(manager.get(created.id).error.code, 'DOWNLOAD_FAILED');
});

test('removes stale temporary directories', async (t) => {
  const { home, manager } = await setup(t);
  const outputDir = path.join(home, 'Downloads', 'YT SuperTool');
  const stale = path.join(outputDir, '.ytst-tmp', 'old-job');
  await mkdir(stale, { recursive: true });
  await writeFile(path.join(stale, 'leftover.mp4'), 'partial');

  await manager.cleanStale(outputDir);
  await assert.rejects(() => access(stale), (error) => error.code === 'ENOENT');
});
