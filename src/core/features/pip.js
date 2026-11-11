import { createPlayerControl, removePlayerControl } from '../ui/player-control.js';
import { UI_STRINGS } from '../ui/strings.js';

export function createPiP() {
  let onEnter = null;
  let onLeave = null;

  const bind = (button) => {
    if (!button || onEnter) return;
    onEnter = () => button.classList.add('is-active');
    onLeave = () => button.classList.remove('is-active');
    document.addEventListener('enterpictureinpicture', onEnter);
    document.addEventListener('leavepictureinpicture', onLeave);
    if (document.pictureInPictureElement) button.classList.add('is-active');
  };

  return {
    init(player) {
      const created = createPlayerControl({
        player,
        id: 'pip',
        label: UI_STRINGS.pictureInPicture,
        icon: 'pip',
        onClick: async () => {
          const video = player?.querySelector('video');
          if (!video || !document.pictureInPictureEnabled) return;
          try {
            if (document.pictureInPictureElement) await document.exitPictureInPicture();
            else await video.requestPictureInPicture();
          } catch (error) {
            console.warn('YT SuperTool PiP:', error);
          }
        }
      });
      bind(created || document.querySelector('[data-ytst="pip"]'));
    },
    stop() {
      if (onEnter) document.removeEventListener('enterpictureinpicture', onEnter);
      if (onLeave) document.removeEventListener('leavepictureinpicture', onLeave);
      onEnter = null;
      onLeave = null;
      removePlayerControl('pip');
    }
  };
}

export default createPiP;
