(function () {
  const SHORTS_SELECTORS = [
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-reel-shelf-renderer',
    'ytm-shorts-lockup-view-model',
    '[tab-title="Shorts"]',
    '.pivot-shorts',
    'a[href="/shorts"]',
    '.reel-shelf-renderer',
    'ytm-reel-shelf-renderer',
    'ytm-shorts-lockup-view-model-v2'
  ];

  const SHORTS_HAS_RULES = [
    { parent: 'ytd-guide-entry-renderer', child: 'a[title="Shorts"]' },
    { parent: 'ytd-mini-guide-entry-renderer', child: 'a[title="Shorts"]' },
    { parent: 'ytd-rich-section-renderer', child: 'ytd-rich-shelf-renderer[is-shorts]' },
    { parent: 'ytd-rich-item-renderer', child: 'a[href^="/shorts/"]' },
    { parent: 'ytd-video-renderer', child: 'a[href^="/shorts/"]' },
    { parent: 'ytd-grid-video-renderer', child: 'a[href^="/shorts/"]' },
    { parent: 'ytm-video-with-context-renderer', child: 'a[href^="/shorts/"]' },
    { parent: 'ytm-compact-video-renderer', child: 'a[href^="/shorts/"]' }
  ];

  const elementsFor = (root, selector, includeRoot = true) => [
    ...(includeRoot && root.matches?.(selector) ? [root] : []),
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
    const includeRoot = root.nodeType !== Node.ELEMENT_NODE || RELEVANT_TAGS.test(root.tagName);
    const set = new Set();
    elementsFor(root, COMBINED, includeRoot).forEach(element => { if (element.isConnected) set.add(element); });
    SHORTS_HAS_RULES.forEach(({ parent, child }) => {
      elementsFor(root, parent, includeRoot).forEach(element => {
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
    },
    updateNoShorts(mutations) {
      mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && RELEVANT_TAGS.test(node.tagName)) hideShorts(node);
      }));
    },
    stopNoShorts() {
    }
  };
})();
