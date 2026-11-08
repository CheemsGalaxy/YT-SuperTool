import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const srcDir = path.join(rootDir, 'src');
const failures = [];
const notes = [];

const fail = (message) => failures.push(message);
const pass = (message) => console.log(`  ok  ${message}`);
const note = (message) => notes.push(message);
const relative = (filePath) => path.relative(rootDir, filePath).split(path.sep).join('/');

const readText = (filePath) => readFileSync(filePath, 'utf8');
const isFile = (filePath) => existsSync(filePath) && statSync(filePath).isFile();

const requireFile = (filePath, label) => {
  if (isFile(filePath)) return true;
  fail(`Missing ${label}: ${relative(filePath)}`);
  return false;
};

const readJson = (filePath, label) => {
  try {
    return JSON.parse(readText(filePath));
  } catch (error) {
    fail(`Invalid ${label} JSON: ${error.message}`);
    return null;
  }
};

const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (
  entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]
));

const checkSourceLayout = () => {
  console.log('\nSource layout');
  const required = [
    'src/core/index.js',
    'src/core/lifecycle.js',
    'src/core/dom-safe.js',
    'src/core/settings-schema.js',
    'src/core/ui/theme.css',
    'src/core/ui/panel.js',
    'src/core/ui/icons.js',
    'src/core/ui/global.css',
    'src/core/features/index.js',
    'src/core/features/adblock/index.js',
    'src/core/features/adblock/adblock-prune.js',
    'src/core/features/adblock/adblock-network.js',
    'src/core/features/adblock/adblock-player.js',
    'src/core/features/adblock/adblock-cosmetic.js',
    'src/core/features/adblock/adblock-filters.js',
    'src/core/features/adblock/adblock-cosmetic.css',
    'src/core/features/adblock/adblock-skipper.js',
    'src/entries/adblock-background.js',
    'src/adapters/index.js',
    'src/adapters/userscript.adapter.js',
    'src/adapters/extension.adapter.js',
    'src/entries/userscript.entry.js',
    'src/entries/content.entry.js',
    'src/entries/main-world.entry.js',
    'src/entries/background.entry.js',
    'src/entries/popup/popup.html',
    'src/manifests/base.manifest.json',
    'src/manifests/mv2.manifest.json',
    'src/manifests/mv3.manifest.json',
    'src/rules/yt-adblock-dnr.json'
  ];
  for (const file of required) requireFile(path.join(rootDir, file), 'required source file');
  if (required.every((file) => isFile(path.join(rootDir, file)))) pass('all required source files present');

  const coreFiles = walk(path.join(srcDir, 'core')).filter((file) => file.endsWith('.js'));
  for (const file of coreFiles) {
    const source = readText(file);
    if (/\.innerHTML\s*=|\[['"]innerHTML['"]\]\s*=|\.outerHTML\s*=/.test(source)) {
      fail(`core assigns innerHTML/outerHTML: ${relative(file)}`);
    }
    if (/\bGM_[A-Za-z]+/.test(source)) fail(`core calls a GM_* API directly: ${relative(file)}`);
    if (/\bchrome\./.test(source)) fail(`core calls chrome.* directly: ${relative(file)}`);
    if (/\bbrowser\.(storage|runtime|tabs)\b/.test(source)) fail(`core calls browser.* directly: ${relative(file)}`);
    if (/window\.YTSuperTool/.test(source)) fail(`core still uses the legacy global: ${relative(file)}`);
  }
  if (!failures.length) pass('core is free of GM_*, chrome.* and innerHTML');

  const uiFiles = [
    path.join(srcDir, 'core', 'ui', 'panel.js'),
    path.join(srcDir, 'core', 'ui', 'icons.js'),
    path.join(srcDir, 'entries', 'popup', 'popup.js')
  ];
  let emojiFound = false;
  for (const file of uiFiles) {
    const source = readText(file);
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(source)) {
      fail(`emoji found in UI source: ${relative(file)}`);
      emojiFound = true;
    }
  }
  if (!emojiFound) pass('UI sources contain no emoji');

  const cssFiles = [
    path.join(srcDir, 'core', 'ui', 'theme.css'),
    path.join(srcDir, 'core', 'ui', 'global.css'),
    path.join(srcDir, 'core', 'features', 'adblock', 'adblock-cosmetic.css'),
    path.join(srcDir, 'entries', 'popup', 'popup.css')
  ];
  let gradientFound = false;
  for (const file of cssFiles) {
    if (/linear-gradient|radial-gradient/i.test(readText(file))) {
      fail(`forbidden gradient found: ${relative(file)}`);
      gradientFound = true;
    }
  }
  if (!gradientFound) pass('no gradient surfaces in UI stylesheets');

  const theme = readText(path.join(srcDir, 'core', 'ui', 'theme.css'));
  const tokens = [
    '--ytst-surface: rgba(15, 15, 15, 0.88)',
    '--ytst-elevated: rgba(255, 255, 255, 0.04)',
    '--ytst-elevated-hover: rgba(255, 255, 255, 0.08)',
    '--ytst-line: rgba(255, 255, 255, 0.08)',
    '--ytst-text: #f1f1f1',
    '--ytst-text-muted: #aaaaaa',
    '--ytst-accent: #ff0033',
    '--ytst-accent-control: #3ea6ff',
    'backdrop-filter: blur(16px) saturate(180%)',
    'font-variant-numeric: tabular-nums',
    'cubic-bezier(0.22, 1, 0.36, 1)',
    'width: 36px',
    'height: 20px',
    'translateX(16px)'
  ];
  const missingTokens = tokens.filter((token) => !theme.includes(token));
  if (missingTokens.length) fail(`theme.css is missing tokens: ${missingTokens.join(', ')}`);
  else pass('design tokens match the spec');
};

const checkUserscript = (baseManifest) => {
  console.log('\nUserscript');
  const file = path.join(distDir, 'userscript', 'yt-supertool.user.js');
  if (!requireFile(file, 'userscript bundle')) return;

  const source = readText(file);
  if (source.startsWith('// ==UserScript==')) pass('metadata block is the first content');
  else fail('userscript metadata must be the first content of the bundle');

  const directives = [
    [/@name\s+\S/, '@name'],
    [/@match\s+\*:\/\/\*\.youtube\.com\/\*/, '@match youtube.com'],
    [/@run-at\s+document-start/, '@run-at document-start'],
    [/@grant\s+GM_getValue/, '@grant GM_getValue'],
    [/@grant\s+GM_setValue/, '@grant GM_setValue'],
    [/@grant\s+GM_addStyle/, '@grant GM_addStyle'],
    [/@grant\s+GM_xmlhttpRequest/, '@grant GM_xmlhttpRequest'],
    [/@grant\s+unsafeWindow/, '@grant unsafeWindow']
  ];
  for (const [pattern, label] of directives) {
    if (pattern.test(source)) pass(`metadata has ${label}`);
    else fail(`userscript metadata is missing ${label}`);
  }

  const markers = [
    ['installAdblockPrune', 'layer 1 prune hook'],
    ['ytInitialPlayerResponse', 'player response interception'],
    ['adPlacements', 'ad placement keys'],
    ['ytst-adblock-cosmetic', 'layer 2 cosmetic stylesheet'],
    ['ytp-ad-skip-button', 'layer 3 skip selectors'],
    ['attachShadow', 'shadow DOM panel'],
    ['ytst-switch-input', 'custom toggle switches'],
    ['ytst-header-button', 'header launcher'],
    ['GM_addStyle', 'GM_addStyle integration'],
    ['unsafeWindow', 'unsafeWindow access']
  ];
  for (const [marker, label] of markers) {
    if (source.includes(marker)) pass(`bundle includes ${label}`);
    else fail(`userscript bundle is missing ${label} (${marker})`);
  }

  if (/^\s*(?:import\s|export\s)/m.test(source)) fail('userscript contains a top-level import/export');
  else pass('bundle is a closed IIFE');

  const version = source.match(/@version\s+(\S+)/)?.[1];
  if (version !== baseManifest.version) {
    fail(`userscript version ${version} does not match manifest version ${baseManifest.version}`);
  } else {
    pass(`version matches base manifest (${version})`);
  }
};

const checkManifestFiles = (target, manifest) => {
  for (const [size, file] of Object.entries(manifest.icons || {})) {
    requireFile(path.join(distDir, target, file), `${target} ${size}px icon`);
  }

  for (const script of manifest.content_scripts || []) {
    for (const file of script.js || []) {
      requireFile(path.join(distDir, target, file), `${target} content script`);
    }
    for (const file of script.css || []) {
      requireFile(path.join(distDir, target, file), `${target} content stylesheet`);
    }
  }

  const backgroundFiles = target === 'mv2'
    ? manifest.background?.scripts || []
    : manifest.background?.service_worker
      ? [manifest.background.service_worker]
      : [];
  for (const file of backgroundFiles) {
    requireFile(path.join(distDir, target, file), `${target} background script`);
  }

  const popup = manifest.action?.default_popup || manifest.browser_action?.default_popup;
  if (popup) requireFile(path.join(distDir, target, popup), `${target} popup`);
  else fail(`${target} manifest declares no popup`);

  if (target === 'mv2') {
    for (const resource of manifest.web_accessible_resources || []) {
      if (resource.includes('*')) {
        if (!existsSync(path.join(distDir, target, path.dirname(resource)))) {
          fail(`${target} web accessible resources directory is missing: ${resource}`);
        }
      } else {
        requireFile(path.join(distDir, target, resource), `${target} web accessible resource`);
      }
    }
  } else {
    for (const entry of manifest.web_accessible_resources || []) {
      for (const resource of entry.resources || []) {
        if (resource.includes('*')) {
          if (!existsSync(path.join(distDir, target, path.dirname(resource)))) {
            fail(`${target} web accessible resources directory is missing: ${resource}`);
          }
        } else {
          requireFile(path.join(distDir, target, resource), `${target} web accessible resource`);
        }
      }
    }
  }
};

const checkBundles = (target) => {
  const contentPath = path.join(distDir, target, 'content.js');
  if (isFile(contentPath)) {
    const content = readText(contentPath);
    for (const marker of ['ytst-header-button', 'ytp-ad-skip-button', 'ytd-ad-slot-renderer', 'ytst-switch-input']) {
      if (!content.includes(marker)) fail(`${target} content bundle is missing ${marker}`);
    }
  }

  const mainWorldPath = path.join(distDir, target, 'main-world.js');
  if (isFile(mainWorldPath)) {
    const mainWorld = readText(mainWorldPath);
    for (const marker of ['adPlacements', 'ytInitialPlayerResponse', 'JSON']) {
      if (!mainWorld.includes(marker)) fail(`${target} main-world bundle is missing ${marker}`);
    }
  }

  const popupPath = path.join(distDir, target, 'popup.js');
  if (isFile(popupPath)) {
    const popup = readText(popupPath);
    for (const marker of ['popup-switch-input', 'popup-row', 'sponsorblockCategories']) {
      if (!popup.includes(marker)) fail(`${target} popup bundle is missing ${marker}`);
    }
  }

  const popupCss = path.join(distDir, target, 'popup.css');
  if (isFile(popupCss) && !readText(popupCss).includes('popup-switch')) {
    fail(`${target} popup.css is not the redesigned stylesheet`);
  }
};

const checkExtension = (target, expectedVersion, baseManifest) => {
  console.log(`\n${target.toUpperCase()}`);
  const manifestPath = path.join(distDir, target, 'manifest.json');
  if (!requireFile(manifestPath, `${target} manifest`)) return;

  const manifest = readJson(manifestPath, `${target} manifest`);
  if (!manifest) return;

  if (manifest.manifest_version !== expectedVersion) {
    fail(`${target} manifest_version must be ${expectedVersion}`);
  } else {
    pass(`manifest_version ${expectedVersion}`);
  }

  if (manifest.name !== baseManifest.name) fail(`${target} name does not match the base manifest`);
  if (manifest.version !== baseManifest.version) fail(`${target} version does not match the base manifest`);
  pass(`version ${manifest.version}`);

  const contentScripts = manifest.content_scripts || [];
  const mainScript = contentScripts.find((script) => (script.js || []).includes('content.js'));
  if (!mainScript) fail(`${target} does not declare content.js`);
  else if (mainScript.run_at !== 'document_start') fail(`${target} content.js must run at document_start`);
  else pass('content.js runs at document_start');

  const networkPermissions = target === 'mv2' ? manifest.permissions : manifest.host_permissions;
  for (const host of ['https://returnyoutubedislikeapi.com/*', 'https://sponsor.ajay.app/*']) {
    if (!networkPermissions?.includes(host)) fail(`${target} manifest is missing ${host}`);
  }

  if (target === 'mv2') {
    if (!manifest.background?.scripts?.length) fail('MV2 must declare background.scripts');
    if (manifest.background?.service_worker) fail('MV2 must not declare a service worker');
    if (manifest.declarative_net_request) fail('MV2 must not declare declarative_net_request');
    if (!manifest.web_accessible_resources?.includes('main-world.js')) {
      fail('MV2 web_accessible_resources must expose main-world.js');
    } else {
      pass('MV2 injects main-world.js');
    }
    if (!manifest.browser_action) fail('MV2 must declare browser_action');
    pass('MV2 background is persistent:false');
  } else {
    if (!manifest.background?.service_worker) fail('MV3 must declare a service worker');
    if (!manifest.action) fail('MV3 must declare action');
    if (!manifest.permissions?.includes('declarativeNetRequest')) {
      fail('MV3 must request the declarativeNetRequest permission');
    }
    if (!manifest.permissions?.includes('storage')) fail('MV3 must request storage');

    const mainWorld = contentScripts.find((script) => (script.js || []).includes('main-world.js'));
    if (!mainWorld) fail('MV3 must declare main-world.js as a content script');
    else if (mainWorld.world !== 'MAIN') fail('MV3 main-world.js must use world MAIN');
    else if (mainWorld.run_at !== 'document_start') fail('MV3 main-world.js must run at document_start');
    else pass('MV3 declares a MAIN-world document_start script');

    const ruleResource = manifest.declarative_net_request?.rule_resources?.[0];
    if (!ruleResource) {
      fail('MV3 is missing declarative_net_request.rule_resources');
    } else {
      const rulePath = path.join(distDir, target, ruleResource.path);
      if (!requireFile(rulePath, 'MV3 DNR ruleset')) {

      } else {
        const rules = readJson(rulePath, 'DNR ruleset');
        if (!Array.isArray(rules) || !rules.length) {
          fail('DNR ruleset must be a non-empty array');
        } else {
          const invalid = rules.filter((rule) => (
            typeof rule.id !== 'number'
            || !rule.action?.type
            || !rule.condition?.urlFilter
          ));
          if (invalid.length) fail(`DNR has ${invalid.length} malformed rule(s)`);
          else pass(`DNR ruleset has ${rules.length} valid rules`);
        }
      }
    }
  }

  checkManifestFiles(target, manifest);
  checkBundles(target);

  const iconsOk = ['icon16.png', 'icon48.png', 'icon128.png'].every((icon) => (
    isFile(path.join(distDir, target, 'assets', 'icons', icon))
  ));
  if (!iconsOk) fail(`${target} is missing packaged icons`);
};

const checkArchives = () => {
  console.log('\nArchives');
  for (const archive of ['yt-supertool-mv2.zip', 'yt-supertool-mv3.zip']) {
    const filePath = path.join(distDir, archive);
    if (!requireFile(filePath, archive)) continue;
    const size = statSync(filePath).size;
    if (size < 1000) fail(`${archive} is suspiciously small (${size} bytes)`);
    else pass(`${archive} (${Math.round(size / 1024)} KB)`);
    const header = readFileSync(filePath).subarray(0, 2).toString('latin1');
    if (header !== 'PK') fail(`${archive} is not a zip archive`);
    else pass(`${archive} has a valid zip header`);
  }
};

const main = () => {
  if (!existsSync(distDir)) {
    console.error('BUILD VERIFICATION FAILED\n- dist/ does not exist, run npm run build first');
    process.exitCode = 1;
    return;
  }

  const baseManifest = readJson(path.join(srcDir, 'manifests', 'base.manifest.json'), 'base manifest');
  if (!baseManifest) {
    console.error('BUILD VERIFICATION FAILED\n- base manifest is unreadable');
    process.exitCode = 1;
    return;
  }

  checkSourceLayout();
  checkUserscript(baseManifest);
  checkExtension('mv2', 2, baseManifest);
  checkExtension('mv3', 3, baseManifest);
  checkArchives();

  console.log('');
  if (failures.length) {
    console.error('BUILD VERIFICATION FAILED');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  notes.forEach((line) => console.log(`note: ${line}`));
  console.log('ALL BUILD TARGETS VERIFIED SUCCESSFULLY');
};

main();
