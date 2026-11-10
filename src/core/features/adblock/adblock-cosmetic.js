import { COSMETIC_FILTERS } from './adblock-filters.js';

const COSMETIC_PREFIX = 'html[data-ytst-adblock="on"][data-ytst-adblock-cosmetic="on"]';

const parseSelector = (rule) => {
  if (typeof rule !== 'string') return null;
  const trimmed = rule.trim();
  if (!trimmed || trimmed.startsWith('!')) return null;
  if (trimmed.includes('#@#') || trimmed.includes('#?#')) return null;

  const marker = trimmed.indexOf('##');
  if (marker === -1) return null;

  const selector = trimmed.slice(marker + 2).trim();
  if (!selector || selector.startsWith('+js(')) return null;

  if (/[{};]/.test(selector)) return null;
  return selector;
};

export function compileCosmeticCss(filters = COSMETIC_FILTERS, prefix = COSMETIC_PREFIX) {
  const selectors = new Set();
  for (const rule of filters) {
    const selector = parseSelector(rule);
    if (selector) selectors.add(selector);
  }
  if (!selectors.size) return '';

  const scoped = [...selectors].map((selector) => `${prefix} ${selector}`);
  return `${scoped.join(',\n')} {\n  display: none !important;\n}\n`;
}

export default compileCosmeticCss;
