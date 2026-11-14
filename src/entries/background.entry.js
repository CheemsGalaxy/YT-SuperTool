const ALLOWED_FETCH_HOSTS = ['returnyoutubedislikeapi.com', 'sponsor.ajay.app', 'raw.githubusercontent.com'];
const ALLOWED_GITHUB_TARGETS = [
  'https://github.com/CheemsGalaxy/YT-SuperTool/releases/'
];
const AD_RULESET_ID = 'yt-adblock';

const ext = globalThis.browser || globalThis.chrome;

function setAdRuleset(enabled) {
  try {
    const rules = ext?.declarativeNetRequest;
    if (!rules?.updateEnabledRulesets) return;
    const update = enabled
      ? rules.updateEnabledRulesets({ enableRulesetIds: [AD_RULESET_ID] })
      : rules.updateEnabledRulesets({ disableRulesetIds: [AD_RULESET_ID] });
    if (update && typeof update.then === 'function') update.catch(() => {});
  } catch {

  }
}

function readAdblockSetting() {
  return new Promise((resolve) => {
    try {
      const storage = ext?.storage?.local;
      if (!storage?.get) {
        resolve(false);
        return;
      }
      const result = storage.get({ adblock: false }, (value) => {
        if (ext.runtime?.lastError) {
          resolve(false);
          return;
        }
        resolve(value?.adblock === true);
      });
      if (result && typeof result.then === 'function') {
        result
          .then((value) => resolve(value?.adblock === true))
          .catch(() => resolve(false));
      }
    } catch {
      resolve(false);
    }
  });
}

async function syncAdRuleset() {
  setAdRuleset(await readAdblockSetting());
}

const parseBody = (text, responseType) => {
  if (responseType !== 'json') return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const handleFetch = (message, sendResponse) => {
  const { url, options = {}, responseType = 'json', timeout = 8000 } = message.payload || {};
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    sendResponse({ ok: false, status: 0, error: 'Invalid request URL' });
    return false;
  }

  if (parsedUrl.protocol !== 'https:' || !ALLOWED_FETCH_HOSTS.includes(parsedUrl.hostname)) {
    sendResponse({ ok: false, status: 0, error: 'Request host is not allowed' });
    return false;
  }

  if (parsedUrl.hostname === 'raw.githubusercontent.com'
    && !parsedUrl.pathname.startsWith('/CheemsGalaxy/YT-SuperTool/')) {
    sendResponse({ ok: false, status: 0, error: 'Request path is not allowed' });
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  fetch(parsedUrl, { ...options, signal: controller.signal })
    .then(async (response) => {
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: parseBody(text, responseType)
      };
    })
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, status: 0, error: error.message || 'Network request failed' }))
    .finally(() => clearTimeout(timeoutId));
  return true;
};

const handleOpenUrl = (message, sendResponse) => {
  try {
    const target = new URL(message.url);
    const githubAllowed = target.hostname === 'github.com'
      && ALLOWED_GITHUB_TARGETS.some((allowed) => target.href.startsWith(allowed));
    if (target.protocol !== 'https:' || !githubAllowed) {
      throw new Error('URL is not allowed');
    }
    const creation = ext.tabs.create({ url: target.href });
    if (creation && typeof creation.then === 'function') {
      creation
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
    } else {
      sendResponse({ ok: true });
    }
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
  return true;
};

const handleRuleset = (message, sendResponse) => {
  const rules = ext?.declarativeNetRequest;
  if (!rules?.updateEnabledRulesets) {
    sendResponse({ ok: false, error: 'declarativeNetRequest is unavailable' });
    return false;
  }
  try {
    const update = message.enabled
      ? rules.updateEnabledRulesets({ enableRulesetIds: [AD_RULESET_ID] })
      : rules.updateEnabledRulesets({ disableRulesetIds: [AD_RULESET_ID] });
    if (update && typeof update.then === 'function') {
      update
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    sendResponse({ ok: true });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
  return false;
};

export function startBackground() {
  if (!ext?.runtime?.onMessage) return false;

  void syncAdRuleset();

  ext.runtime.onInstalled.addListener(() => {
    void syncAdRuleset();
  });

  ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'YT_SUPERTOOL_FETCH') return handleFetch(message, sendResponse);
    if (message?.type === 'YT_SUPERTOOL_OPEN_URL') return handleOpenUrl(message, sendResponse);
    if (message?.type === 'YT_SUPERTOOL_DNR') return handleRuleset(message, sendResponse);
    return false;
  });

  return true;
}

export default startBackground;
