// ==UserScript==
// @name         YT SuperTool
// @namespace    https://github.com/CheemsGalaxy/YT-SuperTool
// @version      2.4.2
// @updateURL    https://raw.githubusercontent.com/CheemsGalaxy/YT-SuperTool/main/dist/userscript/yt-supertool.user.js
// @downloadURL  https://raw.githubusercontent.com/CheemsGalaxy/YT-SuperTool/main/dist/userscript/yt-supertool.user.js
// @description  All-in-one YouTube enhancer: ad blocking, clean feed, dislikes, SponsorBlock, speed, PiP, screenshots. Ad blocking is off by default and may not work, since YouTube keeps changing its detection. For best results, use uBlock Origin or uBO Lite.
// @author       CheemsGalaxy
// @license      MIT
// @match        *://*.youtube.com/*
// @exclude      *://music.youtube.com/*
// @exclude      *://studio.youtube.com/*
// @noframes
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        unsafeWindow
// @connect      returnyoutubedislikeapi.com
// @connect      sponsor.ajay.app
// @connect      raw.githubusercontent.com
// ==/UserScript==

import bridge from '../adapters/index.js';
import { installNetworkGuard } from '../core/features/adblock/adblock-network.js';
import { installAdblockPrune } from '../core/features/adblock/adblock-prune.js';
import { installAdblockStealth } from '../core/features/adblock/adblock-stealth.js';
import { initCore } from '../core/index.js';

installAdblockStealth(bridge.mainWindow);
installAdblockPrune(bridge.mainWindow);
installNetworkGuard(bridge.mainWindow);

initCore().catch((error) => {
  console.error('YT SuperTool failed to start:', error);
});
