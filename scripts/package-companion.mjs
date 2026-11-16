import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import archiver from 'archiver';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'companion', 'bin', '.cache');
const DIST = path.join(ROOT, 'companion', 'dist');
const TARGET = 'win32-x64';
const NODE_VERSION = 'v26.13.1';
const FFMPEG_ZIP = 'ffmpeg-master-latest-win64-lgpl-shared.zip';
const FFMPEG_DIR = 'ffmpeg-master-latest-win64-lgpl-shared';
const YTDLP_LICENSE_URL = 'https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/LICENSE';

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`${command} exited with ${code}`));
  });
});

const sha256 = (file) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(file);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const listFiles = async (root, relative = '') => {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (relative === '' && entry.name === 'package-manifest.json') continue;
    const next = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, next));
    else if (entry.isFile()) files.push(next.split(path.sep).join('/'));
  }
  return files;
};

const readSums = async (file) => {
  const text = await readFile(file, 'utf8');
  const sums = new Map();
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    sums.set(parts.slice(1).join(' ').replace(/^\*/, ''), parts[0].toLowerCase());
  }
  return sums;
};

const download = async (url, file) => {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
};

const ensureFile = async (url, file) => {
  try {
    const info = await stat(file);
    if (info.size > 0) return;
  } catch {}
  console.log(`download  ${url}`);
  await mkdir(path.dirname(file), { recursive: true });
  await download(url, file);
};

const verify = async (file, expected, label) => {
  const actual = await sha256(file);
  if (actual !== expected) throw new Error(`${label} checksum mismatch: ${actual} != ${expected}`);
  console.log(`verified  ${label} ${actual}`);
};

const copyBinary = async (from, to) => {
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to);
};

const writeLauncher = (file) => writeFile(file, [
  '@echo off',
  'setlocal',
  'if not exist "%~dp0node\\node.exe" (',
  '  echo Node runtime is missing from this package.',
  '  exit /b 1',
  ')',
  '"%~dp0node\\node.exe" "%~dp0app\\src\\index.js" %*',
  ''
].join('\r\n'));

const writeInstallLauncher = (file) => writeFile(file, [
  '@echo off',
  'setlocal',
  'call "%~dp0install\\install.cmd" %*',
  'exit /b %ERRORLEVEL%',
  ''
].join('\r\n'));

