import { NETWORK_FILTERS } from './adblock-filters.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseRule = (rule) => {
  if (typeof rule !== 'string') return null;
  const trimmed = rule.trim();
  if (!trimmed || trimmed.startsWith('!')) return null;

  const exception = trimmed.startsWith('@@');
  const body = (exception ? trimmed.slice(2) : trimmed).replace(/^\|\|/, '');
  if (!body || body.startsWith('|')) return null;

  const slash = body.indexOf('/');
  let host = slash === -1 ? body : body.slice(0, slash);
  const path = slash === -1 ? '' : body.slice(slash);
  host = host.replace(/\^$/, '').toLowerCase();
  if (!host) return null;

  let pathPattern = null;
  if (path.includes('*')) {
    pathPattern = new RegExp(`^${escapeRegex(path).replace(/\\\*/g, '.*')}`);
  }

  return { host, path, pathPattern, exception };
};

const RULES = NETWORK_FILTERS.map(parseRule).filter(Boolean);
const EXCEPTIONS = RULES.filter((rule) => rule.exception);
const BLOCKS = RULES.filter((rule) => !rule.exception);

const matchesRule = (rule, hostname, target) => {
  if (hostname !== rule.host && !hostname.endsWith(`.${rule.host}`)) return false;
  if (!rule.path) return true;
  if (rule.pathPattern) return rule.pathPattern.test(target);
  return target.startsWith(rule.path);
};

export function matchRequest(_win, url) {
  if (typeof url !== 'string' || !url) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

  const hostname = parsed.hostname.toLowerCase();
  const target = `${parsed.pathname}${parsed.search}`;

  if (EXCEPTIONS.some((rule) => matchesRule(rule, hostname, target))) return false;
  return BLOCKS.some((rule) => matchesRule(rule, hostname, target));
}

export default matchRequest;
