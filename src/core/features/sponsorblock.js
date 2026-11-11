import { SPONSOR_CATEGORIES } from '../settings-schema.js';
import { UI_STRINGS, UI_TEXT } from '../ui/strings.js';

const API_BASE = 'https://sponsor.ajay.app/api';
const CACHE_TTL = 30 * 60 * 1000;
const CACHE_MAX = 120;
const TICK_INTERVAL = 250;
const MIN_SEGMENT_LENGTH = 0.5;
const NOTICE_DURATION = 5000;

const getPlayer = () => document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
const getVideo = () => getPlayer()?.querySelector('video') || document.querySelector('video');

let cachedHref = '';
let cachedVideoId = '';

const getVideoId = () => {
  if (location.href === cachedHref) return cachedVideoId;
  cachedHref = location.href;
  try {
    const url = new URL(cachedHref);
    cachedVideoId = url.searchParams.get('v')
      || url.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/)?.[1]
      || (url.hostname === 'youtu.be' ? url.pathname.slice(1) : '');
  } catch {
    cachedVideoId = '';
  }
  return cachedVideoId;
};

const cacheKey = (videoId, categories) => `${videoId}|${categories.slice().sort().join(',')}`;

function normalizeCategories(raw) {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  return Object.fromEntries(
    Object.entries(SPONSOR_CATEGORIES).map(([key, meta]) => [
      key,
      typeof raw?.[key] === 'boolean' ? raw[key] : meta.enabled
    ])
  );
}

function normalizeSegments(list) {
  return (Array.isArray(list) ? list : [])
    .filter((segment) => segment && Array.isArray(segment.segment))
    .filter((segment) => Number.isFinite(Number(segment.segment[0])) && Number.isFinite(Number(segment.segment[1])))
    .filter((segment) => Number(segment.segment[1]) - Number(segment.segment[0]) >= MIN_SEGMENT_LENGTH)
    .filter((segment) => !segment.actionType || segment.actionType === 'skip')
    .map((segment) => ({
      uuid: segment.UUID || `${segment.segment[0]}-${segment.segment[1]}`,
      category: segment.category || 'sponsor',
      start: Number(segment.segment[0]),
      end: Number(segment.segment[1]),
      videoDuration: Number(segment.videoDuration) || 0
    }))
    .sort((a, b) => a.start - b.start);
}

