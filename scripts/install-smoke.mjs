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
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

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

const runPowerShell = (script, args = [], options = {}) => run(
  POWERSHELL,
  ['-NoProfile', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
  options
);

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
  return { status: response.status, payload };
};

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const waitFor = async (check, message, timeoutMs = 30000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(message);
};

const waitForHealth = async (base, timeoutMs = 30000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await api(base, '/api/health', { timeout: 2500 });
      if (result.status === 200) return result.payload;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('companion health did not answer');
};

const waitForHealthDown = async (base, timeoutMs = 20000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await api(base, '/api/health', { timeout: 1000 });
      if (result.status !== 200) return;
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('companion health stayed up');
};

const readJsonText = async (file) => {
  const buffer = await readFile(file);
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return JSON.parse(buffer.toString('utf16le').replace(/^\uFEFF/, ''));
  return JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
};

const findZip = async (arg) => {
  if (arg) return path.resolve(arg);
  const entries = await readdir(DIST).catch(() => []);
  const zips = entries.filter((entry) => entry.startsWith('yt-supertool-companion-') && entry.endsWith('.zip'));
  expect(zips.length > 0, `no companion zip in ${DIST}; run npm run package:companion first`);
  zips.sort();
  return path.join(DIST, zips[zips.length - 1]);
};

const checkZip = async (zipPath) => {
  const info = await stat(zipPath).catch(() => null);
  expect(info?.isFile(), `missing zip ${zipPath}`);
  const shaFile = `${zipPath}.sha256`;
  const text = await readFile(shaFile, 'utf8').catch(() => {
    throw new Error(`missing ${shaFile}`);
  });
  const expected = text.trim().split(/\s+/)[0].toLowerCase();
  const actual = await sha256(zipPath);
  expect(actual === expected, `zip checksum mismatch: ${actual} != ${expected}`);
  console.log(`zip checksum ok (${info.size} bytes)`);
};

const writeScripts = async (work) => {
  const inspect = path.join(work, 'inspect-shortcut.ps1');
  await writeFile(inspect, [
    'param([string]$Path)',
    '$shell = New-Object -ComObject WScript.Shell',
    '$shortcut = $shell.CreateShortcut($Path)',
    'Write-Output $shortcut.TargetPath',
    'Write-Output $shortcut.Arguments',
    ''
  ].join('\r\n'));

  const processes = path.join(work, 'process-count.ps1');
  await writeFile(processes, [
    'param([string]$AppEntry, [switch]$Stop)',
    '$searcher = New-Object System.Management.ManagementObjectSearcher("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = \'node.exe\'")',
    '$items = @()',
    'foreach ($process in $searcher.Get()) {',
    '  $commandLine = [string]$process["CommandLine"]',
    '  if ($commandLine -and $commandLine.IndexOf($AppEntry, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {',
    '    $items += [pscustomobject]@{ ProcessId = [int]$process["ProcessId"]; CommandLine = $commandLine }',
    '  }',
    '}',
    '$searcher.Dispose()',
    'if ($Stop) {',
    '  foreach ($item in $items) {',
    '    & "$env:SystemRoot\\System32\\taskkill.exe" /PID $item.ProcessId /T /F 2>$null | Out-Null',
    '  }',
    '}',
    'Write-Output $items.Count',
    ''
  ].join('\r\n'));

  return {
    inspect,
    processes
  };
};

const inspectShortcut = async (script, shortcut) => {
  const result = await runPowerShell(script, ['-Path', shortcut]);
  expect(result.code === 0, `could not inspect ${shortcut}: ${result.stderr.trim()}`);
  const lines = result.stdout.split(/\r?\n/);
  return { target: (lines[0] || '').trim(), arguments: (lines[1] || '').trim() };
};

const processCount = async (script, appEntry, stop = false) => {
  const args = ['-AppEntry', appEntry];
  if (stop) args.push('-Stop');
  const result = await runPowerShell(script, args);
  expect(result.code === 0, `process query failed: ${result.stderr.trim()}`);
  return Number(result.stdout.trim().split(/\r?\n/).pop());
};

