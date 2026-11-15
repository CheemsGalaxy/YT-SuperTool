# YT SuperTool Companion

Local service that downloads video and audio for YT SuperTool. It runs on the
user's machine, binds to loopback and exposes HTTP API version 1 on
`http://127.0.0.1:47831`.

Status: Phase 3. The API, pairing, job manager and yt-dlp/FFmpeg path work on
this Windows machine. The shared client and the three browser adapters are
wired. Downloader UI integration and packaged builds are still open.

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

Packaged releases will bundle both binaries. Until a package exists, install
them yourself or point the environment variables at local copies.

## Commands

```
cd companion
npm test
npm run self-test
node src/index.js
```

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
SuperTool Download menu after Phase 4 lands. Data lives in
`%USERPROFILE%\.yt-super-tool` on Windows and `$HOME/.yt-super-tool` elsewhere.
The companion stores `settings.json` and `pairing.json` there.

The client must send `X-YTST-Token`. Requests from other websites are rejected
by the `Origin` allowlist and the `Host` check, not by CORS alone.

## Test status

Recorded on 2026-11-15, Windows 10.0.19044 x64, Node v26.13.0.

| Check | Result |
|---|---|
| `npm test` in `companion/` | 55 tests pass, 0 fail |
| `npm test` in the repository root | 21 client tests pass, 0 fail |
| `npm run self-test` | 7 checks pass |
| Entry smoke test | Health, pairing code, token issue, settings read, code reuse 410, foreign Origin 403 |
| yt-dlp 2026.10.26 analyze | Big Buck Bunny metadata and seven video presets |
| Video download, 360p MP4 | 24.59 MB, 634 s, AV1 video and AAC audio |
| Audio download, MP3 192k | 14.53 MB, 634 s, MP3 audio |
| Cancel a running job | State changed to cancelled, no temp files left |
| `npm run build:verify` in the repository root | All targets and zips verified |

Not tested yet: Linux, macOS, real browser adapters, packaged artifacts and a
second browser profile. No platform is advertised as supported.

The real media test used a Creative Commons Blender Foundation film and deleted
the downloaded files afterwards. yt-dlp and FFmpeg came from their official
release pages and were not added to the repository.

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

Phase 4 replaces the third-party download handoff in the UI and adds pairing
controls. Phase 5 builds the per-platform packages. Phase 6 records the full
browser and OS test matrix.
