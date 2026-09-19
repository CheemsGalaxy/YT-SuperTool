(function () {
  window.YTSuperTool = window.YTSuperTool || {};

  function injectStyles() {
    if (document.querySelector('style[data-yt-supertool="styles"]')) return true;
    const head = document.head || document.documentElement;
    if (!head) return false;
    const style = document.createElement('style');
    style.dataset.ytSupertool = 'styles';
    style.textContent = `
      [data-yt-supertool="speed"] {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        align-self: center !important;
        height: 40px;
        padding: 0 12px;
        margin: 0 4px 0 0;
        border-radius: 20px;
        background: rgba(28, 28, 28, 0.3);
        color: #fff;
        font: 500 13px/1 Roboto, Arial, sans-serif;
        pointer-events: auto;
        flex-shrink: 0;
        box-sizing: border-box;
        transition: none;
        animation: none;
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 42px;
        height: 100%;
        color: #fff;
        font: 500 13px/1 Roboto, Arial, sans-serif;
        cursor: default;
        user-select: none;
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-slider {
        width: 70px;
        height: 100%;
        align-self: center;
        margin: 0;
        padding: 0;
        appearance: none;
        -webkit-appearance: none;
        background: transparent;
        cursor: pointer;
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-slider::-webkit-slider-runnable-track {
        height: 3px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.3);
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-slider::-moz-range-track {
        height: 3px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.3);
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-slider::-webkit-slider-thumb {
        width: 12px;
        height: 12px;
        margin-top: -4.5px;
        appearance: none;
        -webkit-appearance: none;
        border: 0;
        border-radius: 50%;
        background: #fff;
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-slider::-moz-range-thumb {
        width: 12px;
        height: 12px;
        border: 0;
        border-radius: 50%;
        background: #fff;
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-presets {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-presets button {
        height: 24px;
        padding: 0 8px;
        border: 0;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        font: 500 11px/1 Roboto, Arial, sans-serif;
        cursor: pointer;
        transition: none;
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-presets button:hover { background: rgba(255, 255, 255, 0.18); }
      [data-yt-supertool="speed"] .yt-supertool-speed-presets button.is-active {
        background: #fff;
        color: #000;
      }
      @media (max-width: 1400px) {
        [data-yt-supertool="speed"] .yt-supertool-speed-slider { width: 60px; }
        [data-yt-supertool="speed"] .yt-supertool-speed-presets button {
          height: 22px;
          padding: 0 6px;
          font-size: 10px;
        }
      }
      @media (max-width: 1100px) {
        [data-yt-supertool="speed"] .yt-supertool-speed-presets { display: none; }
      }
      @media (max-width: 900px) {
        [data-yt-supertool="speed"] .yt-supertool-speed-slider { display: none; }
      }
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
        transition: none !important;
      }
      .ytp-right-controls .yt-supertool-control:hover { background: rgba(255, 255, 255, 0.1) !important; border-radius: 50% !important; }
      .ytp-right-controls .yt-supertool-control:active { background: rgba(255, 255, 255, 0.15) !important; border-radius: 50% !important; }
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
        .ytp-right-controls .yt-supertool-control { width: 36px !important; height: 36px !important; padding: 6px !important; }
      }
    `;
    head.append(style);
    return true;
  }

  window.YTSuperTool.injectStyles = injectStyles;

  if (!injectStyles()) {
    const tryInject = () => {
      if (injectStyles()) return;
      setTimeout(tryInject, 50);
    };
    tryInject();
  }
})();
