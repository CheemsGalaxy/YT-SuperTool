import { randomUUID } from 'node:crypto';
import * as nodeFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppError } from './errors.js';
import { assertCookieFileSafe, assertOutputDirSafe } from './settings.js';
import { parseYouTubeUrl } from './url-policy.js';
import { safeFileName } from './ytdlp.js';

const FINISHED = new Set(['completed', 'failed', 'cancelled']);
const PARTIAL = /\.(part|ytdl|temp|tmp)$/i;

const fileError = (error) => {
  switch (error?.code) {
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      return new AppError('OUTPUT_DIR_INVALID', 'The output folder is not writable.');
    case 'ENOSPC':
      return new AppError('OUTPUT_DIR_INVALID', 'The output folder is out of free space.');
    case 'ENOTDIR':
    case 'ENAMETOOLONG':
      return new AppError('OUTPUT_DIR_INVALID', 'The output folder is not usable.');
    default:
      return null;
  }
};

const inside = (parent, child) => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative === '') return false;
  if (path.isAbsolute(relative)) return false;
  return relative.split(path.sep)[0] !== '..';
};

const listFiles = async (dir, fs) => {
  const found = [];
  const walk = async (current) => {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) found.push(full);
    }
  };
  await walk(dir);
  return found;
};

const uniqueDestination = async (dir, name, fs) => {
  const extension = path.extname(name);
  const base = path.basename(name, extension);
  let candidate = path.join(dir, name);
  let index = 1;

  while (index <= 1000) {
    try {
      await fs.lstat(candidate);
    } catch (error) {
      if (error?.code === 'ENOENT') return candidate;
      throw error;
    }
    candidate = path.join(dir, `${base} (${index})${extension}`);
    index += 1;
  }

  throw new AppError('OUTPUT_DIR_INVALID', 'Cannot find a free file name.');
};

const validateChoice = (value, allowed, name) => {
  if (!allowed.includes(value)) throw new AppError('BAD_REQUEST', `Invalid ${name}.`);
  return value;
};

const formatSpeed = (bytesPerSecond) => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null;
  if (bytesPerSecond < 1024 * 1024) return `${Math.max(1, Math.round(bytesPerSecond / 1024))}KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)}MiB/s`;
};

const formatEta = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
};

