# Build and distribution

The Windows x64 portable zip is built and smoke tested. Linux and macOS are
still a plan. This document records the decisions, the build steps and the
checks required before a platform is advertised.

## Packaging options

| Option | What ships | Strength | Cost and risk |
|---|---|---|---|
| Portable zip with bundled Node runtime | `node` runtime, `app.js`, `bin/`, launcher scripts | Predictable, easy to inspect, works offline after download | Large archive, macOS Gatekeeper, per-platform launcher |
| Node SEA | One executable per platform with embedded JS | No separate runtime visible, smaller than a full Node install | Assets still need extraction, ESM limits, code signing, SEA is experimental |
| Installer | MSI, NSIS, pkg or Squirrel | Start menu entry, uninstaller, optional startup | More build infrastructure and signing work |
| Download runtime on first run | Small archive, runtime fetched later | Small initial download | Violates the "one package" goal and adds an integrity risk |

### Decision

Phase 5 starts with a portable zip that contains the Node runtime, the
companion source bundle, launcher scripts and platform binaries. It is the
smallest option that can be built and tested on this machine without assuming
an untested packager works.

Node SEA is evaluated after the portable build passes tests. It is adopted only
if a real Windows, Linux and macOS artifact can be produced and the embedded
binary extraction path passes the same tests. Until then, release notes do not
mention SEA support.

An installer is optional. A portable package with a clear uninstall section
satisfies the roadmap. Startup automation is opt-in and shown to the user.

## Target matrix

| Platform | Architecture | Build | Tested |
|---|---|---|---|
| Windows 10/11 | x64 | `yt-supertool-companion-1.0.0-win32-x64.zip` | Yes, 2026-11-15 |
| Linux | x64 | Not yet | No |
| Linux | arm64 | Not yet | No |
| macOS Intel | x64 | Not yet | No |
| macOS Apple Silicon | arm64 | Not yet | No |

The Windows row passed the packaged smoke test listed below. A Linux or macOS
row stays "No" until a package exists and the same smoke test runs on that
platform.

## Repository layout

```
companion/
  package.json
  README.md
  src/
    index.js
    server.js
    pairing.js
    jobs.js
    ytdlp.js
    binaries.js
    settings.js
    store.js
    log.js
    url-policy.js
  test/
  bin/
    <platform>-<arch>/
      yt-dlp[.exe]
      ffmpeg[.exe]
      manifest.json
    .cache/
  dist/
scripts/
  package-companion.mjs
  package-smoke.mjs
```

`bin/`, `bin/.cache/` and `dist/` are not committed. The package script
downloads the pinned releases into the cache, checks the published checksums,
and writes `manifest.json` with the SHA-256 of every bundled binary. License
texts and source URLs are recorded in `THIRD_PARTY_NOTICES.md`.

## Binary sources

| Binary | Source | License to verify | Notes |
|---|---|---|---|
| yt-dlp | Official GitHub releases | Unlicense for yt-dlp; the PyInstaller exe also contains Python and other components | Standalone executable, version 2026.10.26 at packaging time |
| FFmpeg | BtbN `master-latest` `win64-lgpl-shared` build | LGPL-3.0-or-later | Shared DLL build, not the GPL build. License text ships in the zip |
| Node.js | Official Node distribution | MIT | v26.13.1 `win-x64` zip for the Windows package |

Verification steps for every binary:

1. Download over HTTPS from the documented release URL.
2. Compare the SHA-256 with the published checksum.
3. Run `--version` and record the output.
4. Read the license file shipped with the binary.
5. Add the license and source URL to `THIRD_PARTY_NOTICES.md`.
6. Add the SHA-256 to the package manifest.
7. Test the binary through the companion, not only from a terminal.

No binary is downloaded at runtime in the MVP.

## Build commands

Development:

```
cd companion
npm test
node src/index.js --port 47831
```

Package build on Windows x64, from the repository root:

```
npm run package:companion
npm run smoke:companion
```

`scripts/package-companion.mjs`:

1. Downloads pinned resources into `companion/bin/.cache/`, or reuses the
   cached copy.
2. Verifies every download against the checksum list published by its upstream
   project: Node.js `SHASUMS256.txt`, yt-dlp `SHA2-256SUMS`, BtbN
   `checksums.sha256`.
