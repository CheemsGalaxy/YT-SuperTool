import { ADBLOCK_HINT, ADBLOCK_TERMS_HINT } from '../../locale-patterns.js';

const AD_KEYS = [
  'adPlacements',
  'playerAds',
  'adSlots',
  'adBreakHeartbeatParams',
  'adParams',
  'adSafetyReason',
  'adBreakParams',
  'playerAdParams',
  'adConfig',
  'adBreakServiceRenderer',
  'adBreakService',
  'adBreak',
  'adBreaks',
  'adPod',
  'adPods',
  'adVideoId',
  'adVideoIds',
  'adThumbnail',
  'adThumbnailDetails',
  'paidContentOverlay'
];

const AD_KEYS_SET = new Set(AD_KEYS);
const AD_KEY_PATTERN = new RegExp(
  `"(${AD_KEYS.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})"\\s*:`,
  'g'
);
const RENAMED_PREFIX = 'ytst_no_ads_';
const MAX_DEPTH = 12;
const MAX_NODES = 12000;

export const rewriteAdKeys = (text) => {
  if (typeof text !== 'string' || text.length === 0) return text;
  return text.replace(AD_KEY_PATTERN, (match, key) => `"${RENAMED_PREFIX}${key}":`);
};

export const sanitizeResponseText = (text) => {
  if (typeof text !== 'string' || text.length === 0) return text;
  const rewritten = rewriteAdKeys(text);
  const hasEnforcement = text.includes('enforcementMessageViewModel')
    || text.includes('adBlockMessageViewModel')
    || (text.includes('errorScreen') && ADBLOCK_HINT.test(text));
  if (!hasEnforcement) return rewritten;

  try {
    const parsed = JSON.parse(rewritten);
    sanitizePlayerResponse(parsed);
    return JSON.stringify(parsed);
  } catch {
    return rewritten;
  }
};

const hasAntiAdblockMessage = (status) => {
  if (!status || typeof status !== 'object') return false;
  if (status.enforcementMessageViewModel || status.adBlockMessageViewModel) return true;
  try {
    const text = JSON.stringify(status);
    if (!ADBLOCK_HINT.test(text)) return false;
    return Boolean(status.errorScreen) || ADBLOCK_TERMS_HINT.test(text);
  } catch {
    return false;
  }
};

const sanitizePlayabilityStatus = (status) => {
  if (!status || typeof status !== 'object') return;

  const enforced = Boolean(status.enforcementMessageViewModel || status.adBlockMessageViewModel)
    || (status.status === 'ERROR' && hasAntiAdblockMessage(status));
  delete status.enforcementMessageViewModel;
  delete status.adBlockMessageViewModel;

  if (enforced) {
    status.status = 'OK';
    delete status.reason;
    delete status.errorScreen;
    delete status.messages;
    delete status.subreason;
  }
};

const walk = (node, depth, counter) => {
  if (!node || typeof node !== 'object') return;
  if (depth > MAX_DEPTH || counter.count > MAX_NODES) return;
  counter.count += 1;

  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      walk(node[index], depth + 1, counter);
    }
    return;
  }

  for (const key of Object.keys(node)) {
    if (AD_KEYS_SET.has(key)) {
      const value = node[key];
      try {
        delete node[key];
      } catch {
        node[key] = undefined;
      }
      try {
        node[`${RENAMED_PREFIX}${key}`] = value;
      } catch {

      }
      continue;
    }
    if (key === 'enforcementMessageViewModel' || key === 'adBlockMessageViewModel') {
      try {
        delete node[key];
      } catch {
        node[key] = undefined;
      }
      continue;
    }
    if (key === 'playabilityStatus') {
      sanitizePlayabilityStatus(node[key]);
      continue;
    }
    walk(node[key], depth + 1, counter);
  }
};

export function sanitizePlayerResponse(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  walk(payload, 0, { count: 0 });
  return payload;
}

export const isPlayerEndpoint = (url) => (
  typeof url === 'string'
  && /\/youtubei\/v1\/(?:player|next|get_watch|reel|reel_watch_sequence|updated_metadata)\b/.test(url)
);

export const isYouTubeAdEndpoint = (url) => {
  if (typeof url !== 'string' || url.length === 0) return false;
  return /\/youtubei\/v1\/ads(?:\/|\b)/.test(url)
    || /\/pagead\//.test(url)
    || /\/api\/stats\/(?:ads|atr|delayplay)\b/.test(url)
    || /\/ptracking\b/.test(url)
    || /[?&]adformat=/.test(url)
    || /\/get_video_info\?.*(?:adformat|ad_type)=/.test(url);
};

export const hasAdPayload = (text) => {
  if (typeof text !== 'string' || text.length === 0) return false;
  if (text.includes('enforcementMessageViewModel')
    || text.includes('adBlockMessageViewModel')
    || text.includes('errorScreen')) return true;
  return AD_KEYS.some((key) => text.includes(key));
};

export default sanitizePlayerResponse;
