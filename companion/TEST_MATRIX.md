# Companion test matrix

Last run: 2026-11-18 on Windows 10 IoT Enterprise LTSC 2021 (10.0.19044) x64.
Development runtime: Node.js v26.13.0. Packaged runtime: Node.js v26.13.1.
Media tools: yt-dlp 2026.10.26, FFmpeg `N-129000-g64f6bcffaf-20261117` from
the BtbN LGPL shared build.

Every row below ran on this machine. Rows under "Not run" did not run and are
not claimed as supported.

## Automated suites

| Suite | Command | Result |
|---|---|---|
| Companion unit and HTTP tests | `cd companion && npm test` | 103 pass, 0 fail |
| Extension tests | `npm test` | 23 pass, 0 fail |
| Self-test | `node src/index.js --self-test` | 7 checks pass |
| Build and manifest verification | `npm run build:verify` | All targets and zips verified |
| Package build | `npm run package:companion` | `SELF-TEST OK`, both bundled binaries available |
| Packaged smoke test | `npm run smoke:companion` | `PACKAGE SMOKE OK` |
| Installer smoke test | `npm run smoke:install` | `INSTALL SMOKE OK` |

The companion suite includes the HTTP routes, pairing, URL policy, settings,
job queue, progress parser, error classification and the job manager. The
planner suite covers chunk layout, worker claims and resume validation. The
engine suite covers range downloads over a local HTTP fixture, servers that
ignore ranges, progress reporting, abort and resume from a state file. The
extension suite covers the companion client, the message adapter and the
download UI helpers.

## Source segmented downloads

Source companion, installed yt-dlp 2026.10.26 and FFmpeg
`N-128909-g604ef3784d-20261114`, video `jNQXAC9IVRw` ("Me at the zoo", 19 s).

| Case | Command result | File check |
|---|---|---|
| 360p MP4 | Pair, analyze, job `completed`, 533,932 bytes | `ffprobe`: AV1 video plus AAC audio, 19.06 s |
| M4A 192k audio | Pair, analyze, job `completed`, 459,861 bytes | `ffprobe`: AAC, 48 kHz, stereo, 19.01 s |
| MP3 192k audio | Pair, analyze, job `completed`, 457,389 bytes | `ffprobe`: MP3, 48 kHz, stereo, 192,528 bps, 19.01 s |

Both runs used the segmented engine with the default eight connections. Each
job wrote to `out/.ytst-tmp/<jobId>/`, merged with FFmpeg and moved the final
file to the output folder. The temporary folder was empty afterwards.

## Failure modes and regressions

| Case | How it ran | Result |
|---|---|---|
| Temporary folder cannot be created | Fake filesystem returns `EACCES` from `mkdir` | `OUTPUT_DIR_INVALID`, HTTP 503, message "The output folder is not writable." |
| Disk full during download | Fake yt-dlp writes `[Errno 28] No space left on device` and exits 1 | `OUTPUT_DIR_INVALID`, "The output folder is out of free space." No path in the message. |
| Network failure | Fake yt-dlp writes an `urlopen` error with a signed `googlevideo.com` URL | `DOWNLOAD_FAILED`, network message only; the signed URL is absent |
| Segmented engine, parallel ranges | Local HTTP fixture, 8 MiB body, 4 connections, 512 KiB chunks | File byte-identical, at least 5 `206` range responses |
| Segmented engine, server ignores ranges | Local HTTP fixture that answers `200` to every request | Single stream used, 0 range requests, file byte-identical |
| Segmented engine, progress | Local HTTP fixture, 2 MiB body, 2 connections | Monotonic progress, final `received` equals `total` and body length |
| Segmented engine, abort | 4 MiB body, delayed chunks, abort after 128 KiB | `AbortError`, no truncated file left as a finished result |
| Segmented engine, resume | Half file plus a saved state file, 1 MiB body | `resumed: true`, no range request starts before the saved cursor, state file removed |
| Segmented engine, state cleanup | Completed download with a state path | State file absent after success |
| Segmented engine, redirect protocol | Local fixture redirects to `file:///etc/passwd` | `DOWNLOAD_FAILED`, message names the unsupported protocol |
| Segmented engine, media headers | Plan unit test with `User-Agent`, `Accept`, `Cookie`, `Range` and a custom header | Only allowlisted headers kept; `Cookie`, `Range` and the custom header dropped |
| Segmented engine, refused stream | Fake engine throws `DOWNLOAD_FAILED` | Job retried through yt-dlp and completed |
| Settings reach the engine | Unit test with `connections: 16`, `speedLimitKbps: 512` | Both values passed to the engine call |
| Analyze failure | Fake yt-dlp exits 1 with HTTP 403 and a signed URL | `ANALYZE_FAILED`, "YouTube refused this download (HTTP 403)." No URL echoed |
| Cookie store unreadable | Fake stderr contains `Could not copy Chrome cookie database` | Message asks the user to close the browser or choose another one; no path echoed |
| Version handshake | `GET /api/version` | `minimumClientVersion` is `2.4.3`, the current extension version |
| Wrong pairing code | Packaged companion, `POST /api/pair` with `ZZZZ-ZZZZ` | HTTP 401 `PAIRING_CODE_INVALID` |
| Pairing code expiry and reuse | Pairing unit tests | Expired code returns `PAIRING_CODE_EXPIRED`; a second use fails |
| Pairing rate limit | Pairing unit tests | Sixth attempt in a minute returns `RATE_LIMITED` |
| Read-only output folder | Packaged companion with an ACL that grants read and execute only | HTTP 503 `OUTPUT_DIR_INVALID`, "The output folder is not writable." |
| Cancel a packaged download | Packaged companion, 1440p job cancelled after it started | State `cancelled`, `.ytst-tmp` empty afterwards |
| Full packaged download | Packaged companion, 360p MP4 | Saved 46,283,922 bytes, no temp files left |
| Companion not running | Edge 157 MV3, no companion process, Download menu | Menu shows "Companion not running"; no companion items appear |
| Direct MP4 without companion | Same Edge session, click the direct item | Progress reached `Saved · ... [aqz-KE-bpKQ].mp4` |
| SPA navigation | Edge 157 MV3, `history.pushState` plus `yt-navigate-finish` | One Download button before and after; `data-video-id` updated both ways |
| Two tabs, same video | Edge 157 MV3, second tab starts the same video | "This video is already downloading in the companion." |
| Cancel through the extension | Edge 157 MV3, 360p job, Cancel button | `Download cancelled`, menu reopened with the direct item intact |
| Packaged pairing and token | `npm run smoke:companion` | Pair, analyze, download, unpair, revoked token returns 401 |
| Foreign Origin and missing token | `npm run smoke:companion` | HTTP 403 and HTTP 401 |
| No leftover temp files | Every packaged and browser run | `.ytst-tmp` empty after completion and cancel |

