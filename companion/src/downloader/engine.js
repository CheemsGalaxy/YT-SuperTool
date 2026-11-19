import http from 'node:http';
import https from 'node:https';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../errors.js';
import { createPlanner, resumePlanner } from './planner.js';

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9'
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const abortError = () => {
  const error = new Error('Download cancelled.');
  error.name = 'AbortError';
  return error;
};

const fileError = (error) => {
  switch (error?.code) {
    case 'ENOSPC':
      return new AppError('OUTPUT_DIR_INVALID', 'The output folder is out of free space.');
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      return new AppError('OUTPUT_DIR_INVALID', 'The output folder is not writable.');
    case 'ENOTDIR':
    case 'ENAMETOOLONG':
      return new AppError('OUTPUT_DIR_INVALID', 'The output folder is not usable.');
    default:
      return null;
  }
};

const networkError = (error) => {
  if (error?.name === 'AbortError') return error;
  if (error instanceof AppError) return error;
  const mapped = fileError(error);
  if (mapped) return mapped;
  if (error?.code === 'ETIMEDOUT' || error?.code === 'ECONNRESET' || error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
    return new AppError('DOWNLOAD_FAILED', 'The media connection was interrupted. Try again.');
  }
  return new AppError('DOWNLOAD_FAILED');
};

const requestOnce = (url, { headers, signal, timeout }) => new Promise((resolve, reject) => {
  const library = url.protocol === 'https:' ? https : http;
  const request = library.request(url, { method: 'GET', headers }, (response) => {
    resolve({ request, response });
  });

  request.setTimeout(timeout, () => {
    request.destroy(Object.assign(new Error('The media server did not answer in time.'), { code: 'ETIMEDOUT' }));
  });

  request.on('error', reject);

  if (signal) {
    if (signal.aborted) {
      request.destroy(abortError());
    } else {
      signal.addEventListener('abort', () => request.destroy(abortError()), { once: true });
    }
  }

  request.end();
});

const request = async (url, { headers = {}, signal = null, timeout = 30000 } = {}) => {
  let current = new URL(url);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const { response } = await requestOnce(current, { headers: { ...DEFAULT_HEADERS, ...headers }, signal, timeout });
    const status = response.statusCode ?? 0;

    if (REDIRECTS.has(status)) {
      const location = response.headers.location;
      response.resume();
      if (typeof location !== 'string' || !location) throw new AppError('DOWNLOAD_FAILED', 'The media server sent an empty redirect.');
      current = new URL(location, current);
      if (current.protocol !== 'http:' && current.protocol !== 'https:') {
        throw new AppError('DOWNLOAD_FAILED', 'The media server redirected to an unsupported protocol.');
      }
      continue;
    }

    return { response, url: current, status };
  }

  throw new AppError('DOWNLOAD_FAILED', 'The media server redirected too many times.');
};

const parseContentRange = (value) => {
  const match = String(value ?? '').match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
  if (!match) return null;
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    total: match[3] === '*' ? null : Number(match[3])
  };
};

export const probeMedia = async (url, { headers = {}, signal = null, timeout = 20000 } = {}) => {
  const { response, url: finalUrl, status } = await request(url, {
    headers: { ...headers, Range: 'bytes=0-0' },
    signal,
    timeout
  });

  try {
    const range = parseContentRange(response.headers['content-range']);
    const etag = typeof response.headers.etag === 'string' ? response.headers.etag : null;
    const lastModified = typeof response.headers['last-modified'] === 'string' ? response.headers['last-modified'] : null;

    if (status === 206 && range?.total !== null && range?.total !== undefined) {
      return { size: range.total, ranges: true, etag, lastModified, finalUrl: finalUrl.toString() };
    }

    if (status === 200) {
      const length = Number(response.headers['content-length']);
      return {
        size: Number.isSafeInteger(length) && length >= 0 ? length : null,
        ranges: false,
        etag,
        lastModified,
        finalUrl: finalUrl.toString()
      };
    }

    if (status === 416) {
      return { size: 0, ranges: true, etag, lastModified, finalUrl: finalUrl.toString() };
    }

    throw new AppError('DOWNLOAD_FAILED', `The media server refused the download (HTTP ${status}).`);
  } finally {
    response.destroy();
  }
};

const writeAt = async (handle, buffer, position) => {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset, position + offset);
    if (bytesWritten <= 0) throw new AppError('OUTPUT_DIR_INVALID', 'The output folder stopped accepting data.');
    offset += bytesWritten;
  }
};

const createThrottle = (bytesPerSecond) => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return async () => {};
  let allowance = bytesPerSecond;
  let updated = Date.now();

  return async (bytes) => {
    for (;;) {
      const now = Date.now();
      allowance = Math.min(bytesPerSecond, allowance + ((now - updated) / 1000) * bytesPerSecond);
      updated = now;
      if (allowance >= bytes) {
        allowance -= bytes;
        return;
      }
      await sleep(Math.max(1, ((bytes - allowance) / bytesPerSecond) * 1000));
    }
  };
};

