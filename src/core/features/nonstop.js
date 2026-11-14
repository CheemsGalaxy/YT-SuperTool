import { PAUSE_HINT, PLAYBACK_ERROR_HINT } from '../locale-patterns.js';

const POPUP_SELECTORS = [
  '.yt-confirm-dialog-renderer',
  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers"]',
  'ytd-modal-with-title-and-button-renderer'
];
const POPUP_SELECTOR = POPUP_SELECTORS.join(',');
const CONTAINER_SELECTOR = '#dialog, [role="dialog"], ytd-popup-container, tp-yt-paper-dialog';
const CONFIRM_SELECTORS = [
  '#confirm-button button',
  'ytd-button-renderer#confirm-button button',
  'ytd-button-renderer#confirm-button a',
  '#confirm-button a',
  '#confirm-button'
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

const hasPauseText = (element) => {
  const text = element.textContent || '';
  return PAUSE_HINT.test(text) || PLAYBACK_ERROR_HINT.test(text);
};

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

const buttonLabel = (button) => `${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`.trim();

const clickConfirm = (prompt) => {
  for (const selector of CONFIRM_SELECTORS) {
    const button = prompt.querySelector(selector);
    if (button && !button.disabled && button.isConnected && isVisible(button)) {
      try {
        button.click();
        return true;
      } catch {

      }
    }
  }

  const buttons = [...prompt.querySelectorAll(BUTTON_SELECTOR)]
    .filter((button) => !button.disabled && button.isConnected && isVisible(button));
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

  const handlePrompt = (prompt) => {
    if (!prompt.isConnected || !hasPauseText(prompt)) return;
    if (!prompt.matches(POPUP_SELECTOR) && prompt.querySelector(POPUP_SELECTOR)) return;
    const now = Date.now();
    const last = handled.get(prompt) || 0;
    if (now - last < HANDLE_COOLDOWN) return;
    handled.set(prompt, now);
    clickConfirm(prompt);
    resumeVideo();
  };

  const collect = (node, found) => {
    if (!(node instanceof Element)) return;
    if (node.matches(POPUP_SELECTOR) && hasPauseText(node)) found.add(node);
    else if (node.matches(CONTAINER_SELECTOR) && hasPauseText(node)) found.add(node);
    node.querySelectorAll(`${POPUP_SELECTOR}, ${CONTAINER_SELECTOR}`).forEach((element) => {
      if (hasPauseText(element)) found.add(element);
    });
  };

  const sweep = (root) => {
    if (!enabled || !root?.querySelectorAll) return;
    const found = new Set();
    collect(root, found);
    found.forEach(handlePrompt);
  };

  return {
    init() {
      if (enabled) return;
      enabled = true;
      handled = new WeakMap();
      sweep(document);
    },
    update(mutations) {
      if (!enabled) return;
      const found = new Set();
      for (const mutation of mutations) {
        const target = mutation.target;
        if (target instanceof Element && target.matches(CONTAINER_SELECTOR) && hasPauseText(target)) {
          found.add(target);
        }
        for (const node of mutation.addedNodes) collect(node, found);
      }
      found.forEach(handlePrompt);
    },
    stop() {
      enabled = false;
      handled = new WeakMap();
    }
  };
}

export default createNonstop;