const main = async () => {
  const cache = {
    nodeZip: path.join(CACHE, `node-${NODE_VERSION}-win-x64.zip`),
    nodeSums: path.join(CACHE, `node-${NODE_VERSION}-SHASUMS256.txt`),
    ytdlp: path.join(CACHE, 'yt-dlp.exe'),
    ytdlpSums: path.join(CACHE, 'yt-dlp-SHA2-256SUMS'),
    ffmpegZip: path.join(CACHE, FFMPEG_ZIP),
    ffmpegSums: path.join(CACHE, 'ffmpeg-checksums.sha256'),
    ytdlpLicense: path.join(CACHE, 'yt-dlp-LICENSE.txt')
  };

  await ensureFile(`https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`, cache.nodeZip);
  await ensureFile(`https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`, cache.nodeSums);
  await ensureFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', cache.ytdlp);
  await ensureFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS', cache.ytdlpSums);
  await ensureFile(`https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${FFMPEG_ZIP}`, cache.ffmpegZip);
  await ensureFile('https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/checksums.sha256', cache.ffmpegSums);
  await ensureFile(YTDLP_LICENSE_URL, cache.ytdlpLicense);

  const nodeSums = await readSums(cache.nodeSums);
  const ytdlpSums = await readSums(cache.ytdlpSums);
  const ffmpegSums = await readSums(cache.ffmpegSums);

  await verify(cache.nodeZip, nodeSums.get(`node-${NODE_VERSION}-win-x64.zip`), 'node runtime');
  await verify(cache.ytdlp, ytdlpSums.get('yt-dlp.exe'), 'yt-dlp');
  await verify(cache.ffmpegZip, ffmpegSums.get(FFMPEG_ZIP), 'ffmpeg archive');

  const versionFile = await readFile(path.join(ROOT, 'companion', 'package.json'), 'utf8');
  const version = JSON.parse(versionFile).version;

  const work = await mkdtemp(path.join(os.tmpdir(), 'ytst-package-'));
  const stage = path.join(work, 'YT SuperTool Companion');
  const unpack = path.join(work, 'unpack');
  console.log(`staging   ${stage}`);

  try {
    await mkdir(unpack, { recursive: true });
    await run('tar', ['-xf', cache.nodeZip, '-C', unpack]);
    await run('tar', ['-xf', cache.ffmpegZip, '-C', unpack]);

    const nodeDir = path.join(unpack, `node-${NODE_VERSION}-win-x64`);
    const ffmpegDir = path.join(unpack, FFMPEG_DIR);
    const appDir = path.join(stage, 'app');
    const binDir = path.join(appDir, 'bin', TARGET);

    await copyBinary(path.join(nodeDir, 'node.exe'), path.join(stage, 'node', 'node.exe'));
    await mkdir(path.join(stage, 'licenses'), { recursive: true });
    await cp(path.join(nodeDir, 'LICENSE'), path.join(stage, 'licenses', 'node-LICENSE.txt'));
    await cp(path.join(ffmpegDir, 'LICENSE.txt'), path.join(stage, 'licenses', 'ffmpeg-LICENSE.txt'));
    await cp(cache.ytdlpLicense, path.join(stage, 'licenses', 'yt-dlp-LICENSE.txt'));

    await cp(path.join(ROOT, 'companion', 'src'), path.join(appDir, 'src'), { recursive: true });
    await cp(path.join(ROOT, 'companion', 'package.json'), path.join(appDir, 'package.json'));
    await cp(path.join(ROOT, 'companion', 'install'), path.join(stage, 'install'), { recursive: true });

    await copyBinary(cache.ytdlp, path.join(binDir, 'yt-dlp.exe'));
    const ffmpegBin = path.join(ffmpegDir, 'bin');
    const binEntries = ['ffmpeg.exe', 'ffprobe.exe'];
    for (const entry of await readdir(ffmpegBin)) {
      if (entry.endsWith('.dll')) binEntries.push(entry);
    }
    for (const entry of binEntries) {
      await copyBinary(path.join(ffmpegBin, entry), path.join(binDir, entry));
    }

    const files = {};
    for (const entry of [...binEntries, 'yt-dlp.exe']) {
      files[entry] = await sha256(path.join(binDir, entry));
    }
    await writeFile(
      path.join(binDir, 'manifest.json'),
      `${JSON.stringify({ target: TARGET, files }, null, 2)}\n`
    );

    await writeLauncher(path.join(stage, 'YT SuperTool Companion.cmd'));
    await writeInstallLauncher(path.join(stage, 'Install YT SuperTool Companion.cmd'));
    await writeFile(path.join(stage, 'LICENSES.txt'), [
      'YT SuperTool Companion bundles third-party software.',
      '',
      `Node.js ${NODE_VERSION} - MIT license`,
      `  https://nodejs.org/dist/${NODE_VERSION}/`,
      'FFmpeg BtbN master-latest win64 lgpl-shared build - LGPL-3.0-or-later',
      '  https://github.com/BtbN/FFmpeg-Builds',
      '  Source: https://github.com/FFmpeg/FFmpeg and the build scripts in the',
      '  BtbN/FFmpeg-Builds repository.',
      'yt-dlp - Unlicense',
      '  https://github.com/yt-dlp/yt-dlp',
      '',
      'Full license texts are in the licenses folder. The FFmpeg build is a',
      'shared build, so its libraries can be replaced with compatible versions.',
      ''
    ].join('\r\n'));
    await writeFile(path.join(stage, 'README.txt'), [
      'YT SuperTool Companion',
      '',
      'Install: double-click Install YT SuperTool Companion.cmd',
      '',
      'The installer copies the program to',
      '%LOCALAPPDATA%\\YT SuperTool Companion, starts it in the background at',
      'sign-in and prints a pairing code. Enter the code in the YT SuperTool',
      'Download menu on YouTube. Do not move the installed folder afterwards.',
      '',
      'Shortcuts on the desktop:',
      '  Pair browser    print a fresh pairing code',
      '  Status          show the process, pairing state and download path',
      '  Open downloads  open the download folder',
      '  Uninstall       remove the program, shortcuts and optional data',
      '',
      'Manual start from this folder: YT SuperTool Companion.cmd',
      'No Node.js, Python, yt-dlp or FFmpeg installation is needed.',
      '',
      'Data:   %USERPROFILE%\\.yt-super-tool',
      'Output: %USERPROFILE%\\Downloads\\YT SuperTool unless you change it',
      'Port:   http://127.0.0.1:47831',
      '',
      'The companion never auto-updates and never opens a port outside',
      '127.0.0.1. It creates no service and needs no administrator rights.',
      'The installer adds one startup shortcut and four desktop shortcuts.',
      '',
      'Uninstall: use the Uninstall shortcut, or run install\\uninstall.cmd.',
      '',
      `Package version ${version}, target ${TARGET}.`,
      'Build and test records: BUILD_AND_DISTRIBUTION.md in the source repository.',
      'Windows x64 is the only tested target. Linux and macOS builds are not',
      'produced yet.',
      ''
    ].join('\r\n'));

    const packageFiles = (await listFiles(stage)).sort();
    const packageHashes = {};
    for (const relative of packageFiles) {
      packageHashes[relative] = await sha256(path.join(stage, relative.split('/').join(path.sep)));
    }
    await writeFile(
      path.join(stage, 'package-manifest.json'),
      `${JSON.stringify({ version, target: TARGET, files: packageHashes }, null, 2)}\n`
    );
    console.log(`manifest  ${packageFiles.length} files`);

    console.log('self-test packaged runtime');
    await run(path.join(stage, 'node', 'node.exe'), [path.join(appDir, 'src', 'index.js'), '--self-test'], { cwd: stage });

    const probe = [
      `const { detectBinaries } = await import(${JSON.stringify(pathToFileURL(path.join(appDir, 'src', 'binaries.js')).href)});`,
      `const binaries = await detectBinaries({ binDir: ${JSON.stringify(binDir)} });`,
      'console.log(JSON.stringify(binaries));',
      'if (!binaries.ytdlp.available || !binaries.ffmpeg.available) process.exit(1);'
    ].join('\n');
    await run(path.join(stage, 'node', 'node.exe'), ['--input-type=module', '-e', probe], { cwd: stage });

    await mkdir(DIST, { recursive: true });
    const zipName = `yt-supertool-companion-${version}-${TARGET}.zip`;
    const zipPath = path.join(DIST, zipName);
    await rm(zipPath, { force: true });
    await new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(stage, 'YT SuperTool Companion');
      archive.finalize();
    });

    const zipHash = await sha256(zipPath);
    await writeFile(`${zipPath}.sha256`, `${zipHash}  ${zipName}\n`);
    console.log(`package   ${zipPath}`);
    console.log(`sha256    ${zipHash}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error?.message ?? String(error));
  process.exitCode = 1;
});
