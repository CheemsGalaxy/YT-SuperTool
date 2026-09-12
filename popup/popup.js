// popup/popup.js

const settings = [
  // CHẶN & LÀM SẠCH
  { key: 'noShorts', label: 'No Shorts', description: 'Hide Shorts shelves and navigation', defaultValue: true },
  { key: 'cleanHomepage', label: 'Clean Homepage', description: 'Hide Premium promos and Playables', defaultValue: true },

  // CẢI THIỆN NỘI DUNG
  { key: 'dislike', label: 'Return Dislike', description: 'Show estimated dislike counts', defaultValue: true },
  { key: 'nonstop', label: 'Auto Continue', description: 'Remove the continue watching interruption', defaultValue: true },

  // ĐIỀU KHIỂN PLAYER
  { key: 'speed', label: 'Playback Speed', description: 'Add speed controls to the player', defaultValue: true },
  { key: 'pip', label: 'Picture in Picture', description: 'Watch video in a floating window', defaultValue: true },
  { key: 'screenshot', label: 'Screenshot', description: 'Capture the current video frame', defaultValue: true },
  { key: 'downloader', label: 'Downloader', description: 'Add a download control to the player', defaultValue: false }
];

const root = document.getElementById('settings');
const syncStatus = document.getElementById('sync-status');
const defaults = Object.fromEntries(settings.map(setting => [setting.key, setting.defaultValue]));

function createToggle({ key, label, description }) {
  const row = document.createElement('label');
  row.className = 'toggle-item';
  row.htmlFor = key;

  const copy = document.createElement('span');
  copy.className = 'toggle-copy';

  const title = document.createElement('span');
  title.className = 'toggle-label';
  title.textContent = label;

  const details = document.createElement('span');
  details.className = 'toggle-description';
  details.textContent = description;

  const input = document.createElement('input');
  input.className = 'toggle-input';
  input.id = key;
  input.type = 'checkbox';

  const switchControl = document.createElement('span');
  switchControl.className = 'toggle-switch';
  switchControl.setAttribute('aria-hidden', 'true');

  copy.append(title, details);
  row.append(copy, input, switchControl);
  return row;
}

settings.forEach(setting => root.append(createToggle(setting)));
root.addEventListener('change', event => {
  const input = event.target;
  if (input.type !== 'checkbox') return;
  chrome.storage.local.set({ [input.id]: input.checked }, () => {
    syncStatus.textContent = chrome.runtime.lastError ? 'Unable to save setting' : 'Settings saved locally';
  });
});
document.getElementById('feature-count').textContent = `${settings.length} tools`;

chrome.storage.local.get(defaults, values => {
  settings.forEach(({ key }) => {
    document.getElementById(key).checked = Boolean(values[key]);
  });
});
