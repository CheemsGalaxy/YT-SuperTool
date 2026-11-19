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
- The user's browser cookie store, which yt-dlp reads only when the user turns
  on the optional browser cookie source. The companion does not store a cookie
  value.

## Trust boundaries

| Boundary | Trust level |
|---|---|
| YouTube page script and YT SuperTool content script | Untrusted input, but holds the pairing token after pairing |
| Extension background or userscript manager | Trusted client transport |
| Loopback HTTP | Untrusted network input, including other local processes |
| Companion process | Trusted code, least privilege |
| yt-dlp and FFmpeg child processes | Trusted binaries, untrusted media input |
| Output directory | User controlled path, validated per job |

By default the companion receives no cookies. The user can opt in from the
installed **Browser cookies** shortcut and choose one browser. The companion
stores only that browser name and passes
`--cookies-from-browser <name>` to yt-dlp. The companion process does not open
the cookie store itself. yt-dlp reads the store of the chosen browser and uses
the cookies for YouTube requests. Cookie values never enter the companion
settings file, API responses or logs. A local process running as the same user
can still read the same browser store; the opt-in does not change that.

The cookie source is a convenience for the user's own signed-in session. It is
not an authentication bypass and does not unlock content the user cannot play
in that browser.

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
| Arbitrary URL fetch | URL parser accepts only YouTube hosts and video paths. Playlists, channels and search URLs are rejected. The segmented engine fetches only media URLs that yt-dlp returned for the current job. |
| Header injection through media JSON | Only allowlisted headers (`User-Agent`, `Accept`, `Accept-Language`, `Referer`, `Origin`, `Sec-Fetch-*`) are copied from the yt-dlp result. Cookies, `Range` and custom names are dropped. |
| SSRF through redirects | The client cannot submit a media URL. The engine follows redirects only over HTTP and HTTPS, rejects other protocols and has no public fetch endpoint. |
| Path traversal | Output directory is absolute, inside the user's home, and not a root. Final path is resolved and checked against the job temporary directory before the move. |
| Symlink swap | Reject symlinked output directories and final targets. Create the job directory with a random id and restrictive permissions. |
| Overwrite of unrelated files | Every stream and the merged file are written into a per-job temporary directory. The final rename refuses an existing target. |
| Huge request or response | 64 KiB request limit. yt-dlp JSON output capped at 10 MiB. Job progress lines capped. |
| Resource exhaustion | Two concurrent jobs maximum, one job per URL, process timeout for analyze, queue cap of 20. |
| Binary replacement | Bundled binaries are checked against a SHA-256 manifest before first use. Environment overrides are explicit and logged without secrets. |
| Unsigned update | No automatic binary update in the MVP. A future updater must verify a signed manifest. |
| Error message leak | Responses carry a stable code and a short message. Stack traces stay in local debug logs only. |
| Log growth | In-memory ring buffer, 200 entries, no file log by default. |
| Browser cookie exposure | Cookie source is off by default and limited to an allowlist of browser names. The companion stores no cookie value, returns none through the API and keeps cookies out of logs. yt-dlp reads the store directly. |
| Cookie database locked or encrypted | yt-dlp reports a read failure; the companion returns a short message that asks the user to close the browser or choose another one. It does not fall back to a different browser. |
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
into arguments are validated enums, a normalized URL and the optional cookie
source name. The companion calls FFmpeg itself with a fixed argument array built
from the job plan, so no user supplied command line reaches it.

Required flags include:

```
--ignore-config
--no-exec
--no-playlist
--no-warnings
--newline
--js-runtimes node:<path>
```

When the user turns on browser cookies, the companion adds
`--cookies-from-browser <name>`. The name must be one of the allowlisted
browsers. The flag does not accept a path or extra yt-dlp arguments.

The process runs with `windowsHide: true`, a minimal environment and a working
directory inside the job temporary folder. Standard output and standard error
are parsed, not executed. Output is capped per job.

## Filesystem rules

- The default output directory is `Downloads/YT SuperTool` under the user's
  home directory.
- `outputDir` must be absolute, must resolve inside the home directory and must
  not be a filesystem root.
- The companion creates `outputDir` only after validation.
- Each job writes to `outputDir/.ytst-tmp/<jobId>/`. Stream files and the
  merged file stay there until the job finishes.
- The final filename comes from a sanitized title and the video id. Path
  separators, reserved characters and trailing dots are removed.
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
- When browser cookies are enabled, the browser cookie store holds bearer
  credentials. Another process running as the same user can read the same
  store. The companion limits the source to one allowlisted browser name and
  does not copy or persist cookie values.
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

- DRM, paywall, authentication or access-control bypass. A cookie source only
  proves the user's own signed-in session to YouTube.
- Downloading private, age restricted or region blocked content the user cannot
  play in the browser.
- Sharing or exporting a browser session, or using cookies from another user.
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
- The cookie source defaults to off and rejects names outside the allowlist.
- A cookie-enabled start passes only `--cookies-from-browser <allowlisted>`.
- `connections` and `speedLimitKbps` reject values outside their integer ranges.
- The segmented engine rejects a redirect to a non-HTTP(S) protocol and falls
  back to one stream when the server ignores ranges.
- Logs contain no token, code, cookie value or query string.
- `npm run build:verify` passes for all targets.
