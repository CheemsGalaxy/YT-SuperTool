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
  const ext$1 = globalThis.browser || globalThis.chrome;
  function setAdRuleset(enabled2) {
    try {
      const rules = ext$1?.declarativeNetRequest;
      if (!rules?.updateEnabledRulesets) return;
      const update = enabled2 ? rules.updateEnabledRulesets({ enableRulesetIds: [AD_RULESET_ID] }) : rules.updateEnabledRulesets({ disableRulesetIds: [AD_RULESET_ID] });
      if (update && typeof update.then === "function") update.catch(() => {
      });
    } catch {
    }
  }
  function readAdblockSetting() {
    return new Promise((resolve) => {
      try {
        const storage = ext$1?.storage?.local;
        if (!storage?.get) {
          resolve(false);
          return;
        }
        const result = storage.get({ adblock: false }, (value) => {
          if (ext$1.runtime?.lastError) {
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
      const creation = ext$1.tabs.create({ url: target.href });
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
      const storage = ext$1?.storage?.local;
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
    const rules = ext$1?.declarativeNetRequest;
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
    if (!ext$1?.runtime?.onMessage) return false;
    void syncAdRuleset();
    ext$1.runtime.onInstalled.addListener(() => {
      void syncAdRuleset();
    });
    ext$1.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "YT_SUPERTOOL_FETCH") return handleFetch(message, sendResponse);
      if (message?.type === "YT_SUPERTOOL_OPEN_URL") return handleOpenUrl(message, sendResponse);
      if (message?.type === "YT_SUPERTOOL_COMPANION") return handleCompanion(message, sendResponse);
      if (message?.type === "YT_SUPERTOOL_DNR") return handleRuleset(message, sendResponse);
      return false;
    });
    return true;
  }
  const NETWORK_FILTERS = [
    "! YT SuperTool - Google / YouTube ad, telemetry and tracker rules",
    "! Ad serving",
    "||doubleclick.net^",
    "||ad.doubleclick.net^",
    "||adservice.google.com^",
    "||googleadservices.com^",
    "||googleads.g.doubleclick.net^",
    "||googlesyndication.com^",
    "||pagead2.googlesyndication.com^",
    "||partner.googleadservices.com^",
    "||pubads.g.doubleclick.net^",
    "||securepubads.g.doubleclick.net^",
    "||static.doubleclick.net^",
    "||tpc.googlesyndication.com^",
    "||www.googleadservices.com^",
    "||googletagservices.com^",
    "||2mdn.net^",
    "||moatads.com^",
    "||imasdk.googleapis.com^",
    "||ads.youtube.com^",
    "||adclick.g.doubleclick.net^",
    "||googleads4.g.doubleclick.net^",
    "||doubleverify.com^",
    "||adsafeprotected.com^",
    "||googlevideo.com/videoplayback*adformat=",
    "||google.com/pagead/",
    "||google.com/ads/",
    "! Measurement and trackers",
    "||google-analytics.com^",
    "||analytics.google.com^",
    "||googletagmanager.com^",
    "||googletagmanager.com/gtag/js",
    "||googletagmanager.com/gtm.js",
    "||stats.g.doubleclick.net^",
    "||cm.g.doubleclick.net^",
    "||googleoptimize.com^",
    "||scorecardresearch.com^",
    "||quantserve.com^",
    "! YouTube ad endpoints (playback, QoE and generic telemetry stay untouched)",
    "||youtube.com/api/stats/ads",
    "||youtube.com/api/stats/atr",
    "||youtube.com/api/stats/delayplay",
    "||youtube.com/pagead/",
    "||youtube.com/ptracking",
    "||youtube.com/youtubei/v1/ads/",
    "! Do not break the player, playback or the watch page itself",
    "@@||youtube.com/youtubei/v1/player",
    "@@||youtube.com/youtubei/v1/next",
    "@@||youtube.com/youtubei/v1/get_watch",
    "@@||youtube.com/youtubei/v1/updated_metadata",
    "@@||youtube.com/youtubei/v1/guide"
  ];
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parseRule = (rule) => {
    if (typeof rule !== "string") return null;
    const trimmed = rule.trim();
    if (!trimmed || trimmed.startsWith("!")) return null;
    const exception = trimmed.startsWith("@@");
    const body = (exception ? trimmed.slice(2) : trimmed).replace(/^\|\|/, "");
    if (!body || body.startsWith("|")) return null;
    const slash = body.indexOf("/");
    let host = slash === -1 ? body : body.slice(0, slash);
    const path = slash === -1 ? "" : body.slice(slash);
    host = host.replace(/\^$/, "").toLowerCase();
    if (!host) return null;
    let pathPattern = null;
    if (path.includes("*")) {
      pathPattern = new RegExp(`^${escapeRegex(path).replace(/\\\*/g, ".*")}`);
    }
    return { host, path, pathPattern, exception };
  };
  const RULES = NETWORK_FILTERS.map(parseRule).filter(Boolean);
  const EXCEPTIONS = RULES.filter((rule) => rule.exception);
  const BLOCKS = RULES.filter((rule) => !rule.exception);
  const matchesRule = (rule, hostname, target) => {
    if (hostname !== rule.host && !hostname.endsWith(`.${rule.host}`)) return false;
    if (!rule.path) return true;
    if (rule.pathPattern) return rule.pathPattern.test(target);
    return target.startsWith(rule.path);
  };
  function matchRequest(_win, url) {
    if (typeof url !== "string" || !url) return false;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const hostname = parsed.hostname.toLowerCase();
    const target = `${parsed.pathname}${parsed.search}`;
    if (EXCEPTIONS.some((rule) => matchesRule(rule, hostname, target))) return false;
    return BLOCKS.some((rule) => matchesRule(rule, hostname, target));
  }
  const ext = globalThis.browser || globalThis.chrome;
  const FILTER = { urls: ["<all_urls>"] };
  const EXTRA_INFO = ["blocking"];
  let enabled = false;
  let listener = null;
  const readSetting = () => new Promise((resolve) => {
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
  const onBeforeRequest = (details) => {
    if (!enabled) return {};
    try {
      return matchRequest(null, details.url) ? { cancel: true } : {};
    } catch {
      return {};
    }
  };
  const startBlocking = () => {
    if (listener || !ext?.webRequest?.onBeforeRequest) return;
    ext.webRequest.onBeforeRequest.addListener(onBeforeRequest, FILTER, EXTRA_INFO);
    listener = onBeforeRequest;
  };
  const stopBlocking = () => {
    if (!listener) return;
    try {
      ext.webRequest.onBeforeRequest.removeListener(listener);
    } catch {
    }
    listener = null;
  };
  async function initAdblockBackground() {
    let manifestVersion = 3;
    try {
      manifestVersion = ext.runtime.getManifest().manifest_version;
    } catch {
      return false;
    }
    if (manifestVersion !== 2) return false;
    enabled = await readSetting();
    if (enabled) startBlocking();
    ext.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !("adblock" in changes)) return;
      enabled = changes.adblock.newValue === true;
      if (enabled) startBlocking();
      else stopBlocking();
    });
    return Boolean(listener);
  }
  startBackground();
  initAdblockBackground().catch((error) => {
    console.warn("YT SuperTool adblock background failed to start:", error);
  });
})();
