const PLAYER_SELECTOR = '#movie_player, .html5-video-player';
const SKIP_SELECTORS = [
  '.ytp-ad-skip-button',
  '.ytp-ad-skip-button-modern',
  '.ytp-skip-ad-button',
  '.ytp-ad-skip-button-container button',
  '.ytp-ad-skip-button-slot button',
  'button.ytp-ad-skip-button-modern'
];
const CLOSE_SELECTORS = [
  '.ytp-ad-overlay-close-button',
  '.ytp-ad-overlay-close-container button'
];
const AD_CLASSES = ['ad-showing', 'ad-interrupting'];
const AD_OVERLAY_SELECTOR = '.ytp-ad-player-overlay, .ytp-ad-overlay-container, .ytp-ad-text-overlay';
const TICK_INTERVAL = 250;
const CLICK_COOLDOWN = 400;

const findPlayer = () => document.querySelector(PLAYER_SELECTOR);

const isAdShowing = (player) => {
  if (!player) return false;
  if (AD_CLASSES.some((name) => player.classList.contains(name))) return true;
  const overlay = player.querySelector(AD_OVERLAY_SELECTOR);
  return Boolean(overlay && overlay.getClientRects().length);
};

const findVideo = (player) => player?.querySelector('video') || document.querySelector('video');

const findButton = (player, selectors) => {
  for (const selector of selectors) {
    const button = player?.querySelector(selector) || document.querySelector(selector);
    if (button && !button.disabled && button.isConnected) return button;
  }
  return null;
};

const isPlayerMutation = (mutations) => {
  for (const mutation of mutations) {
    if (mutation.target?.closest?.(PLAYER_SELECTOR)) return true;
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches?.(PLAYER_SELECTOR) || node.querySelector?.(PLAYER_SELECTOR)) return true;
    }
  }
  return false;
};

export function createAdblockSkipper() {
  let observer = null;
  let interval = 0;
  let debounce = 0;
  let mutedState = null;
  let skipApiUsed = false;
  let lastClick = 0;
  let lastClose = 0;
  let started = false;

  const stopInterval = () => {
    clearInterval(interval);
    interval = 0;
  };

  const restore = () => {
    if (!mutedState) {
      stopInterval();
      return;
    }
    const video = mutedState.video;
    if (video?.isConnected) {
      try {
        video.muted = mutedState.muted;
        video.playbackRate = mutedState.rate;
      } catch {

      }
    }
    mutedState = null;
    skipApiUsed = false;
    stopInterval();
  };

  const closeOverlay = (player, now) => {
    if (now - lastClose < CLICK_COOLDOWN) return;
    const close = findButton(player, CLOSE_SELECTORS);
    if (!close) return;
    lastClose = now;
    try {
      close.click();
    } catch {

    }
  };

  const tick = () => {
    if (!started) return;
    const player = findPlayer();
    if (!player || !isAdShowing(player)) {
      restore();
      return;
    }

    const video = findVideo(player);
    if (!video) {
      restore();
      return;
    }

    if (!mutedState) {
      mutedState = { video, muted: video.muted, rate: video.playbackRate };
      try {
        video.muted = true;
      } catch {

      }
    }

    const now = Date.now();
    closeOverlay(player, now);

    if (!skipApiUsed && typeof player.skipAd === 'function') {
      skipApiUsed = true;
      try {
        player.skipAd();
      } catch {

      }
    }

    if (now - lastClick > CLICK_COOLDOWN) {
      const skip = findButton(player, SKIP_SELECTORS);
      if (skip) {
        lastClick = now;
        try {
          skip.click();
        } catch (error) {
          console.warn('YT SuperTool could not click the skip button:', error);
        }
      }
    }

    if (player.classList.contains('ad-showing')) {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        if (video.duration - video.currentTime > 0.15) {
          try {
            video.currentTime = video.duration;
          } catch {

          }
        }
      } else if (video.playbackRate < 16) {
        try {
          video.playbackRate = 16;
        } catch {

        }
      }
    }

    if (!interval) interval = setInterval(tick, TICK_INTERVAL);
  };

  const schedule = () => {
    clearTimeout(debounce);
    debounce = setTimeout(tick, 120);
  };

  const handleMutations = (mutations) => {
    if (!started || !isPlayerMutation(mutations)) return;
    schedule();
  };

  const onNavigate = () => {
    restore();
    schedule();
  };

  return {
    start() {
      if (started) {
        schedule();
        return;
      }
      started = true;
      const root = document.documentElement || document.body;
      if (!root) return;
      observer = new MutationObserver(handleMutations);
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
      });
      document.addEventListener('yt-navigate-finish', onNavigate, { passive: true });
      schedule();
    },
    stop() {
      started = false;
      observer?.disconnect();
      observer = null;
      clearTimeout(debounce);
      debounce = 0;
      document.removeEventListener('yt-navigate-finish', onNavigate);
      restore();
    }
  };
}

export default createAdblockSkipper;
