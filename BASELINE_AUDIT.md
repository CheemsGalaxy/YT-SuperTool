# Baseline audit

Phase 0 of the Companion roadmap. No product code changed in this phase.
Measurements come from the working tree on Windows (`win32`), Node v26.13.0,
npm 12.2.1. CI uses Node 20.

## Repository layout

| Path | Role |
|---|---|
| `src/core/` | Shared DOM, settings, UI and feature logic. No browser extension API calls. |
| `src/adapters/` | Target-specific storage, network, style injection, external tab, menu command. |
| `src/entries/` | Vite entry points for userscript, content script, main world, background and popup. |
| `src/manifests/` | Base, MV2 and MV3 manifest fragments. |
| `src/rules/` | MV3 declarativeNetRequest ruleset. |
| `scripts/build-all.mjs` | Vite bundle for all targets, manifest merge, zip archives. |
| `scripts/verify-build.mjs` | Structural checks for bundles, manifests, rulesets and zips. |
| `dist/` | Committed build output for userscript, MV2, MV3 and both zips. |
| `.github/workflows/release.yml` | Ubuntu runner, `npm ci`, `npm run build:verify`, upload assets to the `Release` tag. |

The local working copy is not a git repository. Release commits are made from
`C:\Users\Cheems\AppData\Local\Temp\opencode\yt-supertool-deploy`, which tracks
`https://github.com/CheemsGalaxy/YT-SuperTool.git`.

## Entry points

| Target | Entry | Output |
|---|---|---|
| Userscript | `src/entries/userscript.entry.js` | `dist/userscript/yt-supertool.user.js` |
| MV2 content | `src/entries/content.entry.js` | `dist/mv2/content.js` |
| MV2 background | `src/entries/background.mv2.entry.js` | `dist/mv2/background.js` |
| MV3 content | `src/entries/content.entry.js` | `dist/mv3/content.js` |
| MV3 background | `src/entries/background.mv3.entry.js` | `dist/mv3/background.js` |
| MV3 main world | `src/entries/main-world.entry.js` | `dist/mv3/main-world.js` |
| Popup | `src/entries/popup/popup.js` | `dist/mv2/popup.js`, `dist/mv3/popup.js` |

`src/core/index.js` starts settings, the feature registry, the Shadow DOM
panel, launchers, update checks and one SPA lifecycle observer. The core calls
`bridge` for every target-specific operation.

## Current downloader flow

```
Watch page
  |
  v
core/index.js initPlayerFeatures()
  |
  v
downloader.init(player)
  |
  v
ensureButton()
  query ytd-watch-metadata #top-level-buttons-computed
  append .ytst-dl-button
  |
  v
click -> openMenu()
  |
  v
getVideoId() from location
  |
  v
loadPlayer(videoId)
  fetch POST /youtubei/v1/player (credentials include)
  clients: ANDROID, IOS, ANDROID_VR
  pick highest muxed video/mp4 from streamingData.formats
  cache 10 minutes, dedupe in-flight request
  |
  +--> Direct MP4 item
  |      fetchStream(format.url, range bytes=0-)
  |      AbortController cancel
  |      progress from content-length
  |      Blob -> object URL -> anchor download
  |
  +--> High quality item
         copy watch URL
         bridge.openExternal('https://ytmp3pc.com/')
         external site handles the download
```

The menu also shows a disabled item when no muxed MP4 exists. The floating
progress panel sits near the button, follows scroll and resize, and turns into
a close button on success or failure.

### Downloader behavior details

| Concern | Current behavior |
|---|---|
| Video ID | `v` query on `/watch`; path segment for `/live`, `/shorts`, `/embed`. |
| Analyze source | YouTube player endpoint from the content script, not yt-dlp. |
| Format choice | Highest `video/mp4` muxed format only. No separate audio, remux or transcode. |
| Quality label | From `qualityLabel` or height. |
| Output | Browser blob download to the browser download folder. |
| Filename | Sanitized title plus `[videoId].mp4`, 110 character cap. |
| Progress | Bytes received divided by `content-length`; no speed or ETA. |
| Cancel | Aborts the client fetch. Server transfer may continue. |
| Job model | One active job in the page. No job ID, no persistence, no queue. |
| High quality path | Copies the watch link, then opens `ytmp3pc.com`. |
| SPA navigation | A new video ID closes the menu and aborts the active job. |
| Disable feature | Aborts the job, removes menu, progress and button, clears cache. |

