import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createJobManager } from '../src/jobs.js';
import { buildDownloadArgs, parseProgressLine } from '../src/ytdlp.js';
import {
  availableBinaries,
  completingLauncher,
  makeHome,
  makeSettings,
  stuckLauncher,
  waitFor
} from './support.js';

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const OTHER = 'https://www.youtube.com/watch?v=abcdefghijk';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const setup = async (t, { launcher = completingLauncher(), binaries = availableBinaries(), settingsPatch = null, maxQueue = 20 } = {}) => {
  const home = await makeHome();
  const { settings } = await makeSettings(home);
  if (settingsPatch) await settings.update(settingsPatch);

  const manager = createJobManager({
    getSettings: () => settings.get(),
    binaries,
    ytdlp: { buildDownloadArgs, parseProgressLine },
    launcher,
    homeDir: home,
    maxQueue
  });

  t.after(async () => {
    await manager.shutdown();
    await delay(50);
    await rm(home, { recursive: true, force: true });
  });

  return { home, manager, settings };
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

test('rejects a duplicate job for the same video', async (t) => {
  const { manager } = await setup(t, { launcher: stuckLauncher() });
  const first = await manager.create({ url: VIDEO });
  await waitFor(() => manager.get(first.id)?.state === 'running');

  await assert.rejects(() => manager.create({ url: VIDEO }), (error) => error.code === 'JOB_EXISTS');
});

test('rejects new jobs when the queue is full', async (t) => {
  const { manager } = await setup(t, { launcher: stuckLauncher(), maxQueue: 1 });
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
  const { manager } = await setup(t, { launcher: stuckLauncher() });
  const created = await manager.create({ url: VIDEO });
  await waitFor(() => manager.get(created.id)?.state === 'running');
  await waitFor(() => manager.get(created.id)?.progress === 0.42);

  const cancelled = await manager.cancel(created.id);
  assert.equal(cancelled.state, 'cancelled');
  await delay(50);
  assert.equal(manager.get(created.id).state, 'cancelled');
  assert.equal(manager.get(created.id).error, null);
});

test('cancels a queued job', async (t) => {
  const { manager } = await setup(t, { launcher: stuckLauncher(), settingsPatch: { concurrentDownloads: 1 } });
  const first = await manager.create({ url: VIDEO });
  await waitFor(() => manager.get(first.id)?.state === 'running');
  const second = await manager.create({ url: OTHER });
  assert.equal(manager.get(second.id).state, 'queued');

  const cancelled = await manager.cancel(second.id);
  assert.equal(cancelled.state, 'cancelled');

  await manager.cancel(first.id);
  await delay(50);
});

test('lists finished jobs', async (t) => {
  const { manager } = await setup(t, { launcher: completingLauncher() });
  const created = await manager.create({ url: VIDEO });
  await waitFor(() => manager.get(created.id)?.state === 'completed');
  assert.equal(manager.list().length, 1);
});

test('records a failed download and removes the temporary directory', async (t) => {
  const { manager } = await setup(t, { launcher: completingLauncher({ fail: true }) });
  const created = await manager.create({ url: VIDEO });

  await waitFor(() => manager.get(created.id)?.state === 'failed');
  const job = manager.get(created.id);

  assert.equal(job.error.code, 'DOWNLOAD_FAILED');
  assert.match(job.error.message, /broken pipe/);
  assert.equal(job.outputPath, null);
});

test('does not overwrite an existing file', async (t) => {
  const { home, manager } = await setup(t);
  const outputDir = path.join(home, 'Downloads', 'YT SuperTool');
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'Sample [dQw4w9WgXcQ].mp4'), 'old');

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

test('removes stale temporary directories', async (t) => {
  const { home, manager } = await setup(t);
  const outputDir = path.join(home, 'Downloads', 'YT SuperTool');
  const stale = path.join(outputDir, '.ytst-tmp', 'old-job');
  await mkdir(stale, { recursive: true });
  await writeFile(path.join(stale, 'leftover.mp4'), 'partial');

  await manager.cleanStale(outputDir);
  await assert.rejects(() => access(stale), (error) => error.code === 'ENOENT');
});
