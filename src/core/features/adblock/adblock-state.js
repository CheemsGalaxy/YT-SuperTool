const MASTER_KEY = 'yt_supertool_adblock';
const PRUNE_KEY = 'yt_supertool_adblock_prune';

const readFlag = (win, key) => {
  try {
    const value = win?.localStorage?.getItem(key);
    if (value === '1') return true;
    if (value === '0') return false;
  } catch {

  }
  return null;
};

export const readAdblockCache = (win) => readFlag(win, MASTER_KEY);

export const readAdblockPruneCache = (win) => readFlag(win, PRUNE_KEY);

export const isAdblockEnabled = (win) => {
  const dataset = win?.document?.documentElement?.dataset;
  if (dataset?.ytstAdblock === 'on') return true;
  if (dataset?.ytstAdblock === 'off') return false;
  return readAdblockCache(win) === true;
};

export const syncAdblockCache = (win, enabled, prune = enabled) => {
  try {
    win?.localStorage?.setItem(MASTER_KEY, enabled ? '1' : '0');
    win?.localStorage?.setItem(PRUNE_KEY, enabled && prune ? '1' : '0');
  } catch {

  }
};

export default isAdblockEnabled;
