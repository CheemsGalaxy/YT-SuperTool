import { installAdblockPrune } from '../core/features/adblock/adblock-prune.js';
import { installAdblockStealth } from '../core/features/adblock/adblock-stealth.js';
import { installNetworkGuard } from '../core/features/adblock/adblock-network.js';

const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
installAdblockStealth(pageWindow);
installAdblockPrune(pageWindow);
installNetworkGuard(pageWindow);
