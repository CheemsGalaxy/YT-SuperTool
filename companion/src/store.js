import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const createStore = ({ dataDir }) => {
  const pathFor = (name) => path.join(dataDir, name);

  const load = async (name, fallback) => {
    const file = pathFor(name);
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return fallback;
      throw error;
    }
    try {
      return JSON.parse(text);
    } catch {
      await rename(file, `${file}.corrupt-${Date.now()}`).catch(() => {});
      return fallback;
    }
  };

  const save = async (name, value) => {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const file = pathFor(name);
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, file);
  };

  return { dataDir, pathFor, load, save };
};
