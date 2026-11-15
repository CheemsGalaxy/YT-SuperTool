import { spawn } from 'node:child_process';
import { AppError } from './errors.js';

const MAX_STDOUT = 10 * 1024 * 1024;
const PRESET_HEIGHTS = [2160, 1440, 1080, 720, 480, 360];

export const buildBaseArgs = () => [
  '--ignore-config',
  '--no-exec',
  '--no-playlist',
  '--no-warnings',
  '--newline'
];

export const buildAnalyzeArgs = (url) => [
  ...buildBaseArgs(),
  '--skip-download',
  '--dump-single-json',
  '--no-progress',
  '--socket-timeout',
  '15',
  '--',
  url
];

const selectorFor = (quality, container) => {
  const cap = quality === 'best' ? '' : `[height<=${quality}]`;
  if (container === 'mp4') {
    return `bestvideo${cap}[ext=mp4]+bestaudio[ext=m4a]/bestvideo${cap}+bestaudio/best${cap}/best`;
  }
  return `bestvideo${cap}+bestaudio/best${cap}/best`;
};

export const buildDownloadArgs = ({
  url,
  mode,
  quality,
  container,
  audioFormat,
  audioQuality,
  outputTemplate,
  ffmpegDir
}) => {
  const args = [
    ...buildBaseArgs(),
    '--socket-timeout',
    '30',
    '--retries',
    '3',
    '--no-part',
    '--progress'
  ];

  if (ffmpegDir) args.push('--ffmpeg-location', ffmpegDir);

  if (mode === 'audio') {
    args.push(
      '-x',
      '--audio-format',
      audioFormat,
      '--audio-quality',
      `${audioQuality}K`
    );
  } else {
    args.push(
      '-f',
      selectorFor(quality, container),
      '--merge-output-format',
      container
    );
  }

  args.push('-o', outputTemplate, '--', url);
  return args;
};

const UNITS = { B: 1, KB: 1000, KIB: 1024, MB: 1000 ** 2, MIB: 1024 ** 2, GB: 1000 ** 3, GIB: 1024 ** 3, TB: 1000 ** 4, TIB: 1024 ** 4 };

const toBytes = (value, unit) => {
  const multiplier = UNITS[String(unit).toUpperCase()] ?? 1;
  return Math.round(Number(value) * multiplier);
};

export const parseProgressLine = (line) => {
  if (typeof line !== 'string') return null;

  const percent = line.match(/^\[download\]\s+(\d+(?:\.\d+)?)%/);
  if (!percent) return null;

  const size = line.match(/of\s+~?\s*(\d+(?:\.\d+)?)\s*([KMGT]i?B)/i);
  const speed = line.match(/at\s+(\d+(?:\.\d+)?\s*[KMGT]i?B\/s)/i);
  const eta = line.match(/ETA\s+(\d+:\d+(?::\d+)?|Unknown)/i);

  const progress = Math.min(1, Math.max(0, Number(percent[1]) / 100));

  return {
    progress,
    totalBytes: size ? toBytes(size[1], size[2]) : null,
    receivedBytes: size ? Math.round(toBytes(size[1], size[2]) * progress) : null,
    speed: speed ? speed[1].replace(/\s+/g, '') : null,
    eta: eta ? eta[1] : null
  };
};

export const summarizeInfo = (info) => {
  const formats = Array.isArray(info?.formats) ? info.formats : [];
  const heights = [...new Set(formats.map((format) => Number(format?.height)).filter((height) => Number.isFinite(height) && height > 0))]
    .sort((left, right) => right - left);

  return {
    id: String(info?.id ?? ''),
    title: String(info?.title ?? ''),
    duration: Number(info?.duration) || 0,
    thumbnail: typeof info?.thumbnail === 'string' ? info.thumbnail : null,
    uploader: typeof info?.uploader === 'string' ? info.uploader : (typeof info?.channel === 'string' ? info.channel : null),
    heights
  };
};

export const buildOptions = ({ heights = [] } = {}) => {
  const maxHeight = heights.length ? Math.max(...heights) : 0;
  const video = [{ quality: 'best', label: 'Best available', height: maxHeight || null }];

  for (const height of PRESET_HEIGHTS) {
    if (maxHeight && height <= maxHeight) {
      video.push({ quality: String(height), label: `${height}p`, height });
    }
  }

  const audio = [
    { format: 'mp3', label: 'MP3 192 kbps' },
    { format: 'm4a', label: 'M4A best' }
  ];

  return { video, audio };
};

export const analyzeVideo = ({ ytdlpPath, url, timeoutMs = 30000, spawnImpl = spawn }) => new Promise((resolve, reject) => {
  let settled = false;
  let stdout = '';
  let stderr = '';
  let stdoutBytes = 0;

  const child = spawnImpl(ytdlpPath, buildAnalyzeArgs(url), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

  const finish = (error, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (error) {
      try {
        child.kill('SIGKILL');
      } catch {}
      reject(error);
      return;
    }
    resolve(value);
  };

  const timer = setTimeout(() => finish(new AppError('ANALYZE_TIMEOUT')), timeoutMs);
  timer.unref?.();

  child.on('error', (error) => finish(new AppError('ANALYZE_FAILED', `yt-dlp could not start: ${error.message}`)));

  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > MAX_STDOUT) {
      finish(new AppError('ANALYZE_FAILED', 'yt-dlp output is too large.'));
      return;
    }
    stdout += chunk;
  });

  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk) => {
    stderr += chunk;
    if (stderr.length > 64 * 1024) stderr = stderr.slice(-64 * 1024);
  });

  child.on('close', (code) => {
    if (settled) return;
    if (code !== 0) {
      const last = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop();
      finish(new AppError('ANALYZE_FAILED', last ? `yt-dlp: ${last}` : 'yt-dlp could not read this video.'));
      return;
    }

    let info;
    try {
      info = JSON.parse(stdout);
    } catch {
      finish(new AppError('ANALYZE_FAILED', 'yt-dlp returned invalid data.'));
      return;
    }

    const video = summarizeInfo(info);
    finish(null, { video, options: buildOptions(video) });
  });
});
