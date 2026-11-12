import { isAdblockEnabled } from './adblock-state.js';

const AD_FLAGS = [
  'web_enable_ab_rsp_cl',
  'ab_pl_man',
  'adblock_detection',
  'adblock_detection_enabled',
  'enable_adblock_detection',
  'adblock_detection_message'
];

const allowInstreamAd = () => true;

const defineFlag = (target, name, value) => {
  if (!target) return false;
  try {
    Object.defineProperty(target, name, {
      configurable: true,
      get: () => value,
      set: () => {}
    });
    return true;
  } catch {
    return false;
  }
};

const patchFlags = (flags) => {
  if (!flags || typeof flags !== 'object') return false;
  let changed = false;
  AD_FLAGS.forEach((name) => {
    if (name in flags) {
      flags[name] = false;
      changed = true;
    }
  });
  return changed;
};

const disableDetectionExperiments = (win) => {
  if (!isAdblockEnabled(win)) return false;
  let patched = false;
  try {
    const config = win?.yt?.config_;
    const flags = config?.EXPERIMENT_FLAGS;
    if (patchFlags(flags)) patched = true;

    const popups = config?.openPopupConfig?.supportedPopups;
    if (popups?.adBlockMessageViewModel) {
      popups.adBlockMessageViewModel = false;
      patched = true;
    }
  } catch {

  }

  try {
    const ytcfg = win?.ytcfg;
    if (!ytcfg) return patched;

    if (typeof ytcfg.get === 'function') {
      try {
        if (patchFlags(ytcfg.get('EXPERIMENT_FLAGS'))) patched = true;
      } catch {

      }
    }

    if (typeof ytcfg.set === 'function' && !ytcfg.set.__ytstAdblock) {
      const nativeSet = ytcfg.set;
      const patchedSet = function set(key, value) {
        if (key === 'EXPERIMENT_FLAGS' && isAdblockEnabled(win)) patchFlags(value);
        return nativeSet.call(this, key, value);
      };
      Object.defineProperty(patchedSet, '__ytstAdblock', { value: true });
      try {
        ytcfg.set = patchedSet;
        patched = true;
      } catch {

      }
    }
  } catch {

  }

  return patched;
};

export function installAdblockStealth(win = globalThis) {
  if (!win || win.__ytstStealth) return false;

  const ObjectCtor = win.Object || Object;
  defineFlag(ObjectCtor.prototype, 'adBlocksFound', false);
  defineFlag(ObjectCtor.prototype, 'hasAllowedInstreamAd', allowInstreamAd);
  defineFlag(win, 'adBlocksFound', false);
  defineFlag(win, 'hasAllowedInstreamAd', allowInstreamAd);

  const useInterval = typeof win.setInterval === 'function';
  const schedule = useInterval ? win.setInterval : win.setTimeout;
  const cancel = useInterval ? win.clearInterval : win.clearTimeout;

  if (typeof schedule === 'function') {
    let attempts = 0;
    const timer = schedule.call(win, () => {
      attempts += 1;
      if (disableDetectionExperiments(win) || attempts >= 40) {
        cancel.call(win, timer);
      }
    }, 250);
  }

  try {
    const root = win.document?.documentElement;
    const Observer = win.MutationObserver;
    if (root && typeof Observer === 'function') {
      const observer = new Observer(() => {
        if (isAdblockEnabled(win)) disableDetectionExperiments(win);
      });
      observer.observe(root, { attributes: true, attributeFilter: ['data-ytst-adblock'] });
    }
  } catch {

  }

  disableDetectionExperiments(win);
  win.__ytstStealth = true;
  return true;
}

export default installAdblockStealth;
