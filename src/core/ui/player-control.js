import { createIcon } from './icons.js';

const NATIVE_CONTROL = [
  '.ytp-settings-button',
  '.ytp-subtitles-button',
  '.ytp-fullscreen-button',
  '.ytp-right-controls .ytp-button'
];

function alignWithNative(button) {
  if (!button) return;
  const native = NATIVE_CONTROL.map((selector) => document.querySelector(selector)).find(Boolean);
  if (!native) return;
  const computed = getComputedStyle(native);
  button.style.width = computed.width;
  button.style.height = computed.height;
  button.style.padding = computed.padding;
  button.style.boxSizing = 'border-box';
}

export function getInsertAnchor(controls) {
  if (!controls) return null;
  return controls.querySelector('.ytp-settings-button')
    || controls.querySelector('.ytp-subtitles-button')
    || controls.querySelector('.ytp-fullscreen-button');
}

export function createPlayerControl({ player, id, label, icon, onClick }) {
  const controls = player?.querySelector('.ytp-right-controls');
  if (!controls) return null;
  if (controls.querySelector(`[data-ytst="${id}"]`)) return null;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ytp-button ytst-player-button';
  button.dataset.ytst = id;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.appendChild(createIcon(icon, 24));
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.(event, button);
  });

  const anchor = getInsertAnchor(controls);
  if (anchor) anchor.insertAdjacentElement('beforebegin', button);
  else controls.prepend(button);
  alignWithNative(button);
  return button;
}

export function removePlayerControl(id) {
  document.querySelectorAll(`[data-ytst="${id}"]`).forEach((button) => button.remove());
}

export default createPlayerControl;