const main = async () => {
  const zipPath = await findZip(process.argv[2]);
  await checkZip(zipPath);

  const work = await mkdtemp(path.join(os.tmpdir(), 'ytst-install-smoke-'));
  const unpack = path.join(work, 'package');
  const stage = path.join(unpack, 'YT SuperTool Companion');
  const installDir = path.join(work, 'install');
  const dataDir = path.join(work, 'data');
  const startupDir = path.join(work, 'startup');
  const desktopDir = path.join(work, 'desktop');
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let scripts = null;

  try {
    await mkdir(unpack, { recursive: true });
    const extracted = await run('tar', ['-xf', zipPath, '-C', unpack]);
    expect(extracted.code === 0, `tar failed with ${extracted.code}: ${extracted.stderr.trim()}`);
    console.log('package extracted');

    scripts = await writeScripts(work);
    for (const relative of ['install/install.ps1', 'install/pair.ps1', 'install/status.ps1', 'install/cookies.ps1', 'install/uninstall.ps1', 'install/launch-hidden.vbs', 'package-manifest.json', 'Install YT SuperTool Companion.cmd']) {
      const info = await stat(path.join(stage, relative)).catch(() => null);
      expect(info?.isFile(), `package is missing ${relative}`);
    }

    const install = await runPowerShell(path.join(stage, 'install', 'install.ps1'), [
      '-InstallDir', installDir,
      '-DataDir', dataDir,
      '-Port', String(port),
      '-StartupDir', startupDir,
      '-DesktopDir', desktopDir,
      '-NoLaunch'
    ], { cwd: stage });
    expect(install.code === 0, `install failed with ${install.code}: ${install.stderr.trim()}`);
    expect(install.stdout.includes('installed.'), `install output did not report success: ${install.stdout.trim()}`);
    expect(install.stdout.includes('Launch skipped.'), `install did not honor -NoLaunch: ${install.stdout.trim()}`);
    console.log('install ok');

    for (const relative of ['node/node.exe', 'app/src/index.js', 'app/bin/win32-x64/yt-dlp.exe', 'install/install.ps1', 'install/paths.json', 'package-manifest.json']) {
      const info = await stat(path.join(installDir, relative)).catch(() => null);
      expect(info?.isFile(), `installed copy is missing ${relative}`);
    }

    const config = await readJsonText(path.join(installDir, 'install', 'paths.json'));
    expect(config.installDir === installDir, `paths.json installDir ${config.installDir}`);
    expect(config.dataDir === dataDir, `paths.json dataDir ${config.dataDir}`);
    expect(config.port === port, `paths.json port ${config.port}`);
    expect(config.appEntry === path.join(installDir, 'app', 'src', 'index.js'), `paths.json appEntry ${config.appEntry}`);
    expect(config.startupShortcut === path.join(startupDir, 'YT SuperTool Companion.lnk'), `paths.json startupShortcut ${config.startupShortcut}`);
    console.log('paths.json ok');

    const startupLink = path.join(startupDir, 'YT SuperTool Companion.lnk');
    const startupInfo = await stat(startupLink).catch(() => null);
    expect(startupInfo?.isFile(), 'startup shortcut is missing');
    const startupShortcut = await inspectShortcut(scripts.inspect, startupLink);
    expect(startupShortcut.target.toLowerCase().endsWith('wscript.exe'), `startup shortcut target ${startupShortcut.target}`);
    expect(startupShortcut.arguments.toLowerCase().includes('launch-hidden.vbs'), `startup shortcut arguments ${startupShortcut.arguments}`);
    console.log('startup shortcut ok');

    const desktopNames = [
      'YT SuperTool - Pair browser.lnk',
      'YT SuperTool - Status.lnk',
      'YT SuperTool - Browser cookies.lnk',
      'YT SuperTool - Open downloads.lnk',
      'YT SuperTool - Uninstall.lnk'
    ];
    for (const name of desktopNames) {
      const info = await stat(path.join(desktopDir, name)).catch(() => null);
      expect(info?.isFile(), `desktop shortcut is missing: ${name}`);
    }
    const pairShortcut = await inspectShortcut(scripts.inspect, path.join(desktopDir, desktopNames[0]));
    expect(pairShortcut.target.toLowerCase().includes('pair.cmd'), `pair shortcut target ${pairShortcut.target}`);
    const cookieShortcut = await inspectShortcut(scripts.inspect, path.join(desktopDir, desktopNames[2]));
    expect(cookieShortcut.target.toLowerCase().includes('cookies.cmd'), `cookie shortcut target ${cookieShortcut.target}`);
    console.log('desktop shortcuts ok');

    const pair = await runPowerShell(path.join(installDir, 'install', 'pair.ps1'), [], { cwd: installDir });
    expect(pair.code === 0, `pair script failed with ${pair.code}: ${pair.stderr.trim()}`);
    const codeMatch = pair.stdout.match(/Pairing code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/);
    expect(codeMatch, `pair script printed no pairing code: ${pair.stdout.trim()}`);
    console.log('pair script started the companion');

    const health = await waitForHealth(base);
    expect(health.service === 'yt-super-tool-companion', 'unexpected service name');
    expect(health.paired === false, 'fresh data dir should not be paired');
    const codeFile = path.join(dataDir, 'pairing-code.txt');
    expect(!(await stat(codeFile).catch(() => null)), 'pairing code file was not removed');

    const paired = await api(base, '/api/pair', { method: 'POST', body: { code: codeMatch[1], clientName: 'userscript' } });
    expect(paired.status === 200, `pair returned ${paired.status}: ${JSON.stringify(paired.payload)}`);
    expect(typeof paired.payload?.token === 'string', 'pair returned no token');
    const afterPair = await waitForHealth(base);
    expect(afterPair.paired === true, 'health did not report a paired companion');
    console.log('pairing ok');

    const status = await runPowerShell(path.join(installDir, 'install', 'status.ps1'), [], { cwd: installDir });
    expect(status.code === 0, `status returned ${status.code}: ${status.stderr.trim()}`);
    expect(/Process:\s+running/i.test(status.stdout), `status did not report a running process: ${status.stdout.trim()}`);
    expect(/Pairing:\s+paired/i.test(status.stdout), `status did not report a paired companion: ${status.stdout.trim()}`);
    console.log('status ok');

    const stoppedCount = await processCount(scripts.processes, config.appEntry, true);
    expect(stoppedCount >= 1, 'process query found no running companion');
    await waitForHealthDown(base);
    console.log('stop ok');

    const relaunch = await run('wscript.exe', [path.join(installDir, 'install', 'launch-hidden.vbs'), 'start'], { cwd: installDir });
    expect(relaunch.code === 0, `hidden launch failed with ${relaunch.code}`);
    const relaunched = await waitForHealth(base);
    expect(relaunched.paired === true, 'relaunch lost the pairing token');
    expect(await processCount(scripts.processes, config.appEntry) === 1, 'relaunch did not leave exactly one companion process');
    console.log('relaunch ok (pairing persisted)');

    await run('wscript.exe', [path.join(installDir, 'install', 'launch-hidden.vbs'), 'start'], { cwd: installDir });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(await processCount(scripts.processes, config.appEntry) === 1, 'a second hidden launch started a duplicate companion');
    console.log('duplicate launch guard ok');

    const cookiesOn = await runPowerShell(path.join(installDir, 'install', 'cookies.ps1'), ['-Source', 'edge'], { cwd: installDir });
    expect(cookiesOn.code === 0, `cookie script failed with ${cookiesOn.code}: ${cookiesOn.stderr.trim()}`);
    const cookieSettings = await readJsonText(path.join(dataDir, 'settings.json'));
    expect(cookieSettings.cookiesFromBrowser === 'edge', `cookie setting is ${cookieSettings.cookiesFromBrowser}`);
    const afterCookies = await waitForHealth(base);
    expect(afterCookies.paired === true, 'cookie change lost the pairing token');
    const cookiesOff = await runPowerShell(path.join(installDir, 'install', 'cookies.ps1'), ['-Source', 'off'], { cwd: installDir });
    expect(cookiesOff.code === 0, `cookie reset failed with ${cookiesOff.code}: ${cookiesOff.stderr.trim()}`);
    const resetSettings = await readJsonText(path.join(dataDir, 'settings.json'));
    expect(resetSettings.cookiesFromBrowser === null, `cookie reset left ${resetSettings.cookiesFromBrowser}`);
    console.log('browser cookie setting ok');

    const cookieFile = path.join(work, 'cookies.txt');
    await writeFile(cookieFile, '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tvalue\n');
    const cookiesFromFile = await runPowerShell(
      path.join(installDir, 'install', 'cookies.ps1'),
      ['-Source', 'file', '-CookieFile', cookieFile],
      { cwd: installDir }
    );
    expect(cookiesFromFile.code === 0, `cookie file script failed with ${cookiesFromFile.code}: ${cookiesFromFile.stderr.trim()}`);
    const fileSettings = await readJsonText(path.join(dataDir, 'settings.json'));
    expect(fileSettings.cookiesFile === cookieFile, `cookie file setting is ${fileSettings.cookiesFile}`);
    expect(fileSettings.cookiesFromBrowser === null, `cookie file left browser source ${fileSettings.cookiesFromBrowser}`);
    const resetFile = await runPowerShell(path.join(installDir, 'install', 'cookies.ps1'), ['-Source', 'off'], { cwd: installDir });
    expect(resetFile.code === 0, `cookie file reset failed with ${resetFile.code}: ${resetFile.stderr.trim()}`);
    const clearedSettings = await readJsonText(path.join(dataDir, 'settings.json'));
    expect(clearedSettings.cookiesFile === null, `cookie file reset left ${clearedSettings.cookiesFile}`);
    expect(clearedSettings.cookiesFromBrowser === null, `cookie reset left ${clearedSettings.cookiesFromBrowser}`);
    console.log('cookie file setting ok');

    const uninstall = await runPowerShell(path.join(installDir, 'install', 'uninstall.ps1'), ['-Force'], { cwd: installDir });
    expect(uninstall.code === 0, `uninstall failed with ${uninstall.code}: ${uninstall.stderr.trim()}`);
    await waitFor(async () => !(await stat(installDir).catch(() => null)), 'install folder still exists after uninstall', 30000);
    expect(!(await stat(startupLink).catch(() => null)), 'startup shortcut still exists after uninstall');
    for (const name of desktopNames) {
      expect(!(await stat(path.join(desktopDir, name)).catch(() => null)), `desktop shortcut still exists: ${name}`);
    }
    expect(!(await stat(dataDir).catch(() => null)), 'data folder still exists after uninstall');
    await waitForHealthDown(base);
    expect(await processCount(scripts.processes, config.appEntry) === 0, 'companion process still runs after uninstall');
    console.log('uninstall ok');

    console.log('INSTALL SMOKE OK');
  } finally {
    if (scripts) {
      await processCount(scripts.processes, path.join(installDir, 'app', 'src', 'index.js'), true).catch(() => {});
    }
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
};

main().catch((error) => {
  console.error(error?.message ?? String(error));
  process.exitCode = 1;
});
