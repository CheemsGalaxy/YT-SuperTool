(function() {
  "use strict";
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
  toPattern(PAUSE_PHRASES);
  toPattern(PLAYBACK_ERROR_PHRASES);
  const ADBLOCK_HINT = toPattern(ADBLOCK_PHRASES);
  const ADBLOCK_TERMS_HINT = toPattern(ADBLOCK_TERMS_PHRASES);
  const AD_KEYS = [
    "adPlacements",
    "playerAds",
    "adSlots",
    "adBreakHeartbeatParams",
    "adParams",
    "adSafetyReason",
    "adBreakParams",
    "playerAdParams",
    "adConfig",
    "adBreakServiceRenderer",
    "adBreakService",
    "adBreak",
    "adBreaks",
    "adPod",
    "adPods",
    "adVideoId",
    "adVideoIds",
    "adThumbnail",
    "adThumbnailDetails",
    "paidContentOverlay"
  ];
  const AD_KEYS_SET = new Set(AD_KEYS);
  const AD_KEY_PATTERN = new RegExp(
    `"(${AD_KEYS.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})"\\s*:`,
    "g"
  );
  const RENAMED_PREFIX = "ytst_no_ads_";
  const MAX_DEPTH = 12;
  const MAX_NODES = 12e3;
  const rewriteAdKeys = (text) => {
    if (typeof text !== "string" || text.length === 0) return text;
    return text.replace(AD_KEY_PATTERN, (match, key) => `"${RENAMED_PREFIX}${key}":`);
  };
  const sanitizeResponseText = (text) => {
    if (typeof text !== "string" || text.length === 0) return text;
    const rewritten = rewriteAdKeys(text);
    const hasEnforcement = text.includes("enforcementMessageViewModel") || text.includes("adBlockMessageViewModel") || text.includes("errorScreen") && ADBLOCK_HINT.test(text);
    if (!hasEnforcement) return rewritten;
    try {
      const parsed = JSON.parse(rewritten);
      sanitizePlayerResponse(parsed);
      return JSON.stringify(parsed);
    } catch {
      return rewritten;
    }
  };
  const hasAntiAdblockMessage = (status) => {
    if (!status || typeof status !== "object") return false;
    if (status.enforcementMessageViewModel || status.adBlockMessageViewModel) return true;
    try {
      const text = JSON.stringify(status);
      if (!ADBLOCK_HINT.test(text)) return false;
      return Boolean(status.errorScreen) || ADBLOCK_TERMS_HINT.test(text);
    } catch {
      return false;
    }
  };
  const sanitizePlayabilityStatus = (status) => {
    if (!status || typeof status !== "object") return;
    const enforced = Boolean(status.enforcementMessageViewModel || status.adBlockMessageViewModel) || status.status === "ERROR" && hasAntiAdblockMessage(status);
    delete status.enforcementMessageViewModel;
    delete status.adBlockMessageViewModel;
    if (enforced) {
      status.status = "OK";
      delete status.reason;
      delete status.errorScreen;
      delete status.messages;
      delete status.subreason;
    }
  };
  const walk = (node, depth, counter) => {
    if (!node || typeof node !== "object") return;
    if (depth > MAX_DEPTH || counter.count > MAX_NODES) return;
    counter.count += 1;
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index += 1) {
        walk(node[index], depth + 1, counter);
      }
      return;
    }
    for (const key of Object.keys(node)) {
      if (AD_KEYS_SET.has(key)) {
        const value = node[key];
        try {
          delete node[key];
        } catch {
          node[key] = void 0;
        }
        try {
          node[`${RENAMED_PREFIX}${key}`] = value;
        } catch {
        }
        continue;
      }
      if (key === "enforcementMessageViewModel" || key === "adBlockMessageViewModel") {
        try {
          delete node[key];
        } catch {
          node[key] = void 0;
        }
        continue;
      }
      if (key === "playabilityStatus") {
        sanitizePlayabilityStatus(node[key]);
        continue;
      }
      walk(node[key], depth + 1, counter);
    }
  };
  function sanitizePlayerResponse(payload) {
    if (!payload || typeof payload !== "object") return payload;
    walk(payload, 0, { count: 0 });
    return payload;
  }
  const isPlayerEndpoint = (url) => typeof url === "string" && /\/youtubei\/v1\/(?:player|next|get_watch|reel|reel_watch_sequence|updated_metadata)\b/.test(url);
  const isYouTubeAdEndpoint = (url) => {
    if (typeof url !== "string" || url.length === 0) return false;
    return /\/youtubei\/v1\/ads(?:\/|\b)/.test(url) || /\/pagead\//.test(url) || /\/api\/stats\/(?:ads|atr|delayplay)\b/.test(url) || /\/ptracking\b/.test(url) || /[?&]adformat=/.test(url) || /\/get_video_info\?.*(?:adformat|ad_type)=/.test(url);
  };
  const hasAdPayload = (text) => {
    if (typeof text !== "string" || text.length === 0) return false;
    if (text.includes("enforcementMessageViewModel") || text.includes("adBlockMessageViewModel") || text.includes("errorScreen")) return true;
    return AD_KEYS.some((key) => text.includes(key));
  };
  const MASTER_KEY = "yt_supertool_adblock";
  const PRUNE_KEY = "yt_supertool_adblock_prune";
  const readFlag = (win, key) => {
    try {
      const value = win?.localStorage?.getItem(key);
      if (value === "1") return true;
      if (value === "0") return false;
    } catch {
    }
    return null;
  };
  const readAdblockCache = (win) => readFlag(win, MASTER_KEY);
  const readAdblockPruneCache = (win) => readFlag(win, PRUNE_KEY);
  const isAdblockEnabled = (win) => {
    const dataset = win?.document?.documentElement?.dataset;
    if (dataset?.ytstAdblock === "on") return true;
    if (dataset?.ytstAdblock === "off") return false;
    return readAdblockCache(win) === true;
  };
  const isPruningEnabled = (win) => {
    const data = win?.document?.documentElement?.dataset || {};
    if (data.ytstAdblock === "off" || data.ytstAdblockPrune === "off") return false;
    if (!isAdblockEnabled(win)) return false;
    if (data.ytstAdblockPrune === "on") return true;
    return readAdblockPruneCache(win) !== false;
  };
  const prune = (win, value) => {
    if (!isPruningEnabled(win)) return value;
    return sanitizePlayerResponse(value);
  };
  const bindPlayerResponse = (win, name) => {
    let current;
    try {
      current = prune(win, win[name]);
    } catch {
      current = void 0;
    }
    try {
      Object.defineProperty(win, name, {
        configurable: true,
        enumerable: true,
        get() {
          return current;
        },
        set(value) {
          current = prune(win, value);
        }
      });
      return true;
    } catch {
      return false;
    }
  };
  function installAdblockPrune(win = globalThis) {
    if (!win || win.__ytstPruneInstalled) return false;
    try {
      const responseProto = win.Response?.prototype;
      if (responseProto && typeof responseProto.json === "function") {
        const nativeJson = responseProto.json;
        responseProto.json = function json(...args) {
          const pending = nativeJson.apply(this, args);
          if (!isPlayerEndpoint(this.url)) return pending;
          return Promise.resolve(pending).then((value) => prune(win, value));
        };
      }
      bindPlayerResponse(win, "ytInitialPlayerResponse");
      bindPlayerResponse(win, "playerResponse");
      win.__ytstPruneInstalled = true;
      return true;
    } catch (error) {
      console.warn("YT SuperTool could not install the ad prune layer:", error);
      return false;
    }
  }
  const AD_FLAGS = [
    "web_enable_ab_rsp_cl",
    "ab_pl_man",
    "adblock_detection",
    "adblock_detection_enabled",
    "enable_adblock_detection",
    "adblock_detection_message"
  ];
  const patchFlags = (flags) => {
    if (!flags || typeof flags !== "object") return false;
    let changed = false;
    AD_FLAGS.forEach((name) => {
      if (!(name in flags)) return;
      try {
        flags[name] = false;
        changed = true;
      } catch {
      }
    });
    return changed;
  };
  const patchConfig = (win) => {
    if (!isAdblockEnabled(win)) return false;
    let patched = false;
    const configs = [
      win?.yt?.config_,
      win?.ytplayer?.config,
      win?.ytcfg?.data_
    ];
    for (const config of configs) {
      if (!config || typeof config !== "object") continue;
      if (patchFlags(config.EXPERIMENT_FLAGS)) patched = true;
      if (patchFlags(config.args)) patched = true;
      const popups = config.openPopupConfig?.supportedPopups;
      if (popups?.adBlockMessageViewModel) {
        try {
          popups.adBlockMessageViewModel = false;
          patched = true;
        } catch {
        }
      }
    }
    try {
      const ytcfg = win?.ytcfg;
      if (ytcfg && typeof ytcfg.get === "function") {
        try {
          if (patchFlags(ytcfg.get("EXPERIMENT_FLAGS"))) patched = true;
        } catch {
        }
      }
    } catch {
    }
    return patched;
  };
  const installConfigHook = (win) => {
    const ytcfg = win?.ytcfg;
    if (!ytcfg || typeof ytcfg.set !== "function" || ytcfg.set.__ytstAdblock) return null;
    const nativeSet = ytcfg.set;
    const patchedSet = function set(key, value) {
      if (key === "EXPERIMENT_FLAGS" && isAdblockEnabled(win)) patchFlags(value);
      return nativeSet.call(this, key, value);
    };
    Object.defineProperty(patchedSet, "__ytstAdblock", { value: true });
    try {
      ytcfg.set = patchedSet;
      return nativeSet;
    } catch {
      return null;
    }
  };
  function createAdblockStealth(win = globalThis) {
    let timer = 0;
    let observer = null;
    let started = false;
    let restoreSet = null;
    const stop = () => {
      if (!started) return false;
      started = false;
      if (timer) win.clearInterval?.(timer);
      timer = 0;
      observer?.disconnect();
      observer = null;
      if (restoreSet && win.ytcfg) {
        try {
          win.ytcfg.set = restoreSet;
        } catch {
        }
      }
      restoreSet = null;
      return true;
    };
    const start = () => {
      if (started || !win || !isAdblockEnabled(win)) return started;
      started = true;
      restoreSet = installConfigHook(win);
      let attempts = 0;
      const interval = win.setInterval || globalThis.setInterval;
      timer = interval.call(win, () => {
        attempts += 1;
        if (patchConfig(win) || attempts >= 40) {
          win.clearInterval?.(timer);
          timer = 0;
        }
      }, 250);
      try {
        const root = win.document?.documentElement;
        const Observer = win.MutationObserver;
        if (root && typeof Observer === "function") {
          observer = new Observer(() => {
            if (!isAdblockEnabled(win)) {
              stop();
              return;
            }
            patchConfig(win);
          });
          observer.observe(root, { attributes: true, attributeFilter: ["data-ytst-adblock"] });
        }
      } catch {
      }
      patchConfig(win);
      return true;
    };
    return {
      start,
      stop,
      get started() {
        return started;
      }
    };
  }
  function installAdblockStealth(win = globalThis) {
    if (!win) return null;
    if (win.__ytstStealth) return win.__ytstStealth;
    const controller = createAdblockStealth(win);
    win.__ytstStealth = controller;
    controller.start();
    return controller;
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
  const jsonResponse = (win, body = "{}") => {
    const ResponseCtor = win?.Response || globalThis.Response;
    try {
      return new ResponseCtor(body, {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" }
      });
    } catch {
      return void 0;
    }
  };
  const blockResponse = (win) => {
    const ResponseCtor = win?.Response || globalThis.Response;
    try {
      return new ResponseCtor(null, { status: 204, statusText: "No Content" });
    } catch {
      return void 0;
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
      headers.delete("content-length");
      headers.delete("content-encoding");
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
    if (typeof nativeFetch !== "function" || nativeFetch.__ytstAdblock) return;
    const patchedFetch = function patchedFetch2(input, init) {
      let url = "";
      try {
        url = typeof input === "string" ? input : input?.url || String(input || "");
      } catch {
        url = "";
      }
      if (isAdblockEnabled(win) && matchRequest(win, url)) {
        const blocked = isYouTubeAdEndpoint(url) ? jsonResponse(win) : blockResponse(win);
        if (blocked) return Promise.resolve(blocked);
        return Promise.reject(new win.TypeError("Failed to fetch"));
      }
      const result = nativeFetch.apply(this, arguments);
      if (!isPlayerEndpoint(url) || !isAdblockEnabled(win)) return result;
      return Promise.resolve(result).then((response) => sanitizeFetchResponse(win, response));
    };
    Object.defineProperty(patchedFetch, "__ytstAdblock", { value: true });
    win.fetch = patchedFetch;
  };
  const installBeaconHook = (win) => {
    const navigatorObject = win?.navigator;
    const nativeBeacon = navigatorObject?.sendBeacon;
    if (typeof nativeBeacon !== "function" || nativeBeacon.__ytstAdblock) return;
    const patchedBeacon = function sendBeacon(url, data) {
      try {
        if (isAdblockEnabled(win) && matchRequest(win, String(url), "ping")) return true;
      } catch {
      }
      return nativeBeacon.call(navigatorObject, url, data);
    };
    Object.defineProperty(patchedBeacon, "__ytstAdblock", { value: true });
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
        const raw = responseType === "" || responseType === "text" ? readResponseText(xhr, textDescriptor) : null;
        let text = raw;
        if (!text && responseType === "json" && responseDescriptor?.get) {
          const value2 = responseDescriptor.get.call(xhr);
          if (value2 && typeof value2 === "object") {
            cachedJson = value2;
            text = JSON.stringify(value2);
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
      Object.defineProperty(xhr, "responseText", {
        configurable: true,
        get() {
          parse();
          return cachedText !== void 0 ? cachedText : readResponseText(xhr, textDescriptor);
        }
      });
    }
    if (responseDescriptor?.get) {
      Object.defineProperty(xhr, "response", {
        configurable: true,
        get() {
          parse();
          const responseType = xhr.responseType;
          if (cachedText !== void 0 && (responseType === "" || responseType === "text")) {
            return cachedText;
          }
          if (cachedJson !== void 0) return cachedJson;
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
        const body = "{}";
        defineValue(xhr, "readyState", 4);
        defineValue(xhr, "status", 200);
        defineValue(xhr, "statusText", "OK");
        defineValue(xhr, "responseURL", url);
        defineValue(xhr, "responseText", body);
        defineValue(xhr, "response", xhr.responseType === "json" ? {} : body);
        defineValue(xhr, "getResponseHeader", (name) => String(name).toLowerCase() === "content-type" ? "application/json" : null);
        defineValue(xhr, "getAllResponseHeaders", () => "content-type: application/json\r\n");
        xhr.dispatchEvent(new win.Event("readystatechange"));
        const ProgressCtor = win.ProgressEvent;
        if (typeof ProgressCtor === "function") {
          xhr.dispatchEvent(new ProgressCtor("progress", {
            lengthComputable: true,
            loaded: body.length,
            total: body.length
          }));
        }
        xhr.dispatchEvent(new win.Event("load"));
        xhr.dispatchEvent(new win.Event("loadend"));
        delete xhr.__ytstBlockedToken;
      } catch {
      }
    };
    if (typeof win.queueMicrotask === "function") win.queueMicrotask(finish);
    else win.setTimeout(finish, 0);
  };
  const installXhrHook = (win) => {
    const XHR = win?.XMLHttpRequest;
    const proto = XHR?.prototype;
    if (!proto || proto.__ytstAdblock) return;
    const nativeOpen = proto.open;
    const nativeSend = proto.send;
    const textDescriptor = Object.getOwnPropertyDescriptor(proto, "responseText");
    const responseDescriptor = Object.getOwnPropertyDescriptor(proto, "response");
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
        this.__ytstUrl = typeof url === "string" ? url : String(url || "");
      } catch {
      }
      return nativeOpen.call(this, method, url, ...rest);
    };
    proto.send = function send(body) {
      const url = this.__ytstUrl || "";
      if (isAdblockEnabled(win) && matchRequest(win, url)) {
        fakeBlockedXhr(win, this, url);
        return void 0;
      }
      if (isPlayerEndpoint(url) && isAdblockEnabled(win)) {
        installSanitizedXhrGetters(this, textDescriptor, responseDescriptor);
      }
      return nativeSend.call(this, body);
    };
    Object.defineProperty(proto, "__ytstAdblock", { value: true });
  };
  function installNetworkGuard(win) {
    if (!win || win.__ytstNetworkGuard) return false;
    try {
      installFetchHook(win);
      installXhrHook(win);
      installBeaconHook(win);
      win.__ytstNetworkGuard = true;
      return true;
    } catch (error) {
      console.warn("YT SuperTool could not install the adblock request guard:", error);
      return false;
    }
  }
  const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const stealth = installAdblockStealth(pageWindow);
  installAdblockPrune(pageWindow);
  installNetworkGuard(pageWindow);
  document.addEventListener("ytst-adblock-change", (event) => {
    if (event.detail?.enabled) stealth?.start?.();
    else stealth?.stop?.();
  });
})();
