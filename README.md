# YT SuperTool

[Tiếng Việt](#vi) | [English](#en) | [Donate](#donate)

<a name="vi"></a>
## Tiếng Việt

YT SuperTool là bộ công cụ YouTube tất cả trong một. Tool có bộ chặn quảng cáo ba lớp tùy chọn, dọn feed, khôi phục số dislike và thêm điều khiển trình phát. Một mã nguồn lõi build ra userscript và extension Manifest V2 hoặc Manifest V3.

[Bản phát hành](https://github.com/CheemsGalaxy/YT-SuperTool/releases) | [Issues](https://github.com/CheemsGalaxy/YT-SuperTool/issues) | [Discord](https://discord.gg/n7JTT7ssNR) | [YouTube](https://www.youtube.com/@cheemsnogy)

Phiên bản hiện tại: 2.3.0

### Nền tảng

| Nền tảng | Gói | Chạy trên |
|---|---|---|
| Userscript | `yt-supertool.user.js` | Tampermonkey, Violentmonkey |
| Extension MV3 | `yt-supertool-mv3.zip` | Chrome, Edge, trình duyệt Chromium khác |
| Extension MV2 | `yt-supertool-mv2.zip` | Firefox 109 trở lên |

### Tính năng chính

| Tính năng | Hành vi | Mặc định |
|---|---|---|
| Chặn quảng cáo | Ba lớp tùy chọn: JSON prune, cosmetic CSS và auto-skip. | Tắt |
| Ẩn Shorts | Xóa kệ Shorts, tab và thẻ trong feed. | Bật |
| Dọn trang chủ | Ẩn promo, khảo sát, Playables và kệ live. | Bật |
| Khôi phục dislike | Hiển thị số dislike ước tính từ API Return YouTube Dislike. | Bật |
| SponsorBlock | Bỏ qua đoạn sponsor, self-promo và nhắc tương tác do cộng đồng gửi. | Bật |
| Tự động xem tiếp | Đóng hộp thoại "Video paused. Continue watching?". | Bật |
| Tốc độ phát | Thêm thanh tốc độ, preset và phím tắt `<` / `>`. | Bật |
| Picture in picture | Mở video hiện tại trong cửa sổ nổi. | Bật |
| Chụp màn hình | Lưu khung hình hiện tại thành PNG. | Bật |
| Tải video | Tải MP4 hoặc MP3 ngay trên trang xem, cạnh nút Like và Share. | Bật |

#### Các lớp chặn quảng cáo

Chặn quảng cáo mặc định sẽ tắt vì YouTube thay đổi cách phát quảng cáo và cách phát hiện adblock thường xuyên. Các lớp có sẵn có thể ngừng hoạt động, làm hỏng phát lại hoặc kích hoạt phản hồi chống adblock. Để dùng hàng ngày, cài [uBlock Origin](https://ublockorigin.com/) trên Firefox hoặc [uBlock Origin Lite](https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh) trên Chrome và Edge. Chỉ bật các lớp có sẵn nếu bạn chấp nhận rủi ro bảo trì này.

Các lớp trong trang không xóa dữ liệu quảng cáo khỏi phản hồi trình phát. Tool đổi tên khóa `adPlacements`, `playerAds`, `adSlots` và `adBreakHeartbeatParams` trong JSON, tắt cờ dò adblock của trình phát, rồi gỡ modal cảnh báo nếu nó vẫn hiện. Cách này ít phụ thuộc tên nút và selector quảng cáo, nên cần bảo trì ít hơn.

1. **JSON prune.** Xóa `adPlacements`, `playerAds`, `adSlots` và `adBreakHeartbeatParams` khỏi phản hồi trình phát trước khi YouTube đọc. Lớp này chạy trong main world tại `document-start`.
2. **Cosmetic CSS.** Ẩn slot quảng cáo trong feed, masthead, sidebar và trình phát. Quy tắc chỉ áp dụng khi công tắc tổng và lớp cosmetic cùng bật.
3. **Auto-skip.** Tắt tiếng quảng cáo lọt vào trình phát, bấm nút bỏ qua và tua đến cuối. Lớp này khôi phục trạng thái tắt tiếng và tốc độ phát trước đó sau quảng cáo.

Bản extension thêm lớp mạng. MV3 dùng quy tắc `declarativeNetRequest`, MV2 dùng chặn `webRequest`. Userscript vá `fetch` và `XMLHttpRequest` trong trang. Các bộ lọc này chạy trước ba lớp trong trang.

#### Giao diện

Cài đặt mở trong panel Shadow DOM. Panel theo theme trang qua thuộc tính dark và light của YouTube, màu nền trang và `prefers-color-scheme`. Toàn bộ CSS và icon SVG nằm trong bundle. UI không gọi CDN hay font bên ngoài.

#### Tải video và audio

Nút **Download** nằm cạnh hàng nút Like, Share và Save trên trang xem. Menu tách làm hai nhóm: một mục tải trực tiếp và các mục chuyển sang dịch vụ ngoài.

- **MP4 360p tải trực tiếp.** Tool lấy luồng progressive trong `streamingData.formats` (đã có sẵn cả hình lẫn tiếng) rồi lưu thẳng file về máy, không qua server trung gian, không cần ghép luồng.
- **MP4/MP3 chất lượng cao.** Một nút duy nhất: sao chép URL video đang xem vào clipboard, hiện thông báo "Link copied", rồi mở tab mới tới [ytmp3pc.com](https://ytmp3pc.com/). Bạn dán link vừa copy vào đó để chọn độ phân giải hoặc MP3.
- **Không giải mã chữ ký.** Tool không chạy player JS, không `eval`/`new Function`, không xử lý n-parameter, nên hợp lệ với CSP của Manifest V3.
- **Link hết hạn.** Link tải của YouTube có hạn dùng. Nếu báo lỗi 403 hoặc 410, mở lại menu để lấy link mới.
- **Hủy.** Thẻ tiến trình có nút Cancel. Chuyển video hoặc tắt tính năng cũng hủy tác vụ đang chạy.

Chỉ luồng progressive 360p đi qua tool; mọi định dạng khác do ytmp3pc.com xử lý trong tab mới.

### Kiến trúc

YT SuperTool dùng một lõi và ba target build.

| Lớp | Đường dẫn | Vai trò |
|---|---|---|
| Core | `src/core/` | Logic tính năng, cài đặt, vòng đời SPA và UI. Không gọi API của host. |
| Adapters | `src/adapters/` | API lưu trữ, mạng, inject style và tab cho userscript và extension. |
| Entries | `src/entries/` | Entry point cho userscript, content script, main world script, background worker và popup. |
| Manifests | `src/manifests/` | Phần manifest dùng chung, MV2 và MV3. |
| Rules | `src/rules/` | Bộ quy tắc `declarativeNetRequest` cho MV3. |
| Build | `scripts/` | Bundle, ghép manifest, tạo archive và xác minh. |

Vite build một IIFE cho mỗi entry target với `__TARGET__` đặt lúc build. MV2 không chạy được content script trong main world, nên `content.entry.js` inject `main-world.js` từ `web_accessible_resources` tại document-start. MV3 khai báo cùng file với `"world": "MAIN"`.

### Cài đặt

#### Cách 1: Userscript

1. Cài [Tampermonkey](https://www.tampermonkey.net/) hoặc [Violentmonkey](https://violentmonkey.github.io/).
2. Mở [yt-supertool.user.js](https://github.com/CheemsGalaxy/YT-SuperTool/releases/latest/download/yt-supertool.user.js), hoặc kéo file đã tải vào dashboard Tampermonkey hoặc Violentmonkey. Trình quản lý userscript mở màn hình cài đặt.
3. Xem quyền được yêu cầu và xác nhận cài.
4. Mở YouTube. Nút YT SuperTool xuất hiện ở header.

Nếu bản phát hành mới nhất không có asset userscript, build từ source và cài `dist/userscript/yt-supertool.user.js`.

#### Cách 2: Extension trình duyệt

Tải gói cho trình duyệt từ [bản phát hành mới nhất](https://github.com/CheemsGalaxy/YT-SuperTool/releases/latest):

| Trình duyệt | Gói | Trang quản lý |
|---|---|---|
| Chrome | `yt-supertool-mv3.zip` | `chrome://extensions` |
| Edge | `yt-supertool-mv3.zip` | `edge://extensions` |
| Firefox | `yt-supertool-mv2.zip` | `about:debugging#/runtime/this-firefox` |

Nếu bản phát hành mới nhất không có gói cho trình duyệt của bạn, build từ source. Build ghi cả ba target vào `dist/`.

##### Chrome và Edge

1. Giải nén zip vào thư mục cố định. Trình duyệt đọc extension từ thư mục này, nên không xóa sau khi cài.
2. Mở `chrome://extensions` hoặc `edge://extensions`.
3. Bật **Developer mode**.
4. Bấm **Load unpacked** và chọn thư mục đã giải nén.
5. Mở YouTube. Extension hoạt động và popup hiển thị cùng bộ cài đặt như panel userscript.

Chrome và Edge không còn tải extension Manifest V2. Dùng gói MV3 trên hai trình duyệt này.

##### Firefox

1. Giải nén `yt-supertool-mv2.zip` vào thư mục cố định.
2. Mở `about:debugging#/runtime/this-firefox`.
3. Bấm **Load Temporary Add-on**.
4. Chọn `manifest.json` trong thư mục đã giải nén.
5. Mở YouTube.

Firefox xóa add-on tạm khi đóng trình duyệt. Cài vĩnh viễn cần gói XPI đã ký.

Chrome và Edge hiện cảnh báo với extension cài ngoài Web Store. Cảnh báo này bình thường khi dùng **Load unpacked**.

Ad blocking vẫn tắt sau khi cài. Mở cài đặt YT SuperTool và chỉ bật nếu bạn muốn dùng các lớp có sẵn.

### Build từ mã nguồn

#### Yêu cầu

- Node.js 18 trở lên
- npm

#### Lệnh

```bash
git clone https://github.com/CheemsGalaxy/YT-SuperTool.git
cd YT-SuperTool
npm install
npm run build
```

| Lệnh | Tác dụng |
|---|---|
| `npm run build` | Build lại `dist/` với userscript, MV2, MV3 và cả hai file zip. |
| `npm run verify` | Kiểm tra manifest, bundle, lớp adblock, quy tắc UI và archive. |
| `npm run build:verify` | Chạy build rồi chạy xác minh. |

#### Kết quả build

| Đường dẫn | Nội dung |
|---|---|
| `dist/userscript/yt-supertool.user.js` | Bundle userscript kèm metadata block. |
| `dist/mv2/` | Extension MV2 chưa đóng gói. |
| `dist/mv3/` | Extension MV3 chưa đóng gói. |
| `dist/yt-supertool-mv2.zip` | Archive MV2 cho bản phát hành. |
| `dist/yt-supertool-mv3.zip` | Archive MV3 cho bản phát hành. |

`scripts/build-all.mjs` xóa `dist/`, bundle từng entry, copy popup, icon và rules, ghi manifest target, rồi tạo archive. `scripts/verify-build.mjs` kiểm tra output và từ chối lỗi build phổ biến, gồm lời gọi API host trong core và thiếu lớp adblock.

### Đóng góp

Mở issue cho bug hoặc yêu cầu tính năng. Pull request phải qua `npm run build:verify` trước khi review. Giữ thay đổi trong `src/core/` không gọi `GM_*`, `chrome.*` và `browser.*`; hành vi riêng của host thuộc `src/adapters/`.

### Tác giả và giấy phép

| Liên hệ | Link |
|---|---|
| Tác giả | [CheemsGalaxy](https://github.com/CheemsGalaxy) |
| YouTube | [@cheemsnogy](https://www.youtube.com/@cheemsnogy) |
| Discord | [Server cộng đồng](https://discord.gg/n7JTT7ssNR) |

Phát hành theo [MIT License](https://github.com/CheemsGalaxy/YT-SuperTool/blob/main/LICENSE).

Copyright (c) 2026 CheemsGalaxy.

Số dislike lấy từ API [Return YouTube Dislike](https://returnyoutubedislike.com/). Đoạn SponsorBlock lấy từ API [SponsorBlock](https://sponsor.ajay.app/). Mã hóa MP3 dùng [wasm-media-encoders](https://github.com/arseneyr/wasm-media-encoders) (MIT) với LAME (LGPL-2.0-only) biên dịch sang WebAssembly.

[Lên đầu trang](#yt-supertool) | [Chuyển sang English](#en)

---

<a name="en"></a>
## English

YT SuperTool is an all-in-one YouTube enhancer. It includes an optional three-layer ad blocker, removes feed clutter, restores the dislike count, and adds player controls. One core codebase builds a userscript and Manifest V2 or Manifest V3 extensions.

[Releases](https://github.com/CheemsGalaxy/YT-SuperTool/releases) | [Issues](https://github.com/CheemsGalaxy/YT-SuperTool/issues) | [Discord](https://discord.gg/n7JTT7ssNR) | [YouTube](https://www.youtube.com/@cheemsnogy)

Current version: 2.3.0

### Targets

| Target | Package | Runs in |
|---|---|---|
| Userscript | `yt-supertool.user.js` | Tampermonkey, Violentmonkey |
| Extension MV3 | `yt-supertool-mv3.zip` | Chrome, Edge, other Chromium browsers |
| Extension MV2 | `yt-supertool-mv2.zip` | Firefox 109 and newer |

### Key features

| Feature | Behavior | Default |
|---|---|---|
| Ad blocking | Optional three layers: JSON prune, cosmetic CSS, and auto-skip. | Off |
| Hide Shorts | Removes Shorts shelves, tabs, and feed cards. | On |
| Clean homepage | Hides promos, surveys, Playables, and live shelves. | On |
| Return dislike | Shows estimated dislike counts from the Return YouTube Dislike API. | On |
| SponsorBlock | Skips community-submitted sponsor, self-promo, and interaction segments. | On |
| Auto continue | Dismisses the "Video paused. Continue watching?" prompt. | On |
| Playback speed | Adds a speed slider, presets, and `<` / `>` shortcuts. | On |
| Picture in picture | Opens the current video in a floating window. | On |
| Screenshot | Saves the current video frame as PNG. | On |
| Downloader | Saves MP4 360p directly and routes other formats to ytmp3pc.com. | On |

#### Ad blocking layers

Ad blocking is off by default. YouTube changes ad delivery and ad-block detection often. The built-in layers can stop working, break playback, or trigger anti-adblock responses. For daily use, install [uBlock Origin](https://ublockorigin.com/) on Firefox or [uBlock Origin Lite](https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh) on Chrome and Edge. Enable the built-in layers only if you accept that maintenance risk.

The in-page layers do not delete ad data from player responses. The tool renames the `adPlacements`, `playerAds`, `adSlots`, and `adBreakHeartbeatParams` keys in the JSON, clears the player's adblock detection flags, and removes the warning modal if it still appears. This depends less on button names and ad selectors, so it needs less maintenance.

1. **JSON prune.** Removes `adPlacements`, `playerAds`, `adSlots`, and `adBreakHeartbeatParams` from player responses before YouTube reads them. It runs in the main world at `document-start`.
2. **Cosmetic CSS.** Hides feed, masthead, sidebar, and player ad slots. The rules apply only when the master switch and the cosmetic layer are on.
3. **Auto-skip.** Mutes an ad that reaches the player, clicks the skip button, and seeks to the end. It restores the previous mute state and playback speed after the ad.

Extension builds add a network layer. MV3 uses `declarativeNetRequest` rules, and MV2 uses `webRequest` blocking. The userscript patches `fetch` and `XMLHttpRequest` in the page. These filters run before the three in-page layers.

#### Interface

Settings open in a Shadow DOM panel. The panel follows the page theme through YouTube's dark and light attributes, the page background, and `prefers-color-scheme`. All CSS and SVG icons ship in the bundle. The UI makes no external CDN or font request.

#### Video and audio downloads

The **Download** button sits in the Like, Share, and Save row on watch pages. Its menu has two groups: one direct download and the formats that continue elsewhere.

- **Direct MP4 360p.** The tool takes the progressive stream from `streamingData.formats`, which already carries video and audio, and saves it straight to disk. No proxy server, no remuxing.
- **High quality MP4/MP3.** A single entry copies the current video URL to the clipboard, shows a "Link copied" toast, then opens [ytmp3pc.com](https://ytmp3pc.com/) in a new tab. Paste the link there to pick a resolution or MP3.
- **No signature solving.** The tool never runs player JavaScript, never calls `eval`/`new Function` and never touches the n-parameter, so it stays inside the Manifest V3 CSP.
- **Expired links.** YouTube download links expire. If a request answers 403 or 410, open the menu again for a fresh link.
- **Cancel.** The progress card has a Cancel button. Changing videos or turning the feature off also aborts the active job.

Only the progressive 360p stream goes through the extension; everything else is handled by ytmp3pc.com in a new tab.

### Architecture

YT SuperTool uses one core and three build targets.

| Layer | Path | Role |
|---|---|---|
| Core | `src/core/` | Feature logic, settings, SPA lifecycle, and UI. No host API calls. |
| Adapters | `src/adapters/` | Storage, network, style injection, and tab APIs for userscript and extension hosts. |
| Entries | `src/entries/` | Per-target entry points for the userscript, content script, main world script, background worker, and popup. |
| Manifests | `src/manifests/` | Shared, MV2, and MV3 manifest fragments. |
| Rules | `src/rules/` | MV3 `declarativeNetRequest` ruleset. |
| Build | `scripts/` | Bundle, manifest assembly, archive creation, and verification. |

Vite builds one IIFE per target entry with `__TARGET__` set at build time. MV2 cannot run a content script in the main world, so `content.entry.js` injects `main-world.js` from `web_accessible_resources` at document-start. MV3 declares the same file with `"world": "MAIN"`.

### Installation

#### Option 1: Userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open [yt-supertool.user.js](https://github.com/CheemsGalaxy/YT-SuperTool/releases/latest/download/yt-supertool.user.js), or drag the downloaded file into the Tampermonkey or Violentmonkey dashboard. The userscript manager opens its install screen.
3. Review the requested permissions and confirm the install.
4. Open YouTube. The YT SuperTool button appears in the header.

If the latest release does not contain the userscript asset, build it from source and install `dist/userscript/yt-supertool.user.js`.

#### Option 2: Browser extension

Download the package for your browser from the [latest release](https://github.com/CheemsGalaxy/YT-SuperTool/releases/latest):

| Browser | Package | Management page |
|---|---|---|
| Chrome | `yt-supertool-mv3.zip` | `chrome://extensions` |
| Edge | `yt-supertool-mv3.zip` | `edge://extensions` |
| Firefox | `yt-supertool-mv2.zip` | `about:debugging#/runtime/this-firefox` |

If the latest release does not contain the package for your browser, build it from source. The build writes all three targets to `dist/`.

##### Chrome and Edge

1. Extract the zip to a permanent folder. The browser reads the extension from this folder, so do not delete it after installation.
2. Open `chrome://extensions` or `edge://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the extracted folder.
5. Open YouTube. The extension is active, and its popup exposes the same settings as the userscript panel.

Chrome and Edge no longer load Manifest V2 extensions. Use the MV3 package on those browsers.

##### Firefox

1. Extract `yt-supertool-mv2.zip` to a permanent folder.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on**.
4. Select `manifest.json` inside the extracted folder.
5. Open YouTube.

Firefox removes temporary add-ons when the browser closes. A permanent install needs a signed XPI package.

Chrome and Edge show a warning for extensions installed outside the Web Store. This is expected with **Load unpacked**.

Ad blocking stays off after installation. Open the YT SuperTool settings and enable it only if you want the built-in layers.

### Build from source

#### Requirements

- Node.js 18 or newer
- npm

#### Commands

```bash
git clone https://github.com/CheemsGalaxy/YT-SuperTool.git
cd YT-SuperTool
npm install
npm run build
```

| Command | Action |
|---|---|
| `npm run build` | Rebuild `dist/` with the userscript, MV2, MV3, and both zip archives. |
| `npm run verify` | Check manifests, bundles, adblock layers, UI rules, and archives. |
| `npm run build:verify` | Run the build, then run verification. |

#### Build output

| Path | Contents |
|---|---|
| `dist/userscript/yt-supertool.user.js` | Userscript bundle with its metadata block. |
| `dist/mv2/` | Unpacked MV2 extension. |
| `dist/mv3/` | Unpacked MV3 extension. |
| `dist/yt-supertool-mv2.zip` | MV2 archive for release. |
| `dist/yt-supertool-mv3.zip` | MV3 archive for release. |

`scripts/build-all.mjs` removes `dist/`, bundles each entry, copies the popup, icons, and rules, writes the target manifest, and creates the archives. `scripts/verify-build.mjs` checks the output and rejects common build mistakes, including host API calls in the core and missing adblock layers.

### Contributing

Open an issue for bugs or feature requests. Pull requests should pass `npm run build:verify` before review. Keep changes inside `src/core/` free of `GM_*`, `chrome.*`, and `browser.*` calls; host-specific behavior belongs in `src/adapters/`.

### Author and license

| Contact | Link |
|---|---|
| Author | [CheemsGalaxy](https://github.com/CheemsGalaxy) |
| YouTube | [@cheemsnogy](https://www.youtube.com/@cheemsnogy) |
| Discord | [Community server](https://discord.gg/n7JTT7ssNR) |

Released under the [MIT License](https://github.com/CheemsGalaxy/YT-SuperTool/blob/main/LICENSE).

Copyright (c) 2026 CheemsGalaxy.

Dislike counts come from the [Return YouTube Dislike](https://returnyoutubedislike.com/) API. SponsorBlock segments come from the [SponsorBlock](https://sponsor.ajay.app/) API. MP3 encoding uses [wasm-media-encoders](https://github.com/arseneyr/wasm-media-encoders) (MIT) with LAME (LGPL-2.0-only) compiled to WebAssembly.

---

<a name="donate"></a>

<div align="center">

### ☕ Support This Project - Ủng hộ dự án 💌 - Donate:

[![Donate MoMo](https://img.shields.io/badge/Donate-MoMo-pink?style=for-the-badge&logo=momo&logoColor=white)](https://me.momo.vn/chimchimkl28)

<img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=https://me.momo.vn/chimchimkl28" alt="MoMo QR Code" width="180"/>

</div>

[Back to top](#yt-supertool) | [Tiếng Việt](#vi) | [English](#en)
