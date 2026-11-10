import downloaderCss from './downloader.css?inline';
import { createElement } from '../dom-safe.js';
import { createIcon } from '../ui/icons.js';

const PLAYER_ENDPOINT = '/youtubei/v1/player?prettyPrint=false';
const CLIENTS = [
  {
    name: 'ANDROID',
    id: '3',
    version: '20.10.38',
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
    extra: { androidSdkVersion: 30, osName: 'Android', osVersion: '11' }
  },
  {
    name: 'IOS',
    id: '5',
    version: '20.10.4',
    userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)',
    extra: { deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.1.0.22B83' }
  },
  {
    name: 'ANDROID_VR',
    id: '28',
    version: '1.60.19',
    userAgent: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; en_US; Quest 3 Build/SQ3A.220605.009.A1) gzip',
    extra: { androidSdkVersion: 32, osName: 'Android', osVersion: '12', deviceMake: 'Oculus', deviceModel: 'Quest 3' }
  }
];
const THIRD_PARTY_ORIGIN = 'https://ytmp3pc.com/';
const THIRD_PARTY_LABEL = 'ytmp3pc.com';
const CACHE_TTL = 10 * 60 * 1000;

const getVideoId = () => {
  try {
    const url = new URL(location.href);
    if (url.pathname === '/watch') return url.searchParams.get('v') || '';
    const match = url.pathname.match(/^\/(?:live|shorts|embed)\/([^/?]+)/);
    return match?.[1] || '';
  } catch {
    return '';
  }
};

const isWatchPage = () => location.pathname === '/watch' || location.pathname.startsWith('/live/');

const formatBytes = (bytes) => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const cleanFileName = (value) => String(value || '')
  .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 110);

const abortError = () => {
  const error = new Error('Cancelled');
  error.name = 'AbortError';
  return error;
};

const readResponse = async (response, { signal, onProgress }) => {
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) {
    const blob = await response.blob();
    onProgress?.(1, blob.size, total || blob.size);
    return blob;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (signal.aborted) {
      await reader.cancel();
      throw abortError();
    }
    chunks.push(value);
    received += value.length;
    onProgress?.(total ? Math.min(1, received / total) : 0, received, total);
  }
  return new Blob(chunks, {
    type: response.headers.get('content-type') || 'application/octet-stream'
  });
};

const fetchStream = async (url, { signal, onProgress }) => {
  const response = await fetch(url, {
    signal,
    credentials: 'omit',
    headers: { range: 'bytes=0-' }
  });
  if (!response.ok) throw new Error(`Stream request failed (${response.status})`);
  return readResponse(response, { signal, onProgress });
};

const pickMuxed = (data) => (data.streamingData?.formats || [])
  .filter((format) => format.url && /^video\/mp4/.test(String(format.mimeType || '')))
  .sort((left, right) => (right.height || 0) - (left.height || 0));

const requestPlayerResponse = async (videoId, client) => {
  const response = await fetch(PLAYER_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-youtube-client-name': client.id,
      'x-youtube-client-version': client.version
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: client.name,
          clientVersion: client.version,
          hl: 'en',
          gl: 'US',
          userAgent: client.userAgent,
          ...client.extra
        }
      },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true
    })
  });
  if (!response.ok) throw new Error(`Player request failed (${response.status})`);
  const data = await response.json();
  const status = data.playabilityStatus?.status;
  if (status && status !== 'OK') {
    throw new Error(data.playabilityStatus?.reason || `Video is not playable (${status})`);
  }
  if (!data.streamingData) throw new Error('No streaming data in the player response');
  return data;
};

