import { createIcon } from './icons.js';

export function createLauncher({ onOpen }) {
  const handleClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpen();
  };

  const ensureHeader = () => {
    const end = document.querySelector('#end.ytd-masthead') || document.getElementById('end');
    if (!end) return null;
    const existing = document.querySelector('.ytst-header-button');
    if (existing) return existing;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ytst-header-button';
    button.title = 'YT SuperTool settings';
    button.setAttribute('aria-label', 'YT SuperTool settings');
    button.appendChild(createIcon('sliders', 20));
    button.addEventListener('click', handleClick);

    const anchor = end.querySelector('#buttons, ytd-topbar-menu-button-renderer, ytd-notification-topbar-button-renderer');
    if (anchor) anchor.insertAdjacentElement('beforebegin', button);
    else end.appendChild(button);
    return button;
  };

  const ensurePlayer = (player) => {
    const controls = player?.querySelector('.ytp-right-controls');
    if (!controls) return null;
    const existing = controls.querySelector('[data-ytst="launcher"]');
    if (existing) return existing;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ytp-button ytst-player-button';
    button.dataset.ytst = 'launcher';
    button.title = 'YT SuperTool settings';
    button.setAttribute('aria-label', 'YT SuperTool settings');
    button.appendChild(createIcon('sliders', 24));
    button.addEventListener('click', handleClick);

    const anchor = controls.querySelector('.ytp-settings-button') || controls.querySelector('.ytp-subtitles-button');
    if (anchor) anchor.insertAdjacentElement('beforebegin', button);
    else controls.prepend(button);
    return button;
  };

  return { ensureHeader, ensurePlayer };
}

export default createLauncher;
