(function() {
  "use strict";
  const COMPANION_BASE_URL = "http://127.0.0.1:47831";
  const COMPANION_TOKEN_KEY = "companionToken";
  const companionUrl = (path) => `${COMPANION_BASE_URL}${path}`;
  const requestCompanionDirect = async ({ path, method = "GET", headers = {}, body, timeoutMs = 8e3 }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(companionUrl(path), {
        method,
        headers: body === void 0 ? headers : { ...headers, "Content-Type": "application/json" },
        body: body === void 0 ? void 0 : JSON.stringify(body),
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store"
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
      return { status: 0, error: error?.name === "AbortError" ? "TIMEOUT" : "NOT_RUNNING" };
    } finally {
      clearTimeout(timer);
    }
  };
  const ALLOWED_FETCH_HOSTS = ["returnyoutubedislikeapi.com", "sponsor.ajay.app", "raw.githubusercontent.com"];
  const ALLOWED_GITHUB_TARGETS = [
    "https://github.com/CheemsGalaxy/YT-SuperTool/releases/"
  ];
  const AD_RULESET_ID = "yt-adblock";
  const COMPANION_PATH = /^\/api\/[A-Za-z0-9/_-]+$/;
  const COMPANION_METHODS = ["GET", "POST", "PUT"];
  const COMPANION_HEADERS = ["content-type", "x-ytst-token", "x-ytst-client", "x-ytst-client-version"];
  const ext = globalThis.browser || globalThis.chrome;
  function setAdRuleset(enabled) {
    try {
      const rules = ext?.declarativeNetRequest;
      if (!rules?.updateEnabledRulesets) return;
      const update = enabled ? rules.updateEnabledRulesets({ enableRulesetIds: [AD_RULESET_ID] }) : rules.updateEnabledRulesets({ disableRulesetIds: [AD_RULESET_ID] });
      if (update && typeof update.then === "function") update.catch(() => {
      });
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
        if (result && typeof result.then === "function") {
          result.then((value) => resolve(value?.adblock === true)).catch(() => resolve(false));
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
    if (responseType !== "json") return text;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };
  const handleFetch = (message, sendResponse) => {
    const { url, options = {}, responseType = "json", timeout = 8e3 } = message.payload || {};
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      sendResponse({ ok: false, status: 0, error: "Invalid request URL" });
      return false;
    }
    if (parsedUrl.protocol !== "https:" || !ALLOWED_FETCH_HOSTS.includes(parsedUrl.hostname)) {
      sendResponse({ ok: false, status: 0, error: "Request host is not allowed" });
      return false;
    }
    if (parsedUrl.hostname === "raw.githubusercontent.com" && !parsedUrl.pathname.startsWith("/CheemsGalaxy/YT-SuperTool/")) {
      sendResponse({ ok: false, status: 0, error: "Request path is not allowed" });
      return false;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    fetch(parsedUrl, { ...options, signal: controller.signal }).then(async (response) => {
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: parseBody(text, responseType)
      };
    }).then(sendResponse).catch((error) => sendResponse({ ok: false, status: 0, error: error.message || "Network request failed" })).finally(() => clearTimeout(timeoutId));
    return true;
  };
  const handleOpenUrl = (message, sendResponse) => {
    try {
      const target = new URL(message.url);
      const githubAllowed = target.hostname === "github.com" && ALLOWED_GITHUB_TARGETS.some((allowed) => target.href.startsWith(allowed));
      if (target.protocol !== "https:" || !githubAllowed) {
        throw new Error("URL is not allowed");
      }
      const creation = ext.tabs.create({ url: target.href });
      if (creation && typeof creation.then === "function") {
        creation.then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
      } else {
        sendResponse({ ok: true });
      }
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return true;
  };
  const persistPairToken = async (token) => {
    try {
      const storage = ext?.storage?.local;
      if (!storage?.set || typeof token !== "string" || token.length === 0) return;
      await Promise.race([
        storage.set({ [COMPANION_TOKEN_KEY]: token }),
        new Promise((resolve) => setTimeout(resolve, 1500))
      ]);
    } catch {
    }
  };
  const handleCompanion = (message, sendResponse) => {
    const payload = message.payload || {};
    const { path: targetPath, method = "GET", headers = {}, body, timeout = 8e3 } = payload;
    if (typeof targetPath !== "string" || targetPath.length > 160 || !COMPANION_PATH.test(targetPath) || targetPath.includes("..")) {
      sendResponse({ ok: false, status: 0, error: "INVALID_PATH" });
      return false;
    }
    if (!COMPANION_METHODS.includes(method)) {
      sendResponse({ ok: false, status: 0, error: "INVALID_METHOD" });
      return false;
    }
    if (body !== void 0) {
      let serialized;
      try {
        serialized = JSON.stringify(body);
      } catch {
        serialized = null;
      }
      if (typeof serialized !== "string" || serialized.length > 8192) {
        sendResponse({ ok: false, status: 0, error: "INVALID_BODY" });
        return false;
      }
    }
    const cleanHeaders = {};
    for (const [key, value] of Object.entries(headers || {})) {
      if (!COMPANION_HEADERS.includes(key.toLowerCase())) continue;
      if (typeof value !== "string" || value.length > 512) continue;
      cleanHeaders[key] = value;
    }
    const timeoutMs = Math.min(Math.max(Number(timeout) || 8e3, 1e3), 4e4);
    requestCompanionDirect({ path: targetPath, method, headers: cleanHeaders, body, timeoutMs }).then(async (result) => {
      if (result.error) {
        sendResponse({ ok: false, status: 0, error: result.error });
        return;
      }
      if (targetPath === "/api/pair" && result.status === 200 && result.data?.token) {
        await persistPairToken(result.data.token);
      }
      sendResponse({
        ok: result.status >= 200 && result.status < 300,
        status: result.status,
        body: result.data
      });
    }).catch((error) => sendResponse({ ok: false, status: 0, error: error.message || "Companion request failed" }));
    return true;
  };
  const handleRuleset = (message, sendResponse) => {
    const rules = ext?.declarativeNetRequest;
    if (!rules?.updateEnabledRulesets) {
      sendResponse({ ok: false, error: "declarativeNetRequest is unavailable" });
      return false;
    }
    try {
      const update = message.enabled ? rules.updateEnabledRulesets({ enableRulesetIds: [AD_RULESET_ID] }) : rules.updateEnabledRulesets({ disableRulesetIds: [AD_RULESET_ID] });
      if (update && typeof update.then === "function") {
        update.then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return false;
  };
  function startBackground() {
    if (!ext?.runtime?.onMessage) return false;
    void syncAdRuleset();
    ext.runtime.onInstalled.addListener(() => {
      void syncAdRuleset();
    });
    ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "YT_SUPERTOOL_FETCH") return handleFetch(message, sendResponse);
      if (message?.type === "YT_SUPERTOOL_OPEN_URL") return handleOpenUrl(message, sendResponse);
      if (message?.type === "YT_SUPERTOOL_COMPANION") return handleCompanion(message, sendResponse);
      if (message?.type === "YT_SUPERTOOL_DNR") return handleRuleset(message, sendResponse);
      return false;
    });
    return true;
  }
  startBackground();
})();
