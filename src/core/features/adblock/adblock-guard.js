import { ADBLOCK_HINT, ADBLOCK_TERMS_HINT } from '../../locale-patterns.js';

const WALL_SELECTOR = [
  'ytd-enforcement-message-view-model',
  'ytd-modal-with-title-and-button-renderer',
  'tp-yt-paper-dialog'
].join(',');

const OVERLAY_SELECTOR = 'tp-yt-iron-overlay-backdrop';
const PLAYER_SELECTOR = '#movie_player, .html5-video-player';
const AD_CLOSE_SELECTOR = [
  '.ytp-ad-overlay-close-button',
  '.ytp-ad-overlay-close-container button',
  '.ytp-ad-skip-button',
  '.ytp-ad-skip-button-modern',
  '.ytp-skip-ad-button'
].join(',');
const SCAN_INTERVAL = 1200;
const CLICK_COOLDOWN = 600;

const isEnforcementWall = (element) => {
  if (!element) return false;
  if (element.tagName === 'YTD-ENFORCEMENT-MESSAGE-VIEW-MODEL') return true;
  const text = (element.innerText || element.textContent || '').slice(0, 4000);
  if (!ADBLOCK_HINT.test(text) || !ADBLOCK_TERMS_HINT.test(text)) return false;
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

const removeNode = (element) => {
  try {
    element.remove();
  } catch {

  }
};

export function createAdblockGuard() {
  let observer = null;
  let interval = 0;
  let scheduled = 0;
  let lastClick = 0;
  let started = false;

  const clearPlayerAds = () => {
    const now = Date.now();
    if (now - lastClick < CLICK_COOLDOWN) return;
    const button = document.querySelector(AD_CLOSE_SELECTOR);
    if (!button || button.disabled || !button.isConnected) return;
    lastClick = now;
    try {
      button.click();
    } catch {

    }
  };

  const clearWall = () => {
    clearPlayerAds();

    const walls = [...document.querySelectorAll(WALL_SELECTOR)].filter(isEnforcementWall);
    if (!walls.length) return;

    walls.forEach(removeNode);
    document.querySelectorAll(OVERLAY_SELECTOR).forEach(removeNode);
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

  const onNavigate = () => {
    clearTimeout(scheduled);
    scheduled = 0;
    clearWall();
    schedule();
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
    document.addEventListener('yt-navigate-finish', onNavigate, { passive: true });
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
    document.removeEventListener('yt-navigate-finish', onNavigate);
  };

  return { start, stop };
}

export default createAdblockGuard;
