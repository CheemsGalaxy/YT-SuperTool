# YT SuperTool Companion on Windows

The companion is a separate desktop program. It runs beside the YT SuperTool
extension and handles the downloads that a browser cannot merge or convert.
Without it, the extension keeps using the direct MP4 stream and ytmp3pc.com.

The Windows x64 package is self-contained. It includes Node.js, yt-dlp and
FFmpeg, so you do not install those tools yourself. The installer needs no
administrator rights and creates no service or registry entry.

## Requirements

- Windows 10 or Windows 11, 64-bit.
- A user profile you can write to.
- Free disk space for the program and for the videos you download.
- One free loopback port, 47831 by default.

## Install

1. Download `yt-supertool-companion-1.0.0-win32-x64.zip`.
2. Check the SHA-256 against the `.sha256` file or the release notes.
3. Extract the folder `YT SuperTool Companion` to a temporary place.
4. Open the folder and run `Install YT SuperTool Companion.cmd`.

The installer checks the package checksums, copies the program to
`%LOCALAPPDATA%\YT SuperTool Companion`, adds a startup shortcut and five
desktop shortcuts, then starts the companion in the background.

On the first install it prints a pairing code:

```
Pairing code: ABCD-2345
```

The installer window stays open until you press a key. Leave the code visible
while you pair the extension.

The package is not code signed. If SmartScreen shows a warning, check that the
zip came from the expected source, then use "More info" and "Run anyway".

The installed folder must stay in place. The startup shortcut and the desktop
shortcuts point at it. If you move or delete the folder, run the installer
again.

## Pair with the extension

1. Open YouTube in the browser where YT SuperTool is installed.
2. Click the Download button next to Like and Share.
3. Type the eight-character code into the pairing field. The dash is optional.
4. Wait for the video and audio presets to appear.

The code works once and expires after ten minutes. The companion stores only a
hash of the token it gives the extension. Five failed attempts in a minute are
rate limited.

You pair once. The token stays in `%USERPROFILE%\.yt-super-tool` across
restarts, sign-ins and program updates. If you revoke the token or change the
data folder, print a new code with the **YT SuperTool - Pair browser** desktop
shortcut or the installed `install\pair.cmd`.

## Everyday use

Windows starts the companion in the background when you sign in. There is no
window to keep open. Open YouTube and the Download menu shows the companion
presets when the extension is paired.

The menu offers MP4 presets up to the highest height that yt-dlp reports for
the video, MP3 at 192 kbps, and M4A at the best available quality. yt-dlp only
resolves the format; the companion downloads each stream with parallel range
requests, then merges or converts with FFmpeg. The progress card shows percent,
speed, ETA and size. Cancel aborts every connection and removes the temporary
folder.

The desktop shortcuts do these jobs:

| Shortcut | Action |
|---|---|
| YT SuperTool - Pair browser | Print a fresh pairing code |
| YT SuperTool - Status | Show the process, pairing state and output folder |
| YT SuperTool - Browser cookies | Choose an optional YouTube cookie source, browser or cookies.txt |
| YT SuperTool - Open downloads | Open the download folder |
| YT SuperTool - Uninstall | Remove the program and its shortcuts |

YouTube cookies are off by default. Without them, age-restricted, members-only
and some private videos fail with a message that names the restriction. Region
locks are not bypassed.

## Download folder

The default folder is `%USERPROFILE%\Downloads\YT SuperTool`. To change it,
stop the companion and edit `outputDir` in
`%USERPROFILE%\.yt-super-tool\settings.json`. The path must be absolute and
inside your home folder. The next start uses the new folder.

For a one-off visible start with another folder, run this from the installed
folder:

```
"YT SuperTool Companion.cmd" --output-dir "%USERPROFILE%\Videos\YT SuperTool"
```

The companion accepts only folders inside the user home. It creates a hidden
`.ytst-tmp` folder there for partial files, then moves the finished file into
the output folder. An existing file is never overwritten. A name clash adds
` (1)`, ` (2)` and so on.

## Connections and speed limit

