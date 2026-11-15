import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as nodeFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppError } from './errors.js';
import { assertOutputDirSafe } from './settings.js';
import { parseYouTubeUrl } from './url-policy.js';

const FINISHED = new Set(['completed', 'failed', 'cancelled']);
const PARTIAL = /\.(part|ytdl|temp|tmp)$/i;

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

const attachLines = (stream, onLine) => {
  if (!stream?.on) return;
  let buffer = '';
  stream.setEncoding?.('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const parts = buffer.split(/\r\n|\n|\r/);
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      if (part) onLine(part);
    }
    if (buffer.length > 64 * 1024) buffer = buffer.slice(-4096);
  });
};

const validateChoice = (value, allowed, name) => {
  if (!allowed.includes(value)) throw new AppError('BAD_REQUEST', `Invalid ${name}.`);
  return value;
};

export const createJobManager = ({
  getSettings,
  binaries,
  ytdlp,
  launcher,
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

  const killChild = (job) => {
    const child = job.child;
    if (!child || typeof child.kill !== 'function') return;
    try {
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => {});
        return;
      }
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM');
          return;
        } catch {}
      }
      child.kill('SIGTERM');
    } catch {}
  };

  const fail = (job, error) => {
    job.state = 'failed';
    job.error = {
      code: error?.code ?? 'DOWNLOAD_FAILED',
      message: error?.message ?? 'Download failed.'
    };
    touch(job);
  };

  const finalize = async (job) => {
    const files = await listFiles(job.dir, fs);
    const candidates = files.filter((file) => !PARTIAL.test(file) && !/\.json$/i.test(file));
    if (candidates.length === 0) throw new AppError('OUTPUT_MISSING');

    let best = null;
    for (const file of candidates) {
      const stat = await fs.stat(file);
      if (!best || stat.size > best.size) best = { file, size: stat.size };
    }
    if (!best || best.size === 0) throw new AppError('OUTPUT_MISSING');

    const source = path.resolve(best.file);
    if (!inside(job.dir, source)) {
      throw new AppError('OUTPUT_MISSING', 'Output path escaped the job directory.');
    }

    const destination = await uniqueDestination(job.outputDir, path.basename(source), fs);
    if (!inside(job.outputDir, destination)) {
      throw new AppError('OUTPUT_DIR_INVALID', 'Output path escaped the output directory.');
    }

    await fs.rename(source, destination);

    job.outputPath = destination;
    job.progress = 1;
    job.totalBytes = best.size;
    job.receivedBytes = best.size;
    job.state = 'completed';
    job.error = null;
    touch(job);
    await cleanup(job);
  };

  const finish = async (job, outcome) => {
    if (job.settled) return;
    job.settled = true;
    job.child = null;

    if (job.state === 'cancelled') {
      await cleanup(job);
    } else if (outcome.error) {
      fail(job, outcome.error);
      await cleanup(job);
    } else if (outcome.code === 0) {
      try {
        await finalize(job);
      } catch (error) {
        fail(job, error);
        await cleanup(job);
      }
    } else {
      const detail = job.stderr[job.stderr.length - 1];
      fail(job, new AppError(
        'DOWNLOAD_FAILED',
        detail ? `yt-dlp: ${detail}` : `yt-dlp exited with code ${outcome.code ?? 'unknown'}.`
      ));
      await cleanup(job);
    }

    prune();
    void pump();
  };

  const start = async (job) => {
    job.state = 'running';
    touch(job);

    try {
      const outputTemplate = path.join(job.dir, '%(title).120B [%(id)s].%(ext)s');
      const args = ytdlp.buildDownloadArgs({
        url: job.url,
        mode: job.mode,
        quality: job.quality,
        container: job.container,
        audioFormat: job.audioFormat,
        audioQuality: job.audioQuality,
        outputTemplate,
        ffmpegDir: binaries.ffmpeg?.path ? path.dirname(binaries.ffmpeg.path) : null
      });

      const child = launcher(job, binaries.ytdlp.path, args);
      job.child = child;

      attachLines(child.stdout, (line) => {
        const progress = ytdlp.parseProgressLine(line);
        if (!progress) return;
        job.progress = progress.progress;
        job.receivedBytes = progress.receivedBytes ?? job.receivedBytes;
        job.totalBytes = progress.totalBytes ?? job.totalBytes;
        job.speed = progress.speed;
        job.eta = progress.eta;
        touch(job);
      });

      attachLines(child.stderr, (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        job.stderr.push(trimmed);
        if (job.stderr.length > 40) job.stderr.shift();
      });

      child.on('error', (error) => {
        void finish(job, { error: new AppError('DOWNLOAD_FAILED', error.message) });
      });

      child.on('close', (code, signal) => {
        void finish(job, { code, signal });
      });
    } catch (error) {
      fail(job, error instanceof AppError ? error : new AppError('DOWNLOAD_FAILED', error.message));
      await cleanup(job);
      prune();
      void pump();
    }
  };

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    try {
      while (true) {
        const settings = getSettings();
        const limit = Math.min(Math.max(Number(settings?.concurrentDownloads) || 1, 1), 2);
        const active = [...jobs.values()].filter((job) => job.state === 'running').length;
        if (active >= limit) break;
        const next = [...jobs.values()].find((job) => job.state === 'queued');
        if (!next) break;
        await start(next);
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
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });

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
      child: null,
      settled: false,
      stderr: []
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
      killChild(job);
      return publicView(job);
    }

    throw new AppError('JOB_FINISHED');
  };

  const shutdown = async () => {
    for (const job of jobs.values()) {
      if (job.state === 'running') {
        job.state = 'cancelled';
        touch(job);
        killChild(job);
      } else if (job.state === 'queued') {
        job.state = 'cancelled';
        touch(job);
        await cleanup(job);
      }
    }
  };

  const cleanStale = async (outputDir) => {
    await fs.rm(path.join(outputDir, '.ytst-tmp'), { recursive: true, force: true });
  };

  return { create, get, list, cancel, shutdown, cleanStale, publicView };
};
