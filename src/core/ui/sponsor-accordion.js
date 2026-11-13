import { createElement } from '../dom-safe.js';
import { SPONSOR_CATEGORIES } from '../settings-schema.js';
import { UI_STRINGS } from './strings.js';

export function createSponsorAccordion({ onChange, onNoticeChange, onProgressChange } = {}) {
  const inputs = new Map();
  const list = createElement('div', { className: 'ytst-sb-list' });

  Object.entries(SPONSOR_CATEGORIES).forEach(([key, category]) => {
    const input = createElement('input', { type: 'checkbox' });
    input.checked = Boolean(category.enabled);
    input.dataset.category = key;
    const dot = createElement('span', { className: 'ytst-sb-dot', 'aria-hidden': 'true' });
    dot.style.backgroundColor = category.color;
    const label = createElement('label', { className: 'ytst-sb-cat' }, [
      input,
      dot,
      createElement('span', { textContent: category.label })
    ]);
    inputs.set(key, input);
    list.appendChild(label);
  });

  const notice = createElement('input', { type: 'checkbox' });
  notice.checked = true;
  notice.id = `ytst-sb-notice-${Math.random().toString(36).slice(2, 8)}`;
  const noticeLabel = createElement('label', { className: 'ytst-sb-notice', for: notice.id }, [
    notice,
    createElement('span', { textContent: UI_STRINGS.showSkipNotice })
  ]);

  const progress = createElement('input', { type: 'checkbox' });
  progress.checked = true;
  progress.id = `ytst-sb-progress-${Math.random().toString(36).slice(2, 8)}`;
  const progressLabel = createElement('label', {
    className: 'ytst-sb-notice ytst-sb-progress',
    for: progress.id
  }, [
    progress,
    createElement('span', { textContent: UI_STRINGS.showProgressBar })
  ]);

  const inner = createElement('div', { className: 'ytst-sb-inner' }, [list, noticeLabel, progressLabel]);
  const element = createElement('div', {
    className: 'ytst-sb',
    'aria-hidden': 'true',
    dataset: { open: 'false' }
  }, [inner]);
  element.inert = true;

  const getCategories = () => Object.fromEntries(
    [...inputs.entries()].map(([key, input]) => [key, input.checked])
  );

  list.addEventListener('change', () => onChange?.(getCategories()));
  notice.addEventListener('change', () => onNoticeChange?.(Boolean(notice.checked)));
  progress.addEventListener('change', () => onProgressChange?.(Boolean(progress.checked)));

  const setOpen = (open) => {
    const next = Boolean(open);
    if (element.dataset.open === String(next)) return;
    element.dataset.open = String(next);
    element.setAttribute('aria-hidden', String(!next));
    element.inert = !next;
  };

  const setCategories = (saved) => {
    let parsed = saved;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = {};
      }
    }
    inputs.forEach((input, key) => {
      const fallback = Boolean(SPONSOR_CATEGORIES[key]?.enabled);
      input.checked = typeof parsed?.[key] === 'boolean' ? parsed[key] : fallback;
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

export default createSponsorAccordion;
