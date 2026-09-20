🇬🇧 [English](#-english) | 🇻🇳 [Tiếng Việt](#-tiếng-việt)

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-100%2B-green)
![Manifest](https://img.shields.io/badge/Manifest-V3-orange)
![License](https://img.shields.io/badge/License-MIT-yellow)

<div align="center">

### ☕ Support This Project

[![Donate MoMo](https://img.shields.io/badge/Donate-MoMo-pink?style=for-the-badge&logo=momo&logoColor=white)](https://me.momo.vn/chimchimkl28)

<img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=https://me.momo.vn/chimchimkl28" alt="MoMo QR Code" width="180"/>

</div>

---

# 🇻🇳 Tiếng Việt

## 📑 Mục lục

- [Giới thiệu](#-giới-thiệu)
- [Tính năng](#-tính-năng)
- [Hướng dẫn cài đặt](#-hướng-dẫn-cài-đặt)
- [Không cài được?](#-không-cài-được)
- [Bộ công cụ gợi ý](#-bộ-công-cụ-gợi-ý)
- [Đóng góp & Liên hệ](#-đóng-góp--liên-hệ)
- [Lịch sử cập nhật](#-lịch-sử-cập-nhật)

## 🛠 Giới thiệu

**YT SuperTool** là một công cụ giúp nâng cao trải nghiệm sử dụng **YouTube**, cung cấp một số tính năng và công cụ hữu ích đang chờ bạn khám phá. Đặc biệt, xin cảm ơn **[Return YouTube Dislike](https://returnyoutubedislike.com/)** đã cung cấp API miễn phí cho tính năng hiển thị số lượt dislike.

## ✨ Tính năng

- **No Shorts** — Ẩn Shorts khỏi sidebar, trang chủ và kết quả tìm kiếm.
- **Clean Homepage** — Ẩn Playables, Movies & TV, Gaming, Live, Premium banner và inline survey.
- **Return Dislike** — Hiển thị số dislike ước tính từ Return YouTube Dislike API.
- **Auto Continue** — Tự động đóng popup "Video paused. Continue watching?".
- **Playback Speed** — Thêm thanh điều khiển tốc độ (0.25x–10x) với slider và preset chip.
- **Picture in Picture** — Nút PiP trên thanh player.
- **Screenshot** — Chụp frame hiện tại thành PNG.
- **Downloader** — Mở tab dịch vụ tải video bên thứ ba.

## 📌 Hướng dẫn cài đặt

Do chính sách mới của Google đối với tiện ích mở rộng Chrome, việc cài đặt trực tiếp file `.crx` theo cách thông thường không còn được hỗ trợ như trước.

Hiện tại, vì **YT SuperTool chưa được phát hành trên Chrome Web Store**, bạn có thể cài đặt bằng **1 trong 2 cách** dưới đây.

> ⚠️ **Lưu ý:** Đây là giải pháp tạm thời để sử dụng YT SuperTool trong thời gian tiện ích chưa có mặt trên Chrome Web Store. Mình xin lỗi vì sự bất tiện này và sẽ cố gắng đưa tiện ích lên Chrome Web Store trong thời gian tới.

---

### 🔧 Cách 1: Cài qua file `.crx` (dùng CRXLauncher)

**Bước 1: Cài CRXLauncher**

Mở link bên dưới → nhấn **Add to Chrome** → **Add extension**.

[CRXLauncher – Chrome Web Store](https://chromewebstore.google.com/detail/crxlauncher/kiilhncajadbgbmdbdcopdpnmdhlbdle?utm)

**Bước 2: Tải file cài đặt**

[YT.SuperTool.MV3.crx](https://github.com/CheemsGalaxy/YT-SuperTool/releases/download/Release/YT.SuperTool.MV3.crx)

**Bước 3: Mở Extensions**

Gõ `chrome://extensions/` vào thanh địa chỉ, hoặc menu ⋮ → **Extensions** → **Manage Extensions**. Chọn **CRXLauncher**.

**Bước 4: Chọn file**

Trong giao diện CRXLauncher, nhấn **Choose file** → chọn file `YT.SuperTool.MV3.crx` đã tải ở Bước 2.

**Bước 5: Cấp quyền**

Nhấn **Open** → **Allow permissions** → **Allow**.

> ⚠️ Chrome sẽ hiện cảnh báo đỏ *"not from any known source"* — đây là bình thường, nhấn **Allow** để tiếp tục.

🎉 **Hoàn tất!**

Từ bây giờ, bạn có thể mở **Extensions → CRXLauncher** để truy cập và sử dụng YT SuperTool.

---

### 🔧 Cách 2: Cài qua file `.zip` (Load unpacked)

Cách này không cần CRXLauncher, cài trực tiếp từ Chrome Extensions.

**Bước 1: Tải file cài đặt**

[YT.SuperTool.MV3.zip](https://github.com/CheemsGalaxy/YT-SuperTool/releases/download/Release/YT.SuperTool.MV3.zip)

**Bước 2: Giải nén file**

Giải nén file `.zip` ra một thư mục cố định (ví dụ: `Downloads/YT-SuperTool/`).

- **Windows:** Chuột phải file `.zip` → **Extract All**.
- **Mac:** Double-click file `.zip`.
- **Linux:** `unzip YT.SuperTool.MV3.zip`.

> ⚠️ **Quan trọng:** Không xóa thư mục này sau khi cài — Chrome sẽ đọc trực tiếp từ đây. Nếu xóa, extension sẽ ngừng hoạt động.

**Bước 3: Mở Extensions**

Gõ `chrome://extensions/` vào thanh địa chỉ, hoặc menu ⋮ → **Extensions** → **Manage Extensions**.

**Bước 4: Bật Developer Mode**

Gạt công tắc **Developer mode** ở góc trên bên phải.

**Bước 5: Load unpacked**

Nhấn **Load unpacked** → chọn thư mục bạn đã giải nén ở Bước 2.

**Bước 6: Xác nhận**

Extension YT SuperTool sẽ xuất hiện trong danh sách. Chrome có thể hiện cảnh báo — đây là bình thường khi cài extension từ nguồn ngoài.

🎉 **Hoàn tất!**

---

### ❓ Không cài được?

**Lỗi "CRX_HEADER_INVALID":**
Chrome đã chặn file `.crx`. Dùng **Cách 2** (Load unpacked từ file `.zip`).

**Extension bị tắt sau khi cài:**
Vào `chrome://extensions/`, gạt toggle của YT SuperTool sang phải để bật.

**Popup bị thừa to:**
Đây là bug của CRXLauncher (không phải extension). Dùng **Cách 2** (Load unpacked).

**Extension tự tắt sau khi tắt Chrome:**
Với **Cách 2**, Chrome sẽ cảnh báo extension từ nguồn ngoài mỗi lần khởi động — nhấn **Keep** để giữ.

## 🎯 Bộ công cụ gợi ý

Để có trải nghiệm YouTube tốt nhất, mình gợi ý cài thêm 2 extension sau bên cạnh **YT SuperTool**:

| Extension | Chức năng | Link |
|---|---|---|
| **uBlock Origin Lite** | Chặn quảng cáo YouTube hiệu quả nhất hiện nay | [Chrome Web Store](https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh) |
| **SponsorBlock** | Tự động bỏ qua sponsor, intro, outro, tự quảng cáo trong video | [Chrome Web Store](https://chromewebstore.google.com/detail/sponsorblock-for-youtube/mnjggcdmjocbbbhaepdhchncahnbgone) |

**Tại sao không tích hợp vào YT SuperTool?**
- **uBO Lite** là extension chuyên dụng về adblock, được duy trì bởi đội ngũ uBlock Origin. Tích hợp vào YT SuperTool sẽ trùng lặp và kém hiệu quả hơn.
- **SponsorBlock** cần server cộng đồng để vote timestamp — không thể tự làm trong extension nhỏ.

## 💡 Đóng góp & Liên hệ

Bạn có thể hỗ trợ dự án bằng cách:

* 🐛 Báo cáo lỗi hoặc các vấn đề bạn gặp phải.
* 💡 Gửi phản hồi và đề xuất tính năng mới.
* ⭐ Ủng hộ dự án bằng cách đánh giá hoặc chia sẻ dự án.

### 📬 Liên hệ

Nếu cần hỗ trợ hoặc muốn trao đổi trực tiếp, bạn có thể tham gia Discord:

[Tham gia Discord](https://discord.gg/EZx5UWd7CX?utm)

## 📝 Lịch sử cập nhật

### v2.0.0 — 14/09/2026
- ✨ Chuyển sang Manifest V3

### v1.0.0 — 01/09/2026
- 🎉 Phiên bản đầu tiên

---

[⬆️ **Back to top**](#)

---

# 🇬🇧 English

## 📑 Table of Contents

- [Introduction](#-introduction)
- [Features](#-features)
- [Installation](#-installation)
- [Can't install?](#-cant-install)
- [Recommended Setup](#-recommended-setup)
- [Contributing & Contact](#-contributing--contact)
- [Changelog](#-changelog)

## 🛠 Introduction

**YT SuperTool** is a tool that enhances your **YouTube** experience, providing a set of useful features and utilities waiting for you to explore. Special thanks to **[Return YouTube Dislike](https://returnyoutubedislike.com/)** for providing a free API for the dislike count feature.
## ✨ Features

- **No Shorts** — Hide Shorts from the sidebar, homepage, and search results.
- **Clean Homepage** — Hide Playables, Movies & TV, Gaming, Live, Premium banners, and inline surveys.
- **Return Dislike** — Show estimated dislike counts from the Return YouTube Dislike API.
- **Auto Continue** — Automatically dismiss the "Video paused. Continue watching?" popup.
- **Playback Speed** — Add speed controls (0.25x–10x) with slider and preset chips.
- **Picture in Picture** — PiP button on the player controls.
- **Screenshot** — Capture the current frame as PNG.
- **Downloader** — Open a third-party video download service in a new tab.

## 📌 Installation

Due to Google's new policy on Chrome extensions, installing a `.crx` file directly the usual way is no longer supported.

Currently, since **YT SuperTool has not been published on the Chrome Web Store**, you can install it using **one of the two methods** below.

> ⚠️ **Note:** This is a temporary solution while YT SuperTool is not yet available on the Chrome Web Store. Apologies for the inconvenience — I will try to bring the extension to the Chrome Web Store soon.

---

### 🔧 Method 1: Install via `.crx` file (CRXLauncher)

**Step 1: Install CRXLauncher**

Open the link below → click **Add to Chrome** → **Add extension**.

[CRXLauncher – Chrome Web Store](https://chromewebstore.google.com/detail/crxlauncher/kiilhncajadbgbmdbdcopdpnmdhlbdle?utm)

**Step 2: Download the installation file**

[YT.SuperTool.MV3.crx](https://github.com/CheemsGalaxy/YT-SuperTool/releases/download/Release/YT.SuperTool.MV3.crx)

**Step 3: Open Extensions**

Type `chrome://extensions/` in the address bar, or menu ⋮ → **Extensions** → **Manage Extensions**. Select **CRXLauncher**.

**Step 4: Choose file**

In CRXLauncher, click **Choose file** → select the `YT.SuperTool.MV3.crx` file downloaded in Step 2.

**Step 5: Grant permissions**

Click **Open** → **Allow permissions** → **Allow**.

> ⚠️ Chrome will show a red warning *"not from any known source"* — this is normal, click **Allow** to continue.

🎉 **Done!**

From now on, you can open **Extensions → CRXLauncher** to access and use YT SuperTool.

---

### 🔧 Method 2: Install via `.zip` file (Load unpacked)

This method doesn't require CRXLauncher. Install directly from Chrome Extensions.

**Step 1: Download the installation file**

[YT.SuperTool.MV3.zip](https://github.com/CheemsGalaxy/YT-SuperTool/releases/download/Release/YT.SuperTool.MV3.zip)

**Step 2: Extract the file**

Extract the `.zip` file to a **permanent folder** (e.g., `Downloads/YT-SuperTool/`).

- **Windows:** Right-click the `.zip` file → **Extract All**.
- **Mac:** Double-click the `.zip` file.
- **Linux:** `unzip YT.SuperTool.MV3.zip`.

> ⚠️ **Important:** Do not delete this folder after installation — Chrome reads directly from it. If deleted, the extension will stop working.

**Step 3: Open Extensions**

Type `chrome://extensions/` in the address bar, or menu ⋮ → **Extensions** → **Manage Extensions**.

**Step 4: Enable Developer Mode**

Toggle **Developer mode** in the top-right corner.

**Step 5: Load unpacked**

Click **Load unpacked** → select the folder you extracted in Step 2.

**Step 6: Confirm**

YT SuperTool will appear in the list. Chrome may show a warning — this is normal when installing from outside the Web Store.

🎉 **Done!**

---

### ❓ Can't install?

**Error "CRX_HEADER_INVALID":**
Chrome has blocked the `.crx` file. Use **Method 2** (Load unpacked from `.zip`).

**Extension is disabled after installation:**
Go to `chrome://extensions/`, toggle YT SuperTool to the right to enable it.

**Popup is oversized:**
This is a CRXLauncher bug (not the extension). Use **Method 2** (Load unpacked).

**Extension is disabled after restarting Chrome:**
With **Method 2**, Chrome warns about non-Web-Store extensions on every startup — click **Keep** to retain it.

## 🎯 Recommended Setup

For the best YouTube experience, we recommend installing these 2 extensions alongside **YT SuperTool**:

| Extension | Purpose | Link |
|---|---|---|
| **uBlock Origin Lite** | The most effective YouTube ad blocker available | [Chrome Web Store](https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh) |
| **SponsorBlock** | Automatically skip sponsors, intros, outros, and self-promos in videos | [Chrome Web Store](https://chromewebstore.google.com/detail/sponsorblock-for-youtube/mnjggcdmjocbbbhaepdhchncahnbgone) |

**Why not integrate them into YT SuperTool?**
- **uBO Lite** is a dedicated adblock extension maintained by the uBlock Origin team. Integrating it would be redundant and less effective.
- **SponsorBlock** requires a community server to vote timestamps — not feasible for a small extension.

## 💡 Contributing & Contact

You can support the project by:

* 🐛 Reporting bugs or issues you encounter.
* 💡 Sending feedback and feature suggestions.
* ⭐ Supporting the project by rating or sharing it.

### 📬 Contact

If you need support or want to chat directly, you can join Discord:

[Join Discord](https://discord.gg/EZx5UWd7CX?utm)

## 📝 Changelog

### v2.0.0 — 2026-09-14
- ✨ Migrated to Manifest V3

### v1.0.0 — 2026-09-01
- 🎉 Initial release

---

[⬆️ **Back to top**](#)
