import { DEFAULTS, STORAGE_KEYS } from './settings-schema.js';

export function createSettings({ storage }) {
  const values = { ...DEFAULTS };
  const listeners = new Set();
  let ready = false;

  const emit = (key) => {
    for (const listener of listeners) {
      try {
        listener(key, values[key], values);
      } catch (error) {
        console.warn('YT SuperTool settings listener failed:', error);
      }
    }
  };

  const get = (key) => values[key];

  const set = async (key, value) => {
    const previous = values[key];
    values[key] = value;
    emit(key);
    try {
      await storage.set(key, value);
      return true;
    } catch (error) {
      console.warn(`YT SuperTool could not save "${key}":`, error);
      values[key] = previous;
      emit(key);
      return false;
    }
  };

  const setMany = async (patch) => {
    await Promise.all(Object.entries(patch).map(([key, value]) => set(key, value)));
  };

  const reset = async () => {
    await setMany(DEFAULTS);
  };

  const load = async () => {
    const entries = await Promise.all(
      Object.keys(DEFAULTS).map(async (key) => [key, await storage.get(key, DEFAULTS[key])])
    );
    entries.forEach(([key, value]) => {
      values[key] = value === undefined || value === null ? DEFAULTS[key] : value;
    });
    ready = true;
    emit(null);
    return values;
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  storage.onChanged((changes) => {
    Object.keys(changes).forEach((key) => {
      if (!STORAGE_KEYS.includes(key)) return;
      const next = changes[key]?.newValue;
      values[key] = next === undefined || next === null ? DEFAULTS[key] : next;
      emit(key);
    });
  }, STORAGE_KEYS);

  return {
    load,
    get,
    set,
    setMany,
    reset,
    subscribe,
    values,
    get ready() {
      return ready;
    }
  };
}

export default createSettings;
