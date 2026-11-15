import { COMPANION_API_VERSION, COMPANION_BASE_URL, COMPANION_TOKEN_KEY } from './constants.js';

const DEFAULT_TIMEOUTS = {
  health: 2500,
  pair: 8000,
  analyze: 35000,
  start: 10000,
  job: 5000,
  cancel: 10000,
  settings: 5000
};

export class CompanionError extends Error {
  constructor(code, message, { status = 0, serverCode = null } = {}) {
    super(message);
    this.name = 'CompanionError';
    this.code = code;
    this.status = status;
    this.serverCode = serverCode;
  }
}

const parseData = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    const error = new Error('Companion did not answer in time.');
    error.code = 'TIMEOUT';
    reject(error);
  }, ms);

  promise.then(
    (value) => {
      clearTimeout(timer);
      resolve(value);
    },
    (error) => {
      clearTimeout(timer);
      reject(error);
    }
  );
});

export const createCompanionClient = ({
  transport,
  storage,
  clientName,
  clientVersion,
  baseUrl = COMPANION_BASE_URL,
  apiVersion = COMPANION_API_VERSION,
  timeouts = {},
  timeoutGrace = 1500
}) => {
  if (typeof transport !== 'function') throw new Error('Companion transport is required.');
  if (!storage?.get || !storage?.set) throw new Error('Companion storage is required.');

  const limits = { ...DEFAULT_TIMEOUTS, ...timeouts };
  let cachedToken = null;
  let tokenLoaded = false;

  const loadToken = async () => {
    if (tokenLoaded) return cachedToken;
    tokenLoaded = true;
    const stored = await storage.get(COMPANION_TOKEN_KEY, null);
    cachedToken = typeof stored === 'string' && stored.length > 0 ? stored : null;
    return cachedToken;
  };

  const saveToken = async (value) => {
    cachedToken = value;
    tokenLoaded = true;
    await storage.set(COMPANION_TOKEN_KEY, value);
  };

  const clearToken = async () => {
    cachedToken = null;
    tokenLoaded = true;
    await storage.set(COMPANION_TOKEN_KEY, null);
  };

  const send = async (path, { method = 'GET', body, auth = true, timeout = limits.settings } = {}) => {
    const headers = {
      'X-YTST-Client': clientName,
      'X-YTST-Client-Version': String(clientVersion ?? '0')
    };

    if (auth) {
      const token = await loadToken();
      if (!token) throw new CompanionError('NOT_PAIRED', 'Companion is not paired.');
      headers['X-YTST-Token'] = token;
    }

    let result;
    try {
      result = await withTimeout(
        Promise.resolve().then(() => transport({ path, method, headers, body, timeoutMs: timeout })),
        timeout + timeoutGrace
      );
    } catch (error) {
      const code = error?.code === 'TIMEOUT' ? 'TIMEOUT' : 'NOT_RUNNING';
      throw new CompanionError(code, error?.message || 'Companion is not running.');
    }

    if (!result || typeof result.status !== 'number') {
      throw new CompanionError('BAD_RESPONSE', 'Companion returned an unexpected response.');
    }

    if (result.status === 0) {
      const code = result.error === 'TIMEOUT' ? 'TIMEOUT' : 'NOT_RUNNING';
      throw new CompanionError(
        code,
        code === 'TIMEOUT' ? 'Companion did not answer in time.' : 'Companion is not running.'
      );
    }

    const data = parseData(result.data);

    if (result.status === 401) {
      await clearToken();
      throw new CompanionError('UNAUTHORIZED', data?.error?.message || 'Pairing token is invalid.', {
        status: 401,
        serverCode: data?.error?.code || 'BAD_TOKEN'
      });
    }

    if (result.status < 200 || result.status >= 300) {
      throw new CompanionError('REQUEST_FAILED', data?.error?.message || `Companion returned ${result.status}.`, {
        status: result.status,
        serverCode: data?.error?.code || null
      });
    }

    if (!data || data.ok !== true) {
      throw new CompanionError('BAD_RESPONSE', 'Companion returned an unexpected response.');
    }

    return data;
  };

  const status = async () => {
    let health;
    try {
      health = await send('/api/health', { auth: false, timeout: limits.health });
    } catch (error) {
      if (error.code === 'NOT_RUNNING' || error.code === 'TIMEOUT') {
        return { state: 'not-running', error };
      }
      return { state: 'error', error };
    }

    if (health.service !== 'yt-super-tool-companion' || health.apiVersion !== apiVersion) {
      return { state: 'incompatible', health };
    }

    if (!health.paired) return { state: 'not-paired', health };
    if (!(await loadToken())) return { state: 'not-paired', health };
    return { state: 'ready', health };
  };

  const pair = async (code) => {
    let data;
    try {
      data = await send('/api/pair', {
        method: 'POST',
        auth: false,
        body: { code, clientName },
        timeout: limits.pair
      });
    } catch (error) {
      if (error?.code !== 'TIMEOUT') throw error;
      const stored = await storage.get(COMPANION_TOKEN_KEY, null);
      if (typeof stored !== 'string' || stored.length === 0) throw error;
      cachedToken = stored;
      tokenLoaded = true;
      return { companionVersion: null, apiVersion, pairedAt: null, recovered: true };
    }

    if (data.apiVersion !== apiVersion || typeof data.token !== 'string' || data.token.length === 0) {
      throw new CompanionError('INCOMPATIBLE', 'Companion version is not supported.');
    }

    await saveToken(data.token);
    return {
      companionVersion: data.companionVersion,
      apiVersion: data.apiVersion,
      pairedAt: data.pairedAt
    };
  };

  const unpair = async () => {
    try {
      await send('/api/unpair', { method: 'POST', timeout: limits.settings });
    } finally {
      await clearToken();
    }
  };

  const analyze = async (url) => {
    const data = await send('/api/analyze', {
      method: 'POST',
      body: { url },
      timeout: limits.analyze
    });
    return { video: data.video, options: data.options };
  };

  const start = async (options) => {
    const data = await send('/api/download', {
      method: 'POST',
      body: options,
      timeout: limits.start
    });
    return data.job;
  };

  const get = async (id) => {
    const data = await send(`/api/download/${encodeURIComponent(id)}`, { timeout: limits.job });
    return data.job;
  };

  const cancel = async (id) => {
    const data = await send(`/api/download/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      timeout: limits.cancel
    });
    return data.job;
  };

  const getSettings = async () => {
    const data = await send('/api/settings', { timeout: limits.settings });
    return data.settings;
  };

  const updateSettings = async (patch) => {
    const data = await send('/api/settings', {
      method: 'PUT',
      body: patch,
      timeout: limits.settings
    });
    return data.settings;
  };

  return {
    baseUrl,
    clientName,
    status,
    pair,
    unpair,
    analyze,
    start,
    get,
    cancel,
    getSettings,
    updateSettings,
    isPaired: async () => Boolean(await loadToken()),
    clearToken
  };
};
