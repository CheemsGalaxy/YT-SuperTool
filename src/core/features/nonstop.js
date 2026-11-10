const POPUP_SELECTORS = [
  '.yt-confirm-dialog-renderer',
  '[aria-label="Confirm you\'re still watching"]',
  '.ytd-button-renderer[aria-label*="continue watching" i]',
  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers"]',
  'ytd-modal-with-title-and-button-renderer'
];
const POPUP_SELECTOR = POPUP_SELECTORS.join(',');
const CONTAINER_SELECTOR = '#dialog, [role="dialog"], ytd-popup-container, tp-yt-paper-dialog';
const PAUSE_TEXT = /continue\s+watching|video\s+paused/i;
const PLAYBACK_ERROR_TEXT = /sự cố gây gián đoạn|gặp sự cố|playback.*interrupted|something went wrong/i;

const hasPauseText = (element) => {
  const text = element.textContent || '';
  return PAUSE_TEXT.test(text) || PLAYBACK_ERROR_TEXT.test(text);
};

export function createNonstop() {
  let enabled = false;
  let removed = new WeakSet();

  const collect = (node, found) => {
    if (!(node instanceof Element)) return;
    if (node.matches(POPUP_SELECTOR) && hasPauseText(node)) found.add(node);
    if (node.matches(CONTAINER_SELECTOR) && hasPauseText(node)) found.add(node);
    node.querySelectorAll(POPUP_SELECTOR).forEach((element) => {
      if (hasPauseText(element)) found.add(element);
    });
  };

  const removePopup = (popup) => {
    if (removed.has(popup)) return;
    removed.add(popup);

    const host = popup.closest('#dialog, ytd-popup-container, tp-yt-paper-dialog');
    if (host && host !== popup && hasPauseText(host)) host.remove();
    else popup.remove();

    if (PAUSE_TEXT.test(popup.textContent || '')) {
      const video = document.querySelector('video');
      if (video?.paused) video.play().catch(() => {});
    }
  };

  const sweep = (root) => {
    if (!enabled || !root?.querySelectorAll) return;
    const found = new Set();
    collect(root, found);
    root.querySelectorAll(`${POPUP_SELECTOR}, ${CONTAINER_SELECTOR}`).forEach((element) => {
      if (hasPauseText(element)) found.add(element);
    });
    found.forEach(removePopup);
  };

  return {
    init() {
      if (enabled) return;
      enabled = true;
      removed = new WeakSet();
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
      found.forEach(removePopup);
    },
    stop() {
      enabled = false;
      removed = new WeakSet();
    }
  };
}

export default createNonstop;
