# Third-party notices

YT SuperTool Companion is a portable package. It bundles the programs below so
the user does not install Node.js, Python, yt-dlp or FFmpeg separately. The
package does not download or update any binary at runtime.

Versions recorded on 2026-11-15 for package 1.0.0, target `win32-x64`. Every
archive was checked against the checksum list published by its upstream project
before it was unpacked.

## Node.js

- Version: v26.13.1, `win-x64` zip.
- Upstream: <https://nodejs.org/dist/v26.13.1/>
- Archive SHA-256: `e2edda75bfb089654705cf65a13b58933bfd5f57148e8ebda916f58a2474f1f7`
- License: MIT. The license text ships as `licenses/node-LICENSE.txt`.
- Bundled files: `node/node.exe`, `licenses/node-LICENSE.txt`.

## yt-dlp

- Version: 2026.10.26, `yt-dlp.exe` from the latest release.
- Upstream: <https://github.com/yt-dlp/yt-dlp>
- File SHA-256: `f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d`
- License: Unlicense. The license text ships as `licenses/yt-dlp-LICENSE.txt`.
- Bundled file: `app/bin/win32-x64/yt-dlp.exe`.

`yt-dlp.exe` is a PyInstaller build. It contains Python and other components
under their own licenses. Python's license is at
<https://docs.python.org/3/license.html>; the source for yt-dlp and its build
scripts is in the upstream repository above.

## FFmpeg

- Build: BtbN `ffmpeg-master-latest-win64-lgpl-shared`, FFmpeg
  `N-129000-g64f6bcffaf-20261117`.
- Upstream build: <https://github.com/BtbN/FFmpeg-Builds>
- Upstream source: <https://github.com/FFmpeg/FFmpeg>
- Archive SHA-256: `8108b340409da1f48fb1fd989984f0fc15dc3e505c10a3981fd185b7f725ea0f`
- License: LGPL-3.0-or-later. The license text ships as
  `licenses/ffmpeg-LICENSE.txt`.
- Bundled files: `ffmpeg.exe`, `ffprobe.exe` and the shared libraries
  `avcodec-63.dll`, `avdevice-63.dll`, `avfilter-12.dll`, `avformat-63.dll`,
  `avutil-61.dll`, `swresample-7.dll`, `swscale-10.dll` in
  `app/bin/win32-x64/`.

This is the shared build, not a static build and not the GPL build. The FFmpeg
libraries stay as separate DLLs, so a user can replace them with compatible
versions. The package does not modify FFmpeg. The source for the exact build is
available from the two repositories above; the build scripts record the FFmpeg
commit they compile.

## Checksums inside the package

`app/bin/win32-x64/manifest.json` stores the SHA-256 of every bundled binary.
The companion verifies those values at startup and refuses a file that does not
match. The release zip has its own `.sha256` file next to it.

## Before a public release

The texts above are the licenses that apply to the bundled files. A maintainer
should still read the upstream notices for the exact release tags and keep the
`licenses/` folder in the zip. Do not swap in a GPL FFmpeg build, a static
build, or a binary from an unverified source without repeating the checksum and
license review.