const createProgress = ({ total, onProgress }) => {
  let lastBytes = 0;
  let lastTime = Date.now();
  let lastEmit = 0;

  return (received, force = false) => {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - lastEmit < 250) return;
    const elapsed = Math.max(1, now - lastTime) / 1000;
    const speedBps = Math.max(0, (received - lastBytes) / elapsed);
    lastBytes = received;
    lastTime = now;
    lastEmit = now;
    const etaSeconds = total && speedBps > 0 ? Math.max(0, Math.round((total - received) / speedBps)) : null;
    onProgress({ received, total: total ?? null, speedBps, etaSeconds });
  };
};

const readState = async (statePath, { url, size, etag }) => {
  if (!statePath) return null;
  try {
    const data = JSON.parse(await readFile(statePath, 'utf8'));
    if (data?.url !== url || data?.size !== size) return null;
    if ((data?.etag ?? null) !== (etag ?? null)) return null;
    if (!Array.isArray(data?.segments) || data.segments.length === 0) return null;
    return data.segments;
  } catch {
    return null;
  }
};

const saveState = async (statePath, payload) => {
  if (!statePath) return;
  const temporary = `${statePath}.tmp`;
  try {
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(temporary, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
    await rename(temporary, statePath);
  } catch {
    await rm(temporary, { force: true }).catch(() => {});
  }
};

export const downloadSegmented = async ({
  url,
  filePath,
  statePath = null,
  size = null,
  connections = 8,
  chunkBytes = 4 * 1024 * 1024,
  speedLimitBps = 0,
  headers = {},
  signal = null,
  onProgress = null,
  timeout = 30000,
  maxRetries = 3
}) => {
  if (typeof url !== 'string' || !url) throw new AppError('DOWNLOAD_FAILED', 'A media URL is required.');
  if (typeof filePath !== 'string' || !filePath) throw new AppError('OUTPUT_DIR_INVALID', 'A download path is required.');
  if (signal?.aborted) throw abortError();

  await mkdir(path.dirname(filePath), { recursive: true });

  let probe;
  try {
    probe = await probeMedia(url, { headers, signal, timeout });
  } catch (error) {
    throw networkError(error);
  }

  const total = Number.isSafeInteger(probe.size) && probe.size >= 0 ? probe.size : (Number.isSafeInteger(size) ? size : null);
  if (total === null && probe.size === null) {
    throw new AppError('DOWNLOAD_FAILED', 'The media server did not report a file size.');
  }

  if (total === 0) {
    const handle = await open(filePath, 'w');
    await handle.close();
    onProgress?.({ received: 0, total: 0, speedBps: 0, etaSeconds: 0 });
    await rm(statePath, { force: true }).catch(() => {});
    return { path: filePath, size: 0, resumed: false };
  }

  if (!probe.ranges) {
    return downloadSingle({ url, filePath, total, headers, signal, onProgress, timeout, statePath });
  }

  const saved = await readState(statePath, { url, size: total, etag: probe.etag });
  let planner;
  try {
    planner = saved
      ? resumePlanner({ size: total, saved, connections, chunkBytes })
      : createPlanner({ size: total, connections, chunkBytes });
  } catch {
    planner = createPlanner({ size: total, connections, chunkBytes });
  }

  let handle;
  try {
    handle = await open(filePath, saved ? 'r+' : 'w+');
    await handle.truncate(total);
  } catch (error) {
    throw fileError(error) ?? new AppError('OUTPUT_DIR_INVALID');
  }

  const throttle = createThrottle(speedLimitBps);
  const report = createProgress({ total, onProgress });
  let stateDirty = false;
  let lastSave = 0;
  let failure = null;
  let stopping = false;
  const controllers = new Set();
  const abortAll = () => {
    for (const controller of controllers) controller.abort();
  };

  const onAbort = () => {
    stopping = true;
    abortAll();
  };
  if (signal) signal.addEventListener('abort', onAbort, { once: true });

  const persist = async (force = false) => {
    if (!statePath || !stateDirty) return;
    const now = Date.now();
    if (!force && now - lastSave < 1000) return;
    stateDirty = false;
    lastSave = now;
    await saveState(statePath, {
      url,
      size: total,
      etag: probe.etag,
      segments: planner.save(),
      updatedAt: new Date().toISOString()
    });
  };

  const worker = async (workerId) => {
    const controller = new AbortController();
    controllers.add(controller);
    const linked = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', linked, { once: true });
    }

    try {
      for (;;) {
        if (stopping || controller.signal.aborted || planner.isComplete()) break;
        const segment = planner.claim(workerId);
        if (!segment) break;

        let failed = 0;
        while (segment.cursor < segment.end) {
          if (stopping || controller.signal.aborted) throw abortError();
          const end = segment.end - 1;
          let response;
          try {
            const answer = await request(url, {
              headers: { ...headers, Range: `bytes=${segment.cursor}-${end}` },
              signal: controller.signal,
              timeout
            });
            response = answer.response;
            if (answer.status === 200) {
              response.destroy();
              throw new AppError('DOWNLOAD_FAILED', 'The media server ignored a range request.');
            }
            if (answer.status !== 206) {
              response.destroy();
              throw new AppError('DOWNLOAD_FAILED', `The media server refused part of the download (HTTP ${answer.status}).`);
            }
            const range = parseContentRange(response.headers['content-range']);
            if (!range || range.start !== segment.cursor) {
              response.destroy();
              throw new AppError('DOWNLOAD_FAILED', 'The media server returned the wrong byte range.');
            }
          } catch (error) {
            if (controller.signal.aborted) throw abortError();
            failed += 1;
            if (failed >= maxRetries) throw error;
            planner.release(workerId);
            const retry = planner.claim(workerId);
            if (!retry) throw error;
            segment.cursor = retry.cursor;
            segment.end = retry.end;
            await sleep(250 * failed);
            continue;
          }

          try {
            for await (const chunk of response) {
              if (controller.signal.aborted) throw abortError();
              const remaining = segment.end - segment.cursor;
              if (chunk.length > remaining) {
                response.destroy();
                throw new AppError('DOWNLOAD_FAILED', 'The media server sent more data than requested.');
              }
              await throttle(chunk.length);
              try {
                await writeAt(handle, chunk, segment.cursor);
              } catch (error) {
                throw fileError(error) ?? new AppError('OUTPUT_DIR_INVALID');
              }
              planner.commit(workerId, chunk.length);
              segment.cursor += chunk.length;
              stateDirty = true;
              report(planner.downloaded());
              await persist();
            }
          } catch (error) {
            response.destroy();
            if (controller.signal.aborted) throw abortError();
            failed += 1;
            planner.release(workerId);
            if (failed >= maxRetries) throw error;
            const retry = planner.claim(workerId);
            if (!retry) throw error;
            segment.cursor = retry.cursor;
            segment.end = retry.end;
            await sleep(250 * failed);
            continue;
          }

          if (segment.cursor !== segment.end) {
            failed += 1;
            planner.release(workerId);
            if (failed >= maxRetries) throw new AppError('DOWNLOAD_FAILED', 'The media connection closed early. Try again.');
            const retry = planner.claim(workerId);
            if (!retry) throw new AppError('DOWNLOAD_FAILED', 'The media connection closed early. Try again.');
            segment.cursor = retry.cursor;
            segment.end = retry.end;
          }
        }

        planner.release(workerId);
        await persist(true);
      }
    } finally {
      controllers.delete(controller);
      if (signal) signal.removeEventListener('abort', linked);
    }
  };

  const count = Math.max(1, Math.min(Math.floor(connections), planner.segments.length || 1));
  const tasks = [];
  for (let index = 0; index < count; index += 1) tasks.push(worker(index));

  let finished = false;
  try {
    const results = await Promise.allSettled(tasks);
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected) failure = rejected.reason;
    if (failure) throw failure;
    if (stopping || signal?.aborted) throw abortError();
    if (!planner.isComplete()) throw new AppError('DOWNLOAD_FAILED', 'The download stopped before every byte arrived.');
    finished = true;
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    abortAll();
    await persist(true).catch(() => {});
    if (finished) await handle.truncate(total).catch(() => {});
    await handle.sync().catch(() => {});
    await handle.close().catch(() => {});
  }

  await rm(statePath, { force: true }).catch(() => {});
  report(total, true);
  return { path: filePath, size: total, resumed: Boolean(saved) };
};

