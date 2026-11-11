import { createElement } from '../../core/dom-safe.js';
import { createIcon, createBrandMark } from '../../core/ui/icons.js';
import { createSponsorAccordion } from '../../core/ui/sponsor-accordion.js';
import { UI_STRINGS, UI_TEXT } from '../../core/ui/strings.js';
import {
  FEATURE_GROUPS,
  FEATURES,
  featuresForGroup,
  DEFAULTS
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
let statusTimer = 0;

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

const rows = new Map();
const groupMeta = new Map();
const tabs = new Map();
const panels = new Map();
let sponsorAccordion = null;
let activeGroup = FEATURE_GROUPS[0].id;

const buildRow = (feature) => {
  const input = createElement('input', {
    type: 'checkbox',
    className: 'popup-switch-input',
    id: `popup-${feature.key}`,
    role: 'switch'
  });
  input.dataset.key = feature.key;

  const metaCell = createElement('span', { className: 'popup-row-meta' });
  if (feature.badge) {
    metaCell.appendChild(createElement('span', {
      className: 'popup-layer',
      textContent: feature.badge
    }));
  }

  const row = createElement('label', {
    className: 'popup-row',
    for: `popup-${feature.key}`
  }, [
    createElement('span', { className: 'popup-row-icon' }, [createIcon(feature.icon, 20)]),
    createElement('span', { className: 'popup-row-copy' }, [
      createElement('span', { className: 'popup-row-label', textContent: feature.label }),
      createElement('span', { className: 'popup-row-desc', textContent: feature.description })
    ]),
    metaCell,
    input,
    createElement('span', { className: 'popup-switch', 'aria-hidden': 'true' }, [
      createElement('span', { className: 'popup-switch-thumb' })
    ])
  ]);

  rows.set(feature.key, { row, input, feature });
  return row;
};

const buildSponsorAccordion = () => {
  const accordion = createSponsorAccordion({
    onChange: (value) => {
      storageSet({ sponsorblockCategories: JSON.stringify(value) })
        .then(() => setStatus(UI_STRINGS.saved))
        .catch(() => setStatus(UI_STRINGS.saveCategoriesError));
    },
    onNoticeChange: (checked) => {
      storageSet({ sponsorblockNotice: checked })
        .then(() => setStatus(UI_STRINGS.saved))
        .catch(() => setStatus(UI_STRINGS.saveNoticeError));
    }
  });
  return { element: accordion.element, accordion };
};

const buildShell = () => {
  const tabList = document.getElementById('popup-tabs');
  const panelHost = document.getElementById('popup-panels');
  if (!tabList || !panelHost) return;

  FEATURE_GROUPS.forEach((group) => {
    const tab = createElement('button', {
      type: 'button',
      className: 'popup-tab',
      role: 'tab',
      id: `popup-tab-${group.id}`,
      'aria-controls': `popup-panel-${group.id}`,
      'aria-selected': 'false',
      tabindex: '-1'
    }, [
      createIcon(group.icon, 16),
      createElement('span', { textContent: group.label })
    ]);
    tab.addEventListener('click', () => showGroup(group.id));
    tabs.set(group.id, tab);
    tabList.appendChild(tab);

    const metaNode = createElement('span', { className: 'popup-group-meta' });
    groupMeta.set(group.id, metaNode);

    const panel = createElement('div', {
      className: 'popup-panel',
      id: `popup-panel-${group.id}`,
      role: 'tabpanel',
      'aria-labelledby': `popup-tab-${group.id}`
    }, [
      createElement('div', { className: 'popup-group-head' }, [
        createElement('h2', { className: 'popup-group-title', textContent: group.label }),
        metaNode
      ])
    ]);

    let headingShown = false;
    for (const feature of featuresForGroup(group.id)) {
      if (feature.dependsOn && !headingShown) {
        headingShown = true;
        panel.appendChild(createElement('div', { className: 'popup-section', textContent: UI_STRINGS.defenceLayers }));
      }
      panel.appendChild(buildRow(feature));
      if (feature.key === 'sponsorblock') {
        const built = buildSponsorAccordion();
        sponsorAccordion = built.accordion;
        panel.appendChild(built.element);
      }
    }


    panels.set(group.id, panel);
    panelHost.appendChild(panel);
  });

  tabList.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const ids = [...tabs.keys()];
    const index = ids.indexOf(activeGroup);
    const next = event.key === 'ArrowRight'
      ? ids[(index + 1) % ids.length]
      : ids[(index - 1 + ids.length) % ids.length];
    showGroup(next);
    tabs.get(next)?.focus();
  });

  panelHost.addEventListener('change', (event) => {
    const input = event.target;
    if (!input?.classList?.contains('popup-switch-input')) return;
    const key = input.dataset.key;
    if (!key) return;

    const previous = Boolean(state[key]);
    state[key] = Boolean(input.checked);
    syncValues();

    storageSet({ [key]: state[key] })
      .then(() => setStatus(UI_STRINGS.saved))
      .catch(() => {
        state[key] = previous;
        syncValues();
        setStatus(UI_STRINGS.saveError);
      });
  });

  showGroup(activeGroup);
};

