import { UI_STRINGS, UI_TEXT } from './ui/strings.js';

const VERSION_URL = 'https://raw.githubusercontent.com/CheemsGalaxy/YT-SuperTool/main/src/manifests/base.manifest.json';
const RELEASE_URL = 'https://github.com/CheemsGalaxy/YT-SuperTool/releases/tag/Release';
const USERSCRIPT_URL = 'https://raw.githubusercontent.com/CheemsGalaxy/YT-SuperTool/main/dist/userscript/yt-supertool.user.js';
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;
const LAST_CHECK_KEY = 'updateLastCheck';
const NOTIFIED_KEY = 'updateNotifiedVersion';

const parseVersion = (value) =>
  String(value || '')
    .split('.')
    .map((part) => parseInt(part, 10) || 0);

export const compareVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
};

export function createUpdateChecker({ bridge, toast, currentVersion }) {
  let latest = '';
  let available = false;
  const downloadUrl = bridge.env === 'userscript' ? USERSCRIPT_URL : RELEASE_URL;

  const readRemoteVersion = async () => {
    const response = await bridge.network.request(VERSION_URL, { responseType: 'json', timeout: 8000 });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    const version = String(data?.version || '');
    if (!version) throw new Error('Missing remote version');
    return version;
  };

  const check = async () => {
    try {
      const remote = await readRemoteVersion();
      latest = remote;
      available = compareVersions(remote, currentVersion) > 0;
      await bridge.storage.set(LAST_CHECK_KEY, Date.now());
      return {
        status: available ? 'available' : 'current',
        current: currentVersion,
        latest: remote,
        downloadUrl
      };
    } catch (error) {
      return {
        status: 'error',
        current: currentVersion,
        latest: '',
        error: error?.message || UI_STRINGS.updateCheckFailed,
        downloadUrl
      };
    }
  };

  const auto = async () => {
    try {
      const last = Number(await bridge.storage.get(LAST_CHECK_KEY, 0)) || 0;
      if (Date.now() - last < CHECK_INTERVAL) return null;
      const result = await check();
      if (result.status !== 'available') return result;
      const notified = await bridge.storage.get(NOTIFIED_KEY, '');
      if (notified !== result.latest) {
        toast?.show(UI_TEXT.updateAvailable(result.latest));
        await bridge.storage.set(NOTIFIED_KEY, result.latest);
      }
      return result;
    } catch {
      return null;
    }
  };

  return {
    check,
    auto,
    openDownload() {
      bridge.openExternal?.(downloadUrl);
    },
    get latest() {
      return latest;
    },
    get available() {
      return available;
    },
    get downloadUrl() {
      return downloadUrl;
    }
  };
}
