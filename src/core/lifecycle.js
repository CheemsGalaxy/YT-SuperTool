export function createLifecycleManager({ onNavigate = () => {}, onMutations = () => {}, root = document, delay = 300 } = {}) {
  let observer = null;
  let timer = 0;
  let pending = [];
  let started = false;

  const flush = () => {
    timer = 0;
    const mutations = pending;
    pending = [];
    if (!mutations.length) return;
    try {
      onMutations(mutations);
    } catch (error) {
      console.warn('YT SuperTool mutation pass failed:', error);
    }
  };

  const handleMutation = (mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' || mutation.addedNodes.length || mutation.removedNodes.length) {
        pending.push(mutation);
      }
    }
    if (pending.length > 1000) pending.splice(0, pending.length - 1000);
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  };

  const handleNavigation = () => {
    try {
      onNavigate();
    } catch (error) {
      console.warn('YT SuperTool navigation pass failed:', error);
    }
  };

  return {
    start() {
      if (started) return this;
      started = true;
      root.addEventListener('yt-navigate-finish', handleNavigation);
      root.addEventListener('yt-page-data-updated', handleNavigation);

      const target = root.documentElement || root.body;
      if (target) {
        observer = new MutationObserver(handleMutation);
        observer.observe(target, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'dark', 'light', 'dark-theme', 'hidden', 'aria-hidden']
        });
      }
      return this;
    },
    stop() {
      started = false;
      root.removeEventListener('yt-navigate-finish', handleNavigation);
      root.removeEventListener('yt-page-data-updated', handleNavigation);
      observer?.disconnect();
      observer = null;
      clearTimeout(timer);
      timer = 0;
      pending = [];
      return this;
    },
    refresh: handleNavigation
  };
}

export default createLifecycleManager;
