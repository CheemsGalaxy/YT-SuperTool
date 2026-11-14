const syncRoot = (enabled) => {
  const root = document.documentElement;
  if (!root) return;
  if (enabled) root.dataset.ytstNoShorts = 'on';
  else delete root.dataset.ytstNoShorts;
};

export function createNoShorts() {
  return {
    init() {
      syncRoot(true);
    },
    stop() {
      syncRoot(false);
    }
  };
}

export default createNoShorts;
