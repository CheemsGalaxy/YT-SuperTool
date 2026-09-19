const DISLIKE_CACHE_TTL = 5 * 60 * 1000;
const CACHE_PREFIX = 'dislike_';
const CACHE_MAX_ENTRIES = 500;

function getVideoId(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('v')
      || parsed.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/)?.[1]
      || (parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : '');
  } catch (error) { return ''; }
}

function getSessionStorage() {
  return chrome.storage?.session || chrome.storage?.local || null;
}

async function getCachedDislike(videoId) {
  try {
    const store = getSessionStorage();
    if (!store) return null;
    const key = `${CACHE_PREFIX}${videoId}`;
    const result = await store.get(key);
    const cached = result?.[key];
    if (cached && Date.now() - cached.time < DISLIKE_CACHE_TTL) return cached;
  } catch (error) {}
  return null;
}

async function setCachedDislike(videoId, dislikes) {
  try {
    const store = getSessionStorage();
    if (!store) return;
    const key = `${CACHE_PREFIX}${videoId}`;
    await store.set({ [key]: { dislikes, time: Date.now() } });
  } catch (error) {}
}

async function cleanupDislikeCache() {
  try {
    const store = getSessionStorage();
    if (!store) return;
    const all = await store.get(null);
    const now = Date.now();
    const keys = Object.keys(all).filter(key => key.startsWith(CACHE_PREFIX));
    if (keys.length <= CACHE_MAX_ENTRIES) return;
    const toRemove = keys.filter(key => now - all[key].time > DISLIKE_CACHE_TTL);
    if (toRemove.length) await store.remove(toRemove);
  } catch (error) {}
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

async function handleOpenDownload(message, sender) {
  const videoId = getVideoId(message.url || sender.tab?.url || '');
  const target = videoId
    ? `https://ssyoutube.com/watch?v=${encodeURIComponent(videoId)}`
    : 'https://ssyoutube.com/';
  await chrome.tabs.create({ url: target });
  return { ok: true };
}

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'update' || details.reason === 'install') {
    chrome.tabs.query({ url: '*://*.youtube.com/*' }, tabs => {
      tabs.forEach(tab => { if (tab.id) chrome.tabs.reload(tab.id); });
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'fetchDislike') {
    const videoId = String(message.videoId || '');
    if (!/^[\w-]{6,20}$/.test(videoId)) {
      sendResponse({ ok: false, error: 'Invalid video ID' });
      return false;
    }
    fetchDislikeHandler(videoId)
      .then(response => { sendResponse(response); return response; })
      .then(async () => {
        try {
          await cleanupDislikeCache();
        } catch (error) {}
      })
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'openDownloadTab') {
    handleOpenDownload(message, sender)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});
