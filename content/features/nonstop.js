// Removes YouTube's "Video paused. Continue watching?" interruption.

(function () {
  const POPUP_SELECTORS = [
    '.yt-confirm-dialog-renderer',
    '[aria-label="Confirm you\'re still watching"]',
    '.ytd-button-renderer[aria-label*="continue watching" i]',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers"]',
    'ytd-modal-with-title-and-button-renderer'
  ];
  const POPUP_SELECTOR = POPUP_SELECTORS.join(',');
  const PAUSE_TEXT = /continue\s+watching|video\s+paused/i;
  let removed = new WeakSet();

  const containsPauseText = element => PAUSE_TEXT.test(element.textContent || '');

  function findPopup(root) {
    if (!root?.querySelectorAll) return [];
    const matches = [];
    if (root.matches?.(`${POPUP_SELECTOR}, #dialog, [role="dialog"], ytd-popup-container`) && containsPauseText(root)) matches.push(root);
    root.querySelectorAll(POPUP_SELECTOR).forEach(element => {
      if (containsPauseText(element)) matches.push(element);
    });

    // YouTube sometimes only exposes a generic #dialog host.
    root.querySelectorAll('#dialog').forEach(element => {
      if (containsPauseText(element)) matches.push(element);
    });

    // Fallback for UI revisions that keep the text but change all classes.
    root.querySelectorAll('[role="dialog"], ytd-popup-container').forEach(element => {
      if (containsPauseText(element)) matches.push(element);
    });
    return [...new Set(matches)];
  }

  function removePopup(popup) {
    if (removed.has(popup)) return;
    removed.add(popup);
    popup.style.display = 'none';
    popup.style.visibility = 'hidden';
    popup.style.opacity = '0';
    popup.style.pointerEvents = 'none';

    // Remove the closest dialog host too when it is only a wrapper for this prompt.
    const host = popup.closest('#dialog, ytd-popup-container, tp-yt-paper-dialog');
    if (host && host !== popup && containsPauseText(host)) host.remove();
    else popup.remove();

    const video = document.querySelector('video');
    if (video?.paused) video.play().catch(() => {});
  }

  function removeExistingPopups() {
    findPopup(document).forEach(removePopup);
  }

  window.YTSuperTool = window.YTSuperTool || {};
  window.YTSuperTool.nonstop = {
    initNonstop() {
      removeExistingPopups();
    },
    updateNonstop(mutations) {
      mutations.forEach(mutation => {
        if (mutation.target?.nodeType === Node.ELEMENT_NODE) findPopup(mutation.target).forEach(removePopup);
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) findPopup(node).forEach(removePopup);
        });
      });
    },
    stopNonstop() {
      // No persistent observer or global styles are left by this module.
      removed = new WeakSet();
    }
  };
})();