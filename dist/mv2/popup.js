(function() {
  "use strict";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const applyAttributes = (element, attributes) => {
    for (const [key, value] of Object.entries(attributes || {})) {
      if (value === null || value === void 0 || value === false) continue;
      if (key === "className") {
        element.setAttribute("class", value);
      } else if (key === "dataset" && typeof value === "object") {
        Object.entries(value).forEach(([name, data]) => {
          element.dataset[name] = String(data);
        });
      } else if (key === "textContent") {
        element.textContent = String(value);
      } else {
        element.setAttribute(key, value === true ? "" : String(value));
      }
    }
  };
  const appendChildren = (element, children) => {
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child === null || child === void 0 || child === false) continue;
      element.appendChild(
        typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child
      );
    }
  };
  function createElement(tagName, attributes = {}, children = []) {
    const element = document.createElement(tagName);
    applyAttributes(element, attributes);
    appendChildren(element, children);
    return element;
  }
  function createSvgElement(tagName, attributes = {}, children = []) {
    const element = document.createElementNS(SVG_NS, tagName);
    applyAttributes(element, attributes);
    appendChildren(element, children);
    return element;
  }
  const ICONS = {
    home: [
      ["path", { d: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9.5Z" }]
    ],
    play: [
      ["path", { d: "M9 6.5v11l9-5.5-9-5.5Z" }]
    ],
    shield: [
      ["path", { d: "M12 3.2 5 6v5.4c0 4.2 2.9 7.3 7 8.4 4.1-1.1 7-4.2 7-8.4V6l-7-2.8Z" }],
      ["path", { d: "m9.2 12.2 2.1 2.1 3.9-4" }]
    ],
    shorts: [
      ["rect", { x: "7", y: "3", width: "10", height: "18", rx: "3" }],
      ["path", { d: "m11 9.2 4 2.8-4 2.8V9.2Z" }]
    ],
    thumbdown: [
      ["path", { d: "M7 3v10" }],
      ["path", { d: "M7 13.5 10.6 20a1.8 1.8 0 0 0 3.2-1.4L13.2 15H18a2 2 0 0 0 2-2.4l-1.2-6A2 2 0 0 0 16.8 5H7" }],
      ["path", { d: "M4 3v10h3" }]
    ],
    repeat: [
      ["path", { d: "M4 9V8a4 4 0 0 1 4-4h10" }],
      ["polyline", { points: "15 1 18 4 15 7" }],
      ["path", { d: "M20 15v1a4 4 0 0 1-4 4H6" }],
      ["polyline", { points: "9 17 6 20 9 23" }]
    ],
    skip: [
      ["path", { d: "M5 5.5v13l9-6.5-9-6.5Z" }],
      ["path", { d: "M18 5v14" }]
    ],
    gauge: [
      ["path", { d: "M4.2 18a9 9 0 1 1 15.6 0" }],
      ["path", { d: "m12 14 4.5-4.5" }],
      ["circle", { cx: "12", cy: "14", r: "1.4" }]
    ],
    pip: [
      ["rect", { x: "3", y: "5", width: "18", height: "14", rx: "2" }],
      ["rect", { x: "12.5", y: "11.5", width: "6", height: "4.5", rx: "1" }]
    ],
    camera: [
      ["path", { d: "M5 8.5h3l1.5-2.2h5L16 8.5h3a2 2 0 0 1 2 2v6.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6.8a2 2 0 0 1 2-2Z" }],
      ["circle", { cx: "12", cy: "13.4", r: "3.2" }]
    ],
    download: [
      ["path", { d: "M12 4v10" }],
      ["path", { d: "m8 10.5 4 4 4-4" }],
      ["path", { d: "M5 19.5h14" }]
    ],
    braces: [
      ["path", { d: "M9 4 4.5 12 9 20" }],
      ["path", { d: "M15 4l4.5 8L15 20" }]
    ],
    layers: [
      ["path", { d: "m12 3.5 8 4-8 4-8-4 8-4Z" }],
      ["path", { d: "m4 12 8 4 8-4" }],
      ["path", { d: "m4 16.5 8 4 8-4" }]
    ],
    fast: [
      ["path", { d: "m6 5.5 6 6.5-6 6.5" }],
      ["path", { d: "m13 5.5 6 6.5-6 6.5" }]
    ],
    chevron: [
      ["path", { d: "m6 9.5 6 6 6-6" }]
    ],
    close: [
      ["path", { d: "m6 6 12 12" }],
      ["path", { d: "M18 6 6 18" }]
    ],
    check: [
      ["path", { d: "m5 12.5 4.5 4.5L19 7.5" }]
    ],
    reset: [
      ["path", { d: "M4.5 5.5V10H9" }],
      ["path", { d: "M5 14a7.5 7.5 0 1 0 2.2-7.2L4.5 10" }]
    ],
    sliders: [
      ["path", { d: "M4 7h10" }],
      ["path", { d: "M18 7h2" }],
      ["circle", { cx: "16", cy: "7", r: "2" }],
      ["path", { d: "M4 12h4" }],
      ["path", { d: "M12 12h8" }],
      ["circle", { cx: "10", cy: "12", r: "2" }],
      ["path", { d: "M4 17h12" }],
      ["circle", { cx: "18", cy: "17", r: "2" }]
    ]
  };
  function createIcon(name, size = 20, { strokeWidth } = {}) {
    const shapes = ICONS[name] || ICONS.sliders;
    const svg = createSvgElement("svg", {
      viewBox: "0 0 24 24",
      width: String(size),
      height: String(size),
      fill: "none",
      stroke: "currentColor",
      "stroke-width": String(strokeWidth || (size <= 16 ? 1.5 : 1.75)),
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
      className: "ytst-icon"
    });
    for (const [tag, attributes] of shapes) {
      svg.appendChild(createSvgElement(tag, attributes));
    }
    return svg;
  }
  function createBrandMark(size = 16) {
    const svg = createSvgElement("svg", {
      viewBox: "0 0 24 24",
      width: String(size),
      height: String(size),
      fill: "currentColor",
      "aria-hidden": "true",
      focusable: "false",
      className: "ytst-icon"
    });
    svg.appendChild(createSvgElement("path", { d: "M9.4 6.1v11.8L19 12 9.4 6.1Z" }));
    return svg;
  }
  const FEATURE_GROUPS = [
    { id: "browse", label: "Browse", icon: "home" },
    { id: "player", label: "Player", icon: "play" },
    { id: "blocking", label: "Blocking", icon: "shield" }
  ];
  const SPONSOR_CATEGORIES = {
    sponsor: { label: "Sponsor", color: "#00d400", enabled: true },
    selfpromo: { label: "Self-promotion", color: "#ffff00", enabled: true },
    interaction: { label: "Interaction reminder", color: "#cc00ff", enabled: true },
    intro: { label: "Intro", color: "#00ffff", enabled: false },
    outro: { label: "Outro", color: "#0202ed", enabled: false },
    preview: { label: "Preview", color: "#008fd6", enabled: false },
    music_offtopic: { label: "Off-topic music", color: "#ff9900", enabled: false },
    filler: { label: "Filler", color: "#7300ff", enabled: false }
  };
  const FEATURES = [
    {
      key: "noShorts",
      group: "browse",
      label: "Hide Shorts",
      description: "Remove Shorts shelves, tabs and feed cards.",
      icon: "shorts",
      default: true
    },
    {
      key: "cleanHomepage",
      group: "browse",
      label: "Clean homepage",
      description: "Hide promos, surveys, Playables and live shelves.",
      icon: "home",
      default: true
    },
    {
      key: "dislike",
      group: "player",
      label: "Return dislike",
      description: "Show the estimated dislike count on videos.",
      icon: "thumbdown",
      default: true
    },
    {
      key: "nonstop",
      group: "player",
      label: "Auto continue",
      description: "Dismiss the “Video paused. Continue watching?” prompt.",
      icon: "repeat",
      default: true
    },
    {
      key: "sponsorblock",
      group: "player",
      label: "SponsorBlock",
      description: "Skip community-submitted sponsored segments.",
      icon: "skip",
      default: true
    },
    {
      key: "speed",
      group: "player",
      label: "Playback speed",
      description: "Add a speed slider, presets and keyboard shortcuts.",
      icon: "gauge",
      default: true
    },
    {
      key: "pip",
      group: "player",
      label: "Picture in picture",
      description: "Pop the video into a floating window.",
      icon: "pip",
      default: true
    },
    {
      key: "screenshot",
      group: "player",
      label: "Screenshot",
      description: "Save the current video frame as a PNG.",
      icon: "camera",
      default: true
    },
    {
      key: "downloader",
      group: "player",
      label: "Downloader",
      description: "Download MP4 360p directly, or open ytmp3pc.com for other formats.",
      icon: "download",
      default: true
    },
    {
      key: "adblock",
      group: "blocking",
      label: "Ad blocking",
      description: "Three layers: player data rewrite, cosmetic CSS and player skip.",
      icon: "shield",
      default: false
    },
    {
      key: "adblockPrune",
      group: "blocking",
      label: "JSON prune",
      description: "Rename ad placements in player data before playback.",
      icon: "braces",
      badge: "L1",
      default: true,
      dependsOn: "adblock"
    },
    {
      key: "adblockCosmetic",
      group: "blocking",
      label: "Cosmetic filtering",
      description: "Hide feed, masthead and sidebar ad slots.",
      icon: "layers",
      badge: "L2",
      default: true,
      dependsOn: "adblock"
    },
    {
      key: "adblockSkipper",
      group: "blocking",
      label: "Player fallback",
      description: "Mute and skip any ad that still reaches the player.",
      icon: "fast",
      badge: "L3",
      default: true,
      dependsOn: "adblock"
    }
  ];
  const EXTRA_DEFAULTS = {
    sponsorblockCategories: null,
    sponsorblockNotice: true,
    sponsorblockProgressBar: true,
    playbackSpeed: 1
  };
  const DEFAULTS = Object.fromEntries([
    ...FEATURES.map((feature) => [feature.key, feature.default]),
    ...Object.entries(EXTRA_DEFAULTS)
  ]);
  const STORAGE_KEYS = Object.keys(DEFAULTS);
  FEATURES.filter((feature) => !feature.dependsOn).map((feature) => feature.key);
  const featuresForGroup = (groupId) => FEATURES.filter((feature) => feature.group === groupId);
  const UI_STRINGS = {
    appName: "YT SuperTool",
    appSubtitle: "Player, feed and blocking controls",
    settings: "YouTube settings",
    settingsTitle: "YT SuperTool settings",
    settingGroups: "Setting groups",
    defenceLayers: "Defence layers",
    saved: "Saved",
    savedLocally: "Saved locally",
    reset: "Reset",
    done: "Done",
    close: "Close",
    closeSettings: "Close settings",
    defaultsRestored: "Defaults restored",
    saveCategoriesFailed: "Could not save categories",
    saveSettingFailed: "Could not save that setting",
    saveCategoriesError: "Unable to save categories",
    saveNoticeError: "Unable to save notice setting",
    saveError: "Unable to save setting",
    loadError: "Unable to load settings",
    showSkipNotice: "Show a skip notice with undo",
    showProgressBar: "Show segment colors on the progress bar",
    undo: "Undo",
    custom: "Custom",
    customPlaybackSpeed: "Custom playback speed",
    resetTo1x: "Reset to 1x",
    playbackSpeed: "Playback speed",
    playbackSpeedPresets: "Playback speed presets",
    download: "Download",
    downloadVideo: "Download video",
    downloadThisVideo: "Download this video",
    cancel: "Cancel",
    readingPlayerResponse: "Reading player response...",
    readFailed: "Could not read the player response",
    directMp4: "Direct · MP4",
    videoAudioSaved: "Video + audio · saved directly",
    mp4Unavailable: "MP4 360p unavailable",
    noSingleStream: "No single-stream video for this one",
    highQuality: "MP4/MP3 (High Quality)",
    copiesLink: "Copies the link, opens a new tab",
    linkCopied: "Link copied — paste it on ytmp3pc.com",
    copyFailed: "Could not copy the link",
    downloadCancelled: "Download cancelled",
    downloadFailedToast: "Download failed",
    unknownError: "Unknown error",
    downloadingMp4: "Downloading MP4...",
    noFrame: "No frame available yet",
    screenshotSaved: "Screenshot saved",
    screenshotFailed: "This frame cannot be captured",
    takeScreenshot: "Take screenshot",
    pictureInPicture: "Picture in picture",
    estimatedDislikes: "Estimated dislikes",
    dislikeData: "Dislike data",
    checkUpdate: "Check update",
    checkingUpdate: "Checking...",
    downloadUpdate: "Download update",
    updateCheckFailed: "Could not check for updates"
  };
  const UI_TEXT = {
    versionTarget: (version, target) => `v${version} · ${String(target).toUpperCase()}`,
    versionSettings: (version) => `v${version} · ${UI_STRINGS.settings}`,
    manifestTarget: (version) => `MV${version}`,
    speedPreset: (speed) => `${speed} speed`,
    skipped: (label, seconds) => `Skipped ${label} · ${seconds}s`,
    otherFormats: (label) => `Other formats · ${label}`,
    menuFoot: (label) => `Only the single-stream MP4 downloads in place. High quality MP4 and MP3 continue on ${label} with the link copied for you.`,
    downloadFailed: (reason) => `Download failed: ${reason}`,
    downloadProgress: (percent, size) => `Downloading MP4 · ${percent}%${size ? ` · ${size}` : ""}`,
    savedFile: (fileName) => `Saved · ${fileName}`,
    upToDate: (version) => `Up to date · v${version}`,
    updateAvailable: (version) => `v${version} available`
  };
  function createSponsorAccordion({ onChange, onNoticeChange, onProgressChange } = {}) {
    const inputs = /* @__PURE__ */ new Map();
    const list = createElement("div", { className: "ytst-sb-list" });
    Object.entries(SPONSOR_CATEGORIES).forEach(([key, category]) => {
      const input = createElement("input", { type: "checkbox" });
      input.checked = Boolean(category.enabled);
      input.dataset.category = key;
      const dot = createElement("span", { className: "ytst-sb-dot", "aria-hidden": "true" });
      dot.style.backgroundColor = category.color;
      const label = createElement("label", { className: "ytst-sb-cat" }, [
        input,
        dot,
        createElement("span", { textContent: category.label })
      ]);
      inputs.set(key, input);
      list.appendChild(label);
    });
    const notice = createElement("input", { type: "checkbox" });
    notice.checked = true;
    notice.id = `ytst-sb-notice-${Math.random().toString(36).slice(2, 8)}`;
    const noticeLabel = createElement("label", { className: "ytst-sb-notice", for: notice.id }, [
      notice,
      createElement("span", { textContent: UI_STRINGS.showSkipNotice })
    ]);
    const progress = createElement("input", { type: "checkbox" });
    progress.checked = true;
    progress.id = `ytst-sb-progress-${Math.random().toString(36).slice(2, 8)}`;
    const progressLabel = createElement("label", {
      className: "ytst-sb-notice ytst-sb-progress",
      for: progress.id
    }, [
      progress,
      createElement("span", { textContent: UI_STRINGS.showProgressBar })
    ]);
    const inner = createElement("div", { className: "ytst-sb-inner" }, [list, noticeLabel, progressLabel]);
    const element = createElement("div", {
      className: "ytst-sb",
      "aria-hidden": "true",
      dataset: { open: "false" }
    }, [inner]);
    element.inert = true;
    const getCategories = () => Object.fromEntries(
      [...inputs.entries()].map(([key, input]) => [key, input.checked])
    );
    list.addEventListener("change", () => onChange?.(getCategories()));
    notice.addEventListener("change", () => onNoticeChange?.(Boolean(notice.checked)));
    progress.addEventListener("change", () => onProgressChange?.(Boolean(progress.checked)));
    const setOpen = (open) => {
      const next = Boolean(open);
      if (element.dataset.open === String(next)) return;
      element.dataset.open = String(next);
      element.setAttribute("aria-hidden", String(!next));
      element.inert = !next;
    };
    const setCategories = (saved) => {
      let parsed = saved;
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          parsed = {};
        }
      }
      inputs.forEach((input, key) => {
        const fallback = Boolean(SPONSOR_CATEGORIES[key]?.enabled);
        input.checked = typeof parsed?.[key] === "boolean" ? parsed[key] : fallback;
      });
    };
    return {
      element,
      setOpen,
      setCategories,
      setNotice: (value) => {
        notice.checked = Boolean(value);
      },
      setProgress: (value) => {
        progress.checked = Boolean(value);
      },
      getCategories
    };
  }
  function createSettingsTree({
    prefix = "ytst",
    orientation = "vertical",
    tabHost = null,
    panelHost = null,
    tabHostClass = "",
    panelHostClass = "",
    panelClass = "",
    rowClass = "",
    switchInputClass = "",
    badgeClass = "",
    showTabCount = false,
    onChange,
    onCategoriesChange,
    onNoticeChange,
    onProgressChange
  } = {}) {
    const base = (name) => `${prefix}-${name}`;
    const rowClassName = rowClass || base("row");
    const switchClassName = switchInputClass || base("switch-input");
    const panelClassName = panelClass || base("tabpanel");
    const badgeClassName = badgeClass || base("badge-layer");
    const rows = /* @__PURE__ */ new Map();
    const tabs = /* @__PURE__ */ new Map();
    const panels = /* @__PURE__ */ new Map();
    const groupMeta = /* @__PURE__ */ new Map();
    let activeGroup = FEATURE_GROUPS[0]?.id || "";
    let sponsorAccordion = null;
    const rail = tabHost || createElement("div", {
      className: tabHostClass || base("rail"),
      role: "tablist",
      "aria-label": UI_STRINGS.settingGroups,
      "aria-orientation": orientation
    });
    const content = panelHost || createElement("div", {
      className: panelHostClass || base("content")
    });
    const buildRow = (feature) => {
      const input = createElement("input", {
        type: "checkbox",
        className: switchClassName,
        id: `${prefix}-${feature.key}`,
        role: "switch",
        "aria-describedby": `${prefix}-desc-${feature.key}`
      });
      input.dataset.key = feature.key;
      const metaCell = createElement("span", { className: base("row-meta") });
      if (feature.badge) {
        metaCell.appendChild(createElement("span", {
          className: badgeClassName,
          textContent: feature.badge
        }));
      }
      const row = createElement("label", {
        className: rowClassName,
        for: `${prefix}-${feature.key}`
      }, [
        createElement("span", { className: base("row-icon") }, [createIcon(feature.icon, 20)]),
        createElement("span", { className: base("row-copy") }, [
          createElement("span", { className: base("row-label"), textContent: feature.label }),
          createElement("span", {
            className: base("row-desc"),
            id: `${prefix}-desc-${feature.key}`,
            textContent: feature.description
          })
        ]),
        metaCell,
        input,
        createElement("span", { className: base("switch"), "aria-hidden": "true" }, [
          createElement("span", { className: base("switch-thumb") })
        ])
      ]);
      rows.set(feature.key, { row, input, feature });
      return row;
    };
    const buildTab = (group) => {
      const features = featuresForGroup(group.id);
      const tab = createElement("button", {
        type: "button",
        className: base("tab"),
        role: "tab",
        id: `${prefix}-tab-${group.id}`,
        "aria-controls": `${prefix}-panel-${group.id}`,
        "aria-selected": "false",
        tabindex: "-1"
      }, [
        createIcon(group.icon, 16),
        createElement("span", { textContent: group.label }),
        showTabCount ? createElement("span", {
          className: base("tab-count"),
          textContent: String(features.length)
        }) : null
      ]);
      tab.addEventListener("click", () => show(group.id));
      tabs.set(group.id, tab);
      return tab;
    };
    const buildAccordion = () => createSponsorAccordion({
      onChange: (value) => onCategoriesChange?.(value),
      onNoticeChange: (value) => onNoticeChange?.(value),
      onProgressChange: (value) => onProgressChange?.(value)
    });
    const buildGroupPanel = (group) => {
      const metaNode = createElement("span", { className: base("group-meta") });
      groupMeta.set(group.id, metaNode);
      const wrapper = createElement("div", {
        className: panelClassName,
        id: `${prefix}-panel-${group.id}`,
        role: "tabpanel",
        "aria-labelledby": `${prefix}-tab-${group.id}`
      }, [
        createElement("div", { className: base("group-head") }, [
          createElement("h2", { className: base("group-title"), textContent: group.label }),
          metaNode
        ])
      ]);
      const list = createElement("div", { className: base("group") });
      let layerHeadingShown = false;
      for (const feature of featuresForGroup(group.id)) {
        if (feature.dependsOn && !layerHeadingShown) {
          layerHeadingShown = true;
          list.appendChild(createElement("div", {
            className: base("section"),
            textContent: UI_STRINGS.defenceLayers
          }));
        }
        list.appendChild(buildRow(feature));
        if (feature.key === "sponsorblock") {
          sponsorAccordion = buildAccordion();
          list.appendChild(sponsorAccordion.element);
        }
      }
      wrapper.appendChild(list);
      panels.set(group.id, wrapper);
      return wrapper;
    };
    const show = (groupId) => {
      if (!tabs.has(groupId)) return;
      activeGroup = groupId;
      tabs.forEach((tab, id) => {
        tab.setAttribute("aria-selected", String(id === groupId));
        tab.tabIndex = id === groupId ? 0 : -1;
      });
      panels.forEach((node, id) => {
        node.hidden = id !== groupId;
      });
    };
    const sync = (values = {}) => {
      rows.forEach(({ input, row, feature }) => {
        input.checked = Boolean(values[feature.key]);
        const blocked = Boolean(feature.dependsOn && !values[feature.dependsOn]);
        input.disabled = blocked;
        row.classList.toggle("is-disabled", blocked);
      });
      groupMeta.forEach((node, groupId) => {
        const features = featuresForGroup(groupId).filter((feature) => !feature.dependsOn || values[feature.dependsOn]);
        const active = features.filter((feature) => values[feature.key]).length;
        node.textContent = `${active}/${features.length}`;
      });
      sponsorAccordion?.setOpen(Boolean(values.sponsorblock));
      sponsorAccordion?.setCategories(values.sponsorblockCategories);
      sponsorAccordion?.setNotice(values.sponsorblockNotice);
      sponsorAccordion?.setProgress(values.sponsorblockProgressBar);
    };
    FEATURE_GROUPS.forEach((group) => {
      rail.appendChild(buildTab(group));
      content.appendChild(buildGroupPanel(group));
    });
    content.addEventListener("change", (event) => {
      const input = event.target;
      if (!input?.classList?.contains(switchClassName)) return;
      const key = input.dataset.key;
      if (!key) return;
      onChange?.(key, Boolean(input.checked));
    });
    rail.addEventListener("keydown", (event) => {
      const previousKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
      const nextKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
      if (event.key !== previousKey && event.key !== nextKey) return;
      event.preventDefault();
      const ids = [...tabs.keys()];
      const index = ids.indexOf(activeGroup);
      const next = event.key === nextKey ? ids[(index + 1) % ids.length] : ids[(index - 1 + ids.length) % ids.length];
      show(next);
      tabs.get(next)?.focus();
    });
    show(activeGroup);
    return {
      rail,
      content,
      rows,
      tabs,
      panels,
      show,
      sync,
      get activeGroup() {
        return activeGroup;
      },
      get sponsorAccordion() {
        return sponsorAccordion;
      }
    };
  }
  const api = globalThis.browser || globalThis.chrome;
  const store = api?.storage?.local;
  const isPromiseStore = () => Boolean(globalThis.browser?.storage?.local) && globalThis.browser.storage.local === store;
  const storageGet = (defaults) => {
    if (!store) return Promise.resolve(defaults);
    if (isPromiseStore()) return store.get(defaults);
    return new Promise((resolve, reject) => {
      store.get(defaults, (values) => {
        const error = api.runtime?.lastError;
        if (error) reject(new Error(error.message));
        else resolve(values);
      });
    });
  };
  const storageSet = (patch) => {
    if (!store) return Promise.resolve();
    if (isPromiseStore()) return store.set(patch);
    return new Promise((resolve, reject) => {
      store.set(patch, () => {
        const error = api.runtime?.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  };
  const statusNode = document.getElementById("popup-status");
  const state = { ...DEFAULTS };
  let statusTimer = 0;
  let tree = null;
  const setStatus = (message, revert = true) => {
    if (!statusNode) return;
    statusNode.textContent = message;
    clearTimeout(statusTimer);
    if (revert) {
      statusTimer = setTimeout(() => {
        statusNode.textContent = UI_STRINGS.savedLocally;
      }, 1500);
    }
  };
  const renderStatic = () => {
    document.title = UI_STRINGS.appName;
    const title = document.getElementById("popup-title");
    const tabList = document.getElementById("popup-tabs");
    const dislikeLink = document.getElementById("popup-dislike-link");
    if (title) title.textContent = UI_STRINGS.appName;
    if (tabList) tabList.setAttribute("aria-label", UI_STRINGS.settingGroups);
    if (dislikeLink) dislikeLink.textContent = UI_STRINGS.dislikeData;
    if (statusNode) statusNode.textContent = UI_STRINGS.savedLocally;
  };
  const syncValues = () => {
    tree?.sync(state);
  };
  const buildShell = () => {
    const tabList = document.getElementById("popup-tabs");
    const panelHost = document.getElementById("popup-panels");
    if (!tabList || !panelHost) return;
    tree = createSettingsTree({
      prefix: "popup",
      orientation: "horizontal",
      tabHost: tabList,
      panelHost,
      panelClass: "popup-panel",
      rowClass: "popup-row",
      switchInputClass: "popup-switch-input",
      badgeClass: "popup-layer",
      onChange: (key, value) => {
        const previous = Boolean(state[key]);
        state[key] = value;
        syncValues();
        storageSet({ [key]: value }).then(() => setStatus(UI_STRINGS.saved)).catch(() => {
          state[key] = previous;
          syncValues();
          setStatus(UI_STRINGS.saveError);
        });
      },
      onCategoriesChange: (value) => {
        const saved = JSON.stringify(value);
        storageSet({ sponsorblockCategories: saved }).then(() => {
          state.sponsorblockCategories = saved;
          setStatus(UI_STRINGS.saved);
        }).catch(() => setStatus(UI_STRINGS.saveCategoriesError));
      },
      onNoticeChange: (value) => {
        storageSet({ sponsorblockNotice: value }).then(() => {
          state.sponsorblockNotice = value;
          setStatus(UI_STRINGS.saved);
        }).catch(() => setStatus(UI_STRINGS.saveNoticeError));
      },
      onProgressChange: (value) => {
        storageSet({ sponsorblockProgressBar: value }).then(() => {
          state.sponsorblockProgressBar = value;
          setStatus(UI_STRINGS.saved);
        }).catch(() => setStatus(UI_STRINGS.saveSettingFailed));
      }
    });
    syncValues();
  };
  const renderBrand = () => {
    const brand = document.getElementById("popup-brand");
    if (brand) brand.appendChild(createBrandMark(16));
  };
  const renderMeta = () => {
    const version = api?.runtime?.getManifest?.().version || "2.4.3";
    const manifestVersion = api?.runtime?.getManifest?.().manifest_version || 3;
    const versionNode = document.getElementById("popup-version");
    const targetNode = document.getElementById("popup-target");
    if (versionNode) versionNode.textContent = UI_TEXT.versionSettings(version);
    if (targetNode) targetNode.textContent = UI_TEXT.manifestTarget(manifestVersion);
  };
  const subscribeToStorage = () => {
    const onChanged = api?.storage?.onChanged;
    if (!onChanged?.addListener) return;
    onChanged.addListener((changes, areaName) => {
      if (areaName && areaName !== "local") return;
      let touched = false;
      for (const key of STORAGE_KEYS) {
        if (!(key in changes)) continue;
        const next = changes[key]?.newValue;
        state[key] = next === void 0 || next === null ? DEFAULTS[key] : next;
        touched = true;
      }
      if (touched) syncValues();
    });
  };
  const start = async () => {
    renderStatic();
    renderBrand();
    renderMeta();
    buildShell();
    subscribeToStorage();
    const defaults = { ...DEFAULTS };
    try {
      const values = await storageGet(defaults);
      for (const key of STORAGE_KEYS) {
        const value = values?.[key];
        state[key] = value === void 0 || value === null ? DEFAULTS[key] : value;
      }
      syncValues();
      setStatus(UI_STRINGS.savedLocally, false);
    } catch (error) {
      console.error("YT SuperTool could not load popup settings:", error);
      setStatus(UI_STRINGS.loadError, false);
      syncValues();
    }
  };
  start();
})();
