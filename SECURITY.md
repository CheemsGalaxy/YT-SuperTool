# Security model

The companion is a loopback HTTP service that can run yt-dlp and FFmpeg and
write files to a user chosen directory. It must not become a remote command
surface. This document defines the threat model and the controls the
implementation must keep.

## Assets

- The pairing token and its server-side hash.
- The one-time pairing code.
- The output directory and downloaded files.
- The yt-dlp and FFmpeg binaries.
- The user's browser session and YouTube cookies, which the companion never
  receives.

## Trust boundaries

| Boundary | Trust level |
|---|---|
| YouTube page script and YT SuperTool content script | Untrusted input, but holds the pairing token after pairing |
| Extension background or userscript manager | Trusted client transport |
| Loopback HTTP | Untrusted network input, including other local processes |
| Companion process | Trusted code, least privilege |
| yt-dlp and FFmpeg child processes | Trusted binaries, untrusted media input |
| Output directory | User controlled path, validated per job |

The companion never reads browser cookies, YouTube credentials or page storage.
It receives only a normalized YouTube URL and download presets.

## Threats and controls

| Threat | Control |
|---|---|
| A website calls the local service | Token header plus Origin allowlist. CORS alone is not treated as authentication. |
| DNS rebinding | Reject any `Host` header that is not `127.0.0.1:<port>` or `localhost:<port>`. |
| CSRF from a YouTube page | Custom `X-YTST-Token` header forces a preflight. The token is not a cookie and is not sent automatically. |
| Token theft from the bundle | No shared secret is shipped. Each installation gets a random token after pairing. |
| Token leak in logs or URLs | Token travels only in `X-YTST-Token`. Logs redact the header, pairing code and URL query strings. |
| Brute force pairing | 8 character code, 10 minute TTL, single use, 5 attempts per minute per loopback address. |
| Command injection | `spawn(binary, argsArray, { shell: false })`. No user string is concatenated into a command. |
| Arbitrary yt-dlp arguments | The client sends enums only. The server maps presets to a fixed argument array. |
| Malicious yt-dlp config | Launch with `--ignore-config` and `--no-exec`, so a user or attacker config file cannot add arguments. |
| Arbitrary URL fetch | URL parser accepts only YouTube hosts and video paths. Playlists, channels and search URLs are rejected. |
| SSRF through redirects | Only normalized YouTube video URLs reach yt-dlp. The companion does not expose a generic fetch endpoint. |
| Path traversal | Output directory is absolute, inside the user's home, and not a root. Final path is resolved and checked against the job temporary directory before the move. |
| Symlink swap | Reject symlinked output directories and final targets. Create the job directory with a random id and restrictive permissions. |
| Overwrite of unrelated files | yt-dlp writes into a per-job temporary directory. The final rename refuses an existing target. |
| Huge request or response | 64 KiB request limit. yt-dlp JSON output capped at 10 MiB. Job progress lines capped. |
| Resource exhaustion | Two concurrent jobs maximum, one job per URL, process timeout for analyze, queue cap of 20. |
| Binary replacement | Bundled binaries are checked against a SHA-256 manifest before first use. Environment overrides are explicit and logged without secrets. |
| Unsigned update | No automatic binary update in the MVP. A future updater must verify a signed manifest. |
| Error message leak | Responses carry a stable code and a short message. Stack traces stay in local debug logs only. |
| Log growth | In-memory ring buffer, 200 entries, no file log by default. |
| Unnecessary permissions | Add only `http://127.0.0.1/*` to extensions and `@connect 127.0.0.1` to the userscript. |
| Service exposed to LAN | Bind to `127.0.0.1` only. No `0.0.0.0`, no IPv6 wildcard, no UPnP. |

## Pairing protocol

1. The companion generates an 8 character code from an unambiguous alphabet.
   The code lives in memory, expires after 10 minutes and is printed once to the
   terminal.
2. The user types the code in the YT SuperTool panel or popup.
3. The client sends `POST /api/pair` with the code and its target name.
4. The companion compares the normalized code in constant time, marks it used
   and returns a 32 byte random token encoded as base64url.
5. The companion stores `sha256(token)` in its data directory. The raw token is
   never written to disk.
6. The client stores the token in browser storage or GM storage.
7. Every later request carries the token in `X-YTST-Token`.
8. A 401 response causes the client to delete the token and show the pairing
   form again.
