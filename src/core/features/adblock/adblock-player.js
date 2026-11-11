import { ADBLOCK_HINT, ADBLOCK_TERMS_HINT } from '../../locale-patterns.js';

const AD_KEYS = [
  'adPlacements',
  'playerAds',
  'adSlots',
  'adBreakHeartbeatParams',
  'adParams',
  'adSafetyReason'
];

const AD_KEYS_SET = new Set(AD_KEYS);
const AD_KEY_PATTERN = /"(adPlacements|playerAds|adSlots|adBreakHeartbeatParams|adParams|adSafetyReason)"\s*:/g;
const RENAMED_PREFIX = 'ytst_no_ads_';
const MAX_DEPTH = 8;
const MAX_NODES = 6000;

export const rewriteAdKeys = (text) => {
  if (typeof text !== 'string' || text.length === 0) return text;
  return text.replace(AD_KEY_PATTERN, (match, key) => `"${RENAMED_PREFIX}${key}":`);
};

const hasAntiAdblockMessage = (status) => {
  if (!status || typeof status !== 'object') return false;
  if (status.enforcementMessageViewModel) return true;
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

  const enforced = status.status === 'ERROR' && hasAntiAdblockMessage(status);
  delete status.enforcementMessageViewModel;

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
    if (key === 'enforcementMessageViewModel') {
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
  typeof url === 'string' && /\/youtubei\/v1\/(?:player|next|get_watch)\b/.test(url)
);

export const hasAdPayload = (text) => {
  if (typeof text !== 'string' || text.length === 0) return false;
  return text.includes('adPlacements')
    || text.includes('playerAds')
    || text.includes('adSlots')
    || text.includes('adBreakHeartbeatParams')
    || text.includes('enforcementMessageViewModel')
    || text.includes('errorScreen');
};

export default sanitizePlayerResponse;
