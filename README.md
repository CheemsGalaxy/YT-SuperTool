# YT SuperTool

> Chrome Extension All-in-One tối ưu trải nghiệm YouTube — chặn quảng cáo, hiện dislike, ẩn Shorts, tăng tốc phát, PiP, chụp ảnh, tải video.

![Manifest](https://img.shields.io/badge/Manifest-V2-blue)
![Chrome](https://img.shields.io/badge/Chrome-100%2B-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ Tính năng

### 🚫 Chặn & Làm sạch
- **Adblock** — Chặn quảng cáo YouTube ở cả network (webRequest) và DOM (CSS hide). Ẩn banner, feed ads, sidebar ads, và popup chống adblock.
- **No Shorts** — Ẩn Shorts khỏi sidebar, trang chủ, kết quả tìm kiếm. Hoạt động cả desktop và mobile DOM.
- **Clean Homepage** — Ẩn Playables, Movies & TV, Gaming, Live, Premium banner và inline survey khỏi trang chủ.

### 📊 Cải thiện nội dung
- **Return Dislike** — Hiển thị số dislike ước tính từ [Return YouTube Dislike API](https://returnyoutubedislike.com/), chèn trực tiếp vào segmented pill `[👍 | 233K 👎]` giống UI YouTube native.
- **Auto Continue** — Tự động đóng popup "Video paused. Continue watching?" và resume video.

### 🎮 Điều khiển player
- **Playback Speed** — Thêm thanh điều khiển tốc độ (0.25x–10x) với slider + preset chip, đồng bộ với UI YouTube Material 3.
- **Picture in Picture** — Nút PiP trên thanh player, sử dụng API PiP native của trình duyệt.
- **Screenshot** — Chụp frame hiện tại thành PNG độ phân giải tối đa 1920px.
- **Downloader** — Mở tab dịch vụ tải video bên thứ ba (không bypass DRM).

---

## 📦 Cài đặt

### Cách 1 — Load unpacked (dev)
1. Clone hoặc tải repo này về máy.
2. Mở `chrome://extensions/`.
3. Bật **Developer mode** (góc phải trên).
4. Nhấn **Load unpacked**, chọn thư mục chứa `manifest.json`.
5. Icon extension xuất hiện trên toolbar Chrome.

### Cách 2 — Chrome Web Store
> *(đang chờ duyệt)*

---

## 🎯 Sử dụng

1. Mở YouTube.
2. Click icon **YT SuperTool** trên toolbar để mở popup.
3. Bật/tắt từng tính năng bằng toggle.
4. Settings lưu tự động vào `chrome.storage.local`.

### Phím tắt
- `>` — Tăng tốc phát 0.25x
- `<` — Giảm tốc phát 0.25x
- `Double-click slider` — Reset về 1x

---

## 🏗️ Kiến trúc

```
yt-supertool/
├── manifest.json
├── background/
│   └── background.js          # Adblock network + dislike API proxy
├── content/
│   ├── main.js                # Orchestrator — đọc settings, apply features
│   ├── observer.js            # MutationObserver chung, debounce
│   └── features/
│       ├── adblock.js         # CSS hide element quảng cáo
│       ├── dislike.js         # Fetch + render số dislike
│       ├── no-shorts.js       # Ẩn Shorts
│       ├── clean-homepage.js  # Ẩn shelf rác trang chủ
│       ├── nonstop.js         # Auto-continue
│       ├── speed.js           # Playback speed UI
│       ├── downloader.js      # Nút download
│       ├── pip.js             # Nút PiP
│       └── screenshot.js      # Nút screenshot
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js               # Toggle UI + storage
└── assets/
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

### Nguyên tắc thiết kế

- **Modular** — Mỗi feature là 1 file độc lập, export `initX/stopX/updateX` qua `window.YTSuperTool.<name>`.
- **Observer chung** — 1 `ObserverManager` duy nhất, debounce 300ms, tất cả feature đăng ký callback.
- **Lifecycle rõ ràng** — `main.js` đọc settings, apply/dừng từng feature khi user đổi toggle.
- **Không phá UI YouTube** — Nút custom style giống native, không đè lên control gốc.
- **Auto-recovery** — MutationObserver riêng cho từng feature, tự re-attach khi YouTube re-render.

---

## 🔧 Phát triển

### Yêu cầu
- Chrome 100+
- Không cần build tool — code ES6 chạy trực tiếp

### Workflow
1. Sửa file trong `content/features/`.
2. Vào `chrome://extensions/` → nhấn **Reload** ở extension.
3. Tab YouTube tự F5 (nhờ `chrome.runtime.onInstalled` listener trong background).
4. Debug qua DevTools Console — filter `[YT SuperTool]`.

### Thêm feature mới
1. Tạo `content/features/my-feature.js`:
   ```js
   (function () {
     window.YTSuperTool = window.YTSuperTool || {};
     window.YTSuperTool.myFeature = {
       initMyFeature(player) { /* ... */ },
       updateMyFeature(mutations) { /* ... */ },
       stopMyFeature() { /* ... */ }
     };
   })();
   ```
2. Thêm key vào `defaults` trong `main.js`.
3. Thêm toggle vào mảng `settings` trong `popup.js`.
4. Thêm file vào `content_scripts.js` trong `manifest.json`.
5. Reload extension.

---

## 🐛 Bug đã biết

- **Adblock không chặn được SSAI** — Server-Side Ad Insertion nhúng quảng cáo vào cùng stream video → không có request riêng để chặn. Đây là giới hạn của MV2 + webRequest.
- **Manifest V2 sẽ bị Chrome khai tử** — Cần port sang MV3 trong tương lai (chuyển webRequest → declarativeNetRequest, background persistent → service worker).

---

## 📄 License

MIT License — xem [LICENSE](LICENSE).

## 🙏 Credits

- Dislike data từ [Return YouTube Dislike](https://returnyoutubedislike.com/) — independent implementation, không copy source code.
- Icon và UI inspired by YouTube Material Design.

---

## 📮 Liên hệ

- **Issues**: [GitHub Issues](../../issues)
- **Pull requests**: Welcome!
```
