import { COMPANION_BASE_URL } from '../core/companion/constants.js';

export const companionUrl = (path) => `${COMPANION_BASE_URL}${path}`;

export const requestCompanionDirect = async ({ path, method = 'GET', headers = {}, body, timeoutMs = 8000 }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(companionUrl(path), {
      method,
      headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store'
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { status: response.status, data };
  } catch (error) {
    return { status: 0, error: error?.name === 'AbortError' ? 'TIMEOUT' : 'NOT_RUNNING' };
  } finally {
    clearTimeout(timer);
  }
};
