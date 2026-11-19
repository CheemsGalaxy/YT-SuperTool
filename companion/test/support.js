import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

export const fakePlan = ({
  id = 'dQw4w9WgXcQ',
  title = 'Sample',
  duration = 10,
  extension = 'mp4',
  sizes = [10, 5]
} = {}) => ({
  id,
  title,
  duration,
  extension,
  streams: sizes.map((size, index) => ({
    url: `https://media.test/${id}/${index}`,
    formatId: String(index),
    ext: index === 0 ? 'mp4' : 'm4a',
    vcodec: index === 0 ? 'avc1' : 'none',
    acodec: index === 0 ? 'none' : 'mp4a',
    size
  })),
  totalBytes: sizes.every((size) => size > 0) ? sizes.reduce((sum, size) => sum + size, 0) : null
});

export const fakeMedia = ({ plan = fakePlan(), resolveError = null, mergeError = null, content = 'video-data' } = {}) => {
  const calls = { resolve: 0, merge: 0, fallback: 0 };
  return {
    calls,
    resolve: async (input) => {
      calls.resolve += 1;
      calls.lastResolve = input;
      if (resolveError) throw resolveError;
      return plan;
    },
    merge: async (input) => {
      calls.merge += 1;
      calls.lastMerge = input;
      if (mergeError) throw mergeError;
      await writeFile(input.output, content);
      input.onProgress?.(1);
      return input.output;
    },
    fallback: async (input) => {
      calls.fallback += 1;
      const file = input.outputTemplate
        .replace('%(title).120B [%(id)s].%(ext)s', 'Sample [dQw4w9WgXcQ].mp4');
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
      input.onProgress?.({ progress: 1, receivedBytes: content.length, totalBytes: content.length, speed: null, eta: null });
      return null;
    }
  };
};

export const fakeEngine = ({ content = null, fail = null } = {}) => ({
  calls: [],
  download: async (input) => {
    const size = Number(input.size) || 0;
    const data = content === null ? Buffer.alloc(size, 7) : Buffer.from(content);
    await writeFile(input.filePath, data);
    input.onProgress?.({ received: data.length, total: size || data.length, speedBps: 1024 * 1024, etaSeconds: 1 });
    if (fail) throw fail;
    return { path: input.filePath, size: data.length, resumed: false };
  }
});

export const stallingEngine = () => ({
  calls: [],
  download: async (input) => {
    input.onProgress?.({ received: 5, total: 10, speedBps: 1024, etaSeconds: 5 });
    await new Promise((resolve, reject) => {
      if (input.signal?.aborted) {
        const error = new Error('Download cancelled.');
        error.name = 'AbortError';
        reject(error);
        return;
      }
      input.signal?.addEventListener('abort', () => {
        const error = new Error('Download cancelled.');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
  }
});

export const waitFor = async (predicate, timeoutMs = 3000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for condition.');
};
