import { installAdblockPrune } from '../core/features/adblock/adblock-prune.js';
import { installAdblockStealth } from '../core/features/adblock/adblock-stealth.js';
import { installNetworkGuard } from '../core/features/adblock/adblock-network.js';

const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
const stealth = installAdblockStealth(pageWindow);
installAdblockPrune(pageWindow);
installNetworkGuard(pageWindow);

document.addEventListener('ytst-adblock-change', (event) => {
  if (event.detail?.enabled) stealth?.start?.();
  else stealth?.stop?.();
});
