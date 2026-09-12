// content/features/clean-homepage.js

(function () {
  let cleanHomepageObserver = null;

  const isCleanHomepageSection = section => {
    // Inline survey: "Bạn nghĩ gì về video này?"
    if (section.querySelector('ytd-inline-survey-renderer')) return true;
    if (section.querySelector('ytd-statement-banner-renderer')) return true;
    if (section.querySelector('ytd-mini-game-card-view-model, mini-game-card-view-model')) return true;
    if (section.querySelector('a[href*="/playables"], a[href*="/mini-game"], a[href*="/feed/storefront"], a[href="/gaming"]')) return true;
    if (section.querySelector('ytd-rich-shelf-renderer[is-live]')) return true;
    const text = section.textContent;
    if (!text) return false;
    return text.includes('Chơi game trên YouTube') || text.includes('Chơi ngay không cần tải') ||
      text.includes('Playables') || text.includes('Play games') || text.includes('Phim & TV') ||
      text.includes('Gaming') || text.includes('Trò chơi') || text.includes('Trực tiếp');
  };

  function hideCleanHomepageSections(root = document) {
    const sections = root.matches?.('ytd-rich-section-renderer')
      ? [root]
      : root.querySelectorAll?.('ytd-rich-section-renderer') || [];

    sections.forEach(section => {
      if (section.isConnected && isCleanHomepageSection(section)) section.remove();
    });

    const banners = root.matches?.('ytd-statement-banner-renderer')
      ? [root]
      : root.querySelectorAll?.('ytd-statement-banner-renderer') || [];
    banners.forEach(banner => {
      if (banner.isConnected && !banner.closest('ytd-rich-section-renderer')) banner.remove();
    });
  }

  function initCleanHomepage() {
    stopCleanHomepage();
    hideCleanHomepageSections();
    if (!document.body) return;
    cleanHomepageObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) hideCleanHomepageSections(node);
      }));
    });
    cleanHomepageObserver.observe(document.body, { childList: true, subtree: true });
  }

  function stopCleanHomepage() {
    cleanHomepageObserver?.disconnect();
    cleanHomepageObserver = null;
  }

  window.YTSuperTool = window.YTSuperTool || {};
  window.YTSuperTool.cleanHomepage = { initCleanHomepage, stopCleanHomepage };
})();