const downloadSingle = async ({ url, filePath, total, headers, signal, onProgress, timeout, statePath }) => {
  let handle;
  try {
    handle = await open(filePath, 'w');
  } catch (error) {
    throw fileError(error) ?? new AppError('OUTPUT_DIR_INVALID');
  }

  const report = createProgress({ total, onProgress });
  let received = 0;

  try {
    if (signal?.aborted) throw abortError();
    const answer = await request(url, { headers, signal, timeout });
    const { response, status } = answer;
    if (status !== 200 && status !== 206) {
      response.destroy();
      throw new AppError('DOWNLOAD_FAILED', `The media server refused the download (HTTP ${status}).`);
    }

    try {
      for await (const chunk of response) {
        if (signal?.aborted) throw abortError();
        try {
          await writeAt(handle, chunk, received);
        } catch (error) {
          throw fileError(error) ?? new AppError('OUTPUT_DIR_INVALID');
        }
        received += chunk.length;
        report(received);
      }
    } finally {
      response.destroy();
    }
  } catch (error) {
    throw networkError(error);
  } finally {
    await handle.close().catch(() => {});
  }

  if (total !== null && received !== total) {
    throw new AppError('DOWNLOAD_FAILED', 'The media connection closed early. Try again.');
  }

  await rm(statePath, { force: true }).catch(() => {});
  report(received, true);
  return { path: filePath, size: received, resumed: false };
};
