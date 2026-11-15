# YT SuperTool Companion

Local service that downloads video and audio for YT SuperTool. It runs on the
user's machine, binds to loopback and exposes HTTP API version 1 on
`http://127.0.0.1:47831`.

Status: Phase 4 and the Windows x64 package are done. The API, pairing, job
manager, browser adapters, the Download menu integration and the portable zip
work on this machine. Linux, macOS, a real userscript manager and the Phase 6
failure matrix are still open.

## Capabilities

- Health and version endpoints for discovery.
- One-time pairing code, SHA-256 token hashes and per-client revocation.
- YouTube URL policy for watch, Shorts, live, embed and youtu.be links.
- Job queue with preset quality, progress polling and cancel.
- yt-dlp for metadata and download, FFmpeg for merge and MP3 extraction.
- Per-job temporary folder, final move into the output folder, no overwrite.
- Bounded logs with token, pairing code and query string redaction.

## Requirements

Development needs Node.js 20 or newer. Media work needs yt-dlp and FFmpeg.
The companion looks for them in this order:

1. `YTST_YTDLP_PATH` and `YTST_FFMPEG_PATH`.
2. `companion/bin/<platform>-<arch>/`.
3. `PATH`.

Packaged releases bundle Node.js, yt-dlp and FFmpeg, so the user installs
nothing. The Windows x64 zip lives in `companion/dist/` after a package build.
For a source checkout, install the two media binaries yourself or point the
environment variables at local copies.

## Commands

```
cd companion
npm test
npm run self-test
node src/index.js
```

Package build from the repository root:

```
npm run package:companion
npm run smoke:companion
```

`package:companion` downloads and verifies the pinned Node.js runtime, yt-dlp
and the BtbN LGPL FFmpeg build, stages `YT SuperTool Companion/`, runs
`--self-test`, probes the bundled binaries against the SHA-256 manifest and
writes `companion/dist/yt-supertool-companion-1.0.0-win32-x64.zip` plus its
`.sha256` file. `smoke:companion` unpacks that zip and runs a real 360p
download through the packaged runtime. Both scripts support `win32-x64` only.

Useful flags:

```
--port <number>       Loopback port, default 47831
--data-dir <path>     Settings and token storage, default ~/.yt-super-tool
--output-dir <path>   Download folder inside the user home
--pair                Print a new pairing code when already paired
--self-test           Local checks without downloading media
--debug               Include stack traces in local logs
--help                Show usage
```

The first start prints a pairing code in the terminal. Enter it in the YT
SuperTool Download menu. Data lives in
`%USERPROFILE%\.yt-super-tool` on Windows and `$HOME/.yt-super-tool` elsewhere.
The companion stores `settings.json` and `pairing.json` there.

The client must send `X-YTST-Token`. Requests from other websites are rejected
by the `Origin` allowlist and the `Host` check, not by CORS alone.

## Test status

Recorded on 2026-11-15, Windows 10 IoT Enterprise LTSC 2021 (10.0.19044) x64,
Node v26.13.0 for development and v26.13.1 in the package.

| Check | Result |
|---|---|
| `npm test` in `companion/` | 55 tests pass, 0 fail |
| `npm test` in the repository root | 23 tests pass, 0 fail |
| `npm run self-test` | 7 checks pass |
| Entry smoke test | Health, pairing code, token issue, settings read, code reuse 410, foreign Origin 403 |
| yt-dlp 2026.10.26 analyze | Big Buck Bunny metadata and seven video presets |
| Source video download, 360p MP4 | 24.59 MiB |
| Source audio download, MP3 192k | 14.53 MB |
| Source cancel a running job | State changed to cancelled, no temp files left |
| Edge 157 MV3 pair, analyze, 360p | Saved 25,786,983 bytes, cancel and reopen checked |
| Firefox 160 MV2 pair, analyze, 360p | Saved 25,786,983 bytes |
| Edge 157 userscript build with GM shims | Saved 25,786,983 bytes |
| `npm run build:verify` in the repository root | All targets and zips verified |
| `npm run package:companion` | `SELF-TEST OK`, both bundled binaries available |
| `npm run smoke:companion` | `PACKAGE SMOKE OK`, 25,786,983 byte file, no temp leftovers |

Not tested yet: Linux, macOS, a real userscript manager, cancel through the
packaged build, and the Phase 6 failure matrix. No platform outside Windows x64
is advertised as supported.

The browser runs used a Creative Commons Blender Foundation film. The
userscript run used injected shims for the `GM_*` calls, not Tampermonkey or
Violentmonkey. yt-dlp and FFmpeg are not committed to the repository; the
package script downloads them and checks the upstream checksums.

## Safety rules

- Bind only `127.0.0.1`. No LAN or wildcard address.
- Spawn binaries with an argument array and `shell: false`.
- Launch yt-dlp with `--ignore-config`, `--no-exec`, `--no-playlist` and a
  normalized URL. The client sends enum presets, never raw arguments.
- Accept only YouTube video URLs. Playlists, channels, search pages and other
  hosts are rejected before any process starts.
- Keep the output directory inside the user home, write each job to
  `<output>/.ytst-tmp/<jobId>/`, then resolve and move the final file. Never
  overwrite an existing file.
- Do not touch DRM, paywalls, authentication or region locks.

The threat model and the full control list are in `../SECURITY.md`.

## Source layout

| Path | Role |
|---|---|
| `src/index.js` | Flags, startup, pairing output, self-test, shutdown |
| `src/server.js` | HTTP routing, Origin and Host checks, body limit, auth |
| `src/pairing.js` | Code generation, rate limit, token hashing and revocation |
| `src/url-policy.js` | YouTube URL parser and normalization |
| `src/settings.js` | Defaults, enums, output directory validation |
| `src/jobs.js` | Queue, progress, cancel, final move, cleanup |
| `src/ytdlp.js` | Analyze and download argument maps, progress parser |
| `src/binaries.js` | Path resolution, version probe, checksum manifest |
| `src/store.js` | Atomic JSON read and write |
| `src/log.js` | Bounded memory log and redaction |
| `test/` | Unit and HTTP integration tests |

## Open work

Phase 5 remains open for Linux and macOS, which need their own runtime and
binary sources plus a native runner. Phase 6 records the failure matrix, a real
Tampermonkey and Violentmonkey run, and the Linux and macOS rows.
