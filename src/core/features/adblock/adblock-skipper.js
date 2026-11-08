const PLAYER_SELECTOR = '#movie_player, .html5-video-player';
const SKIP_SELECTORS = [
  '.ytp-ad-skip-button',
  '.ytp-ad-skip-button-modern',
  '.ytp-skip-ad-button',
  '.ytp-ad-skip-button-container button',
  'button.ytp-ad-skip-button-modern'
];
const AD_CLASSES = ['ad-showing', 'ad-interrupting'];
const TICK_INTERVAL = 250;
const CLICK_COOLDOWN = 400;

const findPlayer = () => document.querySelector(PLAYER_SELECTOR);

const isAdShowing = (player) => Boolean(player) && AD_CLASSES.some((name) => player.classList.contains(name));

const findVideo = (player) => player?.querySelector('video') || document.querySelector('video');

const findSkipButton = (player) => {
  for (const selector of SKIP_SELECTORS) {
    const button = player?.querySelector(selector) || document.querySelector(selector);
    if (button && !button.disabled && button.isConnected) return button;
  }
  return null;
};

export function createAdblockSkipper() {
  let observer = null;
  let interval = 0;
  let debounce = 0;
  let mutedState = null;
  let lastClick = 0;
  let started = false;

  const stopInterval = () => {
    clearInterval(interval);
    interval = 0;
  };

  const restore = () => {
    if (!mutedState) return;
    const video = mutedState.video;
    if (video) {
      try {
        video.muted = mutedState.muted;
        video.playbackRate = mutedState.rate;
      } catch {

      }
    }
    mutedState = null;
    stopInterval();
  };

  const tick = () => {
    if (!started) return;
    const player = findPlayer();
    if (!player || !isAdShowing(player)) {
      restore();
      return;
    }

    const video = findVideo(player);
    if (!video) return;

    if (!mutedState) {
      mutedState = { video, muted: video.muted, rate: video.playbackRate };
      try {
        video.muted = true;
      } catch {

      }
    }

    const now = Date.now();
    if (now - lastClick > CLICK_COOLDOWN) {
      const skip = findSkipButton(player);
      if (skip) {
        lastClick = now;
        try {
          skip.click();
        } catch (error) {
          console.warn('YT SuperTool could not click the skip button:', error);
        }
      }
    }

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

    if (!interval) interval = setInterval(tick, TICK_INTERVAL);
  };

  const schedule = () => {
    clearTimeout(debounce);
    debounce = setTimeout(tick, 120);
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
      const root = document.body || document.documentElement;
      if (!root) return;
      observer = new MutationObserver(schedule);
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
