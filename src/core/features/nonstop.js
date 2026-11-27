import { PAUSE_HINT, PLAYBACK_ERROR_HINT, INTERRUPTION_HINT } from '../locale-patterns.js';

const POPUP_SELECTORS = [
  '.yt-confirm-dialog-renderer',
  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers"]',
  'ytd-modal-with-title-and-button-renderer'
];
const POPUP_SELECTOR = POPUP_SELECTORS.join(',');
const NOTICE_SELECTORS = [
  '.ytSnackbarContainerSnackbarContainer',
  'tp-yt-paper-toast',
  'ytd-notification-action-renderer',
  'yt-notification-action-renderer',
  'ytd-mealbar-promo-renderer',
  'yt-mealbar-promo-renderer',
  'ytd-enforcement-message-view-model',
  'tp-yt-paper-dialog'
];
const NOTICE_SELECTOR = NOTICE_SELECTORS.join(',');
const CONFIRM_SELECTORS = [
  '#confirm-button button',
  'ytd-button-renderer#confirm-button button',
  'ytd-button-renderer#confirm-button a',
  '#confirm-button a',
  '#confirm-button [role="button"]'
];
const BUTTON_SELECTOR = [
  'button',
  'tp-yt-paper-button',
  'ytd-button-renderer button',
  'ytd-button-renderer a',
  'yt-button-shape button',
  'a[role="button"]',
  '[role="button"]'
].join(',');
const HANDLE_COOLDOWN = 2000;
const RETRY_DELAY = 250;
const RETRY_LIMIT = 20;

const hasPauseText = (element) => {
  const text = element.textContent || '';
  return PAUSE_HINT.test(text) || PLAYBACK_ERROR_HINT.test(text);
};

const hasInterruptionText = (element) => INTERRUPTION_HINT.test(element.textContent || '');

const isVisible = (element) => Boolean(element && element.getClientRects().length);

const resumeVideo = () => {
  const player = document.querySelector('#movie_player, .html5-video-player');
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

const isClickable = (button) => Boolean(button)
  && !button.disabled
  && button.getAttribute?.('aria-disabled') !== 'true'
  && button.isConnected
  && isVisible(button);

const buttonLabel = (button) => `${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`.trim();

const clickConfirm = (prompt) => {
  for (const selector of CONFIRM_SELECTORS) {
    const button = prompt.querySelector(selector);
    if (isClickable(button)) {
      try {
        button.click();
        return true;
      } catch {

      }
    }
  }

  const buttons = [...prompt.querySelectorAll(BUTTON_SELECTOR)].filter(isClickable);
  const hinted = buttons.find((button) => {
    const label = buttonLabel(button);
    return PAUSE_HINT.test(label) || PLAYBACK_ERROR_HINT.test(label);
  });
  const target = hinted || (buttons.length === 1 ? buttons[0] : null);
  if (!target) return false;
  try {
    target.click();
    return true;
  } catch {
    return false;
  }
};

export function createNonstop() {
  let enabled = false;
  let handled = new WeakMap();
  let attempts = new WeakMap();
  let retries = new WeakSet();
  let timers = new Set();

  const clearTimers = () => {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    retries = new WeakSet();
  };

  const scheduleRetry = (prompt) => {
    if (!enabled || retries.has(prompt)) return;
    const count = attempts.get(prompt) || 0;
    if (count >= RETRY_LIMIT) return;
    attempts.set(prompt, count + 1);
    retries.add(prompt);
    const timer = setTimeout(() => {
      timers.delete(timer);
      retries.delete(prompt);
      handlePrompt(prompt);
    }, RETRY_DELAY);
    timers.add(timer);
  };

  const clearOverlay = () => {
    document.querySelectorAll('tp-yt-iron-overlay-backdrop').forEach((backdrop) => {
      try {
        backdrop.remove();
      } catch {

      }
    });
    document.body?.style?.removeProperty?.('overflow');
    document.documentElement?.style?.removeProperty?.('overflow');
  };

  const handlePrompt = (prompt) => {
    if (!enabled || !prompt || prompt.nodeType !== 1) return;
    if (!prompt.isConnected || !prompt.matches(POPUP_SELECTOR)) return;
    if (hasInterruptionText(prompt)) {
      const dialog = prompt.closest('tp-yt-paper-dialog') || prompt;
      try {
        dialog.remove();
      } catch {

      }
      clearOverlay();
      resumeVideo();
      return;
    }
    if (!hasPauseText(prompt) || !isVisible(prompt)) return;
    const now = Date.now();
    if (now - (handled.get(prompt) || 0) < HANDLE_COOLDOWN) return;
    if (!clickConfirm(prompt)) {
      scheduleRetry(prompt);
      return;
    }
    handled.set(prompt, now);
    attempts.delete(prompt);
    resumeVideo();
  };

  const removeNotice = (notice) => {
    if (!enabled || !notice?.isConnected || !hasInterruptionText(notice)) return;
    const isDialog = notice.tagName === 'TP-YT-PAPER-DIALOG' || notice.tagName === 'YTD-ENFORCEMENT-MESSAGE-VIEW-MODEL';
    try {
      notice.remove();
    } catch {

    }
    if (isDialog) {
      clearOverlay();
      resumeVideo();
    }
  };

  const collectNotice = (node, found) => {
    if (!(node instanceof Element)) return;
    if (node.matches(NOTICE_SELECTOR)) found.add(node);
    const notice = node.closest?.(NOTICE_SELECTOR);
    if (notice) found.add(notice);
    node.querySelectorAll(NOTICE_SELECTOR).forEach((element) => found.add(element));
  };

  const collect = (node, found) => {
    if (!(node instanceof Element)) return;
    if (node.matches(POPUP_SELECTOR)) found.add(node);
    const prompt = node.closest?.(POPUP_SELECTOR);
    if (prompt) found.add(prompt);
    node.querySelectorAll(POPUP_SELECTOR).forEach((element) => found.add(element));
  };

  const collectAncestor = (node, found) => {
    if (!(node instanceof Element)) return;
    if (node.matches(POPUP_SELECTOR)) found.add(node);
    const prompt = node.closest?.(POPUP_SELECTOR);
    if (prompt) found.add(prompt);
  };

  const sweep = (root) => {
    if (!enabled || !root?.querySelectorAll) return;
    const found = new Set();
    if (root.nodeType === 1 && root.matches(POPUP_SELECTOR)) found.add(root);
    root.querySelectorAll(POPUP_SELECTOR).forEach((element) => found.add(element));
    found.forEach(handlePrompt);

    const notices = new Set();
    if (root.nodeType === 1 && root.matches(NOTICE_SELECTOR)) notices.add(root);
    root.querySelectorAll(NOTICE_SELECTOR).forEach((element) => notices.add(element));
    notices.forEach(removeNotice);
  };

  return {
    init() {
      if (enabled) return;
      enabled = true;
      clearTimers();
      handled = new WeakMap();
      attempts = new WeakMap();
      sweep(document);
    },
    update(mutations) {
      if (!enabled) return;
      const found = new Set();
      const notices = new Set();
      for (const mutation of mutations) {
        const target = mutation.target;
        const element = target?.nodeType === 1 ? target : target?.parentElement;
        collectAncestor(element, found);
        collectNotice(element, notices);
        for (const node of mutation.addedNodes || []) {
          collect(node, found);
          collectNotice(node, notices);
        }
      }
      found.forEach(handlePrompt);
      notices.forEach(removeNotice);
    },
    stop() {
      enabled = false;
      clearTimers();
      handled = new WeakMap();
      attempts = new WeakMap();
    }
  };
}

export default createNonstop;
