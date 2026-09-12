// content/features/pip.js

(function () {
  const PIP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5"/><rect x="12" y="12" width="6" height="4" rx=".5"/></svg>';
  let cleanup = null;
  function initPiP(player) {
    const controls = player?.querySelector('.ytp-right-controls');
    if (!controls || controls.querySelector('[data-yt-supertool="pip"]')) return;
    cleanup?.();
    window.YTSuperTool.ensureControlStyles?.();
    const button = document.createElement('button');
    button.className = 'ytp-button yt-supertool-control';
    button.dataset.ytSupertool = 'pip';
    button.title = 'Picture in Picture';
    button.setAttribute('aria-label', 'Picture in Picture');
    button.innerHTML = PIP_ICON;
    button.onclick = async () => { const video = player.querySelector('video'); if (!video || !document.pictureInPictureEnabled) return; try { document.pictureInPictureElement ? await document.exitPictureInPicture() : await video.requestPictureInPicture(); } catch (error) { console.warn('YT SuperTool PiP:', error); } };
    const onEnter = () => button.classList.add('is-active');
    const onLeave = () => button.classList.remove('is-active');
    document.addEventListener('enterpictureinpicture', onEnter);
    document.addEventListener('leavepictureinpicture', onLeave);
    window.YTSuperTool.alignWithNative?.(button);
    const anchor = window.YTSuperTool.getInsertAnchor?.(controls)
      || controls.querySelector('.ytp-settings-button');
    if (anchor) anchor.insertAdjacentElement('beforebegin', button);
    else controls.prepend(button);
    cleanup = () => {
      document.removeEventListener('enterpictureinpicture', onEnter);
      document.removeEventListener('leavepictureinpicture', onLeave);
      button.remove();
      cleanup = null;
    };
  }
  function stopPiP() { cleanup?.(); }
  window.YTSuperTool = window.YTSuperTool || {}; window.YTSuperTool.pip = { initPiP, stopPiP };
})();
