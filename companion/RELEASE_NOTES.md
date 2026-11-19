# Release notes

## Unreleased

The companion downloads with its own segmented HTTP engine now. yt-dlp resolves
the format and returns the direct media URLs; the companion splits each stream
into byte ranges, downloads them over parallel connections and writes each
chunk at its file offset. FFmpeg still merges video and audio and converts
audio. The HTTP API keeps version 1 and the same endpoints, so the extension
needs no change.

### Changes

- Range probe with `Range: bytes=0-0`, then chunk planning and a worker pool.
  Servers that answer `200` instead of `206` fall back to one stream.
- Each stream uses the `User-Agent` and `Accept` headers from yt-dlp. Cookies
  and other headers from that JSON are dropped.
- If the engine still gets `DOWNLOAD_FAILED` for a stream, the job retries the
  whole download through yt-dlp. A refused media URL (HTTP 403) therefore no
  longer fails the job when the yt-dlp path works.
- Retries for failed chunks and an optional resume state file. The job manager
  does not write that file yet, so cancel still discards partial data.
- New settings: `connections` (integer 1 to 32, default 8) and
  `speedLimitKbps` (integer 0 to 1048576, default 0, unlimited). Both are
  returned by `GET /api/settings` and accepted by `PUT /api/settings`.
- Audio jobs save with the requested format in the file name, so an M4A job no
  longer produces a `.mp3` name.
- The engine follows the media URL from the current yt-dlp result only. Other
  protocols are rejected and writes stay inside the job temporary folder.

### Verification

- `npm test` in `companion/`: 103 pass, 0 fail.
- `npm run self-test`: 7 checks pass.
- Source 360p MP4 download of `jNQXAC9IVRw`: 533,932 bytes, AV1 video and AAC
  audio, 19.06 s by `ffprobe`.
- Source M4A 192k download of the same video: 459,861 bytes, AAC 48 kHz stereo,
  19.01 s by `ffprobe`.
- Source MP3 192k download of the same video: 457,389 bytes, MP3 48 kHz stereo,
  192,528 bps and 19.01 s by `ffprobe`.
- Source "best" preset download of the same video after the header and fallback
  change: completed, 533,932 bytes.
- `npm run package:companion`: `SELF-TEST OK`, manifest with 48 files.
- `npm run smoke:companion`: `PACKAGE SMOKE OK`. The packaged runtime downloaded
  Big Buck Bunny at 360p through the segmented engine, merged 46,283,922 bytes,
  cancelled a 1440p job, cleaned the temporary folder and rejected a read-only
  output folder.
- `npm run smoke:install`: `INSTALL SMOKE OK` on the same zip. Install, pair,
  status, stop, relaunch, duplicate launch guard, cookie settings and uninstall
  all passed.

### Artifact

```
companion/dist/yt-supertool-companion-1.0.0-win32-x64.zip
size    132,221,123 bytes
sha256  4b2c5432f22c082b97a2c320d636b076d8f9002d9402321844ca18998fa326e4
```

The zip contains Node.js v26.13.1, yt-dlp 2026.10.26 and BtbN LGPL FFmpeg
`N-129000-g64f6bcffaf-20261117`. The version string stays 1.0.0 because the API
version and the extension contract did not change. The zip is a build artifact
and is not committed.

## 1.0.0, Windows x64 portable (historical)

This build predates the segmented engine. The zip below still uses the yt-dlp
download path and is kept for reference only.

Build date: 2026-11-18.

This is the first packaged build of the YT SuperTool Companion. It is a
portable zip for Windows 10 and Windows 11 on x64. Node.js, yt-dlp and FFmpeg
are inside the package, so nothing else needs to be installed.

### Artifact

```
companion/dist/yt-supertool-companion-1.0.0-win32-x64.zip
size    132,227,392 bytes
sha256  d8936d325c1595d58c0b7a3351837d92260d8c03d298ad82ea6578b7827abe43
```

