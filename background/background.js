// background/background.js

const dislikeCache = new Map();
const dislikeRequests = new Map();
const DISLIKE_CACHE_TTL = 5 * 60 * 1000;
let lastUrl = '';
let lastVideoId = '';

chrome.storage.local.remove(['adblock', 'adblockEnabled']);

function getVideoId(url) {
  if (url === lastUrl) return lastVideoId;
  lastUrl = url;
  try {
    const parsed = new URL(url);
    lastVideoId = parsed.searchParams.get('v') || parsed.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/)?.[1] || (parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : '');
  } catch (error) { lastVideoId = ''; }
  return lastVideoId;
}

function cleanupDislikeCache() {
  if (dislikeCache.size <= 500) return;
  const now = Date.now();
  for (const [key, value] of dislikeCache) {
    if (now - value.time > DISLIKE_CACHE_TTL) dislikeCache.delete(key);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'fetchDislike') {
    const videoId = String(message.videoId || '');
    if (!/^[\w-]{6,20}$/.test(videoId)) { sendResponse({ ok: false, error: 'Invalid video ID' }); return false; }
    const cached = dislikeCache.get(videoId);
    if (cached && Date.now() - cached.time < DISLIKE_CACHE_TTL) { sendResponse({ ok: true, dislikes: cached.dislikes }); return false; }
    if (dislikeRequests.has(videoId)) {
      dislikeRequests.get(videoId).then(sendResponse);
      return true;
    }
    const request = fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(videoId)}`, { signal: AbortSignal.timeout(8000) })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(data => {
        const dislikes = Number(data.dislikes) || 0;
        dislikeCache.set(videoId, { dislikes, time: Date.now() });
        cleanupDislikeCache();
        return { ok: true, dislikes };
      })
      .catch(error => ({ ok: false, error: error.message }))
      .finally(() => dislikeRequests.delete(videoId));
    dislikeRequests.set(videoId, request);
    request.then(sendResponse);
    return true;
  }
  if (message?.type === 'openDownloadTab') {
    const videoId = getVideoId(message.url || sender.tab?.url || '');
    chrome.tabs.create({ url: videoId ? `https://ssyoutube.com/watch?v=${encodeURIComponent(videoId)}` : 'https://ssyoutube.com/' });
    sendResponse({ ok: true });
  }
  return false;
});