const showGroup = (groupId) => {
  activeGroup = groupId;
  tabs.forEach((tab, id) => {
    tab.setAttribute('aria-selected', String(id === groupId));
    tab.tabIndex = id === groupId ? 0 : -1;
  });
  panels.forEach((panel, id) => {
    panel.hidden = id !== groupId;
  });
};

const state = { ...DEFAULTS };

const syncValues = () => {
  rows.forEach(({ input, row, feature }) => {
    input.checked = Boolean(state[feature.key]);
    const blocked = Boolean(feature.dependsOn && !state[feature.dependsOn]);
    input.disabled = blocked;
    row.classList.toggle('is-disabled', blocked);
  });

  groupMeta.forEach((node, groupId) => {
    const features = featuresForGroup(groupId)
      .filter((feature) => !feature.dependsOn || state[feature.dependsOn]);
    const active = features.filter((feature) => state[feature.key]).length;
    node.textContent = `${active}/${features.length}`;
  });

  sponsorAccordion?.setOpen(Boolean(state.sponsorblock));
};

const renderBrand = () => {
  const brand = document.getElementById('popup-brand');
  if (brand) brand.appendChild(createBrandMark(16));
};

const renderMeta = () => {
  const version = api?.runtime?.getManifest?.().version || '2.3.1';
  const manifestVersion = api?.runtime?.getManifest?.().manifest_version || 3;
  const versionNode = document.getElementById('popup-version');
  const targetNode = document.getElementById('popup-target');
  if (versionNode) versionNode.textContent = UI_TEXT.versionSettings(version);
  if (targetNode) targetNode.textContent = UI_TEXT.manifestTarget(manifestVersion);
};

const applySponsorCategories = (saved) => {
  sponsorAccordion?.setCategories(saved);
};

const hydrateSponsor = (values) => {
  if (!sponsorAccordion) return;
  sponsorAccordion.setCategories(values.sponsorblockCategories);
  sponsorAccordion.setNotice(values.sponsorblockNotice);
};

const subscribeToStorage = () => {
  const onChanged = api?.storage?.onChanged;
  if (!onChanged?.addListener) return;
  onChanged.addListener((changes, areaName) => {
    if (areaName && areaName !== 'local') return;

    let touched = false;
    FEATURES.forEach((feature) => {
      if (!(feature.key in changes)) return;
      const next = changes[feature.key]?.newValue;
      state[feature.key] = next === undefined || next === null ? DEFAULTS[feature.key] : Boolean(next);
      touched = true;
    });
    if (touched) syncValues();

    if (!sponsorAccordion) return;
    if ('sponsorblockCategories' in changes) {
      applySponsorCategories(changes.sponsorblockCategories?.newValue);
    }
    if ('sponsorblockNotice' in changes) {
      sponsorAccordion.setNotice(changes.sponsorblockNotice?.newValue);
    }
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
    FEATURES.forEach((feature) => {
      state[feature.key] = Boolean(values[feature.key]);
    });
    hydrateSponsor(values);
    syncValues();
    setStatus(UI_STRINGS.savedLocally, false);
  } catch (error) {
    console.error('YT SuperTool could not load popup settings:', error);
    setStatus(UI_STRINGS.loadError, false);
    syncValues();
  }
};

start();
