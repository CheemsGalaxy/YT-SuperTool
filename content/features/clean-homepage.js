(function () {
  const isCleanHomepageSection = section => {
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

  function hideMealbarPromo(root = document) {
    const promos = root.matches?.('yt-mealbar-promo-renderer')
      ? [root]
      : root.querySelectorAll?.('yt-mealbar-promo-renderer') || [];

    promos.forEach(promo => {
      if (!promo.isConnected) return;
      const dialog = promo.closest('tp-yt-paper-dialog, ytd-popup-container');
      (dialog || promo).remove();
    });
  }

  function hideCleanHomepageSections(root = document) {
    hideMealbarPromo(root);

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
  }

  function updateCleanHomepage(mutations) {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) hideCleanHomepageSections(node);
    }));
  }

  function stopCleanHomepage() {
  }

  window.YTSuperTool = window.YTSuperTool || {};
  window.YTSuperTool.cleanHomepage = { initCleanHomepage, updateCleanHomepage, stopCleanHomepage };
})();