## Adapter surface

| Capability | Userscript | Extension |
|---|---|---|
| Storage | `GM_getValue`/`GM_setValue`, localStorage fallback | `browser.storage.local` or `chrome.storage.local` |
| HTTP | `GM_xmlhttpRequest` with `@connect`, fetch fallback | `runtime.sendMessage` to background fetch |
| Allowed HTTP hosts | `returnyoutubedislikeapi.com`, `sponsor.ajay.app`, `raw.githubusercontent.com` | Same three hosts in `background.entry.js` |
| External tab | `GM_openInTab`, `window.open` fallback | `YT_SUPERTOOL_OPEN_URL` message |
| External tab allowlist | None | `https://github.com/CheemsGalaxy/YT-SuperTool/releases/` only |
| Main world | Runs directly under `unsafeWindow` | MV3 `world: "MAIN"`; MV2 injects `main-world.js` |
| Menu command | `GM_registerMenuCommand` | Not available |

## Background messages

| Message | Handler | Purpose |
|---|---|---|
| `YT_SUPERTOOL_FETCH` | `handleFetch` | HTTPS fetch for three allowlisted hosts, 8 second default timeout. |
| `YT_SUPERTOOL_OPEN_URL` | `handleOpenUrl` | Open a GitHub release page in a new tab. |
| `YT_SUPERTOOL_DNR` | `handleRuleset` | Enable or disable the MV3 ad ruleset. |

MV3 uses a service worker with no persistent state. MV2 uses a non-persistent
background page. The MV2 background additionally installs a `webRequest`
blocking listener for the ad matcher.

## Permissions and metadata

MV2 permissions: `storage`, `tabs`, `webRequest`, `webRequestBlocking`,
YouTube, dislike API, SponsorBlock, raw GitHub and ad network hosts.

MV3 permissions: `storage`, `tabs`, `scripting`,
`declarativeNetRequest`, with host permissions matching the MV2 host list.

Userscript grants: `GM_getValue`, `GM_setValue`, change listeners,
`GM_registerMenuCommand`, `GM_addStyle`, `GM_xmlhttpRequest`, `GM_openInTab`,
`unsafeWindow`. `@connect` lists the same three HTTP hosts.

No target currently asks for `http://127.0.0.1/*` or `http://localhost/*`.

## Build and verify baseline

Commands run from the repository root before any product change.

| Command | Exit | Result |
|---|---|---|
| `npm run build` | 0 | Userscript, MV2 and MV3 emitted, both zips written, `Build complete for v2.4.3` |
| `npm run verify` | 0 | `ALL BUILD TARGETS VERIFIED SUCCESSFULLY` |
| `npm run build:verify` | 0 | `ALL BUILD TARGETS VERIFIED SUCCESSFULLY` |

Bundle sizes after the baseline build:

| Artifact | Size |
|---|---|
| `dist/userscript/yt-supertool.user.js` | 198 KB |
| `dist/mv2/content.js` | 175 KB |
| `dist/mv2/main-world.js` | 29 KB |
| `dist/mv2/background.js` | 11 KB |
| `dist/mv3/content.js` | 175 KB |
| `dist/mv3/main-world.js` | 29 KB |
| `dist/mv3/background.js` | 5 KB |
| `dist/yt-supertool-mv2.zip` | 70 KB |
| `dist/yt-supertool-mv3.zip` | 69 KB |

`verify-build.mjs` checks file presence, version consistency, userscript
metadata, IIFE closure, target isolation, manifest shape, DNR rules, UI hooks
and zip headers. It does not test the downloader in a browser and has no unit
test runner.

## Findings

