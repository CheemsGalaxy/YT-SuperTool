import { createElement } from '../dom-safe.js';

export function createToast() {
  let element = null;
  let timer = 0;

  const ensure = () => {
    if (element?.isConnected) return element;
    const parent = document.body || document.documentElement;
    if (!parent) return null;
    element = createElement('div', {
      className: 'ytst-toast',
      role: 'status',
      'aria-live': 'polite'
    });
    parent.appendChild(element);
    return element;
  };

  const show = (message, duration = 2000) => {
    const node = ensure();
    if (!node) return;
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(timer);
    timer = setTimeout(() => node.classList.remove('is-visible'), duration);
  };

  return { show };
}

export default createToast;
