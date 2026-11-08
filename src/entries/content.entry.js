import bridge from '../adapters/index.js';
import { initCore } from '../core/index.js';

bridge.injector.injectMainWorld?.();

initCore().catch((error) => {
  console.error('YT SuperTool failed to start:', error);
});
