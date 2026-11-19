# API specification

Version 1 of the YT SuperTool Companion local HTTP API. Base URL:
`http://127.0.0.1:47831`. All request and response bodies are JSON.

This document is a contract for implementation. The companion binds only to
loopback. No endpoint accepts shell commands, raw yt-dlp arguments, arbitrary
URLs or arbitrary file paths.

## Common rules

- Request body limit: 64 KiB.
- Response `Content-Type`: `application/json; charset=utf-8`.
- Response `Cache-Control`: `no-store`.
- Authentication header: `X-YTST-Token: <token>`.
- The token never appears in a URL, query string or log line.
- `X-YTST-Client`: `userscript`, `mv2` or `mv3`.
- `X-YTST-Client-Version`: client version, for diagnostics.
- Timestamps use ISO 8601 UTC strings.
- Unknown request fields are ignored. Unknown enum values are rejected.

## CORS

Allowed origins:

- `https://www.youtube.com`
- `https://m.youtube.com`
- `https://music.youtube.com`
- Extension schemes: `chrome-extension://`, `moz-extension://`,
  `safari-web-extension://`

The companion echoes the request origin only when it matches this list and adds
`Vary: Origin`. A missing `Origin` header is allowed only for loopback clients
that present a valid token. A page from any other origin receives no CORS
headers and the request is rejected when it reaches an authenticated route.

The `Host` header must name `127.0.0.1` or `localhost` with the configured port.
This blocks DNS rebinding through an attacker controlled hostname.

Preflight response:

```
Access-Control-Allow-Origin: <matched origin>
Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS
Access-Control-Allow-Headers: content-type, x-ytst-token, x-ytst-client, x-ytst-client-version
Access-Control-Max-Age: 600
Vary: Origin
```

## Authentication

`GET /api/health` and `GET /api/version` are public.

`POST /api/pair` is public but rate limited.

All other routes require a token. A missing or invalid token returns 401 with
code `BAD_TOKEN`. The client clears its stored token and asks the user to pair
again.

Malformed JSON, missing fields, invalid enums and oversized bodies return 400
with code `BAD_REQUEST`. A request body over 64 KiB closes the connection with
413.

## Endpoints

### GET /api/health

Public. Used for discovery and status.

```json
{
  "ok": true,
  "service": "yt-super-tool-companion",
  "companionVersion": "1.0.0",
  "apiVersion": 1,
  "platform": "win32-x64",
  "paired": false,
  "binaries": {
    "ytdlp": { "available": true, "version": "2026.11.15" },
    "ffmpeg": { "available": true, "version": "7.1" }
  }
}
```

`paired` is true when at least one token hash exists. It does not reveal the
token or its age.

### GET /api/version

Public. Minimal version payload.

```json
{
  "ok": true,
  "service": "yt-super-tool-companion",
  "companionVersion": "1.0.0",
  "apiVersion": 1,
  "minimumClientVersion": "2.5.0"
}
```

The client refuses to use the companion when `apiVersion` is not 1 or when its
own version is below `minimumClientVersion`.

### POST /api/pair

Public, rate limited to 5 attempts per minute per loopback address.

Request:

```json
{
  "code": "ABCD-2345",
  "clientName": "userscript"
}
```

`clientName` is one of `userscript`, `mv2`, `mv3`. The code is compared in
constant time after normalization. A code is single use and expires after 10
minutes.

Success, 200:

```json
{
  "ok": true,
  "token": "base64url-32-bytes",
  "companionVersion": "1.0.0",
  "apiVersion": 1,
  "pairedAt": "2026-11-15T09:00:00.000Z"
}
```

Errors:

| Status | Code | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | Missing or malformed code or client name |
| 401 | `PAIRING_CODE_INVALID` | Code does not match |
| 410 | `PAIRING_CODE_EXPIRED` | Code expired or already used |
| 429 | `RATE_LIMITED` | Too many attempts |
| 503 | `PAIRING_UNAVAILABLE` | Companion has no active code, for example after pairing |

The token is returned once. The companion stores only its SHA-256 hash.

### POST /api/unpair

Requires a token. Revokes the token that made the request. Tokens issued to
other clients stay valid. When no tokens remain, the companion prints a new
pairing code. The client deletes its token after a successful response.

```json
{ "ok": true }
```

### POST /api/analyze

Requires a token. Accepts a YouTube URL supported by the URL policy.

Request:

```json
{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
```

Success, 200:

```json
{
  "ok": true,
  "video": {
    "id": "dQw4w9WgXcQ",
    "title": "Example title",
    "duration": 213,
    "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    "uploader": "Example channel"
  },
  "options": {
    "video": [
      { "quality": "best", "label": "Best available", "height": null },
      { "quality": "1080", "label": "1080p", "height": 1080 },
      { "quality": "720", "label": "720p", "height": 720 }
    ],
    "audio": [
      { "format": "mp3", "label": "MP3 192 kbps" },
      { "format": "m4a", "label": "M4A best" }
    ]
  }
}
```

Only presets that yt-dlp reports as available are returned. The response does
not include signed media URLs, raw format strings or yt-dlp JSON.

