const SECTION_SELECTOR = 'ytd-rich-section-renderer';
const BANNER_SELECTOR = 'ytd-statement-banner-renderer';
const PROMO_SELECTOR = 'yt-mealbar-promo-renderer';
const WATCH_SELECTOR = `${SECTION_SELECTOR}, ${BANNER_SELECTOR}, ${PROMO_SELECTOR}`;
const SECTION_REMOVED = new WeakSet();

const isCleanHomepageSection = (section) => {
  if (section.querySelector('ytd-inline-survey-renderer, ytd-statement-banner-renderer, ytd-rich-shelf-renderer[is-live]')) {
    return true;
  }
  if (section.querySelector('ytd-mini-game-card-view-model, mini-game-card-view-model')) return true;
  return Boolean(section.querySelector('a[href*="/playables"], a[href*="/mini-game"], a[href*="/feed/storefront"], a[href="/gaming"]'));
};

const dropPromo = (promo) => {
  if (!promo.isConnected) return;
  (promo.closest('tp-yt-paper-dialog, ytd-popup-container') || promo).remove();
};

const dropBanner = (banner) => {
  if (!banner.isConnected || banner.closest(SECTION_SELECTOR)) return;
  banner.remove();
};

const dropSection = (section) => {
  if (!section.isConnected || SECTION_REMOVED.has(section)) return;
  SECTION_REMOVED.add(section);
  if (isCleanHomepageSection(section)) section.remove();
};

const collectTargets = (node, targets) => {
  if (!(node instanceof Element)) return;
  if (node.matches(WATCH_SELECTOR)) targets.add(node);
  node.querySelectorAll(WATCH_SELECTOR).forEach((element) => targets.add(element));
};

const processTargets = (targets) => {
  targets.forEach((node) => {
    if (node.matches(PROMO_SELECTOR)) dropPromo(node);
    else if (node.matches(BANNER_SELECTOR)) dropBanner(node);
    else dropSection(node);
  });
};

const scanDocument = () => {
  const targets = new Set();
  document.querySelectorAll(WATCH_SELECTOR).forEach((element) => targets.add(element));
  processTargets(targets);
};

export function createCleanHomepage() {
  let enabled = false;
  let lastHref = '';
  let lastScanAt = 0;
  let sweepTimer = 0;

  return {
    init() {
      enabled = true;
      const href = location.href;
      const now = Date.now();
      if (href === lastHref && now - lastScanAt < 1000) return;
      lastHref = href;
      lastScanAt = now;
      scanDocument();
      clearTimeout(sweepTimer);
      sweepTimer = setTimeout(() => {
        if (enabled) scanDocument();
      }, 900);
    },
    update(mutations) {
      if (!enabled) return;
      const targets = new Set();
      for (const mutation of mutations) {
        const target = mutation.target;
        if (target instanceof Element && target.matches(WATCH_SELECTOR)) targets.add(target);
        for (const node of mutation.addedNodes) collectTargets(node, targets);
        if (!targets.size && mutation.removedNodes.length) continue;
      }
      if (targets.size) processTargets(targets);
    },
    stop() {
      enabled = false;
      clearTimeout(sweepTimer);
      sweepTimer = 0;
    }
  };
}

export default createCleanHomepage;