3. Extracts the Node.js runtime and the FFmpeg shared build with `tar`.
4. Stages `YT SuperTool Companion/` with `app/src`, `node/node.exe`,
   `app/bin/win32-x64/` and `licenses/`.
5. Writes `app/bin/win32-x64/manifest.json` with the SHA-256 of every bundled
   binary, plus `README.txt`, `LICENSES.txt` and the `.cmd` launcher.
6. Runs `--self-test` with the packaged Node.js runtime.
7. Probes the bundled yt-dlp and FFmpeg through `detectBinaries`, which checks
   the manifest hashes.
8. Writes `companion/dist/yt-supertool-companion-<version>-<platform>-<arch>.zip`
   and the `.sha256` file next to it.

`scripts/package-smoke.mjs` unpacks the zip into a temporary folder, checks the
layout and manifest hashes, runs `--self-test`, starts the packaged companion on
a free loopback port, checks that a foreign Origin and a missing token are
rejected, pairs with the printed code, analyzes the test video, downloads 360p
MP4 into a temporary output folder, checks the saved file and the empty
temporary folder, revokes the token, and stops the server.

Both scripts currently support `win32-x64` only. Linux and macOS packages need
their own Node.js runtime, binary sources and a native runner, because the
binary and runtime must match the target. Cross compilation is not used.

The GitHub Actions matrix below still describes the planned per-platform build.
No workflow file runs the package scripts yet.

## Packaged build on 2026-11-15

Windows 10 IoT Enterprise LTSC 2021 (10.0.19044) x64, Node.js v26.13.1,
yt-dlp 2026.10.26, FFmpeg `N-128909-g604ef3784d-20261114` from the BtbN
`lgpl-shared` build.

```
companion/dist/yt-supertool-companion-1.0.0-win32-x64.zip
size    132,206,574 bytes
sha256  c4b934d65e0409f3d0402d3d6157420b61f4a25375dc12aa3ce08e83a357ed37
```

The zip contains `YT SuperTool Companion/` with `node/node.exe`,
`app/src/*`, `app/bin/win32-x64/*` (yt-dlp, ffmpeg, ffprobe and 7 shared
FFmpeg DLLs), `licenses/`, `README.txt`, `LICENSES.txt` and the launcher.

`npm run package:companion` printed `SELF-TEST OK` with the packaged runtime,
and the binary probe reported both binaries available. `npm run smoke:companion`
then unpacked the zip and reported:

```
layout ok (7 dlls, 10 checksums)
self-test ok
health ok (yt-dlp 2026.10.26, ffmpeg N-128909-g604ef3784d-20261114)
auth and origin checks ok
analyze ok (7 video presets)
download accepted <job id>
saved Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film [aqz-KE-bpKQ].mp4 (25786983 bytes)
no leftover temp files
PACKAGE SMOKE OK
```

That file size matches the three browser runs from the same day. The zip is a
release artifact and is not committed. `companion/dist/` is in `.gitignore`.

## GitHub Actions plan

Add a `companion` job to the release workflow:

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - os: windows-latest
        platform: win32
        arch: x64
      - os: ubuntu-latest
        platform: linux
        arch: x64
      - os: macos-13
        platform: darwin
        arch: x64
      - os: macos-14
        platform: darwin
        arch: arm64
