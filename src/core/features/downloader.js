import { createPlayerControl, removePlayerControl } from '../ui/player-control.js';

function getVideoId(href = location.href) {
  try {
    const url = new URL(href);
    return url.searchParams.get('v')
      || url.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/)?.[1]
      || (url.hostname === 'youtu.be' ? url.pathname.slice(1) : '');
  } catch {
    return '';
  }
}

export function createDownloader({ bridge }) {
  return {
    init(player) {
      createPlayerControl({
        player,
        id: 'download',
        label: 'Download video',
        icon: 'download',
        onClick: () => {
          const videoId = getVideoId();
          const target = videoId
            ? `https://www.youtubepi.com/watch?v=${encodeURIComponent(videoId)}`
            : 'https://y2mate.nu/';
          bridge.openExternal(target);
        }
      });
    },
    stop() {
      removePlayerControl('download');
    }
  };
}

export default createDownloader;
