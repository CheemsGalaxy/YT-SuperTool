# YT SuperTool privacy policy

Last updated: 17 November 2026

YT SuperTool is a Firefox extension that changes how YouTube pages look and behave. This policy covers the extension and the optional desktop companion. Settings stay on your device, and the developer does not collect or sell anything.

## Data the extension stores

The extension saves its settings in Firefox extension storage on your computer. This covers feature toggles, the time of the last update check, and the pairing token used for the companion. Removing the extension or clearing its storage deletes them.

## What leaves your device

The extension runs only on youtube.com. It reads the page to add controls and change the layout. Page content stays in the tab.

Three services receive requests while you use the extension:

- returnyoutubedislikeapi.com receives the video ID when the dislike counter is enabled.
- sponsor.ajay.app receives the video ID when SponsorBlock is enabled.
- raw.githubusercontent.com receives a request for a public version file once per day, to check for updates. It gets no personal data.

Each service has its own privacy policy. The developer of YT SuperTool does not receive or store these requests.

## Companion

The companion is a separate desktop program that you install yourself. It is optional and is not part of the extension package. It listens on 127.0.0.1 and accepts requests only with the pairing token stored by the extension. It receives the YouTube URL you choose to save and writes the file to a folder you select on your computer. It uploads nothing.

If you turn on browser cookies for the companion, which is off by default, yt-dlp reads YouTube cookies from the browser profile you select. The companion stores only the browser name in its settings file. Cookie values are read by yt-dlp from the browser store and are not copied into logs or settings. You can turn this off at any time with the companion's cookie setup and the off option.

## No tracking

The extension and the companion contain no analytics, telemetry, advertising, or crash reporting. The developer runs no server and receives no data from users. Data is not sold or shared for advertising.

## Children

The extension collects no personal data from anyone and is not directed at children.

## Changes

If this policy changes, the new version appears at this URL before the next release.

## Contact

Questions or reports: https://github.com/CheemsGalaxy/YT-SuperTool/issues
