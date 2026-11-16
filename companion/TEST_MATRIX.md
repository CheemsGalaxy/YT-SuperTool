# Companion test matrix

Last run: 2026-11-16 on Windows 10 IoT Enterprise LTSC 2021 (10.0.19044) x64.
Development runtime: Node.js v26.13.0. Packaged runtime: Node.js v26.13.1.
Media tools: yt-dlp 2026.10.26, FFmpeg `N-128909-g604ef3784d-20261114` from
the BtbN LGPL shared build.

Every row below ran on this machine. Rows under "Not run" did not run and are
not claimed as supported.

## Automated suites

| Suite | Command | Result |
|---|---|---|
| Companion unit and HTTP tests | `cd companion && npm test` | 62 pass, 0 fail |
| Extension tests | `npm test` | 23 pass, 0 fail |
| Self-test | `node src/index.js --self-test` | 7 checks pass |
| Build and manifest verification | `npm run build:verify` | All targets and zips verified |
| Package build | `npm run package:companion` | `SELF-TEST OK`, both bundled binaries available |
| Packaged smoke test | `npm run smoke:companion` | `PACKAGE SMOKE OK` |
| Installer smoke test | `npm run smoke:install` | `INSTALL SMOKE OK` |

The companion suite includes the HTTP routes, pairing, URL policy, settings,
job queue, progress parser, error classification and the job manager. The
extension suite covers the companion client, the message adapter and the
download UI helpers.

## Failure modes and regressions

| Case | How it ran | Result |
|---|---|---|
| Temporary folder cannot be created | Fake filesystem returns `EACCES` from `mkdir` | `OUTPUT_DIR_INVALID`, HTTP 503, message "The output folder is not writable." |
| Disk full during download | Fake yt-dlp writes `[Errno 28] No space left on device` and exits 1 | `OUTPUT_DIR_INVALID`, "The output folder is out of free space." No path in the message. |
| Network failure | Fake yt-dlp writes an `urlopen` error with a signed `googlevideo.com` URL | `DOWNLOAD_FAILED`, network message only; the signed URL is absent |
| Analyze failure | Fake yt-dlp exits 1 with HTTP 403 and a signed URL | `ANALYZE_FAILED`, "YouTube refused this download (HTTP 403)." No URL echoed |
| Version handshake | `GET /api/version` | `minimumClientVersion` is `2.4.3`, the current extension version |
| Wrong pairing code | Packaged companion, `POST /api/pair` with `ZZZZ-ZZZZ` | HTTP 401 `PAIRING_CODE_INVALID` |
| Pairing code expiry and reuse | Pairing unit tests | Expired code returns `PAIRING_CODE_EXPIRED`; a second use fails |
| Pairing rate limit | Pairing unit tests | Sixth attempt in a minute returns `RATE_LIMITED` |
| Read-only output folder | Packaged companion with an ACL that grants read and execute only | HTTP 503 `OUTPUT_DIR_INVALID`, "The output folder is not writable." |
| Cancel a packaged download | Packaged companion, 1440p job cancelled after it started | State `cancelled`, `.ytst-tmp` empty afterwards |
| Full packaged download | Packaged companion, 360p MP4 | Saved 25,786,983 bytes, no temp files left |
| Companion not running | Edge 157 MV3, no companion process, Download menu | Menu shows "Companion not running"; no companion items appear |
| Direct MP4 without companion | Same Edge session, click the direct item | Progress reached `Saved · ... [aqz-KE-bpKQ].mp4` |
| SPA navigation | Edge 157 MV3, `history.pushState` plus `yt-navigate-finish` | One Download button before and after; `data-video-id` updated both ways |
| Two tabs, same video | Edge 157 MV3, second tab starts the same video | "This video is already downloading in the companion." |
| Cancel through the extension | Edge 157 MV3, 360p job, Cancel button | `Download cancelled`, menu reopened with the direct item intact |
| Packaged pairing and token | `npm run smoke:companion` | Pair, analyze, download, unpair, revoked token returns 401 |
| Foreign Origin and missing token | `npm run smoke:companion` | HTTP 403 and HTTP 401 |
| No leftover temp files | Every packaged and browser run | `.ytst-tmp` empty after completion and cancel |

## Installer and autostart

All rows used the final package zip from 2026-11-16.

| Case | How it ran | Result |
|---|---|---|
| Install to default folders | Extracted package, `install.ps1` with default `%LOCALAPPDATA%` path | Program folder, `paths.json`, startup `.lnk` and four desktop shortcuts created |
| Pair from installed script | `install\pair.ps1` on a fresh data folder | Hidden start, code printed, HTTP pair succeeds, code file removed |
| Token survives restart | Stop the process, start from the startup shortcut | Health reports `paired: true`, one process |
| Duplicate hidden launch | Second `launch-hidden.vbs start` | No second process, same port |
| 360p download from installed copy | Default install, paired, 360p MP4 | Saved 25,786,983 bytes |
| Update over existing install | Final package installed over a running paired install | Old process replaced, pairing and settings unchanged, shortcuts recreated |
| Uninstall | `install\uninstall.ps1 -Force` | Process stopped; program folder, data folder, startup and desktop shortcuts removed |
| Sign-in autostart | Startup shortcut started manually | Companion started hidden and stayed paired; a real logoff and logon was not run |

## Browser and target coverage

| Target | Browser | Result |
|---|---|---|
| MV3 | Edge 157.0.4341.46, headless | Pair, analyze, 360p download, progress, cancel, reopen, SPA and two-tab checks |
| MV3 without companion | Edge 157.0.4341.46, headless | Missing-companion message, direct MP4 saved |
| MV2 | Firefox 160, temporary add-on through BiDi | Pair, analyze, 360p download, direct MP4 fallback |
| Userscript | Edge 157 with injected `GM_*` shims | Pair, analyze, 360p download, no page errors |

## Not run

| Case | Reason |
|---|---|
| Linux and macOS package | No machine or runner for those platforms |
| Tampermonkey and Violentmonkey | No real manager installed; the userscript ran with shims |
| Disk-full on a real volume | No small volume available; the case used fake yt-dlp stderr |
| Antivirus or SmartScreen quarantine behavior | Needs a clean Windows image |
| Proxy support | The companion does not implement a proxy setting |
| Chrome stable | Edge uses the same Chromium engine, but Chrome itself was not launched |
| Multi-hour downloads and resume | Test video finishes in under a minute |
| Real logoff and logon | The startup shortcut was started manually; the sign-in path itself was not observed |
| Windows 11 | Only Windows 10 build 10.0.19044 was available |

## Reproduction

```powershell
cd companion
npm test
node src/index.js --self-test

cd ..
npm test
npm run build:verify
npm run package:companion
npm run smoke:companion
npm run smoke:install
```

The package scripts write `companion/dist/yt-supertool-companion-1.0.0-win32-x64.zip`
and its `.sha256` file. The zip is a release artifact and is not committed.

The SPA and two-tab checks used a temporary CDP script against the unpacked
MV3 build. That script is not part of the repository. The shipped code was not
changed to make the test pass.
