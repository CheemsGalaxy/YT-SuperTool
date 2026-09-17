(function () {
  const CAMERA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.5h3l1.4-2h5.2l1.4 2h3A2 2 0 0 1 21 9.5v8A2 2 0 0 1 19 19.5H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13.5" r="3.25"/></svg>';

  function ensureControlStyles() {
    if (document.querySelector('style[data-yt-supertool="player-controls"]')) return;
    const style = document.createElement('style');
    style.dataset.ytSupertool = 'player-controls';
    style.textContent = `
      .ytp-right-controls .yt-supertool-control {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex: 0 0 auto !important;
        margin: 0 !important;
        padding: 8px !important;
        border: 0 !important;
        background: transparent !important;
        color: inherit !important;
        cursor: pointer !important;
        vertical-align: middle !important;
        box-sizing: border-box !important;
        position: relative !important;
        top: 0 !important;
        transform: none !important;
        width: 40px !important;
        height: 40px !important;
        border-radius: 50% !important;
        transition: background-color 0.1s ease !important;
      }
      .ytp-right-controls .yt-supertool-control:hover {
        background: rgba(255, 255, 255, 0.1) !important;
        border-radius: 50% !important;
      }
      .ytp-right-controls .yt-supertool-control:active {
        background: rgba(255, 255, 255, 0.15) !important;
        border-radius: 50% !important;
      }
      .ytp-right-controls .yt-supertool-control.is-active { color: #3ea6ff !important; }
      .ytp-right-controls .yt-supertool-control svg {
        display: block !important;
        width: 24px !important;
        height: 24px !important;
        margin: 0 !important;
        padding: 0 !important;
        fill: none !important;
        stroke: currentColor !important;
        stroke-width: 1.8 !important;
        stroke-linecap: round !important;
        stroke-linejoin: round !important;
        pointer-events: none !important;
      }
      @media (max-width: 768px) {
        .ytp-right-controls .yt-supertool-control {
          width: 36px !important;
          height: 36px !important;
          padding: 6px !important;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .ytp-right-controls .yt-supertool-control { transition: none !important; }
      }
    `;
    document.head.append(style);
  }

  function alignWithNative(button) {
    const native = document.querySelector('.ytp-settings-button')
      || document.querySelector('.ytp-fullscreen-button')
      || document.querySelector('.ytp-right-controls .ytp-button');
    if (!native || !button) return;
    const computed = getComputedStyle(native);
    button.style.width = computed.width;
    button.style.height = computed.height;
    button.style.padding = computed.padding;
    button.style.margin = computed.margin;
    button.style.display = computed.display;
    button.style.alignItems = computed.alignItems;
    button.style.justifyContent = computed.justifyContent;
    button.style.borderRadius = '50%';
    button.style.boxSizing = 'border-box';
  }

  function getInsertAnchor(controls) {
    const subtitlesButton = controls.querySelector('.ytp-subtitles-button');
    if (subtitlesButton) return subtitlesButton;

    const settingsButton = controls.querySelector('.ytp-settings-button');
    if (settingsButton) return settingsButton;

    return controls.querySelector('.ytp-fullscreen-button') || null;
  }

  function insertBeforeSettings(controls, button) {
    const anchor = getInsertAnchor(controls);
    if (anchor) anchor.insertAdjacentElement('beforebegin', button);
    else controls.prepend(button);
  }

  function initScreenshot(player) {
    const controls = player?.querySelector('.ytp-right-controls');
    if (!controls || controls.querySelector('[data-yt-supertool="screenshot"]')) return;
    ensureControlStyles();
    const button = document.createElement('button');
    button.className = 'ytp-button yt-supertool-control';
    button.dataset.ytSupertool = 'screenshot';
    button.title = 'Take screenshot';
    button.setAttribute('aria-label', 'Take screenshot');
    button.innerHTML = CAMERA_ICON;
    button.onclick = () => { const video = player.querySelector('video'); if (!video || !video.videoWidth) return; const maxDimension = 1920; const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale)); try { canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height); const link = document.createElement('a'); link.download = `youtube-${Date.now()}.png`; link.href = canvas.toDataURL('image/png'); link.click(); } catch (error) { console.warn('YT SuperTool screenshot blocked by CORS:', error); } finally { canvas.width = 1; canvas.height = 1; } };
    alignWithNative(button);
    insertBeforeSettings(controls, button);
  }
  function stopScreenshot() {
    document.querySelectorAll('[data-yt-supertool="screenshot"]').forEach(button => button.remove());
  }

  window.YTSuperTool = window.YTSuperTool || {};
  window.YTSuperTool.ensureControlStyles = ensureControlStyles;
  window.YTSuperTool.alignWithNative = alignWithNative;
  window.YTSuperTool.getInsertAnchor = getInsertAnchor;
  window.YTSuperTool.screenshot = { initScreenshot, stopScreenshot };
})();
