const FALLBACK_VERSION = '2.3.1';
const STORAGE_PREFIX = 'yt_supertool_';

const gmApi = () => globalThis.GM || null;

const legacy = (name) => {
  switch (name) {
    case 'getValue': return typeof GM_getValue === 'function' ? GM_getValue : null;
    case 'setValue': return typeof GM_setValue === 'function' ? GM_setValue : null;
    case 'addStyle': return typeof GM_addStyle === 'function' ? GM_addStyle : null;
    case 'xmlHttpRequest': return typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null;
    case 'openInTab': return typeof GM_openInTab === 'function' ? GM_openInTab : null;
    case 'registerMenuCommand': return typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : null;
    case 'addValueChangeListener': return typeof GM_addValueChangeListener === 'function' ? GM_addValueChangeListener : null;
    case 'removeValueChangeListener': return typeof GM_removeValueChangeListener === 'function' ? GM_removeValueChangeListener : null;
    default: return null;
  }
};

const call = (name, ...args) => {
  const api = gmApi();
  if (api && typeof api[name] === 'function') return api[name](...args);
  const fallback = legacy(name);
  if (fallback) return fallback(...args);
  return undefined;
};

const has = (name) => Boolean(gmApi()?.[name]) || Boolean(legacy(name));

const readLocal = (key, fallback) => {
  try {
    const raw = globalThis.localStorage?.getItem(`${STORAGE_PREFIX}${key}`);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeLocal = (key, value) => {
  try {
    globalThis.localStorage?.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  } catch (error) {
    console.warn('YT SuperTool could not persist a setting:', error);
  }
};

const parseBody = (body, responseType) => {
  if (responseType !== 'json' || typeof body !== 'string') return body;
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

const gmRequest = ({ url, method = 'GET', headers = {}, body, responseType = 'json', timeout = 8000 }) =>
  new Promise((resolve, reject) => {
    call('xmlHttpRequest', {
      url,
      method,
      headers,
      data: body,
      responseType,
      timeout,
      onload: resolve,
      onerror: reject,
      ontimeout: () => reject(new Error('Network request timed out'))
    });
  });

export function createUserscriptBridge() {
  const storage = {
    async get(key, fallback) {
      if (has('getValue')) {
        const value = await call('getValue', key, fallback);
        return value === undefined ? fallback : value;
      }
      return readLocal(key, fallback);
    },
    async set(key, value) {
      if (has('setValue')) {
        await call('setValue', key, value);
        return;
      }
      writeLocal(key, value);
    },
    onChanged(callback, keys = []) {
      if (!has('addValueChangeListener')) return () => {};
      const ids = keys.map((key) => call('addValueChangeListener', key, (_name, oldValue, newValue) => {
        callback({ [key]: { oldValue, newValue } });
      }));
      return () => {
        if (!has('removeValueChangeListener')) return;
        ids.forEach((id) => call('removeValueChangeListener', id));
      };
    }
  };

  const network = {
    async request(url, options = {}) {
      const { responseType = 'json', timeout = 8000, allowHttpErrors = false, ...rest } = options;
      if (!has('xmlHttpRequest')) {
        const response = await fetch(url, rest);
        const body = responseType === 'json' ? await response.json() : await response.text();
        if (!response.ok && !allowHttpErrors) {
          throw new Error(`Network request failed (${response.status})`);
        }
        return buildResponse({
          ok: response.ok,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body,
          responseType
        });
      }

      const result = await gmRequest({
        url,
        method: rest.method || 'GET',
        headers: rest.headers || {},
        body: rest.body,
        responseType,
        timeout
      });
      const ok = result.status >= 200 && result.status < 300;
      if (!ok && !allowHttpErrors) {
        throw new Error(`Network request failed (${result.status})`);
      }
      return buildResponse({
        ok,
        status: result.status,
        headers: result.responseHeaders || {},
        body: result.response ?? result.responseText,
        responseType
      });
    }
  };

  const injector = {
    injectStyle(cssText, id = 'ytst-styles') {
      if (has('addStyle')) {
        call('addStyle', cssText);
        return id;
      }
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

      return false;
    }
  };

  return {
    env: 'userscript',
    version: typeof __VERSION__ !== 'undefined' ? __VERSION__ : FALLBACK_VERSION,
    storage,
    network,
    injector,
    mainWindow: typeof unsafeWindow !== 'undefined' ? unsafeWindow : globalThis,
    openExternal(url) {
      if (has('openInTab')) {
        call('openInTab', url, { active: true, insert: true });
        return;
      }
      globalThis.open(url, '_blank', 'noopener');
    },
    onMenuCommand(label, handler) {
      if (!has('registerMenuCommand')) return false;
      call('registerMenuCommand', label, handler);
      return true;
    },
    setNetworkBlocking() {

      return false;
    }
  };
}

export default createUserscriptBridge;
