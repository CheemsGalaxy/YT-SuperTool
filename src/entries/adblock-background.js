import browser from 'webextension-polyfill';
import { WebExtensionBlocker } from '@ghostery/adblocker-webextension';
import { NETWORK_FILTERS } from '../core/features/adblock/adblock-filters.js';

const ENGINE_CONFIG = {
  loadNetworkFilters: true,
  loadCosmeticFilters: false,
  loadCSPFilters: false,
  loadExceptionFilters: true,
  enableCompression: true,
  enableHtmlFiltering: false,
  enableInMemoryCache: true,
  enableOptimizations: true,
  enablePushInjectionsOnNavigationEvents: false,
  guessRequestTypeFromUrl: true
};

let blocker = null;
let context = null;
let starting = false;
let enabled = true;

const getBlocker = () => {
  if (!blocker) {
    blocker = WebExtensionBlocker.parse(NETWORK_FILTERS.join('\n'), ENGINE_CONFIG);
  }
  return blocker;
};

const startBlocking = async () => {
  if (!enabled || context || starting) return;
  starting = true;
  let engine = null;
  try {
    engine = getBlocker();
    if (!enabled) return;
    context = engine.enableBlockingInBrowser(browser);
  } catch (error) {
    context = null;
    try {
      engine?.disableBlockingInBrowser(browser);
    } catch {

    }
    console.warn('YT SuperTool could not start network ad blocking:', error);
  } finally {
    starting = false;
  }
};

const stopBlocking = () => {
  if (!blocker || !context) return;
  try {
    blocker.disableBlockingInBrowser(browser);
  } catch {

  }
  context = null;
};

export async function initAdblockBackground() {
  let manifestVersion = 3;
  try {
    manifestVersion = browser.runtime.getManifest().manifest_version;
  } catch {
    return false;
  }
  if (manifestVersion !== 2) return false;

  try {
    const stored = await browser.storage.local.get('adblock');
    enabled = stored.adblock !== false;
  } catch {
    enabled = true;
  }

  if (enabled) await startBlocking();

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !('adblock' in changes)) return;
    enabled = changes.adblock.newValue !== false;
    if (enabled) void startBlocking();
    else stopBlocking();
  });

  return Boolean(context);
}

export default initAdblockBackground;
