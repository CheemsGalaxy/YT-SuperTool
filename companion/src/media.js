import { spawn } from 'node:child_process';
import path from 'node:path';
import { AppError } from './errors.js';
import {
  buildDownloadArgs,
  buildMergeArgs,
  describeYtdlpError,
  parseFfmpegProgress,
  parseProgressLine,
  resolveDownload
} from './ytdlp.js';

const abortError = () => {
  const error = new Error('Download cancelled.');
  error.name = 'AbortError';
  return error;
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

const killTree = (child) => {
  if (!child || typeof child.kill !== 'function') return;
  try {
    if (process.platform === 'win32' && child.pid) {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => {});
      return;
    }
    child.kill('SIGKILL');
  } catch {}
};

export const createMedia = ({ ytdlpPath = 'yt-dlp', ffmpegPath = null, spawnImpl = spawn } = {}) => ({
  resolve: (input) => resolveDownload({ ...input, ytdlpPath, spawnImpl }),

  merge: ({
    inputs,
    output,
    mode,
    container,
    audioFormat,
    audioQuality,
    duration = 0,
    signal = null,
    onProgress = null
  }) => new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new AppError('FFMPEG_MISSING'));
      return;
    }

    const args = buildMergeArgs({ inputs, output, mode, container, audioFormat, audioQuality });
    const child = spawnImpl(ffmpegPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      if (error) {
        killTree(child);
        reject(error instanceof AppError ? error : new AppError('DOWNLOAD_FAILED', 'FFmpeg could not finish the media file.'));
        return;
      }
      resolve(output);
    };

    const onAbort = () => finish(abortError());
    if (signal) {
      if (signal.aborted) {
        finish(abortError());
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    attachLines(child.stdout, (line) => {
      const fraction = parseFfmpegProgress(line, duration);
      if (fraction !== null) onProgress?.(fraction);
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 32 * 1024) stderr = stderr.slice(-32 * 1024);
    });

    child.on('error', (error) => {
      finish(error?.code === 'ENOENT' ? new AppError('FFMPEG_MISSING') : new AppError('DOWNLOAD_FAILED', 'FFmpeg could not start.'));
    });

    child.on('close', (code) => {
      if (settled) return;
      if (code === 0) {
        finish(null);
        return;
      }
      const detail = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-4).join('\n');
      finish(new AppError('DOWNLOAD_FAILED', detail ? 'FFmpeg could not create the final file.' : undefined));
    });
  }),

  fallback: ({
    url,
    mode,
    quality,
    container,
    audioFormat,
    audioQuality,
    outputTemplate,
    cookiesFromBrowser = null,
    cookiesFile = null,
    signal = null,
    onProgress = null
  }) => new Promise((resolve, reject) => {
    const args = buildDownloadArgs({
      url,
      mode,
      quality,
      container,
      audioFormat,
      audioQuality,
      outputTemplate,
      ffmpegDir: ffmpegPath ? path.dirname(ffmpegPath) : null,
      cookiesFromBrowser,
      cookiesFile
    });

    const child = spawnImpl(ytdlpPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      if (error) {
        killTree(child);
        reject(error);
        return;
      }
      resolve(null);
    };

    const onAbort = () => finish(abortError());
    if (signal) {
      if (signal.aborted) {
        finish(abortError());
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    attachLines(child.stdout, (line) => {
      const progress = parseProgressLine(line);
      if (progress) onProgress?.(progress);
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 64 * 1024) stderr = stderr.slice(-64 * 1024);
    });

    child.on('error', (error) => {
      finish(error?.code === 'ENOENT' ? new AppError('YTDLP_MISSING') : new AppError('DOWNLOAD_FAILED', 'yt-dlp could not start.'));
    });

    child.on('close', (code) => {
      if (settled) return;
      if (code === 0) {
        finish(null);
        return;
      }
      const detail = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-6).join('\n');
      finish(detail ? describeYtdlpError(detail, { browser: cookiesFromBrowser }) : new AppError('DOWNLOAD_FAILED'));
    });
  })
});
