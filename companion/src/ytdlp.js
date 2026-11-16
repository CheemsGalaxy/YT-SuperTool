import { spawn } from 'node:child_process';
import { AppError } from './errors.js';

const MAX_STDOUT = 10 * 1024 * 1024;
const PRESET_HEIGHTS = [2160, 1440, 1080, 720, 480, 360];

const ERROR_RULES = [
  { code: 'OUTPUT_DIR_INVALID', message: 'The output folder is out of free space.', pattern: /no space left on device|enospc|disk quota exceeded|not enough space|winerror 112/i },
  { code: 'OUTPUT_DIR_INVALID', message: 'The output folder is not writable.', pattern: /permission denied|eacces|eperm|winerror 5\b|access is denied/i },
  { code: 'YTDLP_MISSING', message: 'The companion cannot start its download tool.', pattern: /spawn .*enoent|is not recognized as an internal|no such file or directory/i },
  { message: 'The connection to YouTube was interrupted. Try again.', pattern: /broken pipe|connection closed|incomplete read/i },
  { message: 'YouTube refused this download (HTTP 403).', pattern: /http error 403|403: forbidden/i },
  { message: 'YouTube is limiting requests right now. Try again later.', pattern: /http error 429|too many requests|rate limit/i },
  { message: 'YouTube asked for a bot check, and the companion does not use YouTube cookies.', pattern: /not a bot|captcha|confirm your identity/i },
  { message: 'This video is age restricted, and the companion does not use YouTube cookies.', pattern: /confirm your age|age.?restrict/i },
  { message: 'This video is private.', pattern: /private video|this video is private/i },
  { message: 'This video is for channel members only.', pattern: /members.?only|join this channel/i },
  { message: 'This video is not available in your country.', pattern: /not available in your country|geo.?restrict/i },
  { message: 'This video has not started yet.', pattern: /will begin in|premieres in|this live event/i },
  { message: 'This video is not available.', pattern: /video unavailable|no longer available|has been removed|removed by the uploader|account .*terminated/i },
  { message: 'This video is DRM protected and cannot be downloaded.', pattern: /\bdrm\b/i },
  { message: 'No downloadable format matches the selected quality.', pattern: /requested format is not available|no video formats found/i },
  { message: 'FFmpeg could not process this download.', pattern: /ffmpeg|ffprobe|postprocess|conversion failed/i },
  { message: 'The companion could not reach YouTube. Check the network connection.', pattern: /unable to download|getaddrinfo|enotfound|econnreset|econnrefused|connection reset|connection aborted|network is unreachable|name resolution|timed out|timeout/i }
];

export const describeYtdlpError = (text, { code = 'DOWNLOAD_FAILED' } = {}) => {
  const source = String(text ?? '');
  for (const rule of ERROR_RULES) {
    if (rule.pattern.test(source)) return new AppError(rule.code ?? code, rule.message);
  }
  return new AppError(code);
};

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

  child.on('error', (error) => finish(
    error?.code === 'ENOENT'
      ? new AppError('YTDLP_MISSING')
      : new AppError('ANALYZE_FAILED', 'yt-dlp could not start.')
  ));

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
      const detail = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-6).join('\n');
      finish(detail ? describeYtdlpError(detail, { code: 'ANALYZE_FAILED' }) : new AppError('ANALYZE_FAILED'));
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
