(function () {
  const cache = new Map();
  let lastVideoId = '';
  let enabled = false;
  let renderToken = 0;
  let renderTimer = 0;
  let segmentedObserver = null;
  let segmentedObserverTimer = 0;
  let currentBadge = null;
  let currentSegmented = null;
  let themeMedia = null;
  let themeListener = null;

  const isExtensionAlive = () => window.YTSuperTool.utils.isExtensionAlive();

  const getVideoId = () =>
    new URLSearchParams(location.search).get('v')
    || location.pathname.match(/\/shorts\/([^/?]+)/)?.[1]
    || '';

  const format = value =>
    new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

  function findSegmented() {
    const segmented = document.querySelector('ytd-segmented-like-dislike-button-renderer');
    if (segmented) return segmented;

    const legacyButton = document.querySelector(
      'ytd-menu-renderer #top-level-buttons-computed ytd-toggle-button-renderer'
    );
    return legacyButton?.closest('#top-level-buttons-computed')
      || document.querySelector('#top-level-buttons-computed');
  }

  function findDislikeButton(segmented) {
    const selectors = [
      'ytd-segmented-like-dislike-button-renderer button[aria-label*="dislike" i]',
      'dislike-button-view-model button',
      'button[aria-label*="dislike" i]',
      '#top-level-buttons-computed ytd-toggle-button-renderer:nth-child(2) button'
    ];
    return selectors.map(selector => segmented?.querySelector(selector)).find(Boolean) || null;
  }

  function findDislikeHost(segmented) {
    const button = findDislikeButton(segmented);
    return button?.closest('dislike-button-view-model, ytd-toggle-button-renderer') || button;
  }

  async function fetchDislike(id) {
    if (!isExtensionAlive()) return { value: '—', time: Date.now() };
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type: 'fetchDislike', videoId: id }, response => {
          if (!isExtensionAlive() || chrome.runtime.lastError) {
            resolve({ value: '—', time: Date.now() });
            return;
          }
          resolve(response?.ok
            ? { value: response.dislikes, time: Date.now() }
            : { value: '—', time: Date.now() });
        });
      } catch {
        resolve({ value: '—', time: Date.now() });
      }
    });
  }

  function removeRenderedCount() {
    document.querySelectorAll('.yt-supertool-dislike-count, .yt-supertool-dislike-badge')
      .forEach(element => element.remove());
  }

  function createCount(value, videoId) {
    const badge = document.createElement('div');
    badge.className = 'yt-supertool-dislike-count yt-supertool-dislike-badge';
    badge.style.cssText = `
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      align-self: center !important;
      height: 40px !important;
      min-height: 40px !important;
      padding: 0 6px !important;
      margin: 0 !important;
      border: 0 !important;
      color: var(--yt-spec-text-primary, #fff) !important;
      font: 500 14px/40px Roboto, sans-serif !important;
      cursor: default !important;
      user-select: none !important;
      flex-shrink: 0 !important;
      white-space: nowrap !important;
      position: static !important;
      z-index: auto !important;
      box-sizing: border-box !important;
      vertical-align: middle !important;
      transition: background-color 0.15s ease !important;
    `;
    badge.setAttribute('aria-label', 'Dislikes');
    badge.setAttribute('aria-live', 'polite');
    badge.setAttribute('data-yt-supertool', 'dislike');
    badge.setAttribute('data-video-id', videoId);
    badge.textContent = value === '—' ? '—' : format(value);
    return badge;
  }

  function readSegmentedBackground(segmented, fallbackEl) {
    const candidates = [segmented, fallbackEl].filter(Boolean);
    for (const el of candidates) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return bg;
    }
    return 'rgba(255, 255, 255, 0.1)';
  }

  function syncBadgeBackground() {
    if (!currentBadge || !currentSegmented || !currentBadge.isConnected) return;
    const container = document.querySelector('#top-level-buttons-computed');
    const bg = readSegmentedBackground(currentSegmented, container);
    if (currentBadge.dataset.lastBg !== bg) {
      currentBadge.style.setProperty('background-color', bg, 'important');
      currentBadge.dataset.lastBg = bg;
    }
    const color = getComputedStyle(currentSegmented).color;
    if (color) currentBadge.style.setProperty('color', color, 'important');
  }

  function observeSegmentedBg() {
    if (segmentedObserver) segmentedObserver.disconnect();
    clearTimeout(segmentedObserverTimer);
    if (!currentSegmented) return;
    segmentedObserver = new MutationObserver(() => syncBadgeBackground());
    segmentedObserver.observe(currentSegmented, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    segmentedObserverTimer = setTimeout(() => {
      segmentedObserver?.disconnect();
      segmentedObserver = null;
    }, 5000);
  }

  function setupThemeListener() {
    if (themeMedia) return;
    try {
      themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
      themeListener = () => syncBadgeBackground();
      themeMedia.addEventListener('change', themeListener);
    } catch {}
    const docObserver = new MutationObserver(() => syncBadgeBackground());
    docObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['dark', 'light', 'dark-theme', 'class']
    });
    currentBadge && (currentBadge.__themeObserver = docObserver);
  }

  function cleanupThemeListener() {
    if (themeMedia && themeListener) {
      try { themeMedia.removeEventListener('change', themeListener); } catch {}
    }
    themeMedia = null;
    themeListener = null;
    if (currentBadge?.__themeObserver) {
      currentBadge.__themeObserver.disconnect();
      delete currentBadge.__themeObserver;
    }
  }

  function insertBadge(container, segmented, value, videoId) {
    const badge = createCount(value, videoId);
    const dislikeHost = findDislikeHost(segmented);
    const parent = dislikeHost?.parentElement || segmented;

    if (dislikeHost && parent) {
      parent.insertBefore(badge, dislikeHost);
    } else if (segmented && segmented !== container) {
      segmented.appendChild(badge);
    } else {
      container.appendChild(badge);
    }

    currentBadge = badge;
    currentSegmented = segmented;
    syncBadgeBackground();
    observeSegmentedBg();
    setupThemeListener();
  }

  async function render() {
    if (!enabled) return;

    const id = getVideoId();
    const token = ++renderToken;
    const segmented = findSegmented();
    const container = document.querySelector('#top-level-buttons-computed');

    if (!id || !segmented || !container) return;
    lastVideoId = id;

    let item = cache.get(id);
    removeRenderedCount();
    if (!item || Date.now() - item.time > 60000) {
      item = await fetchDislike(id);
      if (item.value !== '—') cache.set(id, item);
    }

    if (!enabled || token !== renderToken || id !== getVideoId()) return;

    insertBadge(container, segmented, item.value, id);
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 100);
    setTimeout(render, 1200);
  }

  function hasButtonsContainerMutation(mutations) {
    for (const mutation of mutations) {
      if (!mutation.addedNodes.length) continue;
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.id === 'top-level-buttons-computed'
          || node.querySelector?.('#top-level-buttons-computed')) return true;
      }
    }
    return false;
  }

  window.YTSuperTool = window.YTSuperTool || {};
  window.YTSuperTool.dislike = {
    initDislike() {
      enabled = true;
      lastVideoId = '';
      scheduleRender();
    },
    updateDislike(mutations) {
      if (!enabled) return;

      const videoId = getVideoId();
      if (videoId !== lastVideoId) {
        removeRenderedCount();
        scheduleRender();
        return;
      }

      if (
        hasButtonsContainerMutation(mutations)
        && !document.querySelector(`.yt-supertool-dislike-count[data-video-id="${videoId}"]`)
      ) {
        scheduleRender();
      }
    },
    stopDislike() {
      enabled = false;
      cache.clear();
      lastVideoId = '';
      renderToken = 0;
      clearTimeout(renderTimer);
      clearTimeout(segmentedObserverTimer);
      renderTimer = 0;
      segmentedObserverTimer = 0;
      segmentedObserver?.disconnect();
      segmentedObserver = null;
      cleanupThemeListener();
      currentBadge = null;
      currentSegmented = null;
      removeRenderedCount();
    }
  };
})();