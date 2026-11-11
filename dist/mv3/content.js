(function() {
  "use strict";
  const STORAGE_PREFIX = "yt_supertool_";
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
    if (responseType !== "json") return body;
    if (typeof body !== "string") return body;
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  };
  const buildResponse = ({ ok, status = 200, headers = {}, body, responseType = "json" }) => {
    const data = parseBody(body, responseType);
    return {
      ok: Boolean(ok),
      status,
      headers,
      data,
      async json() {
        return typeof data === "string" ? JSON.parse(data) : data;
      },
      async text() {
        return typeof data === "string" ? data : JSON.stringify(data);
      }
    };
  };
  function createExtensionBridge(target2 = "mv3") {
    const api = extensionApi();
    const localStore = api?.storage?.local || null;
    const local = globalThis.localStorage || null;
    const storage = {
      async get(key, fallback) {
        if (localStore) return storageGet(localStore, key, fallback);
        try {
          const raw = local?.getItem(`${STORAGE_PREFIX}${key}`);
          return raw === null || raw === void 0 ? fallback : JSON.parse(raw);
        } catch {
          return fallback;
        }
      },
      async set(key, value) {
        if (localStore) return storageSet(localStore, key, value);
        try {
          local?.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
        } catch (error) {
          console.warn("YT SuperTool could not persist a setting:", error);
        }
      },
      onChanged(callback, keys = []) {
        if (!api?.storage?.onChanged) return () => {
        };
        const listener = (changes, areaName) => {
          if (areaName && areaName !== "local") return;
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
        const { responseType = "json", timeout = 8e3, allowHttpErrors = false, ...rest } = options;
        if (!api?.runtime?.sendMessage) {
          const response = await fetch(url, rest);
          const body = responseType === "json" ? await response.json() : await response.text();
          if (!response.ok && !allowHttpErrors) throw new Error(`Network request failed (${response.status})`);
          return buildResponse({ ...response, body, responseType });
        }
        const result = await sendMessage(api, {
          type: "YT_SUPERTOOL_FETCH",
          payload: { url, options: rest, responseType, timeout, allowHttpErrors }
        });
        if (!result?.ok && !allowHttpErrors) {
          throw new Error(result?.error || `Network request failed (${result?.status ?? "unknown"})`);
        }
        return buildResponse({ ...result, responseType });
      }
    };
    const injector = {
      injectStyle(cssText, id = "ytst-styles") {
        const parent = document.head || document.documentElement;
        if (!parent) return false;
        let style = document.getElementById(id);
        if (!style) {
          style = document.createElement("style");
          style.id = id;
          parent.appendChild(style);
        }
        style.textContent = cssText;
        return id;
      },
      injectMainWorld() {
        if (target2 !== "mv2" || !api?.runtime?.getURL) return false;
        if (document.getElementById("ytst-main-world")) return true;
        const script = document.createElement("script");
        script.id = "ytst-main-world";
        script.src = api.runtime.getURL("main-world.js");
        script.async = false;
        script.addEventListener("load", () => script.remove(), { once: true });
        (document.head || document.documentElement).appendChild(script);
        return true;
      }
    };
    return {
      env: target2,
      version: api?.runtime?.getManifest?.().version || "2.4.0",
      storage,
      network,
      injector,
      mainWindow: globalThis,
      openExternal(url) {
        if (!api?.runtime?.sendMessage) {
          globalThis.open(url, "_blank", "noopener");
          return;
        }
        sendMessage(api, { type: "YT_SUPERTOOL_OPEN_URL", url }).then((response) => {
          if (response?.ok === false) throw new Error(response.error || "Could not open the page");
        }).catch((error) => console.warn("YT SuperTool could not open the requested page:", error));
      },
      onMenuCommand() {
        return false;
      },
      setNetworkBlocking(enabled) {
        if (!api?.runtime?.sendMessage) return;
        sendMessage(api, { type: "YT_SUPERTOOL_DNR", enabled: Boolean(enabled) }).catch(() => {
        });
      }
    };
  }
  const target = "mv3";
  const bridge = createExtensionBridge(target);
  if (typeof window !== "undefined") {
    window.ytsBridge = bridge;
  }
  const globalCss = '#end .ytst-header-button {\n  display: inline-flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n  width: 40px;\n  height: 40px;\n  min-width: 40px;\n  padding: 0;\n  margin: 0 2px;\n  border: 0;\n  border-radius: 50%;\n  background: transparent;\n  color: var(--yt-spec-text-primary, #0f0f0f);\n  cursor: pointer;\n  transition: background-color 120ms ease, transform 120ms ease;\n}\n\n#end .ytst-header-button:hover {\n  background: var(--yt-spec-badge-chip-background, rgba(128, 128, 128, 0.16));\n}\n\n#end .ytst-header-button:active {\n  transform: scale(0.96);\n}\n\n#end .ytst-header-button svg {\n  display: block;\n  width: 20px;\n  height: 20px;\n  fill: none;\n  stroke: currentColor;\n  stroke-width: 1.75;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n  pointer-events: none;\n}\n\n.ytp-right-controls .ytst-player-button {\n  display: inline-flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n  flex: 0 0 auto !important;\n  width: 40px !important;\n  height: 40px !important;\n  padding: 8px !important;\n  margin: 0 !important;\n  border: 0 !important;\n  border-radius: 50% !important;\n  background: transparent !important;\n  color: #ffffff !important;\n  cursor: pointer !important;\n  position: relative !important;\n  box-sizing: border-box !important;\n  transition: background-color 120ms ease !important;\n}\n\n.ytp-right-controls .ytst-player-button:hover {\n  background: rgba(255, 255, 255, 0.1) !important;\n}\n\n.ytp-right-controls .ytst-player-button:active {\n  background: rgba(255, 255, 255, 0.16) !important;\n}\n\n.ytp-right-controls .ytst-player-button.is-active {\n  color: #3ea6ff !important;\n}\n\n.ytp-right-controls .ytst-player-button svg {\n  display: block !important;\n  width: 24px !important;\n  height: 24px !important;\n  margin: auto !important;\n  padding: 0 !important;\n  fill: none !important;\n  stroke: currentColor !important;\n  stroke-width: 1.75 !important;\n  stroke-linecap: round !important;\n  stroke-linejoin: round !important;\n  pointer-events: none !important;\n}\n\n@media (max-width: 768px) {\n  .ytp-right-controls .ytst-player-button {\n    width: 36px !important;\n    height: 36px !important;\n    padding: 6px !important;\n  }\n}\n.ytst-speed {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  align-self: center;\n  flex: 0 0 auto;\n  margin: 0 4px 0 8px;\n  padding: 0;\n  color: #ffffff;\n  font-family: "Roboto", "Inter", sans-serif;\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 1;\n}\n\n.ytst-speed-slider {\n  width: 96px;\n  height: 24px;\n  margin: 0;\n  padding: 0;\n  appearance: none;\n  -webkit-appearance: none;\n  background: transparent;\n  cursor: pointer;\n  filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.85));\n}\n\n.ytst-speed-slider::-webkit-slider-runnable-track {\n  height: 3px;\n  border-radius: 2px;\n  background: rgba(0, 0, 0, 0.45);\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);\n}\n\n.ytst-speed-slider::-moz-range-track {\n  height: 3px;\n  border-radius: 2px;\n  background: rgba(0, 0, 0, 0.45);\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);\n}\n\n.ytst-speed-slider::-webkit-slider-thumb {\n  width: 12px;\n  height: 12px;\n  margin-top: -4.5px;\n  appearance: none;\n  -webkit-appearance: none;\n  border: 0;\n  border-radius: 50%;\n  background: #ffffff;\n  box-shadow: 0 0 3px rgba(0, 0, 0, 0.8);\n}\n\n.ytst-speed-slider::-moz-range-thumb {\n  width: 12px;\n  height: 12px;\n  border: 0;\n  border-radius: 50%;\n  background: #ffffff;\n}\n\n.ytst-speed-chip {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 4px;\n  height: 28px;\n  min-width: 56px;\n  padding: 0 8px;\n  border: 0;\n  border-radius: 14px;\n  background: rgba(0, 0, 0, 0.5);\n  -webkit-backdrop-filter: blur(8px);\n  backdrop-filter: blur(8px);\n  color: #ffffff;\n  font-family: "JetBrains Mono", "SFMono-Regular", ui-monospace, monospace;\n  font-size: 12px;\n  font-weight: 500;\n  font-variant-numeric: tabular-nums;\n  line-height: 1;\n  white-space: nowrap;\n  cursor: pointer;\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);\n  transition: background-color 120ms ease;\n}\n\n.ytst-speed-chip:hover {\n  background: rgba(0, 0, 0, 0.68);\n}\n\n.ytst-speed-chip.is-open {\n  background: rgba(0, 0, 0, 0.78);\n}\n\n.ytst-speed-chevron {\n  width: 14px;\n  height: 14px;\n  fill: none;\n  stroke: currentColor;\n  stroke-width: 1.75;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n  transition: transform 150ms cubic-bezier(0.22, 1, 0.36, 1);\n}\n\n.ytst-speed-chip.is-open .ytst-speed-chevron {\n  transform: rotate(180deg);\n}\n\n.ytst-speed-menu {\n  position: fixed;\n  z-index: 2147483647;\n  display: none;\n  width: 184px;\n  max-height: 296px;\n  padding: 6px;\n  overflow-y: auto;\n  border: 1px solid rgba(255, 255, 255, 0.08);\n  border-radius: 12px;\n  background: rgba(20, 20, 20, 0.98);\n  -webkit-backdrop-filter: blur(16px) saturate(180%);\n  backdrop-filter: blur(16px) saturate(180%);\n  color: #f1f1f1;\n  font-family: "Roboto", "Inter", sans-serif;\n  font-size: 12.5px;\n  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);\n  box-sizing: border-box;\n}\n\nhtml:not([dark]) .ytst-speed-menu {\n  border-color: rgba(15, 15, 15, 0.1);\n  background: rgba(255, 255, 255, 0.98);\n  color: #0f0f0f;\n  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);\n}\n\n.ytst-speed-menu::-webkit-scrollbar {\n  width: 6px;\n}\n\n.ytst-speed-menu::-webkit-scrollbar-thumb {\n  border-radius: 3px;\n  background: rgba(128, 128, 128, 0.4);\n}\n\n.ytst-speed-preset {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  width: 100%;\n  height: 30px;\n  padding: 0 8px;\n  border: 0;\n  border-radius: 6px;\n  background: transparent;\n  color: inherit;\n  font-family: "JetBrains Mono", "SFMono-Regular", ui-monospace, monospace;\n  font-size: 12px;\n  font-variant-numeric: tabular-nums;\n  cursor: pointer;\n  text-align: left;\n}\n\n.ytst-speed-preset:hover {\n  background: rgba(255, 255, 255, 0.08);\n}\n\nhtml:not([dark]) .ytst-speed-preset:hover {\n  background: rgba(15, 15, 15, 0.06);\n}\n\n.ytst-speed-preset-check {\n  display: inline-flex;\n  opacity: 0;\n  color: #3ea6ff;\n}\n\nhtml:not([dark]) .ytst-speed-preset-check {\n  color: #065fd4;\n}\n\n.ytst-speed-preset.is-active .ytst-speed-preset-check {\n  opacity: 1;\n}\n\n.ytst-speed-divider {\n  height: 1px;\n  margin: 6px 4px;\n  background: rgba(255, 255, 255, 0.1);\n}\n\nhtml:not([dark]) .ytst-speed-divider {\n  background: rgba(15, 15, 15, 0.1);\n}\n\n.ytst-speed-caption {\n  padding: 6px 8px 2px;\n  color: rgba(255, 255, 255, 0.5);\n  font-size: 10px;\n  font-weight: 600;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\nhtml:not([dark]) .ytst-speed-caption {\n  color: rgba(15, 15, 15, 0.5);\n}\n\n.ytst-speed-mini {\n  display: block;\n  width: calc(100% - 16px);\n  height: 20px;\n  margin: 2px 8px 4px;\n  appearance: none;\n  -webkit-appearance: none;\n  background: transparent;\n  cursor: pointer;\n}\n\n.ytst-speed-mini::-webkit-slider-runnable-track {\n  height: 3px;\n  border-radius: 2px;\n  background: rgba(255, 255, 255, 0.3);\n}\n\n.ytst-speed-mini::-webkit-slider-thumb {\n  width: 12px;\n  height: 12px;\n  margin-top: -4.5px;\n  appearance: none;\n  -webkit-appearance: none;\n  border: 0;\n  border-radius: 50%;\n  background: #ffffff;\n}\n\nhtml:not([dark]) .ytst-speed-mini::-webkit-slider-runnable-track {\n  background: rgba(15, 15, 15, 0.2);\n}\n\nhtml:not([dark]) .ytst-speed-mini::-webkit-slider-thumb {\n  background: #0f0f0f;\n}\n\n.ytst-speed-reset {\n  display: block;\n  width: calc(100% - 16px);\n  height: 28px;\n  margin: 4px 8px 2px;\n  border: 1px solid rgba(255, 255, 255, 0.1);\n  border-radius: 8px;\n  background: transparent;\n  color: inherit;\n  font-family: inherit;\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.ytst-speed-reset:hover {\n  background: rgba(255, 255, 255, 0.08);\n}\n\nhtml:not([dark]) .ytst-speed-reset {\n  border-color: rgba(15, 15, 15, 0.1);\n}\n\nhtml:not([dark]) .ytst-speed-reset:hover {\n  background: rgba(15, 15, 15, 0.06);\n}\n\n@media (max-width: 1400px) {\n  .ytst-speed-slider {\n    width: 76px;\n  }\n}\n\n@media (max-width: 1100px) {\n  .ytst-speed-slider {\n    display: none;\n  }\n}\n.ytst-dislike-count {\n  display: inline-flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n  align-self: center !important;\n  height: 40px !important;\n  min-height: 40px !important;\n  padding: 0 6px !important;\n  margin: 0 !important;\n  border: 0 !important;\n  color: var(--yt-spec-text-primary, #ffffff) !important;\n  font-family: "Roboto", "Inter", sans-serif !important;\n  font-size: 14px !important;\n  font-weight: 500 !important;\n  font-variant-numeric: tabular-nums !important;\n  line-height: 40px !important;\n  white-space: nowrap !important;\n  cursor: default !important;\n  user-select: none !important;\n}\n.ytst-sb-notice {\n  position: absolute;\n  left: 12px;\n  bottom: 76px;\n  z-index: 60;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  max-width: min(420px, calc(100% - 24px));\n  padding: 8px 10px 8px 12px;\n  border: 1px solid rgba(255, 255, 255, 0.1);\n  border-radius: 10px;\n  background: rgba(20, 20, 20, 0.94);\n  -webkit-backdrop-filter: blur(16px) saturate(180%);\n  backdrop-filter: blur(16px) saturate(180%);\n  color: #f1f1f1;\n  font-family: "Roboto", "Inter", sans-serif;\n  font-size: 12.5px;\n  font-weight: 500;\n  line-height: 1.25;\n  opacity: 0;\n  transform: translateY(6px);\n  pointer-events: none;\n  transition: opacity 160ms ease, transform 160ms cubic-bezier(0.22, 1, 0.36, 1);\n}\n\n.ytst-sb-notice.is-visible {\n  opacity: 1;\n  transform: none;\n  pointer-events: auto;\n}\n\n.ytst-sb-bar {\n  flex: 0 0 auto;\n  width: 3px;\n  height: 16px;\n  border-radius: 2px;\n  background: var(--ytst-sb-color, #00d400);\n}\n\n.ytst-sb-label {\n  flex: 1 1 auto;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n\n.ytst-sb-undo {\n  flex: 0 0 auto;\n  height: 24px;\n  padding: 0 9px;\n  border: 1px solid rgba(255, 255, 255, 0.12);\n  border-radius: 6px;\n  background: transparent;\n  color: #f1f1f1;\n  font-family: inherit;\n  font-size: 11.5px;\n  font-weight: 500;\n  cursor: pointer;\n}\n\n.ytst-sb-undo:hover {\n  background: rgba(255, 255, 255, 0.1);\n}\n.ytst-toast {\n  position: fixed;\n  left: 24px;\n  bottom: 24px;\n  z-index: 2147483647;\n  display: inline-flex;\n  align-items: center;\n  max-width: min(360px, calc(100vw - 48px));\n  padding: 9px 12px;\n  border: 1px solid rgba(255, 255, 255, 0.08);\n  border-radius: 8px;\n  background: rgba(15, 15, 15, 0.92);\n  -webkit-backdrop-filter: blur(16px) saturate(180%);\n  backdrop-filter: blur(16px) saturate(180%);\n  color: #f1f1f1;\n  font-family: "Roboto", "Inter", sans-serif;\n  font-size: 12.5px;\n  font-weight: 500;\n  line-height: 1.35;\n  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);\n  opacity: 0;\n  transform: translateY(6px);\n  pointer-events: none;\n  transition: opacity 160ms ease, transform 160ms cubic-bezier(0.22, 1, 0.36, 1);\n}\n\n.ytst-toast.is-visible {\n  opacity: 1;\n  transform: none;\n}\n\nhtml:not([dark]) .ytst-toast {\n  border-color: rgba(15, 15, 15, 0.1);\n  background: rgba(255, 255, 255, 0.94);\n  color: #0f0f0f;\n  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);\n}\nhtml[data-ytst-no-shorts="on"] ytd-guide-entry-renderer:has(a[title="Shorts"]),\nhtml[data-ytst-no-shorts="on"] ytd-mini-guide-entry-renderer:has(a[title="Shorts"]),\nhtml[data-ytst-no-shorts="on"] ytd-guide-entry-renderer:has(a[href^="/shorts"]),\nhtml[data-ytst-no-shorts="on"] ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),\nhtml[data-ytst-no-shorts="on"] ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),\nhtml[data-ytst-no-shorts="on"] ytd-rich-item-renderer:has(a[href^="/shorts/"]),\nhtml[data-ytst-no-shorts="on"] ytd-video-renderer:has(a[href^="/shorts/"]),\nhtml[data-ytst-no-shorts="on"] ytd-grid-video-renderer:has(a[href^="/shorts/"]),\nhtml[data-ytst-no-shorts="on"] ytm-video-with-context-renderer:has(a[href^="/shorts/"]),\nhtml[data-ytst-no-shorts="on"] ytm-compact-video-renderer:has(a[href^="/shorts/"]),\nhtml[data-ytst-no-shorts="on"] [tab-title="Shorts"],\nhtml[data-ytst-no-shorts="on"] ytd-reel-shelf-renderer,\nhtml[data-ytst-no-shorts="on"] ytd-rich-shelf-renderer[is-shorts],\nhtml[data-ytst-no-shorts="on"] ytm-reel-shelf-renderer,\nhtml[data-ytst-no-shorts="on"] ytm-shorts-lockup-view-model,\nhtml[data-ytst-no-shorts="on"] ytm-shorts-lockup-view-model-v2,\nhtml[data-ytst-no-shorts="on"] .pivot-shorts,\nhtml[data-ytst-no-shorts="on"] a[href="/shorts"],\n\nhtml[data-ytst-no-shorts="on"] grid-shelf-view-model,\nhtml[data-ytst-no-shorts="on"] grid-shelf-view-model.ytGridShelfViewModelHost,\nhtml[data-ytst-no-shorts="on"] [class*="ytGridShelfViewModelHost"],\nhtml[data-ytst-no-shorts="on"] .ytGridShelfViewModelGridShelfBottomButtonContainer,\nhtml[data-ytst-no-shorts="on"] [class*="ytGridShelfViewModelGridShelfBottomButtonContainer"] {\n  display: none !important;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .ytst-toast,\n  .ytst-sb-notice,\n  .ytst-speed-chevron,\n  .ytst-speed-chip {\n    transition-duration: 0ms;\n  }\n}\n';
  const FEATURE_GROUPS = [
    { id: "browse", label: "Browse", icon: "home" },
    { id: "player", label: "Player", icon: "play" },
    { id: "blocking", label: "Blocking", icon: "shield" }
  ];
  const SPONSOR_CATEGORIES = {
    sponsor: { label: "Sponsor", color: "#00d400", enabled: true },
    selfpromo: { label: "Self-promotion", color: "#ffff00", enabled: true },
    interaction: { label: "Interaction reminder", color: "#cc00ff", enabled: true },
    intro: { label: "Intro", color: "#00ffff", enabled: false },
    outro: { label: "Outro", color: "#0202ed", enabled: false },
    preview: { label: "Preview", color: "#008fd6", enabled: false },
    music_offtopic: { label: "Off-topic music", color: "#ff9900", enabled: false },
    filler: { label: "Filler", color: "#7300ff", enabled: false }
  };
  const FEATURES = [
    {
      key: "noShorts",
      group: "browse",
      label: "Hide Shorts",
      description: "Remove Shorts shelves, tabs and feed cards.",
      icon: "shorts",
      default: true
    },
    {
      key: "cleanHomepage",
      group: "browse",
      label: "Clean homepage",
      description: "Hide promos, surveys, Playables and live shelves.",
      icon: "home",
      default: true
    },
    {
      key: "dislike",
      group: "player",
      label: "Return dislike",
      description: "Show the estimated dislike count on videos.",
      icon: "thumbdown",
      default: true
    },
    {
      key: "nonstop",
      group: "player",
      label: "Auto continue",
      description: "Dismiss the “Video paused. Continue watching?” prompt.",
      icon: "repeat",
      default: true
    },
    {
      key: "sponsorblock",
      group: "player",
      label: "SponsorBlock",
      description: "Skip community-submitted sponsored segments.",
      icon: "skip",
      default: true
    },
    {
      key: "speed",
      group: "player",
      label: "Playback speed",
      description: "Add a speed slider, presets and keyboard shortcuts.",
      icon: "gauge",
      default: true
    },
    {
      key: "pip",
      group: "player",
      label: "Picture in picture",
      description: "Pop the video into a floating window.",
      icon: "pip",
      default: true
    },
    {
      key: "screenshot",
      group: "player",
      label: "Screenshot",
      description: "Save the current video frame as a PNG.",
      icon: "camera",
      default: true
    },
    {
      key: "downloader",
      group: "player",
      label: "Downloader",
      description: "Download MP4 360p directly, or open ytmp3pc.com for other formats.",
      icon: "download",
      default: true
    },
    {
      key: "adblock",
      group: "blocking",
      label: "Ad blocking",
      description: "Three layers: player data rewrite, cosmetic CSS and player skip.",
      icon: "shield",
      default: false
    },
    {
      key: "adblockPrune",
      group: "blocking",
      label: "JSON prune",
      description: "Rename ad placements in player data before playback.",
      icon: "braces",
      badge: "L1",
      default: true,
      dependsOn: "adblock"
    },
    {
      key: "adblockCosmetic",
      group: "blocking",
      label: "Cosmetic filtering",
      description: "Hide feed, masthead and sidebar ad slots.",
      icon: "layers",
      badge: "L2",
      default: true,
      dependsOn: "adblock"
    },
    {
      key: "adblockSkipper",
      group: "blocking",
      label: "Player fallback",
      description: "Mute and skip any ad that still reaches the player.",
      icon: "fast",
      badge: "L3",
      default: true,
      dependsOn: "adblock"
    }
  ];
  const EXTRA_DEFAULTS = {
    sponsorblockCategories: null,
    sponsorblockNotice: true,
    playbackSpeed: 1
  };
  const DEFAULTS = Object.fromEntries([
    ...FEATURES.map((feature) => [feature.key, feature.default]),
    ...Object.entries(EXTRA_DEFAULTS)
  ]);
  const STORAGE_KEYS = Object.keys(DEFAULTS);
  const MUTATION_FEATURES = ["dislike", "noShorts", "cleanHomepage", "nonstop", "downloader"];
  const PLAYER_FEATURES = ["speed", "pip", "screenshot", "downloader"];
  const CONTENT_FEATURES = FEATURES.filter((feature) => !feature.dependsOn).map((feature) => feature.key);
  const featuresForGroup = (groupId) => FEATURES.filter((feature) => feature.group === groupId);
  function createSettings({ storage }) {
    const values = { ...DEFAULTS };
    const listeners = /* @__PURE__ */ new Set();
    const emit = (key) => {
      for (const listener of listeners) {
        try {
          listener(key, values[key], values);
        } catch (error) {
          console.warn("YT SuperTool settings listener failed:", error);
        }
      }
    };
    const get = (key) => values[key];
    const set = async (key, value) => {
      const previous = values[key];
      values[key] = value;
      emit(key);
      try {
        await storage.set(key, value);
        return true;
      } catch (error) {
        console.warn(`YT SuperTool could not save "${key}":`, error);
        values[key] = previous;
        emit(key);
        return false;
      }
    };
    const setMany = async (patch) => {
      await Promise.all(Object.entries(patch).map(([key, value]) => set(key, value)));
    };
    const reset = async () => {
      await setMany(DEFAULTS);
    };
    const load = async () => {
      const entries = await Promise.all(
        Object.keys(DEFAULTS).map(async (key) => [key, await storage.get(key, DEFAULTS[key])])
      );
      entries.forEach(([key, value]) => {
        values[key] = value === void 0 || value === null ? DEFAULTS[key] : value;
      });
      emit(null);
      return values;
    };
    const subscribe = (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    storage.onChanged((changes) => {
      Object.keys(changes).forEach((key) => {
        if (!STORAGE_KEYS.includes(key)) return;
        const next = changes[key]?.newValue;
        values[key] = next === void 0 || next === null ? DEFAULTS[key] : next;
        emit(key);
      });
    }, STORAGE_KEYS);
    return {
      load,
      get,
      set,
      setMany,
      reset,
      subscribe,
      values
    };
  }
  function createLifecycleManager({ onNavigate = () => {
  }, onMutations = () => {
  }, root = document, delay = 300 } = {}) {
    let observer = null;
    let timer = 0;
    let pending = [];
    let started = false;
    const flush = () => {
      timer = 0;
      const mutations = pending;
      pending = [];
      if (!mutations.length) return;
      try {
        onMutations(mutations);
      } catch (error) {
        console.warn("YT SuperTool mutation pass failed:", error);
      }
    };
    const handleMutation = (mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" || mutation.addedNodes.length || mutation.removedNodes.length) {
          pending.push(mutation);
        }
      }
      if (pending.length > 1e3) pending.splice(0, pending.length - 1e3);
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    };
    const handleNavigation = () => {
      try {
        onNavigate();
      } catch (error) {
        console.warn("YT SuperTool navigation pass failed:", error);
      }
    };
    return {
      start() {
        if (started) return this;
        started = true;
        root.addEventListener("yt-navigate-finish", handleNavigation);
        root.addEventListener("yt-page-data-updated", handleNavigation);
        const target2 = root.documentElement || root.body;
        if (target2) {
          observer = new MutationObserver(handleMutation);
          observer.observe(target2, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "style", "dark", "light", "dark-theme", "hidden", "aria-hidden"]
          });
        }
        return this;
      },
      stop() {
        started = false;
        root.removeEventListener("yt-navigate-finish", handleNavigation);
        root.removeEventListener("yt-page-data-updated", handleNavigation);
        observer?.disconnect();
        observer = null;
        clearTimeout(timer);
        timer = 0;
        pending = [];
        return this;
      },
      refresh: handleNavigation
    };
  }
  const themeCss = ':host {\n  all: initial;\n\n  --ytst-font: "Roboto", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\n  --ytst-mono: "JetBrains Mono", "SFMono-Regular", ui-monospace, Menlo, monospace;\n  --ytst-space-1: 4px;\n  --ytst-space-2: 8px;\n  --ytst-space-3: 12px;\n  --ytst-space-4: 16px;\n\n  --ytst-surface: rgba(15, 15, 15, 0.88);\n  --ytst-elevated: rgba(255, 255, 255, 0.04);\n  --ytst-elevated-hover: rgba(255, 255, 255, 0.08);\n  --ytst-line: rgba(255, 255, 255, 0.08);\n  --ytst-line-strong: rgba(255, 255, 255, 0.14);\n  --ytst-text: #f1f1f1;\n  --ytst-text-muted: #aaaaaa;\n  --ytst-text-faint: #717171;\n  --ytst-accent: #ff0033;\n  --ytst-accent-control: #3ea6ff;\n  --ytst-track: rgba(255, 255, 255, 0.2);\n  --ytst-focus: #3ea6ff;\n  --ytst-backdrop: rgba(0, 0, 0, 0.6);\n  --ytst-radius-panel: 12px;\n  --ytst-radius-item: 8px;\n  --ytst-shadow: 0 18px 48px rgba(0, 0, 0, 0.44);\n\n  display: block;\n  font-family: var(--ytst-font);\n  font-size: 13px;\n  color: var(--ytst-text);\n  color-scheme: dark;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n}\n\n:host([data-theme="light"]) {\n  --ytst-surface: rgba(255, 255, 255, 0.92);\n  --ytst-elevated: rgba(15, 15, 15, 0.045);\n  --ytst-elevated-hover: rgba(15, 15, 15, 0.08);\n  --ytst-line: rgba(15, 15, 15, 0.1);\n  --ytst-line-strong: rgba(15, 15, 15, 0.18);\n  --ytst-text: #0f0f0f;\n  --ytst-text-muted: #606060;\n  --ytst-text-faint: #909090;\n  --ytst-track: rgba(15, 15, 15, 0.24);\n  --ytst-backdrop: rgba(15, 15, 15, 0.4);\n  --ytst-shadow: 0 18px 48px rgba(0, 0, 0, 0.18);\n  color-scheme: light;\n}\n\n* {\n  box-sizing: border-box;\n}\n\n.ytst-overlay {\n  position: fixed;\n  inset: 0;\n  z-index: 2147483000;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 24px;\n  background: var(--ytst-backdrop);\n  opacity: 0;\n  visibility: hidden;\n  transition: opacity 160ms ease, visibility 0s linear 160ms;\n}\n\n.ytst-overlay[data-open="true"] {\n  opacity: 1;\n  visibility: visible;\n  transition: opacity 160ms ease;\n}\n\n.ytst-panel {\n  display: grid;\n  grid-template-rows: auto minmax(0, 1fr) auto;\n  width: min(640px, 100%);\n  height: min(520px, 100%);\n  overflow: hidden;\n  border: 1px solid var(--ytst-line);\n  border-radius: var(--ytst-radius-panel);\n  background: var(--ytst-surface);\n  -webkit-backdrop-filter: blur(16px) saturate(180%);\n  backdrop-filter: blur(16px) saturate(180%);\n  box-shadow: var(--ytst-shadow);\n  transform: translateY(8px) scale(0.995);\n  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);\n}\n\n.ytst-overlay[data-open="true"] .ytst-panel {\n  transform: none;\n}\n\n.ytst-panel:focus {\n  outline: none;\n}\n\n.ytst-header {\n  display: flex;\n  align-items: center;\n  gap: var(--ytst-space-3);\n  padding: var(--ytst-space-3) var(--ytst-space-4);\n  border-bottom: 1px solid var(--ytst-line);\n}\n\n.ytst-brand {\n  display: grid;\n  flex: 0 0 28px;\n  width: 28px;\n  height: 28px;\n  place-items: center;\n  border-radius: 8px;\n  background: var(--ytst-accent);\n  color: #ffffff;\n}\n\n.ytst-brand svg {\n  display: block;\n  width: 16px;\n  height: 16px;\n}\n\n.ytst-header-copy {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 0;\n}\n\n.ytst-title {\n  margin: 0;\n  color: var(--ytst-text);\n  font-family: var(--ytst-font);\n  font-size: 14px;\n  font-weight: 600;\n  line-height: 1.2;\n  letter-spacing: -0.01em;\n}\n\n.ytst-subtitle {\n  color: var(--ytst-text-muted);\n  font-size: 11px;\n  line-height: 1.2;\n}\n\n.ytst-badge {\n  padding: 2px 5px;\n  border: 1px solid var(--ytst-line);\n  border-radius: 4px;\n  color: var(--ytst-text-muted);\n  font-family: var(--ytst-mono);\n  font-size: 10px;\n  font-weight: 500;\n  font-variant-numeric: tabular-nums;\n  letter-spacing: 0.02em;\n  line-height: 1.2;\n}\n\n.ytst-header-actions {\n  display: flex;\n  align-items: center;\n  gap: var(--ytst-space-2);\n  margin-left: auto;\n}\n\n.ytst-icon-button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 30px;\n  height: 30px;\n  padding: 0;\n  border: 0;\n  border-radius: var(--ytst-radius-item);\n  background: transparent;\n  color: var(--ytst-text-muted);\n  cursor: pointer;\n  transition: background-color 120ms ease, color 120ms ease;\n}\n\n.ytst-icon-button:hover {\n  background: var(--ytst-elevated-hover);\n  color: var(--ytst-text);\n}\n\n.ytst-icon-button:active {\n  background: var(--ytst-elevated);\n}\n\n.ytst-body {\n  display: grid;\n  grid-template-columns: 168px minmax(0, 1fr);\n  min-height: 0;\n}\n\n.ytst-rail {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  padding: var(--ytst-space-2);\n  overflow-y: auto;\n  border-right: 1px solid var(--ytst-line);\n  scrollbar-width: thin;\n  scrollbar-color: var(--ytst-line-strong) transparent;\n}\n\n.ytst-tab {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  height: 34px;\n  min-height: 34px;\n  padding: 0 10px;\n  border: 0;\n  border-radius: var(--ytst-radius-item);\n  background: transparent;\n  color: var(--ytst-text-muted);\n  font-family: var(--ytst-font);\n  font-size: 13px;\n  font-weight: 500;\n  text-align: left;\n  cursor: pointer;\n  transition: background-color 120ms ease, color 120ms ease;\n}\n\n.ytst-tab svg {\n  flex: 0 0 18px;\n  opacity: 0.9;\n}\n\n.ytst-tab:hover {\n  background: var(--ytst-elevated);\n  color: var(--ytst-text);\n}\n\n.ytst-tab[aria-selected="true"] {\n  background: var(--ytst-elevated-hover);\n  color: var(--ytst-text);\n}\n\n.ytst-tab-count {\n  margin-left: auto;\n  color: var(--ytst-text-faint);\n  font-family: var(--ytst-mono);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n.ytst-tab[aria-selected="true"] .ytst-tab-count {\n  color: var(--ytst-text-muted);\n}\n\n.ytst-content {\n  min-height: 0;\n  padding: 8px 8px 12px;\n  overflow-y: auto;\n  scrollbar-width: thin;\n  scrollbar-color: var(--ytst-line-strong) transparent;\n}\n\n.ytst-content::-webkit-scrollbar {\n  width: 8px;\n}\n\n.ytst-content::-webkit-scrollbar-track {\n  background: transparent;\n}\n\n.ytst-content::-webkit-scrollbar-thumb {\n  border: 2px solid transparent;\n  border-radius: 8px;\n  background: var(--ytst-line-strong);\n  background-clip: content-box;\n}\n\n.ytst-tabpanel[hidden] {\n  display: none;\n}\n\n.ytst-group {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.ytst-group-head {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: var(--ytst-space-2);\n  padding: 4px 8px 8px;\n}\n\n.ytst-group-title {\n  margin: 0;\n  color: var(--ytst-text-faint);\n  font-family: var(--ytst-font);\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n.ytst-group-meta {\n  color: var(--ytst-text-faint);\n  font-family: var(--ytst-mono);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n.ytst-section {\n  margin: 12px 8px 4px;\n  color: var(--ytst-text-faint);\n  font-family: var(--ytst-font);\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n.ytst-row {\n  display: flex;\n  align-items: center;\n  gap: var(--ytst-space-3);\n  min-height: 52px;\n  padding: 8px 10px;\n  border-radius: var(--ytst-radius-item);\n  cursor: pointer;\n  transition: background-color 120ms ease;\n}\n\n.ytst-row:hover {\n  background: var(--ytst-elevated);\n}\n\n.ytst-row.is-disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n\n.ytst-row-icon {\n  display: inline-flex;\n  flex: 0 0 20px;\n  color: var(--ytst-text-muted);\n}\n\n.ytst-row:hover .ytst-row-icon {\n  color: var(--ytst-text);\n}\n\n.ytst-row-copy {\n  display: flex;\n  flex: 1 1 auto;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 0;\n}\n\n.ytst-row-label {\n  color: var(--ytst-text);\n  font-size: 13.5px;\n  font-weight: 500;\n  line-height: 1.25;\n}\n\n.ytst-row-desc {\n  color: var(--ytst-text-muted);\n  font-size: 11.5px;\n  line-height: 1.35;\n}\n\n.ytst-row-meta {\n  display: flex;\n  flex: 0 0 auto;\n  align-items: center;\n  gap: 8px;\n}\n\n.ytst-badge-layer {\n  padding: 1px 4px;\n  border: 1px solid var(--ytst-line);\n  border-radius: 4px;\n  color: var(--ytst-text-faint);\n  font-family: var(--ytst-mono);\n  font-size: 9.5px;\n  font-weight: 500;\n  font-variant-numeric: tabular-nums;\n  letter-spacing: 0.04em;\n  line-height: 1.4;\n}\n\n.ytst-switch-input {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  margin: -1px;\n  padding: 0;\n  overflow: hidden;\n  clip: rect(0 0 0 0);\n  white-space: nowrap;\n  border: 0;\n}\n\n.ytst-switch {\n  position: relative;\n  flex: 0 0 36px;\n  width: 36px;\n  height: 20px;\n  border-radius: 999px;\n  background: var(--ytst-track);\n  transition: background-color 150ms cubic-bezier(0.22, 1, 0.36, 1);\n}\n\n.ytst-switch-thumb {\n  position: absolute;\n  top: 2px;\n  left: 2px;\n  width: 16px;\n  height: 16px;\n  border-radius: 50%;\n  background: #f1f1f1;\n  transition: transform 150ms cubic-bezier(0.22, 1, 0.36, 1);\n}\n\n.ytst-switch-input:checked + .ytst-switch {\n  background: var(--ytst-accent-control);\n}\n\n.ytst-switch-input:checked + .ytst-switch .ytst-switch-thumb {\n  background: #ffffff;\n  transform: translateX(16px);\n}\n\n.ytst-switch-input:focus-visible + .ytst-switch {\n  outline: 2px solid var(--ytst-focus);\n  outline-offset: 2px;\n}\n\n.ytst-switch-input:disabled + .ytst-switch {\n  opacity: 0.55;\n}\n\n.ytst-footer {\n  display: flex;\n  align-items: center;\n  gap: var(--ytst-space-3);\n  padding: 10px 14px;\n  border-top: 1px solid var(--ytst-line);\n}\n\n.ytst-status {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n  color: var(--ytst-text-muted);\n  font-size: 11.5px;\n  line-height: 1.2;\n}\n\n.ytst-status-dot {\n  flex: 0 0 5px;\n  width: 5px;\n  height: 5px;\n  border-radius: 50%;\n  background: var(--ytst-accent-control);\n}\n\n.ytst-footer-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--ytst-space-2);\n  margin-left: auto;\n}\n\n.ytst-button {\n  height: 30px;\n  padding: 0 12px;\n  border: 1px solid var(--ytst-line);\n  border-radius: var(--ytst-radius-item);\n  background: transparent;\n  color: var(--ytst-text);\n  font-family: var(--ytst-font);\n  font-size: 12px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: background-color 120ms ease;\n}\n\n.ytst-button:hover {\n  background: var(--ytst-elevated-hover);\n}\n\n.ytst-button-primary {\n  border-color: transparent;\n  background: var(--ytst-text);\n  color: #0f0f0f;\n}\n\n.ytst-button-primary:hover {\n  background: #d9d9d9;\n  color: #0f0f0f;\n}\n\n:host([data-theme="light"]) .ytst-button-primary {\n  background: #0f0f0f;\n  color: #ffffff;\n}\n\n:host([data-theme="light"]) .ytst-button-primary:hover {\n  background: #272727;\n}\n\n.ytst-button:focus-visible,\n.ytst-tab:focus-visible,\n.ytst-icon-button:focus-visible {\n  outline: 2px solid var(--ytst-focus);\n  outline-offset: 2px;\n}\n\n@media (max-width: 720px) {\n  .ytst-overlay {\n    padding: 12px;\n  }\n\n  .ytst-panel {\n    height: min(560px, 100%);\n  }\n\n  .ytst-body {\n    grid-template-columns: 1fr;\n    grid-template-rows: auto minmax(0, 1fr);\n  }\n\n  .ytst-rail {\n    flex-direction: row;\n    gap: 6px;\n    padding: var(--ytst-space-2);\n    overflow-x: auto;\n    border-right: 0;\n    border-bottom: 1px solid var(--ytst-line);\n  }\n\n  .ytst-tab {\n    flex: 0 0 auto;\n    padding: 0 10px;\n  }\n\n  .ytst-tab-count {\n    display: none;\n  }\n}\n\n.ytst-sb {\n  display: grid;\n  grid-template-rows: 0fr;\n  opacity: 0;\n  transition: grid-template-rows 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease;\n}\n\n.ytst-sb[data-open="true"] {\n  grid-template-rows: 1fr;\n  opacity: 1;\n}\n\n.ytst-sb-inner {\n  min-height: 0;\n  overflow: hidden;\n}\n\n.ytst-sb-list {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 1px 10px;\n  padding: 2px 10px 2px 42px;\n}\n\n.ytst-sb-cat,\n.ytst-sb-notice {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  color: var(--ytst-text-muted);\n  font-size: 11.5px;\n  cursor: pointer;\n}\n\n.ytst-sb-cat {\n  min-height: 26px;\n}\n\n.ytst-sb-cat:hover,\n.ytst-sb-notice:hover {\n  color: var(--ytst-text);\n}\n\n.ytst-sb-cat input,\n.ytst-sb-notice input {\n  width: 14px;\n  height: 14px;\n  margin: 0;\n  accent-color: var(--ytst-accent-control);\n}\n\n.ytst-sb-dot {\n  flex: 0 0 7px;\n  width: 7px;\n  height: 7px;\n  border-radius: 50%;\n}\n\n.ytst-sb-notice {\n  margin: 4px 10px 8px 42px;\n  padding-top: 8px;\n  border-top: 1px solid var(--ytst-line);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .ytst-overlay,\n  .ytst-panel,\n  .ytst-tab,\n  .ytst-row,\n  .ytst-switch,\n  .ytst-switch-thumb,\n  .ytst-sb {\n    transition-duration: 0ms;\n  }\n}\n';
  const SVG_NS = "http://www.w3.org/2000/svg";
  const applyAttributes = (element, attributes) => {
    for (const [key, value] of Object.entries(attributes || {})) {
      if (value === null || value === void 0 || value === false) continue;
      if (key === "className") {
        element.setAttribute("class", value);
      } else if (key === "dataset" && typeof value === "object") {
        Object.entries(value).forEach(([name, data]) => {
          element.dataset[name] = String(data);
        });
      } else if (key === "textContent") {
        element.textContent = String(value);
      } else {
        element.setAttribute(key, value === true ? "" : String(value));
      }
    }
  };
  const appendChildren = (element, children) => {
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child === null || child === void 0 || child === false) continue;
      element.appendChild(
        typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child
      );
    }
  };
  function createElement(tagName, attributes = {}, children = []) {
    const element = document.createElement(tagName);
    applyAttributes(element, attributes);
    appendChildren(element, children);
    return element;
  }
  function createSvgElement(tagName, attributes = {}, children = []) {
    const element = document.createElementNS(SVG_NS, tagName);
    applyAttributes(element, attributes);
    appendChildren(element, children);
    return element;
  }
  const ICONS = {
    home: [
      ["path", { d: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9.5Z" }]
    ],
    play: [
      ["path", { d: "M9 6.5v11l9-5.5-9-5.5Z" }]
    ],
    shield: [
      ["path", { d: "M12 3.2 5 6v5.4c0 4.2 2.9 7.3 7 8.4 4.1-1.1 7-4.2 7-8.4V6l-7-2.8Z" }],
      ["path", { d: "m9.2 12.2 2.1 2.1 3.9-4" }]
    ],
    shorts: [
      ["rect", { x: "7", y: "3", width: "10", height: "18", rx: "3" }],
      ["path", { d: "m11 9.2 4 2.8-4 2.8V9.2Z" }]
    ],
    thumbdown: [
      ["path", { d: "M7 3v10" }],
      ["path", { d: "M7 13.5 10.6 20a1.8 1.8 0 0 0 3.2-1.4L13.2 15H18a2 2 0 0 0 2-2.4l-1.2-6A2 2 0 0 0 16.8 5H7" }],
      ["path", { d: "M4 3v10h3" }]
    ],
    repeat: [
      ["path", { d: "M4 9V8a4 4 0 0 1 4-4h10" }],
      ["polyline", { points: "15 1 18 4 15 7" }],
      ["path", { d: "M20 15v1a4 4 0 0 1-4 4H6" }],
      ["polyline", { points: "9 17 6 20 9 23" }]
    ],
    skip: [
      ["path", { d: "M5 5.5v13l9-6.5-9-6.5Z" }],
      ["path", { d: "M18 5v14" }]
    ],
    gauge: [
      ["path", { d: "M4.2 18a9 9 0 1 1 15.6 0" }],
      ["path", { d: "m12 14 4.5-4.5" }],
      ["circle", { cx: "12", cy: "14", r: "1.4" }]
    ],
    pip: [
      ["rect", { x: "3", y: "5", width: "18", height: "14", rx: "2" }],
      ["rect", { x: "12.5", y: "11.5", width: "6", height: "4.5", rx: "1" }]
    ],
    camera: [
      ["path", { d: "M5 8.5h3l1.5-2.2h5L16 8.5h3a2 2 0 0 1 2 2v6.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6.8a2 2 0 0 1 2-2Z" }],
      ["circle", { cx: "12", cy: "13.4", r: "3.2" }]
    ],
    download: [
      ["path", { d: "M12 4v10" }],
      ["path", { d: "m8 10.5 4 4 4-4" }],
      ["path", { d: "M5 19.5h14" }]
    ],
    braces: [
      ["path", { d: "M9 4 4.5 12 9 20" }],
      ["path", { d: "M15 4l4.5 8L15 20" }]
    ],
    layers: [
      ["path", { d: "m12 3.5 8 4-8 4-8-4 8-4Z" }],
      ["path", { d: "m4 12 8 4 8-4" }],
      ["path", { d: "m4 16.5 8 4 8-4" }]
    ],
    fast: [
      ["path", { d: "m6 5.5 6 6.5-6 6.5" }],
      ["path", { d: "m13 5.5 6 6.5-6 6.5" }]
    ],
    chevron: [
      ["path", { d: "m6 9.5 6 6 6-6" }]
    ],
    close: [
      ["path", { d: "m6 6 12 12" }],
      ["path", { d: "M18 6 6 18" }]
    ],
    check: [
      ["path", { d: "m5 12.5 4.5 4.5L19 7.5" }]
    ],
    reset: [
      ["path", { d: "M4.5 5.5V10H9" }],
      ["path", { d: "M5 14a7.5 7.5 0 1 0 2.2-7.2L4.5 10" }]
    ],
    sliders: [
      ["path", { d: "M4 7h10" }],
      ["path", { d: "M18 7h2" }],
      ["circle", { cx: "16", cy: "7", r: "2" }],
      ["path", { d: "M4 12h4" }],
      ["path", { d: "M12 12h8" }],
      ["circle", { cx: "10", cy: "12", r: "2" }],
      ["path", { d: "M4 17h12" }],
      ["circle", { cx: "18", cy: "17", r: "2" }]
    ]
  };
  function createIcon(name, size = 20, { strokeWidth } = {}) {
    const shapes = ICONS[name] || ICONS.sliders;
    const svg = createSvgElement("svg", {
      viewBox: "0 0 24 24",
      width: String(size),
      height: String(size),
      fill: "none",
      stroke: "currentColor",
      "stroke-width": String(strokeWidth || (size <= 16 ? 1.5 : 1.75)),
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
      className: "ytst-icon"
    });
    for (const [tag, attributes] of shapes) {
      svg.appendChild(createSvgElement(tag, attributes));
    }
    return svg;
  }
  function createBrandMark(size = 16) {
    const svg = createSvgElement("svg", {
      viewBox: "0 0 24 24",
      width: String(size),
      height: String(size),
      fill: "currentColor",
      "aria-hidden": "true",
      focusable: "false",
      className: "ytst-icon"
    });
    svg.appendChild(createSvgElement("path", { d: "M9.4 6.1v11.8L19 12 9.4 6.1Z" }));
    return svg;
  }
  const UI_STRINGS = {
    appName: "YT SuperTool",
    appSubtitle: "Player, feed and blocking controls",
    settings: "YouTube settings",
    settingsTitle: "YT SuperTool settings",
    settingGroups: "Setting groups",
    defenceLayers: "Defence layers",
    saved: "Saved",
    savedLocally: "Saved locally",
    reset: "Reset",
    done: "Done",
    close: "Close",
    closeSettings: "Close settings",
    defaultsRestored: "Defaults restored",
    saveCategoriesFailed: "Could not save categories",
    saveSettingFailed: "Could not save that setting",
    saveCategoriesError: "Unable to save categories",
    saveNoticeError: "Unable to save notice setting",
    saveError: "Unable to save setting",
    loadError: "Unable to load settings",
    showSkipNotice: "Show a skip notice with undo",
    undo: "Undo",
    custom: "Custom",
    customPlaybackSpeed: "Custom playback speed",
    resetTo1x: "Reset to 1x",
    playbackSpeed: "Playback speed",
    playbackSpeedPresets: "Playback speed presets",
    download: "Download",
    downloadVideo: "Download video",
    downloadThisVideo: "Download this video",
    cancel: "Cancel",
    readingPlayerResponse: "Reading player response...",
    readFailed: "Could not read the player response",
    directMp4: "Direct · MP4",
    videoAudioSaved: "Video + audio · saved directly",
    mp4Unavailable: "MP4 360p unavailable",
    noSingleStream: "No single-stream video for this one",
    highQuality: "MP4/MP3 (High Quality)",
    copiesLink: "Copies the link, opens a new tab",
    linkCopied: "Link copied — paste it on ytmp3pc.com",
    copyFailed: "Could not copy the link",
    downloadCancelled: "Download cancelled",
    downloadFailedToast: "Download failed",
    unknownError: "Unknown error",
    downloadingMp4: "Downloading MP4...",
    noFrame: "No frame available yet",
    screenshotSaved: "Screenshot saved",
    screenshotFailed: "This frame cannot be captured",
    takeScreenshot: "Take screenshot",
    pictureInPicture: "Picture in picture",
    estimatedDislikes: "Estimated dislikes",
    dislikeData: "Dislike data",
    checkUpdate: "Check update",
    checkingUpdate: "Checking...",
    downloadUpdate: "Download update",
    updateCheckFailed: "Could not check for updates"
  };
  const UI_TEXT = {
    versionTarget: (version, target2) => `v${version} · ${String(target2).toUpperCase()}`,
    versionSettings: (version) => `v${version} · ${UI_STRINGS.settings}`,
    manifestTarget: (version) => `MV${version}`,
    speedPreset: (speed) => `${speed} speed`,
    skipped: (label, seconds) => `Skipped ${label} · ${seconds}s`,
    otherFormats: (label) => `Other formats · ${label}`,
    menuFoot: (label) => `Only the single-stream MP4 downloads in place. High quality MP4 and MP3 continue on ${label} with the link copied for you.`,
    downloadFailed: (reason) => `Download failed: ${reason}`,
    downloadProgress: (percent, size) => `Downloading MP4 · ${percent}%${size ? ` · ${size}` : ""}`,
    savedFile: (fileName) => `Saved · ${fileName}`,
    upToDate: (version) => `Up to date · v${version}`,
    updateAvailable: (version) => `v${version} available`
  };
  function createSponsorAccordion({ onChange, onNoticeChange } = {}) {
    const inputs = /* @__PURE__ */ new Map();
    const list = createElement("div", { className: "ytst-sb-list" });
    Object.entries(SPONSOR_CATEGORIES).forEach(([key, category]) => {
      const input = createElement("input", { type: "checkbox" });
      input.checked = Boolean(category.enabled);
      input.dataset.category = key;
      const dot = createElement("span", { className: "ytst-sb-dot", "aria-hidden": "true" });
      dot.style.backgroundColor = category.color;
      const label = createElement("label", { className: "ytst-sb-cat" }, [
        input,
        dot,
        createElement("span", { textContent: category.label })
      ]);
      inputs.set(key, input);
      list.appendChild(label);
    });
    const notice = createElement("input", { type: "checkbox" });
    notice.checked = true;
    notice.id = `ytst-sb-notice-${Math.random().toString(36).slice(2, 8)}`;
    const noticeLabel = createElement("label", { className: "ytst-sb-notice", for: notice.id }, [
      notice,
      createElement("span", { textContent: UI_STRINGS.showSkipNotice })
    ]);
    const inner = createElement("div", { className: "ytst-sb-inner" }, [list, noticeLabel]);
    const element = createElement("div", {
      className: "ytst-sb",
      "aria-hidden": "true",
      dataset: { open: "false" }
    }, [inner]);
    element.inert = true;
    const getCategories = () => Object.fromEntries(
      [...inputs.entries()].map(([key, input]) => [key, input.checked])
    );
    list.addEventListener("change", () => onChange?.(getCategories()));
    notice.addEventListener("change", () => onNoticeChange?.(Boolean(notice.checked)));
    const setOpen = (open) => {
      const next = Boolean(open);
      if (element.dataset.open === String(next)) return;
      element.dataset.open = String(next);
      element.setAttribute("aria-hidden", String(!next));
      element.inert = !next;
    };
    const setCategories = (saved) => {
      let parsed = saved;
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          parsed = {};
        }
      }
      inputs.forEach((input, key) => {
        const fallback = Boolean(SPONSOR_CATEGORIES[key]?.enabled);
        input.checked = typeof parsed?.[key] === "boolean" ? parsed[key] : fallback;
      });
    };
    return {
      element,
      setOpen,
      setCategories,
      setNotice: (value) => {
        notice.checked = Boolean(value);
      },
      getCategories
    };
  }
  const detectDark = () => {
    const root = document.documentElement;
    if (!root) return true;
    const dark = root.getAttribute("dark");
    if (dark !== null && dark !== "false") return true;
    if (root.getAttribute("light") !== null) return false;
    const background = getComputedStyle(document.body || root).backgroundColor || "";
    const channels = background.match(/\d+(?:\.\d+)?/g)?.map(Number);
    if (channels && channels.length >= 3) {
      const [r, g, b, alpha = 1] = channels;
      if (alpha === 0) return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
      return 0.299 * r + 0.587 * g + 0.114 * b < 140;
    }
    return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  };
  function createPanel({ settings, storage, toast, update, meta = {} }) {
    const rows = /* @__PURE__ */ new Map();
    const tabs = /* @__PURE__ */ new Map();
    const panels = /* @__PURE__ */ new Map();
    const groupMeta = /* @__PURE__ */ new Map();
    let host = null;
    let shadow = null;
    let overlay = null;
    let panelEl = null;
    let content = null;
    let statusText = null;
    let previousFocus = null;
    let statusTimer = 0;
    let open = false;
    let activeGroup = FEATURE_GROUPS[0].id;
    let sponsorAccordion = null;
    let themeSignature = "";
    const buildRow = (feature) => {
      const input = createElement("input", {
        type: "checkbox",
        className: "ytst-switch-input",
        id: `ytst-${feature.key}`,
        role: "switch",
        "aria-describedby": `ytst-desc-${feature.key}`
      });
      input.dataset.key = feature.key;
      const metaCell = createElement("span", { className: "ytst-row-meta" });
      if (feature.badge) {
        metaCell.appendChild(createElement("span", {
          className: "ytst-badge-layer",
          textContent: feature.badge
        }));
      }
      const row = createElement("label", {
        className: "ytst-row",
        for: `ytst-${feature.key}`
      }, [
        createElement("span", { className: "ytst-row-icon" }, [createIcon(feature.icon, 20)]),
        createElement("span", { className: "ytst-row-copy" }, [
          createElement("span", { className: "ytst-row-label", textContent: feature.label }),
          createElement("span", {
            className: "ytst-row-desc",
            id: `ytst-desc-${feature.key}`,
            textContent: feature.description
          })
        ]),
        metaCell,
        input,
        createElement("span", { className: "ytst-switch", "aria-hidden": "true" }, [
          createElement("span", { className: "ytst-switch-thumb" })
        ])
      ]);
      rows.set(feature.key, { row, input, feature });
      return row;
    };
    const buildSponsorAccordion = () => createSponsorAccordion({
      onChange: (value) => {
        void settings.set("sponsorblockCategories", JSON.stringify(value)).then((saved) => {
          if (saved === false) toast?.show(UI_STRINGS.saveCategoriesFailed);
          else flashSaved();
        });
      },
      onNoticeChange: (checked) => {
        void settings.set("sponsorblockNotice", checked).then((saved) => {
          if (saved === false) toast?.show(UI_STRINGS.saveSettingFailed);
          else flashSaved();
        });
      }
    });
    const buildTab = (group) => {
      const features = featuresForGroup(group.id);
      const tab = createElement("button", {
        type: "button",
        className: "ytst-tab",
        role: "tab",
        id: `ytst-tab-${group.id}`,
        "aria-controls": `ytst-panel-${group.id}`,
        "aria-selected": "false",
        tabindex: "-1"
      }, [
        createIcon(group.icon, 16),
        createElement("span", { textContent: group.label }),
        createElement("span", { className: "ytst-tab-count", textContent: String(features.length) })
      ]);
      tab.addEventListener("click", () => show(group.id));
      tabs.set(group.id, tab);
      return tab;
    };
    const buildGroupPanel = (group) => {
      const features = featuresForGroup(group.id);
      const activeMeta = createElement("span", { className: "ytst-group-meta" });
      groupMeta.set(group.id, activeMeta);
      const wrapper = createElement("div", {
        className: "ytst-tabpanel",
        id: `ytst-panel-${group.id}`,
        role: "tabpanel",
        "aria-labelledby": `ytst-tab-${group.id}`
      }, [
        createElement("div", { className: "ytst-group-head" }, [
          createElement("h2", { className: "ytst-group-title", textContent: group.label }),
          activeMeta
        ])
      ]);
      const list = createElement("div", { className: "ytst-group" });
      let layerHeadingShown = false;
      for (const feature of features) {
        if (feature.dependsOn && !layerHeadingShown) {
          layerHeadingShown = true;
          list.appendChild(createElement("div", { className: "ytst-section", textContent: UI_STRINGS.defenceLayers }));
        }
        list.appendChild(buildRow(feature));
        if (feature.key === "sponsorblock") {
          sponsorAccordion = buildSponsorAccordion();
          list.appendChild(sponsorAccordion.element);
        }
      }
      wrapper.appendChild(list);
      panels.set(group.id, wrapper);
      return wrapper;
    };
    const show = (groupId) => {
      activeGroup = groupId;
      tabs.forEach((tab, id) => {
        tab.setAttribute("aria-selected", String(id === groupId));
        tab.tabIndex = id === groupId ? 0 : -1;
      });
      panels.forEach((node, id) => {
        node.hidden = id !== groupId;
      });
    };
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
      rows.forEach(({ input, row, feature }) => {
        input.checked = Boolean(settings.get(feature.key));
        const blocked = Boolean(feature.dependsOn && !settings.get(feature.dependsOn));
        input.disabled = blocked;
        row.classList.toggle("is-disabled", blocked);
      });
      groupMeta.forEach((node, groupId) => {
        const features = featuresForGroup(groupId).filter((feature) => !feature.dependsOn || settings.get(feature.dependsOn));
        const active = features.filter((feature) => settings.get(feature.key)).length;
        node.textContent = `${active}/${features.length}`;
      });
      sponsorAccordion?.setOpen(Boolean(settings.get("sponsorblock")));
      sponsorAccordion?.setCategories(settings.get("sponsorblockCategories"));
      sponsorAccordion?.setNotice(settings.get("sponsorblockNotice"));
    };
    const syncTheme = () => {
      if (!host) return;
      const root = document.documentElement;
      const signature = `${root?.getAttribute("dark")}|${root?.getAttribute("light")}|${globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches}`;
      if (signature === themeSignature) return;
      themeSignature = signature;
      host.dataset.theme = detectDark() ? "dark" : "light";
    };
    const findFocusable = () => [...shadow?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    ) || []].filter((element) => element.offsetParent !== null);
    const onKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closePanel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = findFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const ensureMounted = () => {
      if (host?.isConnected) return;
      const rail = createElement("div", {
        className: "ytst-rail",
        role: "tablist",
        "aria-label": UI_STRINGS.settingGroups,
        "aria-orientation": "vertical"
      });
      FEATURE_GROUPS.forEach((group) => rail.appendChild(buildTab(group)));
      content = createElement("div", { className: "ytst-content" });
      FEATURE_GROUPS.forEach((group) => content.appendChild(buildGroupPanel(group)));
      statusText = createElement("span", {
        className: "ytst-status-text",
        textContent: UI_STRINGS.savedLocally
      });
      const resetButton = createElement("button", { type: "button", className: "ytst-button", textContent: UI_STRINGS.reset });
      resetButton.addEventListener("click", () => {
        void settings.reset().then(() => {
          syncValues();
          flashSaved();
          toast?.show(UI_STRINGS.defaultsRestored);
        });
      });
      let pendingUpdate = "";
      const updateButton = createElement("button", {
        type: "button",
        className: "ytst-button",
        textContent: UI_STRINGS.checkUpdate
      });
      updateButton.addEventListener("click", () => {
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
          if (result.status === "available") {
            pendingUpdate = result.latest;
            updateButton.textContent = UI_STRINGS.downloadUpdate;
            showStatus(UI_TEXT.updateAvailable(result.latest));
            toast?.show(UI_TEXT.updateAvailable(result.latest));
            return;
          }
          updateButton.textContent = UI_STRINGS.checkUpdate;
          if (result.status === "current") {
            showStatus(UI_TEXT.upToDate(result.current));
            return;
          }
          showStatus(UI_STRINGS.updateCheckFailed);
          toast?.show(UI_STRINGS.updateCheckFailed);
        });
      });
      const doneButton = createElement("button", {
        type: "button",
        className: "ytst-button ytst-button-primary",
        textContent: UI_STRINGS.done
      });
      doneButton.addEventListener("click", () => closePanel());
      panelEl = createElement("section", {
        className: "ytst-panel",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "ytst-title",
        tabindex: "-1"
      }, [
        createElement("header", { className: "ytst-header" }, [
          createElement("span", { className: "ytst-brand", "aria-hidden": "true" }, [createBrandMark(16)]),
          createElement("div", { className: "ytst-header-copy" }, [
            createElement("h1", { className: "ytst-title", id: "ytst-title", textContent: UI_STRINGS.appName }),
            createElement("p", { className: "ytst-subtitle", textContent: UI_STRINGS.appSubtitle })
          ]),
          createElement("span", {
            className: "ytst-badge",
            textContent: UI_TEXT.versionTarget(meta.version || "2.4.0", meta.target || "mv3")
          }),
          createElement("div", { className: "ytst-header-actions" }, [
            (() => {
              const close = createElement("button", {
                type: "button",
                className: "ytst-icon-button",
                "aria-label": UI_STRINGS.closeSettings,
                title: UI_STRINGS.close
              }, [createIcon("close", 16)]);
              close.addEventListener("click", () => closePanel());
              return close;
            })()
          ])
        ]),
        createElement("div", { className: "ytst-body" }, [rail, content]),
        createElement("footer", { className: "ytst-footer" }, [
          createElement("span", { className: "ytst-status", role: "status", "aria-live": "polite" }, [
            createElement("span", { className: "ytst-status-dot", "aria-hidden": "true" }),
            statusText
          ]),
          createElement("div", { className: "ytst-footer-actions" }, [updateButton, resetButton, doneButton])
        ])
      ]);
      content.addEventListener("change", (event) => {
        const input = event.target;
        if (!input?.classList?.contains("ytst-switch-input")) return;
        const key = input.dataset.key;
        if (!key) return;
        const next = Boolean(input.checked);
        input.checked = next;
        void settings.set(key, next).then((saved) => {
          if (saved === false) {
            toast?.show(UI_STRINGS.saveSettingFailed);
            return;
          }
          flashSaved();
        });
      });
      rail.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const ids = [...tabs.keys()];
        const index = ids.indexOf(activeGroup);
        const next = event.key === "ArrowDown" ? ids[(index + 1) % ids.length] : ids[(index - 1 + ids.length) % ids.length];
        show(next);
        tabs.get(next)?.focus();
      });
      overlay = createElement("div", { className: "ytst-overlay", "data-open": "false" }, [panelEl]);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closePanel();
      });
      overlay.addEventListener("keydown", onKeydown);
      host = createElement("div", { id: "ytst-root", "aria-hidden": "true" });
      shadow = host.attachShadow({ mode: "open" });
      shadow.appendChild(createElement("style", { textContent: themeCss }));
      shadow.appendChild(overlay);
      (document.body || document.documentElement).appendChild(host);
      settings.subscribe(() => syncValues());
      storage?.onChanged?.(() => {
        if (open) syncValues();
      }, STORAGE_KEYS);
      show(activeGroup);
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
      overlay.dataset.open = "true";
      host.setAttribute("aria-hidden", "false");
      panelEl.focus({ preventScroll: true });
    };
    const closePanel = () => {
      if (!open) return;
      open = false;
      overlay.dataset.open = "false";
      host.setAttribute("aria-hidden", "true");
      if (previousFocus?.isConnected) {
        try {
          previousFocus.focus({ preventScroll: true });
        } catch {
        }
      }
    };
    const toggle = (force) => {
      const next = typeof force === "boolean" ? force : !open;
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
  function createLauncher({ onOpen }) {
    const handleClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      onOpen();
    };
    const ensureHeader = () => {
      const end = document.querySelector("#end.ytd-masthead") || document.getElementById("end");
      if (!end) return null;
      const existing = document.querySelector(".ytst-header-button");
      if (existing) return existing;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ytst-header-button";
      button.title = UI_STRINGS.settingsTitle;
      button.setAttribute("aria-label", UI_STRINGS.settingsTitle);
      button.appendChild(createIcon("sliders", 20));
      button.addEventListener("click", handleClick);
      const anchor = end.querySelector("#buttons, ytd-topbar-menu-button-renderer, ytd-notification-topbar-button-renderer");
      if (anchor) anchor.insertAdjacentElement("beforebegin", button);
      else end.appendChild(button);
      return button;
    };
    const ensurePlayer = (player) => {
      const controls = player?.querySelector(".ytp-right-controls");
      if (!controls) return null;
      const existing = controls.querySelector('[data-ytst="launcher"]');
      if (existing) return existing;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ytp-button ytst-player-button";
      button.dataset.ytst = "launcher";
      button.title = UI_STRINGS.settingsTitle;
      button.setAttribute("aria-label", UI_STRINGS.settingsTitle);
      button.appendChild(createIcon("sliders", 24));
      button.addEventListener("click", handleClick);
      const anchor = controls.querySelector(".ytp-settings-button") || controls.querySelector(".ytp-subtitles-button");
      if (anchor) anchor.insertAdjacentElement("beforebegin", button);
      else controls.prepend(button);
      return button;
    };
    return { ensureHeader, ensurePlayer };
  }
  function createToast() {
    let element = null;
    let timer = 0;
    const ensure = () => {
      if (element?.isConnected) return element;
      const parent = document.body || document.documentElement;
      if (!parent) return null;
      element = createElement("div", {
        className: "ytst-toast",
        role: "status",
        "aria-live": "polite"
      });
      parent.appendChild(element);
      return element;
    };
    const show = (message, duration = 2e3) => {
      const node = ensure();
      if (!node) return;
      node.textContent = message;
      node.classList.add("is-visible");
      clearTimeout(timer);
      timer = setTimeout(() => node.classList.remove("is-visible"), duration);
    };
    return { show };
  }
  const VERSION_URL = "https://raw.githubusercontent.com/CheemsGalaxy/YT-SuperTool/main/src/manifests/base.manifest.json";
  const RELEASE_URL = "https://github.com/CheemsGalaxy/YT-SuperTool/releases/tag/Release";
  const USERSCRIPT_URL = "https://raw.githubusercontent.com/CheemsGalaxy/YT-SuperTool/main/dist/userscript/yt-supertool.user.js";
  const CHECK_INTERVAL = 24 * 60 * 60 * 1e3;
  const LAST_CHECK_KEY = "updateLastCheck";
  const NOTIFIED_KEY = "updateNotifiedVersion";
  const parseVersion = (value) => String(value || "").split(".").map((part) => parseInt(part, 10) || 0);
  const compareVersions = (left, right) => {
    const a = parseVersion(left);
    const b = parseVersion(right);
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      const diff = (a[index] || 0) - (b[index] || 0);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
  };
  function createUpdateChecker({ bridge: bridge2, toast, currentVersion }) {
    let latest = "";
    let available = false;
    const downloadUrl = bridge2.env === "userscript" ? USERSCRIPT_URL : RELEASE_URL;
    const readRemoteVersion = async () => {
      const response = await bridge2.network.request(VERSION_URL, { responseType: "json", timeout: 8e3 });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
      const version = String(data?.version || "");
      if (!version) throw new Error("Missing remote version");
      return version;
    };
    const check = async () => {
      try {
        const remote = await readRemoteVersion();
        latest = remote;
        available = compareVersions(remote, currentVersion) > 0;
        await bridge2.storage.set(LAST_CHECK_KEY, Date.now());
        return {
          status: available ? "available" : "current",
          current: currentVersion,
          latest: remote,
          downloadUrl
        };
      } catch (error) {
        return {
          status: "error",
          current: currentVersion,
          latest: "",
          error: error?.message || UI_STRINGS.updateCheckFailed,
          downloadUrl
        };
      }
    };
    const auto = async () => {
      try {
        const last = Number(await bridge2.storage.get(LAST_CHECK_KEY, 0)) || 0;
        if (Date.now() - last < CHECK_INTERVAL) return null;
        const result = await check();
        if (result.status !== "available") return result;
        const notified = await bridge2.storage.get(NOTIFIED_KEY, "");
        if (notified !== result.latest) {
          toast?.show(UI_TEXT.updateAvailable(result.latest));
          await bridge2.storage.set(NOTIFIED_KEY, result.latest);
        }
        return result;
      } catch {
        return null;
      }
    };
    return {
      check,
      auto,
      openDownload() {
        bridge2.openExternal?.(downloadUrl);
      },
      get latest() {
        return latest;
      },
      get available() {
        return available;
      },
      get downloadUrl() {
        return downloadUrl;
      }
    };
  }
  const CACHE_TTL$2 = 60 * 1e3;
  const getVideoId$2 = () => new URLSearchParams(location.search).get("v") || location.pathname.match(/\/shorts\/([^/?]+)/)?.[1] || "";
  const format = (value) => new Intl.NumberFormat(void 0, { notation: "compact", maximumFractionDigits: 1 }).format(value);
  function createDislike({ bridge: bridge2 }) {
    const cache = /* @__PURE__ */ new Map();
    let enabled = false;
    let lastVideoId = "";
    let renderToken = 0;
    let renderTimer = 0;
    let renderRetryTimer = 0;
    let currentBadge = null;
    let currentSegmented = null;
    let themeMedia = null;
    let themeListener = null;
    function findSegmented() {
      const segmented = document.querySelector("ytd-segmented-like-dislike-button-renderer");
      if (segmented) return segmented;
      const legacyButton = document.querySelector(
        "ytd-menu-renderer #top-level-buttons-computed ytd-toggle-button-renderer"
      );
      return legacyButton?.closest("#top-level-buttons-computed") || document.querySelector("#top-level-buttons-computed");
    }
    function findDislikeButton(segmented) {
      const selectors = [
        "dislike-button-view-model button",
        "ytd-segmented-like-dislike-button-renderer button:nth-of-type(2)",
        "#top-level-buttons-computed ytd-toggle-button-renderer:nth-child(2) button"
      ];
      return selectors.map((selector) => segmented?.querySelector(selector)).find(Boolean) || null;
    }
    function findDislikeHost(segmented) {
      const button = findDislikeButton(segmented);
      return button?.closest("dislike-button-view-model, ytd-toggle-button-renderer") || button;
    }
    async function fetchDislike(id) {
      try {
        const response = await bridge2.network.request(
          `https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(id)}`,
          { responseType: "json", timeout: 8e3 }
        );
        const dislikes = Number(response.data?.dislikes);
        return {
          value: response.ok && Number.isFinite(dislikes) ? dislikes : "—",
          time: Date.now()
        };
      } catch (error) {
        console.warn("YT SuperTool could not load dislike data:", error);
        return { value: "—", time: Date.now() };
      }
    }
    function removeRenderedCount() {
      document.querySelectorAll(".ytst-dislike-count").forEach((element) => element.remove());
      currentBadge = null;
    }
    function createCount(value, videoId) {
      const badge = document.createElement("div");
      badge.className = "ytst-dislike-count";
      badge.setAttribute("data-ytst", "dislike");
      badge.setAttribute("data-video-id", videoId);
      badge.setAttribute("aria-label", UI_STRINGS.estimatedDislikes);
      badge.setAttribute("aria-live", "polite");
      badge.textContent = value === "—" ? "—" : format(value);
      return badge;
    }
    function readSegmentedBackground(segmented, fallbackEl) {
      for (const element of [segmented, fallbackEl].filter(Boolean)) {
        const background = getComputedStyle(element).backgroundColor;
        if (background && background !== "transparent" && background !== "rgba(0, 0, 0, 0)") return background;
      }
      return "rgba(255, 255, 255, 0.1)";
    }
    function syncBadgeBackground() {
      if (!currentBadge?.isConnected || !currentSegmented) return;
      const container = document.querySelector("#top-level-buttons-computed");
      const background = readSegmentedBackground(currentSegmented, container);
      if (currentBadge.dataset.lastBg !== background) {
        currentBadge.style.setProperty("background-color", background, "important");
        currentBadge.dataset.lastBg = background;
      }
      const color = getComputedStyle(currentSegmented).color;
      if (color) currentBadge.style.setProperty("color", color, "important");
    }
    function setupThemeListener() {
      if (themeMedia) return;
      try {
        themeMedia = matchMedia("(prefers-color-scheme: dark)");
        themeListener = () => syncBadgeBackground();
        themeMedia.addEventListener("change", themeListener);
      } catch {
        themeMedia = null;
      }
    }
    function cleanupThemeListener() {
      if (themeMedia && themeListener) {
        try {
          themeMedia.removeEventListener("change", themeListener);
        } catch {
        }
      }
      themeMedia = null;
      themeListener = null;
    }
    function insertBadge(container, segmented, value, videoId) {
      const badge = createCount(value, videoId);
      const dislikeHost = findDislikeHost(segmented);
      const parent = dislikeHost?.parentElement || segmented;
      if (dislikeHost && parent) parent.insertBefore(badge, dislikeHost);
      else if (segmented && segmented !== container) segmented.appendChild(badge);
      else container.appendChild(badge);
      currentBadge = badge;
      currentSegmented = segmented;
      syncBadgeBackground();
      setupThemeListener();
    }
    async function render() {
      if (!enabled) return;
      const id = getVideoId$2();
      const token = ++renderToken;
      removeRenderedCount();
      const segmented = findSegmented();
      const container = document.querySelector("#top-level-buttons-computed");
      if (!id || !segmented || !container) return;
      lastVideoId = id;
      let item = cache.get(id);
      if (!item || Date.now() - item.time > CACHE_TTL$2) {
        item = await fetchDislike(id);
        if (item.value !== "—") cache.set(id, item);
      }
      if (!enabled || token !== renderToken || id !== getVideoId$2()) return;
      insertBadge(container, segmented, item.value, id);
    }
    function scheduleRender() {
      clearTimeout(renderTimer);
      clearTimeout(renderRetryTimer);
      renderTimer = setTimeout(render, 100);
      renderRetryTimer = setTimeout(render, 1200);
    }
    function hasButtonsContainerMutation(mutations) {
      for (const mutation of mutations) {
        if (!mutation.addedNodes.length) continue;
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.id === "top-level-buttons-computed" || node.querySelector?.("#top-level-buttons-computed")) return true;
        }
      }
      return false;
    }
    return {
      init() {
        enabled = true;
        lastVideoId = "";
        scheduleRender();
      },
      update(mutations) {
        if (!enabled) return;
        const themeChanged = mutations.some((mutation) => {
          if (mutation.type !== "attributes") return false;
          const target2 = mutation.target;
          return target2 === document.documentElement || target2 === currentSegmented || currentSegmented?.contains(target2);
        });
        if (themeChanged) syncBadgeBackground();
        const videoId = getVideoId$2();
        if (videoId !== lastVideoId) {
          removeRenderedCount();
          scheduleRender();
          return;
        }
        if (hasButtonsContainerMutation(mutations) && !document.querySelector(`.ytst-dislike-count[data-video-id="${videoId}"]`)) {
          scheduleRender();
        }
      },
      stop() {
        enabled = false;
        cache.clear();
        lastVideoId = "";
        renderToken = 0;
        clearTimeout(renderTimer);
        clearTimeout(renderRetryTimer);
        renderTimer = 0;
        renderRetryTimer = 0;
        cleanupThemeListener();
        currentBadge = null;
        currentSegmented = null;
        removeRenderedCount();
      }
    };
  }
  const SHORTS_SELECTORS = [
    "ytd-rich-shelf-renderer[is-shorts]",
    "ytd-reel-shelf-renderer",
    "ytm-shorts-lockup-view-model",
    '[tab-title="Shorts"]',
    ".pivot-shorts",
    'a[href="/shorts"]',
    ".reel-shelf-renderer",
    "ytm-reel-shelf-renderer",
    "ytm-shorts-lockup-view-model-v2",
    "grid-shelf-view-model",
    "grid-shelf-view-model.ytGridShelfViewModelHost",
    '[class*="ytGridShelfViewModelHost"]',
    ".ytGridShelfViewModelGridShelfBottomButtonContainer"
  ];
  const SHORTS_HAS_RULES = [
    { parent: "ytd-guide-entry-renderer", child: 'a[title="Shorts"]' },
    { parent: "ytd-mini-guide-entry-renderer", child: 'a[title="Shorts"]' },
    { parent: "ytd-rich-section-renderer", child: "ytd-rich-shelf-renderer[is-shorts]" },
    { parent: "ytd-rich-item-renderer", child: 'a[href^="/shorts/"]' },
    { parent: "ytd-video-renderer", child: 'a[href^="/shorts/"]' },
    { parent: "ytd-grid-video-renderer", child: 'a[href^="/shorts/"]' },
    { parent: "ytm-video-with-context-renderer", child: 'a[href^="/shorts/"]' },
    { parent: "ytm-compact-video-renderer", child: 'a[href^="/shorts/"]' }
  ];
  const COMBINED = SHORTS_SELECTORS.join(",");
  const RELEVANT_TAGS = /^(YTD-RICH-ITEM-RENDERER|YTD-VIDEO-RENDERER|YTD-GRID-VIDEO-RENDERER|YTD-RICH-SECTION-RENDERER|YTD-REEL-SHELF-RENDERER|YTD-RICH-SHELF-RENDERER|YTD-GUIDE-ENTRY-RENDERER|YTD-MINI-GUIDE-ENTRY-RENDERER|GRID-SHELF-VIEW-MODEL|YTM-)/;
  const elementsFor = (root, selector, includeRoot = true) => [
    ...includeRoot && root.matches?.(selector) ? [root] : [],
    ...root.querySelectorAll?.(selector) || []
  ];
  function syncRoot(enabled) {
    const root = document.documentElement;
    if (!root) return;
    if (enabled) root.dataset.ytstNoShorts = "on";
    else delete root.dataset.ytstNoShorts;
  }
  const removeShortElement = (element) => {
    const parentSection = element.matches("ytd-rich-shelf-renderer[is-shorts]") ? element.closest("ytd-rich-section-renderer") : null;
    (parentSection || element).remove();
  };
  function hideShorts(root = document) {
    const includeRoot = root.nodeType !== Node.ELEMENT_NODE || RELEVANT_TAGS.test(root.tagName);
    const set = /* @__PURE__ */ new Set();
    elementsFor(root, COMBINED, includeRoot).forEach((element) => {
      if (element.isConnected) set.add(element);
    });
    SHORTS_HAS_RULES.forEach(({ parent, child }) => {
      elementsFor(root, parent, includeRoot).forEach((element) => {
        if (element.isConnected && element.querySelector(child)) set.add(element);
      });
    });
    set.forEach(removeShortElement);
  }
  function createNoShorts() {
    return {
      init() {
        syncRoot(true);
        hideShorts();
      },
      update(mutations) {
        mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE && RELEVANT_TAGS.test(node.tagName)) hideShorts(node);
        }));
      },
      stop() {
        syncRoot(false);
      }
    };
  }
  const SECTION_SELECTOR = "ytd-rich-section-renderer";
  const BANNER_SELECTOR = "ytd-statement-banner-renderer";
  const PROMO_SELECTOR = "yt-mealbar-promo-renderer";
  const WATCH_SELECTOR = `${SECTION_SELECTOR}, ${BANNER_SELECTOR}, ${PROMO_SELECTOR}`;
  const SECTION_REMOVED = /* @__PURE__ */ new WeakSet();
  const isCleanHomepageSection = (section) => {
    if (section.querySelector("ytd-inline-survey-renderer, ytd-statement-banner-renderer, ytd-rich-shelf-renderer[is-live]")) {
      return true;
    }
    if (section.querySelector("ytd-mini-game-card-view-model, mini-game-card-view-model")) return true;
    return Boolean(section.querySelector('a[href*="/playables"], a[href*="/mini-game"], a[href*="/feed/storefront"], a[href="/gaming"]'));
  };
  const dropPromo = (promo) => {
    if (!promo.isConnected) return;
    (promo.closest("tp-yt-paper-dialog, ytd-popup-container") || promo).remove();
  };
  const dropBanner = (banner) => {
    if (!banner.isConnected || banner.closest(SECTION_SELECTOR)) return;
    banner.remove();
  };
  const dropSection = (section) => {
    if (!section.isConnected || SECTION_REMOVED.has(section)) return;
    SECTION_REMOVED.add(section);
    if (isCleanHomepageSection(section)) section.remove();
  };
  const collectTargets = (node, targets) => {
    if (!(node instanceof Element)) return;
    if (node.matches(WATCH_SELECTOR)) targets.add(node);
    node.querySelectorAll(WATCH_SELECTOR).forEach((element) => targets.add(element));
  };
  const processTargets = (targets) => {
    targets.forEach((node) => {
      if (node.matches(PROMO_SELECTOR)) dropPromo(node);
      else if (node.matches(BANNER_SELECTOR)) dropBanner(node);
      else dropSection(node);
    });
  };
  const scanDocument = () => {
    const targets = /* @__PURE__ */ new Set();
    document.querySelectorAll(WATCH_SELECTOR).forEach((element) => targets.add(element));
    processTargets(targets);
  };
  function createCleanHomepage() {
    let enabled = false;
    let lastHref = "";
    let lastScanAt = 0;
    let sweepTimer = 0;
    return {
      init() {
        enabled = true;
        const href = location.href;
        const now = Date.now();
        if (href === lastHref && now - lastScanAt < 1e3) return;
        lastHref = href;
        lastScanAt = now;
        scanDocument();
        clearTimeout(sweepTimer);
        sweepTimer = setTimeout(() => {
          if (enabled) scanDocument();
        }, 900);
      },
      update(mutations) {
        if (!enabled) return;
        const targets = /* @__PURE__ */ new Set();
        for (const mutation of mutations) {
          const target2 = mutation.target;
          if (target2 instanceof Element && target2.matches(WATCH_SELECTOR)) targets.add(target2);
          for (const node of mutation.addedNodes) collectTargets(node, targets);
          if (!targets.size && mutation.removedNodes.length) continue;
        }
        if (targets.size) processTargets(targets);
      },
      stop() {
        enabled = false;
        clearTimeout(sweepTimer);
        sweepTimer = 0;
      }
    };
  }
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const toPattern = (phrases) => new RegExp(phrases.map(escape).join("|"), "i");
  const PAUSE_PHRASES = [
    "continue watching",
    "video paused",
    "still watching",
    "are you still there",
    "tiếp tục xem",
    "video đã tạm dừng",
    "vẫn xem",
    "bạn vẫn xem",
    "seguir viendo",
    "video en pausa",
    "sigues ahí",
    "continuar assistindo",
    "vídeo pausado",
    "ainda assistindo",
    "continuer à regarder",
    "vidéo en pause",
    "toujours là",
    "weiter ansehen",
    "video pausiert",
    "noch da",
    "continua a guardare",
    "video in pausa",
    "sei ancora lì",
    "продолжить просмотр",
    "видео приостановлено",
    "вы здесь",
    "視聴を続ける",
    "動画は一時停止",
    "まだ視聴",
    "계속 시청",
    "동영상이 일시중지",
    "계속 보고",
    "继续观看",
    "视频已暂停",
    "您还在观看吗",
    "繼續觀看",
    "影片已暫停",
    "देखना जारी रखें",
    "वीडियो रोका गया",
    "क्या आप अभी भी देख रहे हैं",
    "lanjutkan menonton",
    "video dijeda",
    "masih menonton",
    "เล่นต่อ",
    "วิดีโอหยุดชั่วคราว",
    "ยังดูอยู่",
    "izlemeye devam et",
    "video duraklatıldı",
    "hâlâ izliyor",
    "متابعة المشاهدة",
    "تم إيقاف الفيديو مؤقتًا",
    "هل ما زلت تشاهد",
    "doorgaan met kijken",
    "video gepauzeerd",
    "nog aan het kijken",
    "kontynuuj oglądanie",
    "film wstrzymany",
    "nadal oglądasz",
    "продовжити перегляд",
    "відео призупинено",
    "ви ще дивитеся",
    "fortsätt titta",
    "videon pausad",
    "tittar du fortfarande"
  ];
  const PLAYBACK_ERROR_PHRASES = [
    "playback interrupted",
    "playback was interrupted",
    "something went wrong",
    "sự cố gây gián đoạn",
    "gặp sự cố",
    "reproducción interrumpida",
    "algo salió mal",
    "reprodução interrompida",
    "algo deu errado",
    "lecture interrompue",
    "une erreur est survenue",
    "wiedergabe unterbrochen",
    "ein fehler ist aufgetreten",
    "riproduzione interrotta",
    "qualcosa è andato storto",
    "воспроизведение прервано",
    "что-то пошло не так",
    "再生が中断されました",
    "問題が発生しました",
    "재생이 중단되었습니다",
    "문제가 발생했습니다",
    "播放已中断",
    "出现问题",
    "播放已中斷",
    "發生問題",
    "प्लेबैक बाधित हुआ",
    "कुछ गलत हो गया",
    "pemutaran terganggu",
    "terjadi kesalahan",
    "การเล่นถูกขัดจังหวะ",
    "เกิดข้อผิดพลาด",
    "oynatma kesildi",
    "bir sorun oluştu",
    "توقف التشغيل",
    "حدث خطأ",
    "afspelen onderbroken",
    "er is iets misgegaan",
    "odtwarzanie przerwane",
    "coś poszło nie tak",
    "відтворення перервано",
    "щось пішло не так",
    "uppspelningen avbröts",
    "något gick fel"
  ];
  const ADBLOCK_PHRASES = [
    "adblock",
    "ad blocker",
    "ad-block",
    "chặn quảng cáo",
    "bloqueador de anuncios",
    "bloqueadores de anuncios",
    "bloqueador de anúncios",
    "bloqueadores de anúncios",
    "bloqueur de publicités",
    "bloqueurs de publicités",
    "werbeblocker",
    "blocco annunci",
    "блокировщик рекламы",
    "広告ブロック",
    "광고 차단",
    "广告拦截",
    "廣告攔截",
    "विज्ञापन ब्लॉक",
    "pemblokir iklan",
    "บล็อกโฆษณา",
    "reklam engelleyici",
    "حظر الإعلانات",
    "adblocker",
    "blokowanie reklam",
    "блокувальник реклами",
    "annonsblockerare"
  ];
  const ADBLOCK_TERMS_PHRASES = [
    "terms of service",
    "terms of use",
    "allow youtube ads",
    "allow ads",
    "player will be blocked",
    "monetization",
    "enforcement message",
    "điều khoản",
    "cho phép quảng cáo",
    "condiciones del servicio",
    "permitir anuncios",
    "termos de serviço",
    "permitir anúncios",
    "conditions d'utilisation",
    "conditions d’utilisation",
    "autoriser les annonces",
    "nutzungsbedingungen",
    "werbung zulassen",
    "termini di servizio",
    "consenti annunci",
    "условия использования",
    "разрешить рекламу",
    "利用規約",
    "広告を許可",
    "서비스 약관",
    "광고 허용",
    "服务条款",
    "允许广告",
    "服務條款",
    "允許廣告",
    "सेवा की शर्तें",
    "विज्ञापन अनुमत करें",
    "persyaratan layanan",
    "izinkan iklan",
    "ข้อกำหนดในการให้บริการ",
    "อนุญาตโฆษณา",
    "hizmet şartları",
    "reklamlara izin ver",
    "شروط الخدمة",
    "السماح بالإعلانات",
    "servicevoorwaarden",
    "advertenties toestaan",
    "warunki korzystania",
    "zezwalaj na reklamy",
    "умови використання",
    "дозволити рекламу",
    "användarvillkor",
    "tillåt annonser"
  ];
  const PAUSE_HINT = toPattern(PAUSE_PHRASES);
  const PLAYBACK_ERROR_HINT = toPattern(PLAYBACK_ERROR_PHRASES);
  const ADBLOCK_HINT = toPattern(ADBLOCK_PHRASES);
  const ADBLOCK_TERMS_HINT = toPattern(ADBLOCK_TERMS_PHRASES);
  const POPUP_SELECTORS = [
    ".yt-confirm-dialog-renderer",
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers"]',
    "ytd-modal-with-title-and-button-renderer"
  ];
  const POPUP_SELECTOR = POPUP_SELECTORS.join(",");
  const CONTAINER_SELECTOR = '#dialog, [role="dialog"], ytd-popup-container, tp-yt-paper-dialog';
  const hasPauseText = (element) => {
    const text = element.textContent || "";
    return PAUSE_HINT.test(text) || PLAYBACK_ERROR_HINT.test(text);
  };
  function createNonstop() {
    let enabled = false;
    let removed = /* @__PURE__ */ new WeakSet();
    const collect = (node, found) => {
      if (!(node instanceof Element)) return;
      if (node.matches(POPUP_SELECTOR) && hasPauseText(node)) found.add(node);
      if (node.matches(CONTAINER_SELECTOR) && hasPauseText(node)) found.add(node);
      node.querySelectorAll(POPUP_SELECTOR).forEach((element) => {
        if (hasPauseText(element)) found.add(element);
      });
    };
    const removePopup = (popup) => {
      if (removed.has(popup)) return;
      removed.add(popup);
      const host = popup.closest("#dialog, ytd-popup-container, tp-yt-paper-dialog");
      if (host && host !== popup && hasPauseText(host)) host.remove();
      else popup.remove();
      if (PAUSE_HINT.test(popup.textContent || "")) {
        const video = document.querySelector("video");
        if (video?.paused) video.play().catch(() => {
        });
      }
    };
    const sweep = (root) => {
      if (!enabled || !root?.querySelectorAll) return;
      const found = /* @__PURE__ */ new Set();
      collect(root, found);
      root.querySelectorAll(`${POPUP_SELECTOR}, ${CONTAINER_SELECTOR}`).forEach((element) => {
        if (hasPauseText(element)) found.add(element);
      });
      found.forEach(removePopup);
    };
    return {
      init() {
        if (enabled) return;
        enabled = true;
        removed = /* @__PURE__ */ new WeakSet();
        sweep(document);
      },
      update(mutations) {
        if (!enabled) return;
        const found = /* @__PURE__ */ new Set();
        for (const mutation of mutations) {
          const target2 = mutation.target;
          if (target2 instanceof Element && target2.matches(CONTAINER_SELECTOR) && hasPauseText(target2)) {
            found.add(target2);
          }
          for (const node of mutation.addedNodes) collect(node, found);
        }
        found.forEach(removePopup);
      },
      stop() {
        enabled = false;
        removed = /* @__PURE__ */ new WeakSet();
      }
    };
  }
  const API_BASE = "https://sponsor.ajay.app/api";
  const CACHE_TTL$1 = 30 * 60 * 1e3;
  const CACHE_MAX = 120;
  const TICK_INTERVAL$1 = 250;
  const MIN_SEGMENT_LENGTH = 0.5;
  const NOTICE_DURATION = 5e3;
  const getPlayer = () => document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
  const getVideo = () => getPlayer()?.querySelector("video") || document.querySelector("video");
  let cachedHref = "";
  let cachedVideoId = "";
  const getVideoId$1 = () => {
    if (location.href === cachedHref) return cachedVideoId;
    cachedHref = location.href;
    try {
      const url = new URL(cachedHref);
      cachedVideoId = url.searchParams.get("v") || url.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] || (url.hostname === "youtu.be" ? url.pathname.slice(1) : "");
    } catch {
      cachedVideoId = "";
    }
    return cachedVideoId;
  };
  const cacheKey = (videoId, categories) => `${videoId}|${categories.slice().sort().join(",")}`;
  function normalizeCategories(raw) {
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = null;
      }
    }
    return Object.fromEntries(
      Object.entries(SPONSOR_CATEGORIES).map(([key, meta]) => [
        key,
        typeof raw?.[key] === "boolean" ? raw[key] : meta.enabled
      ])
    );
  }
  function normalizeSegments(list) {
    return (Array.isArray(list) ? list : []).filter((segment) => segment && Array.isArray(segment.segment)).filter((segment) => Number.isFinite(Number(segment.segment[0])) && Number.isFinite(Number(segment.segment[1]))).filter((segment) => Number(segment.segment[1]) - Number(segment.segment[0]) >= MIN_SEGMENT_LENGTH).filter((segment) => !segment.actionType || segment.actionType === "skip").map((segment) => ({
      uuid: segment.UUID || `${segment.segment[0]}-${segment.segment[1]}`,
      category: segment.category || "sponsor",
      start: Number(segment.segment[0]),
      end: Number(segment.segment[1]),
      videoDuration: Number(segment.videoDuration) || 0
    })).sort((a, b) => a.start - b.start);
  }
  function createSponsorBlock({ bridge: bridge2 }) {
    const storage = bridge2.storage;
    const segmentCache = /* @__PURE__ */ new Map();
    const inflight = /* @__PURE__ */ new Map();
    let enabled = false;
    let tickTimer = 0;
    let currentVideoId = "";
    let segments = [];
    let skipped = /* @__PURE__ */ new Set();
    let fetchToken = 0;
    let lastSkip = null;
    let noticeEl = null;
    let noticeTimer = 0;
    let noticeEnabled = true;
    let seekingBound = false;
    async function activeCategories() {
      const categories = normalizeCategories(await storage.get("sponsorblockCategories", null));
      return Object.keys(categories).filter((key) => categories[key]);
    }
    function getCached(videoId, categories) {
      const key = cacheKey(videoId, categories);
      const hit = segmentCache.get(key);
      if (!hit) return null;
      if (Date.now() - hit.time > CACHE_TTL$1) {
        segmentCache.delete(key);
        return null;
      }
      return hit.segments;
    }
    function setCache(videoId, categories, list) {
      segmentCache.set(cacheKey(videoId, categories), { segments: list, time: Date.now() });
      while (segmentCache.size > CACHE_MAX) {
        segmentCache.delete(segmentCache.keys().next().value);
      }
    }
    async function fetchSegments(videoId, categories) {
      const key = cacheKey(videoId, categories);
      if (inflight.has(key)) return inflight.get(key);
      const url = `${API_BASE}/skipSegments?videoID=${encodeURIComponent(videoId)}&categories=${encodeURIComponent(JSON.stringify(categories))}&actionTypes=${encodeURIComponent('["skip"]')}`;
      const promise = (async () => {
        try {
          const response = await bridge2.network.request(url, {
            responseType: "text",
            timeout: 8e3,
            allowHttpErrors: true
          });
          if (response.status === 404) return { ok: true, segments: [] };
          if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
          const data = await response.json();
          return { ok: true, segments: Array.isArray(data) ? data : [] };
        } catch (error) {
          return { ok: false, error: error.message };
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, promise);
      return promise;
    }
    async function loadSegments(videoId) {
      const token = ++fetchToken;
      segments = [];
      skipped = /* @__PURE__ */ new Set();
      lastSkip = null;
      hideNotice();
      if (!enabled || !videoId) return;
      const categories = await activeCategories().catch(() => []);
      if (!enabled || token !== fetchToken || videoId !== currentVideoId || !categories.length) return;
      const cached = getCached(videoId, categories);
      if (cached) {
        segments = cached;
        return;
      }
      const result = await fetchSegments(videoId, categories);
      if (!enabled || token !== fetchToken || videoId !== currentVideoId) return;
      if (!result.ok) {
        console.warn("YT SuperTool could not load SponsorBlock segments:", result.error);
        return;
      }
      segments = normalizeSegments(result.segments);
      setCache(videoId, categories, segments);
    }
    function ensureNotice() {
      if (noticeEl?.isConnected) return noticeEl;
      const player = getPlayer();
      if (!player) return null;
      noticeEl = document.createElement("div");
      noticeEl.className = "ytst-sb-notice";
      const bar = document.createElement("span");
      bar.className = "ytst-sb-bar";
      const label = document.createElement("span");
      label.className = "ytst-sb-label";
      const undo = document.createElement("button");
      undo.type = "button";
      undo.className = "ytst-sb-undo";
      undo.textContent = UI_STRINGS.undo;
      undo.addEventListener("pointerdown", (event) => event.stopPropagation());
      undo.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        undoSkip();
      });
      noticeEl.append(bar, label, undo);
      player.appendChild(noticeEl);
      return noticeEl;
    }
    function showNotice(segment) {
      if (!noticeEnabled) return;
      const notice = ensureNotice();
      if (!notice) return;
      const meta = SPONSOR_CATEGORIES[segment.category] || SPONSOR_CATEGORIES.sponsor;
      const seconds = Math.max(1, Math.round(segment.end - segment.start));
      notice.style.setProperty("--ytst-sb-color", meta.color);
      notice.querySelector(".ytst-sb-label").textContent = UI_TEXT.skipped(meta.label, seconds);
      clearTimeout(noticeTimer);
      notice.classList.add("is-visible");
      noticeTimer = setTimeout(hideNotice, NOTICE_DURATION);
    }
    function hideNotice() {
      clearTimeout(noticeTimer);
      noticeTimer = 0;
      noticeEl?.classList.remove("is-visible");
    }
    function undoSkip() {
      const video = getVideo();
      if (video && lastSkip) {
        try {
          video.currentTime = Math.max(0, lastSkip.start);
        } catch (error) {
          console.warn("YT SuperTool SponsorBlock undo:", error);
        }
      }
      hideNotice();
    }
    function doSkip(video, segment) {
      skipped.add(segment.uuid);
      lastSkip = segment;
      try {
        video.currentTime = Math.min(segment.end, Number(video.duration) || segment.end);
      } catch (error) {
        console.warn("YT SuperTool SponsorBlock seek:", error);
      }
      showNotice(segment);
    }
    function tick() {
      if (!enabled) return;
      const video = getVideo();
      if (!video || video.closest(".html5-video-player")?.classList.contains("ad-showing")) return;
      const videoId = getVideoId$1();
      if (videoId !== currentVideoId) {
        currentVideoId = videoId;
        void loadSegments(videoId);
        return;
      }
      if (!segments.length || video.readyState < 1) return;
      const duration = Number(video.duration);
      if (!Number.isFinite(duration) || duration <= 0) return;
      for (const segment of segments) {
        if (video.currentTime < segment.start) break;
        if (video.currentTime >= segment.end || skipped.has(segment.uuid)) continue;
        if (segment.videoDuration > 0 && Math.abs(segment.videoDuration - duration) > 2) continue;
        doSkip(video, segment);
        return;
      }
    }
    function onSeeking(event) {
      if (!enabled || !segments.length || !(event.target instanceof HTMLVideoElement)) return;
      if (getVideo() !== event.target) return;
      for (const uuid of [...skipped]) {
        const segment = segments.find((item) => item.uuid === uuid);
        if (segment && event.target.currentTime < segment.start - 0.5) skipped.delete(uuid);
      }
    }
    function onStorageChanged(changes) {
      if (changes.sponsorblockNotice) noticeEnabled = Boolean(changes.sponsorblockNotice.newValue);
      if (changes.sponsorblockCategories) {
        segmentCache.clear();
        if (enabled) void loadSegments(currentVideoId);
      }
    }
    storage.onChanged(onStorageChanged, ["sponsorblockCategories", "sponsorblockNotice"]);
    storage.get("sponsorblockNotice", true).then((value) => {
      noticeEnabled = Boolean(value);
    }).catch((error) => console.error("YT SuperTool could not load SponsorBlock notice setting:", error));
    document.addEventListener("yt-navigate-finish", () => {
      if (!enabled) return;
      currentVideoId = "";
      segments = [];
      skipped = /* @__PURE__ */ new Set();
      lastSkip = null;
      hideNotice();
    }, { passive: true });
    return {
      init() {
        if (enabled) {
          if (!tickTimer) tickTimer = setInterval(tick, TICK_INTERVAL$1);
          const videoId = getVideoId$1();
          if (videoId && videoId !== currentVideoId) {
            currentVideoId = videoId;
            void loadSegments(videoId);
          }
          return;
        }
        enabled = true;
        document.addEventListener("seeking", onSeeking, true);
        seekingBound = true;
        tickTimer = setInterval(tick, TICK_INTERVAL$1);
        currentVideoId = getVideoId$1();
        void loadSegments(currentVideoId);
      },
      stop() {
        enabled = false;
        clearInterval(tickTimer);
        tickTimer = 0;
        if (seekingBound) {
          document.removeEventListener("seeking", onSeeking, true);
          seekingBound = false;
        }
        fetchToken += 1;
        segments = [];
        skipped = /* @__PURE__ */ new Set();
        lastSkip = null;
        currentVideoId = "";
        hideNotice();
        noticeEl?.remove();
        noticeEl = null;
      }
    };
  }
  const MIN_SPEED = 0.25;
  const MAX_SPEED = 10;
  const STEP = 0.05;
  const KEY_STEP = 0.25;
  const DEFAULT_SPEED = 1;
  const SAVE_DEBOUNCE = 200;
  const MAX_RETRY = 40;
  const PRESET_GROUPS = [
    [0.25, 0.5, 0.75],
    [1, 1.25, 1.5, 1.75],
    [2, 2.5, 3],
    [4, 5, 6, 7, 8, 9, 10]
  ];
  const clampSpeed = (value) => Math.min(MAX_SPEED, Math.max(MIN_SPEED, Number(value) || DEFAULT_SPEED));
  const normalizeSpeed = (value) => Math.round(clampSpeed(value) / STEP) * STEP;
  const shortSpeed = (value) => `${Number(Number(value).toFixed(2))}x`;
  function createSpeed({ bridge: bridge2 }) {
    let enabled = false;
    let currentSpeed = DEFAULT_SPEED;
    let container = null;
    let video = null;
    let sliderRef = null;
    let chipRef = null;
    let chipValue = null;
    let menuEl = null;
    let miniRef = null;
    let presetItems = [];
    let onKeydown = null;
    let onRateChange = null;
    let retryTimer = 0;
    let retryCount = 0;
    let saveTimer = 0;
    let isOpen = false;
    let clickOutsideHandler = null;
    let escapeHandler = null;
    let positionHandler = null;
    let loadToken = 0;
    function saveSpeed(speed) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        bridge2.storage.set("playbackSpeed", speed).catch((error) => console.error("YT SuperTool could not save playback speed:", error));
      }, SAVE_DEBOUNCE);
    }
    function syncPresetStates() {
      for (const item of presetItems) {
        const value = Number(item.dataset.value);
        item.classList.toggle("is-active", Math.abs(value - currentSpeed) < 1e-3);
        item.setAttribute("aria-checked", String(Math.abs(value - currentSpeed) < 1e-3));
      }
    }
    function syncChipText() {
      if (chipValue) chipValue.textContent = shortSpeed(currentSpeed);
      if (chipRef) chipRef.classList.toggle("is-open", isOpen);
    }
    function applySpeed(value, persist = true) {
      const next = Number(normalizeSpeed(value).toFixed(2));
      if (next !== currentSpeed) {
        currentSpeed = next;
        if (video && video.playbackRate !== currentSpeed) video.playbackRate = currentSpeed;
        if (sliderRef) {
          sliderRef.value = String(currentSpeed);
          sliderRef.title = shortSpeed(currentSpeed);
        }
        if (miniRef) miniRef.value = String(currentSpeed);
      }
      syncChipText();
      syncPresetStates();
      if (persist) saveSpeed(currentSpeed);
    }
    function findAnchor(player) {
      return player?.querySelector(".ytp-left-controls .ytp-time-display") || null;
    }
    function setVideo(player) {
      video = player.querySelector("video") || document.querySelector(".html5-video-player video");
      if (video && video.playbackRate !== currentSpeed) video.playbackRate = currentSpeed;
    }
    function removeMenuListeners() {
      if (clickOutsideHandler) {
        document.removeEventListener("click", clickOutsideHandler, true);
        document.removeEventListener("pointerdown", clickOutsideHandler, true);
        clickOutsideHandler = null;
      }
      if (escapeHandler) {
        document.removeEventListener("keydown", escapeHandler, true);
        escapeHandler = null;
      }
      if (positionHandler) {
        window.removeEventListener("resize", positionHandler);
        window.removeEventListener("scroll", positionHandler, true);
        positionHandler = null;
      }
    }
    function positionMenu() {
      if (!chipRef || !menuEl) return;
      const chipRect = chipRef.getBoundingClientRect();
      const menuRect = menuEl.getBoundingClientRect();
      const top = Math.max(8, chipRect.top - menuRect.height - 8);
      const left = Math.max(8, Math.min(chipRect.right - menuRect.width, window.innerWidth - menuRect.width - 8));
      menuEl.style.top = `${top}px`;
      menuEl.style.left = `${left}px`;
    }
    function closeMenu() {
      if (!isOpen) return;
      isOpen = false;
      if (menuEl) menuEl.style.display = "none";
      syncChipText();
      removeMenuListeners();
    }
    function openMenu() {
      if (!isOpen || !menuEl) {
        isOpen = true;
        if (menuEl) menuEl.style.display = "block";
        syncChipText();
        positionMenu();
        clickOutsideHandler = (event) => {
          const path = event.composedPath?.() || [];
          if (path.includes(container) || path.includes(menuEl)) return;
          closeMenu();
        };
        escapeHandler = (event) => {
          if (event.key === "Escape") closeMenu();
        };
        positionHandler = () => positionMenu();
        document.addEventListener("click", clickOutsideHandler, true);
        document.addEventListener("pointerdown", clickOutsideHandler, true);
        document.addEventListener("keydown", escapeHandler, true);
        window.addEventListener("resize", positionHandler, { passive: true });
        window.addEventListener("scroll", positionHandler, { passive: true, capture: true });
      } else {
        closeMenu();
      }
    }
    function buildMenu() {
      const menu = document.createElement("div");
      menu.className = "ytst-speed-menu";
      menu.setAttribute("role", "menu");
      PRESET_GROUPS.forEach((group, index) => {
        group.forEach((value) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "ytst-speed-preset";
          item.dataset.value = String(value);
          item.setAttribute("role", "menuitemradio");
          item.setAttribute("aria-label", UI_TEXT.speedPreset(shortSpeed(value)));
          const label = document.createElement("span");
          label.textContent = shortSpeed(value);
          const check = createIcon("check", 16);
          check.classList.add("ytst-speed-preset-check");
          item.append(label, check);
          item.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            applySpeed(value);
            closeMenu();
          });
          menu.appendChild(item);
        });
        if (index < PRESET_GROUPS.length - 1) {
          const divider2 = document.createElement("div");
          divider2.className = "ytst-speed-divider";
          menu.appendChild(divider2);
        }
      });
      const divider = document.createElement("div");
      divider.className = "ytst-speed-divider";
      menu.appendChild(divider);
      const caption = document.createElement("div");
      caption.className = "ytst-speed-caption";
      caption.textContent = UI_STRINGS.custom;
      menu.appendChild(caption);
      const mini = document.createElement("input");
      mini.type = "range";
      mini.className = "ytst-speed-mini";
      mini.min = String(MIN_SPEED);
      mini.max = String(MAX_SPEED);
      mini.step = String(STEP);
      mini.value = String(currentSpeed);
      mini.setAttribute("aria-label", UI_STRINGS.customPlaybackSpeed);
      mini.addEventListener("input", (event) => applySpeed(event.target.value));
      mini.addEventListener("click", (event) => event.stopPropagation());
      menu.appendChild(mini);
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "ytst-speed-reset";
      reset.textContent = UI_STRINGS.resetTo1x;
      reset.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        applySpeed(DEFAULT_SPEED);
        closeMenu();
      });
      menu.appendChild(reset);
      return { menu, mini };
    }
    function retry(player) {
      if (!enabled || retryCount >= MAX_RETRY) return;
      retryCount += 1;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => api.init(player), 250);
    }
    function buildContainer() {
      const element = document.createElement("div");
      element.className = "ytst-speed";
      element.title = UI_STRINGS.playbackSpeed;
      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "ytst-speed-slider";
      slider.min = String(MIN_SPEED);
      slider.max = String(MAX_SPEED);
      slider.step = String(STEP);
      slider.value = String(currentSpeed);
      slider.setAttribute("aria-label", UI_STRINGS.playbackSpeed);
      slider.addEventListener("input", (event) => applySpeed(event.target.value));
      slider.addEventListener("dblclick", (event) => {
        event.preventDefault();
        applySpeed(DEFAULT_SPEED);
      });
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ytst-speed-chip";
      chip.setAttribute("aria-label", UI_STRINGS.playbackSpeedPresets);
      chip.setAttribute("aria-haspopup", "true");
      const value = document.createElement("span");
      value.className = "ytst-speed-value";
      value.textContent = shortSpeed(currentSpeed);
      const chevron = createIcon("chevron", 16);
      chevron.classList.add("ytst-speed-chevron");
      chip.append(value, chevron);
      chip.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openMenu();
      });
      element.append(slider, chip);
      return { element, slider, chip, value };
    }
    const api = {
      init(player) {
        enabled = true;
        if (!player) return;
        const anchor = findAnchor(player);
        if (!anchor) {
          retry(player);
          return;
        }
        retryCount = 0;
        setVideo(player);
        if (!menuEl) {
          const { menu, mini } = buildMenu();
          menuEl = menu;
          miniRef = mini;
          (document.body || document.documentElement).appendChild(menu);
          menuEl.style.display = "none";
          presetItems = [...menu.querySelectorAll(".ytst-speed-preset")];
        }
        const existing = document.querySelector(".ytst-speed");
        if (existing) {
          if (existing.parentElement !== anchor.parentElement) {
            anchor.insertAdjacentElement("afterend", existing);
          }
          container = existing;
          sliderRef = existing.querySelector(".ytst-speed-slider");
          chipRef = existing.querySelector(".ytst-speed-chip");
          chipValue = existing.querySelector(".ytst-speed-value");
          applySpeed(currentSpeed, false);
          return;
        }
        const { element, slider, chip, value } = buildContainer();
        anchor.insertAdjacentElement("afterend", element);
        container = element;
        sliderRef = slider;
        chipRef = chip;
        chipValue = value;
        syncChipText();
        syncPresetStates();
        if (onRateChange && video) video.removeEventListener("ratechange", onRateChange);
        onRateChange = () => {
          if (!video) return;
          const rate = Number(video.playbackRate.toFixed(2));
          if (Math.abs(rate - currentSpeed) > 1e-3) {
            currentSpeed = rate;
            if (sliderRef) sliderRef.value = String(rate);
            if (miniRef) miniRef.value = String(rate);
            syncChipText();
            syncPresetStates();
            saveSpeed(rate);
          }
        };
        video?.addEventListener("ratechange", onRateChange);
        if (onKeydown) document.removeEventListener("keydown", onKeydown);
        onKeydown = (event) => {
          const active = document.activeElement;
          if (active?.matches('input, textarea, [contenteditable="true"]')) return;
          if (event.key !== ">" && event.key !== "<") return;
          event.preventDefault();
          applySpeed(currentSpeed + (event.key === ">" ? KEY_STEP : -KEY_STEP));
        };
        document.addEventListener("keydown", onKeydown);
        const token = ++loadToken;
        bridge2.storage.get("playbackSpeed", DEFAULT_SPEED).then((savedValue) => {
          if (!enabled || token !== loadToken) return;
          const saved = Number(savedValue);
          if (saved >= MIN_SPEED && saved <= MAX_SPEED) applySpeed(saved, false);
        }).catch((error) => console.error("YT SuperTool could not load playback speed:", error));
      },
      stop() {
        enabled = false;
        loadToken += 1;
        clearTimeout(retryTimer);
        clearTimeout(saveTimer);
        retryTimer = 0;
        saveTimer = 0;
        retryCount = 0;
        closeMenu();
        removeMenuListeners();
        if (onKeydown) {
          document.removeEventListener("keydown", onKeydown);
          onKeydown = null;
        }
        if (onRateChange && video) {
          video.removeEventListener("ratechange", onRateChange);
          onRateChange = null;
        }
        menuEl?.remove();
        menuEl = null;
        miniRef = null;
        presetItems = [];
        document.querySelectorAll(".ytst-speed").forEach((element) => element.remove());
        container = null;
        sliderRef = null;
        chipRef = null;
        chipValue = null;
        video = null;
        isOpen = false;
      }
    };
    return api;
  }
  const NATIVE_CONTROL = [
    ".ytp-settings-button",
    ".ytp-subtitles-button",
    ".ytp-fullscreen-button",
    ".ytp-right-controls .ytp-button"
  ];
  function alignWithNative(button) {
    if (!button) return;
    const native = NATIVE_CONTROL.map((selector) => document.querySelector(selector)).find(Boolean);
    if (!native) return;
    const computed = getComputedStyle(native);
    button.style.width = computed.width;
    button.style.height = computed.height;
    button.style.padding = computed.padding;
    button.style.boxSizing = "border-box";
  }
  function getInsertAnchor(controls) {
    if (!controls) return null;
    return controls.querySelector(".ytp-settings-button") || controls.querySelector(".ytp-subtitles-button") || controls.querySelector(".ytp-fullscreen-button");
  }
  function createPlayerControl({ player, id, label, icon, onClick }) {
    const controls = player?.querySelector(".ytp-right-controls");
    if (!controls) return null;
    if (controls.querySelector(`[data-ytst="${id}"]`)) return null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ytp-button ytst-player-button";
    button.dataset.ytst = id;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.appendChild(createIcon(icon, 24));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick?.(event, button);
    });
    const anchor = getInsertAnchor(controls);
    if (anchor) anchor.insertAdjacentElement("beforebegin", button);
    else controls.prepend(button);
    alignWithNative(button);
    return button;
  }
  function removePlayerControl(id) {
    document.querySelectorAll(`[data-ytst="${id}"]`).forEach((button) => button.remove());
  }
  function createPiP() {
    let onEnter = null;
    let onLeave = null;
    const bind = (button) => {
      if (!button || onEnter) return;
      onEnter = () => button.classList.add("is-active");
      onLeave = () => button.classList.remove("is-active");
      document.addEventListener("enterpictureinpicture", onEnter);
      document.addEventListener("leavepictureinpicture", onLeave);
      if (document.pictureInPictureElement) button.classList.add("is-active");
    };
    return {
      init(player) {
        const created = createPlayerControl({
          player,
          id: "pip",
          label: UI_STRINGS.pictureInPicture,
          icon: "pip",
          onClick: async () => {
            const video = player?.querySelector("video");
            if (!video || !document.pictureInPictureEnabled) return;
            try {
              if (document.pictureInPictureElement) await document.exitPictureInPicture();
              else await video.requestPictureInPicture();
            } catch (error) {
              console.warn("YT SuperTool PiP:", error);
            }
          }
        });
        bind(created || document.querySelector('[data-ytst="pip"]'));
      },
      stop() {
        if (onEnter) document.removeEventListener("enterpictureinpicture", onEnter);
        if (onLeave) document.removeEventListener("leavepictureinpicture", onLeave);
        onEnter = null;
        onLeave = null;
        removePlayerControl("pip");
      }
    };
  }
  function createScreenshot({ toast }) {
    const capture = (player) => {
      const video = player?.querySelector("video");
      if (!video || !video.videoWidth) {
        toast?.show(UI_STRINGS.noFrame);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      try {
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        const link = document.createElement("a");
        link.download = `youtube-${Date.now()}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        toast?.show(UI_STRINGS.screenshotSaved);
      } catch (error) {
        console.warn("YT SuperTool screenshot blocked by CORS:", error);
        toast?.show(UI_STRINGS.screenshotFailed);
      }
    };
    return {
      init(player) {
        createPlayerControl({
          player,
          id: "screenshot",
          label: UI_STRINGS.takeScreenshot,
          icon: "camera",
          onClick: () => capture(player)
        });
      },
      stop() {
        removePlayerControl("screenshot");
      }
    };
  }
  const downloaderCss = '.ytst-dl-button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  height: 40px;\n  min-width: 40px;\n  margin-left: 8px;\n  padding: 0 16px;\n  border: 0;\n  border-radius: 20px;\n  background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05));\n  color: var(--yt-spec-text-primary, #0f0f0f);\n  font-family: "Roboto", "Segoe UI", sans-serif;\n  font-size: 14px;\n  font-weight: 500;\n  line-height: 1;\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n.ytst-dl-button:hover {\n  background: rgba(0, 0, 0, 0.1);\n}\n\n.ytst-dl-button:focus-visible {\n  outline: 2px solid var(--yt-spec-call-to-action, #065fd4);\n  outline-offset: 2px;\n}\n\n.ytst-dl-button svg {\n  display: block;\n  width: 22px;\n  height: 22px;\n  fill: none;\n  stroke: currentColor;\n  stroke-width: 1.8;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n  pointer-events: none;\n}\n\n.ytst-dl-button .ytst-dl-caret {\n  width: 14px;\n  height: 14px;\n  margin-left: -2px;\n}\n\n.ytst-dl-label {\n  pointer-events: none;\n}\n\n.ytst-dl-copy-area {\n  position: fixed;\n  top: -1000px;\n  left: -1000px;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  border: 0;\n  opacity: 0;\n  pointer-events: none;\n}\n\n.ytst-dl-menu {\n  position: fixed;\n  z-index: 2147483000;\n  width: 288px;\n  max-width: calc(100vw - 16px);\n  padding: 6px 0;\n  border-radius: 12px;\n  background: #ffffff;\n  color: #0f0f0f;\n  box-shadow: 0 4px 32px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.08);\n  font-family: "Roboto", "Segoe UI", sans-serif;\n  font-size: 14px;\n}\n\n.ytst-dl-menu-head {\n  padding: 10px 16px 8px;\n  font-size: 16px;\n  font-weight: 500;\n}\n\n.ytst-dl-section {\n  padding: 10px 16px 4px;\n  color: #606060;\n  font-size: 11px;\n  font-weight: 500;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n}\n\n.ytst-dl-item {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 16px;\n  width: 100%;\n  padding: 9px 16px;\n  border: 0;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n}\n\n.ytst-dl-item:hover,\n.ytst-dl-item:focus-visible {\n  background: rgba(0, 0, 0, 0.06);\n  outline: none;\n}\n\n.ytst-dl-item:disabled {\n  color: #909090;\n  cursor: default;\n  background: transparent;\n}\n\n.ytst-dl-item-main {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.ytst-dl-item-title {\n  font-weight: 500;\n}\n\n.ytst-dl-item-note,\n.ytst-dl-item-meta,\n.ytst-dl-status {\n  color: #606060;\n  font-size: 12px;\n}\n\n.ytst-dl-item-meta {\n  flex: none;\n  font-variant-numeric: tabular-nums;\n}\n\n.ytst-dl-menu-foot {\n  margin-top: 6px;\n  padding: 8px 16px 6px;\n  border-top: 1px solid rgba(0, 0, 0, 0.08);\n  color: #909090;\n  font-size: 11px;\n}\n\n.ytst-dl-progress {\n  position: fixed;\n  z-index: 2147483000;\n  width: 300px;\n  max-width: calc(100vw - 16px);\n  padding: 12px 14px;\n  border-radius: 12px;\n  background: #ffffff;\n  color: #0f0f0f;\n  box-shadow: 0 4px 32px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.08);\n  font-family: "Roboto", "Segoe UI", sans-serif;\n  font-size: 13px;\n}\n\n.ytst-dl-progress-head {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 12px;\n}\n\n.ytst-dl-progress-label {\n  flex: 1;\n  min-width: 0;\n  line-height: 1.35;\n  word-break: break-word;\n}\n\n.ytst-dl-cancel {\n  flex: none;\n  padding: 2px 6px;\n  border: 0;\n  border-radius: 6px;\n  background: transparent;\n  color: #065fd4;\n  font: inherit;\n  font-weight: 500;\n  cursor: pointer;\n}\n\n.ytst-dl-cancel:hover {\n  background: rgba(0, 0, 0, 0.06);\n}\n\n.ytst-dl-bar {\n  height: 4px;\n  margin-top: 10px;\n  border-radius: 2px;\n  background: rgba(0, 0, 0, 0.12);\n  overflow: hidden;\n}\n\n.ytst-dl-bar > span {\n  display: block;\n  width: 0;\n  height: 100%;\n  border-radius: inherit;\n  background: #ff0033;\n  transition: width 120ms linear;\n}\n\n.ytst-dl-progress[data-state="done"] .ytst-dl-bar > span {\n  background: #2ba640;\n}\n\n.ytst-dl-progress[data-state="error"] .ytst-dl-bar > span {\n  background: #cc0000;\n}\n\nhtml[dark] .ytst-dl-button,\nhtml[dark-theme] .ytst-dl-button {\n  background: rgba(255, 255, 255, 0.1);\n  color: #f1f1f1;\n}\n\nhtml[dark] .ytst-dl-button:hover,\nhtml[dark-theme] .ytst-dl-button:hover {\n  background: rgba(255, 255, 255, 0.16);\n}\n\nhtml[dark] .ytst-dl-menu,\nhtml[dark-theme] .ytst-dl-menu,\nhtml[dark] .ytst-dl-progress,\nhtml[dark-theme] .ytst-dl-progress {\n  background: #212121;\n  color: #f1f1f1;\n  box-shadow: 0 4px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1);\n}\n\nhtml[dark] .ytst-dl-section,\nhtml[dark-theme] .ytst-dl-section,\nhtml[dark] .ytst-dl-item-note,\nhtml[dark-theme] .ytst-dl-item-note,\nhtml[dark] .ytst-dl-item-meta,\nhtml[dark-theme] .ytst-dl-item-meta,\nhtml[dark] .ytst-dl-status,\nhtml[dark-theme] .ytst-dl-status {\n  color: #aaaaaa;\n}\n\nhtml[dark] .ytst-dl-item:hover,\nhtml[dark-theme] .ytst-dl-item:hover,\nhtml[dark] .ytst-dl-item:focus-visible,\nhtml[dark-theme] .ytst-dl-item:focus-visible {\n  background: rgba(255, 255, 255, 0.08);\n}\n\nhtml[dark] .ytst-dl-menu-foot,\nhtml[dark-theme] .ytst-dl-menu-foot {\n  border-top-color: rgba(255, 255, 255, 0.1);\n  color: #717171;\n}\n\nhtml[dark] .ytst-dl-cancel,\nhtml[dark-theme] .ytst-dl-cancel {\n  color: #3ea6ff;\n}\n\nhtml[dark] .ytst-dl-cancel:hover,\nhtml[dark-theme] .ytst-dl-cancel:hover {\n  background: rgba(255, 255, 255, 0.08);\n}\n\nhtml[dark] .ytst-dl-bar,\nhtml[dark-theme] .ytst-dl-bar {\n  background: rgba(255, 255, 255, 0.2);\n}\n\n@media (max-width: 1000px) {\n  .ytst-dl-button {\n    width: 40px;\n    padding: 0;\n  }\n\n  .ytst-dl-label {\n    display: none;\n  }\n}\n';
  const PLAYER_ENDPOINT = "/youtubei/v1/player?prettyPrint=false";
  const CLIENTS = [
    {
      name: "ANDROID",
      id: "3",
      version: "20.10.38",
      userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
      extra: { androidSdkVersion: 30, osName: "Android", osVersion: "11" }
    },
    {
      name: "IOS",
      id: "5",
      version: "20.10.4",
      userAgent: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)",
      extra: { deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.1.0.22B83" }
    },
    {
      name: "ANDROID_VR",
      id: "28",
      version: "1.60.19",
      userAgent: "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; en_US; Quest 3 Build/SQ3A.220605.009.A1) gzip",
      extra: { androidSdkVersion: 32, osName: "Android", osVersion: "12", deviceMake: "Oculus", deviceModel: "Quest 3" }
    }
  ];
  const THIRD_PARTY_ORIGIN = "https://ytmp3pc.com/";
  const THIRD_PARTY_LABEL = "ytmp3pc.com";
  const CACHE_TTL = 10 * 60 * 1e3;
  const getVideoId = () => {
    try {
      const url = new URL(location.href);
      if (url.pathname === "/watch") return url.searchParams.get("v") || "";
      const match = url.pathname.match(/^\/(?:live|shorts|embed)\/([^/?]+)/);
      return match?.[1] || "";
    } catch {
      return "";
    }
  };
  const isWatchPage = () => location.pathname === "/watch" || location.pathname.startsWith("/live/");
  const formatBytes = (bytes) => {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "";
    if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  };
  const cleanFileName = (value) => String(value || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 110);
  const abortError = () => {
    const error = new Error("Cancelled");
    error.name = "AbortError";
    return error;
  };
  const readResponse = async (response, { signal, onProgress }) => {
    const total = Number(response.headers.get("content-length")) || 0;
    if (!response.body) {
      const blob = await response.blob();
      onProgress?.(1, blob.size, total || blob.size);
      return blob;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal.aborted) {
        await reader.cancel();
        throw abortError();
      }
      chunks.push(value);
      received += value.length;
      onProgress?.(total ? Math.min(1, received / total) : 0, received, total);
    }
    return new Blob(chunks, {
      type: response.headers.get("content-type") || "application/octet-stream"
    });
  };
  const fetchStream = async (url, { signal, onProgress }) => {
    const response = await fetch(url, {
      signal,
      credentials: "omit",
      headers: { range: "bytes=0-" }
    });
    if (!response.ok) throw new Error(`Stream request failed (${response.status})`);
    return readResponse(response, { signal, onProgress });
  };
  const pickMuxed = (data) => (data.streamingData?.formats || []).filter((format2) => format2.url && /^video\/mp4/.test(String(format2.mimeType || ""))).sort((left, right) => (right.height || 0) - (left.height || 0));
  const requestPlayerResponse = async (videoId, client) => {
    const response = await fetch(PLAYER_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-youtube-client-name": client.id,
        "x-youtube-client-version": client.version
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: client.name,
            clientVersion: client.version,
            hl: "en",
            gl: "US",
            userAgent: client.userAgent,
            ...client.extra
          }
        },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true
      })
    });
    if (!response.ok) throw new Error(`Player request failed (${response.status})`);
    const data = await response.json();
    const status = data.playabilityStatus?.status;
    if (status && status !== "OK") {
      throw new Error(data.playabilityStatus?.reason || `Video is not playable (${status})`);
    }
    if (!data.streamingData) throw new Error("No streaming data in the player response");
    return data;
  };
  function createDownloader({ bridge: bridge2, toast }) {
    let enabled = false;
    let player = null;
    let button = null;
    let menu = null;
    let progress = null;
    let progressTimer = 0;
    let retryTimer = 0;
    let retryCount = 0;
    let menuToken = 0;
    let jobId = 0;
    let activeJob = null;
    let cache = { id: "", at: 0, data: null };
    let inflight = null;
    bridge2.injector.injectStyle(downloaderCss, "ytst-downloader-style");
    const setStatus = (text) => {
      if (!progress) return;
      progress.querySelector(".ytst-dl-progress-label").textContent = text;
    };
    const setBar = (fraction) => {
      if (!progress) return;
      const bar = progress.querySelector(".ytst-dl-bar > span");
      if (bar) bar.style.width = `${Math.max(0, Math.min(100, Math.round(fraction * 100)))}%`;
    };
    const positionFloating = (element) => {
      if (!element || !button?.isConnected) return;
      const rect = button.getBoundingClientRect();
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      let left = rect.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      let top = rect.bottom + 8;
      if (top + height > window.innerHeight - 8) top = rect.top - height - 8;
      top = Math.max(8, top);
      element.style.left = `${Math.round(left)}px`;
      element.style.top = `${Math.round(top)}px`;
    };
    const removeProgress = () => {
      clearTimeout(progressTimer);
      progressTimer = 0;
      window.removeEventListener("scroll", handleProgressScroll, true);
      window.removeEventListener("resize", handleProgressScroll);
      progress?.remove();
      progress = null;
    };
    const handleProgressScroll = () => {
      if (progress) positionFloating(progress);
    };
    const finishProgress = (text, state, timeout = 5e3) => {
      if (!progress) return;
      progress.dataset.state = state;
      setStatus(text);
      setBar(1);
      const cancel = progress.querySelector(".ytst-dl-cancel");
      if (cancel) {
        cancel.textContent = UI_STRINGS.close;
        cancel.onclick = () => removeProgress();
      }
      clearTimeout(progressTimer);
      progressTimer = setTimeout(removeProgress, timeout);
    };
    const failProgress = (error) => {
      if (error?.name === "AbortError") {
        finishProgress(UI_STRINGS.downloadCancelled, "error", 1800);
        return;
      }
      console.warn("YT SuperTool download failed:", error);
      finishProgress(UI_TEXT.downloadFailed(error?.message || UI_STRINGS.unknownError), "error", 9e3);
      toast?.show(UI_STRINGS.downloadFailedToast);
    };
    const saveBlob = (blob, fileName) => {
      const url = URL.createObjectURL(blob);
      const link = createElement("a", { href: url, download: fileName });
      (document.body || document.documentElement).appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 6e4);
    };
    const showProgress = (text) => {
      removeProgress();
      progress = createElement("div", {
        className: "ytst-dl-progress",
        role: "status",
        "aria-live": "polite",
        dataset: { state: "run" }
      }, [
        createElement("div", { className: "ytst-dl-progress-head" }, [
          createElement("span", { className: "ytst-dl-progress-label", textContent: text }),
          createElement("button", {
            type: "button",
            className: "ytst-dl-cancel",
            textContent: UI_STRINGS.cancel
          })
        ]),
        createElement("div", { className: "ytst-dl-bar" }, [
          createElement("span")
        ])
      ]);
      const cancel = progress.querySelector(".ytst-dl-cancel");
      cancel.addEventListener("click", () => {
        if (activeJob) activeJob.controller.abort();
        else removeProgress();
      });
      (document.body || document.documentElement).appendChild(progress);
      positionFloating(progress);
      window.addEventListener("scroll", handleProgressScroll, { passive: true, capture: true });
      window.addEventListener("resize", handleProgressScroll);
    };
    const closeMenu = () => {
      menuToken += 1;
      if (menu) {
        menu.remove();
        menu = null;
      }
      button?.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", handleDocumentPointer, true);
      document.removeEventListener("keydown", handleDocumentKey, true);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
    const handleDocumentPointer = (event) => {
      if (!menu) return;
      if (menu.contains(event.target) || button?.contains(event.target)) return;
      closeMenu();
    };
    const handleDocumentKey = (event) => {
      if (event.key === "Escape") closeMenu();
    };
    const openMenu = () => {
      if (!button || menu) return;
      const videoId = getVideoId();
      if (!videoId) return;
      menu = createElement("div", {
        className: "ytst-dl-menu",
        role: "menu",
        "aria-label": UI_STRINGS.downloadVideo
      }, [
        createElement("div", { className: "ytst-dl-menu-head", textContent: UI_STRINGS.download }),
        createElement("div", { className: "ytst-dl-status", textContent: UI_STRINGS.readingPlayerResponse })
      ]);
      (document.body || document.documentElement).appendChild(menu);
      positionFloating(menu);
      button.setAttribute("aria-expanded", "true");
      const token = ++menuToken;
      document.addEventListener("pointerdown", handleDocumentPointer, true);
      document.addEventListener("keydown", handleDocumentKey, true);
      window.addEventListener("scroll", closeMenu, { passive: true, capture: true });
      window.addEventListener("resize", closeMenu);
      loadMenu(videoId, token);
    };
    const loadMenu = async (videoId, token) => {
      try {
        const data = await loadPlayer(videoId);
        if (token !== menuToken || !menu) return;
        renderMenu(data, videoId);
        positionFloating(menu);
      } catch (error) {
        if (token !== menuToken || !menu) return;
        const message = error?.message || UI_STRINGS.readFailed;
        menu.replaceChildren(
          createElement("div", { className: "ytst-dl-menu-head", textContent: UI_STRINGS.download }),
          createElement("div", { className: "ytst-dl-status", textContent: message })
        );
        positionFloating(menu);
      }
    };
    const copyText = async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
      }
      const area = createElement("textarea", {
        className: "ytst-dl-copy-area",
        readonly: true
      });
      area.value = text;
      (document.body || document.documentElement).appendChild(area);
      area.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      area.remove();
      return copied;
    };
    const openThirdParty = () => {
      if (typeof bridge2.openExternal === "function") {
        bridge2.openExternal(THIRD_PARTY_ORIGIN);
        return;
      }
      globalThis.open(THIRD_PARTY_ORIGIN, "_blank", "noopener,noreferrer");
    };
    const openThirdPartyWithLink = async (videoId) => {
      const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const copied = await copyText(watchUrl);
      toast?.show(copied ? UI_STRINGS.linkCopied : UI_STRINGS.copyFailed);
      openThirdParty();
    };
    const renderMenu = (data, videoId) => {
      if (!menu) return;
      const title = data.title || document.title.replace(/\s*-\s*YouTube\s*$/, "");
      const muxed = data.muxed || null;
      const baseName = `${cleanFileName(title) || "video"} [${videoId}]`;
      const children = [
        createElement("div", { className: "ytst-dl-menu-head", textContent: UI_STRINGS.download }),
        createElement("div", { className: "ytst-dl-section", textContent: UI_STRINGS.directMp4 })
      ];
      if (muxed) {
        children.push(createElement("button", {
          type: "button",
          className: "ytst-dl-item",
          role: "menuitem",
          dataset: { kind: "direct" }
        }, [
          createElement("span", { className: "ytst-dl-item-main" }, [
            createElement("span", {
              className: "ytst-dl-item-title",
              textContent: `MP4 ${muxed.qualityLabel || `${muxed.height || 360}p`}`
            }),
            createElement("span", { className: "ytst-dl-item-note", textContent: UI_STRINGS.videoAudioSaved })
          ]),
          createElement("span", { className: "ytst-dl-item-meta", textContent: formatBytes(muxed.contentLength) })
        ]));
      } else {
        children.push(createElement("button", {
          type: "button",
          className: "ytst-dl-item",
          role: "menuitem",
          disabled: true
        }, [
          createElement("span", { className: "ytst-dl-item-main" }, [
            createElement("span", { className: "ytst-dl-item-title", textContent: UI_STRINGS.mp4Unavailable }),
            createElement("span", { className: "ytst-dl-item-note", textContent: UI_STRINGS.noSingleStream })
          ])
        ]));
      }
      children.push(createElement("div", {
        className: "ytst-dl-section",
        textContent: UI_TEXT.otherFormats(THIRD_PARTY_LABEL)
      }));
      children.push(createElement("button", {
        type: "button",
        className: "ytst-dl-item",
        role: "menuitem",
        dataset: { kind: "route" }
      }, [
        createElement("span", { className: "ytst-dl-item-main" }, [
          createElement("span", { className: "ytst-dl-item-title", textContent: UI_STRINGS.highQuality }),
          createElement("span", { className: "ytst-dl-item-note", textContent: UI_STRINGS.copiesLink })
        ]),
        createElement("span", { className: "ytst-dl-item-meta", textContent: "↗" })
      ]));
      children.push(createElement("div", {
        className: "ytst-dl-menu-foot",
        textContent: UI_TEXT.menuFoot(THIRD_PARTY_LABEL)
      }));
      menu.replaceChildren(...children);
      menu.querySelectorAll(".ytst-dl-item[data-kind]").forEach((item) => {
        item.addEventListener("click", () => {
          const kind = item.dataset.kind;
          closeMenu();
          if (kind === "direct") startDirect(muxed, baseName);
          else openThirdPartyWithLink(videoId);
        });
      });
    };
    const beginJob = () => {
      if (activeJob) return null;
      const job = { id: ++jobId, controller: new AbortController() };
      activeJob = job;
      return job;
    };
    const endJob = (job) => {
      if (activeJob === job) activeJob = null;
    };
    const startDirect = async (format2, baseName) => {
      const job = beginJob();
      if (!job) return;
      showProgress(UI_STRINGS.downloadingMp4);
      let lastPaint = 0;
      try {
        const blob = await fetchStream(format2.url, {
          signal: job.controller.signal,
          onProgress: (fraction, received, total) => {
            setBar(fraction);
            const now = performance.now();
            if (now - lastPaint < 120) return;
            lastPaint = now;
            const size = total ? `${formatBytes(received)} of ${formatBytes(total)}` : formatBytes(received);
            setStatus(UI_TEXT.downloadProgress(Math.round(fraction * 100), size));
          }
        });
        if (job.controller.signal.aborted) throw abortError();
        const fileName = `${baseName}.mp4`;
        saveBlob(blob, fileName);
        finishProgress(UI_TEXT.savedFile(fileName), "done");
      } catch (error) {
        failProgress(error);
      } finally {
        endJob(job);
      }
    };
    const loadPlayer = async (videoId) => {
      if (cache.id === videoId && Date.now() - cache.at < CACHE_TTL) return cache.data;
      if (inflight?.id === videoId) return inflight.promise;
      const promise = (async () => {
        let snapshot = null;
        let lastError = null;
        for (const client of CLIENTS) {
          try {
            const data = await requestPlayerResponse(videoId, client);
            const muxed = pickMuxed(data)[0] || null;
            if (!snapshot) {
              snapshot = { title: data.videoDetails?.title || "", muxed };
            }
            if (muxed) {
              snapshot.muxed = muxed;
              break;
            }
          } catch (error) {
            lastError = error;
          }
        }
        if (!snapshot) throw lastError || new Error("No client returned streaming data");
        cache = { id: videoId, at: Date.now(), data: snapshot };
        return snapshot;
      })().finally(() => {
        if (inflight?.id === videoId) inflight = null;
      });
      inflight = { id: videoId, promise };
      return promise;
    };
    const removeButton = () => {
      button?.remove();
      button = null;
    };
    const ensureButton = () => {
      if (!enabled) return;
      if (!isWatchPage() || !getVideoId()) {
        removeButton();
        closeMenu();
        return;
      }
      const row = document.querySelector("ytd-watch-metadata #top-level-buttons-computed");
      if (!row) {
        if (retryCount < 20 && !retryTimer) {
          retryTimer = setTimeout(() => {
            retryTimer = 0;
            retryCount += 1;
            ensureButton();
          }, 500);
        }
        return;
      }
      retryCount = 0;
      const videoId = getVideoId();
      if (button && button.dataset.videoId !== videoId) {
        closeMenu();
        activeJob?.controller.abort();
      }
      if (!button) {
        const caret = createIcon("chevron", 14);
        caret.classList.add("ytst-dl-caret");
        button = createElement("button", {
          type: "button",
          className: "ytst-dl-button",
          title: UI_STRINGS.download,
          "aria-label": UI_STRINGS.downloadThisVideo,
          "aria-haspopup": "menu",
          "aria-expanded": "false",
          dataset: { videoId }
        }, [
          createIcon("download", 22),
          createElement("span", { className: "ytst-dl-label", textContent: UI_STRINGS.download }),
          caret
        ]);
        button.addEventListener("click", () => {
          if (menu) closeMenu();
          else openMenu();
        });
      }
      button.dataset.videoId = videoId;
      if (button.parentElement !== row) row.appendChild(button);
    };
    return {
      init(currentPlayer) {
        enabled = true;
        player = currentPlayer || player;
        ensureButton();
      },
      update() {
        if (enabled) ensureButton();
      },
      stop() {
        enabled = false;
        clearTimeout(retryTimer);
        retryTimer = 0;
        retryCount = 0;
        activeJob?.controller.abort();
        activeJob = null;
        closeMenu();
        removeProgress();
        removeButton();
        cache = { id: "", at: 0, data: null };
        inflight = null;
      },
      get player() {
        return player;
      }
    };
  }
  const baseCosmeticCss = 'html[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-ad-slot-renderer,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-in-feed-ad-layout-renderer,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-banner-promo-renderer,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] #masthead-ad,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] #player-ads,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] .ytp-featured-product,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] .ytp-ad-overlay-container,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] .ytp-ad-overlay-slot,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] .ytp-ad-module,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] .ytp-ad-image-overlay,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-promoted-sparkles-web-renderer,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-promoted-video-renderer,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-display-ad-renderer,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-compact-promoted-video-renderer,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-video-masthead-ad-advertiser-info-renderer,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-video-masthead-ad-v3-renderer,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-merch-shelf-renderer,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-rich-item-renderer:has(ytd-ad-slot-renderer),\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-item-section-renderer > #contents > ytd-ad-slot-renderer,\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-rich-section-renderer:has(ytd-ad-slot-renderer),\nhtml[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"] ytd-consent-bump-v2-lightbox:has(~ ytd-ad-slot-renderer) {\n  display: none !important;\n}\n';
  const COSMETIC_FILTERS = [
    "youtube.com##ytd-ad-slot-renderer",
    "youtube.com##ytd-in-feed-ad-layout-renderer",
    "youtube.com##ytd-banner-promo-renderer",
    "youtube.com##ytd-statement-banner-renderer",
    "youtube.com##ytd-display-ad-renderer",
    "youtube.com##ytd-promoted-sparkles-web-renderer",
    "youtube.com##ytd-promoted-video-renderer",
    "youtube.com##ytd-compact-promoted-video-renderer",
    "youtube.com##ytd-video-masthead-ad-v3-renderer",
    "youtube.com##ytd-video-masthead-ad-advertiser-info-renderer",
    "youtube.com##ytd-merch-shelf-renderer",
    "youtube.com##ytd-action-companion-ad-renderer",
    "youtube.com##ytd-player-legacy-desktop-watch-ads-renderer",
    'youtube.com##ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
    "youtube.com##ytd-ads-engagement-panel-content-renderer",
    "youtube.com##ytm-promoted-sparkles-web-renderer",
    "youtube.com##ytd-rich-item-renderer:has(ytd-ad-slot-renderer)",
    "youtube.com##ytd-rich-section-renderer:has(ytd-ad-slot-renderer)",
    "youtube.com##ytd-item-section-renderer > #contents > ytd-ad-slot-renderer",
    "youtube.com##ytd-rich-grid-row:has(ytd-ad-slot-renderer)",
    "youtube.com###masthead-ad",
    "youtube.com###player-ads",
    "youtube.com##.ytp-ad-overlay-container",
    "youtube.com##.ytp-ad-overlay-slot",
    "youtube.com##.ytp-ad-module",
    "youtube.com##.ytp-ad-image-overlay",
    "youtube.com##.ytp-ad-progress-list",
    "youtube.com##.ytp-ad-preview-container",
    "youtube.com##.ytp-featured-product",
    "youtube.com##.ytp-ad-suggested-action",
    "youtube.com##.ytp-suggested-action:has(.ytp-ad-suggested-action)"
  ];
  const COSMETIC_PREFIX = 'html[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"]';
  const parseSelector = (rule) => {
    if (typeof rule !== "string") return null;
    const trimmed = rule.trim();
    if (!trimmed || trimmed.startsWith("!")) return null;
    if (trimmed.includes("#@#") || trimmed.includes("#?#")) return null;
    const marker = trimmed.indexOf("##");
    if (marker === -1) return null;
    const selector = trimmed.slice(marker + 2).trim();
    if (!selector || selector.startsWith("+js(")) return null;
    if (/[{};]/.test(selector)) return null;
    return selector;
  };
  function compileCosmeticCss(filters = COSMETIC_FILTERS, prefix = COSMETIC_PREFIX) {
    const selectors = /* @__PURE__ */ new Set();
    for (const rule of filters) {
      const selector = parseSelector(rule);
      if (selector) selectors.add(selector);
    }
    if (!selectors.size) return "";
    const scoped = [...selectors].map((selector) => `${prefix} ${selector}`);
    return `${scoped.join(",\n")} {
  display: none !important;
}
`;
  }
  const WALL_SELECTOR = [
    "ytd-enforcement-message-view-model",
    "ytd-modal-with-title-and-button-renderer",
    "tp-yt-paper-dialog"
  ].join(",");
  const OVERLAY_SELECTOR = "tp-yt-iron-overlay-backdrop";
  const PLAYER_SELECTOR$1 = "#movie_player, .html5-video-player";
  const SCAN_INTERVAL = 1200;
  const isEnforcementWall = (element) => {
    if (!element) return false;
    if (element.tagName === "YTD-ENFORCEMENT-MESSAGE-VIEW-MODEL") return true;
    const text = (element.innerText || element.textContent || "").slice(0, 4e3);
    if (!ADBLOCK_HINT.test(text) || !ADBLOCK_TERMS_HINT.test(text)) return false;
    return Boolean(element.closest("tp-yt-paper-dialog, ytd-popup-container")) || element.tagName.includes("DIALOG");
  };
  const resumePlayback = () => {
    const player = document.querySelector(PLAYER_SELECTOR$1);
    try {
      if (typeof player?.playVideo === "function") player.playVideo();
    } catch {
    }
    const video = player?.querySelector("video") || document.querySelector("video");
    if (video?.paused) {
      try {
        const attempt = video.play();
        if (attempt && typeof attempt.catch === "function") attempt.catch(() => {
        });
      } catch {
      }
    }
  };
  function createAdblockGuard() {
    let observer = null;
    let interval = 0;
    let scheduled = 0;
    let started = false;
    const clearWall = () => {
      const walls = [...document.querySelectorAll(WALL_SELECTOR)].filter(isEnforcementWall);
      if (!walls.length) return;
      for (const wall of walls) {
        try {
          wall.remove();
        } catch {
        }
      }
      document.querySelectorAll(OVERLAY_SELECTOR).forEach((element) => {
        try {
          element.remove();
        } catch {
        }
      });
      document.body?.style.removeProperty("overflow");
      document.documentElement?.style.removeProperty("overflow");
      resumePlayback();
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = setTimeout(() => {
        scheduled = 0;
        clearWall();
      }, 250);
    };
    const start2 = () => {
      if (started) return;
      started = true;
      const root = document.documentElement;
      if (root) {
        observer = new MutationObserver(schedule);
        observer.observe(root, { childList: true, subtree: true });
      }
      interval = setInterval(clearWall, SCAN_INTERVAL);
      clearWall();
    };
    const stop = () => {
      if (!started) return;
      started = false;
      observer?.disconnect();
      observer = null;
      clearTimeout(scheduled);
      scheduled = 0;
      clearInterval(interval);
      interval = 0;
    };
    return { start: start2, stop };
  }
  const PLAYER_SELECTOR = "#movie_player, .html5-video-player";
  const SKIP_SELECTORS = [
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button-container button",
    "button.ytp-ad-skip-button-modern"
  ];
  const AD_CLASSES = ["ad-showing", "ad-interrupting"];
  const TICK_INTERVAL = 250;
  const CLICK_COOLDOWN = 400;
  const findPlayer = () => document.querySelector(PLAYER_SELECTOR);
  const isAdShowing = (player) => Boolean(player) && AD_CLASSES.some((name) => player.classList.contains(name));
  const findVideo = (player) => player?.querySelector("video") || document.querySelector("video");
  const findSkipButton = (player) => {
    for (const selector of SKIP_SELECTORS) {
      const button = player?.querySelector(selector) || document.querySelector(selector);
      if (button && !button.disabled && button.isConnected) return button;
    }
    return null;
  };
  function createAdblockSkipper() {
    let observer = null;
    let interval = 0;
    let debounce = 0;
    let mutedState = null;
    let lastClick = 0;
    let started = false;
    const stopInterval = () => {
      clearInterval(interval);
      interval = 0;
    };
    const restore = () => {
      if (!mutedState) return;
      const video = mutedState.video;
      if (video) {
        try {
          video.muted = mutedState.muted;
          video.playbackRate = mutedState.rate;
        } catch {
        }
      }
      mutedState = null;
      stopInterval();
    };
    const tick = () => {
      if (!started) return;
      const player = findPlayer();
      if (!player || !isAdShowing(player)) {
        restore();
        return;
      }
      const video = findVideo(player);
      if (!video) return;
      if (!mutedState) {
        mutedState = { video, muted: video.muted, rate: video.playbackRate };
        try {
          video.muted = true;
        } catch {
        }
      }
      const now = Date.now();
      if (now - lastClick > CLICK_COOLDOWN) {
        const skip = findSkipButton(player);
        if (skip) {
          lastClick = now;
          try {
            skip.click();
          } catch (error) {
            console.warn("YT SuperTool could not click the skip button:", error);
          }
        }
      }
      if (Number.isFinite(video.duration) && video.duration > 0) {
        if (video.duration - video.currentTime > 0.15) {
          try {
            video.currentTime = video.duration;
          } catch {
          }
        }
      } else if (video.playbackRate < 16) {
        try {
          video.playbackRate = 16;
        } catch {
        }
      }
      if (!interval) interval = setInterval(tick, TICK_INTERVAL);
    };
    const schedule = () => {
      clearTimeout(debounce);
      debounce = setTimeout(tick, 120);
    };
    const onNavigate = () => {
      restore();
      schedule();
    };
    return {
      start() {
        if (started) {
          schedule();
          return;
        }
        started = true;
        const root = document.body || document.documentElement;
        if (!root) return;
        observer = new MutationObserver(schedule);
        observer.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class"]
        });
        document.addEventListener("yt-navigate-finish", onNavigate, { passive: true });
        schedule();
      },
      stop() {
        started = false;
        observer?.disconnect();
        observer = null;
        clearTimeout(debounce);
        debounce = 0;
        document.removeEventListener("yt-navigate-finish", onNavigate);
        restore();
      }
    };
  }
  const cosmeticCss = `${baseCosmeticCss}
${compileCosmeticCss(COSMETIC_FILTERS)}`;
  const FLAGS = {
    master: "ytstAdblock",
    prune: "ytstAdblockPrune",
    cosmetic: "ytstAdblockCosmetic"
  };
  function createAdblock({ bridge: bridge2, settings }) {
    let skipper = null;
    let guard = null;
    let cosmeticInjected = false;
    let started = false;
    const setFlag = (name, enabled) => {
      const root = document.documentElement;
      if (!root) return;
      root.dataset[name] = enabled ? "on" : "off";
    };
    const sync = () => {
      const master = Boolean(settings.get("adblock"));
      const prune = master && Boolean(settings.get("adblockPrune"));
      const cosmetic = master && Boolean(settings.get("adblockCosmetic"));
      const skip = master && Boolean(settings.get("adblockSkipper"));
      setFlag(FLAGS.master, master);
      setFlag(FLAGS.prune, prune);
      setFlag(FLAGS.cosmetic, cosmetic);
      bridge2.setNetworkBlocking?.(master);
      if (cosmetic && !cosmeticInjected) {
        bridge2.injector.injectStyle(cosmeticCss, "ytst-adblock-cosmetic");
        cosmeticInjected = true;
      }
      if (skip) skipper?.start();
      else skipper?.stop();
      if (master) guard?.start();
      else guard?.stop();
    };
    settings.subscribe((key) => {
      if (!started) return;
      if (key === null || typeof key === "string" && key.startsWith("adblock")) sync();
    });
    return {
      init() {
        started = true;
        if (!skipper) skipper = createAdblockSkipper();
        if (!guard) guard = createAdblockGuard();
        sync();
      },
      stop() {
        started = false;
        setFlag(FLAGS.master, false);
        setFlag(FLAGS.prune, false);
        setFlag(FLAGS.cosmetic, false);
        skipper?.stop();
        guard?.stop();
      }
    };
  }
  function createFeatures(context) {
    return {
      dislike: createDislike(context),
      noShorts: createNoShorts(),
      cleanHomepage: createCleanHomepage(),
      nonstop: createNonstop(),
      sponsorblock: createSponsorBlock(context),
      speed: createSpeed(context),
      pip: createPiP(),
      screenshot: createScreenshot(context),
      downloader: createDownloader(context),
      adblock: createAdblock(context)
    };
  }
  const isYouTube = () => {
    const host = location.hostname;
    return host === "youtube.com" || host.endsWith(".youtube.com");
  };
  const start = async () => {
    bridge.injector.injectStyle(globalCss, "ytst-global");
    const settings = createSettings({ storage: bridge.storage });
    await settings.load();
    const toast = createToast();
    const features = createFeatures({ bridge, settings, toast });
    const update = createUpdateChecker({ bridge, toast, currentVersion: bridge.version });
    const panel = createPanel({
      settings,
      storage: bridge.storage,
      toast,
      update,
      meta: { version: bridge.version, target: bridge.env }
    });
    const launcher = createLauncher({ onOpen: () => panel.toggle() });
    const PLAYER_RETRY_MAX = 20;
    let active = !document.hidden;
    let playerRetryTimer = 0;
    let playerRetryCount = 0;
    let refreshTimer = 0;
    let cachedPlayer = null;
    let cachedAt = 0;
    const getPlayer2 = () => {
      const now = performance.now();
      if (cachedPlayer?.isConnected && now - cachedAt < 2e3) return cachedPlayer;
      const player = document.querySelector("#movie_player, .html5-video-player");
      if (player) {
        cachedPlayer = player;
        cachedAt = now;
      } else {
        cachedPlayer = null;
      }
      return player;
    };
    const initPlayerFeatures = () => {
      if (!active) return;
      const player = getPlayer2();
      if (!player) {
        if (playerRetryCount < PLAYER_RETRY_MAX) {
          clearTimeout(playerRetryTimer);
          playerRetryCount += 1;
          playerRetryTimer = setTimeout(initPlayerFeatures, 500);
        }
        return;
      }
      clearTimeout(playerRetryTimer);
      playerRetryTimer = 0;
      playerRetryCount = 0;
      launcher.ensurePlayer(player);
      PLAYER_FEATURES.forEach((key) => {
        if (settings.get(key)) features[key]?.init?.(player);
      });
    };
    const apply = () => {
      if (!active) return;
      try {
        CONTENT_FEATURES.forEach((key) => {
          const feature = features[key];
          if (!feature) return;
          if (settings.get(key)) feature.init?.();
          else feature.stop?.();
        });
        launcher.ensureHeader();
        initPlayerFeatures();
        panel.syncTheme();
      } catch (error) {
        console.warn("YT SuperTool apply pass failed:", error);
      }
    };
    const scheduleApply = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if ("requestIdleCallback" in window) requestIdleCallback(apply, { timeout: 500 });
        else apply();
      }, 200);
    };
    const isPlayerMutation = (mutations) => mutations.some((mutation) => {
      if (mutation.target?.closest?.(".html5-video-player")) return true;
      if (mutation.target?.matches?.("#player, #movie_player, .html5-video-player, .ytp-left-controls, .ytp-right-controls")) return true;
      return [...mutation.addedNodes].some((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        if (node.matches?.(".html5-video-player, #movie_player, #player, .ytp-left-controls, .ytp-right-controls, ytd-segmented-like-dislike-button-renderer")) return true;
        return Boolean(node.querySelector?.(".html5-video-player, #movie_player, #player, .ytp-left-controls, .ytp-right-controls"));
      });
    });
    const handleMutations = (mutations) => {
      if (!active) return;
      MUTATION_FEATURES.forEach((key) => {
        if (settings.get(key)) features[key]?.update?.(mutations);
      });
      if (settings.get("adblock")) features.adblock?.update?.(mutations);
      panel.syncTheme();
      if (!document.querySelector(".ytst-header-button")) launcher.ensureHeader();
      if (isPlayerMutation(mutations)) initPlayerFeatures();
    };
    const handleNavigation = () => {
      playerRetryCount = 0;
      clearTimeout(playerRetryTimer);
      playerRetryTimer = 0;
      cachedPlayer = null;
      cachedAt = 0;
      launcher.ensureHeader();
      setTimeout(() => {
        if (settings.get("cleanHomepage")) features.cleanHomepage?.init?.();
      }, 500);
      scheduleApply();
    };
    const lifecycle = createLifecycleManager({
      onNavigate: handleNavigation,
      onMutations: handleMutations
    });
    settings.subscribe(() => {
      panel.syncTheme();
      scheduleApply();
    });
    const handleVisibility = () => {
      active = !document.hidden;
      if (active) {
        apply();
        lifecycle.start();
      } else {
        lifecycle.stop();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility, { passive: true });
    if (active) {
      apply();
      lifecycle.start();
    }
    bridge.onMenuCommand?.(UI_STRINGS.settingsTitle, () => panel.toggle());
    void update.auto();
    return { settings, features, panel, launcher, update, apply };
  };
  async function initCore() {
    if (!isYouTube()) return null;
    if (globalThis.__ytstApp) return globalThis.__ytstApp;
    globalThis.__ytstApp = start();
    return globalThis.__ytstApp;
  }
  bridge.injector.injectMainWorld?.();
  initCore().catch((error) => {
    console.error("YT SuperTool failed to start:", error);
  });
})();
