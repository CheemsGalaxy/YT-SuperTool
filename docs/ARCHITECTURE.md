# Architecture

Design for the YT SuperTool Companion, a local download service built with
Node.js and backed by yt-dlp and FFmpeg. The existing extension and userscript
remain the product. The companion is an optional local component.

## Goals

- Keep the current Download button and menu on watch pages.
- Add high quality video and audio downloads through a local service.
- Support userscript, MV2 and MV3 with one shared client interface.
- Require no paid backend and no account.
- Keep the companion bound to loopback only.
- Keep browser-specific code inside adapters.

## Non-goals

- DRM, paywall or access-control bypass.
- Downloading content the user cannot access in the browser.
- A general purpose downloader or shell runner.
- A remote service, cloud queue or user account system.
- Replacing the existing direct MP4 path before the companion path is tested.

## Components

```
YT SuperTool UI
  Download button and menu (src/core/features/downloader.js)
  Settings and companion status
        |
        v
Shared core companion client
  src/core/companion/client.js
  status, pair, analyze, start, poll, cancel, settings
        |
        v
Target adapters
  userscript: GM_xmlhttpRequest to 127.0.0.1
  MV2: background page fetch
  MV3: service worker fetch
        |
        v
Companion HTTP API
  http://127.0.0.1:47831
  pairing, auth, URL policy, settings, jobs
        |
        +--> yt-dlp (metadata and format resolution)
        +--> segmented HTTP engine (media streams)
        +--> FFmpeg (merge, remux, audio conversion)
        +--> output directory
```

The core never imports `chrome`, `browser`, `GM_*` or `unsafeWindow`. The
companion client takes a transport object from the adapter. The adapters own
the request mechanism and the token storage.

| Layer | File | Request path |
|---|---|---|
| Shared client | `src/core/companion/client.js` | Token load, headers, error mapping, timeouts |
| Userscript | `src/adapters/userscript.adapter.js` | `GM_xmlhttpRequest`, direct fetch fallback |
| MV2 and MV3 | `src/adapters/extension.adapter.js` | `runtime.sendMessage` to `YT_SUPERTOOL_COMPANION` |
| Extension background | `src/entries/background.entry.js` | Path, method, body and header validation, then `fetch` |
| Direct fallback | `src/adapters/local-fetch.js` | `fetch` to `http://127.0.0.1:47831` |

Every transport returns `{ status, data }` or `{ status: 0, error }`. The shared
client owns retries of nothing, token clearing on 401 and version checks. Only
the adapters know how to reach the network.

MV3 can handle a message and then lose the response: the worker calls
`sendResponse`, yet the page promise never settles. The extension background
therefore writes a new pairing token to `chrome.storage.local` before it
answers. The shared client races each transport call against its timeout plus a
small grace, and a timed-out pair reads that stored token before it reports
failure.

## Companion process

The companion is a Node.js package under `companion/`. It uses built-in modules
only at runtime: `node:http`, `node:crypto`, `node:fs`, `node:path`,
`node:os`, `node:child_process` and `node:test` for tests.

Process layout:

| Module | Responsibility |
|---|---|
| `src/index.js` | Parse flags, start server, print pairing code and address |
| `src/server.js` | HTTP routing, CORS, body limits, auth, error mapping |
| `src/pairing.js` | One-time code, token issue, hash storage, token check |
| `src/url-policy.js` | YouTube URL parsing and normalization |
| `src/jobs.js` | Queue, job state, progress, cancel, cleanup |
| `src/ytdlp.js` | Analyze, resolve, stream plan, merge argument map, progress parsers |
| `src/media.js` | yt-dlp resolve/fallback and FFmpeg merge process wiring |
| `src/downloader/planner.js` | Segment layout, worker claims, resume validation |
| `src/downloader/engine.js` | Range probe, parallel HTTP workers, retries, resume state, speed limit |
| `src/binaries.js` | Path lookup, version probe, checksum manifest |
| `src/settings.js` | Read and validate persistent settings |
| `src/store.js` | Atomic JSON read and write under the user data directory |
| `src/log.js` | Bounded in-memory log with token and code redaction |

Default data directory: `%USERPROFILE%\.yt-super-tool` on Windows,
`$HOME/.yt-super-tool` on Linux and macOS. The server never writes outside that
directory except to the configured output directory and its own temporary
download folder.

## Lifecycle

1. User installs YT SuperTool, then installs the companion package.
2. User starts the companion. It prints the URL and a one-time pairing code.
3. The client calls `GET /api/health`. If the service is absent, the UI shows
   "Companion not running" with a link to the install guide.
4. The user enters the pairing code in the client. `POST /api/pair` returns a
   token. The client stores the token in extension storage or GM storage.
5. The companion stores only the SHA-256 hash of the token in its data directory.
6. Later requests carry `X-YTST-Token`. A 401 response clears the stored token
   and returns the UI to the pairing state.
7. The client can revoke the pairing with `POST /api/unpair`. The companion
   removes the hash for that token and the client deletes its token. When no
   paired clients remain, the companion prints a new pairing code.

The pairing code is single use, expires after 10 minutes and is rate limited.
The token is 32 random bytes encoded as base64url.

## Compatibility

The health payload carries `companionVersion` and `apiVersion`. The client
supports API version 1. When the major API version differs, the UI reports
"Companion version not supported" and does not call other endpoints.

The companion checks the binary versions at startup and in health checks.
Missing or incompatible yt-dlp or FFmpeg produces a clear state. Audio
extraction and merge need FFmpeg. Metadata analysis can work with yt-dlp alone.

## Download flow

