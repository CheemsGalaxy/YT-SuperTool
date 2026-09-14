// content/main.js

(function () {
  if (location.hostname !== 'youtube.com' && !location.hostname.endsWith('.youtube.com')) return;
  // MV3: content scripts can outlive an updated extension context.
  function isExtensionAlive() {
    try { return Boolean(chrome.runtime?.id); } catch (error) { return false; }
  }

  const defaults = { dislike: true, noShorts: true, cleanHomepage: true, nonstop: true, speed: true, downloader: false, pip: true, screenshot: true };
  const modules = window.YTSuperTool;
  let settings = { ...defaults };
  let refreshTimer = 0;
  let cachedPlayer = null;
  let cachedAt = 0;
  let active = !document.hidden;
  const methodName = (prefix, key) => `${prefix}${key[0].toUpperCase()}${key.slice(1)}`;
  const getPlayer = () => {
    const now = performance.now();
    if (cachedPlayer?.isConnected && now - cachedAt < 2000) return cachedPlayer;
    cachedPlayer = document.querySelector('.html5-video-player');
    cachedAt = now;
    return cachedPlayer;
  };
  const initPlayerFeatures = () => {
    if (!active) return;
    const player = getPlayer();
    if (!player) return;
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
      initPlayerFeatures();
    } catch (error) { console.warn('YT SuperTool apply:', error); }
  };
  const scheduleApply = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(apply, 200);
    setTimeout(apply, 1000);
  };
  const handleMutations = mutations => {
    if (!active) return;
    if (settings.dislike) modules.dislike?.updateDislike(mutations);
    if (settings.noShorts) modules.noShorts?.updateNoShorts(mutations);
    if (settings.nonstop) modules.nonstop?.updateNonstop(mutations);
    const playerRelated = mutations.some(mutation =>
      mutation.target?.closest?.('.html5-video-player') ||
      [...mutation.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE && (
        node.matches?.('.html5-video-player, .ytp-right-controls, ytd-segmented-like-dislike-button-renderer') ||
        node.querySelector?.('.ytp-right-controls')
      ))
    );
    if (playerRelated) initPlayerFeatures();
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
  document.addEventListener('yt-navigate-finish', scheduleApply, { passive: true });
  document.addEventListener('visibilitychange', handleVisibility, { passive: true });
})();
