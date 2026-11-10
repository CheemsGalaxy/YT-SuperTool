import { initAdblockBackground } from './adblock-background.js';

const DISLIKE_CACHE_TTL = 5 * 60 * 1000;
const CACHE_PREFIX = 'dislike_';
const CACHE_MAX_ENTRIES = 500;
const ALLOWED_FETCH_HOSTS = ['returnyoutubedislikeapi.com', 'sponsor.ajay.app'];
const ALLOWED_TARGET_HOSTS = ['www.youtubepi.com', 'youtubepi.com', 'y2mate.nu', 'ytmp3pc.com', 'www.ytmp3pc.com'];
const AD_RULESET_ID = 'yt-adblock';

const ext = globalThis.browser || globalThis.chrome;

function getVideoId(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('v')
      || parsed.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/)?.[1]
      || (parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : '');
  } catch {
    return '';
  }
}

function enableAdRuleset() {
  try {
    ext?.declarativeNetRequest?.updateEnabledRulesets({ enableRulesetIds: [AD_RULESET_ID] });
  } catch {

  }
}

function reloadYouTubeTabs(tabs) {
  (tabs || []).forEach((tab) => {
    if (tab.id) ext.tabs.reload(tab.id);
  });
}

function getSessionStorage() {
  return ext?.storage?.session || ext?.storage?.local || null;
}

const isPromiseStore = (store) => {
  const browserStorage = globalThis.browser?.storage;
  return Boolean(browserStorage)
    && (browserStorage.local === store || browserStorage.session === store);
};

async function callStorage(method, ...args) {
  const store = getSessionStorage();
  if (!store || typeof store[method] !== 'function') return null;

  if (isPromiseStore(store)) {
    try {
      return await store[method](...args);
    } catch {
      return null;
    }
  }

  return new Promise((resolve) => {
    try {
      store[method](...args, (value) => resolve(value ?? null));
    } catch {
      resolve(null);
    }
  });
}

async function getCachedDislike(videoId) {
  const key = `${CACHE_PREFIX}${videoId}`;
  const all = await callStorage('get', key);
  const cached = all?.[key] || all;
  if (cached && Date.now() - cached.time < DISLIKE_CACHE_TTL) return cached;
  return null;
}

async function setCachedDislike(videoId, dislikes) {
  const key = `${CACHE_PREFIX}${videoId}`;
  await callStorage('set', { [key]: { dislikes, time: Date.now() } });
}

async function cleanupDislikeCache() {
  const all = await callStorage('get', null);
  if (!all) return;
  const now = Date.now();
  const keys = Object.keys(all).filter((key) => key.startsWith(CACHE_PREFIX));
  if (keys.length <= CACHE_MAX_ENTRIES) return;
  const stale = keys.filter((key) => now - all[key].time > DISLIKE_CACHE_TTL);
  if (stale.length) await callStorage('remove', stale);
}

async function fetchDislikeHandler(videoId) {
  const cached = await getCachedDislike(videoId);
  if (cached) return { ok: true, dislikes: cached.dislikes };

  try {
    const response = await fetch(
      `https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(videoId)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const dislikes = Number(data.dislikes) || 0;
    await setCachedDislike(videoId, dislikes);
    return { ok: true, dislikes };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function openDownloadTab(message, sender) {
  const videoId = getVideoId(message.url || sender.tab?.url || '');
  const target = videoId
    ? `https://www.youtubepi.com/watch?v=${encodeURIComponent(videoId)}`
    : 'https://y2mate.nu/';
  await ext.tabs.create({ url: target });
  return { ok: true };
}

enableAdRuleset();

initAdblockBackground().catch((error) => {
  console.warn('YT SuperTool adblock background failed to start:', error);
});

ext.runtime.onInstalled.addListener((details) => {
  enableAdRuleset();
  if (details.reason === 'update' || details.reason === 'install') {
    try {
      const query = ext.tabs.query({ url: '*://*.youtube.com/*' });
      if (query && typeof query.then === 'function') query.then(reloadYouTubeTabs).catch(() => {});
      else ext.tabs.query({ url: '*://*.youtube.com/*' }, reloadYouTubeTabs);
    } catch {

    }
  }
});

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'YT_SUPERTOOL_FETCH') {
    const { url, options = {}, responseType = 'json', timeout = 8000 } = message.payload || {};
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      sendResponse({ ok: false, error: 'Invalid request URL' });
      return false;
    }

    if (parsedUrl.protocol !== 'https:' || !ALLOWED_FETCH_HOSTS.includes(parsedUrl.hostname)) {
      sendResponse({ ok: false, error: 'Request host is not allowed' });
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    fetch(parsedUrl, { ...options, signal: controller.signal })
      .then(async (response) => ({
        ok: response.ok,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseType === 'json' ? await response.json() : await response.text()
      }))
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || 'Network request failed' }))
      .finally(() => clearTimeout(timeoutId));
    return true;
  }

  if (message?.type === 'YT_SUPERTOOL_OPEN_URL') {
    try {
      const target = new URL(message.url);
      if (target.protocol !== 'https:' || !ALLOWED_TARGET_HOSTS.includes(target.hostname)) {
        throw new Error('URL is not allowed');
      }
      const creation = ext.tabs.create({ url: target.href });
      if (creation && typeof creation.then === 'function') {
        creation
          .then(() => sendResponse({ ok: true }))
          .catch((error) => sendResponse({ ok: false, error: error.message }));
      } else {
        sendResponse({ ok: true });
      }
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return true;
  }

  if (message?.type === 'fetchDislike') {
    const videoId = String(message.videoId || '');
    if (!/^[\w-]{6,20}$/.test(videoId)) {
      sendResponse({ ok: false, error: 'Invalid video ID' });
      return false;
    }
    fetchDislikeHandler(videoId)
      .then((response) => {
        sendResponse(response);
        return response;
      })
      .then(() => cleanupDislikeCache().catch(() => {}))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'openDownloadTab') {
    openDownloadTab(message, sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'YT_SUPERTOOL_DNR') {
    const rules = ext?.declarativeNetRequest;
    if (!rules?.updateEnabledRulesets) {
      sendResponse({ ok: false, error: 'declarativeNetRequest is unavailable' });
      return false;
    }
    try {
      const update = message.enabled
        ? rules.updateEnabledRulesets({ enableRulesetIds: [AD_RULESET_ID] })
        : rules.updateEnabledRulesets({ disableRulesetIds: [AD_RULESET_ID] });
      if (update && typeof update.then === 'function') {
        update
          .then(() => sendResponse({ ok: true }))
          .catch((error) => sendResponse({ ok: false, error: error.message }));
      } else {
        sendResponse({ ok: true });
      }
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return false;
  }

  return false;
});
