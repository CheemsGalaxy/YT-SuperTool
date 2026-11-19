import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'companion', 'dist');
const VIDEO_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

const sha256 = (file) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(file);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, ...options });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => resolve({ code, stdout, stderr }));
});

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

const api = async (base, route, { token, method = 'GET', body, timeout = 30000 } = {}) => {
  const headers = { Origin: 'https://www.youtube.com' };
  if (token) headers['X-YTST-Token'] = token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  });
  const text = await response.text();
  let payload = text;
  try {
    payload = JSON.parse(text);
  } catch {}
  return { status: response.status, payload, headers: response.headers };
};

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const waitForHealth = async (base, child) => {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    if (child.exitCode !== null) throw new Error(`companion exited with ${child.exitCode}`);
    try {
      const result = await api(base, '/api/health', { timeout: 3000 });
      if (result.status === 200) return result.payload;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('companion health did not answer within 30 seconds');
};

const waitForPairingCode = async (readStdout, child) => {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    if (child.exitCode !== null) throw new Error(`companion exited with ${child.exitCode}`);
    const match = readStdout().match(/Pairing code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/);
    if (match) return match[1];
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('pairing code did not appear on stdout');
};

const waitUntil = async (check, message, timeoutMs = 60000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(message);
};

const findZip = async (arg) => {
  if (arg) return path.resolve(arg);
  const entries = await readdir(DIST).catch(() => []);
  const zips = entries.filter((entry) => entry.startsWith('yt-supertool-companion-') && entry.endsWith('.zip'));
  expect(zips.length > 0, `no companion zip in ${DIST}; run npm run package:companion first`);
  zips.sort();
  return path.join(DIST, zips[zips.length - 1]);
};

const checkShaFile = async (zipPath) => {
  const shaFile = `${zipPath}.sha256`;
  const text = await readFile(shaFile, 'utf8').catch(() => {
    throw new Error(`missing ${shaFile}`);
  });
  const expected = text.trim().split(/\s+/)[0].toLowerCase();
  const actual = await sha256(zipPath);
  expect(actual === expected, `zip checksum mismatch: ${actual} != ${expected}`);
  console.log(`sha256 ${actual}`);
};

const checkLayout = async (stage) => {
  const required = [
    'YT SuperTool Companion.cmd',
    'Install YT SuperTool Companion.cmd',
    'README.txt',
    'LICENSES.txt',
    'package-manifest.json',
    'install/install.ps1',
    'install/install.cmd',
    'install/uninstall.ps1',
    'install/uninstall.cmd',
    'install/pair.ps1',
    'install/pair.cmd',
    'install/status.ps1',
    'install/status.cmd',
    'install/cookies.ps1',
    'install/cookies.cmd',
    'install/open-downloads.ps1',
    'install/open-downloads.cmd',
    'install/companion-common.ps1',
    'install/launch-hidden.vbs',
    'node/node.exe',
    'app/package.json',
    'app/src/index.js',
    'app/bin/win32-x64/yt-dlp.exe',
    'app/bin/win32-x64/ffmpeg.exe',
    'app/bin/win32-x64/ffprobe.exe',
    'app/bin/win32-x64/manifest.json',
    'licenses/node-LICENSE.txt',
    'licenses/ffmpeg-LICENSE.txt',
    'licenses/yt-dlp-LICENSE.txt'
  ];
  for (const relative of required) {
    const info = await stat(path.join(stage, relative)).catch(() => null);
    expect(info?.isFile(), `package is missing ${relative}`);
  }
  const binDir = path.join(stage, 'app', 'bin', 'win32-x64');
  const entries = await readdir(binDir);
  const dlls = entries.filter((entry) => entry.endsWith('.dll'));
  expect(dlls.length >= 7, `package bundles ${dlls.length} ffmpeg DLLs, expected 7 or more`);
  expect(!entries.includes('ffplay.exe'), 'package must not bundle ffplay.exe');
  const manifest = JSON.parse(await readFile(path.join(binDir, 'manifest.json'), 'utf8'));
  for (const entry of [...dlls, 'ffmpeg.exe', 'ffprobe.exe', 'yt-dlp.exe']) {
    expect(typeof manifest.files?.[entry] === 'string', `manifest.json has no checksum for ${entry}`);
  }
  for (const entry of ['ffmpeg.exe', 'ffprobe.exe', 'yt-dlp.exe', ...dlls]) {
    const actual = await sha256(path.join(binDir, entry));
    expect(actual === manifest.files[entry], `manifest checksum mismatch for ${entry}`);
  }
  console.log(`layout ok (${dlls.length} dlls, ${Object.keys(manifest.files).length} checksums)`);

  const packageManifest = JSON.parse(await readFile(path.join(stage, 'package-manifest.json'), 'utf8'));
  const packageFiles = Object.entries(packageManifest.files || {});
  expect(packageFiles.length >= 30, `package manifest lists ${packageFiles.length} files, expected 30 or more`);
  for (const [relative, expected] of packageFiles) {
    const actual = await sha256(path.join(stage, relative.split('/').join(path.sep)));
    expect(actual === expected, `package manifest checksum mismatch for ${relative}`);
  }
  console.log(`package manifest ok (${packageFiles.length} files)`);
};

const main = async () => {
  const zipPath = await findZip(process.argv[2]);
  const info = await stat(zipPath).catch(() => null);
  expect(info?.isFile(), `missing zip ${zipPath}`);
  console.log(`zip ${zipPath} (${info.size} bytes)`);
  await checkShaFile(zipPath);

  const work = await mkdtemp(path.join(os.tmpdir(), 'ytst-smoke-'));
  const unpack = path.join(work, 'unpack');
  const stage = path.join(unpack, 'YT SuperTool Companion');
  const dataDir = path.join(work, 'data');
  const outputDir = path.join(work, 'output');
  let child = null;

  try {
    await mkdir(unpack, { recursive: true });
    const extracted = await run('tar', ['-xf', zipPath, '-C', unpack]);
    expect(extracted.code === 0, `tar failed with ${extracted.code}: ${extracted.stderr.trim()}`);
    console.log('extracted');

    await checkLayout(stage);

    const nodeExe = path.join(stage, 'node', 'node.exe');
    const appEntry = path.join(stage, 'app', 'src', 'index.js');
    const selfTest = await run(nodeExe, [appEntry, '--self-test']);
    expect(selfTest.code === 0, `self-test exited with ${selfTest.code}: ${selfTest.stderr.trim()}`);
    expect(selfTest.stdout.includes('SELF-TEST OK'), 'self-test did not print SELF-TEST OK');
    console.log('self-test ok');

    await mkdir(dataDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const env = { ...process.env };
    delete env.YTST_YTDLP_PATH;
    delete env.YTST_FFMPEG_PATH;

    child = spawn(nodeExe, [appEntry, '--port', String(port), '--data-dir', dataDir, '--output-dir', outputDir], {
      cwd: stage,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    const health = await waitForHealth(base, child);
    expect(health.service === 'yt-super-tool-companion', 'unexpected service name');
    expect(health.apiVersion === 1, `unexpected apiVersion ${health.apiVersion}`);
    expect(health.paired === false, 'fresh data dir should not be paired');
    expect(health.binaries?.ytdlp?.available === true, `bundled yt-dlp unavailable: ${JSON.stringify(health.binaries?.ytdlp)}`);
    expect(health.binaries?.ffmpeg?.available === true, `bundled ffmpeg unavailable: ${JSON.stringify(health.binaries?.ffmpeg)}`);
    console.log(`health ok (yt-dlp ${health.binaries.ytdlp.version}, ffmpeg ${health.binaries.ffmpeg.version})`);

    const unauthorized = await api(base, '/api/settings');
    expect(unauthorized.status === 401, `settings without token returned ${unauthorized.status}`);
    const blockedOrigin = await fetch(`${base}/api/health`, { headers: { Origin: 'https://example.com' } });
    expect(blockedOrigin.status === 403, `foreign origin returned ${blockedOrigin.status}`);
    const version = await api(base, '/api/version');
    expect(version.payload?.minimumClientVersion === '2.4.3', `unexpected minimum client version: ${version.payload?.minimumClientVersion}`);
    console.log('auth and origin checks ok');

    const wrongPair = await api(base, '/api/pair', { method: 'POST', body: { code: 'ZZZZ-ZZZZ', clientName: 'userscript' } });
    expect(wrongPair.status === 401, `wrong pairing code returned ${wrongPair.status}`);
    expect(wrongPair.payload?.error?.code === 'PAIRING_CODE_INVALID', `wrong pairing code error ${JSON.stringify(wrongPair.payload)}`);

    const code = await waitForPairingCode(() => stdout, child);
    const paired = await api(base, '/api/pair', { method: 'POST', body: { code, clientName: 'userscript' } });
    expect(paired.status === 200, `pair returned ${paired.status}: ${JSON.stringify(paired.payload)}`);
    const token = paired.payload?.token;
    expect(typeof token === 'string' && token.length >= 32, 'pair returned no token');
    console.log('pair ok');

    const analyze = await api(base, '/api/analyze', { token, method: 'POST', body: { url: VIDEO_URL }, timeout: 60000 });
    expect(analyze.status === 200, `analyze returned ${analyze.status}: ${JSON.stringify(analyze.payload)}`);
    const heights = (analyze.payload.options?.video || []).map((item) => item.quality);
    expect(heights.includes('360'), `analyze has no 360p preset: ${JSON.stringify(heights)}`);
    console.log(`analyze ok (${analyze.payload.video?.title || 'untitled'}, presets ${heights.join('/')})`);

    const cookieFile = path.join(work, 'cookies.txt');
    await writeFile(cookieFile, '# Netscape HTTP Cookie File\r\n');
    const cookieSetting = await api(base, '/api/settings', { token, method: 'PUT', body: { cookiesFile: cookieFile } });
    expect(cookieSetting.status === 200, `cookie file setting returned ${cookieSetting.status}: ${JSON.stringify(cookieSetting.payload)}`);
    expect(cookieSetting.payload?.settings?.cookiesFromBrowser === null, 'cookie file did not clear the browser source');
    const cookieAnalyze = await api(base, '/api/analyze', { token, method: 'POST', body: { url: VIDEO_URL }, timeout: 60000 });
    expect(cookieAnalyze.status === 200, `cookie file analyze returned ${cookieAnalyze.status}: ${JSON.stringify(cookieAnalyze.payload)}`);
    const clearedCookies = await api(base, '/api/settings', { token, method: 'PUT', body: { cookiesFile: null } });
    expect(clearedCookies.status === 200, `cookie file reset returned ${clearedCookies.status}: ${JSON.stringify(clearedCookies.payload)}`);
    console.log('cookie file analyze ok');

    const cancelTarget = await api(base, '/api/download', {
      token,
      method: 'POST',
      body: { url: VIDEO_URL, mode: 'video', quality: '1440', container: 'mp4' }
    });
    expect(cancelTarget.status === 202, `cancel target returned ${cancelTarget.status}: ${JSON.stringify(cancelTarget.payload)}`);
    const cancelId = cancelTarget.payload?.job?.id;
    await waitUntil(
      async () => (await api(base, `/api/download/${cancelId}`, { token })).payload?.job?.state === 'running',
      'cancel target never started'
    );
    const cancelled = await api(base, `/api/download/${cancelId}/cancel`, { token, method: 'POST' });
    expect(cancelled.status === 202, `cancel returned ${cancelled.status}: ${JSON.stringify(cancelled.payload)}`);
    expect(cancelled.payload?.job?.state === 'cancelled', `cancel left state ${cancelled.payload?.job?.state}`);
    await waitUntil(async () => {
      const files = await readdir(path.join(outputDir, '.ytst-tmp'), { recursive: true }).catch(() => []);
      return files.length === 0;
    }, 'temp files left after cancel', 30000);
    console.log('cancel ok (temp folder cleaned)');

    const readOnlyDir = path.join(work, 'readonly');
    await mkdir(readOnlyDir, { recursive: true });
    const acl = await run('icacls', [readOnlyDir, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:(OI)(CI)(RX)`]);
    expect(acl.code === 0, `icacls failed with ${acl.code}: ${acl.stderr.trim()}`);
    const changed = await api(base, '/api/settings', { token, method: 'PUT', body: { outputDir: readOnlyDir } });
    expect(changed.status === 200, `settings update returned ${changed.status}: ${JSON.stringify(changed.payload)}`);
    const blocked = await api(base, '/api/download', {
      token,
      method: 'POST',
      body: { url: VIDEO_URL, mode: 'video', quality: '360', container: 'mp4' }
    });
    expect(blocked.status === 503, `read-only output returned ${blocked.status}: ${JSON.stringify(blocked.payload)}`);
    expect(blocked.payload?.error?.code === 'OUTPUT_DIR_INVALID', `read-only output error ${JSON.stringify(blocked.payload)}`);
    expect(blocked.payload?.error?.message === 'The output folder is not writable.', `read-only output message ${JSON.stringify(blocked.payload)}`);
    const restored = await api(base, '/api/settings', { token, method: 'PUT', body: { outputDir } });
    expect(restored.status === 200, `settings restore returned ${restored.status}: ${JSON.stringify(restored.payload)}`);
    console.log('read-only output rejected with a clear error');

    const download = await api(base, '/api/download', {
      token,
      method: 'POST',
      body: { url: VIDEO_URL, mode: 'video', quality: '360', container: 'mp4' }
    });
    expect(download.status === 202, `download returned ${download.status}: ${JSON.stringify(download.payload)}`);
    const id = download.payload?.job?.id;
    expect(typeof id === 'string', 'download returned no job id');
    console.log(`download accepted ${id}`);

    const started = Date.now();
    let job = null;
    let lastProgress = -1;
    while (Date.now() - started < 600000) {
      if (child.exitCode !== null) throw new Error(`companion exited with ${child.exitCode}`);
      const poll = await api(base, `/api/download/${id}`, { token });
      expect(poll.status === 200, `poll returned ${poll.status}: ${JSON.stringify(poll.payload)}`);
      job = poll.payload.job;
      const progress = Number(job.progress || 0);
      if (progress - lastProgress >= 0.25) {
        lastProgress = progress;
        console.log(`progress ${Math.round(progress * 100)}%`);
      }
      if (job.state === 'completed' || job.state === 'failed' || job.state === 'cancelled') break;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    expect(job?.state === 'completed', `job ended in state ${job?.state}: ${JSON.stringify(job?.error)}`);
    expect(job.progress === 1, `job finished with progress ${job.progress}`);
    expect(typeof job.outputPath === 'string', 'finished job has no outputPath');
    const outputPath = path.resolve(job.outputPath);
    expect(outputPath.startsWith(path.resolve(outputDir) + path.sep), `output path escaped the output dir: ${outputPath}`);
    const file = await stat(outputPath).catch(() => null);
    expect(file?.isFile(), `output file missing: ${outputPath}`);
    expect(file.size > 1000000, `output file too small: ${file.size} bytes`);
    console.log(`saved ${path.basename(outputPath)} (${file.size} bytes)`);

    const tmpDir = path.join(outputDir, '.ytst-tmp');
    const leftover = await readdir(tmpDir, { recursive: true }).catch(() => []);
    expect(leftover.length === 0, `temp files left behind: ${leftover.join(', ')}`);
    console.log('no leftover temp files');

    const unpair = await api(base, '/api/unpair', { token, method: 'POST' });
    expect(unpair.status === 200, `unpair returned ${unpair.status}`);
    const revoked = await api(base, '/api/settings', { token });
    expect(revoked.status === 401, `revoked token returned ${revoked.status}`);
    console.log('unpair ok');

    child.kill();
    const exited = await Promise.race([
      new Promise((resolve) => child.once('close', () => resolve(true))),
      new Promise((resolve) => setTimeout(() => resolve(false), 8000))
    ]);
    if (!exited) {
      if (process.platform === 'win32') await run('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      else child.kill('SIGKILL');
    }
    child = null;

    expect(stderr.trim() === '', `companion wrote to stderr: ${stderr.trim()}`);
    console.log('PACKAGE SMOKE OK');
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      if (process.platform === 'win32') await run('taskkill', ['/pid', String(child.pid), '/T', '/F']).catch(() => {});
    }
    if (process.platform === 'win32') {
      await run('icacls', [path.join(work, 'readonly'), '/reset', '/t', '/c']).catch(() => {});
    }
    await rm(work, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error?.message ?? String(error));
  process.exitCode = 1;
});
