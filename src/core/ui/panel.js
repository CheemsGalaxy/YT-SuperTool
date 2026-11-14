import themeCss from './theme.css?inline';
import { createElement } from '../dom-safe.js';
import { createIcon, createBrandMark } from './icons.js';
import { createSettingsTree } from './settings-tree.js';
import { UI_STRINGS, UI_TEXT } from './strings.js';
import { STORAGE_KEYS } from '../settings-schema.js';

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

export function createPanel({ settings, storage, toast, update, meta = {} }) {
  let host = null;
  let shadow = null;
  let overlay = null;
  let panelEl = null;
  let tree = null;
  let statusText = null;
  let previousFocus = null;
  let statusTimer = 0;
  let unsubscribeSettings = null;
  let unsubscribeStorage = null;
  let open = false;
  let themeSignature = '';

  const flashSaved = () => {
    if (!statusText) return;
    statusText.textContent = UI_STRINGS.saved;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusText.textContent = UI_STRINGS.savedLocally;
    }, 1500);
  };

  const showStatus = (message) => {
    if (!statusText) return;
    clearTimeout(statusTimer);
    statusText.textContent = message;
  };

  const syncValues = () => {
    tree?.sync(settings.values);
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
    const active = shadow?.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const saveCategories = (value) => {
    void settings.set('sponsorblockCategories', JSON.stringify(value)).then((saved) => {
      if (saved === false) toast?.show(UI_STRINGS.saveCategoriesFailed);
      else flashSaved();
    });
  };

  const saveSponsorSetting = (key, value) => {
    void settings.set(key, value).then((saved) => {
      if (saved === false) toast?.show(UI_STRINGS.saveSettingFailed);
      else flashSaved();
    });
  };

  const buildTree = () => createSettingsTree({
    prefix: 'ytst',
    orientation: 'vertical',
    rowClass: 'ytst-row',
    switchInputClass: 'ytst-switch-input',
    badgeClass: 'ytst-badge-layer',
    showTabCount: true,
    onChange: (key, value) => {
      void settings.set(key, value).then((saved) => {
        if (saved === false) toast?.show(UI_STRINGS.saveSettingFailed);
        else flashSaved();
      });
    },
    onCategoriesChange: saveCategories,
    onNoticeChange: (value) => saveSponsorSetting('sponsorblockNotice', value),
    onProgressChange: (value) => saveSponsorSetting('sponsorblockProgressBar', value)
  });

  const ensureMounted = () => {
    if (host?.isConnected) return;

    tree = buildTree();
    const rail = tree.rail;
    const content = tree.content;

    statusText = createElement('span', {
      className: 'ytst-status-text',
      textContent: UI_STRINGS.savedLocally
    });

    const resetButton = createElement('button', { type: 'button', className: 'ytst-button', textContent: UI_STRINGS.reset });
    resetButton.addEventListener('click', () => {
      void settings.reset().then(() => {
        syncValues();
        flashSaved();
        toast?.show(UI_STRINGS.defaultsRestored);
      });
    });

    let pendingUpdate = '';

    const updateButton = createElement('button', {
      type: 'button',
      className: 'ytst-button',
      textContent: UI_STRINGS.checkUpdate
    });
    updateButton.addEventListener('click', () => {
      if (!update) return;
      if (pendingUpdate) {
        update.openDownload();
        return;
      }
      updateButton.disabled = true;
      updateButton.textContent = UI_STRINGS.checkingUpdate;
      showStatus(UI_STRINGS.checkingUpdate);
      void update.check().then((result) => {
        updateButton.disabled = false;
        if (result.status === 'available') {
          pendingUpdate = result.latest;
          updateButton.textContent = UI_STRINGS.downloadUpdate;
          showStatus(UI_TEXT.updateAvailable(result.latest));
          toast?.show(UI_TEXT.updateAvailable(result.latest));
          return;
        }
        updateButton.textContent = UI_STRINGS.checkUpdate;
        if (result.status === 'current') {
          showStatus(UI_TEXT.upToDate(result.current));
          return;
        }
        showStatus(UI_STRINGS.updateCheckFailed);
        toast?.show(UI_STRINGS.updateCheckFailed);
      });
    });

    const doneButton = createElement('button', {
      type: 'button',
      className: 'ytst-button ytst-button-primary',
      textContent: UI_STRINGS.done
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
          createElement('h1', { className: 'ytst-title', id: 'ytst-title', textContent: UI_STRINGS.appName }),
          createElement('p', { className: 'ytst-subtitle', textContent: UI_STRINGS.appSubtitle })
        ]),
        createElement('span', {
          className: 'ytst-badge',
          textContent: UI_TEXT.versionTarget(meta.version || '2.4.3', meta.target || 'mv3')
        }),
        createElement('div', { className: 'ytst-header-actions' }, [
          (() => {
            const close = createElement('button', {
              type: 'button',
              className: 'ytst-icon-button',
              'aria-label': UI_STRINGS.closeSettings,
              title: UI_STRINGS.close
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
        createElement('div', { className: 'ytst-footer-actions' }, [updateButton, resetButton, doneButton])
      ])
    ]);

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

    unsubscribeSettings?.();
    unsubscribeSettings = settings.subscribe(() => syncValues());

    unsubscribeStorage?.();
    unsubscribeStorage = storage?.onChanged?.(() => {
      if (open) syncValues();
    }, STORAGE_KEYS) || null;

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
