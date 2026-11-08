const CACHE_TTL = 60 * 1000;

const getVideoId = () =>
  new URLSearchParams(location.search).get('v')
  || location.pathname.match(/\/shorts\/([^/?]+)/)?.[1]
  || '';

const format = (value) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export function createDislike({ bridge }) {
  const cache = new Map();
  let enabled = false;
  let lastVideoId = '';
  let renderToken = 0;
  let renderTimer = 0;
  let currentBadge = null;
  let currentSegmented = null;
  let themeMedia = null;
  let themeListener = null;

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
    return selectors.map((selector) => segmented?.querySelector(selector)).find(Boolean) || null;
  }

  function findDislikeHost(segmented) {
    const button = findDislikeButton(segmented);
    return button?.closest('dislike-button-view-model, ytd-toggle-button-renderer') || button;
  }

  async function fetchDislike(id) {
    try {
      const response = await bridge.network.request(
        `https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(id)}`,
        { responseType: 'json', timeout: 8000 }
      );
      const dislikes = Number(response.data?.dislikes);
      return {
        value: response.ok && Number.isFinite(dislikes) ? dislikes : '—',
        time: Date.now()
      };
    } catch (error) {
      console.warn('YT SuperTool could not load dislike data:', error);
      return { value: '—', time: Date.now() };
    }
  }

  function removeRenderedCount() {
    document.querySelectorAll('.ytst-dislike-count').forEach((element) => element.remove());
    currentBadge = null;
  }

  function createCount(value, videoId) {
    const badge = document.createElement('div');
    badge.className = 'ytst-dislike-count';
    badge.setAttribute('data-ytst', 'dislike');
    badge.setAttribute('data-video-id', videoId);
    badge.setAttribute('aria-label', 'Estimated dislikes');
    badge.setAttribute('aria-live', 'polite');
    badge.textContent = value === '—' ? '—' : format(value);
    return badge;
  }

  function readSegmentedBackground(segmented, fallbackEl) {
    for (const element of [segmented, fallbackEl].filter(Boolean)) {
      const background = getComputedStyle(element).backgroundColor;
      if (background && background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)') return background;
    }
    return 'rgba(255, 255, 255, 0.1)';
  }

  function syncBadgeBackground() {
    if (!currentBadge?.isConnected || !currentSegmented) return;
    const container = document.querySelector('#top-level-buttons-computed');
    const background = readSegmentedBackground(currentSegmented, container);
    if (currentBadge.dataset.lastBg !== background) {
      currentBadge.style.setProperty('background-color', background, 'important');
      currentBadge.dataset.lastBg = background;
    }
    const color = getComputedStyle(currentSegmented).color;
    if (color) currentBadge.style.setProperty('color', color, 'important');
  }

  function setupThemeListener() {
    if (themeMedia) return;
    try {
      themeMedia = matchMedia('(prefers-color-scheme: dark)');
      themeListener = () => syncBadgeBackground();
      themeMedia.addEventListener('change', themeListener);
    } catch {
      themeMedia = null;
    }
  }

  function cleanupThemeListener() {
    if (themeMedia && themeListener) {
      try {
        themeMedia.removeEventListener('change', themeListener);
      } catch {

      }
    }
    themeMedia = null;
    themeListener = null;
  }

  function insertBadge(container, segmented, value, videoId) {
    const badge = createCount(value, videoId);
    const dislikeHost = findDislikeHost(segmented);
    const parent = dislikeHost?.parentElement || segmented;

    if (dislikeHost && parent) parent.insertBefore(badge, dislikeHost);
    else if (segmented && segmented !== container) segmented.appendChild(badge);
    else container.appendChild(badge);

    currentBadge = badge;
    currentSegmented = segmented;
    syncBadgeBackground();
    setupThemeListener();
  }

  async function render() {
    if (!enabled) return;

    const id = getVideoId();
    const token = ++renderToken;
    removeRenderedCount();

    const segmented = findSegmented();
    const container = document.querySelector('#top-level-buttons-computed');
    if (!id || !segmented || !container) return;
    lastVideoId = id;

    let item = cache.get(id);
    if (!item || Date.now() - item.time > CACHE_TTL) {
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

  return {
    init() {
      enabled = true;
      lastVideoId = '';
      scheduleRender();
    },
    update(mutations) {
      if (!enabled) return;

      const themeChanged = mutations.some((mutation) => {
        if (mutation.type !== 'attributes') return false;
        const target = mutation.target;
        return target === document.documentElement
          || target === currentSegmented
          || currentSegmented?.contains(target);
      });
      if (themeChanged) syncBadgeBackground();

      const videoId = getVideoId();
      if (videoId !== lastVideoId) {
        removeRenderedCount();
        scheduleRender();
        return;
      }

      if (hasButtonsContainerMutation(mutations)
        && !document.querySelector(`.ytst-dislike-count[data-video-id="${videoId}"]`)) {
        scheduleRender();
      }
    },
    stop() {
      enabled = false;
      cache.clear();
      lastVideoId = '';
      renderToken = 0;
      clearTimeout(renderTimer);
      renderTimer = 0;
      cleanupThemeListener();
      currentBadge = null;
      currentSegmented = null;
      removeRenderedCount();
    }
  };
}

export default createDislike;
