import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import { build } from 'vite';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const srcDir = path.join(rootDir, 'src');
const manifestsDir = path.join(srcDir, 'manifests');
const popupDir = path.join(srcDir, 'entries', 'popup');
const iconsDir = path.join(rootDir, 'public', 'icons');
const rulesDir = path.join(srcDir, 'rules');

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const baseManifest = readJson(path.join(manifestsDir, 'base.manifest.json'));
const { version } = baseManifest;

const bundle = async ({ target, entry, outDir, outputName, emptyOutDir }) => {
  await build({
    configFile: path.join(rootDir, 'vite.config.js'),
    publicDir: false,
    define: {
      __TARGET__: JSON.stringify(target),
      __VERSION__: JSON.stringify(version)
    },
    logLevel: 'warn',
    build: {
      outDir,
      emptyOutDir,
      sourcemap: false,
      minify: false,
      target: 'es2020',
      cssCodeSplit: false,
      lib: {
        entry: path.join(rootDir, entry),
        formats: ['iife'],
        name: `YTST_${outputName.replace(/\W/g, '_').toUpperCase()}`,
        fileName: () => outputName
      }
    }
  });

  const outputPath = path.join(outDir, outputName);
  if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
    throw new Error(`Vite did not emit ${path.relative(rootDir, outputPath)}`);
  }
  return outputPath;
};

const buildUserscript = async () => {
  const outDir = path.join(distDir, 'userscript');
  const entryPath = path.join(srcDir, 'entries', 'userscript.entry.js');
  const metadata = readFileSync(entryPath, 'utf8')
    .match(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\r?\n?/)?.[0];

  if (!metadata) throw new Error('userscript.entry.js has no userscript metadata block');

  const outputPath = await bundle({
    target: 'userscript',
    entry: 'src/entries/userscript.entry.js',
    outDir,
    outputName: 'yt-supertool.user.js',
    emptyOutDir: true
  });

  writeFileSync(outputPath, metadata + readFileSync(outputPath, 'utf8'));
  console.log(`userscript  dist/${path.relative(distDir, outputPath)}`);
};

const buildExtension = async (target) => {
  const outDir = path.join(distDir, target);
  rmSync(outDir, { recursive: true, force: true });

  const backgroundEntry = `src/entries/background.${target}.entry.js`;
  const entries = [
    ['src/entries/content.entry.js', 'content.js'],
    [backgroundEntry, 'background.js'],
    ['src/entries/main-world.entry.js', 'main-world.js'],
    ['src/entries/popup/popup.js', 'popup.js']
  ];

  for (const [index, [entry, outputName]] of entries.entries()) {
    await bundle({ target, entry, outDir, outputName, emptyOutDir: index === 0 });
  }

  copyFileSync(path.join(popupDir, 'popup.html'), path.join(outDir, 'popup.html'));
  copyFileSync(path.join(popupDir, 'popup.css'), path.join(outDir, 'popup.css'));

  mkdirSync(path.join(outDir, 'assets', 'icons'), { recursive: true });
  for (const icon of ['icon16.png', 'icon48.png', 'icon128.png']) {
    copyFileSync(path.join(iconsDir, icon), path.join(outDir, 'assets', 'icons', icon));
  }

  if (target === 'mv3') {
    mkdirSync(path.join(outDir, 'rules'), { recursive: true });
    copyFileSync(
      path.join(rulesDir, 'yt-adblock-dnr.json'),
      path.join(outDir, 'rules', 'yt-adblock-dnr.json')
    );
  }

  const manifest = {
    ...baseManifest,
    ...readJson(path.join(manifestsDir, `${target}.manifest.json`)),
    version
  };
  writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${target}       dist/${target}/ (${Object.keys(manifest).length} manifest keys)`);
  return outDir;
};

const zipDirectory = (sourceDir, zipPath) => new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('error', reject);
  archive.on('warning', (error) => {
    if (error.code === 'ENOENT') console.warn(error.message);
    else reject(error);
  });
  archive.pipe(output);
  archive.directory(sourceDir, false);
  archive.finalize();
});

const main = async () => {
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  await buildUserscript();
  const mv2Dir = await buildExtension('mv2');
  const mv3Dir = await buildExtension('mv3');

  await zipDirectory(mv2Dir, path.join(distDir, 'yt-supertool-mv2.zip'));
  await zipDirectory(mv3Dir, path.join(distDir, 'yt-supertool-mv3.zip'));

  console.log('archives    dist/yt-supertool-mv2.zip, dist/yt-supertool-mv3.zip');
  console.log(`Build complete for v${version}`);
};

main().catch((error) => {
  console.error('Build failed:', error);
  process.exitCode = 1;
});
