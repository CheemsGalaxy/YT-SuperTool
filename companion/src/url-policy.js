import { AppError } from './errors.js';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com'
]);
const SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be']);
const PATH_PREFIXES = new Set(['shorts', 'live', 'embed', 'v']);

const reject = () => {
  throw new AppError('INVALID_URL', 'Only YouTube watch, Shorts, live and youtu.be links are supported.');
};

export const normalizeVideoId = (value) => {
  const id = String(value ?? '').trim();
  if (!VIDEO_ID.test(id)) reject();
  return id;
};

export const normalizeUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;

export const parseYouTubeUrl = (input) => {
  if (typeof input !== 'string' || input.length === 0 || input.length > 2048) reject();

  let url;
  try {
    url = new URL(input);
  } catch {
    reject();
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') reject();
  if (url.username || url.password) reject();
  if (url.port && url.port !== '80' && url.port !== '443') reject();

  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);

  if (SHORT_HOSTS.has(host)) {
    if (parts.length !== 1) reject();
    const videoId = normalizeVideoId(parts[0]);
    return { videoId, url: normalizeUrl(videoId) };
  }

  if (!YOUTUBE_HOSTS.has(host)) reject();

  const first = parts[0]?.toLowerCase();
  if (first === 'watch') {
    const videoId = normalizeVideoId(url.searchParams.get('v'));
    return { videoId, url: normalizeUrl(videoId) };
  }

  if (PATH_PREFIXES.has(first)) {
    if (parts.length !== 2) reject();
    const videoId = normalizeVideoId(parts[1]);
    return { videoId, url: normalizeUrl(videoId) };
  }

  reject();
};

export const normalizeYouTubeUrl = (input) => parseYouTubeUrl(input).url;
