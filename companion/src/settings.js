import { lstat, open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppError } from './errors.js';

export const VIDEO_QUALITIES = ['best', '2160', '1440', '1080', '720', '480', '360'];
export const VIDEO_CONTAINERS = ['mp4', 'mkv'];
export const AUDIO_FORMATS = ['mp3', 'm4a'];
export const AUDIO_QUALITIES = [128, 192, 256, 320];
export const CONCURRENT_LIMITS = [1, 2];
export const CONNECTION_LIMITS = { min: 1, max: 32 };
export const MAX_SPEED_LIMIT_KBPS = 1_048_576;
export const COOKIE_BROWSERS = ['chrome', 'chromium', 'edge', 'brave', 'firefox', 'opera', 'vivaldi'];
export const COOKIE_FILE_MAX_BYTES = 5 * 1024 * 1024;
const COOKIE_FILE_HEADER = /^# (?:Netscape )?HTTP Cookie File/m;

export const defaultOutputDir = (homeDir = os.homedir()) => path.join(homeDir, 'Downloads', 'YT SuperTool');

const invalid = (message) => {
  throw new AppError('OUTPUT_DIR_INVALID', message);
};

const invalidCookie = (message) => {
  throw new AppError('BAD_REQUEST', message);
};

const isInside = (parent, child) => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative === '') return false;
  if (path.isAbsolute(relative)) return false;
  return relative.split(path.sep)[0] !== '..';
};

export const validateCookieFile = (value, homeDir = os.homedir()) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
    invalidCookie('Cookie file must be a path string.');
  }
  if (value.includes('\0')) invalidCookie('Cookie file path contains an invalid character.');
  if (!path.isAbsolute(value)) invalidCookie('Cookie file path must be absolute.');

  const resolved = path.resolve(value);
  if (path.dirname(resolved) === resolved) invalidCookie('Cookie file cannot be a filesystem root.');
  if (!isInside(homeDir, resolved)) invalidCookie('Cookie file must be inside the user home directory.');

  return resolved;
};

export const validateOutputDir = (value, homeDir = os.homedir()) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) invalid('Output directory must be a path string.');
  if (value.includes('\0')) invalid('Output directory contains an invalid character.');
  if (!path.isAbsolute(value)) invalid('Output directory must be absolute.');

  const resolved = path.resolve(value);
  if (path.dirname(resolved) === resolved) invalid('Output directory cannot be a filesystem root.');
  if (!isInside(homeDir, resolved)) invalid('Output directory must be inside the user home directory.');

  return resolved;
};

const assertNoSymlinks = async (target, homeDir) => {
  const home = path.resolve(homeDir);
  const relative = path.relative(home, path.resolve(target));

  let current = home;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      invalidCookie('Cookie file path cannot be read.');
    }
    if (stat.isSymbolicLink()) invalidCookie('Cookie file path must not contain symbolic links.');
  }
};

export const assertCookieFileSafe = async (file, homeDir = os.homedir()) => {
  const target = validateCookieFile(file, homeDir);
  await assertNoSymlinks(target, homeDir);

  let stat;
  try {
    stat = await lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') invalidCookie('Cookie file was not found. Export a fresh cookies.txt file and choose it again.');
    invalidCookie('Cookie file cannot be read.');
  }

  if (stat.isSymbolicLink()) invalidCookie('Cookie file must not be a symbolic link.');
  if (!stat.isFile()) invalidCookie('Cookie file must be a regular file.');
  if (stat.size === 0) invalidCookie('Cookie file is empty.');
  if (stat.size > COOKIE_FILE_MAX_BYTES) invalidCookie('Cookie file is larger than 5 MB.');

  let handle;
  try {
    handle = await open(target, 'r');
    const buffer = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead).toString('utf8').replace(/^\uFEFF/, '');
    if (!COOKIE_FILE_HEADER.test(head)) {
      invalidCookie('Cookie file must start with # Netscape HTTP Cookie File.');
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    invalidCookie('Cookie file cannot be read.');
  } finally {
    if (handle) await handle.close().catch(() => {});
  }

  return target;
};

export const assertOutputDirSafe = async (dir, homeDir = os.homedir()) => {
  const target = validateOutputDir(dir, homeDir);
  const home = path.resolve(homeDir);
  const relative = path.relative(home, target);

  let current = home;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      invalid('Output directory cannot be read.');
    }
    if (stat.isSymbolicLink()) invalid('Output directory must not contain symbolic links.');
  }

  return target;
};