```

Each job runs `npm ci`, `npm test`, `npm run package:companion`, then
`npm run smoke:companion`. The packaging step already runs
`YT SuperTool Companion/node/node.exe app/src/index.js --self-test` with the
packaged runtime.

`--self-test` checks the store roundtrip, settings defaults and path rejection,
the URL policy, a pairing roundtrip, and the server health and auth routes. It
does not download media. The packaging step then probes the bundled yt-dlp and
FFmpeg against the manifest hashes; the smoke test performs one real 360p
download.

Artifacts upload only after the smoke test passes. A failed row does not block
the extension release, but the missing platform is listed in the release notes.

## Installation

Windows:

1. Download the zip for `win32-x64`.
2. Verify the SHA-256 against the `.sha256` file.
3. Extract to a folder the user controls.
4. Run `YT SuperTool Companion.cmd`.
5. Keep the terminal window open, or use the optional startup shortcut.
6. Copy the pairing code into the YT SuperTool panel.

Linux:

1. Extract the archive.
2. Run `./yt-super-tool-companion`.
3. If the browser sandbox blocks loopback access, follow the troubleshooting
   section in the README.

macOS:

1. Extract the archive.
2. Remove the quarantine attribute only after verifying the SHA-256.
3. Run the launcher.
4. Allow incoming loopback connections if the firewall prompts.

The README must state that the companion is optional, local only and does not
receive YouTube cookies.

## Uninstall

1. Stop the companion.
2. Delete the extracted folder.
3. Delete the data directory:
   - Windows: `%USERPROFILE%\.yt-super-tool`
   - Linux and macOS: `$HOME/.yt-super-tool`
4. Remove downloaded files from the configured output directory.
5. Clear the token from YT SuperTool settings if the extension is kept.

The uninstall instructions must not promise a system-wide clean removal when
the package is portable.

## Updates

MVP: the user replaces the extracted folder. The companion reports its version
in `GET /api/health`. The client shows an update hint when the API version is
incompatible.

Later: a signed manifest with version, platform, archive URL and SHA-256. The
companion downloads only after signature verification. It never executes an
unsigned binary.

## Checksums and release notes

Every archive has a `.sha256` file. Release notes list:

- Companion version and API version.
- Included yt-dlp and FFmpeg versions.
- Platforms built and platforms tested, as separate statements.
- Known limitations.
- License and third-party notice locations.
- The exact test commands and results.

No release note claims a platform is supported when only a build exists.

## Smoke test record

Create `companion/TEST_MATRIX.md` during Phase 6. Columns: date, OS version,
architecture, browser, target (userscript/MV2/MV3), health, pair, analyze,
download, cancel, saved file check, notes. A row without a saved file check is
not a pass.

### Browser runs on 2026-11-15

Windows 10 IoT Enterprise LTSC 2021 (10.0.19044) x64, companion 1.0.0 started
from source, yt-dlp 2026.10.26, FFmpeg N-128909-g604ef3784d-20261114, output
in a temporary folder.

| Browser | Target | Pair | Analyze | Download | Cancel | Saved file |
|---|---|---|---|---|---|---|
| Edge 157.0.4341.46 | MV3 | Pass | Pass | 360p MP4 | Pass | 25,786,983 bytes |
| Firefox 160.0 | MV2 | Pass | Pass | 360p MP4 | Not run | 25,786,983 bytes |
| Edge 157.0.4341.46 | Userscript | Pass | Pass | 360p MP4 | Not run | 25,786,983 bytes |

The default Edge result also checked the cancel button, the reopen after
cancelling, and that no temporary file stayed in the output folder. Firefox and
the userscript run checked the saved file and the empty temporary folder.

Chromium 138 and later refuses to load MV2 extensions, so `dist/mv2` was tested
in Firefox. Firefox loaded it as a temporary add-on through WebDriver BiDi.

The userscript run used injected shims for the `GM_*` calls, because no
userscript manager is installed on the test machine. Request handling ran
through the shims, not through Tampermonkey or Violentmonkey. Treat a real
manager as still untested.

### Packaged Windows build on 2026-11-15

The zip was extracted to a temporary folder and started with the bundled
`node/node.exe`. `YTST_YTDLP_PATH` and `YTST_FFMPEG_PATH` were removed from the
child environment, so every binary came from `app/bin/win32-x64/` and passed the
manifest checksum check.

| Platform | Artifact | Health | Pair | Analyze | Download | Cancel | Saved file |
|---|---|---|---|---|---|---|---|
| Windows 10 x64 | `yt-supertool-companion-1.0.0-win32-x64.zip` | Pass | Pass | Pass | 360p MP4 | Not run | 25,786,983 bytes |

The package smoke also checked the layout, the `licenses/` files, the SHA-256
manifest, a rejected foreign Origin, a rejected missing token, token revocation
and an empty `.ytst-tmp` folder.

## Release blockers

- Missing license verification for yt-dlp or FFmpeg.
- Missing SHA-256 for a bundled binary.
- A package that needs Node, Python, yt-dlp or FFmpeg installed separately.
- A platform row marked supported without a build artifact and a test record.
- `npm run build:verify` failure in the extension repository.
- Any endpoint that accepts arbitrary commands, URLs or paths.