```
User opens Download menu
        |
        v
client.status()
  not running -> show install/start guidance
  not paired  -> show pairing form
  ready       -> continue
        |
        v
client.analyze(url)
  companion runs yt-dlp --dump-single-json
  returns title, duration, thumbnail and preset options
        |
        v
User picks video quality or audio format
        |
        v
client.start({ url, mode, quality })
  companion creates job, returns job id
        |
        v
job runs
  yt-dlp -J -f <preset> resolves requested formats
  probe each media URL with Range: bytes=0-0
  plan chunks, start HTTP workers
  write ranged chunks at their file offsets
  retry failed ranges, save optional resume state
  on DOWNLOAD_FAILED, retry the job through yt-dlp
  FFmpeg merges streams or converts audio
        |
        v
client polls GET /api/download/:id every 700 ms
  queued, running, completed, failed, cancelled
        |
        +--> progress bar, status text, cancel button
        |
        v
completed: show saved path and open-folder action
```

The companion keeps jobs in memory. Completed history keeps the last 50 jobs.
A restart drops unfinished jobs and removes their temporary folders. The
segmented engine can resume from a state file when one is supplied, but the
job manager does not keep one across process restarts yet.

## Job model

| State | Meaning |
|---|---|
| `queued` | Accepted, waiting for a slot |
| `running` | The segmented HTTP engine, yt-dlp or FFmpeg is active |
| `completed` | Final file exists in the output directory |
| `failed` | Ended with an error code |
| `cancelled` | User cancelled or the process was stopped |

Each job has an id, state, progress fraction, received bytes, total bytes,
speed text, ETA text, title, output path, error code, error message and
timestamps. Only one job per URL runs at a time. The queue allows two active
downloads by default, configurable from 1 to 2.

## Output safety

- The output directory must be absolute and already exist or be creatable.
- The companion rejects the filesystem root, the companion source directory
  and paths outside the user's home directory.
- Each job writes to `<output>/.ytst-tmp/<jobId>/`.
- The resolve step asks yt-dlp for the exact preset and reads only the direct
  media URLs from its JSON. The client never supplies a media URL.
- The engine writes stream files inside the job directory, then FFmpeg writes
  the merged or converted file there. Only that final file moves to the output
  directory, using a collision suffix instead of overwriting.
- After completion, the companion resolves the final path, checks that it is
  inside the job temporary directory, then moves it to the output directory.
- The companion never deletes files it did not create in the current job.
- Cancel removes only the job temporary directory.

## Settings

| Key | Values | Default |
|---|---|---|
| `outputDir` | Absolute path | `Downloads/YT SuperTool` |
| `videoQuality` | `best`, `2160`, `1440`, `1080`, `720`, `480`, `360` | `1080` |
| `videoContainer` | `mp4`, `mkv` | `mp4` |
| `audioFormat` | `mp3`, `m4a` | `mp3` |
| `audioQuality` | `128`, `192`, `256`, `320` | `192` |
| `concurrentDownloads` | `1`, `2` | `1` |
| `connections` | Integer `1` to `32` | `8` |
| `speedLimitKbps` | Integer `0` to `1048576`, `0` means unlimited | `0` |
| `cookiesFromBrowser` | `null`, `chrome`, `chromium`, `edge`, `brave`, `firefox`, `opera`, `vivaldi` | `null` |
| `cookiesFile` | `null` or an absolute path inside the user home | `null` |

Values outside these sets are rejected with `BAD_REQUEST`. The client never
sends raw yt-dlp or FFmpeg arguments. `connections` controls parallel range
requests per stream. `speedLimitKbps` throttles the segmented engine across all
workers; the value is converted to bytes per second when a job starts. `cookiesFromBrowser` is a browser name,
not a cookie value or a path. When it is set, the companion adds
`--cookies-from-browser <name>` to yt-dlp; yt-dlp reads the browser store
itself. `cookiesFile` is a path to a Netscape cookies.txt file. The companion
checks that the file exists, stays inside the user home, is a regular file, is
no larger than 5 MB and has the Netscape header. It then adds
`--cookies <path>`. The two sources are exclusive; setting one clears the
other, and the companion never stores cookie values.

## Error handling

The companion returns a stable code and a human readable message. The client
maps codes to UI strings. Network failures and timeouts are client-side states:
`not-running`, `timeout`, `unauthorized`, `incompatible`.

Known codes are listed in `API_SPEC.md`. Unknown server errors return
`INTERNAL` without a stack trace.

## Fallbacks

The current direct muxed MP4 path stays until the companion path passes browser
tests on all three targets. If the companion is not available, the menu offers
the direct MP4 item when the page can still obtain one. The third-party
`ytmp3pc.com` handoff is removed only after the companion path works and the
fallback decision is recorded.

## Testing

- Companion unit tests with `node:test`: URL policy, pairing, auth, job state,
  cancellation, argument mapping, chunk planning, range download, resume,
  abort, speed limit and path checks.
- Integration tests: start the server on an ephemeral port, pair, analyze a
  known public URL if network is available, start and cancel a job.
- Browser tests: load each target, open the menu, pair, start a download,
  observe progress, cancel, and verify the saved file.
- Build checks: `npm run build:verify` must pass after every adapter or
  manifest change.

No platform is marked supported until a build artifact exists and has been
tested on that platform.

## Phase boundaries

| Phase | Output |
|---|---|
| 0 | `archive/BASELINE_AUDIT.md`, baseline build results |
| 1 | This file, `API_SPEC.md`, `SECURITY.md`, `BUILD_AND_DISTRIBUTION.md` |
| 2 | Companion server, pairing, jobs, tests |
| 3 | Shared client and three adapters |
| 4 | Downloader UI integration |
| 5 | Packaging and installers |
| 6 | Test matrix and stabilization |
| 7 | Documentation and release |
