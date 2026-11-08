# Architecture Audit

## Original implementation

The original extension uses classic scripts declared in the root `manifest.json`:

- `content/styles.js` injects the shared player-control CSS.
- `content/features/*.js` attach feature APIs to the shared `window.YTSuperTool` namespace.
- `content/observer.js` batches YouTube DOM mutations.
- `content/main.js` loads settings, starts/stops features, and handles SPA/player lifecycle.
- `background/background.js` fetches dislike data, stores a bounded cache, and handles download-tab requests.
- `popup/popup.js`, `popup/popup.html`, and `popup/popup.css` provide the feature settings interface.

## Features and original entry points

| Feature | Original functions/API | Default |
|---|---|---|
| Return Dislike | `dislike.initDislike`, `updateDislike`, `stopDislike`; background `fetchDislikeHandler` and dislike cache helpers | On |
| No Shorts | `noShorts.initNoShorts`, `updateNoShorts`, `stopNoShorts` | On |
| Clean Homepage | `cleanHomepage.initCleanHomepage`, `updateCleanHomepage`, `stopCleanHomepage` | On |
| Auto Continue | `nonstop.initNonstop`, `updateNonstop`, `stopNonstop` | On |
| SponsorBlock | `sponsorblock.initSponsorBlock`, `stopSponsorBlock`, `openSettings`; fetches community segments, skips configured categories, and supports undo/settings overlay | On in the supplied userscript |
| Playback Speed | `speed.initSpeed`, `stopSpeed`, `cleanupSpeed`; slider, presets, `<`/`>` keyboard controls, persisted playback speed | On |
| Downloader | `downloader.initDownloader`, `stopDownloader`; background opens the matching ssyoutube page | Off |
| Picture in Picture | `pip.initPiP`, `stopPiP`; uses browser Picture-in-Picture APIs | On |
| Screenshot | `screenshot.initScreenshot`, `stopScreenshot`; captures PNG through canvas | On |

The extension popup setting keys are `dislike`, `noShorts`, `cleanHomepage`, `nonstop`, `speed`, `downloader`, `pip`, and `screenshot`. The supplied userscript also includes `sponsorblock`; its extra settings are `sponsorblockCategories` and `sponsorblockNotice`. Playback speed is stored under `playbackSpeed`. The extension background dislike cache uses `dislike_<videoId>` in `chrome.storage.session`, falling back to `chrome.storage.local`. The supplied userscript uses `GM_getValue` / `GM_setValue`; the original extension code did not use `localStorage`.

## YouTube DOM selectors and lifecycle

- Player and controls: `.html5-video-player`, `video`, `#player`, `#movie_player`, `.ytp-left-controls`, `.ytp-right-controls`, `.ytp-time-display`, `.ytp-settings-button`, `.ytp-fullscreen-button`, `.ytp-subtitles-button`, `.ytp-button`, `#top-level-buttons-computed`.
- Dislike UI: `ytd-segmented-like-dislike-button-renderer`, `dislike-button-view-model`, `ytd-menu-renderer`, `ytd-toggle-button-renderer`, `button[aria-label*="dislike" i]`.
- Shorts UI: `ytd-rich-shelf-renderer[is-shorts]`, `ytd-reel-shelf-renderer`, `ytm-shorts-lockup-view-model`, `ytd-guide-entry-renderer`, `ytd-mini-guide-entry-renderer`, `ytd-rich-section-renderer`, `ytd-rich-item-renderer`, `ytd-video-renderer`, `ytd-grid-video-renderer`, `ytm-video-with-context-renderer`, `ytm-compact-video-renderer`, `a[href="/shorts"]`, `a[href^="/shorts/"]`.
- Homepage cleanup: `yt-mealbar-promo-renderer`, `tp-yt-paper-dialog`, `ytd-popup-container`, `ytd-rich-section-renderer`, `ytd-inline-survey-renderer`, `ytd-statement-banner-renderer`, `ytd-mini-game-card-view-model`, `mini-game-card-view-model`, `ytd-rich-shelf-renderer[is-live]`.
- Continue-watching dialogs: `.yt-confirm-dialog-renderer`, `#dialog`, `[role="dialog"]`, `ytd-popup-container`, `tp-yt-paper-dialog`, and the corresponding continue-watching/playback-interruption labels and text.
- SPA lifecycle: `yt-navigate-finish`, `yt-page-data-updated`, `visibilitychange`, and a batched `MutationObserver`. Player-specific features retry initialization when player controls appear.

## Environment APIs in original code

- Extension storage: `chrome.storage.local`, `chrome.storage.session`, `chrome.storage.onChanged`.
- Extension runtime: `chrome.runtime.onInstalled`, `chrome.runtime.onMessage`, `chrome.runtime.sendMessage`, `chrome.runtime.lastError`.
- Tabs: `chrome.tabs.query`, `chrome.tabs.reload`, and `chrome.tabs.create`.
- Network: background `fetch()` to `https://returnyoutubedislikeapi.com/votes`; request timeout uses `AbortSignal.timeout(8000)`.
- DOM/browser APIs: `MutationObserver`, `matchMedia`, `HTMLVideoElement.playbackRate`, Picture-in-Picture, canvas, and `window.open`/download anchors.
- The original source has no Userscript `GM_*`, `unsafeWindow`, `XMLHttpRequest`, or `localStorage` calls.

## Migration status and constraints

Original feature implementations have been carried into `src/core/features/` and are wired through the shared core entry. Storage, network requests, style injection, and external tab opening are routed through `src/adapters/`. The three static inline SVG strings were replaced with namespaced SVG DOM construction to avoid Trusted Types-sensitive `innerHTML` assignment. CSS is now in `src/core/ui/theme.css` and `src/core/ui/global.css`. Keep feature defaults, storage keys, shortcut behavior, dislike API, caching behavior, and SPA cleanup consistent across targets.

## Multi-target architecture (v2.3.0)

The project now builds three distributions from a single core. `src/core/` holds all DOM logic and UI and never calls `GM_*`, `chrome.*` or `browser.*`; those live in `src/adapters/userscript.adapter.js` and `src/adapters/extension.adapter.js`, selected at build time through `__TARGET__`.

- `src/core/index.js` boots settings, the feature registry, the Shadow-DOM panel, launchers and the single SPA lifecycle observer.
- `src/core/dom-safe.js` replaces the former `trusted-types.js` helper; core uses no `innerHTML`.
- Design tokens live in `src/core/ui/theme.css` (Shadow DOM panel) and `src/core/ui/global.css` (host-page controls). The former `src/core/ui/styles.css` was removed.
- `src/core/features/adblock/` contains the three layers: `adblock-prune.js` (main-world JSON prune), `adblock-cosmetic.css` (guarded cosmetic filters) and `adblock-skipper.js` (player fallback).
- `src/rules/yt-adblock-dnr.json` is packaged as the MV3 `declarative_net_request` ruleset.
- `scripts/build-all.mjs` bundles the userscript, MV2 and MV3 targets; `scripts/verify-build.mjs` validates structure, manifests, bundles, adblock layers, UI rules and archives.

Commands: `npm run build`, `npm run verify`, `npm run build:verify`.

MV2 cannot run a content script in the MAIN world, so `content.entry.js` injects `main-world.js` from `web_accessible_resources` at document-start. MV3 declares the same file with `"world": "MAIN"`. If the injected MV2 script loads after YouTube's bootstrap, layer 3 still removes the ad.

The original `content/`, `background/`, `popup/`, root `manifest.json` and root `assets/` were removed; `dist/` is the only distribution output.
