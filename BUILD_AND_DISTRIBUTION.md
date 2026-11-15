# Build and distribution

Plan for packaging the companion with yt-dlp and FFmpeg. No companion package
has been built yet. This document records the decision process and the checks
required before a platform is advertised.

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
| Windows 10/11 | x64 | Not yet | No |
| Linux | x64 | Not yet | No |
| Linux | arm64 | Not yet | No |
| macOS Intel | x64 | Not yet | No |
| macOS Apple Silicon | arm64 | Not yet | No |

The table must be updated with a date and a test record. A row stays "No" until
a package exists and the smoke test below has run on that platform.

## Repository layout

```
companion/
  package.json
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
  scripts/
    fetch-binaries.mjs
    build-package.mjs
  bin/
    <platform>-<arch>/
      yt-dlp[.exe]
      ffmpeg[.exe]
      manifest.json
  LICENSE
  THIRD_PARTY_NOTICES.md
```

`bin/` is not committed with large binaries. A fetch script downloads pinned
releases and verifies published checksums. The generated package contains the
binaries and a `manifest.json` with SHA-256 values.

## Binary sources

| Binary | Source | License to verify | Notes |
|---|---|---|---|
| yt-dlp | Official GitHub releases | Check the release license file before shipping | Prefer the standalone executable per platform |
| FFmpeg | A build with LGPL configuration | LGPL-2.1-or-later for the chosen build | Avoid GPL-only codecs unless the whole package complies with GPL |
| Node.js | Official Node distribution | MIT plus third-party notices | Use a supported LTS line |

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

Package build on the target platform:

```
cd companion
node scripts/fetch-binaries.mjs --platform win32 --arch x64
node scripts/build-package.mjs --platform win32 --arch x64
```

The build script:

1. Bundles the companion entry with a fixed target and no minification.
2. Copies the Node runtime for the platform.
3. Copies `bin/<platform>-<arch>/`.
4. Writes launcher scripts:
   - Windows: `YT-SuperTool-Companion.cmd`
   - Linux and macOS: `yt-super-tool-companion`
5. Writes `manifest.json` with file sizes and SHA-256 values.
6. Writes `THIRD_PARTY_NOTICES.md` and the project license.
7. Produces a zip named
   `yt-supertool-companion-<version>-<platform>-<arch>.zip`.
8. Produces a `.sha256` file next to the zip.

The release workflow builds each matrix entry on its native runner. Cross
compilation is not used for the first release because the binaries and the Node
runtime must match the target.

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

Each job runs `npm ci`, `npm test`, the package build, and a smoke test:

```
node dist/companion/src/index.js --self-test
```

`--self-test` checks the server can bind an ephemeral port, the binary paths
exist, the binary versions can be read, and the pairing store can be created in
a temporary directory. It does not download media.

Artifacts upload only after the smoke test passes. A failed row does not block
the extension release, but the missing platform is listed in the release notes.

## Installation

Windows:

1. Download the zip for `win32-x64`.
2. Extract to a folder the user controls.
3. Run `YT-SuperTool-Companion.cmd`.
4. Keep the terminal window open, or use the optional startup shortcut.
5. Copy the pairing code into the YT SuperTool panel.

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

Windows 11 x64, companion 1.0.0 started from source, yt-dlp 2026.10.26,
FFmpeg N-128909-g604ef3784d-20261114, output in a temporary folder.

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

## Release blockers

- Missing license verification for yt-dlp or FFmpeg.
- Missing SHA-256 for a bundled binary.
- A package that needs Node, Python, yt-dlp or FFmpeg installed separately.
- A platform row marked supported without a build artifact and a test record.
- `npm run build:verify` failure in the extension repository.
- Any endpoint that accepts arbitrary commands, URLs or paths.
