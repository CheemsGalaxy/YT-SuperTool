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
  const PLAYBACK_ERROR_TEXT = /sự cố gây gián đoạn|gặp sự cố|playback.*interrupted|something went wrong/i;
  let removed = new WeakSet();

  const containsPauseText = element => {
    const text = element.textContent || '';
    return PAUSE_TEXT.test(text) || PLAYBACK_ERROR_TEXT.test(text);
  };

  function findPopup(root) {
    if (!root?.querySelectorAll) return [];
    const matches = [];
    if (root.matches?.(`${POPUP_SELECTOR}, #dialog, [role="dialog"], ytd-popup-container`) && containsPauseText(root)) matches.push(root);
    root.querySelectorAll(POPUP_SELECTOR).forEach(element => {
      if (containsPauseText(element)) matches.push(element);
    });

    root.querySelectorAll('#dialog').forEach(element => {
      if (containsPauseText(element)) matches.push(element);
    });

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

    const host = popup.closest('#dialog, ytd-popup-container, tp-yt-paper-dialog');
    if (host && host !== popup && containsPauseText(host)) host.remove();
    else popup.remove();

    const text = popup.textContent || '';
    if (PAUSE_TEXT.test(text)) {
      const video = document.querySelector('video');
      if (video?.paused) video.play().catch(() => {});
    }
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
      removed = new WeakSet();
    }
  };
})();