export const createJobManager = ({
  getSettings,
  binaries,
  media,
  engine,
  homeDir = os.homedir(),
  now = () => Date.now(),
  fs = nodeFs,
  maxQueue = 20,
  historyLimit = 50,
  logger = null
}) => {
  const jobs = new Map();
  let pumping = false;

  const publicView = (job) => ({
    id: job.id,
    state: job.state,
    url: job.url,
    videoId: job.videoId,
    title: job.title,
    mode: job.mode,
    quality: job.mode === 'video' ? job.quality : null,
    container: job.mode === 'video' ? job.container : null,
    audioFormat: job.mode === 'audio' ? job.audioFormat : null,
    audioQuality: job.mode === 'audio' ? job.audioQuality : null,
    progress: job.progress,
    receivedBytes: job.receivedBytes,
    totalBytes: job.totalBytes,
    speed: job.speed,
    eta: job.eta,
    outputPath: job.outputPath,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  });

  const touch = (job) => {
    job.updatedAt = new Date(now()).toISOString();
  };

  const prune = () => {
    const finished = [...jobs.values()]
      .filter((job) => FINISHED.has(job.state))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    while (finished.length > historyLimit) {
      const oldest = finished.shift();
      jobs.delete(oldest.id);
    }
  };

  const cleanup = async (job) => {
    try {
      await fs.rm(job.dir, { recursive: true, force: true });
    } catch (error) {
      logger?.warn(`Temp cleanup failed for ${job.id}: ${error.message}`);
    }
  };

  const fail = (job, error) => {
    let safe = error;
    if (!(safe instanceof AppError)) {
      safe = error?.code === 'ENOENT'
        ? new AppError('YTDLP_MISSING')
        : (fileError(error) ?? new AppError('DOWNLOAD_FAILED'));
    }
    job.state = 'failed';
    job.error = { code: safe.code, message: safe.message };
    touch(job);
  };

  const moveIntoPlace = async (job, source) => {
    const resolved = path.resolve(source);
    if (!inside(job.dir, resolved)) throw new AppError('OUTPUT_MISSING', 'Output path escaped the job directory.');

    const destination = await uniqueDestination(job.outputDir, path.basename(resolved), fs);
    if (!inside(job.outputDir, destination)) {
      throw new AppError('OUTPUT_DIR_INVALID', 'Output path escaped the output directory.');
    }

    await fs.rename(resolved, destination);
    job.outputPath = destination;
    return destination;
  };

  const fallback = async (job, settings, controller) => {
    const result = await media.fallback({
      url: job.url,
      mode: job.mode,
      quality: job.quality,
      container: job.container,
      audioFormat: job.audioFormat,
      audioQuality: job.audioQuality,
      outputTemplate: path.join(job.dir, '%(title).120B [%(id)s].%(ext)s'),
      cookiesFromBrowser: settings?.cookiesFromBrowser ?? null,
      cookiesFile: settings?.cookiesFile ?? null,
      signal: controller.signal,
      onProgress: (progress) => {
        if (!progress) return;
        job.progress = Math.min(0.95, Math.max(0, progress.progress * 0.95));
        job.receivedBytes = progress.receivedBytes ?? job.receivedBytes;
        job.totalBytes = progress.totalBytes ?? job.totalBytes;
        job.speed = progress.speed ?? job.speed;
        job.eta = progress.eta ?? job.eta;
        touch(job);
      }
    });

    const files = await listFiles(job.dir, fs);
    const candidates = files.filter((file) => !PARTIAL.test(file) && !/\.json$/i.test(file));
    if (candidates.length === 0) throw new AppError('OUTPUT_MISSING');

    let best = null;
    for (const file of candidates) {
      const stat = await fs.stat(file);
      if (!best || stat.size > best.size) best = { file, size: stat.size };
    }
    if (!best || best.size === 0) throw new AppError('OUTPUT_MISSING');

    await moveIntoPlace(job, best.file);
    job.progress = 1;
    job.totalBytes = best.size;
    job.receivedBytes = best.size;
    job.state = 'completed';
    job.error = null;
    job.speed = null;
    job.eta = null;
    touch(job);
    return result;
  };

  const run = async (job) => {
    const settings = getSettings();
    const controller = job.controller;

    try {
      if (settings?.cookiesFile) await assertCookieFileSafe(settings.cookiesFile, homeDir);

      let plan;
      try {
        plan = await media.resolve({
          url: job.url,
          mode: job.mode,
          quality: job.quality,
          container: job.container,
          audioFormat: job.audioFormat,
          audioQuality: job.audioQuality,
          cookiesFromBrowser: settings?.cookiesFromBrowser ?? null,
          cookiesFile: settings?.cookiesFile ?? null,
          signal: controller.signal
        });
      } catch (error) {
        if (!error?.fallback) throw error;
        await fallback(job, settings, controller);
        return;
      }

      job.title = plan.title || job.title;
      job.videoId = plan.id || job.videoId;
      job.totalBytes = plan.totalBytes ?? null;

      const weights = plan.streams.map((stream) => stream.size);
      const known = weights.every((weight) => Number.isFinite(weight) && weight > 0);
      const totalWeight = known ? weights.reduce((sum, weight) => sum + weight, 0) : plan.streams.length;
      let completedWeight = 0;
      let completedBytes = 0;
      const inputs = [];

      try {
        for (let index = 0; index < plan.streams.length; index += 1) {
          const stream = plan.streams[index];
          const target = path.join(job.dir, `stream-${index}.${stream.ext || 'bin'}`);
          const weight = known ? weights[index] : 1;

          await engine.download({
            url: stream.url,
            filePath: target,
            size: stream.size,
            headers: stream.headers ?? {},
            connections: Math.min(32, Math.max(1, Number(settings?.connections) || 8)),
            speedLimitBps: Math.max(0, Number(settings?.speedLimitKbps) || 0) * 1000,
            signal: controller.signal,
            onProgress: (progress) => {
              const fraction = progress.total ? Math.min(1, progress.received / progress.total) : 0;
              const overall = totalWeight > 0 ? (completedWeight + weight * fraction) / totalWeight : 0;
              job.progress = Math.min(0.95, Math.max(0, overall * 0.95));
              job.receivedBytes = completedBytes + progress.received;
              job.totalBytes = plan.totalBytes;
              job.speed = formatSpeed(progress.speedBps);
              job.eta = formatEta(progress.etaSeconds);
              touch(job);
            }
          });

          inputs.push(target);
          completedWeight += weight;
          completedBytes += Number(stream.size) || 0;
          job.receivedBytes = completedBytes;
          job.speed = null;
          job.eta = null;
          touch(job);
        }
      } catch (error) {
        if (error?.name === 'AbortError' || controller.signal.aborted) throw error;
        if (error?.code !== 'DOWNLOAD_FAILED') throw error;
        for (const input of inputs) await fs.rm(input, { force: true }).catch(() => {});
        await fallback(job, settings, controller);
        return;
      }

      const extension = job.mode === 'audio' ? (job.audioFormat || 'mp3') : plan.extension;
      const name = `${safeFileName(plan.title || job.title || 'video')} [${plan.id || job.videoId || 'video'}].${extension}`;
      const merged = path.join(job.dir, name);
      await media.merge({
        inputs,
        output: merged,
        mode: job.mode,
        container: job.container,
        audioFormat: job.audioFormat,
        audioQuality: job.audioQuality,
        duration: plan.duration,
        signal: controller.signal,
        onProgress: (fraction) => {
          job.progress = 0.95 + Math.min(1, Math.max(0, fraction)) * 0.05;
          touch(job);
        }
      });

      const destination = await moveIntoPlace(job, merged);
      const stat = await fs.stat(destination);
      job.outputPath = destination;
      job.progress = 1;
      job.receivedBytes = stat.size;
      job.totalBytes = stat.size;
      job.speed = null;
      job.eta = null;
      job.state = 'completed';
      job.error = null;
      touch(job);
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        job.state = 'cancelled';
        job.error = null;
        touch(job);
      } else {
        fail(job, error);
      }
    } finally {
      job.child = null;
      job.controller = null;
      job.task = null;
      await cleanup(job);
      prune();
      void pump();
    }
  };

  const start = (job) => {
    job.state = 'running';
    job.controller = new AbortController();
    touch(job);
    job.task = run(job);
  };

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    try {
      for (;;) {
        const settings = getSettings();
        const limit = Math.min(Math.max(Number(settings?.concurrentDownloads) || 1, 1), 2);
        const active = [...jobs.values()].filter((job) => job.state === 'running').length;
        if (active >= limit) break;
        const next = [...jobs.values()].find((job) => job.state === 'queued');
        if (!next) break;
        start(next);
      }
    } finally {
      pumping = false;
    }
  };

  const create = async (input = {}) => {
    const parsed = parseYouTubeUrl(input.url);
    const settings = getSettings();

    const mode = validateChoice(input.mode ?? 'video', ['video', 'audio'], 'mode');
    const quality = mode === 'video'
      ? validateChoice(String(input.quality ?? settings.videoQuality), ['best', '2160', '1440', '1080', '720', '480', '360'], 'quality')
      : null;
    const container = mode === 'video'
      ? validateChoice(String(input.container ?? settings.videoContainer), ['mp4', 'mkv'], 'container')
      : null;
    const audioFormat = mode === 'audio'
      ? validateChoice(String(input.audioFormat ?? settings.audioFormat), ['mp3', 'm4a'], 'audio format')
      : null;
    const audioQuality = mode === 'audio'
      ? Number(validateChoice(Number(input.audioQuality ?? settings.audioQuality), [128, 192, 256, 320], 'audio quality'))
      : null;

    if (!binaries?.ytdlp?.available) throw new AppError('YTDLP_MISSING');
    if (!binaries?.ffmpeg?.available) throw new AppError('FFMPEG_MISSING');

    const duplicate = [...jobs.values()].find((job) => job.videoId === parsed.videoId && (job.state === 'queued' || job.state === 'running'));
    if (duplicate) throw new AppError('JOB_EXISTS');

    const queued = [...jobs.values()].filter((job) => job.state === 'queued').length;
    if (queued >= maxQueue) throw new AppError('QUEUE_FULL');

    const outputDir = await assertOutputDirSafe(settings.outputDir, homeDir);
    const id = randomUUID();
    const dir = path.join(outputDir, '.ytst-tmp', id);
    try {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    } catch (error) {
      throw fileError(error) ?? new AppError('OUTPUT_DIR_INVALID', 'The output folder could not be created.');
    }

    const timestamp = new Date(now()).toISOString();
    const job = {
      id,
      state: 'queued',
      url: parsed.url,
      videoId: parsed.videoId,
      title: typeof input.title === 'string' ? input.title.replace(/[\u0000-\u001f]/g, '').slice(0, 300) : null,
      mode,
      quality,
      container,
      audioFormat,
      audioQuality,
      progress: 0,
      receivedBytes: null,
      totalBytes: null,
      speed: null,
      eta: null,
      outputPath: null,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      dir,
      outputDir,
      controller: null,
      task: null,
      settled: false
    };

    jobs.set(id, job);
    prune();
    setImmediate(() => {
      void pump();
    });

    return publicView(job);
  };

  const get = (id) => {
    const job = jobs.get(id);
    return job ? publicView(job) : null;
  };

  const list = () => [...jobs.values()].map(publicView);

  const cancel = async (id) => {
    const job = jobs.get(id);
    if (!job) throw new AppError('NOT_FOUND');

    if (job.state === 'queued') {
      job.state = 'cancelled';
      touch(job);
      await cleanup(job);
      prune();
      void pump();
      return publicView(job);
    }

    if (job.state === 'running') {
      job.state = 'cancelled';
      touch(job);
      job.controller?.abort();
      return publicView(job);
    }

    throw new AppError('JOB_FINISHED');
  };

  const shutdown = async () => {
    const running = [];
    for (const job of jobs.values()) {
      if (job.state === 'running') {
        job.state = 'cancelled';
        touch(job);
        job.controller?.abort();
        if (job.task) running.push(job.task);
      } else if (job.state === 'queued') {
        job.state = 'cancelled';
        touch(job);
        await cleanup(job);
      }
    }
    await Promise.allSettled(running);
  };

  const cleanStale = async (outputDir) => {
    await fs.rm(path.join(outputDir, '.ytst-tmp'), { recursive: true, force: true });
  };

  return { create, get, list, cancel, shutdown, cleanStale, publicView };
};
