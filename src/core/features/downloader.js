import downloaderCss from './downloader.css?inline';
import { createElement } from '../dom-safe.js';
import { createIcon } from '../ui/icons.js';
import { UI_STRINGS, UI_TEXT } from '../ui/strings.js';

const PLAYER_ENDPOINT = `${globalThis.location?.origin || 'https://www.youtube.com'}/youtubei/v1/player?prettyPrint=false`;
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
const DEFAULT_WEAT_BASE_URL = 'https://cheemsgalaxy.github.io/wea-t/';
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

const getCleanWatchUrl = (videoId) => {
  try {
    const url = new URL(location.href);
    const shortsMatch = url.pathname.match(/^\/shorts\/([^/?]+)/);
    if (shortsMatch?.[1]) return `https://www.youtube.com/shorts/${shortsMatch[1]}`;
  } catch {

  }
  return `https://www.youtube.com/watch?v=${videoId}`;
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

export function createDownloader({ bridge, settings, toast }) {
  let enabled = false;
  let player = null;
  let button = null;
  let menu = null;
  let progress = null;
  let progressTimer = 0;
  let retryTimer = 0;
  let retryCount = 0;
  let menuToken = 0;
  let menuVideoId = '';
  let menuScrollFrame = 0;
  let menuData = null;
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
      cancel.textContent = UI_STRINGS.close;
      cancel.onclick = () => removeProgress();
    }
    clearTimeout(progressTimer);
    progressTimer = setTimeout(removeProgress, timeout);
  };

  const failProgress = (error) => {
    if (error?.name === 'AbortError') {
      finishProgress(UI_STRINGS.downloadCancelled, 'error', 1800);
      return;
    }
    console.warn('YT SuperTool download failed:', error);
    finishProgress(UI_TEXT.downloadFailed(error?.message || UI_STRINGS.unknownError), 'error', 9000);
    toast?.show(UI_STRINGS.downloadFailedToast);
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
          textContent: UI_STRINGS.cancel
        })
      ]),
      createElement('div', { className: 'ytst-dl-bar' }, [
        createElement('span')
      ])
    ]);
    const cancel = progress.querySelector('.ytst-dl-cancel');
    cancel.addEventListener('click', () => {
      if (activeJob?.kind === 'direct') activeJob.controller.abort();
      else removeProgress();
    });
    (document.body || document.documentElement).appendChild(progress);
    positionFloating(progress);
    window.addEventListener('scroll', handleProgressScroll, { passive: true, capture: true });
    window.addEventListener('resize', handleProgressScroll);
  };

  const alignMenu = () => {
    menuScrollFrame = 0;
    if (!menu) return;
    const rect = button?.getBoundingClientRect();
    if (!rect || rect.bottom <= 0 || rect.top >= window.innerHeight) {
      closeMenu();
      return;
    }
    positionFloating(menu);
  };

  const handleMenuScroll = () => {
    if (menuScrollFrame) return;
    menuScrollFrame = requestAnimationFrame(alignMenu);
  };

  const closeMenu = () => {
    menuToken += 1;
    if (menuScrollFrame) {
      cancelAnimationFrame(menuScrollFrame);
      menuScrollFrame = 0;
    }
    if (menu) {
      menu.remove();
      menu = null;
    }
    button?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', handleDocumentPointer, true);
    document.removeEventListener('keydown', handleDocumentKey, true);
    window.removeEventListener('scroll', handleMenuScroll, true);
    window.removeEventListener('resize', handleMenuScroll);
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
    menuVideoId = videoId;
    menuData = null;
    menu = createElement('div', {
      className: 'ytst-dl-menu',
      role: 'menu',
      'aria-label': UI_STRINGS.downloadVideo
    }, [
      createElement('div', { className: 'ytst-dl-menu-head', textContent: UI_STRINGS.download }),
      createElement('div', { className: 'ytst-dl-status', textContent: UI_STRINGS.readingPlayerResponse })
    ]);
    (document.body || document.documentElement).appendChild(menu);
    positionFloating(menu);
    button.setAttribute('aria-expanded', 'true');
    const token = ++menuToken;
    document.addEventListener('pointerdown', handleDocumentPointer, true);
    document.addEventListener('keydown', handleDocumentKey, true);
    window.addEventListener('scroll', handleMenuScroll, { passive: true, capture: true });
    window.addEventListener('resize', handleMenuScroll);
    refreshMenu();
    void loadMenu(videoId, token);
  };

  const loadMenu = async (videoId, token) => {
    try {
      const data = await loadPlayer(videoId);
      if (token !== menuToken || !menu) return;
      const title = data.title || document.title.replace(/\s*-\s*YouTube\s*$/, '');
      menuData = {
        title,
        muxed: data.muxed || null,
        baseName: `${cleanFileName(title) || 'video'} [${videoId}]`
      };
      refreshMenu();
    } catch (error) {
      if (token !== menuToken || !menu) return;
      menuData = { error: error?.message || UI_STRINGS.readFailed };
      refreshMenu();
    }
  };

  const buildWeatUrl = (videoId, fmt = '', auto = false) => {
    const rawBase = String(settings?.get?.('weatBaseUrl') || DEFAULT_WEAT_BASE_URL).trim() || DEFAULT_WEAT_BASE_URL;
    let target;
    try {
      target = new URL(rawBase);
    } catch {
      target = new URL(DEFAULT_WEAT_BASE_URL);
    }
    target.searchParams.set('url', getCleanWatchUrl(videoId));
    target.searchParams.set('src', 'ytst');
    if (fmt) target.searchParams.set('fmt', fmt);
    if (auto) target.searchParams.set('auto', '1');
    target.hash = 'youtube';
    return target.toString();
  };

  const openWeatStudio = (videoId, fmt = '', auto = false) => {
    const targetUrl = buildWeatUrl(videoId, fmt, auto);
    if (typeof bridge.openExternal === 'function') {
      bridge.openExternal(targetUrl);
    } else {
      globalThis.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
    toast?.show(UI_STRINGS.weatOpened);
  };

  const stateLine = (text) => createElement('div', { className: 'ytst-dl-state', textContent: text });

  const weatItem = ({ label, note, fmt = '', auto = false, badge = '↗' }) => createElement('button', {
    type: 'button',
    className: 'ytst-dl-item',
    role: 'menuitem',
    dataset: { kind: 'weat', fmt, auto: auto ? '1' : '0' }
  }, [
    createElement('span', { className: 'ytst-dl-item-main' }, [
      createElement('span', { className: 'ytst-dl-item-title', textContent: label }),
      note ? createElement('span', { className: 'ytst-dl-item-note', textContent: note }) : null
    ].filter(Boolean)),
    createElement('span', { className: 'ytst-dl-item-meta', textContent: badge })
  ]);

  const muxedItem = (muxed) => createElement('button', {
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
      createElement('span', { className: 'ytst-dl-item-note', textContent: UI_STRINGS.videoAudioSaved })
    ]),
    createElement('span', { className: 'ytst-dl-item-meta', textContent: formatBytes(muxed.contentLength) })
  ]);

  const refreshMenu = () => {
    if (!menu) return;
    const children = [
      createElement('div', { className: 'ytst-dl-menu-head', textContent: UI_STRINGS.download }),
      createElement('div', { className: 'ytst-dl-section', textContent: UI_STRINGS.directMp4 })
    ];

    if (menuData?.muxed) {
      children.push(muxedItem(menuData.muxed));
    } else if (menuData?.error) {
      children.push(stateLine(menuData.error));
    } else if (menuData) {
      children.push(createElement('button', {
        type: 'button',
        className: 'ytst-dl-item',
        role: 'menuitem',
        disabled: true
      }, [
        createElement('span', { className: 'ytst-dl-item-main' }, [
          createElement('span', { className: 'ytst-dl-item-title', textContent: UI_STRINGS.mp4Unavailable }),
          createElement('span', { className: 'ytst-dl-item-note', textContent: UI_STRINGS.noSingleStream })
        ])
      ]));
    } else {
      children.push(stateLine(UI_STRINGS.readingPlayerResponse));
    }

    children.push(createElement('div', {
      className: 'ytst-dl-section',
      textContent: UI_STRINGS.weatSection
    }));
    children.push(weatItem({ label: UI_STRINGS.weatBest, fmt: 'best', auto: true, badge: 'BEST' }));
    children.push(weatItem({ label: UI_STRINGS.weat1080, fmt: '1080', auto: true, badge: 'FHD' }));
    children.push(weatItem({ label: UI_STRINGS.weat4k, fmt: '2160', auto: true, badge: '4K' }));
    children.push(weatItem({ label: UI_STRINGS.weatMp3, fmt: 'mp3', auto: true, badge: 'MP3' }));
    children.push(weatItem({ label: UI_STRINGS.weatOpenStudio, fmt: '', auto: false, badge: '↗' }));

    children.push(createElement('div', {
      className: 'ytst-dl-menu-foot',
      textContent: UI_STRINGS.weatFoot
    }));

    menu.replaceChildren(...children);
    menu.querySelectorAll('.ytst-dl-item[data-kind]').forEach((item) => {
      item.addEventListener('click', () => handleMenuChoice(item.dataset));
    });
    positionFloating(menu);
  };

  const handleMenuChoice = (dataset) => {
    const kind = dataset.kind;
    closeMenu();

    if (kind === 'direct') {
      if (menuData?.muxed) startDirect(menuData.muxed, menuData.baseName);
      return;
    }

    if (kind === 'weat') {
      openWeatStudio(menuVideoId, dataset.fmt || '', dataset.auto === '1');
    }
  };

  const beginJob = (kind) => {
    if (activeJob) return null;
    const job = {
      id: ++jobId,
      kind,
      controller: kind === 'direct' ? new AbortController() : null
    };
    activeJob = job;
    return job;
  };

  const endJob = (job) => {
    if (activeJob === job) activeJob = null;
  };

  const abortActiveJob = () => {
    const job = activeJob;
    if (!job) return;
    activeJob = null;
    if (job.kind === 'direct') {
      job.controller?.abort();
    }
  };

  const startDirect = async (format, baseName) => {
    const job = beginJob('direct');
    if (!job) {
      toast?.show(UI_STRINGS.downloadBusy);
      return;
    }
    showProgress(UI_STRINGS.downloadingMp4);
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
          setStatus(UI_TEXT.downloadProgress(Math.round(fraction * 100), size));
        }
      });
      if (job.controller.signal.aborted) throw abortError();
      const fileName = `${baseName}.mp4`;
      saveBlob(blob, fileName);
      finishProgress(UI_TEXT.savedFile(fileName), 'done');
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
      abortActiveJob();
      if (progress) finishProgress(UI_STRINGS.downloadCancelled, 'error', 1800);
    }
    if (!button) {
      const caret = createIcon('chevron', 14);
      caret.classList.add('ytst-dl-caret');
      button = createElement('button', {
        type: 'button',
        className: 'ytst-dl-button',
        title: UI_STRINGS.download,
        'aria-label': UI_STRINGS.downloadThisVideo,
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        dataset: { videoId }
      }, [
        createIcon('download', 22),
        createElement('span', { className: 'ytst-dl-label', textContent: UI_STRINGS.download }),
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
      abortActiveJob();
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
