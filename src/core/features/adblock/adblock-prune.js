import { isPlayerEndpoint, sanitizePlayerResponse } from './adblock-player.js';

const isPruningEnabled = (win) => {
  const root = win?.document?.documentElement;
  if (!root) return true;
  const data = root.dataset || {};
  if (data.ytstAdblock === 'off') return false;
  if (data.ytstAdblockPrune === 'off') return false;
  return true;
};

const prune = (win, value) => {
  if (!isPruningEnabled(win)) return value;
  return sanitizePlayerResponse(value);
};

const bindPlayerResponse = (win, name) => {
  let current;
  try {
    Object.defineProperty(win, name, {
      configurable: true,
      enumerable: true,
      get() {
        return current;
      },
      set(value) {
        current = prune(win, value);
      }
    });
    return true;
  } catch {
    return false;
  }
};

export function installAdblockPrune(win = globalThis) {
  if (!win || win.__ytstPruneInstalled) return false;

  try {
    const responseProto = win.Response?.prototype;
    if (responseProto && typeof responseProto.json === 'function') {
      const nativeJson = responseProto.json;
      responseProto.json = function json(...args) {
        const pending = nativeJson.apply(this, args);
        if (!isPlayerEndpoint(this.url)) return pending;
        return Promise.resolve(pending).then((value) => prune(win, value));
      };
    }

    bindPlayerResponse(win, 'ytInitialPlayerResponse');
    bindPlayerResponse(win, 'playerResponse');

    win.__ytstPruneInstalled = true;
    return true;
  } catch (error) {
    console.warn('YT SuperTool could not install the ad prune layer:', error);
    return false;
  }
}

export default installAdblockPrune;
