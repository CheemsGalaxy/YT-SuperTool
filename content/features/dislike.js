// content/features/dislike.js

(function () {
  const cache = new Map();
  let lastVideoId = '';
  let enabled = false;
  let renderToken = 0;

  function isExtensionAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  const getVideoId = () => new URLSearchParams(location.search).get('v') || location.pathname.match(/\/shorts\/([^/?]+)/)?.[1] || '';
  const format = value => new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

  function findSegmented() {
    const segmented = document.querySelector('ytd-segmented-like-dislike-button-renderer');
    if (segmented) return segmented;

    const legacyButton = document.querySelector('ytd-menu-renderer #top-level-buttons-computed ytd-toggle-button-renderer');
    return legacyButton?.closest('#top-level-buttons-computed') || document.querySelector('#top-level-buttons-computed');
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

  function removeRenderedCount() {
    document.querySelectorAll('.yt-supertool-dislike-count, .yt-supertool-dislike-badge').forEach(element => element.remove());
  }

  function createCount(value, videoId) {
    const badge = document.createElement('div');

    badge.className = 'yt-supertool-dislike-count yt-supertool-dislike-badge';
    badge.style.cssText = 'display:inline-flex!important;align-items:center;height:36px;padding:0 10px;background:none!important;background-color:transparent!important;background-image:none!important;box-shadow:none!important;color:var(--yt-spec-text-primary,#fff)!important;font:500 14px/1 Roboto,sans-serif;cursor:default;user-select:none;flex-shrink:0;position:static!important;z-index:auto!important;white-space:nowrap;border-left:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,.12));';
    badge.setAttribute('aria-label', 'Dislikes');
    badge.setAttribute('aria-live', 'polite');
    badge.setAttribute('data-yt-supertool', 'dislike');
    badge.setAttribute('data-video-id', videoId);
    badge.textContent = value === '—' ? '—' : format(value);
    return badge;
  }

  function syncBadgeColors(badge, segmented, dislikeHost, container) {
    const segmentedStyle = segmented && getComputedStyle(segmented);
    const dislikeStyle = dislikeHost && getComputedStyle(dislikeHost);
    const background = segmentedStyle?.backgroundColor;
    const color = dislikeStyle?.color || segmentedStyle?.color;

    if (background && background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)') {
      badge.style.setProperty('background-color', background, 'important');
    } else {
      const containerBackground = getComputedStyle(container).backgroundColor;
      if (containerBackground && containerBackground !== 'transparent') {
        badge.style.setProperty('background-color', containerBackground, 'important');
      }
    }
    if (color) badge.style.setProperty('color', color, 'important');
  }

  function insertBadge(container, segmented, value, videoId) {
    // Xóa badge cũ trước khi tạo badge mới để tránh chồng lớp.
    const badge = createCount(value, videoId);
    const dislikeHost = findDislikeHost(segmented);
    const parent = dislikeHost?.parentElement || segmented;

    if (dislikeHost && parent) {
      // Chèn ngay trước icon Dislike, bên trong segmented pill gốc.
      parent.insertBefore(badge, dislikeHost);
    } else if (segmented && segmented !== container) {
      segmented.appendChild(badge);
    } else {
      container.appendChild(badge);
    }

    syncBadgeColors(badge, segmented, dislikeHost, container);

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
      if (!isExtensionAlive()) return;
      item = await new Promise(resolve => {
        try {
          chrome.runtime.sendMessage({ type: 'fetchDislike', videoId: id }, response => {
            if (!isExtensionAlive()) {
              resolve({ value: '—', time: Date.now() });
              return;
            }
            if (chrome.runtime.lastError) {
              resolve({ value: '—', time: Date.now() });
              return;
            }
            resolve(response?.ok ? { value: response.dislikes, time: Date.now() } : { value: '—', time: Date.now() });
          });
        } catch {
          resolve({ value: '—', time: Date.now() });
        }
      });
      if (item.value !== '—') cache.set(id, item);
    }

    if (!enabled || token !== renderToken || id !== getVideoId()) return;

    insertBadge(container, segmented, item.value, id);
  }

  function scheduleRender() {
    [0, 400, 1200].forEach(delay => setTimeout(render, delay));
  }

  function hasButtonsContainerMutation(mutations) {
    for (const mutation of mutations) {
      if (!mutation.addedNodes.length) continue;
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.id === 'top-level-buttons-computed' || node.querySelector?.('#top-level-buttons-computed')) return true;
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

      if (hasButtonsContainerMutation(mutations) && !document.querySelector(`.yt-supertool-dislike-count[data-video-id="${getVideoId()}"]`)) {
        scheduleRender();
      }
    },
    stopDislike() {
      enabled = false;
      cache.clear();
      lastVideoId = '';
      renderToken = 0;
      removeRenderedCount();
    }
  };
})();
