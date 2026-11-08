import { createPlayerControl, removePlayerControl } from '../ui/player-control.js';

export function createScreenshot({ toast }) {
  const capture = (player) => {
    const video = player?.querySelector('video');
    if (!video || !video.videoWidth) {
      toast?.show('No frame available yet');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    try {
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `youtube-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast?.show('Screenshot saved');
    } catch (error) {
      console.warn('YT SuperTool screenshot blocked by CORS:', error);
      toast?.show('This frame cannot be captured');
    }
  };

  return {
    init(player) {
      createPlayerControl({
        player,
        id: 'screenshot',
        label: 'Take screenshot',
        icon: 'camera',
        onClick: () => capture(player)
      });
    },
    stop() {
      removePlayerControl('screenshot');
    }
  };
}

export default createScreenshot;
