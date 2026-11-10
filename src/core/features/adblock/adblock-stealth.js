const allowInstreamAd = () => true;

const defineFlag = (win, name, value) => {
  const ObjectCtor = win?.Object || Object;
  try {
    ObjectCtor.defineProperty(ObjectCtor.prototype, name, {
      configurable: true,
      get: () => value,
      set: () => {}
    });
    return true;
  } catch {
    return false;
  }
};

const disableDetectionExperiments = (win) => {
  try {
    const config = win?.yt?.config_;
    if (!config) return false;

    const flags = config.EXPERIMENT_FLAGS;
    if (flags) {
      flags.web_enable_ab_rsp_cl = false;
      flags.ab_pl_man = false;
    }

    const popups = config.openPopupConfig?.supportedPopups;
    if (popups) popups.adBlockMessageViewModel = false;

    return true;
  } catch {
    return false;
  }
};

export function installAdblockStealth(win = globalThis) {
  if (!win || win.__ytstStealth) return false;

  defineFlag(win, 'adBlocksFound', false);
  defineFlag(win, 'hasAllowedInstreamAd', allowInstreamAd);

  const schedule = win.setInterval || win.setTimeout;
  const cancel = win.clearInterval || win.clearTimeout;

  if (typeof schedule === 'function') {
    let attempts = 0;
    const timer = schedule(() => {
      attempts += 1;
      if (disableDetectionExperiments(win) || attempts >= 40) {
        cancel?.(timer);
      }
    }, 250);
  }

  disableDetectionExperiments(win);
  win.__ytstStealth = true;
  return true;
}

export default installAdblockStealth;
