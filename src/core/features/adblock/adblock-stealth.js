import { isAdblockEnabled } from './adblock-state.js';

const AD_FLAGS = [
  'web_enable_ab_rsp_cl',
  'ab_pl_man',
  'adblock_detection',
  'adblock_detection_enabled',
  'enable_adblock_detection',
  'adblock_detection_message'
];

const patchFlags = (flags) => {
  if (!flags || typeof flags !== 'object') return false;
  let changed = false;
  AD_FLAGS.forEach((name) => {
    if (!(name in flags)) return;
    try {
      flags[name] = false;
      changed = true;
    } catch {

    }
  });
  return changed;
};

const patchConfig = (win) => {
  if (!isAdblockEnabled(win)) return false;
  let patched = false;

  const configs = [
    win?.yt?.config_,
    win?.ytplayer?.config,
    win?.ytcfg?.data_
  ];

  for (const config of configs) {
    if (!config || typeof config !== 'object') continue;
    if (patchFlags(config.EXPERIMENT_FLAGS)) patched = true;
    if (patchFlags(config.args)) patched = true;

    const popups = config.openPopupConfig?.supportedPopups;
    if (popups?.adBlockMessageViewModel) {
      try {
        popups.adBlockMessageViewModel = false;
        patched = true;
      } catch {

      }
    }
  }

  try {
    const ytcfg = win?.ytcfg;
    if (ytcfg && typeof ytcfg.get === 'function') {
      try {
        if (patchFlags(ytcfg.get('EXPERIMENT_FLAGS'))) patched = true;
      } catch {

      }
    }
  } catch {

  }

  return patched;
};

const installConfigHook = (win) => {
  const ytcfg = win?.ytcfg;
  if (!ytcfg || typeof ytcfg.set !== 'function' || ytcfg.set.__ytstAdblock) return null;
  const nativeSet = ytcfg.set;
  const patchedSet = function set(key, value) {
    if (key === 'EXPERIMENT_FLAGS' && isAdblockEnabled(win)) patchFlags(value);
    return nativeSet.call(this, key, value);
  };
  Object.defineProperty(patchedSet, '__ytstAdblock', { value: true });
  try {
    ytcfg.set = patchedSet;
    return nativeSet;
  } catch {
    return null;
  }
};

export function createAdblockStealth(win = globalThis) {
  let timer = 0;
  let observer = null;
  let started = false;
  let restoreSet = null;

  const stop = () => {
    if (!started) return false;
    started = false;
    if (timer) win.clearInterval?.(timer);
    timer = 0;
    observer?.disconnect();
    observer = null;
    if (restoreSet && win.ytcfg) {
      try {
        win.ytcfg.set = restoreSet;
      } catch {

      }
    }
    restoreSet = null;
    return true;
  };

  const start = () => {
    if (started || !win || !isAdblockEnabled(win)) return started;
    started = true;
    restoreSet = installConfigHook(win);

    let attempts = 0;
    const interval = win.setInterval || globalThis.setInterval;
    timer = interval.call(win, () => {
      attempts += 1;
      if (patchConfig(win) || attempts >= 40) {
        win.clearInterval?.(timer);
        timer = 0;
      }
    }, 250);

    try {
      const root = win.document?.documentElement;
      const Observer = win.MutationObserver;
      if (root && typeof Observer === 'function') {
        observer = new Observer(() => {
          if (!isAdblockEnabled(win)) {
            stop();
            return;
          }
          patchConfig(win);
        });
        observer.observe(root, { attributes: true, attributeFilter: ['data-ytst-adblock'] });
      }
    } catch {

    }

    patchConfig(win);
    return true;
  };

  return {
    start,
    stop,
    get started() {
      return started;
    }
  };
}

export function installAdblockStealth(win = globalThis) {
  if (!win) return null;
  if (win.__ytstStealth) return win.__ytstStealth;
  const controller = createAdblockStealth(win);
  win.__ytstStealth = controller;
  controller.start();
  return controller;
}

export function stopAdblockStealth(win = globalThis) {
  return win?.__ytstStealth?.stop?.() ?? false;
}

export default installAdblockStealth;
