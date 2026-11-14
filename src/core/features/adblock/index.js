import baseCosmeticCss from './adblock-cosmetic.css?inline';
import { compileCosmeticCss } from './adblock-cosmetic.js';
import { COSMETIC_FILTERS } from './adblock-filters.js';
import { createAdblockGuard } from './adblock-guard.js';
import { createAdblockSkipper } from './adblock-skipper.js';
import { syncAdblockCache } from './adblock-state.js';

const cosmeticCss = `${baseCosmeticCss}\n${compileCosmeticCss(COSMETIC_FILTERS)}`;

const FLAGS = {
  master: 'ytstAdblock',
  prune: 'ytstAdblockPrune',
  cosmetic: 'ytstAdblockCosmetic'
};

export function createAdblock({ bridge, settings }) {
  let skipper = null;
  let guard = null;
  let cosmeticInjected = false;
  let started = false;

  const setFlag = (name, enabled) => {
    const root = document.documentElement;
    if (!root) return;
    root.dataset[name] = enabled ? 'on' : 'off';
  };

  const sync = () => {
    const master = Boolean(settings.get('adblock'));
    const prune = master && Boolean(settings.get('adblockPrune'));
    const cosmetic = master && Boolean(settings.get('adblockCosmetic'));
    const skip = master && Boolean(settings.get('adblockSkipper'));

    setFlag(FLAGS.master, master);
    setFlag(FLAGS.prune, prune);
    setFlag(FLAGS.cosmetic, cosmetic);

    syncAdblockCache(window, master, prune);
    bridge.setNetworkBlocking?.(master);
    try {
      document.dispatchEvent(new CustomEvent('ytst-adblock-change', { detail: { enabled: master } }));
    } catch {

    }

    if (cosmetic && !cosmeticInjected) {
      bridge.injector.injectStyle(cosmeticCss, 'ytst-adblock-cosmetic');
      cosmeticInjected = true;
    }

    if (skip) skipper?.start();
    else skipper?.stop();

    if (master) guard?.start();
    else guard?.stop();
  };

  settings.subscribe((key) => {
    if (!started) return;
    if (key === null || typeof key === 'string' && key.startsWith('adblock')) sync();
  });

  return {
    init() {
      started = true;
      if (!skipper) skipper = createAdblockSkipper();
      if (!guard) guard = createAdblockGuard();
      sync();
    },
    stop() {
      started = false;
      setFlag(FLAGS.master, false);
      setFlag(FLAGS.prune, false);
      setFlag(FLAGS.cosmetic, false);
      bridge.setNetworkBlocking?.(false);
      skipper?.stop();
      guard?.stop();
    },
    setVisible(visible) {
      if (!started) return;
      if (!visible) {
        skipper?.stop();
        guard?.stop();
        return;
      }
      sync();
    }
  };
}

export default createAdblock;
