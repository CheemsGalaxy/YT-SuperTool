import { createBrandMark } from '../../core/ui/icons.js';
import { createSettingsTree } from '../../core/ui/settings-tree.js';
import { UI_STRINGS, UI_TEXT } from '../../core/ui/strings.js';
import {
  DEFAULTS,
  STORAGE_KEYS
} from '../../core/settings-schema.js';

const api = globalThis.browser || globalThis.chrome;
const store = api?.storage?.local;

const isPromiseStore = () => Boolean(globalThis.browser?.storage?.local) && globalThis.browser.storage.local === store;

const storageGet = (defaults) => {
  if (!store) return Promise.resolve(defaults);
  if (isPromiseStore()) return store.get(defaults);
  return new Promise((resolve, reject) => {
    store.get(defaults, (values) => {
      const error = api.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve(values);
    });
  });
};

const storageSet = (patch) => {
  if (!store) return Promise.resolve();
  if (isPromiseStore()) return store.set(patch);
  return new Promise((resolve, reject) => {
    store.set(patch, () => {
      const error = api.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
};

const statusNode = document.getElementById('popup-status');
const state = { ...DEFAULTS };
let statusTimer = 0;
let tree = null;

const setStatus = (message, revert = true) => {
  if (!statusNode) return;
  statusNode.textContent = message;
  clearTimeout(statusTimer);
  if (revert) {
    statusTimer = setTimeout(() => {
      statusNode.textContent = UI_STRINGS.savedLocally;
    }, 1500);
  }
};

const renderStatic = () => {
  document.title = UI_STRINGS.appName;
  const title = document.getElementById('popup-title');
  const tabList = document.getElementById('popup-tabs');
  const dislikeLink = document.getElementById('popup-dislike-link');
  if (title) title.textContent = UI_STRINGS.appName;
  if (tabList) tabList.setAttribute('aria-label', UI_STRINGS.settingGroups);
  if (dislikeLink) dislikeLink.textContent = UI_STRINGS.dislikeData;
  if (statusNode) statusNode.textContent = UI_STRINGS.savedLocally;
};

const syncValues = () => {
  tree?.sync(state);
};

const buildShell = () => {
  const tabList = document.getElementById('popup-tabs');
  const panelHost = document.getElementById('popup-panels');
  if (!tabList || !panelHost) return;

  tree = createSettingsTree({
    prefix: 'popup',
    orientation: 'horizontal',
    tabHost: tabList,
    panelHost,
    panelClass: 'popup-panel',
    rowClass: 'popup-row',
    switchInputClass: 'popup-switch-input',
    badgeClass: 'popup-layer',
    onChange: (key, value) => {
      const previous = Boolean(state[key]);
      state[key] = value;
      syncValues();
      storageSet({ [key]: value })
        .then(() => setStatus(UI_STRINGS.saved))
        .catch(() => {
          state[key] = previous;
          syncValues();
          setStatus(UI_STRINGS.saveError);
        });
    },
    onCategoriesChange: (value) => {
      const saved = JSON.stringify(value);
      storageSet({ sponsorblockCategories: saved })
        .then(() => {
          state.sponsorblockCategories = saved;
          setStatus(UI_STRINGS.saved);
        })
        .catch(() => setStatus(UI_STRINGS.saveCategoriesError));
    },
    onNoticeChange: (value) => {
      storageSet({ sponsorblockNotice: value })
        .then(() => {
          state.sponsorblockNotice = value;
          setStatus(UI_STRINGS.saved);
        })
        .catch(() => setStatus(UI_STRINGS.saveNoticeError));
    },
    onProgressChange: (value) => {
      storageSet({ sponsorblockProgressBar: value })
        .then(() => {
          state.sponsorblockProgressBar = value;
          setStatus(UI_STRINGS.saved);
        })
        .catch(() => setStatus(UI_STRINGS.saveSettingFailed));
    }
  });

  syncValues();
};

const renderBrand = () => {
  const brand = document.getElementById('popup-brand');
  if (brand) brand.appendChild(createBrandMark(16));
};

const renderMeta = () => {
  const version = api?.runtime?.getManifest?.().version || '2.4.3';
  const manifestVersion = api?.runtime?.getManifest?.().manifest_version || 3;
  const versionNode = document.getElementById('popup-version');
  const targetNode = document.getElementById('popup-target');
  if (versionNode) versionNode.textContent = UI_TEXT.versionSettings(version);
  if (targetNode) targetNode.textContent = UI_TEXT.manifestTarget(manifestVersion);
};

const subscribeToStorage = () => {
  const onChanged = api?.storage?.onChanged;
  if (!onChanged?.addListener) return;
  onChanged.addListener((changes, areaName) => {
    if (areaName && areaName !== 'local') return;

    let touched = false;
    for (const key of STORAGE_KEYS) {
      if (!(key in changes)) continue;
      const next = changes[key]?.newValue;
      state[key] = next === undefined || next === null ? DEFAULTS[key] : next;
      touched = true;
    }
    if (touched) syncValues();
  });
};

const start = async () => {
  renderStatic();
  renderBrand();
  renderMeta();
  buildShell();
  subscribeToStorage();

  const defaults = { ...DEFAULTS };
  try {
    const values = await storageGet(defaults);
    for (const key of STORAGE_KEYS) {
      const value = values?.[key];
      state[key] = value === undefined || value === null ? DEFAULTS[key] : value;
    }
    syncValues();
    setStatus(UI_STRINGS.savedLocally, false);
  } catch (error) {
    console.error('YT SuperTool could not load popup settings:', error);
    setStatus(UI_STRINGS.loadError, false);
    syncValues();
  }
};

start();
