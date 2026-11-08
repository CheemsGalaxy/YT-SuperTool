import baseCosmeticCss from './adblock-cosmetic.css?inline';
import { compileCosmeticCss } from './adblock-cosmetic.js';
import { COSMETIC_FILTERS } from './adblock-filters.js';
import { createAdblockSkipper } from './adblock-skipper.js';

const cosmeticCss = `${baseCosmeticCss}\n${compileCosmeticCss(COSMETIC_FILTERS)}`;

const FLAGS = {
  master: 'ytstAdblock',
  prune: 'ytstAdblockPrune',
  cosmetic: 'ytstAdblockCosmetic'
};

export function createAdblock({ bridge, settings }) {
  let skipper = null;
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

    bridge.setNetworkBlocking?.(master);

    if (cosmetic && !cosmeticInjected) {
      bridge.injector.injectStyle(cosmeticCss, 'ytst-adblock-cosmetic');
      cosmeticInjected = true;
    }

    if (skip) skipper?.start();
    else skipper?.stop();
  };

  settings.subscribe((key) => {
    if (!started) return;
    if (key === null || typeof key === 'string' && key.startsWith('adblock')) sync();
  });

  return {
    init() {
      started = true;
      if (!skipper) skipper = createAdblockSkipper();
      sync();
    },
    update() {

    },
    stop() {
      started = false;
      setFlag(FLAGS.master, false);
      setFlag(FLAGS.prune, false);
      setFlag(FLAGS.cosmetic, false);
      skipper?.stop();
    }
  };
}

export default createAdblock;
