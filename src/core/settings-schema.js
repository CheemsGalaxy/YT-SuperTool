export const FEATURE_GROUPS = [
  { id: 'browse', label: 'Browse', icon: 'home' },
  { id: 'player', label: 'Player', icon: 'play' },
  { id: 'blocking', label: 'Blocking', icon: 'shield' }
];

export const SPONSOR_CATEGORIES = {
  sponsor: { label: 'Sponsor', color: '#00d400', enabled: true },
  selfpromo: { label: 'Self-promotion', color: '#ffff00', enabled: true },
  interaction: { label: 'Interaction reminder', color: '#cc00ff', enabled: true },
  intro: { label: 'Intro', color: '#00ffff', enabled: false },
  outro: { label: 'Outro', color: '#0202ed', enabled: false },
  preview: { label: 'Preview', color: '#008fd6', enabled: false },
  music_offtopic: { label: 'Off-topic music', color: '#ff9900', enabled: false },
  filler: { label: 'Filler', color: '#7300ff', enabled: false }
};

export const FEATURES = [
  {
    key: 'noShorts',
    group: 'browse',
    label: 'Hide Shorts',
    description: 'Remove Shorts shelves, tabs and feed cards.',
    icon: 'shorts',
    default: true
  },
  {
    key: 'cleanHomepage',
    group: 'browse',
    label: 'Clean homepage',
    description: 'Hide promos, surveys, Playables and live shelves.',
    icon: 'home',
    default: true
  },
  {
    key: 'dislike',
    group: 'player',
    label: 'Return dislike',
    description: 'Show the estimated dislike count on videos.',
    icon: 'thumbdown',
    default: true
  },
  {
    key: 'nonstop',
    group: 'player',
    label: 'Auto continue',
    description: 'Dismiss the “Video paused. Continue watching?” prompt.',
    icon: 'repeat',
    default: true
  },
  {
    key: 'sponsorblock',
    group: 'player',
    label: 'SponsorBlock',
    description: 'Skip community-submitted sponsored segments.',
    icon: 'skip',
    default: true
  },
  {
    key: 'speed',
    group: 'player',
    label: 'Playback speed',
    description: 'Add a speed slider, presets and keyboard shortcuts.',
    icon: 'gauge',
    default: true
  },
  {
    key: 'pip',
    group: 'player',
    label: 'Picture in picture',
    description: 'Pop the video into a floating window.',
    icon: 'pip',
    default: true
  },
  {
    key: 'screenshot',
    group: 'player',
    label: 'Screenshot',
    description: 'Save the current video frame as a PNG.',
    icon: 'camera',
    default: true
  },
  {
    key: 'downloader',
    group: 'player',
    label: 'Downloader',
    description: 'Open the current video in a download page.',
    icon: 'download',
    default: false
  },
  {
    key: 'adblock',
    group: 'blocking',
    label: 'Ad blocking',
    description: 'Optional three-layer ad blocking. Off by default.',
    icon: 'shield',
    default: false
  },
  {
    key: 'adblockPrune',
    group: 'blocking',
    label: 'JSON prune',
    description: 'Strip ad placements from player data before playback.',
    icon: 'braces',
    badge: 'L1',
    default: true,
    dependsOn: 'adblock'
  },
  {
    key: 'adblockCosmetic',
    group: 'blocking',
    label: 'Cosmetic filtering',
    description: 'Hide feed, masthead and sidebar ad slots.',
    icon: 'layers',
    badge: 'L2',
    default: true,
    dependsOn: 'adblock'
  },
  {
    key: 'adblockSkipper',
    group: 'blocking',
    label: 'Player fallback',
    description: 'Mute and skip any ad that still reaches the player.',
    icon: 'fast',
    badge: 'L3',
    default: true,
    dependsOn: 'adblock'
  }
];

export const EXTRA_DEFAULTS = {
  sponsorblockCategories: null,
  sponsorblockNotice: true,
  playbackSpeed: 1
};

export const DEFAULTS = Object.fromEntries([
  ...FEATURES.map((feature) => [feature.key, feature.default]),
  ...Object.entries(EXTRA_DEFAULTS)
]);

export const STORAGE_KEYS = Object.keys(DEFAULTS);
export const MUTATION_FEATURES = ['dislike', 'noShorts', 'cleanHomepage', 'nonstop'];
export const PLAYER_FEATURES = ['speed', 'pip', 'screenshot', 'downloader'];
export const CONTENT_FEATURES = FEATURES.filter((feature) => !feature.dependsOn).map((feature) => feature.key);

export const featuresForGroup = (groupId) => FEATURES.filter((feature) => feature.group === groupId);

export const getFeature = (key) => FEATURES.find((feature) => feature.key === key) || null;