Errors:

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_URL` | Not a supported YouTube URL |
| 422 | `ANALYZE_FAILED` | yt-dlp could not read the video |
| 503 | `YTDLP_MISSING` | yt-dlp binary is unavailable |
| 504 | `ANALYZE_TIMEOUT` | yt-dlp exceeded 30 seconds |

### POST /api/download

Requires a token. Creates a job. The server maps the preset to a yt-dlp format
selector, resolves the direct media URLs, then downloads them with the
segmented HTTP engine. Raw format strings are not accepted.

Request:

```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "mode": "video",
  "quality": "1080",
  "container": "mp4",
  "audioFormat": "mp3",
  "audioQuality": 192
}
```

Rules:

- `mode` is `video` or `audio`.
- For `video`, `quality` is `best`, `2160`, `1440`, `1080`, `720`, `480` or
  `360`. `container` is `mp4` or `mkv`.
- For `audio`, `audioFormat` is `mp3` or `m4a`. `audioQuality` is `128`, `192`,
  `256` or `320`. MP3 needs FFmpeg.
- Missing fields use the stored settings.
- The output directory comes from settings only. The client cannot pass a path.

Success, 202:

```json
{
  "ok": true,
  "job": {
    "id": "8b1b0f2e-5e0e-4d2d-9e0f-0d1f2f3a4b5c",
    "state": "queued",
    "progress": 0,
    "mode": "video",
    "quality": "1080",
    "title": null,
    "createdAt": "2026-11-15T09:00:00.000Z"
  }
}
```

Errors:

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_URL` | URL failed the policy |
| 400 | `BAD_REQUEST` | Invalid mode, quality, container or audio option |
| 409 | `JOB_EXISTS` | A job for the same video is queued or running |
| 503 | `YTDLP_MISSING` | yt-dlp binary is unavailable |
| 503 | `FFMPEG_MISSING` | The chosen mode needs FFmpeg |
| 503 | `OUTPUT_DIR_INVALID` | Output directory is missing or not writable |

### GET /api/download/:id

Requires a token. Returns the current job.

```json
{
  "ok": true,
  "job": {
    "id": "8b1b0f2e-5e0e-4d2d-9e0f-0d1f2f3a4b5c",
    "state": "running",
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "videoId": "dQw4w9WgXcQ",
    "title": "Example title",
    "mode": "video",
    "quality": "1080",
    "container": "mp4",
    "progress": 0.42,
    "receivedBytes": 18350080,
    "totalBytes": 43690552,
    "speed": "3.2MiB/s",
    "eta": "00:08",
    "outputPath": null,
    "error": null,
    "createdAt": "2026-11-15T09:00:00.000Z",
    "updatedAt": "2026-11-15T09:00:12.000Z"
  }
}
```

On completion `outputPath` is an absolute path inside the settings output
directory and `progress` is 1. On failure `error` is set:

```json
{ "code": "DOWNLOAD_FAILED", "message": "yt-dlp exited with code 1" }
```

Unknown ids return 404 with `NOT_FOUND`.

### POST /api/download/:id/cancel

Requires a token. Stops a queued or running job. A completed or failed job
returns 409 with `JOB_FINISHED`.

Success, 202:

```json
{ "ok": true, "job": { "id": "8b1b0f2e-5e0e-4d2d-9e0f-0d1f2f3a4b5c", "state": "cancelled" } }
```

Cancellation aborts every range worker, kills any yt-dlp or FFmpeg process
tree, removes the job temporary directory and keeps the job record for the UI.

### GET /api/settings

Requires a token.

```json
{
  "ok": true,
  "settings": {
    "outputDir": "C:\\Users\\Example\\Downloads\\YT SuperTool",
    "videoQuality": "1080",
    "videoContainer": "mp4",
    "audioFormat": "mp3",
    "audioQuality": 192,
    "concurrentDownloads": 1,
    "connections": 8,
    "speedLimitKbps": 0,
    "cookiesFromBrowser": null,
    "cookiesFile": null
  }
}
```

### PUT /api/settings

Requires a token. Accepts a partial object. Unknown keys are rejected.

```json
{ "videoQuality": "720", "audioFormat": "m4a" }
```

Success returns the full settings object. `outputDir` must be absolute, must not
be a filesystem root and must resolve inside the user's home directory.
`concurrentDownloads` is `1` or `2`. `connections` is an integer from `1` to
`32` and sets parallel range requests per stream. `speedLimitKbps` is an integer
from `0` to `1048576`; `0` means no limit.
`cookiesFromBrowser` accepts `null` or one of `chrome`, `chromium`, `edge`,
`brave`, `firefox`, `opera`, `vivaldi`. The setting stores only the browser
name. yt-dlp reads the cookie store directly, and the API never returns a
cookie value.

`cookiesFile` accepts `null` or an absolute path inside the user home to a
Netscape cookies.txt file. The file must be a regular file, no larger than
5 MB, and start with `# Netscape HTTP Cookie File` or `# HTTP Cookie File`.
The companion stores only the path and passes `--cookies <path>` to yt-dlp.
It never reads the cookie values into the API response. A settings patch
cannot set both sources; setting one clears the other.

## Error envelope

Every non-2xx response uses:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_URL",
    "message": "Only YouTube watch, Shorts, live and youtu.be URLs are supported."
  }
}
```

Messages are safe to display. They contain no file paths outside the settings
directory and no token values.

## Status code summary

| Status | Use |
|---|---|
| 200 | Successful read or update |
| 202 | Job accepted or cancellation accepted |
| 400 | Malformed request or invalid value |
| 401 | Missing or invalid token, or invalid pairing code |
| 403 | Origin or Host rejected |
| 404 | Unknown route or job id |
| 409 | Conflicting job or finished job |
| 410 | Pairing code expired |
| 413 | Body too large |
| 422 | yt-dlp could not analyze the video |
| 429 | Rate limited |
| 500 | Unexpected internal error |
| 503 | Binary or output directory unavailable |
| 504 | Analyze timeout |

## Versioning

`apiVersion` changes only for breaking request or response changes. Additive
fields do not change it. The client sends its own version for diagnostics and
refuses to start when the companion reports an incompatible API version.