9. `POST /api/unpair` removes the stored hash for that token and invalidates
   it. Other paired clients keep their tokens.

In MV3 the background service worker writes the issued token to
`chrome.storage.local` before it answers the content script. If Chromium drops
that answer, the content script reads the stored token after its request
timeout and continues as paired. The token never reaches page script either
way.

A new code is printed when the companion starts without a paired token, when
the last paired client is revoked, or when the user starts it with `--pair`.
Starting a paired companion without `--pair` does not print a code.

## Origin and host policy

Allowed origins are YouTube HTTPS origins and extension schemes. Requests from
other web origins are rejected before routing. A missing `Origin` is accepted
only when the token is valid, which covers userscript managers that omit the
header.

The `Host` check runs before CORS and routing. It blocks a rebinding attack
where `evil.example` resolves to `127.0.0.1`.

`OPTIONS` responses never include credentials and never echo an unapproved
origin.

## Process execution

yt-dlp arguments are fixed by mode and presets. The only values interpolated
into arguments are validated enums and a normalized URL. FFmpeg is called by
yt-dlp, not by a user supplied command line.

Required flags include:

```
--ignore-config
--no-exec
--no-playlist
--no-warnings
--newline
```

The process runs with `windowsHide: true`, a minimal environment and a working
directory inside the job temporary folder. Standard output and standard error
are parsed, not executed. Output is capped per job.

## Filesystem rules

- The default output directory is `Downloads/YT SuperTool` under the user's
  home directory.
- `outputDir` must be absolute, must resolve inside the home directory and must
  not be a filesystem root.
- The companion creates `outputDir` only after validation.
- Each job writes to `outputDir/.ytst-tmp/<jobId>/`.
- The filename uses the yt-dlp template with the video id and a bounded title.
  Windows reserved names are handled by yt-dlp with `--windows-filenames`.
- Before moving a finished file, the companion resolves both paths and checks
  that the source is inside the job directory and the destination is inside the
  output directory.
- Existing destination files are never overwritten. A numeric suffix is added.
- Cancel and failure remove only the job temporary directory.

## Binary handling

Development can use `YTST_YTDLP_PATH` and `YTST_FFMPEG_PATH`. Release packages
put binaries under `companion/bin/<platform>-<arch>/`. `manifest.json` stores
the expected SHA-256 and version for each file. The loader checks the hash
before the first spawn and refuses a mismatch.

FFmpeg builds must be LGPL compatible when distributed. GPL builds require the
whole distribution to comply with GPL. The release notes must state which build
is shipped. yt-dlp and FFmpeg license texts and source offers belong in the
package.

## Logging

The companion logs to standard output and a 200 entry memory buffer. It never
logs the token, pairing code or full request headers. URLs are logged with the
query string removed. Error stacks are available only with `--debug`.

## Residual risks

- A local process running as the same user can read browser storage and the
  companion data directory. The design does not defend against a compromised
  local account.
- A local process can probe the loopback port and attempt pairing. The code
  TTL, attempt limit and single use reduce the window but do not remove it.
- yt-dlp and FFmpeg parse untrusted media. Keep them updated and verify
  downloaded binaries.
- A compromised browser extension could use the token. Extension integrity is
  outside the companion's control.
- Loopback HTTP is not encrypted. Another process with packet capture rights on
  the same machine could read a pairing request. This is accepted for a local
  desktop tool.
- YouTube changes can break extraction. The companion reports an error instead
  of retrying with unsafe arguments.

## Out of scope

- DRM, paywall, authentication or access-control bypass.
- Downloading private, age restricted or region blocked content the user cannot
  play in the browser.
- Arbitrary shell execution, arbitrary URL fetching or arbitrary file access.
- Multi-user or LAN operation.
- A remote pairing service.

## Security checks before release

- Pairing code cannot be reused.
- Invalid token returns 401 and does not reveal whether a job exists.
- A foreign Origin receives no CORS headers and a rejected request.
- A foreign Host is rejected.
- A URL with a non-YouTube host is rejected before yt-dlp runs.
- A crafted `outputDir` with `..` or a root path is rejected.
- A finished path outside the job directory is rejected.
- A binary hash mismatch stops startup.
- Logs contain no token, code or query string.
- `npm run build:verify` passes for all targets.
