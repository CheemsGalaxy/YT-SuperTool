import { createUserscriptBridge } from './userscript.adapter.js';
import { createExtensionBridge } from './extension.adapter.js';

const detectTarget = () => {
  const gm = globalThis.GM;
  if (gm?.getValue || gm?.xmlHttpRequest) return 'userscript';
  if (typeof GM_getValue === 'function' || typeof GM_xmlhttpRequest === 'function') return 'userscript';
  if ((globalThis.browser || globalThis.chrome)?.runtime?.id) return 'mv3';
  return 'page';
};

export const target = typeof __TARGET__ !== 'undefined' ? __TARGET__ : detectTarget();

export const bridge = target === 'userscript'
  ? createUserscriptBridge()
  : createExtensionBridge(target);

if (typeof window !== 'undefined') {
  window.ytsBridge = bridge;
}

export default bridge;
