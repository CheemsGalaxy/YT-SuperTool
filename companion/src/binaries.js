import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, createReadStream, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ENV_KEYS = { ytdlp: 'YTST_YTDLP_PATH', ffmpeg: 'YTST_FFMPEG_PATH' };

const binaryNames = (name, platform) => {
  if (name === 'ytdlp') return platform === 'win32' ? ['yt-dlp.exe'] : ['yt-dlp'];
  return platform === 'win32' ? ['ffmpeg.exe'] : ['ffmpeg'];
};

const isFile = (file) => {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
};

const lookupPath = (entryNames, pathEnv, platform) => {
  const entries = String(pathEnv ?? '').split(path.delimiter).filter(Boolean);
  const extensions = platform === 'win32'
    ? String(process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').filter(Boolean)
    : [''];

  for (const entry of entries) {
    for (const name of entryNames) {
      const variants = platform === 'win32' && !name.toLowerCase().endsWith('.exe')
        ? [name, ...extensions.map((extension) => `${name}${extension.toLowerCase()}`)]
        : [name];
      for (const variant of variants) {
        const candidate = path.join(entry, variant);
        try {
          accessSync(candidate, constants.X_OK);
          if (isFile(candidate)) return candidate;
        } catch {}
      }
    }
  }

  return null;
};

const hashFile = (file) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(file);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const readManifest = async (binDir) => {
  if (!binDir) return null;
  const file = path.join(binDir, 'manifest.json');
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed && typeof parsed.files === 'object' && parsed.files) return parsed;
    return null;
  } catch {
    return null;
  }
};

const probeVersion = (name, file) => {
  const args = name === 'ytdlp' ? ['--version'] : ['-version'];
  try {
    const result = spawnSync(file, args, { encoding: 'utf8', timeout: 8000, windowsHide: true });
    if (result.status !== 0) return null;
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    if (name === 'ytdlp') {
      const line = String(result.stdout ?? '').split(/\r?\n/).find((item) => item.trim());
      return line ? line.trim() : null;
    }
    const match = output.match(/ffmpeg version (\S+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

export const detectBinaries = async ({ env = process.env, binDir = null, platform = process.platform, probe = true } = {}) => {
  const manifest = await readManifest(binDir);

  const resolveOne = async (name) => {
    const candidates = [];
    const override = env[ENV_KEYS[name]];
    if (override) candidates.push(path.resolve(override));
    if (binDir) {
      for (const file of binaryNames(name, platform)) candidates.push(path.join(binDir, file));
    }
    const fromSystem = lookupPath(binaryNames(name, platform), env.PATH, platform);
    if (fromSystem) candidates.push(fromSystem);

    for (const candidate of candidates) {
      if (!isFile(candidate)) continue;

      const expected = manifest?.files?.[path.basename(candidate)];
      const inBinDir = binDir && path.resolve(path.dirname(candidate)) === path.resolve(binDir);
      if (expected && inBinDir) {
        const actual = await hashFile(candidate);
        if (actual.toLowerCase() !== String(expected).toLowerCase()) {
          return { available: false, error: 'CHECKSUM_MISMATCH', path: candidate, version: null };
        }
      }

      if (!probe) return { available: true, error: null, path: candidate, version: null };

      const version = probeVersion(name, candidate);
      if (version) return { available: true, error: null, path: candidate, version };
      return { available: false, error: 'PROBE_FAILED', path: candidate, version: null };
    }

    return { available: false, error: 'NOT_FOUND', path: null, version: null };
  };

  return {
    ytdlp: await resolveOne('ytdlp'),
    ffmpeg: await resolveOne('ffmpeg')
  };
};

export const binariesSummary = (binaries) => ({
  ytdlp: { available: Boolean(binaries?.ytdlp?.available), version: binaries?.ytdlp?.version ?? null },
  ffmpeg: { available: Boolean(binaries?.ffmpeg?.available), version: binaries?.ffmpeg?.version ?? null }
});
