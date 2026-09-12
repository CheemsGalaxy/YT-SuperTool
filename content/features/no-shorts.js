// content/features/no-shorts.js

(function () {
  let shortsObserver = null;

  // Selector không cần mô phỏng :has.
  const SHORTS_SELECTORS = [
    // Desktop YouTube.
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-reel-shelf-renderer',
    'ytm-shorts-lockup-view-model',
    '[tab-title="Shorts"]',
    // Mobile YouTube.
    '.pivot-shorts',
    'a[href="/shorts"]',
    '.reel-shelf-renderer',
    'ytm-reel-shelf-renderer',
    'ytm-shorts-lockup-view-model-v2'
  ];

  // Rule parent/child thay cho selector :has của uBlock Origin.
  const SHORTS_HAS_RULES = [
    // Desktop YouTube.
    { parent: 'ytd-guide-entry-renderer', child: 'a[title="Shorts"]' },
    { parent: 'ytd-mini-guide-entry-renderer', child: 'a[title="Shorts"]' },
    { parent: 'ytd-rich-section-renderer', child: 'ytd-rich-shelf-renderer[is-shorts]' },
    { parent: 'ytd-rich-item-renderer', child: 'a[href^="/shorts/"]' },
    { parent: 'ytd-video-renderer', child: 'a[href^="/shorts/"]' },
    { parent: 'ytd-grid-video-renderer', child: 'a[href^="/shorts/"]' },
    // Mobile YouTube.
    { parent: 'ytm-video-with-context-renderer', child: 'a[href^="/shorts/"]' },
    { parent: 'ytm-compact-video-renderer', child: 'a[href^="/shorts/"]' }
  ];

  const elementsFor = (root, selector) => [
    ...(root.matches?.(selector) ? [root] : []),
    ...(root.querySelectorAll?.(selector) || [])
  ];

  const COMBINED = SHORTS_SELECTORS.join(',');
  const RELEVANT_TAGS = /^(YTD-RICH-ITEM-RENDERER|YTD-VIDEO-RENDERER|YTD-GRID-VIDEO-RENDERER|YTD-RICH-SECTION-RENDERER|YTD-REEL-SHELF-RENDERER|YTD-RICH-SHELF-RENDERER|YTD-GUIDE-ENTRY-RENDERER|YTD-MINI-GUIDE-ENTRY-RENDERER|YTM-)/;

  const removeShortElement = element => {
    const parentSection = element.matches('ytd-rich-shelf-renderer[is-shorts]')
      ? element.closest('ytd-rich-section-renderer') : null;
    (parentSection || element).remove();
  };

  function hideShorts(root = document) {
    const set = new Set();
    elementsFor(root, COMBINED).forEach(element => { if (element.isConnected) set.add(element); });
    SHORTS_HAS_RULES.forEach(({ parent, child }) => {
      elementsFor(root, parent).forEach(element => {
        if (element.isConnected && element.querySelector(child)) set.add(element);
      });
    });
    set.forEach(removeShortElement);
  }

  window.YTSuperTool = window.YTSuperTool || {};
  window.YTSuperTool.noShorts = {
    initNoShorts() {
      window.YTSuperTool.noShorts.stopNoShorts();
      hideShorts();
      if (!document.body) return;
      shortsObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE && RELEVANT_TAGS.test(node.tagName)) hideShorts(node);
        }));
      });
      shortsObserver.observe(document.body, { childList: true, subtree: true });
    },
    updateNoShorts(mutations) {
      mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && RELEVANT_TAGS.test(node.tagName)) hideShorts(node);
      }));
    },
    stopNoShorts() {
      shortsObserver?.disconnect();
      shortsObserver = null;
    }
  };
})();