export const createSettings = ({ store, homeDir = os.homedir() }) => {
  const defaults = () => ({
    outputDir: defaultOutputDir(homeDir),
    videoQuality: '1080',
    videoContainer: 'mp4',
    audioFormat: 'mp3',
    audioQuality: 192,
    concurrentDownloads: 1,
    connections: 8,
    speedLimitKbps: 0,
    cookiesFromBrowser: null,
    cookiesFile: null
  });

  let current = defaults();

  const normalizeStored = (candidate) => {
    const result = defaults();
    if (!candidate || typeof candidate !== 'object') return result;

    try {
      if (candidate.outputDir !== undefined) result.outputDir = validateOutputDir(candidate.outputDir, homeDir);
    } catch {}
    if (VIDEO_QUALITIES.includes(candidate.videoQuality)) result.videoQuality = candidate.videoQuality;
    if (VIDEO_CONTAINERS.includes(candidate.videoContainer)) result.videoContainer = candidate.videoContainer;
    if (AUDIO_FORMATS.includes(candidate.audioFormat)) result.audioFormat = candidate.audioFormat;
    if (AUDIO_QUALITIES.includes(Number(candidate.audioQuality))) result.audioQuality = Number(candidate.audioQuality);
    if (CONCURRENT_LIMITS.includes(Number(candidate.concurrentDownloads))) result.concurrentDownloads = Number(candidate.concurrentDownloads);
    if (Number.isInteger(Number(candidate.connections)) && Number(candidate.connections) >= CONNECTION_LIMITS.min && Number(candidate.connections) <= CONNECTION_LIMITS.max) {
      result.connections = Number(candidate.connections);
    }
    if (Number.isInteger(Number(candidate.speedLimitKbps)) && Number(candidate.speedLimitKbps) >= 0 && Number(candidate.speedLimitKbps) <= MAX_SPEED_LIMIT_KBPS) {
      result.speedLimitKbps = Number(candidate.speedLimitKbps);
    }
    if (candidate.cookiesFile !== undefined && candidate.cookiesFile !== null) {
      try {
        result.cookiesFile = validateCookieFile(candidate.cookiesFile, homeDir);
      } catch {}
    }
    if (result.cookiesFile) {
      result.cookiesFromBrowser = null;
    } else {
      if (candidate.cookiesFromBrowser === null) result.cookiesFromBrowser = null;
      if (COOKIE_BROWSERS.includes(candidate.cookiesFromBrowser)) result.cookiesFromBrowser = candidate.cookiesFromBrowser;
    }

    return result;
  };

  const validatePatch = (patch) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new AppError('BAD_REQUEST', 'Settings must be an object.');
    }

    const keys = Object.keys(patch);
    if (keys.length === 0) throw new AppError('BAD_REQUEST', 'Settings patch is empty.');
    if (keys.includes('cookiesFromBrowser') && keys.includes('cookiesFile')) {
      throw new AppError('BAD_REQUEST', 'Choose either a browser or a cookie file, not both.');
    }

    const next = {};
    for (const key of keys) {
      const value = patch[key];
      switch (key) {
        case 'outputDir':
          next.outputDir = validateOutputDir(value, homeDir);
          break;
        case 'videoQuality':
          if (!VIDEO_QUALITIES.includes(value)) throw new AppError('BAD_REQUEST', 'Unknown video quality.');
          next.videoQuality = value;
          break;
        case 'videoContainer':
          if (!VIDEO_CONTAINERS.includes(value)) throw new AppError('BAD_REQUEST', 'Unknown video container.');
          next.videoContainer = value;
          break;
        case 'audioFormat':
          if (!AUDIO_FORMATS.includes(value)) throw new AppError('BAD_REQUEST', 'Unknown audio format.');
          next.audioFormat = value;
          break;
        case 'audioQuality': {
          const numeric = Number(value);
          if (!AUDIO_QUALITIES.includes(numeric)) throw new AppError('BAD_REQUEST', 'Unknown audio quality.');
          next.audioQuality = numeric;
          break;
        }
        case 'concurrentDownloads': {
          const numeric = Number(value);
          if (!CONCURRENT_LIMITS.includes(numeric)) throw new AppError('BAD_REQUEST', 'Concurrent downloads must be 1 or 2.');
          next.concurrentDownloads = numeric;
          break;
        }
        case 'connections': {
          const numeric = Number(value);
          if (!Number.isInteger(numeric) || numeric < CONNECTION_LIMITS.min || numeric > CONNECTION_LIMITS.max) {
            throw new AppError('BAD_REQUEST', 'Connections must be between 1 and 32.');
          }
          next.connections = numeric;
          break;
        }
        case 'speedLimitKbps': {
          const numeric = Number(value);
          if (!Number.isInteger(numeric) || numeric < 0 || numeric > MAX_SPEED_LIMIT_KBPS) {
            throw new AppError('BAD_REQUEST', 'Speed limit must be zero or a positive number of KB/s.');
          }
          next.speedLimitKbps = numeric;
          break;
        }
        case 'cookiesFromBrowser':
          if (value !== null && !COOKIE_BROWSERS.includes(value)) {
            throw new AppError('BAD_REQUEST', 'Unknown cookie source.');
          }
          next.cookiesFromBrowser = value;
          next.cookiesFile = null;
          break;
        case 'cookiesFile':
          next.cookiesFile = value === null ? null : validateCookieFile(value, homeDir);
          next.cookiesFromBrowser = null;
          break;
        default:
          throw new AppError('BAD_REQUEST', `Unknown setting: ${key}`);
      }
    }

    return next;
  };

  const load = async () => {
    const stored = await store.load('settings.json', null);
    current = normalizeStored(stored);
    return get();
  };

  const get = () => ({ ...current });

  const update = async (patch) => {
    const next = validatePatch(patch);
    if (next.outputDir) await assertOutputDirSafe(next.outputDir, homeDir);
    if (next.cookiesFile) await assertCookieFileSafe(next.cookiesFile, homeDir);
    current = { ...current, ...next };
    await store.save('settings.json', current);
    return get();
  };

  return { load, get, update, assertCookieFile: (file) => assertCookieFileSafe(file, homeDir) };
};
