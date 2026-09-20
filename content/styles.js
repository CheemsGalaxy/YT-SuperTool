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
        align-self: center;
        vertical-align: middle;
        height: auto;
        padding: 0;
        margin: 0 4px 0 0;
        background: transparent;
        border: 0;
        color: #fff;
        font: 500 13px/1 Roboto, Arial, sans-serif;
        pointer-events: auto;
        flex-shrink: 0;
        box-sizing: border-box;
        position: relative;
        transition: none;
        animation: none;
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-slider {
        width: 100px;
        height: 24px;
        align-self: center;
        margin: 0;
        padding: 0;
        appearance: none;
        -webkit-appearance: none;
        background: transparent;
        cursor: pointer;
        filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.85));
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-slider::-webkit-slider-runnable-track {
        height: 3px;
        border-radius: 2px;
        background: rgba(0, 0, 0, 0.45);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-slider::-moz-range-track {
        height: 3px;
        border-radius: 2px;
        background: rgba(0, 0, 0, 0.45);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
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
        box-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-slider::-moz-range-thumb {
        width: 12px;
        height: 12px;
        border: 0;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        height: 28px;
        min-width: 48px;
        padding: 0 10px;
        border: 0;
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        color: #fff;
        font: 500 12px/1 Roboto, Arial, sans-serif;
        cursor: pointer;
        position: relative;
        transition: none;
        white-space: nowrap;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-trigger:hover {
        background: rgba(0, 0, 0, 0.65);
      }
      [data-yt-supertool="speed"] .yt-supertool-speed-trigger.is-open {
        background: rgba(0, 0, 0, 0.75);
      }
      .yt-supertool-speed-dropdown {
        position: fixed;
        min-width: 180px;
        max-height: 160px;
        overflow-y: auto;
        background: rgba(28, 28, 28, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 8px 0;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
        z-index: 2147483647;
        color: #fff;
        font: 500 13px/1 Roboto, Arial, sans-serif;
        pointer-events: auto;
        box-sizing: border-box;
      }
      .yt-supertool-speed-dropdown::-webkit-scrollbar {
        width: 6px;
      }
      .yt-supertool-speed-dropdown::-webkit-scrollbar-track {
        background: transparent;
      }
      .yt-supertool-speed-dropdown::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
      }
      .yt-supertool-speed-dropdown::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
      }
      .yt-supertool-speed-dropdown .yt-supertool-speed-preset {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 32px;
        padding: 0 16px;
        color: #fff;
        font: 500 13px/1 Roboto, Arial, sans-serif;
        cursor: pointer;
        user-select: none;
      }
      .yt-supertool-speed-dropdown .yt-supertool-speed-preset:hover {
        background: rgba(255, 255, 255, 0.08);
      }
      .yt-supertool-speed-dropdown .yt-supertool-speed-preset.is-active {
        background: rgba(255, 255, 255, 0.12);
      }
      .yt-supertool-speed-dropdown .yt-supertool-speed-check {
        color: #3ea6ff;
        font-size: 14px;
        opacity: 0;
      }
      .yt-supertool-speed-dropdown .yt-supertool-speed-preset.is-active .yt-supertool-speed-check {
        opacity: 1;
      }
      .yt-supertool-speed-dropdown .yt-supertool-speed-divider {
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
        margin: 6px 12px;
      }
      .yt-supertool-speed-dropdown .yt-supertool-speed-label {
        font: 500 10px Roboto, Arial, sans-serif;
        color: rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        padding: 8px 16px 4px;
      }
      .yt-supertool-speed-dropdown .yt-supertool-speed-mini-slider {
        display: block;
        width: calc(100% - 32px);
        margin: 4px 16px;
        height: 20px;
        appearance: none;
        -webkit-appearance: none;
        background: transparent;
        cursor: pointer;
      }
      .yt-supertool-speed-dropdown .yt-supertool-speed-mini-slider::-webkit-slider-runnable-track {
        height: 3px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.3);
      }
      .yt-supertool-speed-dropdown .yt-supertool-speed-mini-slider::-webkit-slider-thumb {
        width: 12px;
        height: 12px;
        margin-top: -4.5px;
        appearance: none;
        -webkit-appearance: none;
        border: 0;
        border-radius: 50%;
        background: #fff;
      }
      .yt-supertool-speed-dropdown .yt-supertool-speed-mini-slider::-moz-range-track {
        height: 3px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.3);
      }
      .yt-supertool-speed-dropdown .yt-supertool-speed-mini-slider::-moz-range-thumb {
        width: 12px;
        height: 12px;
        border: 0;
        border-radius: 50%;
        background: #fff;
      }
      .yt-supertool-speed-dropdown .yt-supertool-speed-reset {
        display: block;
        height: 32px;
        margin: 4px 8px 8px;
        width: calc(100% - 16px);
        border: 0;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        font: 500 12px/1 Roboto, Arial, sans-serif;
        cursor: pointer;
        transition: none;
      }
      .yt-supertool-speed-dropdown .yt-supertool-speed-reset:hover {
        background: rgba(255, 255, 255, 0.15);
      }
      @media (max-width: 1400px) {
        [data-yt-supertool="speed"] .yt-supertool-speed-slider { width: 80px; }
      }
      @media (max-width: 1100px) {
        [data-yt-supertool="speed"] .yt-supertool-speed-slider { display: none; }
      }
      @media (max-width: 900px) {
        [data-yt-supertool="speed"] { gap: 4px; }
        [data-yt-supertool="speed"] .yt-supertool-speed-trigger { padding: 0 8px; font-size: 11px; }
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