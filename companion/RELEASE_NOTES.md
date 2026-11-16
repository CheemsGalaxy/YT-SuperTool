# Release notes

## 1.0.0, Windows x64 portable

Build date: 2026-11-16.

This is the first packaged build of the YT SuperTool Companion. It is a
portable zip for Windows 10 and Windows 11 on x64. Node.js, yt-dlp and FFmpeg
are inside the package, so nothing else needs to be installed.

### Artifact

```
companion/dist/yt-supertool-companion-1.0.0-win32-x64.zip
size    132,225,619 bytes
sha256  423daa51709aef59cb91c662814f6b956553a83e459ebcb62bd34cb5a8d8a816
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
- Optional browser cookie source for YouTube bot checks and age checks, off by
  default. Only the allowlisted browser name is stored.
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
| Windows x64 installer | Install, pair, 360p download, stop, startup relaunch, duplicate launch guard, browser cookie setting, update over an existing install, uninstall |

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
  to read it. Firefox is the fallback. The bot-check path was not reproduced on
  demand; the cookie argument path was tested with a real Firefox store.
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
