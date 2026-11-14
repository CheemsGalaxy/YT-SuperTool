import { matchRequest } from '../core/features/adblock/adblock-matcher.js';

const ext = globalThis.browser || globalThis.chrome;
const FILTER = { urls: ['<all_urls>'] };
const EXTRA_INFO = ['blocking'];

let enabled = false;
let listener = null;

const readSetting = () => new Promise((resolve) => {
  try {
    const storage = ext?.storage?.local;
    if (!storage?.get) {
      resolve(false);
      return;
    }
    const result = storage.get({ adblock: false }, (value) => {
      if (ext.runtime?.lastError) {
        resolve(false);
        return;
      }
      resolve(value?.adblock === true);
    });
    if (result && typeof result.then === 'function') {
      result
        .then((value) => resolve(value?.adblock === true))
        .catch(() => resolve(false));
    }
  } catch {
    resolve(false);
  }
});

const onBeforeRequest = (details) => {
  if (!enabled) return {};
  try {
    return matchRequest(null, details.url) ? { cancel: true } : {};
  } catch {
    return {};
  }
};

const startBlocking = () => {
  if (listener || !ext?.webRequest?.onBeforeRequest) return;
  ext.webRequest.onBeforeRequest.addListener(onBeforeRequest, FILTER, EXTRA_INFO);
  listener = onBeforeRequest;
};

const stopBlocking = () => {
  if (!listener) return;
  try {
    ext.webRequest.onBeforeRequest.removeListener(listener);
  } catch {

  }
  listener = null;
};

export async function initAdblockBackground() {
  let manifestVersion = 3;
  try {
    manifestVersion = ext.runtime.getManifest().manifest_version;
  } catch {
    return false;
  }
  if (manifestVersion !== 2) return false;

  enabled = await readSetting();
  if (enabled) startBlocking();

  ext.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !('adblock' in changes)) return;
    enabled = changes.adblock.newValue === true;
    if (enabled) startBlocking();
    else stopBlocking();
  });

  return Boolean(listener);
}

export default initAdblockBackground;
