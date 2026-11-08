import { FiltersEngine, Request } from '@ghostery/adblocker';
import { NETWORK_FILTERS } from './adblock-filters.js';
import { hasAdPayload, isPlayerEndpoint, sanitizePlayerResponse } from './adblock-player.js';

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

let engine = null;
let engineFailed = false;

const getEngine = () => {
  if (engine || engineFailed) return engine;
  try {
    engine = FiltersEngine.parse(NETWORK_FILTERS.join('\n'), ENGINE_CONFIG);
  } catch (error) {
    engineFailed = true;
    console.warn('YT SuperTool could not build the adblock engine:', error);
  }
  return engine;
};

const isBlockingEnabled = (win) => {
  const dataset = win?.document?.documentElement?.dataset;
  return !dataset || dataset.ytstAdblock !== 'off';
};

export function matchRequest(win, url, type = 'xmlhttprequest') {
  if (!url) return null;
  const matcher = getEngine();
  if (!matcher) return null;
  try {
    const request = Request.fromRawDetails({
      url,
      type,
      sourceUrl: win?.location?.href
    });
    if (!request.isSupported) return null;
    const result = matcher.match(request);
    if (result.match && !result.exception) return result;
  } catch {

  }
  return null;
}

const blockResponse = (win) => {
  const ResponseCtor = win?.Response || globalThis.Response;
  try {
    return new ResponseCtor(null, { status: 204, statusText: 'No Content' });
  } catch {
    return undefined;
  }
};

const sanitizeFetchResponse = async (win, response) => {
  try {
    if (!response || !response.ok) return response;
    const text = await response.clone().text();
    if (!hasAdPayload(text)) return response;

    const payload = JSON.parse(text);
    sanitizePlayerResponse(payload);

    const HeadersCtor = win?.Headers || globalThis.Headers;
    const ResponseCtor = win?.Response || globalThis.Response;
    const headers = new HeadersCtor(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');

    return new ResponseCtor(JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch {
    return response;
  }
};

const installFetchHook = (win) => {
  const nativeFetch = win?.fetch;
  if (typeof nativeFetch !== 'function' || nativeFetch.__ytstAdblock) return;

  const patchedFetch = function patchedFetch(input, init) {
    let url = '';
    try {
      url = typeof input === 'string' ? input : (input?.url || String(input || ''));
    } catch {
      url = '';
    }

    if (isBlockingEnabled(win) && matchRequest(win, url)) {
      const blocked = blockResponse(win);
      if (blocked) return Promise.resolve(blocked);
      return Promise.reject(new win.TypeError('Failed to fetch'));
    }

    const result = nativeFetch.apply(this, arguments);
    if (!isPlayerEndpoint(url) || !isBlockingEnabled(win)) return result;

    return Promise.resolve(result).then((response) => sanitizeFetchResponse(win, response));
  };

  Object.defineProperty(patchedFetch, '__ytstAdblock', { value: true });
  win.fetch = patchedFetch;
};

const readResponseText = (xhr, descriptor) => {
  try {
    return descriptor.get.call(xhr);
  } catch {
    return null;
  }
};

const installSanitizedXhrGetters = (xhr, textDescriptor, responseDescriptor) => {
  let parsed = false;
  let cachedText;
  let cachedJson;

  const parse = () => {
    if (parsed) return;
    parsed = true;
    try {
      const responseType = xhr.responseType;
      const raw = responseType === '' || responseType === 'text'
        ? readResponseText(xhr, textDescriptor)
        : null;

      let payload = null;
      if (raw && hasAdPayload(raw)) {
        payload = JSON.parse(raw);
      } else if (responseType === 'json' && responseDescriptor?.get) {
        const value = responseDescriptor.get.call(xhr);
        if (value && typeof value === 'object') payload = value;
      }

      if (payload) {
        sanitizePlayerResponse(payload);
        cachedJson = payload;
        cachedText = JSON.stringify(payload);
      }
    } catch {

    }
  };

  if (textDescriptor?.get) {
    Object.defineProperty(xhr, 'responseText', {
      configurable: true,
      get() {
        parse();
        return cachedText !== undefined ? cachedText : readResponseText(xhr, textDescriptor);
      }
    });
  }

  if (responseDescriptor?.get) {
    Object.defineProperty(xhr, 'response', {
      configurable: true,
      get() {
        parse();
        const responseType = xhr.responseType;
        if (cachedText !== undefined && (responseType === '' || responseType === 'text')) {
          return cachedText;
        }
        if (cachedJson !== undefined) return cachedJson;
        return responseDescriptor.get.call(xhr);
      }
    });
  }
};

const fakeBlockedXhr = (win, xhr, url) => {
  const finish = () => {
    try {
      const body = xhr.responseType === 'json' ? {} : (xhr.responseType === '' || xhr.responseType === 'text' ? '{}' : null);
      Object.defineProperty(xhr, 'readyState', { configurable: true, value: 4 });
      Object.defineProperty(xhr, 'status', { configurable: true, value: 200 });
      Object.defineProperty(xhr, 'statusText', { configurable: true, value: 'OK' });
      Object.defineProperty(xhr, 'responseURL', { configurable: true, value: url });
      Object.defineProperty(xhr, 'responseText', { configurable: true, value: '{}' });
      Object.defineProperty(xhr, 'response', { configurable: true, value: body });
      xhr.dispatchEvent(new win.Event('readystatechange'));
      xhr.dispatchEvent(new win.Event('load'));
      xhr.dispatchEvent(new win.Event('loadend'));
    } catch {

    }
  };

  if (typeof win.queueMicrotask === 'function') win.queueMicrotask(finish);
  else win.setTimeout(finish, 0);
};

const installXhrHook = (win) => {
  const XHR = win?.XMLHttpRequest;
  const proto = XHR?.prototype;
  if (!proto || proto.__ytstAdblock) return;

  const nativeOpen = proto.open;
  const nativeSend = proto.send;
  const textDescriptor = Object.getOwnPropertyDescriptor(proto, 'responseText');
  const responseDescriptor = Object.getOwnPropertyDescriptor(proto, 'response');

  proto.open = function open(method, url, ...rest) {
    try {
      this.__ytstUrl = typeof url === 'string' ? url : String(url || '');
    } catch {

    }
    return nativeOpen.call(this, method, url, ...rest);
  };

  proto.send = function send(body) {
    const url = this.__ytstUrl || '';
    if (isBlockingEnabled(win) && matchRequest(win, url)) {
      fakeBlockedXhr(win, this, url);
      return undefined;
    }
    if (isPlayerEndpoint(url) && isBlockingEnabled(win)) {
      installSanitizedXhrGetters(this, textDescriptor, responseDescriptor);
    }
    return nativeSend.call(this, body);
  };

  Object.defineProperty(proto, '__ytstAdblock', { value: true });
};

export function installNetworkGuard(win) {
  if (!win || win.__ytstNetworkGuard) return false;
  try {
    installFetchHook(win);
    installXhrHook(win);
    win.__ytstNetworkGuard = true;
    return true;
  } catch (error) {
    console.warn('YT SuperTool could not install the adblock request guard:', error);
    return false;
  }
}

export default installNetworkGuard;
