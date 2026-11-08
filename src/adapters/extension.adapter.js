const FALLBACK_VERSION = '2.3.0';
const STORAGE_PREFIX = 'yt_supertool_';

const extensionApi = () => globalThis.browser || globalThis.chrome || null;

const isPromiseStorage = (storage) => Boolean(globalThis.browser?.storage?.local) && globalThis.browser.storage.local === storage;

const storageGet = (storage, key, fallback) => {
  if (isPromiseStorage(storage)) {
    return storage.get({ [key]: fallback }).then((result) => result?.[key] ?? fallback);
  }
  return new Promise((resolve, reject) => {
    storage.get({ [key]: fallback }, (result) => {
      const error = extensionApi()?.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result?.[key] ?? fallback);
    });
  });
};

const storageSet = (storage, key, value) => {
  if (isPromiseStorage(storage)) return storage.set({ [key]: value });
  return new Promise((resolve, reject) => {
    storage.set({ [key]: value }, () => {
      const error = extensionApi()?.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
};

const sendMessage = (api, message) => {
  if (globalThis.browser?.runtime === api.runtime) return api.runtime.sendMessage(message);
  return new Promise((resolve, reject) => {
    api.runtime.sendMessage(message, (response) => {
      const error = api.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
};

const parseBody = (body, responseType) => {
  if (responseType !== 'json') return body;
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};

const buildResponse = ({ ok, status = 200, headers = {}, body, responseType = 'json' }) => {
  const data = parseBody(body, responseType);
  return {
    ok: Boolean(ok),
    status,
    headers,
    data,
    async json() {
      return typeof data === 'string' ? JSON.parse(data) : data;
    },
    async text() {
      return typeof data === 'string' ? data : JSON.stringify(data);
    }
  };
};

export function createExtensionBridge(target = 'mv3') {
  const api = extensionApi();
  const localStore = api?.storage?.local || null;
  const local = globalThis.localStorage || null;

  const storage = {
    async get(key, fallback) {
      if (localStore) return storageGet(localStore, key, fallback);
      try {
        const raw = local?.getItem(`${STORAGE_PREFIX}${key}`);
        return raw === null || raw === undefined ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    async set(key, value) {
      if (localStore) return storageSet(localStore, key, value);
      try {
        local?.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
      } catch (error) {
        console.warn('YT SuperTool could not persist a setting:', error);
      }
    },
    onChanged(callback, keys = []) {
      if (!api?.storage?.onChanged) return () => {};
      const listener = (changes, areaName) => {
        if (areaName && areaName !== 'local') return;
        const filtered = {};
        Object.keys(changes).forEach((key) => {
          if (!keys.length || keys.includes(key)) filtered[key] = changes[key];
        });
        if (Object.keys(filtered).length) callback(filtered);
      };
      api.storage.onChanged.addListener(listener);
      return () => api.storage.onChanged.removeListener(listener);
    }
  };

  const network = {
    async request(url, options = {}) {
      const { responseType = 'json', timeout = 8000, allowHttpErrors = false, ...rest } = options;
      if (!api?.runtime?.sendMessage) {
        const response = await fetch(url, rest);
        const body = responseType === 'json' ? await response.json() : await response.text();
        if (!response.ok && !allowHttpErrors) throw new Error(`Network request failed (${response.status})`);
        return buildResponse({ ...response, body, responseType });
      }

      const result = await sendMessage(api, {
        type: 'YT_SUPERTOOL_FETCH',
        payload: { url, options: rest, responseType, timeout, allowHttpErrors }
      });

      if (!result?.ok && !allowHttpErrors) {
        throw new Error(result?.error || `Network request failed (${result?.status ?? 'unknown'})`);
      }
      return buildResponse({ ...result, responseType });
    }
  };

  const injector = {
    injectStyle(cssText, id = 'ytst-styles') {
      const parent = document.head || document.documentElement;
      if (!parent) return false;
      let style = document.getElementById(id);
      if (!style) {
        style = document.createElement('style');
        style.id = id;
        parent.appendChild(style);
      }
      style.textContent = cssText;
      return id;
    },
    injectMainWorld() {

      if (target !== 'mv2' || !api?.runtime?.getURL) return false;
      if (document.getElementById('ytst-main-world')) return true;
      const script = document.createElement('script');
      script.id = 'ytst-main-world';
      script.src = api.runtime.getURL('main-world.js');
      script.async = false;
      script.addEventListener('load', () => script.remove(), { once: true });
      (document.head || document.documentElement).appendChild(script);
      return true;
    }
  };

  return {
    env: target,
    version: api?.runtime?.getManifest?.().version || (typeof __VERSION__ !== 'undefined' ? __VERSION__ : FALLBACK_VERSION),
    storage,
    network,
    injector,
    mainWindow: globalThis,
    openExternal(url) {
      if (!api?.runtime?.sendMessage) {
        globalThis.open(url, '_blank', 'noopener');
        return;
      }
      sendMessage(api, { type: 'YT_SUPERTOOL_OPEN_URL', url })
        .then((response) => {
          if (response?.ok === false) throw new Error(response.error || 'Could not open the page');
        })
        .catch((error) => console.warn('YT SuperTool could not open the requested page:', error));
    },
    onMenuCommand() {
      return false;
    },
    setNetworkBlocking(enabled) {
      if (!api?.runtime?.sendMessage) return;
      sendMessage(api, { type: 'YT_SUPERTOOL_DNR', enabled: Boolean(enabled) })
        .catch(() => {

        });
    }
  };
}

export default createExtensionBridge;
