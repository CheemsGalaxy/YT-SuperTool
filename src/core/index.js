import bridge from '../adapters/index.js';
import globalCss from './ui/global.css?inline';
import { createSettings } from './settings.js';
import { createLifecycleManager } from './lifecycle.js';
import { createPanel } from './ui/panel.js';
import { createLauncher } from './ui/launcher.js';
import { createToast } from './ui/toast.js';
import { createFeatures } from './features/index.js';
import { MUTATION_FEATURES, PLAYER_FEATURES, CONTENT_FEATURES } from './settings-schema.js';

const isYouTube = () => {
  const host = location.hostname;
  return host === 'youtube.com' || host.endsWith('.youtube.com');
};

const start = async () => {
  bridge.injector.injectStyle(globalCss, 'ytst-global');

  const settings = createSettings({ storage: bridge.storage });
  await settings.load();

  const toast = createToast();
  const features = createFeatures({ bridge, settings, toast });
  const panel = createPanel({
    settings,
    storage: bridge.storage,
    toast,
    meta: { version: bridge.version, target: bridge.env }
  });
  const launcher = createLauncher({ onOpen: () => panel.toggle() });

  const PLAYER_RETRY_MAX = 20;
  let active = !document.hidden;
  let playerRetryTimer = 0;
  let playerRetryCount = 0;
  let refreshTimer = 0;
  let cachedPlayer = null;
  let cachedAt = 0;

  const getPlayer = () => {
    const now = performance.now();
    if (cachedPlayer?.isConnected && now - cachedAt < 2000) return cachedPlayer;
    const player = document.querySelector('#movie_player, .html5-video-player');
    if (player) {
      cachedPlayer = player;
      cachedAt = now;
    } else {
      cachedPlayer = null;
    }
    return player;
  };

  const initPlayerFeatures = () => {
    if (!active) return;
    const player = getPlayer();
    if (!player) {
      if (playerRetryCount < PLAYER_RETRY_MAX) {
        clearTimeout(playerRetryTimer);
        playerRetryCount += 1;
        playerRetryTimer = setTimeout(initPlayerFeatures, 500);
      }
      return;
    }

    clearTimeout(playerRetryTimer);
    playerRetryTimer = 0;
    playerRetryCount = 0;
    launcher.ensurePlayer(player);
    PLAYER_FEATURES.forEach((key) => {
      if (settings.get(key)) features[key]?.init?.(player);
    });
  };

  const apply = () => {
    if (!active) return;
    try {
      CONTENT_FEATURES.forEach((key) => {
        const feature = features[key];
        if (!feature) return;
        if (settings.get(key)) feature.init?.();
        else feature.stop?.();
      });
      launcher.ensureHeader();
      initPlayerFeatures();
      panel.syncTheme();
    } catch (error) {
      console.warn('YT SuperTool apply pass failed:', error);
    }
  };

  const scheduleApply = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if ('requestIdleCallback' in window) requestIdleCallback(apply, { timeout: 500 });
      else apply();
    }, 200);
  };

  const isPlayerMutation = (mutations) => mutations.some((mutation) => {
    if (mutation.target?.closest?.('.html5-video-player')) return true;
    if (mutation.target?.matches?.('#player, #movie_player, .html5-video-player, .ytp-left-controls, .ytp-right-controls')) return true;
    return [...mutation.addedNodes].some((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      if (node.matches?.('.html5-video-player, #movie_player, #player, .ytp-left-controls, .ytp-right-controls, ytd-segmented-like-dislike-button-renderer')) return true;
      return Boolean(node.querySelector?.('.html5-video-player, #movie_player, #player, .ytp-left-controls, .ytp-right-controls'));
    });
  });

  const handleMutations = (mutations) => {
    if (!active) return;

    MUTATION_FEATURES.forEach((key) => {
      if (settings.get(key)) features[key]?.update?.(mutations);
    });
    if (settings.get('adblock')) features.adblock?.update?.(mutations);

    panel.syncTheme();
    if (!document.querySelector('.ytst-header-button')) launcher.ensureHeader();
    if (isPlayerMutation(mutations)) initPlayerFeatures();
  };

  const handleNavigation = () => {
    playerRetryCount = 0;
    clearTimeout(playerRetryTimer);
    playerRetryTimer = 0;
    cachedPlayer = null;
    cachedAt = 0;
    launcher.ensureHeader();
    setTimeout(() => {
      if (settings.get('cleanHomepage')) features.cleanHomepage?.init?.();
    }, 500);
    scheduleApply();
  };

  const lifecycle = createLifecycleManager({
    onNavigate: handleNavigation,
    onMutations: handleMutations
  });

  settings.subscribe(() => {
    panel.syncTheme();
    scheduleApply();
  });

  const handleVisibility = () => {
    active = !document.hidden;
    if (active) {
      apply();
      lifecycle.start();
    } else {
      lifecycle.stop();
    }
  };

  document.addEventListener('visibilitychange', handleVisibility, { passive: true });

  if (active) {
    apply();
    lifecycle.start();
  }
  bridge.onMenuCommand?.('YT SuperTool settings', () => panel.toggle());

  return { settings, features, panel, launcher, apply };
};

export async function initCore() {
  if (!isYouTube()) return null;
  if (globalThis.__ytstApp) return globalThis.__ytstApp;
  globalThis.__ytstApp = start();
  return globalThis.__ytstApp;
}

export default initCore;