The zip is a build artifact and is not committed. `npm run package:companion`
recreates it, and `npm run smoke:companion` checks the unpacked copy.

### Included

- Local HTTP API version 1 on `http://127.0.0.1:47831`.
- One-time pairing code, SHA-256 token storage and unpair.
- YouTube URL policy for watch, Shorts, live, embed and youtu.be links.
- Video presets from 360p to 2160p and "best available", MP4 output.
- MP3 at 192 kbps and M4A at best quality.
- Two concurrent jobs, progress, speed, ETA, cancel, no overwrite.
- Optional browser cookie source or Netscape cookies.txt file for YouTube bot
  checks and age checks, off by default. Only the allowlisted browser name or
  the file path is stored.
- Per-job temporary folder and cleanup after completion, failure or cancel.
- Bounded logs with token, pairing code and query string redaction.
- Packaged Node.js v26.13.1, yt-dlp 2026.10.26 and BtbN LGPL FFmpeg
  `N-128909-g604ef3784d-20261114`.
- Third-party licenses and an SHA-256 manifest for every bundled binary.
- PowerShell installer with a startup shortcut, hidden launch at sign-in, five
  desktop shortcuts and an uninstaller. No administrator rights, no service,
  no registry value.
- Package manifest with the SHA-256 of all 45 files, checked before install.

### Install

See `INSTALL_WINDOWS.md`. Extract the zip, run
`Install YT SuperTool Companion.cmd`, then enter the printed code in the
Download menu. The installer prints the code once and starts the companion in
the background. Later sign-ins start it from the Startup shortcut. If YouTube
asks for a bot check, run the Browser cookies shortcut and choose a browser
where you are signed in.

### Verified targets

| Target | Result |
|---|---|
| Edge 157 MV3 | Pair, analyze, 360p download, progress, cancel, SPA navigation, two tabs |
| Edge 157 MV3 without companion | Missing-companion message, direct MP4 saved |
| Firefox 160 MV2 | Pair, analyze, 360p download, direct MP4 fallback |
| Edge 157 userscript build with GM shims | Pair, analyze, 360p download |
| Source companion with Firefox cookies | Pair, settings update, analyze, 360p download, 46,283,922 bytes |
| Packaged yt-dlp with a cookies.txt file | Analyze passed with a Netscape header file and `--cookies` |
| Windows x64 installer | Install, pair, 360p download, stop, startup relaunch, duplicate launch guard, browser and cookie file settings, update over an existing install, uninstall |

The packaged smoke test also covers a real 360p download of 46,283,922 bytes,
a cancelled job, a read-only output folder, a wrong pairing code, token
revocation and the empty temporary folder check. Details and exact counts are
in `TEST_MATRIX.md`.

### Known limitations

- Windows x64 only. Linux and macOS packages do not exist yet.
- The launcher and the installer are not code signed.
- The startup shortcut was tested by starting it manually. A real logoff and
  logon on a fresh session was not recorded.
- Browser cookies are off by default. Edge, Chrome and Brave can lock the
  cookie database or protect it with app-bound encryption, so yt-dlp may fail
  to read it even after the browser closes. Firefox is one fallback; a Netscape
  cookies.txt file is the other. The bot-check path was not reproduced on
  demand; the browser and file argument paths were tested.
- No proxy setting.
- The extension always connects to port 47831. The `--port` flag changes the
  server port for manual use, but the Download menu cannot follow it.
- A real Tampermonkey and Violentmonkey run has not been recorded. The
  userscript target was tested with injected `GM_*` shims.
- Chrome stable was not launched. Edge 157 uses the same Chromium engine.
- Only one test video was used for the recorded downloads. Very long videos,
  live streams and resume-after-restart were not tested.

### Upgrade notes

Version 1.0.0 is the first release, so there is no migration. Future releases
that change the API version will say so here. Keep
`%USERPROFILE%\.yt-super-tool` when replacing the program folder to keep the
pairing token and settings.
