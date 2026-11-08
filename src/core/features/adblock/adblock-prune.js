import { sanitizePlayerResponse } from './adblock-player.js';

export const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];

const MAX_DEPTH = 8;
const MAX_NODES = 20000;

const isPruningEnabled = (win) => {
  const root = win?.document?.documentElement;
  if (!root) return true;
  const data = root.dataset || {};
  if (data.ytstAdblock === 'off') return false;
  if (data.ytstAdblockPrune === 'off') return false;
  return true;
};

const shouldScan = (text) => typeof text === 'string' && AD_KEYS.some((key) => text.includes(key));

const pruneNode = (value, depth, counter) => {
  if (!value || typeof value !== 'object') return value;
  if (depth > MAX_DEPTH || counter.count > MAX_NODES) return value;
  counter.count += 1;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      pruneNode(value[index], depth + 1, counter);
    }
    return value;
  }

  for (const key of AD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      try {
        delete value[key];
      } catch {
        value[key] = undefined;
      }
    }
  }

  for (const key of Object.keys(value)) {
    pruneNode(value[key], depth + 1, counter);
  }
  return value;
};

const prune = (win, value) => {
  if (!isPruningEnabled(win)) return value;
  pruneNode(value, 0, { count: 0 });
  return sanitizePlayerResponse(value);
};

export function installAdblockPrune(win = globalThis) {
  if (!win || win.__ytstPruneInstalled) return false;

  try {
    const nativeParse = win.JSON?.parse;
    if (nativeParse) {
      win.JSON.parse = function parse(text, reviver) {
        const result = nativeParse.call(this, text, reviver);
        if (!shouldScan(text)) return result;
        return prune(win, result);
      };
    }

    const responseProto = win.Response?.prototype;
    if (responseProto && typeof responseProto.json === 'function') {
      const nativeJson = responseProto.json;
      responseProto.json = function json(...args) {
        return Promise.resolve(nativeJson.apply(this, args)).then((value) => prune(win, value));
      };
    }

    let initial;
    Object.defineProperty(win, 'ytInitialPlayerResponse', {
      configurable: true,
      enumerable: true,
      get() {
        return initial;
      },
      set(value) {
        initial = prune(win, value);
      }
    });

    win.__ytstPruneInstalled = true;
    return true;
  } catch (error) {

    console.warn('YT SuperTool could not install the ad prune layer:', error);
    return false;
  }
}

export default installAdblockPrune;
