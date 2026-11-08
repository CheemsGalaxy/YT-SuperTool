import { createIcon } from '../ui/icons.js';

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

const clampSpeed = (value) => Math.min(MAX_SPEED, Math.max(MIN_SPEED, Number(value) || DEFAULT_SPEED));
const normalizeSpeed = (value) => Math.round(clampSpeed(value) / STEP) * STEP;
const shortSpeed = (value) => `${Number(Number(value).toFixed(2))}x`;

export function createSpeed({ bridge }) {
  let enabled = false;
  let currentSpeed = DEFAULT_SPEED;
  let container = null;
  let video = null;
  let sliderRef = null;
  let chipRef = null;
  let chipValue = null;
  let menuEl = null;
  let miniRef = null;
  let presetItems = [];
  let onKeydown = null;
  let onRateChange = null;
  let retryTimer = 0;
  let retryCount = 0;
  let saveTimer = 0;
  let isOpen = false;
  let clickOutsideHandler = null;
  let escapeHandler = null;
  let positionHandler = null;
  let loadToken = 0;

  function saveSpeed(speed) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      bridge.storage.set('playbackSpeed', speed)
        .catch((error) => console.error('YT SuperTool could not save playback speed:', error));
    }, SAVE_DEBOUNCE);
  }

  function syncPresetStates() {
    for (const item of presetItems) {
      const value = Number(item.dataset.value);
      item.classList.toggle('is-active', Math.abs(value - currentSpeed) < 0.001);
      item.setAttribute('aria-checked', String(Math.abs(value - currentSpeed) < 0.001));
    }
  }

  function syncChipText() {
    if (chipValue) chipValue.textContent = shortSpeed(currentSpeed);
    if (chipRef) chipRef.classList.toggle('is-open', isOpen);
  }

  function applySpeed(value, persist = true) {
    const next = Number(normalizeSpeed(value).toFixed(2));
    if (next !== currentSpeed) {
      currentSpeed = next;
      if (video && video.playbackRate !== currentSpeed) video.playbackRate = currentSpeed;
      if (sliderRef) {
        sliderRef.value = String(currentSpeed);
        sliderRef.title = shortSpeed(currentSpeed);
      }
      if (miniRef) miniRef.value = String(currentSpeed);
    }
    syncChipText();
    syncPresetStates();
    if (persist) saveSpeed(currentSpeed);
  }

  function findAnchor(player) {
    return player?.querySelector('.ytp-left-controls .ytp-time-display') || null;
  }

  function setVideo(player) {
    video = player.querySelector('video') || document.querySelector('.html5-video-player video');
    if (video && video.playbackRate !== currentSpeed) video.playbackRate = currentSpeed;
  }

  function removeMenuListeners() {
    if (clickOutsideHandler) {
      document.removeEventListener('click', clickOutsideHandler, true);
      document.removeEventListener('pointerdown', clickOutsideHandler, true);
      clickOutsideHandler = null;
    }
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler, true);
      escapeHandler = null;
    }
    if (positionHandler) {
      window.removeEventListener('resize', positionHandler);
      window.removeEventListener('scroll', positionHandler, true);
      positionHandler = null;
    }
  }

  function positionMenu() {
    if (!chipRef || !menuEl) return;
    const chipRect = chipRef.getBoundingClientRect();
    const menuRect = menuEl.getBoundingClientRect();
    const top = Math.max(8, chipRect.top - menuRect.height - 8);
    const left = Math.max(8, Math.min(chipRect.right - menuRect.width, window.innerWidth - menuRect.width - 8));
    menuEl.style.top = `${top}px`;
    menuEl.style.left = `${left}px`;
  }

  function closeMenu() {
    if (!isOpen) return;
    isOpen = false;
    if (menuEl) menuEl.style.display = 'none';
    syncChipText();
    removeMenuListeners();
  }

  function openMenu() {
    if (!isOpen || !menuEl) {
      isOpen = true;
      if (menuEl) menuEl.style.display = 'block';
      syncChipText();
      positionMenu();

      clickOutsideHandler = (event) => {
        const path = event.composedPath?.() || [];
        if (path.includes(container) || path.includes(menuEl)) return;
        closeMenu();
      };
      escapeHandler = (event) => {
        if (event.key === 'Escape') closeMenu();
      };
      positionHandler = () => positionMenu();

      document.addEventListener('click', clickOutsideHandler, true);
      document.addEventListener('pointerdown', clickOutsideHandler, true);
      document.addEventListener('keydown', escapeHandler, true);
      window.addEventListener('resize', positionHandler, { passive: true });
      window.addEventListener('scroll', positionHandler, { passive: true, capture: true });
    } else {
      closeMenu();
    }
  }

  function buildMenu() {
    const menu = document.createElement('div');
    menu.className = 'ytst-speed-menu';
    menu.setAttribute('role', 'menu');

    PRESET_GROUPS.forEach((group, index) => {
      group.forEach((value) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'ytst-speed-preset';
        item.dataset.value = String(value);
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('aria-label', `${shortSpeed(value)} speed`);

        const label = document.createElement('span');
        label.textContent = shortSpeed(value);
        const check = createIcon('check', 16);
        check.classList.add('ytst-speed-preset-check');
        item.append(label, check);

        item.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          applySpeed(value);
          closeMenu();
        });
        menu.appendChild(item);
      });

      if (index < PRESET_GROUPS.length - 1) {
        const divider = document.createElement('div');
        divider.className = 'ytst-speed-divider';
        menu.appendChild(divider);
      }
    });

    const divider = document.createElement('div');
    divider.className = 'ytst-speed-divider';
    menu.appendChild(divider);

    const caption = document.createElement('div');
    caption.className = 'ytst-speed-caption';
    caption.textContent = 'Custom';
    menu.appendChild(caption);

    const mini = document.createElement('input');
    mini.type = 'range';
    mini.className = 'ytst-speed-mini';
    mini.min = String(MIN_SPEED);
    mini.max = String(MAX_SPEED);
    mini.step = String(STEP);
    mini.value = String(currentSpeed);
    mini.setAttribute('aria-label', 'Custom playback speed');
    mini.addEventListener('input', (event) => applySpeed(event.target.value));
    mini.addEventListener('click', (event) => event.stopPropagation());
    menu.appendChild(mini);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'ytst-speed-reset';
    reset.textContent = 'Reset to 1x';
    reset.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      applySpeed(DEFAULT_SPEED);
      closeMenu();
    });
    menu.appendChild(reset);

    return { menu, mini };
  }

  function retry(player) {
    if (!enabled || retryCount >= MAX_RETRY) return;
    retryCount += 1;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => this.init(player), 250);
  }

  function buildContainer() {
    const element = document.createElement('div');
    element.className = 'ytst-speed';
    element.title = 'Playback speed';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'ytst-speed-slider';
    slider.min = String(MIN_SPEED);
    slider.max = String(MAX_SPEED);
    slider.step = String(STEP);
    slider.value = String(currentSpeed);
    slider.setAttribute('aria-label', 'Playback speed');
    slider.addEventListener('input', (event) => applySpeed(event.target.value));
    slider.addEventListener('dblclick', (event) => {
      event.preventDefault();
      applySpeed(DEFAULT_SPEED);
    });

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'ytst-speed-chip';
    chip.setAttribute('aria-label', 'Playback speed presets');
    chip.setAttribute('aria-haspopup', 'true');
    const value = document.createElement('span');
    value.className = 'ytst-speed-value';
    value.textContent = shortSpeed(currentSpeed);
    const chevron = createIcon('chevron', 16);
    chevron.classList.add('ytst-speed-chevron');
    chip.append(value, chevron);
    chip.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMenu();
    });

    element.append(slider, chip);
    return { element, slider, chip, value };
  }

  const api = {
    init(player) {
      enabled = true;
      if (!player) return;
      const anchor = findAnchor(player);
      if (!anchor) {
        retry(player);
        return;
      }
      retryCount = 0;
      setVideo(player);

      if (!menuEl) {
        const { menu, mini } = buildMenu();
        menuEl = menu;
        miniRef = mini;
        (document.body || document.documentElement).appendChild(menu);
        menuEl.style.display = 'none';
        presetItems = [...menu.querySelectorAll('.ytst-speed-preset')];
      }

      let existing = document.querySelector('.ytst-speed');
      if (existing) {
        if (existing.parentElement !== anchor.parentElement) {
          anchor.insertAdjacentElement('afterend', existing);
        }
        container = existing;
        sliderRef = existing.querySelector('.ytst-speed-slider');
        chipRef = existing.querySelector('.ytst-speed-chip');
        chipValue = existing.querySelector('.ytst-speed-value');
        applySpeed(currentSpeed, false);
        return;
      }

      const { element, slider, chip, value } = buildContainer();
      anchor.insertAdjacentElement('afterend', element);
      container = element;
      sliderRef = slider;
      chipRef = chip;
      chipValue = value;

      syncChipText();
      syncPresetStates();

      if (onRateChange && video) video.removeEventListener('ratechange', onRateChange);
      onRateChange = () => {
        if (!video) return;
        const rate = Number(video.playbackRate.toFixed(2));
        if (Math.abs(rate - currentSpeed) > 0.001) {
          currentSpeed = rate;
          if (sliderRef) sliderRef.value = String(rate);
          if (miniRef) miniRef.value = String(rate);
          syncChipText();
          syncPresetStates();
          saveSpeed(rate);
        }
      };
      video?.addEventListener('ratechange', onRateChange);

      if (onKeydown) document.removeEventListener('keydown', onKeydown);
      onKeydown = (event) => {
        const active = document.activeElement;
        if (active?.matches('input, textarea, [contenteditable="true"]')) return;
        if (event.key !== '>' && event.key !== '<') return;
        event.preventDefault();
        applySpeed(currentSpeed + (event.key === '>' ? KEY_STEP : -KEY_STEP));
      };
      document.addEventListener('keydown', onKeydown);

      const token = ++loadToken;
      bridge.storage.get('playbackSpeed', DEFAULT_SPEED)
        .then((savedValue) => {
          if (!enabled || token !== loadToken) return;
          const saved = Number(savedValue);
          if (saved >= MIN_SPEED && saved <= MAX_SPEED) applySpeed(saved, false);
        })
        .catch((error) => console.error('YT SuperTool could not load playback speed:', error));
    },
    stop() {
      enabled = false;
      loadToken += 1;
      clearTimeout(retryTimer);
      clearTimeout(saveTimer);
      retryTimer = 0;
      saveTimer = 0;
      retryCount = 0;
      closeMenu();
      removeMenuListeners();
      if (onKeydown) {
        document.removeEventListener('keydown', onKeydown);
        onKeydown = null;
      }
      if (onRateChange && video) {
        video.removeEventListener('ratechange', onRateChange);
        onRateChange = null;
      }
      menuEl?.remove();
      menuEl = null;
      miniRef = null;
      presetItems = [];
      document.querySelectorAll('.ytst-speed').forEach((element) => element.remove());
      container = null;
      sliderRef = null;
      chipRef = null;
      chipValue = null;
      video = null;
      isOpen = false;
    }
  };

  return api;
}

export default createSpeed;
