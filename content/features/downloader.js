// content/features/downloader.js

(function () {
  const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14"/></svg>';
  function initDownloader(player) {
    const controls = player?.querySelector('.ytp-right-controls');
    if (!controls || controls.querySelector('[data-yt-supertool="download"]')) return;
    window.YTSuperTool.ensureControlStyles?.();
    const button = document.createElement('button');
    button.className = 'ytp-button yt-supertool-control';
    button.dataset.ytSupertool = 'download';
    button.title = 'Download video';
    button.setAttribute('aria-label', 'Download video');
    button.innerHTML = DOWNLOAD_ICON;
    button.onclick = () => chrome.runtime.sendMessage({ type: 'openDownloadTab', url: location.href });
    window.YTSuperTool.alignWithNative?.(button);
    const anchor = window.YTSuperTool.getInsertAnchor?.(controls)
      || controls.querySelector('.ytp-settings-button');
    if (anchor) anchor.insertAdjacentElement('beforebegin', button);
    else controls.prepend(button);
  }
  function stopDownloader() { document.querySelectorAll('[data-yt-supertool="download"]').forEach(button => button.remove()); }
  window.YTSuperTool = window.YTSuperTool || {}; window.YTSuperTool.downloader = { initDownloader, stopDownloader };
})();