Downloads use parallel HTTP range requests instead of one yt-dlp stream. Each
stream is split into chunks and every connection pulls its own chunk. Two
settings control this in `%USERPROFILE%\.yt-super-tool\settings.json`:

| Key | Range | Default | Meaning |
|---|---|---|---|
| `connections` | Integer `1` to `32` | `8` | Parallel requests per stream |
| `speedLimitKbps` | Integer `0` to `1048576` | `0` | Total download limit in KB/s, `0` means unlimited |

Lower `connections` on a weak network or when YouTube throttles a single
client. A high value helps on fast links and can hurt on slow ones. The speed
limit applies across all connections of a job.

Stop the companion before you edit the file, then start it again. Invalid
values are ignored and the default is used. The API returns both values in
`GET /api/settings` and accepts them in `PUT /api/settings`.

## YouTube cookies (optional)

YouTube sometimes asks for a bot check or refuses an age-restricted video. The
companion can use the YouTube session from a browser on this machine to answer
that check. There are two sources: a browser store or a Netscape cookies.txt
file. They are mutually exclusive.

1. Sign in to YouTube in the browser you want to use.
2. Run the **YT SuperTool - Browser cookies** desktop shortcut, or
   `install\cookies.cmd` in the installed folder.
3. Choose the browser, or choose `file` and enter the path to a cookies.txt
   export.

The companion saves only the browser name or the file path in
`%USERPROFILE%\.yt-super-tool\settings.json` and restarts. For a browser it
passes `--cookies-from-browser <name>` to yt-dlp. For a file it passes
`--cookies <path>`. yt-dlp reads the source directly. The companion does not
store, log or send cookie values, and the extension never receives them. yt-dlp
uses them for its YouTube requests.

Supported browser names: `chrome`, `chromium`, `edge`, `brave`, `firefox`,
`opera` and `vivaldi`. Choose `off` to turn the setting off.

Edge, Chrome and Brave may lock the cookie database or protect it with
app-bound encryption. If the companion reports that it cannot read cookies,
close the browser and retry. Firefox usually allows reading while it is open.
If the browser still fails, use a cookies.txt file.

A cookies.txt file must be a Netscape export inside your home folder, for
example `%USERPROFILE%\Downloads\cookies.txt`. The companion rejects files
larger than 5 MB, files without the `# Netscape HTTP Cookie File` header, and
symbolic links. Create the export with a cookie tool you trust, keep the file
private, and delete it when you no longer need it. The file contains live
session cookies in plain text. The companion stores only its path and checks
the file again before every analyze and download.

Cookies help with content your account can already play, such as age-restricted
videos. They do not unlock private, members-only or region-locked content that
your account cannot access.

## Update

1. Download the new zip and check its SHA-256.
2. Extract it to a temporary place.
3. Run `Install YT SuperTool Companion.cmd` from the new folder.

The installer stops the running companion, replaces the program folder and
starts the new version. Active downloads stop when the old process exits.
`%USERPROFILE%\.yt-super-tool` stays untouched, so the pairing token and the
settings survive.

Read the release notes when the API version changes. The extension and the
companion must support the same API version.

## Uninstall

1. Use the **YT SuperTool - Uninstall** desktop shortcut, or run
   `install\uninstall.cmd` from the installed folder.
2. Confirm the removal.
3. Choose whether to delete `%USERPROFILE%\.yt-super-tool`.

The uninstaller stops the companion, removes the startup shortcut and the five
desktop shortcuts, then deletes the program folder. If you keep the data
folder, a later install can reuse the pairing token. Files already saved in the
output folder stay where they are.

## Manual start and checks

The installed folder has a visible launcher for debugging:

```
"YT SuperTool Companion.cmd"
```

It prints the startup state and the pairing code when needed. Keep that window
open while it runs. Close it to stop the companion.

Run the self-test from the installed folder:

```
"YT SuperTool Companion.cmd" --self-test
```

A healthy package prints seven `ok` lines and `SELF-TEST OK`.

The status shortcut runs the same checks as:

```
install\status.cmd
```

