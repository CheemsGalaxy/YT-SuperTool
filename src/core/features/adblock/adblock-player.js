export const AD_KEYS = [
  'adPlacements',
  'playerAds',
  'adSlots',
  'adBreakHeartbeatParams',
  'adParams',
  'adSafetyReason'
];

const AD_KEYS_SET = new Set(AD_KEYS);
const ANTI_ADBLOCK_HINT = /ad[\s-]?block|terms of service|monetization|enforcement message/i;
const MAX_DEPTH = 8;
const MAX_NODES = 6000;

const hasAntiAdblockMessage = (status) => {
  if (!status || typeof status !== 'object') return false;
  if (status.enforcementMessageViewModel) return true;
  try {
    return ANTI_ADBLOCK_HINT.test(JSON.stringify(status));
  } catch {
    return false;
  }
};

const sanitizePlayabilityStatus = (status) => {
  if (!status || typeof status !== 'object') return;

  const enforced = hasAntiAdblockMessage(status);
  delete status.enforcementMessageViewModel;

  if (enforced && status.status === 'ERROR') {

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
    if (AD_KEYS_SET.has(key) || key === 'enforcementMessageViewModel') {
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
