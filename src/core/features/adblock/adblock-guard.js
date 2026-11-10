const WALL_SELECTOR = [
  'ytd-enforcement-message-view-model',
  'ytd-modal-with-title-and-button-renderer',
  'tp-yt-paper-dialog'
].join(',');

const OVERLAY_SELECTOR = 'tp-yt-iron-overlay-backdrop';
const PLAYER_SELECTOR = '#movie_player, .html5-video-player';
const WALL_HINT = /ad[\s-]?block|chặn quảng cáo/i;
const LEGAL_HINT = /terms of service|điều khoản|allow youtube ads|cho phép quảng cáo|video player will be blocked/i;
const SCAN_INTERVAL = 1200;

const isEnforcementWall = (element) => {
  if (!element) return false;
  if (element.tagName === 'YTD-ENFORCEMENT-MESSAGE-VIEW-MODEL') return true;
  const text = (element.innerText || element.textContent || '').slice(0, 4000);
  if (!WALL_HINT.test(text) || !LEGAL_HINT.test(text)) return false;
  return Boolean(element.closest('tp-yt-paper-dialog, ytd-popup-container')) || element.tagName.includes('DIALOG');
};

const resumePlayback = () => {
  const player = document.querySelector(PLAYER_SELECTOR);
  try {
    if (typeof player?.playVideo === 'function') player.playVideo();
  } catch {

  }
  const video = player?.querySelector('video') || document.querySelector('video');
  if (video?.paused) {
    try {
      const attempt = video.play();
      if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
    } catch {

    }
  }
};

export function createAdblockGuard() {
  let observer = null;
  let interval = 0;
  let scheduled = 0;
  let started = false;

  const clearWall = () => {
    const walls = [...document.querySelectorAll(WALL_SELECTOR)].filter(isEnforcementWall);
    if (!walls.length) return;

    for (const wall of walls) {
      try {
        wall.remove();
      } catch {

      }
    }

    document.querySelectorAll(OVERLAY_SELECTOR).forEach((element) => {
      try {
        element.remove();
      } catch {

      }
    });

    document.body?.style.removeProperty('overflow');
    document.documentElement?.style.removeProperty('overflow');
    resumePlayback();
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = setTimeout(() => {
      scheduled = 0;
      clearWall();
    }, 250);
  };

  const start = () => {
    if (started) return;
    started = true;
    const root = document.documentElement;
    if (root) {
      observer = new MutationObserver(schedule);
      observer.observe(root, { childList: true, subtree: true });
    }
    interval = setInterval(clearWall, SCAN_INTERVAL);
    clearWall();
  };

  const stop = () => {
    if (!started) return;
    started = false;
    observer?.disconnect();
    observer = null;
    clearTimeout(scheduled);
    scheduled = 0;
    clearInterval(interval);
    interval = 0;
  };

  return { start, stop };
}

export default createAdblockGuard;
