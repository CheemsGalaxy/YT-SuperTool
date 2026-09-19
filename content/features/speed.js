(function () {
  const MIN_SPEED = 0.25;
  const MAX_SPEED = 10;
  const STEP = 0.05;
  const KEY_STEP = 0.25;
  const DEFAULT_SPEED = 1;
  const PRESETS = [0.75, 1, 1.25, 1.5];
  const SAVE_DEBOUNCE = 200;
  const MAX_RETRY = 40;

  let currentSpeed = DEFAULT_SPEED;
  let container = null;
  let video = null;
  let onKeydown = null;
  let onRateChange = null;
  let initRetryTimer = 0;
  let initRetryCount = 0;
  let badgeRef = null;
  let sliderRef = null;
  let presetButtons = [];
  let saveTimer = 0;

  const clampSpeed = v => Math.min(MAX_SPEED, Math.max(MIN_SPEED, Number(v) || DEFAULT_SPEED));
  const normalizeSpeed = v => Math.round(clampSpeed(v) / STEP) * STEP;
  const formatSpeed = v => `${v.toFixed(2)}x`;

  function saveSpeed(speed) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        if (chrome.runtime?.id) chrome.storage.local.set({ playbackSpeed: speed });
      } catch {}
    }, SAVE_DEBOUNCE);
  }

  function syncPresetStates() {
    for (const button of presetButtons) {
      const presetValue = parseFloat(button.textContent);
      button.classList.toggle('is-active', Math.abs(presetValue - currentSpeed) < 0.001);
    }
  }

  function applySpeed(value, persist = true) {
    const next = Number(normalizeSpeed(value).toFixed(2));
    if (next === currentSpeed) {
      if (persist) saveSpeed(currentSpeed);
      return;
    }
    currentSpeed = next;
    if (video && video.playbackRate !== currentSpeed) video.playbackRate = currentSpeed;
    if (badgeRef) badgeRef.textContent = formatSpeed(currentSpeed);
    if (sliderRef) {
      sliderRef.value = String(currentSpeed);
      sliderRef.title = formatSpeed(currentSpeed);
    }
    syncPresetStates();
    if (persist) saveSpeed(currentSpeed);
  }

  function findControlsAnchor(player) {
    const controls = player?.querySelector('.ytp-left-controls');
    if (!controls) return null;
    return controls.querySelector('.ytp-time-display');
  }

  function scheduleInitRetry(player) {
    if (initRetryCount >= MAX_RETRY) return;
    clearTimeout(initRetryTimer);
    initRetryCount += 1;
    initRetryTimer = setTimeout(() => initSpeed(player), 250);
  }

  function setVideo(player) {
    video = player.querySelector('video') || document.querySelector('.html5-video-player video');
    if (video && video.playbackRate !== currentSpeed) video.playbackRate = currentSpeed;
  }

  function initSpeed(player) {
    if (!player) return;
    const anchor = findControlsAnchor(player);
    if (!anchor) {
      scheduleInitRetry(player);
      return;
    }
    initRetryCount = 0;

    const existing = document.querySelector('[data-yt-supertool="speed"]');
    if (existing) {
      if (existing.parentElement !== anchor.parentElement) anchor.insertAdjacentElement('afterend', existing);
      container = existing;
      badgeRef = existing.querySelector('.yt-supertool-speed-badge');
      sliderRef = existing.querySelector('.yt-supertool-speed-slider');
      presetButtons = Array.from(existing.querySelectorAll('.yt-supertool-speed-presets button'));
      setVideo(player);
      applySpeed(currentSpeed, false);
      return;
    }

    window.YTSuperTool.injectStyles?.();
    stopSpeed();
    setVideo(player);

    const el = document.createElement('div');
    el.dataset.ytSupertool = 'speed';
    el.title = 'Playback speed';

    const badge = document.createElement('span');
    badge.className = 'yt-supertool-speed-badge';
    badge.textContent = formatSpeed(currentSpeed);
    badge.setAttribute('aria-label', 'Playback speed');

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'yt-supertool-speed-slider';
    slider.min = String(MIN_SPEED);
    slider.max = String(MAX_SPEED);
    slider.step = String(STEP);
    slider.value = String(currentSpeed);
    slider.setAttribute('aria-label', 'Playback speed');
    slider.addEventListener('input', event => applySpeed(event.target.value));
    slider.addEventListener('dblclick', event => {
      event.preventDefault();
      applySpeed(DEFAULT_SPEED);
    });

    const presets = document.createElement('span');
    presets.className = 'yt-supertool-speed-presets';
    PRESETS.forEach(preset => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${preset}x`;
      button.title = `Set playback speed to ${preset}x`;
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        applySpeed(preset);
      });
      presets.append(button);
    });

    el.append(badge, slider, presets);
    anchor.insertAdjacentElement('afterend', el);
    container = el;
    badgeRef = badge;
    sliderRef = slider;
    presetButtons = Array.from(presets.querySelectorAll('button'));

    if (video && video.playbackRate !== currentSpeed) video.playbackRate = currentSpeed;
    syncPresetStates();

    onRateChange = () => {
      if (!video) return;
      const rate = Number(video.playbackRate.toFixed(2));
      if (Math.abs(rate - currentSpeed) > 0.001) {
        currentSpeed = rate;
        if (badgeRef) badgeRef.textContent = formatSpeed(currentSpeed);
        if (sliderRef) sliderRef.value = String(currentSpeed);
        syncPresetStates();
        saveSpeed(currentSpeed);
      }
    };
    video?.addEventListener('ratechange', onRateChange);

    onKeydown = event => {
      const active = document.activeElement;
      if (active?.matches('input, textarea, [contenteditable="true"]')) return;
      if (event.key !== '>' && event.key !== '<') return;
      event.preventDefault();
      applySpeed(currentSpeed + (event.key === '>' ? KEY_STEP : -KEY_STEP));
    };
    document.addEventListener('keydown', onKeydown);

    try {
      if (chrome.runtime?.id) {
        chrome.storage.local.get({ playbackSpeed: DEFAULT_SPEED }, result => {
          const saved = Number(result.playbackSpeed);
          if (saved >= MIN_SPEED && saved <= MAX_SPEED) applySpeed(saved, false);
        });
      }
    } catch {}
  }

  function stopSpeed() {
    clearTimeout(initRetryTimer);
    clearTimeout(saveTimer);
    initRetryTimer = 0;
    saveTimer = 0;
    initRetryCount = 0;
    badgeRef = null;
    sliderRef = null;
    presetButtons = [];
    if (onKeydown) {
      document.removeEventListener('keydown', onKeydown);
      onKeydown = null;
    }
    if (onRateChange && video) {
      video.removeEventListener('ratechange', onRateChange);
      onRateChange = null;
    }
    document.querySelectorAll('[data-yt-supertool="speed"]').forEach(element => element.remove());
    container = null;
    video = null;
  }

  window.YTSuperTool = window.YTSuperTool || {};
  window.YTSuperTool.speed = { initSpeed, stopSpeed, cleanupSpeed: stopSpeed };
})();
