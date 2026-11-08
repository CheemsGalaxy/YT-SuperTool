import { installAdblockPrune } from '../core/features/adblock/adblock-prune.js';
import { installNetworkGuard } from '../core/features/adblock/adblock-network.js';

const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
installAdblockPrune(pageWindow);
installNetworkGuard(pageWindow);
