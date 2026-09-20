(function () {
  const MIN_SPEED = 0.25;
  const MAX_SPEED = 10;
  const STEP = 0.05;
  const KEY_STEP = 0.25;
  const DEFAULT_SPEED = 1;
  const SAVE_DEBOUNCE = 200;
  const MAX_RETRY = 40;
  const PRESET_GROUPS = [
    [0.25, 0.5, 0.75],
    [1, 1.25, 1.5, 1.75],
    [2, 2.5, 3],
    [4, 5, 6, 7, 8, 9, 10]
  ];

  let currentSpeed = DEFAULT_SPEED;
  let container = null;
  let video = null;
  let onKeydown = null;
  let onRateChange = null;
  let initRetryTimer = 0;
  let initRetryCount = 0;
  let sliderRef = null;
  let chipRef = null;
  let dropdownEl = null;
  let miniSliderRef = null;
  let presetItems = [];
  let isDropdownOpen = false;
  let saveTimer = 0;
  let clickOutsideHandler = null;
  let escapeHandler = null;
  let positionHandler = null;

  const clampSpeed = v => Math.min(MAX_SPEED, Math.max(MIN_SPEED, Number(v) || DEFAULT_SPEED));
  const normalizeSpeed = v => Math.round(clampSpeed(v) / STEP) * STEP;
  const shortSpeed = v => `${Number(Number(v).toFixed(2))}x`;

  function saveSpeed(speed) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        if (chrome.runtime?.id) chrome.storage.local.set({ playbackSpeed: speed });
      } catch {}
    }, SAVE_DEBOUNCE);
  }

  function syncPresetStates() {
    for (const item of presetItems) {
      const presetValue = parseFloat(item.dataset.value);
      item.classList.toggle('is-active', Math.abs(presetValue - currentSpeed) < 0.001);
    }
  }

  function syncChipText() {
    if (!chipRef) return;
    chipRef.textContent = isDropdownOpen ? '✕' : `${shortSpeed(currentSpeed)} ▼`;
  }

  function applySpeed(value, persist = true) {
    const next = Number(normalizeSpeed(value).toFixed(2));
    if (next === currentSpeed) {
      if (persist) saveSpeed(currentSpeed);
      return;
    }
    currentSpeed = next;
    if (video && video.playbackRate !== currentSpeed) video.playbackRate = currentSpeed;
    if (sliderRef) {
      sliderRef.value = String(currentSpeed);
      sliderRef.title = shortSpeed(currentSpeed);
    }
    if (miniSliderRef) miniSliderRef.value = String(currentSpeed);
    syncChipText();
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

  function removeDropdownListeners() {
    if (clickOutsideHandler) {
      document.removeEventListener('click', clickOutsideHandler, true);
      document.removeEventListener('pointerdown', clickOutsideHandler, true);
      clickOutsideHandler = null;
    }
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler, true);
      escapeHandler = null;
    }
  }

  function removePositionListeners() {
    if (positionHandler) {
      window.removeEventListener('resize', positionHandler);
      window.removeEventListener('scroll', positionHandler, true);
      positionHandler = null;
    }
  }

  function closeDropdown() {
    if (!isDropdownOpen) return;
    isDropdownOpen = false;
    if (dropdownEl) {
      dropdownEl.style.display = 'none';
      dropdownEl.style.top = '';
      dropdownEl.style.left = '';
      dropdownEl.style.position = '';
      dropdownEl.style.zIndex = '';
      if (dropdownEl.parentElement === document.body && container) {
        container.appendChild(dropdownEl);
      }
    }
    if (chipRef) chipRef.classList.remove('is-open');
    syncChipText();
    removeDropdownListeners();
    removePositionListeners();
  }

  function openDropdown() {
    if (isDropdownOpen) return;
    isDropdownOpen = true;

    if (dropdownEl) {
      if (dropdownEl.parentElement !== document.body) {
        document.body.appendChild(dropdownEl);
      }
      dropdownEl.style.display = 'block';
      dropdownEl.style.position = 'fixed';
      dropdownEl.style.zIndex = '2147483647';
    }

    if (chipRef) chipRef.classList.add('is-open');
    syncChipText();

    const active = presetItems.find(item => item.classList.contains('is-active'));
    if (active && dropdownEl) {
      try { active.scrollIntoView({ block: 'nearest' }); } catch {}
    }

    clickOutsideHandler = event => {
      const path = event.composedPath?.() || [];
      if (path.includes(container) || path.includes(dropdownEl)) return;
      closeDropdown();
    };
    escapeHandler = event => {
      if (event.key === 'Escape') closeDropdown();
    };
    positionHandler = () => {
      if (!isDropdownOpen || !chipRef || !dropdownEl) return;
      const chipRect = chipRef.getBoundingClientRect();
      const ddRect = dropdownEl.getBoundingClientRect();
      const top = chipRect.top - ddRect.height - 8;
      const left = Math.max(8, chipRect.right - ddRect.width);
      dropdownEl.style.top = `${top}px`;
      dropdownEl.style.left = `${left}px`;
      dropdownEl.style.position = 'fixed';
      dropdownEl.style.zIndex = '2147483647';
    };

    positionHandler();
    window.addEventListener('resize', positionHandler, { passive: true });
    window.addEventListener('scroll', positionHandler, { passive: true, capture: true });
    document.addEventListener('click', clickOutsideHandler, true);
    document.addEventListener('pointerdown', clickOutsideHandler, true);
    document.addEventListener('keydown', escapeHandler, true);
  }

  function toggleDropdown() {
    if (isDropdownOpen) closeDropdown();
    else openDropdown();
  }

  function buildDropdown() {
    const dd = document.createElement('div');
    dd.className = 'yt-supertool-speed-dropdown';
    dd.style.display = 'none';
    dd.setAttribute('role', 'menu');

    PRESET_GROUPS.forEach((group, idx) => {
      group.forEach(value => {
        const item = document.createElement('div');
        item.className = 'yt-supertool-speed-preset';
        item.dataset.value = String(value);
        item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '0');

        const label = document.createElement('span');
        label.textContent = shortSpeed(value);

        const check = document.createElement('span');
        check.className = 'yt-supertool-speed-check';
        check.textContent = '✓';

        item.append(label, check);
        item.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          applySpeed(value);
          closeDropdown();
        });
        item.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            applySpeed(value);
            closeDropdown();
          }
        });
        dd.append(item);
      });

      if (idx < PRESET_GROUPS.length - 1) {
        const divider = document.createElement('div');
        divider.className = 'yt-supertool-speed-divider';
        dd.append(divider);
      }
    });

    const divider2 = document.createElement('div');
    divider2.className = 'yt-supertool-speed-divider';
    dd.append(divider2);

    const label = document.createElement('div');
    label.className = 'yt-supertool-speed-label';
    label.textContent = 'Custom';
    dd.append(label);

    const mini = document.createElement('input');
    mini.type = 'range';
    mini.className = 'yt-supertool-speed-mini-slider';
    mini.min = String(MIN_SPEED);
    mini.max = String(MAX_SPEED);
    mini.step = String(STEP);
    mini.value = String(currentSpeed);
    mini.addEventListener('input', event => applySpeed(event.target.value));
    mini.addEventListener('click', event => event.stopPropagation());
    mini.addEventListener('mousedown', event => event.stopPropagation());
    dd.append(mini);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'yt-supertool-speed-reset';
    reset.textContent = 'Reset 1x';
    reset.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      applySpeed(DEFAULT_SPEED);
      closeDropdown();
    });
    dd.append(reset);

    return { dd, mini };
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
      if (existing.parentElement !== anchor.parentElement) {
        anchor.insertAdjacentElement('afterend', existing);
      }
      container = existing;
      sliderRef = existing.querySelector('.yt-supertool-speed-slider');
      chipRef = existing.querySelector('.yt-supertool-speed-trigger');
      dropdownEl = document.querySelector('.yt-supertool-speed-dropdown');
      miniSliderRef = dropdownEl?.querySelector('.yt-supertool-speed-mini-slider') || null;
      presetItems = dropdownEl ? Array.from(dropdownEl.querySelectorAll('.yt-supertool-speed-preset')) : [];
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

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'yt-supertool-speed-trigger';
    chip.setAttribute('aria-label', 'Toggle speed presets');
    chip.setAttribute('aria-haspopup', 'true');
    chip.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      toggleDropdown();
    });

    const { dd, mini } = buildDropdown();
    el.append(slider, chip, dd);
    anchor.insertAdjacentElement('afterend', el);

    container = el;
    sliderRef = slider;
    chipRef = chip;
    dropdownEl = dd;
    miniSliderRef = mini;
    presetItems = Array.from(dd.querySelectorAll('.yt-supertool-speed-preset'));

    syncChipText();
    syncPresetStates();

    onRateChange = () => {
      if (!video) return;
      const rate = Number(video.playbackRate.toFixed(2));
      if (Math.abs(rate - currentSpeed) > 0.001) {
        currentSpeed = rate;
        if (sliderRef) sliderRef.value = String(currentSpeed);
        if (miniSliderRef) miniSliderRef.value = String(currentSpeed);
        syncChipText();
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
    closeDropdown();
    removeDropdownListeners();
    removePositionListeners();
    if (dropdownEl?.parentElement === document.body) dropdownEl.remove();
    sliderRef = null;
    chipRef = null;
    dropdownEl = null;
    miniSliderRef = null;
    presetItems = [];
    isDropdownOpen = false;
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