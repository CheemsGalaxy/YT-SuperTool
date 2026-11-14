import { startBackground } from './background.entry.js';
import { initAdblockBackground } from './adblock-background.js';

startBackground();

initAdblockBackground().catch((error) => {
  console.warn('YT SuperTool adblock background failed to start:', error);
});
