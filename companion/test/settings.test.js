import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { assertCookieFileSafe, assertOutputDirSafe, createSettings, defaultOutputDir } from '../src/settings.js';
import { makeHome, makeSettings } from './support.js';

test('provides defaults inside the home directory', async (t) => {
  const home = await makeHome();
  t.after(() => rm(home, { recursive: true, force: true }));

  const { settings } = await makeSettings(home);
  const value = settings.get();

  assert.equal(value.outputDir, path.join(home, 'Downloads', 'YT SuperTool'));
  assert.equal(defaultOutputDir(home), value.outputDir);
  assert.equal(value.videoQuality, '1080');
  assert.equal(value.videoContainer, 'mp4');
  assert.equal(value.audioFormat, 'mp3');
  assert.equal(value.audioQuality, 192);
  assert.equal(value.concurrentDownloads, 1);
  assert.equal(value.connections, 8);
  assert.equal(value.speedLimitKbps, 0);
  assert.equal(value.cookiesFromBrowser, null);
  assert.equal(value.cookiesFile, null);
});

test('accepts valid updates and persists them', async (t) => {
  const home = await makeHome();
  t.after(() => rm(home, { recursive: true, force: true }));

  const { store, settings } = await makeSettings(home);
  const outputDir = path.join(home, 'Videos', 'YT');
  const updated = await settings.update({
    outputDir,
    videoQuality: '720',
    videoContainer: 'mkv',
    audioFormat: 'm4a',
    audioQuality: 320,
    concurrentDownloads: 2,
    connections: 16,
    speedLimitKbps: 512,
    cookiesFromBrowser: 'edge'
  });

  assert.equal(updated.outputDir, outputDir);
  assert.equal(updated.videoQuality, '720');
  assert.equal(updated.connections, 16);
  assert.equal(updated.speedLimitKbps, 512);
  assert.equal(updated.cookiesFromBrowser, 'edge');

  const reloaded = createSettings({ store, homeDir: home });
  await reloaded.load();
  assert.deepEqual(reloaded.get(), updated);
});

test('rejects unknown keys and invalid values', async (t) => {
  const home = await makeHome();
  t.after(() => rm(home, { recursive: true, force: true }));

  const { settings } = await makeSettings(home);

  await assert.rejects(() => settings.update({ unknown: true }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({}), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({ videoQuality: '999' }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({ videoContainer: 'avi' }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({ audioFormat: 'wav' }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({ audioQuality: 999 }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({ concurrentDownloads: 5 }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({ connections: 0 }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({ connections: 33 }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({ connections: 2.5 }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({ speedLimitKbps: -1 }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({ speedLimitKbps: 1048577 }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({ cookiesFromBrowser: 'netscape' }), (error) => error.code === 'BAD_REQUEST');
});

test('stores a cookie file path and clears the browser source', async (t) => {
  const home = await makeHome();
  t.after(() => rm(home, { recursive: true, force: true }));

  const { store, settings } = await makeSettings(home);
  const file = path.join(home, 'cookies.txt');
  await writeFile(file, '# Netscape HTTP Cookie File\r\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tvalue\r\n');

  await settings.update({ cookiesFromBrowser: 'edge' });
  const updated = await settings.update({ cookiesFile: file });

  assert.equal(updated.cookiesFile, file);
  assert.equal(updated.cookiesFromBrowser, null);

  const reloaded = createSettings({ store, homeDir: home });
  await reloaded.load();
  assert.equal(reloaded.get().cookiesFile, file);
  assert.equal(reloaded.get().cookiesFromBrowser, null);

  const switched = await settings.update({ cookiesFromBrowser: 'firefox' });
  assert.equal(switched.cookiesFromBrowser, 'firefox');
  assert.equal(switched.cookiesFile, null);
});

test('rejects unusable cookie files', async (t) => {
  const home = await makeHome();
  t.after(() => rm(home, { recursive: true, force: true }));

  const { settings } = await makeSettings(home);
  const missing = path.join(home, 'missing.txt');
  const broken = path.join(home, 'broken.txt');
  const empty = path.join(home, 'empty.txt');
  await writeFile(broken, 'not a cookie file\n');
  await writeFile(empty, '');

  await assert.rejects(() => settings.update({ cookiesFile: missing }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({ cookiesFile: broken }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({ cookiesFile: empty }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(() => settings.update({ cookiesFile: 'cookies.txt' }), (error) => error.code === 'BAD_REQUEST');
  await assert.rejects(
    () => settings.update({ cookiesFile: path.join(path.dirname(home), 'cookies.txt') }),
    (error) => error.code === 'BAD_REQUEST'
  );
  await assert.rejects(
    () => settings.update({ cookiesFromBrowser: 'edge', cookiesFile: broken }),
    (error) => error.code === 'BAD_REQUEST'
  );
});

test('accepts a cookie file with the Netscape header', async (t) => {
  const home = await makeHome();
  t.after(() => rm(home, { recursive: true, force: true }));

  const file = path.join(home, 'cookies.txt');
  await writeFile(file, '# HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tvalue\n');
  assert.equal(await assertCookieFileSafe(file, home), file);
});

test('rejects unsafe output directories', async (t) => {
  const home = await makeHome();
  t.after(() => rm(home, { recursive: true, force: true }));

  const { settings } = await makeSettings(home);
  const root = path.parse(home).root;

  await assert.rejects(() => settings.update({ outputDir: 'Downloads/YT' }), (error) => error.code === 'OUTPUT_DIR_INVALID');
  await assert.rejects(() => settings.update({ outputDir: root }), (error) => error.code === 'OUTPUT_DIR_INVALID');
  await assert.rejects(() => settings.update({ outputDir: home }), (error) => error.code === 'OUTPUT_DIR_INVALID');
  await assert.rejects(
    () => settings.update({ outputDir: path.join(path.dirname(home), 'elsewhere') }),
    (error) => error.code === 'OUTPUT_DIR_INVALID'
  );
});

test('ignores invalid stored values on load', async (t) => {
  const home = await makeHome();
  t.after(() => rm(home, { recursive: true, force: true }));

  const { store, settings } = await makeSettings(home);
  await store.save('settings.json', { outputDir: 'relative', videoQuality: '999', audioQuality: 7, concurrentDownloads: 9, cookiesFromBrowser: 'netscape', cookiesFile: 'relative.txt' });

  const reloaded = createSettings({ store, homeDir: home });
  await reloaded.load();
  const value = reloaded.get();

  assert.equal(value.outputDir, defaultOutputDir(home));
  assert.equal(value.videoQuality, '1080');
  assert.equal(value.audioQuality, 192);
  assert.equal(value.concurrentDownloads, 1);
  assert.equal(value.connections, 8);
  assert.equal(value.speedLimitKbps, 0);
  assert.equal(value.cookiesFromBrowser, null);
  assert.equal(value.cookiesFile, null);
});

test('accepts an output directory that does not exist yet', async (t) => {
  const home = await makeHome();
  t.after(() => rm(home, { recursive: true, force: true }));

  const target = path.join(home, 'New', 'Folder');
  const resolved = await assertOutputDirSafe(target, home);
  assert.equal(resolved, target);
});