export function createDownloader({ bridge, toast }) {
  let enabled = false;
  let player = null;
  let button = null;
  let menu = null;
  let progress = null;
  let progressTimer = 0;
  let retryTimer = 0;
  let retryCount = 0;
  let menuToken = 0;
  let jobId = 0;
  let activeJob = null;
  let cache = { id: '', at: 0, data: null };
  let inflight = null;

  bridge.injector.injectStyle(downloaderCss, 'ytst-downloader-style');

  const setStatus = (text) => {
    if (!progress) return;
    progress.querySelector('.ytst-dl-progress-label').textContent = text;
  };

  const setBar = (fraction) => {
    if (!progress) return;
    const bar = progress.querySelector('.ytst-dl-bar > span');
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, Math.round(fraction * 100)))}%`;
  };

  const positionFloating = (element) => {
    if (!element || !button?.isConnected) return;
    const rect = button.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    let left = rect.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 8) top = rect.top - height - 8;
    top = Math.max(8, top);
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
  };

  const removeProgress = () => {
    clearTimeout(progressTimer);
    progressTimer = 0;
    window.removeEventListener('scroll', handleProgressScroll, true);
    window.removeEventListener('resize', handleProgressScroll);
    progress?.remove();
    progress = null;
  };

  const handleProgressScroll = () => {
    if (progress) positionFloating(progress);
  };

  const finishProgress = (text, state, timeout = 5000) => {
    if (!progress) return;
    progress.dataset.state = state;
    setStatus(text);
    setBar(1);
    const cancel = progress.querySelector('.ytst-dl-cancel');
    if (cancel) {
      cancel.textContent = 'Close';
      cancel.onclick = () => removeProgress();
    }
    clearTimeout(progressTimer);
    progressTimer = setTimeout(removeProgress, timeout);
  };

  const failProgress = (error) => {
    if (error?.name === 'AbortError') {
      finishProgress('Download cancelled', 'error', 1800);
      return;
    }
    console.warn('YT SuperTool download failed:', error);
    finishProgress(`Download failed: ${error?.message || 'Unknown error'}`, 'error', 9000);
    toast?.show('Download failed');
  };

  const saveBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = createElement('a', { href: url, download: fileName });
    (document.body || document.documentElement).appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const showProgress = (text) => {
    removeProgress();
    progress = createElement('div', {
      className: 'ytst-dl-progress',
      role: 'status',
      'aria-live': 'polite',
      dataset: { state: 'run' }
    }, [
      createElement('div', { className: 'ytst-dl-progress-head' }, [
        createElement('span', { className: 'ytst-dl-progress-label', textContent: text }),
        createElement('button', {
          type: 'button',
          className: 'ytst-dl-cancel',
          textContent: 'Cancel'
        })
      ]),
      createElement('div', { className: 'ytst-dl-bar' }, [
        createElement('span')
      ])
    ]);
    const cancel = progress.querySelector('.ytst-dl-cancel');
    cancel.addEventListener('click', () => {
      if (activeJob) activeJob.controller.abort();
      else removeProgress();
    });
    (document.body || document.documentElement).appendChild(progress);
    positionFloating(progress);
    window.addEventListener('scroll', handleProgressScroll, { passive: true, capture: true });
    window.addEventListener('resize', handleProgressScroll);
  };

  const closeMenu = () => {
    menuToken += 1;
    if (menu) {
      menu.remove();
      menu = null;
    }
    button?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', handleDocumentPointer, true);
    document.removeEventListener('keydown', handleDocumentKey, true);
    window.removeEventListener('scroll', closeMenu, true);
    window.removeEventListener('resize', closeMenu);
  };

  const handleDocumentPointer = (event) => {
    if (!menu) return;
    if (menu.contains(event.target) || button?.contains(event.target)) return;
    closeMenu();
  };

  const handleDocumentKey = (event) => {
    if (event.key === 'Escape') closeMenu();
  };

  const openMenu = () => {
    if (!button || menu) return;
    const videoId = getVideoId();
    if (!videoId) return;
    menu = createElement('div', {
      className: 'ytst-dl-menu',
      role: 'menu',
      'aria-label': 'Download video'
    }, [
      createElement('div', { className: 'ytst-dl-menu-head', textContent: 'Download' }),
      createElement('div', { className: 'ytst-dl-status', textContent: 'Reading player response...' })
    ]);
    (document.body || document.documentElement).appendChild(menu);
    positionFloating(menu);
    button.setAttribute('aria-expanded', 'true');
    const token = ++menuToken;
    document.addEventListener('pointerdown', handleDocumentPointer, true);
    document.addEventListener('keydown', handleDocumentKey, true);
    window.addEventListener('scroll', closeMenu, { passive: true, capture: true });
    window.addEventListener('resize', closeMenu);
    loadMenu(videoId, token);
  };

  const loadMenu = async (videoId, token) => {
    try {
      const data = await loadPlayer(videoId);
      if (token !== menuToken || !menu) return;
      renderMenu(data, videoId);
      positionFloating(menu);
    } catch (error) {
      if (token !== menuToken || !menu) return;
      const message = error?.message || 'Could not read the player response';
      menu.replaceChildren(
        createElement('div', { className: 'ytst-dl-menu-head', textContent: 'Download' }),
        createElement('div', { className: 'ytst-dl-status', textContent: message })
      );
      positionFloating(menu);
    }
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {

    }
    const area = createElement('textarea', {
      className: 'ytst-dl-copy-area',
      readonly: true
    });
    area.value = text;
    (document.body || document.documentElement).appendChild(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  };

  const openThirdParty = () => {
    if (typeof bridge.openExternal === 'function') {
      bridge.openExternal(THIRD_PARTY_ORIGIN);
      return;
    }
    globalThis.open(THIRD_PARTY_ORIGIN, '_blank', 'noopener,noreferrer');
  };

  const openThirdPartyWithLink = async (videoId) => {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const copied = await copyText(watchUrl);
    toast?.show(copied ? 'Link copied — paste it on ytmp3pc.com' : 'Could not copy the link');
    openThirdParty();
  };

  const renderMenu = (data, videoId) => {
    if (!menu) return;
    const title = data.title || document.title.replace(/\s*-\s*YouTube\s*$/, '');
    const muxed = data.muxed || null;
    const baseName = `${cleanFileName(title) || 'video'} [${videoId}]`;
    const children = [
      createElement('div', { className: 'ytst-dl-menu-head', textContent: 'Download' }),
      createElement('div', { className: 'ytst-dl-section', textContent: 'Direct · MP4' })
    ];

    if (muxed) {
      children.push(createElement('button', {
        type: 'button',
        className: 'ytst-dl-item',
        role: 'menuitem',
        dataset: { kind: 'direct' }
      }, [
        createElement('span', { className: 'ytst-dl-item-main' }, [
          createElement('span', {
            className: 'ytst-dl-item-title',
            textContent: `MP4 ${muxed.qualityLabel || `${muxed.height || 360}p`}`
          }),
          createElement('span', { className: 'ytst-dl-item-note', textContent: 'Video + audio · saved directly' })
        ]),
        createElement('span', { className: 'ytst-dl-item-meta', textContent: formatBytes(muxed.contentLength) })
      ]));
    } else {
      children.push(createElement('button', {
        type: 'button',
        className: 'ytst-dl-item',
        role: 'menuitem',
        disabled: true
      }, [
        createElement('span', { className: 'ytst-dl-item-main' }, [
          createElement('span', { className: 'ytst-dl-item-title', textContent: 'MP4 360p unavailable' }),
          createElement('span', { className: 'ytst-dl-item-note', textContent: 'No single-stream video for this one' })
        ])
      ]));
    }

    children.push(createElement('div', {
      className: 'ytst-dl-section',
      textContent: `Other formats · ${THIRD_PARTY_LABEL}`
    }));

    children.push(createElement('button', {
      type: 'button',
      className: 'ytst-dl-item',
      role: 'menuitem',
      dataset: { kind: 'route' }
    }, [
      createElement('span', { className: 'ytst-dl-item-main' }, [
        createElement('span', { className: 'ytst-dl-item-title', textContent: 'MP4/MP3 (High Quality)' }),
        createElement('span', { className: 'ytst-dl-item-note', textContent: 'Copies the link, opens a new tab' })
      ]),
      createElement('span', { className: 'ytst-dl-item-meta', textContent: '↗' })
    ]));

    children.push(createElement('div', {
      className: 'ytst-dl-menu-foot',
      textContent: `Only the single-stream MP4 downloads in place. High quality MP4 and MP3 continue on ${THIRD_PARTY_LABEL} with the link copied for you.`
    }));

    menu.replaceChildren(...children);

    menu.querySelectorAll('.ytst-dl-item[data-kind]').forEach((item) => {
      item.addEventListener('click', () => {
        const kind = item.dataset.kind;
        closeMenu();
        if (kind === 'direct') startDirect(muxed, baseName);
        else openThirdPartyWithLink(videoId);
      });
    });
  };

  const beginJob = () => {
    if (activeJob) return null;
    const job = { id: ++jobId, controller: new AbortController() };
    activeJob = job;
    return job;
  };

  const endJob = (job) => {
    if (activeJob === job) activeJob = null;
  };

  const startDirect = async (format, baseName) => {
    const job = beginJob();
    if (!job) return;
    showProgress('Downloading MP4...');
    let lastPaint = 0;
    try {
      const blob = await fetchStream(format.url, {
        signal: job.controller.signal,
        onProgress: (fraction, received, total) => {
          setBar(fraction);
          const now = performance.now();
          if (now - lastPaint < 120) return;
          lastPaint = now;
          const size = total ? `${formatBytes(received)} of ${formatBytes(total)}` : formatBytes(received);
          setStatus(`Downloading MP4 · ${Math.round(fraction * 100)}%${size ? ` · ${size}` : ''}`);
        }
      });
      if (job.controller.signal.aborted) throw abortError();
      const fileName = `${baseName}.mp4`;
      saveBlob(blob, fileName);
      finishProgress(`Saved · ${fileName}`, 'done');
    } catch (error) {
      failProgress(error);
    } finally {
      endJob(job);
    }
  };

  const loadPlayer = async (videoId) => {
    if (cache.id === videoId && Date.now() - cache.at < CACHE_TTL) return cache.data;
    if (inflight?.id === videoId) return inflight.promise;

    const promise = (async () => {
      let snapshot = null;
      let lastError = null;
      for (const client of CLIENTS) {
        try {
          const data = await requestPlayerResponse(videoId, client);
          const muxed = pickMuxed(data)[0] || null;
          if (!snapshot) {
            snapshot = { title: data.videoDetails?.title || '', muxed };
          }
          if (muxed) {
            snapshot.muxed = muxed;
            break;
          }
        } catch (error) {
          lastError = error;
        }
      }
      if (!snapshot) throw lastError || new Error('No client returned streaming data');
      cache = { id: videoId, at: Date.now(), data: snapshot };
      return snapshot;
    })().finally(() => {
      if (inflight?.id === videoId) inflight = null;
    });

    inflight = { id: videoId, promise };
    return promise;
  };

  const removeButton = () => {
    button?.remove();
    button = null;
  };

  const ensureButton = () => {
    if (!enabled) return;
    if (!isWatchPage() || !getVideoId()) {
      removeButton();
      closeMenu();
      return;
    }
    const row = document.querySelector('ytd-watch-metadata #top-level-buttons-computed');
    if (!row) {
      if (retryCount < 20 && !retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = 0;
          retryCount += 1;
          ensureButton();
        }, 500);
      }
      return;
    }

    retryCount = 0;
    const videoId = getVideoId();
    if (button && button.dataset.videoId !== videoId) {
      closeMenu();
      activeJob?.controller.abort();
    }
    if (!button) {
      const caret = createIcon('chevron', 14);
      caret.classList.add('ytst-dl-caret');
      button = createElement('button', {
        type: 'button',
        className: 'ytst-dl-button',
        title: 'Download',
        'aria-label': 'Download this video',
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        dataset: { videoId }
      }, [
        createIcon('download', 22),
        createElement('span', { className: 'ytst-dl-label', textContent: 'Download' }),
        caret
      ]);
      button.addEventListener('click', () => {
        if (menu) closeMenu();
        else openMenu();
      });
    }
    button.dataset.videoId = videoId;
    if (button.parentElement !== row) row.appendChild(button);
  };

  return {
    init(currentPlayer) {
      enabled = true;
      player = currentPlayer || player;
      ensureButton();
    },
    update() {
      if (enabled) ensureButton();
    },
    stop() {
      enabled = false;
      clearTimeout(retryTimer);
      retryTimer = 0;
      retryCount = 0;
      activeJob?.controller.abort();
      activeJob = null;
      closeMenu();
      removeProgress();
      removeButton();
      cache = { id: '', at: 0, data: null };
      inflight = null;
    },
    get player() {
      return player;
    }
  };
}

export default createDownloader;