| Severity | Finding | Evidence |
|---|---|---|
| High | Extension high quality handoff is broken. The downloader opens `https://ytmp3pc.com/`, but the background `OPEN_URL` handler accepts only GitHub release URLs. The extension logs a warning and opens nothing. | `src/core/features/downloader.js:348`, `src/adapters/extension.adapter.js:176`, `src/entries/background.entry.js:100` |
| High | No local service exists. There is no companion, no pairing, no token storage and no localhost permission on any target. | Adapter and manifest audit |
| Medium | The current MP4 path depends on a spoofed YouTube player request. Client versions and response shape can change without notice. | `downloader.js:7`, `downloader.js:107` |
| Medium | Only muxed MP4 is available. Higher quality video and separate audio need merging, which the current flow cannot do. | `downloader.js:103` |
| Medium | Cancel stops the client fetch only. No server-side job exists, so no cancellation acknowledgement or cleanup. | `downloader.js:251`, `downloader.js:449` |
| Medium | The direct `googlevideo` fetch runs in page context. Format URLs expire and may be blocked by CORS or playback policy. There is no retry or alternate source. | `downloader.js:93` |
| Medium | No output directory, quality, container or FFmpeg settings. Downloads always use the browser download folder. | `settings-schema.js` |
| Medium | A long companion download cannot run inside the MV3 service worker. The worker can stop while a request is pending, so job control must live in the companion with polling from the page or an alarms-driven proxy. | MV3 manifest and background entry |
| Low | The menu text promises high quality MP4 and MP3, but that path is a third-party redirect and fails in extensions today. | `strings.js:39`, `strings.js:67` |
| Low | No structured error codes. Messages are free text from fetch or player failures. | `downloader.js:211` |
| Low | No automated tests for downloader, adapters or job lifecycle. | `package.json`, `scripts/verify-build.mjs` |

## Dependencies and licensing risks

| Component | Current state | Risk |
|---|---|---|
| yt-dlp | Not present | License and binary source must be verified before distribution. |
| FFmpeg | Not present | LGPL or GPL depending on build flags. A distributed build needs notices and, for LGPL, relinking terms. |
| Node.js | Build and dev only | A packaged companion must ship a runtime or use Node SEA. |
| Ghostery adblocker | Removed in 2.4.3 | No longer a bundle or license concern. |
| Vite, archiver, acorn, postcss | Dev dependencies | Not shipped to users. |

No binary is bundled today. The roadmap forbids claiming platform support
before a real build and a real test exist.

## Files likely to change

Existing files:

- `src/core/features/downloader.js`, `downloader.css`, `src/core/ui/strings.js`
- `src/core/settings-schema.js`, `src/core/index.js`
- `src/adapters/userscript.adapter.js`, `src/adapters/extension.adapter.js`
- `src/entries/background.entry.js`, `background.mv2.entry.js`, `background.mv3.entry.js`
- `src/manifests/mv2.manifest.json`, `mv2.manifest.json`, `mv3.manifest.json`
- `src/entries/userscript.entry.js`
- `scripts/build-all.mjs`, `scripts/verify-build.mjs`
- `README.md`, `ARCHITECTURE_AUDIT.md`

New files:

- `companion/` package, server, job manager, binary resolver, tests
- `docs/API_SPEC.md`, `docs/SECURITY.md`, `docs/BUILD_AND_DISTRIBUTION.md`
- `BASELINE_AUDIT.md` (this file), `ARCHITECTURE.md`

## Open decisions for Phase 1

1. Pairing code delivery: terminal output only, or terminal plus a local file.
2. Token storage: browser storage only, or browser storage plus OS keychain later.
3. Progress transport: polling `GET /api/download/:id` or server-sent events.
4. Packaging: portable zip with bundled Node runtime, Node SEA, or an installer
   that downloads a verified runtime.
5. Default output directory per OS and whether the user can change it.
6. Test matrix: which OS and browser combinations this machine can actually run.

## Phase 0 status

- Repository structure and entry points mapped.
- Downloader, adapters, background, manifests and build scripts read.
- Baseline build and verify pass with exit 0.
- Limitations and risks recorded.
- No product code changed.
- No commit made.
