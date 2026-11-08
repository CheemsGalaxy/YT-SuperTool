import { createDislike } from './dislike.js';
import { createNoShorts } from './no-shorts.js';
import { createCleanHomepage } from './clean-homepage.js';
import { createNonstop } from './nonstop.js';
import { createSponsorBlock } from './sponsorblock.js';
import { createSpeed } from './speed.js';
import { createPiP } from './pip.js';
import { createScreenshot } from './screenshot.js';
import { createDownloader } from './downloader.js';
import { createAdblock } from './adblock/index.js';

export function createFeatures(context) {
  return {
    dislike: createDislike(context),
    noShorts: createNoShorts(context),
    cleanHomepage: createCleanHomepage(context),
    nonstop: createNonstop(context),
    sponsorblock: createSponsorBlock(context),
    speed: createSpeed(context),
    pip: createPiP(context),
    screenshot: createScreenshot(context),
    downloader: createDownloader(context),
    adblock: createAdblock(context)
  };
}

export default createFeatures;
