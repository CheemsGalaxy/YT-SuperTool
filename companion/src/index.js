#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBinaries } from './binaries.js';
import { createJobManager } from './jobs.js';
import { createLog } from './log.js';
import { createPairing, formatPairingCode } from './pairing.js';
import { createServer } from './server.js';
import { createSettings } from './settings.js';
import { createStore } from './store.js';
import { parseYouTubeUrl } from './url-policy.js';
import { analyzeVideo, buildDownloadArgs, parseProgressLine } from './ytdlp.js';

const VERSION = '1.0.0';
const API_VERSION = 1;
const DEFAULT_PORT = 47831;
const BIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', `${process.platform}-${process.arch}`);

const ENV_KEYS = ['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LANG', 'LC_ALL', 'LC_CTYPE'];

const minimalEnv = () => {
  const env = {};
  for (const key of ENV_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
};

const launcher = (job, binaryPath, args) => spawn(binaryPath, args, {
  cwd: job.dir,
  windowsHide: true,
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: minimalEnv()
});

const printHelp = () => {
  console.log(`YT SuperTool Companion ${VERSION}`);
  console.log('');
  console.log('Usage: yt-super-tool-companion [options]');
  console.log('');
  console.log('  --port <number>       Loopback port. Default 47831.');
  console.log('  --data-dir <path>     Settings and token storage. Default ~/.yt-super-tool.');
  console.log('  --output-dir <path>   Download folder. Must be inside the user home.');
  console.log('  --pair                Print a fresh pairing code even when already paired.');
  console.log('  --self-test           Run local checks without downloading media.');
  console.log('  --debug               Include stack traces in local logs.');
  console.log('  --help                Show this text.');
};

const takeValue = (argv, index, inline, flag) => {
  if (inline !== undefined) return { value: inline, next: index };
  const value = argv[index + 1];
  if (value === undefined) throw new Error(`Missing value for ${flag}.`);
  return { value, next: index + 1 };
};

const parseArgs = (argv) => {
  const options = {
    port: DEFAULT_PORT,
    dataDir: null,
    outputDir: null,
    debug: false,
    selfTest: false,
    pair: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const separator = arg.indexOf('=');
    const flag = separator >= 0 ? arg.slice(0, separator) : arg;
    const inline = separator >= 0 ? arg.slice(separator + 1) : undefined;

    switch (flag) {
      case '--port': {
        const taken = takeValue(argv, index, inline, flag);
        options.port = Number(taken.value);
        index = taken.next;
        break;
      }
      case '--data-dir': {
        const taken = takeValue(argv, index, inline, flag);
        options.dataDir = taken.value;
        index = taken.next;
        break;
      }
      case '--output-dir': {
        const taken = takeValue(argv, index, inline, flag);
        options.outputDir = taken.value;
        index = taken.next;
        break;
      }
      case '--debug':
        options.debug = true;
        break;
      case '--self-test':
        options.selfTest = true;
        break;
      case '--pair':
        options.pair = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error('Port must be an integer between 1 and 65535.');
  }

  return options;
};

const listen = (server, port) => new Promise((resolve, reject) => {
  const onError = (error) => {
    server.removeListener('listening', onListening);
    reject(error);
  };
  const onListening = () => {
    server.removeListener('error', onError);
    resolve(server.address());
  };
  server.once('error', onError);
  server.once('listening', onListening);
  server.listen(port, '127.0.0.1');
});

const runSelfTest = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ytst-self-test-'));
  const results = [];
  let server = null;

  const check = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, message: error?.message ?? String(error) });
    }
  };

  try {
    const store = createStore({ dataDir: path.join(root, '.data') });
    const settings = createSettings({ store, homeDir: root });
    await settings.load();

    await check('store roundtrip', async () => {
      await store.save('probe.json', { ok: true });
      const value = await store.load('probe.json', null);
      if (value?.ok !== true) throw new Error('value was not persisted');
    });

    await check('settings defaults', () => {
      const value = settings.get();
      if (!path.isAbsolute(value.outputDir)) throw new Error('outputDir is not absolute');
      if (value.videoQuality !== '1080') throw new Error('unexpected quality default');
    });

    await check('settings reject unsafe path', async () => {
      let rejected = false;
      try {
        await settings.update({ outputDir: path.dirname(root) });
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error('outside-home output dir accepted');
    });

    await check('url policy', () => {
      if (parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ').videoId !== 'dQw4w9WgXcQ') throw new Error('short link rejected');
      let rejected = false;
      try {
        parseYouTubeUrl('https://example.com/watch?v=dQw4w9WgXcQ');
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error('foreign host accepted');
    });

    const pairing = createPairing({ store });
    await pairing.load();
    pairing.startPairing();
    let token = null;

    await check('pairing', async () => {
      const code = pairing.currentCode()?.code;
      if (!code) throw new Error('no pairing code');
      const result = await pairing.pair({ code, clientName: 'userscript' });
      token = result.token;
      if (!(await pairing.verifyToken(token))) throw new Error('issued token rejected');
      if (await pairing.verifyToken('not-a-token')) throw new Error('invalid token accepted');
    });

    const binaries = { ytdlp: { available: false }, ffmpeg: { available: false } };
    const jobs = createJobManager({
      getSettings: () => settings.get(),
      binaries,
      ytdlp: { buildDownloadArgs, parseProgressLine },
      launcher: () => {
        throw new Error('self-test must not start a download');
      },
      homeDir: root
    });

    server = createServer({ pairing, jobs, settings, binaries, ytdlp: {}, version: VERSION, apiVersion: API_VERSION });

    await check('server health', async () => {
      const address = await listen(server, 0);
      const response = await fetch(`http://127.0.0.1:${address.port}/api/health`, { signal: AbortSignal.timeout(5000) });
      const body = await response.json();
      if (response.status !== 200) throw new Error(`health returned ${response.status}`);
      if (body.service !== 'yt-super-tool-companion') throw new Error('service name mismatch');
      if (body.apiVersion !== API_VERSION) throw new Error('api version mismatch');
    });

    await check('server auth', async () => {
      const { port } = server.address();
      const base = `http://127.0.0.1:${port}`;
      const unauthorized = await fetch(`${base}/api/settings`, { signal: AbortSignal.timeout(5000) });
      if (unauthorized.status !== 401) throw new Error('missing token accepted');
      const authorized = await fetch(`${base}/api/settings`, {
        headers: { 'X-YTST-Token': token },
        signal: AbortSignal.timeout(5000)
      });
      if (authorized.status !== 200) throw new Error('valid token rejected');
    });
  } finally {
    if (server) {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    await rm(root, { recursive: true, force: true });
  }

  return results;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.selfTest) {
    const results = await runSelfTest();
    for (const result of results) {
      console.log(`${result.ok ? 'ok' : 'fail'} ${result.name}${result.ok ? '' : `: ${result.message}`}`);
    }
    const failed = results.filter((result) => !result.ok);
    console.log(failed.length === 0 ? 'SELF-TEST OK' : 'SELF-TEST FAILED');
    process.exitCode = failed.length === 0 ? 0 : 1;
    return;
  }

  const dataDir = options.dataDir ? path.resolve(options.dataDir) : path.join(os.homedir(), '.yt-super-tool');
  const store = createStore({ dataDir });
  const settings = createSettings({ store });
  await settings.load();

  if (options.outputDir) {
    await settings.update({ outputDir: path.resolve(options.outputDir) });
  }

  const logger = createLog({ debug: options.debug });

  const pairing = createPairing({
    store,
    onChange: ({ code, expiresAt }) => {
      console.log('');
      console.log(`Pairing code: ${formatPairingCode(code)}`);
      console.log(`Code expires: ${new Date(expiresAt).toISOString()}`);
      console.log('Enter this code in the YT SuperTool Download menu.');
      console.log('');
    }
  });
  await pairing.load();

  if (options.pair || !pairing.isPaired()) pairing.startPairing();

  const binaries = await detectBinaries({ binDir: BIN_DIR });
  const jobs = createJobManager({
    getSettings: () => settings.get(),
    binaries,
    ytdlp: { buildDownloadArgs, parseProgressLine },
    launcher,
    logger
  });

  try {
    await jobs.cleanStale(settings.get().outputDir);
  } catch {}

  const server = createServer({
    pairing,
    jobs,
    settings,
    binaries,
    ytdlp: { analyzeVideo },
    version: VERSION,
    apiVersion: API_VERSION,
    logger
  });

  try {
    await listen(server, options.port);
  } catch (error) {
    console.error(`Cannot listen on 127.0.0.1:${options.port}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`YT SuperTool Companion ${VERSION} (API ${API_VERSION})`);
  console.log(`Listening: http://127.0.0.1:${options.port}`);
  console.log(`Data:      ${dataDir}`);
  console.log(`Output:    ${settings.get().outputDir}`);
  console.log(`yt-dlp:    ${binaries.ytdlp.available ? binaries.ytdlp.version : `missing (${binaries.ytdlp.error})`}`);
  console.log(`FFmpeg:    ${binaries.ffmpeg.available ? binaries.ffmpeg.version : `missing (${binaries.ffmpeg.error})`}`);
  console.log('Keep this window open while downloading. Press Ctrl+C to stop.');

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    console.log('Stopping companion...');
    await jobs.shutdown().catch(() => {});
    server.closeAllConnections?.();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
};

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
});
