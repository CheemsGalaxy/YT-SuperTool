import { FiltersEngine, Request } from '@ghostery/adblocker';
import { NETWORK_FILTERS } from './adblock-filters.js';
import { hasAdPayload, isPlayerEndpoint, isYouTubeAdEndpoint, sanitizeResponseText } from './adblock-player.js';
import { isAdblockEnabled } from './adblock-state.js';

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
let engineWarm = false;

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

const warmEngine = (win) => {
  if (engineWarm) return;
  engineWarm = true;
  const run = () => getEngine();
  if (typeof win?.requestIdleCallback === 'function') win.requestIdleCallback(run, { timeout: 1000 });
  else win?.setTimeout?.(run, 0);
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

const jsonResponse = (win, body = '{}') => {
  const ResponseCtor = win?.Response || globalThis.Response;
  try {
    return new ResponseCtor(body, {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' }
    });
  } catch {
    return undefined;
  }
};

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

    const rewritten = sanitizeResponseText(text);
    if (rewritten === text) return response;

    const HeadersCtor = win?.Headers || globalThis.Headers;
    const ResponseCtor = win?.Response || globalThis.Response;
    const headers = new HeadersCtor(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');

    return new ResponseCtor(rewritten, {
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

    if (isAdblockEnabled(win) && matchRequest(win, url)) {
      const blocked = isYouTubeAdEndpoint(url) ? jsonResponse(win) : blockResponse(win);
      if (blocked) return Promise.resolve(blocked);
      return Promise.reject(new win.TypeError('Failed to fetch'));
    }

    const result = nativeFetch.apply(this, arguments);
    if (!isPlayerEndpoint(url) || !isAdblockEnabled(win)) return result;

    return Promise.resolve(result).then((response) => sanitizeFetchResponse(win, response));
  };

  Object.defineProperty(patchedFetch, '__ytstAdblock', { value: true });
  win.fetch = patchedFetch;
};

const installBeaconHook = (win) => {
  const navigatorObject = win?.navigator;
  const nativeBeacon = navigatorObject?.sendBeacon;
  if (typeof nativeBeacon !== 'function' || nativeBeacon.__ytstAdblock) return;

  const patchedBeacon = function sendBeacon(url, data) {
    try {
      if (isAdblockEnabled(win) && matchRequest(win, String(url), 'ping')) return true;
    } catch {

    }
    return nativeBeacon.call(navigatorObject, url, data);
  };

  Object.defineProperty(patchedBeacon, '__ytstAdblock', { value: true });
  try {
    navigatorObject.sendBeacon = patchedBeacon;
  } catch {

  }
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
  try {
    xhr.__ytstSanitized = true;
  } catch {

  }

  const parse = () => {
    if (parsed) return;
    parsed = true;
    try {
      const responseType = xhr.responseType;
      const raw = responseType === '' || responseType === 'text'
        ? readResponseText(xhr, textDescriptor)
        : null;

      let text = raw;
      if (!text && responseType === 'json' && responseDescriptor?.get) {
        const value = responseDescriptor.get.call(xhr);
        if (value && typeof value === 'object') {
          cachedJson = value;
          text = JSON.stringify(value);
        }
      }

      if (!text || !hasAdPayload(text)) return;
      const rewritten = sanitizeResponseText(text);
      if (rewritten === text) return;

      const value = JSON.parse(rewritten);
      cachedText = rewritten;
      cachedJson = value;
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

const defineValue = (target, name, value) => {
  try {
    Object.defineProperty(target, name, { configurable: true, value });
  } catch {

  }
};

const fakeBlockedXhr = (win, xhr, url) => {
  const token = {};
  try {
    xhr.__ytstBlocked = true;
    xhr.__ytstBlockedToken = token;
  } catch {

  }
  const finish = () => {
    if (xhr.__ytstBlockedToken !== token) return;
    try {
      const body = '{}';
      defineValue(xhr, 'readyState', 4);
      defineValue(xhr, 'status', 200);
      defineValue(xhr, 'statusText', 'OK');
      defineValue(xhr, 'responseURL', url);
      defineValue(xhr, 'responseText', body);
      defineValue(xhr, 'response', xhr.responseType === 'json' ? {} : body);
      defineValue(xhr, 'getResponseHeader', (name) => (
        String(name).toLowerCase() === 'content-type' ? 'application/json' : null
      ));
      defineValue(xhr, 'getAllResponseHeaders', () => 'content-type: application/json\r\n');

      xhr.dispatchEvent(new win.Event('readystatechange'));
      const ProgressCtor = win.ProgressEvent;
      if (typeof ProgressCtor === 'function') {
        xhr.dispatchEvent(new ProgressCtor('progress', {
          lengthComputable: true,
          loaded: body.length,
          total: body.length
        }));
      }
      xhr.dispatchEvent(new win.Event('load'));
      xhr.dispatchEvent(new win.Event('loadend'));
      delete xhr.__ytstBlockedToken;
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
      if (this.__ytstSanitized) {
        delete this.responseText;
        delete this.response;
        this.__ytstSanitized = false;
      }
      if (this.__ytstBlocked) {
        delete this.readyState;
        delete this.status;
        delete this.statusText;
        delete this.responseURL;
        delete this.responseText;
        delete this.response;
        delete this.getResponseHeader;
        delete this.getAllResponseHeaders;
        delete this.__ytstBlockedToken;
        this.__ytstBlocked = false;
      }
      this.__ytstUrl = typeof url === 'string' ? url : String(url || '');
    } catch {

    }
    return nativeOpen.call(this, method, url, ...rest);
  };

  proto.send = function send(body) {
    const url = this.__ytstUrl || '';
    if (isAdblockEnabled(win) && matchRequest(win, url)) {
      fakeBlockedXhr(win, this, url);
      return undefined;
    }
    if (isPlayerEndpoint(url) && isAdblockEnabled(win)) {
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
    installBeaconHook(win);
    win.__ytstNetworkGuard = true;
    warmEngine(win);
    return true;
  } catch (error) {
    console.warn('YT SuperTool could not install the adblock request guard:', error);
    return false;
  }
}

export default installNetworkGuard;