## Cookie checks

| Case | How it ran | Result |
|---|---|---|
| Firefox cookie source | Packaged yt-dlp 2026.10.26 with `--js-runtimes node:<packaged>` and `--cookies-from-browser firefox` | Analyze passed; 360p MP4 saved 46,283,922 bytes |
| Companion with Firefox cookies | Source companion, temporary data folder, `PUT /api/settings` then analyze and 360p download | Pair, setting, analyze and job completed; 46,283,922 bytes saved, `.ytst-tmp` empty |
| Edge cookie source | Same command with `--cookies-from-browser edge` while Edge runs | yt-dlp printed `Could not copy Chrome cookie database`; the companion now names Microsoft Edge, asks to quit it and offers Firefox or a cookies.txt file |
| Edge closed | All 15 Edge processes closed, then the same command | `Failed to decrypt with DPAPI`; app-bound encryption blocks the cookie key, so closing Edge is not enough |
| Edge cookie copy workaround | Node `node:sqlite` `VACUUM INTO` against the open Edge `Cookies` database | `unable to open database file`; no temp-copy retry was added because Edge keeps the database locked |
| Cookie file argument | Packaged yt-dlp 2026.10.26 with `--cookies` and a Netscape header file in the user home | Analyze passed, title read, no cookie value printed |
| Cookie file setting | Source companion CLI `--set-cookies-file`, then `--set-cookies firefox`, then `--set-cookies off` | Path saved, browser set cleared the path, off cleared both |
| Cookie file validation | Unit tests with a missing file, bad header, empty file, relative path, outside-home path and both sources | Every case returned `BAD_REQUEST` with its own message |
| Cookie error text | Unit tests in `companion/test/ytdlp.test.js`, `companion/test/jobs.test.js` and `companion/test/server.test.js` | Lock, decrypt, read and malformed-file failures map to safe messages; analyze and job errors include the browser name |
| Unknown cookie source | Unit test with `cookiesFromBrowser: netscape` | `BAD_REQUEST`, "Unknown cookie source." |

## Installer and autostart

All rows used the package zip built on 2026-11-18. Download rows that saved
25,786,983 or 46,283,922 bytes ran on builds before the segmented engine. The
rebuilt zip ships the engine, and the package smoke test downloaded 46,283,922
bytes through it.

| Case | How it ran | Result |
|---|---|---|
| Install to default folders | Extracted package, `install.ps1` with default `%LOCALAPPDATA%` path | Program folder, `paths.json`, startup `.lnk` and five desktop shortcuts created |
| Pair from installed script | `install\pair.ps1` on a fresh data folder | Hidden start, code printed, HTTP pair succeeds, code file removed |
| Token survives restart | Stop the process, start from the startup shortcut | Health reports `paired: true`, one process |
| Duplicate hidden launch | Second `launch-hidden.vbs start` | No second process, same port |
| Browser cookie setting | `install\cookies.ps1 -Source edge`, then `-Source off` | Setting saved as `edge`, then `null`; pairing token survived both restarts |
| Cookie file setting | `install\cookies.ps1 -Source file -CookieFile <path>`, then `-Source off` | File path saved, browser source cleared, off cleared both |
| 360p download from installed copy | Installed companion before the `--js-runtimes` change, 360p MP4 | Saved 25,786,983 bytes; package smoke on the final zip saved 46,283,922 bytes |
| Update over existing install | Final package installed over a running paired install | Old process replaced, pairing and settings unchanged, shortcuts recreated |
| Update with Explorer window open | Explorer window open in the install folder, then `install.ps1` | Installer closed that window, replaced the folder, kept the pairing and left no `.old-*` or `.new-*` folder |
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
| Multi-hour downloads | Test video finishes in under a minute |
| Resume across a companion restart | The engine can resume from a state file, but the job manager does not keep one across restarts |
| Real logoff and logon | The startup shortcut was started manually; the sign-in path itself was not observed |
| A live YouTube bot check | The check is tied to IP and session and did not appear on demand; the cookie path itself was tested with a real Firefox store |
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