export function createSponsorBlock({ bridge }) {
  const storage = bridge.storage;
  const segmentCache = new Map();
  const inflight = new Map();
  let enabled = false;
  let tickTimer = 0;
  let currentVideoId = '';
  let segments = [];
  let skipped = new Set();
  let fetchToken = 0;
  let lastSkip = null;
  let noticeEl = null;
  let noticeTimer = 0;
  let noticeEnabled = true;
  let seekingBound = false;

  async function activeCategories() {
    const categories = normalizeCategories(await storage.get('sponsorblockCategories', null));
    return Object.keys(categories).filter((key) => categories[key]);
  }

  function getCached(videoId, categories) {
    const key = cacheKey(videoId, categories);
    const hit = segmentCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.time > CACHE_TTL) {
      segmentCache.delete(key);
      return null;
    }
    return hit.segments;
  }

  function setCache(videoId, categories, list) {
    segmentCache.set(cacheKey(videoId, categories), { segments: list, time: Date.now() });
    while (segmentCache.size > CACHE_MAX) {
      segmentCache.delete(segmentCache.keys().next().value);
    }
  }

  async function fetchSegments(videoId, categories) {
    const key = cacheKey(videoId, categories);
    if (inflight.has(key)) return inflight.get(key);

    const url = `${API_BASE}/skipSegments?videoID=${encodeURIComponent(videoId)}`
      + `&categories=${encodeURIComponent(JSON.stringify(categories))}`
      + `&actionTypes=${encodeURIComponent('["skip"]')}`;

    const promise = (async () => {
      try {
        const response = await bridge.network.request(url, {
          responseType: 'text',
          timeout: 8000,
          allowHttpErrors: true
        });
        if (response.status === 404) return { ok: true, segments: [] };
        if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
        const data = await response.json();
        return { ok: true, segments: Array.isArray(data) ? data : [] };
      } catch (error) {
        return { ok: false, error: error.message };
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, promise);
    return promise;
  }

  async function loadSegments(videoId) {
    const token = ++fetchToken;
    segments = [];
    skipped = new Set();
    lastSkip = null;
    hideNotice();
    if (!enabled || !videoId) return;

    const categories = await activeCategories().catch(() => []);
    if (!enabled || token !== fetchToken || videoId !== currentVideoId || !categories.length) return;

    const cached = getCached(videoId, categories);
    if (cached) {
      segments = cached;
      return;
    }

    const result = await fetchSegments(videoId, categories);
    if (!enabled || token !== fetchToken || videoId !== currentVideoId) return;
    if (!result.ok) {
      console.warn('YT SuperTool could not load SponsorBlock segments:', result.error);
      return;
    }
    segments = normalizeSegments(result.segments);
    setCache(videoId, categories, segments);
  }

  function ensureNotice() {
    if (noticeEl?.isConnected) return noticeEl;
    const player = getPlayer();
    if (!player) return null;

    noticeEl = document.createElement('div');
    noticeEl.className = 'ytst-sb-notice';

    const bar = document.createElement('span');
    bar.className = 'ytst-sb-bar';
    const label = document.createElement('span');
    label.className = 'ytst-sb-label';
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'ytst-sb-undo';
    undo.textContent = UI_STRINGS.undo;
    undo.addEventListener('pointerdown', (event) => event.stopPropagation());
    undo.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      undoSkip();
    });

    noticeEl.append(bar, label, undo);
    player.appendChild(noticeEl);
    return noticeEl;
  }

  function showNotice(segment) {
    if (!noticeEnabled) return;
    const notice = ensureNotice();
    if (!notice) return;
    const meta = SPONSOR_CATEGORIES[segment.category] || SPONSOR_CATEGORIES.sponsor;
    const seconds = Math.max(1, Math.round(segment.end - segment.start));
    notice.style.setProperty('--ytst-sb-color', meta.color);
    notice.querySelector('.ytst-sb-label').textContent = UI_TEXT.skipped(meta.label, seconds);
    clearTimeout(noticeTimer);
    notice.classList.add('is-visible');
    noticeTimer = setTimeout(hideNotice, NOTICE_DURATION);
  }

  function hideNotice() {
    clearTimeout(noticeTimer);
    noticeTimer = 0;
    noticeEl?.classList.remove('is-visible');
  }

  function undoSkip() {
    const video = getVideo();
    if (video && lastSkip) {
      try {
        video.currentTime = Math.max(0, lastSkip.start);
      } catch (error) {
        console.warn('YT SuperTool SponsorBlock undo:', error);
      }
    }
    hideNotice();
  }

  function doSkip(video, segment) {
    skipped.add(segment.uuid);
    lastSkip = segment;
    try {
      video.currentTime = Math.min(segment.end, Number(video.duration) || segment.end);
    } catch (error) {
      console.warn('YT SuperTool SponsorBlock seek:', error);
    }
    showNotice(segment);
  }

  function tick() {
    if (!enabled) return;
    const video = getVideo();
    if (!video || video.closest('.html5-video-player')?.classList.contains('ad-showing')) return;

    const videoId = getVideoId();
    if (videoId !== currentVideoId) {
      currentVideoId = videoId;
      void loadSegments(videoId);
      return;
    }

    if (!segments.length || video.readyState < 1) return;
    const duration = Number(video.duration);
    if (!Number.isFinite(duration) || duration <= 0) return;

    for (const segment of segments) {
      if (video.currentTime < segment.start) break;
      if (video.currentTime >= segment.end || skipped.has(segment.uuid)) continue;
      if (segment.videoDuration > 0 && Math.abs(segment.videoDuration - duration) > 2) continue;
      doSkip(video, segment);
      return;
    }
  }

  function onSeeking(event) {
    if (!enabled || !segments.length || !(event.target instanceof HTMLVideoElement)) return;
    if (getVideo() !== event.target) return;
    for (const uuid of [...skipped]) {
      const segment = segments.find((item) => item.uuid === uuid);
      if (segment && event.target.currentTime < segment.start - 0.5) skipped.delete(uuid);
    }
  }

  function onStorageChanged(changes) {
    if (changes.sponsorblockNotice) noticeEnabled = Boolean(changes.sponsorblockNotice.newValue);
    if (changes.sponsorblockCategories) {
      segmentCache.clear();
      if (enabled) void loadSegments(currentVideoId);
    }
  }

  storage.onChanged(onStorageChanged, ['sponsorblockCategories', 'sponsorblockNotice']);
  storage.get('sponsorblockNotice', true)
    .then((value) => {
      noticeEnabled = Boolean(value);
    })
    .catch((error) => console.error('YT SuperTool could not load SponsorBlock notice setting:', error));

  document.addEventListener('yt-navigate-finish', () => {
    if (!enabled) return;
    currentVideoId = '';
    segments = [];
    skipped = new Set();
    lastSkip = null;
    hideNotice();
  }, { passive: true });

  return {
    init() {
      if (enabled) {
        if (!tickTimer) tickTimer = setInterval(tick, TICK_INTERVAL);
        const videoId = getVideoId();
        if (videoId && videoId !== currentVideoId) {
          currentVideoId = videoId;
          void loadSegments(videoId);
        }
        return;
      }
      enabled = true;
      document.addEventListener('seeking', onSeeking, true);
      seekingBound = true;
      tickTimer = setInterval(tick, TICK_INTERVAL);
      currentVideoId = getVideoId();
      void loadSegments(currentVideoId);
    },
    stop() {
      enabled = false;
      clearInterval(tickTimer);
      tickTimer = 0;
      if (seekingBound) {
        document.removeEventListener('seeking', onSeeking, true);
        seekingBound = false;
      }
      fetchToken += 1;
      segments = [];
      skipped = new Set();
      lastSkip = null;
      currentVideoId = '';
      hideNotice();
      noticeEl?.remove();
      noticeEl = null;
    }
  };
}

export default createSponsorBlock;
