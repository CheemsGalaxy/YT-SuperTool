import themeCss from './theme.css?inline';
import { createElement } from '../dom-safe.js';
import { createIcon, createBrandMark } from './icons.js';
import { createSponsorAccordion } from './sponsor-accordion.js';
import { FEATURE_GROUPS, featuresForGroup, STORAGE_KEYS } from '../settings-schema.js';

const detectDark = () => {
  const root = document.documentElement;
  if (!root) return true;
  const dark = root.getAttribute('dark');
  if (dark !== null && dark !== 'false') return true;
  if (root.getAttribute('light') !== null) return false;

  const background = getComputedStyle(document.body || root).backgroundColor || '';
  const channels = background.match(/\d+(?:\.\d+)?/g)?.map(Number);
  if (channels && channels.length >= 3) {
    const [r, g, b, alpha = 1] = channels;
    if (alpha === 0) return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
    return 0.299 * r + 0.587 * g + 0.114 * b < 140;
  }
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
};

export function createPanel({ settings, storage, toast, meta = {} }) {
  const rows = new Map();
  const tabs = new Map();
  const panels = new Map();
  const groupMeta = new Map();

  let host = null;
  let shadow = null;
  let overlay = null;
  let panelEl = null;
  let content = null;
  let statusText = null;
  let previousFocus = null;
  let statusTimer = 0;
  let open = false;
  let activeGroup = FEATURE_GROUPS[0].id;
  let sponsorAccordion = null;
  let themeSignature = '';

  const buildRow = (feature) => {
    const input = createElement('input', {
      type: 'checkbox',
      className: 'ytst-switch-input',
      id: `ytst-${feature.key}`,
      role: 'switch',
      'aria-describedby': `ytst-desc-${feature.key}`
    });
    input.dataset.key = feature.key;

    const metaCell = createElement('span', { className: 'ytst-row-meta' });
    if (feature.badge) {
      metaCell.appendChild(createElement('span', {
        className: 'ytst-badge-layer',
        textContent: feature.badge
      }));
    }

    const row = createElement('label', {
      className: 'ytst-row',
      for: `ytst-${feature.key}`
    }, [
      createElement('span', { className: 'ytst-row-icon' }, [createIcon(feature.icon, 20)]),
      createElement('span', { className: 'ytst-row-copy' }, [
        createElement('span', { className: 'ytst-row-label', textContent: feature.label }),
        createElement('span', {
          className: 'ytst-row-desc',
          id: `ytst-desc-${feature.key}`,
          textContent: feature.description
        })
      ]),
      metaCell,
      input,
      createElement('span', { className: 'ytst-switch', 'aria-hidden': 'true' }, [
        createElement('span', { className: 'ytst-switch-thumb' })
      ])
    ]);

    rows.set(feature.key, { row, input, feature });
    return row;
  };

  const buildSponsorAccordion = () => createSponsorAccordion({
    onChange: (value) => {
      void settings.set('sponsorblockCategories', JSON.stringify(value)).then((saved) => {
        if (saved === false) toast?.show('Could not save categories');
        else flashSaved();
      });
    },
    onNoticeChange: (checked) => {
      void settings.set('sponsorblockNotice', checked).then((saved) => {
        if (saved === false) toast?.show('Could not save that setting');
        else flashSaved();
      });
    }
  });

  const buildTab = (group) => {
    const features = featuresForGroup(group.id);
    const tab = createElement('button', {
      type: 'button',
      className: 'ytst-tab',
      role: 'tab',
      id: `ytst-tab-${group.id}`,
      'aria-controls': `ytst-panel-${group.id}`,
      'aria-selected': 'false',
      tabindex: '-1'
    }, [
      createIcon(group.icon, 16),
      createElement('span', { textContent: group.label }),
      createElement('span', { className: 'ytst-tab-count', textContent: String(features.length) })
    ]);

    tab.addEventListener('click', () => show(group.id));
    tabs.set(group.id, tab);
    return tab;
  };

  const buildGroupPanel = (group) => {
    const features = featuresForGroup(group.id);
    const activeMeta = createElement('span', { className: 'ytst-group-meta' });
    groupMeta.set(group.id, activeMeta);

    const wrapper = createElement('div', {
      className: 'ytst-tabpanel',
      id: `ytst-panel-${group.id}`,
      role: 'tabpanel',
      'aria-labelledby': `ytst-tab-${group.id}`
    }, [
      createElement('div', { className: 'ytst-group-head' }, [
        createElement('h2', { className: 'ytst-group-title', textContent: group.label }),
        activeMeta
      ])
    ]);

    const list = createElement('div', { className: 'ytst-group' });
    let layerHeadingShown = false;
    for (const feature of features) {
      if (feature.dependsOn && !layerHeadingShown) {
        layerHeadingShown = true;
        list.appendChild(createElement('div', { className: 'ytst-section', textContent: 'Defence layers' }));
      }
      list.appendChild(buildRow(feature));
      if (feature.key === 'sponsorblock') {
        sponsorAccordion = buildSponsorAccordion();
        list.appendChild(sponsorAccordion.element);
      }
    }
    wrapper.appendChild(list);

    panels.set(group.id, wrapper);
    return wrapper;
  };

  const show = (groupId) => {
    activeGroup = groupId;
    tabs.forEach((tab, id) => {
      tab.setAttribute('aria-selected', String(id === groupId));
      tab.tabIndex = id === groupId ? 0 : -1;
    });
    panels.forEach((node, id) => {
      node.hidden = id !== groupId;
    });
  };

  const flashSaved = () => {
    if (!statusText) return;
    statusText.textContent = 'Saved';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusText.textContent = 'Saved locally';
    }, 1500);
  };

  const syncValues = () => {
    rows.forEach(({ input, row, feature }) => {
      input.checked = Boolean(settings.get(feature.key));
      const blocked = Boolean(feature.dependsOn && !settings.get(feature.dependsOn));
      input.disabled = blocked;
      row.classList.toggle('is-disabled', blocked);
    });

    groupMeta.forEach((node, groupId) => {
      const features = featuresForGroup(groupId)
        .filter((feature) => !feature.dependsOn || settings.get(feature.dependsOn));
      const active = features.filter((feature) => settings.get(feature.key)).length;
      node.textContent = `${active}/${features.length}`;
    });

    sponsorAccordion?.setOpen(Boolean(settings.get('sponsorblock')));
    sponsorAccordion?.setCategories(settings.get('sponsorblockCategories'));
    sponsorAccordion?.setNotice(settings.get('sponsorblockNotice'));
  };

  const syncTheme = () => {
    if (!host) return;
    const root = document.documentElement;
    const signature = `${root?.getAttribute('dark')}|${root?.getAttribute('light')}|${globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches}`;
    if (signature === themeSignature) return;
    themeSignature = signature;
    host.dataset.theme = detectDark() ? 'dark' : 'light';
  };

  const findFocusable = () => [...(shadow?.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  ) || [])].filter((element) => element.offsetParent !== null);

  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePanel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = findFocusable();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const ensureMounted = () => {
    if (host?.isConnected) return;

    const rail = createElement('div', {
      className: 'ytst-rail',
      role: 'tablist',
      'aria-label': 'Setting groups',
      'aria-orientation': 'vertical'
    });
    FEATURE_GROUPS.forEach((group) => rail.appendChild(buildTab(group)));

    content = createElement('div', { className: 'ytst-content' });
    FEATURE_GROUPS.forEach((group) => content.appendChild(buildGroupPanel(group)));

    statusText = createElement('span', {
      className: 'ytst-status-text',
      textContent: 'Saved locally'
    });

    const resetButton = createElement('button', { type: 'button', className: 'ytst-button', textContent: 'Reset' });
    resetButton.addEventListener('click', () => {
      void settings.reset().then(() => {
        syncValues();
        flashSaved();
        toast?.show('Defaults restored');
      });
    });

    const doneButton = createElement('button', {
      type: 'button',
      className: 'ytst-button ytst-button-primary',
      textContent: 'Done'
    });
    doneButton.addEventListener('click', () => closePanel());

    panelEl = createElement('section', {
      className: 'ytst-panel',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'ytst-title',
      tabindex: '-1'
    }, [
      createElement('header', { className: 'ytst-header' }, [
        createElement('span', { className: 'ytst-brand', 'aria-hidden': 'true' }, [createBrandMark(16)]),
        createElement('div', { className: 'ytst-header-copy' }, [
          createElement('h1', { className: 'ytst-title', id: 'ytst-title', textContent: 'YT SuperTool' }),
          createElement('p', { className: 'ytst-subtitle', textContent: 'Player, feed and blocking controls' })
        ]),
        createElement('span', {
          className: 'ytst-badge',
          textContent: `v${meta.version || '2.3.0'} · ${String(meta.target || 'mv3').toUpperCase()}`
        }),
        createElement('div', { className: 'ytst-header-actions' }, [
          (() => {
            const close = createElement('button', {
              type: 'button',
              className: 'ytst-icon-button',
              'aria-label': 'Close settings',
              title: 'Close'
            }, [createIcon('close', 16)]);
            close.addEventListener('click', () => closePanel());
            return close;
          })()
        ])
      ]),
      createElement('div', { className: 'ytst-body' }, [rail, content]),
      createElement('footer', { className: 'ytst-footer' }, [
        createElement('span', { className: 'ytst-status', role: 'status', 'aria-live': 'polite' }, [
          createElement('span', { className: 'ytst-status-dot', 'aria-hidden': 'true' }),
          statusText
        ]),
        createElement('div', { className: 'ytst-footer-actions' }, [resetButton, doneButton])
      ])
    ]);

    content.addEventListener('change', (event) => {
      const input = event.target;
      if (!input?.classList?.contains('ytst-switch-input')) return;
      const key = input.dataset.key;
      if (!key) return;
      const next = Boolean(input.checked);
      input.checked = next;
      void settings.set(key, next).then((saved) => {
        if (saved === false) {
          toast?.show('Could not save that setting');
          return;
        }
        flashSaved();
      });
    });

    rail.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const ids = [...tabs.keys()];
      const index = ids.indexOf(activeGroup);
      const next = event.key === 'ArrowDown'
        ? ids[(index + 1) % ids.length]
        : ids[(index - 1 + ids.length) % ids.length];
      show(next);
      tabs.get(next)?.focus();
    });

    overlay = createElement('div', { className: 'ytst-overlay', 'data-open': 'false' }, [panelEl]);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closePanel();
    });
    overlay.addEventListener('keydown', onKeydown);

    host = createElement('div', { id: 'ytst-root', 'aria-hidden': 'true' });
    shadow = host.attachShadow({ mode: 'open' });
    shadow.appendChild(createElement('style', { textContent: themeCss }));
    shadow.appendChild(overlay);
    (document.body || document.documentElement).appendChild(host);

    settings.subscribe(() => syncValues());

    storage?.onChanged?.(() => {
      if (open) syncValues();
    }, STORAGE_KEYS);

    show(activeGroup);
    syncTheme();
    syncValues();
  };

  const openPanel = () => {
    ensureMounted();
    if (open) return;
    open = true;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    syncValues();
    syncTheme();
    overlay.dataset.open = 'true';
    host.setAttribute('aria-hidden', 'false');
    panelEl.focus({ preventScroll: true });
  };

  const closePanel = () => {
    if (!open) return;
    open = false;
    overlay.dataset.open = 'false';
    host.setAttribute('aria-hidden', 'true');
    if (previousFocus?.isConnected) {
      try {
        previousFocus.focus({ preventScroll: true });
      } catch {

      }
    }
  };

  const toggle = (force) => {
    const next = typeof force === 'boolean' ? force : !open;
    if (next) openPanel();
    else closePanel();
  };

  return {
    toggle,
    open: openPanel,
    close: closePanel,
    syncValues,
    syncTheme,
    get isOpen() {
      return open;
    }
  };
}

export default createPanel;