With the companion running:

```powershell
Invoke-RestMethod http://127.0.0.1:47831/api/health
```

The response reports the service name, API version, pairing state and the
detected yt-dlp and FFmpeg versions.

For extra detail in a visible session:

```
"YT SuperTool Companion.cmd" --debug
```

## Troubleshooting

| Symptom | What to check |
|---|---|
| Menu says "Companion not running" | Run the Status shortcut. If the process is stopped, run the Pair browser shortcut; it starts the companion again. Check that another program does not use port 47831. The extension always uses 47831. |
| Companion does not start after sign-in | Run the Status shortcut. Check that `YT SuperTool Companion.lnk` exists in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`. Run the installer again if the shortcut is missing. |
| Menu says "Companion not paired" after a restart | The token was revoked or the data folder changed. Run the Pair browser shortcut and enter the new code. |
| "Pairing code expired or was already used" | Run the Pair browser shortcut for a fresh code. |
| "Could not move ... Close any Explorer window that shows the folder" | An Explorer window or another program keeps a handle in the install folder. The installer closes Explorer windows it can find; close any remaining window, then run it again. |
| "Too many pairing attempts" | Wait one minute, then pair again. |
| "The output folder is not writable" | Pick a folder inside your home folder and grant your account write access. |
| "The output folder is out of free space" | Free disk space, then retry. |
| "The companion is missing yt-dlp or FFmpeg" | Antivirus may have quarantined a file from `app\bin\win32-x64`. Restore it, or run the installer again. |
| "YouTube refused this download (HTTP 403)" | The video may need a sign-in the companion does not support. The direct MP4 option can still work. |
| "YouTube asked for a bot check" | Sign in to YouTube in your browser, then run the Browser cookies shortcut and choose that browser. Retry the download. |
| "This video is age restricted" | Run the Browser cookies shortcut and choose a browser where you can play the video. |
| "The companion could not read cookies from Microsoft Edge" (or Chrome, Brave) | The browser keeps its cookie file open. Quit it completely, including background processes, then retry. If it still fails, use a cookies.txt file or choose Firefox. Firefox cookies work while Firefox is open. |
| "The companion could not decrypt cookies from ..." | The browser uses app-bound encryption that yt-dlp cannot open. Use a cookies.txt file exported from that browser, or choose Firefox. |
| "The companion could not read the cookie file" | Export YouTube cookies to a fresh Netscape cookies.txt file and choose it again. The file must start with `# Netscape HTTP Cookie File`. |
| "This video is for channel members only" | Membership content is not supported. |
| "The companion could not reach YouTube" | Check the network connection. The companion has no proxy setting. |
| FFmpeg uses a lot of CPU | Merging a high-resolution video takes CPU time. The job finishes when the merge ends. |
| Port 47831 is already in use | Stop the other process, then run the Pair browser shortcut. |
| SmartScreen blocks the installer | Verify the zip checksum first. The build is unsigned. |
| The installed folder was deleted or moved | Run the installer again from the package. It recreates the shortcuts and the program folder. |

## Security notes

- The server binds `127.0.0.1` only. Other devices on the network cannot reach
  it.
- Every private route needs `X-YTST-Token`. The Origin allowlist and the Host
  check run before the token check.
- The companion accepts YouTube video URLs only. It rejects playlists, channels
  and other hosts before it starts a process.
- It runs yt-dlp with an argument array, `--ignore-config`, `--no-exec` and
  `--no-playlist`.
- It does not bypass DRM, paywalls, authentication or region locks.
- YouTube cookies are opt-in. The companion stores only an allowlisted
  browser name or a cookies.txt path inside the user home. It stores no cookie
  value.
- The output folder must stay inside the user home, and jobs write to a
  per-job temporary folder first.
- The installer verifies every packaged file against
  `package-manifest.json`. It needs no administrator rights, installs no
  service and writes no registry value. It adds one startup shortcut and five
  desktop shortcuts.

The full control list is in `../docs/SECURITY.md`. The failure matrix is in
`TEST_MATRIX.md`.
