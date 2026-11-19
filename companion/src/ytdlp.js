import { spawn } from 'node:child_process';
import { AppError } from './errors.js';

const MAX_STDOUT = 10 * 1024 * 1024;
const PRESET_HEIGHTS = [2160, 1440, 1080, 720, 480, 360];

const BROWSER_LABELS = {
  chrome: 'Google Chrome',
  chromium: 'Chromium',
  edge: 'Microsoft Edge',
  brave: 'Brave',
  firefox: 'Firefox',
  opera: 'Opera',
  vivaldi: 'Vivaldi'
};

const COOKIE_DB_LOCKED = /could not copy .*cookie|cookie database.*(?:locked|permission|denied)|failed to copy .*cookie/i;
const COOKIE_DECRYPT_FAILED = /failed to decrypt|decrypt.*cookie|cookie.*decrypt|dpapi|app.?bound/i;
const COOKIE_READ_FAILED = /could not read cookies|failed to extract cookies/i;
const COOKIE_FILE_INVALID = /does not look like a netscape format cookies file|invalid cookie file|failed to read cookie file|cookie file.*invalid/i;

const ERROR_RULES = [
  { code: 'OUTPUT_DIR_INVALID', message: 'The output folder is out of free space.', pattern: /no space left on device|enospc|disk quota exceeded|not enough space|winerror 112/i },
  { code: 'OUTPUT_DIR_INVALID', message: 'The output folder is not writable.', pattern: /permission denied|eacces|eperm|winerror 5\b|access is denied/i },
  { code: 'YTDLP_MISSING', message: 'The companion cannot start its download tool.', pattern: /spawn .*enoent|is not recognized as an internal|no such file or directory/i },
  { message: 'The connection to YouTube was interrupted. Try again.', pattern: /broken pipe|connection closed|incomplete read/i },
  { message: 'YouTube refused this download (HTTP 403).', pattern: /http error 403|403: forbidden/i },
  { message: 'YouTube is limiting requests right now. Try again later.', pattern: /http error 429|too many requests|rate limit/i },
  { message: 'YouTube asked for a bot check. Retry, or turn on browser cookies in the companion settings.', pattern: /not a bot|captcha|confirm your identity/i },
  { message: 'This video is age restricted. Turn on browser cookies in the companion settings to download it.', pattern: /confirm your age|age.?restrict/i },
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

export const describeYtdlpError = (text, { code = 'DOWNLOAD_FAILED', browser = null } = {}) => {
  const source = String(text ?? '');
  const label = BROWSER_LABELS[browser] ?? 'the selected browser';
  if (COOKIE_FILE_INVALID.test(source)) {
    return new AppError(code, 'The companion could not read the cookie file. Export YouTube cookies to a fresh Netscape cookies.txt file, then choose it again.');
  }
  if (COOKIE_DB_LOCKED.test(source)) {
    const fallback = browser === 'firefox'
      ? ' If it still fails, use a cookies.txt file in the companion settings.'
      : ' If it still fails, choose Firefox or a cookies.txt file in the companion settings.';
    return new AppError(code, `The companion could not read cookies from ${label} because the browser keeps the cookie file open. Quit ${label} completely, including background processes, then retry.${fallback}`);
  }
  if (COOKIE_DECRYPT_FAILED.test(source)) {
    const fallback = browser === 'firefox'
      ? ' If it still fails, use a cookies.txt file in the companion settings.'
      : ' If it keeps failing, choose Firefox or a cookies.txt file in the companion settings.';
    return new AppError(code, `The companion could not decrypt cookies from ${label}. Open ${label}, sign in to YouTube again, then retry.${fallback}`);
  }
  if (COOKIE_READ_FAILED.test(source)) {
    return new AppError(code, `The companion could not read cookies from ${label}. Choose another browser or a cookies.txt file in the companion settings, or turn cookies off.`);
  }
  for (const rule of ERROR_RULES) {
    if (rule.pattern.test(source)) return new AppError(rule.code ?? code, rule.message);
  }
  return new AppError(code);
};

export const buildBaseArgs = ({ cookiesFromBrowser = null, cookiesFile = null, jsRuntimePath = process.execPath } = {}) => {
  const args = [
    '--ignore-config',
    '--no-exec',
    '--no-playlist',
    '--no-warnings',
    '--newline'
  ];
  if (jsRuntimePath) args.push('--js-runtimes', `node:${jsRuntimePath}`);
  if (cookiesFile) args.push('--cookies', cookiesFile);
  else if (cookiesFromBrowser) args.push('--cookies-from-browser', cookiesFromBrowser);
  return args;
};

export const buildAnalyzeArgs = (url, options = {}) => [
  ...buildBaseArgs(options),
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
  ffmpegDir,
  cookiesFromBrowser = null,
  cookiesFile = null
}) => {
  const args = [
    ...buildBaseArgs({ cookiesFromBrowser, cookiesFile }),
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

export const analyzeVideo = ({ ytdlpPath, url, cookiesFromBrowser = null, cookiesFile = null, timeoutMs = 30000, spawnImpl = spawn }) => new Promise((resolve, reject) => {
  let settled = false;
  let stdout = '';
  let stderr = '';
  let stdoutBytes = 0;

  const child = spawnImpl(ytdlpPath, buildAnalyzeArgs(url, { cookiesFromBrowser, cookiesFile }), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

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
      finish(detail ? describeYtdlpError(detail, { code: 'ANALYZE_FAILED', browser: cookiesFromBrowser }) : new AppError('ANALYZE_FAILED'));
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

const SELECTOR_LIMIT = 32 * 1024 * 1024;

const abortError = () => {
  const error = new Error('Download cancelled.');
  error.name = 'AbortError';
  return error;
};

export const buildResolveArgs = (url, { mode, quality, container, cookiesFromBrowser = null, cookiesFile = null, jsRuntimePath = process.execPath } = {}) => {
  const selector = mode === 'audio' ? 'ba/b' : selectorFor(quality, container);
  return [
    ...buildBaseArgs({ cookiesFromBrowser, cookiesFile, jsRuntimePath }),
    '-f',
    selector,
    '--skip-download',
    '--dump-single-json',
    '--no-progress',
    '--socket-timeout',
    '15',
    '--',
    url
  ];
};

const runJson = ({ ytdlpPath, args, timeoutMs, signal, spawnImpl }) => new Promise((resolve, reject) => {
  let settled = false;
  let stdout = '';
  let stderr = '';
  let size = 0;

  const child = spawnImpl(ytdlpPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

  const timer = setTimeout(() => finish(new AppError('ANALYZE_TIMEOUT', 'yt-dlp did not answer in time.')), timeoutMs);
  timer.unref?.();

  const stop = () => {
    try {
      child.kill('SIGKILL');
    } catch {}
  };

  const finish = (error, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
    if (error) {
      stop();
      reject(error);
      return;
    }
    resolve(value);
  };

  const onAbort = () => finish(abortError());
  if (signal) {
    if (signal.aborted) {
      finish(abortError());
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  child.on('error', (error) => finish(
    error?.code === 'ENOENT' ? new AppError('YTDLP_MISSING') : new AppError('ANALYZE_FAILED', 'yt-dlp could not start.')
  ));

  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk) => {
    size += chunk.length;
    if (size > SELECTOR_LIMIT) {
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
      finish(detail ? describeYtdlpError(detail, { code: 'DOWNLOAD_FAILED' }) : new AppError('DOWNLOAD_FAILED'));
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      finish(new AppError('DOWNLOAD_FAILED', 'yt-dlp returned invalid data.'));
      return;
    }
    finish(null, parsed);
  });
});

export const resolveDownload = async ({
  ytdlpPath,
  url,
  mode,
  quality,
  container,
  cookiesFromBrowser = null,
  cookiesFile = null,
  timeoutMs = 60000,
  signal = null,
  spawnImpl = spawn
}) => {
  const info = await runJson({
    ytdlpPath,
    args: buildResolveArgs(url, { mode, quality, container, cookiesFromBrowser, cookiesFile }),
    timeoutMs,
    signal,
    spawnImpl
  });

  return planFromInfo(info, { mode, container });
};

const MEDIA_HEADERS = new Set([
  'user-agent',
  'accept',
  'accept-language',
  'referer',
  'origin',
  'sec-fetch-mode',
  'sec-fetch-dest',
  'sec-fetch-site'
]);

const mediaHeaders = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [name, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== 'string') continue;
    if (!MEDIA_HEADERS.has(name.toLowerCase())) continue;
    result[name] = headerValue;
  }
  return result;
};

export const planFromInfo = (info, { mode, container }) => {
  const requested = Array.isArray(info?.requested_downloads) && info.requested_downloads.length > 0
    ? info.requested_downloads
    : (typeof info?.url === 'string' ? [info] : []);

  const entries = [];
  for (const entry of requested) {
    if (Array.isArray(entry?.requested_formats) && entry.requested_formats.length > 0) entries.push(...entry.requested_formats);
    else entries.push(entry);
  }

  const streams = entries.map((entry) => {
    const exact = Number(entry?.filesize);
    const approximate = Number(entry?.filesize_approx);
    return {
      url: typeof entry?.url === 'string' ? entry.url : null,
      formatId: String(entry?.format_id ?? ''),
      ext: String(entry?.ext ?? ''),
      vcodec: typeof entry?.vcodec === 'string' ? entry.vcodec : null,
      acodec: typeof entry?.acodec === 'string' ? entry.acodec : null,
      headers: mediaHeaders(entry?.http_headers),
      size: Number.isSafeInteger(exact) && exact > 0 ? exact : (Number.isSafeInteger(approximate) && approximate > 0 ? approximate : null)
    };
  }).filter((stream) => stream.url);

  if (streams.length === 0) {
    const error = new AppError('DOWNLOAD_FAILED', 'yt-dlp returned no direct media URL.');
    error.fallback = true;
    throw error;
  }

  const sizesKnown = streams.every((stream) => stream.size !== null);

  return {
    id: String(info?.id ?? ''),
    title: String(info?.title ?? ''),
    duration: Number(info?.duration) || 0,
    extension: mode === 'audio' ? 'mp3' : container,
    streams,
    totalBytes: sizesKnown ? streams.reduce((sum, stream) => sum + stream.size, 0) : null
  };
};

export const safeFileName = (value, fallback = 'video') => {
  const clean = String(value ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .replace(/[. ]+$/g, '');
  return clean || fallback;
};

export const buildMergeArgs = ({ inputs, output, mode, container, audioFormat, audioQuality }) => {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-nostdin', '-progress', 'pipe:1', '-nostats'];
  for (const input of inputs) args.push('-i', input);

  if (mode === 'audio') {
    args.push('-map', '0:a:0', '-vn');
    if (audioFormat === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', `${audioQuality}k`);
    } else {
      args.push('-c:a', 'aac', '-b:a', `${audioQuality}k`);
    }
  } else {
    if (inputs.length > 1) args.push('-map', '0:v:0', '-map', '1:a:0');
    else args.push('-map', '0:v:0', '-map', '0:a:0?');
    args.push('-c', 'copy');
    if (container === 'mp4') args.push('-movflags', '+faststart');
  }

  args.push(output);
  return args;
};

export const parseFfmpegProgress = (line, duration) => {
  const match = String(line ?? '').match(/^out_time_ms=(\d+)$/);
  if (!match) return null;
  const seconds = Number(match[1]) / 1_000_000;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return Math.min(1, seconds / duration);
};

