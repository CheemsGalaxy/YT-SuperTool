(function () {
  if (location.hostname !== 'youtube.com' && !location.hostname.endsWith('.youtube.com')) return;
  const isExtensionAlive = () => window.YTSuperTool.utils.isExtensionAlive();

  const defaults = { dislike: true, noShorts: true, cleanHomepage: true, nonstop: true, speed: true, downloader: false, pip: true, screenshot: true };
  const modules = window.YTSuperTool;
  modules.injectStyles?.();
  let settings = { ...defaults };
  let refreshTimer = 0;
  let playerRetryTimer = 0;
  let playerRetryCount = 0;
  const PLAYER_RETRY_MAX = 20;
  let cachedPlayer = null;
  let cachedAt = 0;
  let active = !document.hidden;
  const methodName = (prefix, key) => `${prefix}${key[0].toUpperCase()}${key.slice(1)}`;
  const getPlayer = () => {
    const now = performance.now();
    if (cachedPlayer?.isConnected && now - cachedAt < 2000) return cachedPlayer;
    const player = document.querySelector('.html5-video-player');
    if (player) {
      cachedPlayer = player;
      cachedAt = now;
    } else {
      cachedPlayer = null;
    }
    return player;
  };
  const initPlayerFeaturesWithRetry = () => {
    if (!active) return;
    const player = getPlayer();
    if (!player) {
      if (playerRetryCount < PLAYER_RETRY_MAX) {
        clearTimeout(playerRetryTimer);
        playerRetryCount += 1;
        playerRetryTimer = setTimeout(initPlayerFeaturesWithRetry, 500);
      }
      return;
    }
    clearTimeout(playerRetryTimer);
    playerRetryTimer = 0;
    playerRetryCount = 0;
    if (settings.pip) modules.pip?.initPiP(player);
    if (settings.screenshot) modules.screenshot?.initScreenshot(player);
    if (settings.downloader) modules.downloader?.initDownloader(player);
    if (settings.speed) modules.speed?.initSpeed(player);
  };
  const apply = () => {
    try {
      Object.keys(defaults).forEach(key => {
        const mod = modules[key];
        if (!mod) return;
        const stopFn = mod[methodName('stop', key)];
        const initFn = mod[methodName('init', key)];
        if (settings[key]) {
          initFn?.();
        } else {
          stopFn?.();
        }
      });
      initPlayerFeaturesWithRetry();
    } catch (error) { console.warn('YT SuperTool apply:', error); }
  };
  const scheduleApply = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(apply, { timeout: 500 });
      } else {
        apply();
      }
    }, 200);
  };
  const handleMutations = mutations => {
    if (!active) return;
    if (settings.dislike) modules.dislike?.updateDislike(mutations);
    if (settings.noShorts) modules.noShorts?.updateNoShorts(mutations);
    if (settings.cleanHomepage) modules.cleanHomepage?.updateCleanHomepage(mutations);
    if (settings.nonstop) modules.nonstop?.updateNonstop(mutations);
    const playerRelated = mutations.some(mutation => {
      if (mutation.target?.closest?.('.html5-video-player')) return true;
      if (mutation.target?.matches?.('#player, #movie_player, .html5-video-player, .ytp-left-controls, .ytp-right-controls')) return true;
      return [...mutation.addedNodes].some(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        if (node.matches?.('.html5-video-player, #movie_player, #player, .ytp-left-controls, .ytp-right-controls, ytd-segmented-like-dislike-button-renderer')) return true;
        return node.querySelector?.('.html5-video-player, #movie_player, #player, .ytp-left-controls, .ytp-right-controls');
      });
    });
    if (playerRelated) initPlayerFeaturesWithRetry();
  };
  const handleVisibility = () => {
    active = !document.hidden;
    if (active) { apply(); observer.start(); } else { observer.stop(); }
  };
  const observer = new window.YTSuperTool.ObserverManager(document.body, 300).add(handleMutations);
  if (isExtensionAlive()) {
    chrome.storage.local.get(defaults, value => {
      if (!isExtensionAlive()) return;
      settings = { ...defaults, ...value };
      if (active) { apply(); observer.start(); }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !isExtensionAlive()) return;
      Object.keys(changes).forEach(key => { if (key in defaults) settings[key] = changes[key].newValue; });
      scheduleApply();
    });
  }
  document.addEventListener('yt-navigate-finish', () => {
    playerRetryCount = 0;
    clearTimeout(playerRetryTimer);
    playerRetryTimer = 0;
    cachedPlayer = null;
    cachedAt = 0;
    scheduleApply();
  }, { passive: true });
  document.addEventListener('visibilitychange', handleVisibility, { passive: true });
})();
