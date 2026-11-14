const syncRoot = (enabled) => {
  const root = document.documentElement;
  if (!root) return;
  if (enabled) root.dataset.ytstCleanHome = 'on';
  else delete root.dataset.ytstCleanHome;
};

export function createCleanHomepage() {
  return {
    init() {
      syncRoot(true);
    },
    stop() {
      syncRoot(false);
    }
  };
}

export default createCleanHomepage;
