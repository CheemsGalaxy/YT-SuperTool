// background/background.js

const DISLIKE_CACHE_TTL = 5 * 60 * 1000;

function getVideoId(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('v') || parsed.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/)?.[1] || (parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : '');
  } catch (error) { return ''; }
}


// MV3: service workers can restart, so cache data lives in session storage.
async function getCachedDislike(videoId) {
  try {
    if (!chrome.storage.session) return null;
    const key = `dislike_${videoId}`;
    const result = await chrome.storage.session.get(key);
    const cached = result[key];
    if (cached && Date.now() - cached.time < DISLIKE_CACHE_TTL) return cached;
  } catch (error) {
    console.warn('[YT SuperTool] getCachedDislike:', error.message);
  }
  return null;
}

async function setCachedDislike(videoId, dislikes) {
  try {
    if (!chrome.storage.session) return;
    const key = `dislike_${videoId}`;
    await chrome.storage.session.set({ [key]: { dislikes, time: Date.now() } });
  } catch (error) {
    console.warn('[YT SuperTool] setCachedDislike:', error.message);
  }
}

async function cleanupDislikeCache() {
  try {
    const all = await chrome.storage.session.get(null);
    const now = Date.now();
    const keys = Object.keys(all).filter(key => key.startsWith('dislike_'));
    if (keys.length <= 500) return;
    const toRemove = keys.filter(key => now - all[key].time > DISLIKE_CACHE_TTL);
    if (toRemove.length) await chrome.storage.session.remove(toRemove);
  } catch (error) {}
}

async function fetchDislikeHandler(videoId) {
  const cached = await getCachedDislike(videoId);
  if (cached) return { ok: true, dislikes: cached.dislikes };

  try {
    const response = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(videoId)}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const dislikes = Number(data.dislikes) || 0;
    await setCachedDislike(videoId, dislikes);
    cleanupDislikeCache();
    return { ok: true, dislikes };
  } catch (error) {
    console.warn('[YT SuperTool] fetchDislike failed:', error.message);
    return { ok: false, error: error.message };
  }
}

async function handleOpenDownload(message, sender) {
  const videoId = getVideoId(message.url || sender.tab?.url || '');
  const target = videoId ? `https://ssyoutube.com/watch?v=${encodeURIComponent(videoId)}` : 'https://ssyoutube.com/';
  await chrome.tabs.create({ url: target });
  return { ok: true };
}

// MV3: refresh YouTube tabs after installation or an extension update.
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'update' || details.reason === 'install') {
    chrome.tabs.query({ url: '*://*.youtube.com/*' }, tabs => {
      tabs.forEach(tab => { if (tab.id) chrome.tabs.reload(tab.id); });
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[YT SuperTool BG] received:', message?.type, message?.videoId);
  if (message?.type === 'fetchDislike') {
    const videoId = String(message.videoId || '');
    if (!/^[\w-]{6,20}$/.test(videoId)) {
      sendResponse({ ok: false, error: 'Invalid video ID' });
      return false;
    }
    fetchDislikeHandler(videoId).then(sendResponse).catch(error => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }
  if (message?.type === 'openDownloadTab') {
    handleOpenDownload(message, sender).then(sendResponse).catch(error => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }
  return false;
});