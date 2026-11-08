import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenizer, parse } from 'acorn';
import postcss from 'postcss';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetDirs = ['src', 'scripts', 'public'];
const targetFiles = ['vite.config.js', 'README.md', 'ARCHITECTURE_AUDIT.md'];
const textExtensions = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.md']);
const skipDirs = new Set(['node_modules', 'dist', '.git', '.freebuff']);

const aiSignatures = [
  /\bgenerated\s+by\b/i,
  /\bai\s+(?:assistant|agent|coding\s+agent)\b/i,
  /\bco-authored-by\b/i
];

const userscriptStart = '// ==UserScript==';
const userscriptEnd = '// ==/UserScript==';

const walk = (dir, files = []) => {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) {
      if (!skipDirs.has(name)) walk(full, files);
      continue;
    }
    if (textExtensions.has(path.extname(name).toLowerCase())) files.push(full);
  }
  return files;
};

const protectUserscriptMetadata = (source) => {
  const start = source.indexOf(userscriptStart);
  const end = source.indexOf(userscriptEnd);
  if (start === -1 || end === -1 || end < start) return null;
  return [start, end + userscriptEnd.length];
};

const stripJs = (source, protectedRange) => {
  const comments = [];
  const tokens = tokenizer(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowHashBang: true,
    onComment: comments
  });
  while (tokens.getToken().type.label !== 'eof') {

  }

  const ranges = comments
    .filter((comment) => {
      if (!protectedRange) return true;
      return comment.start < protectedRange[0] || comment.end > protectedRange[1];
    })
    .map((comment) => ({
      start: comment.start,
      end: comment.end,
      replacement: comment.type === 'Block' ? ' ' : ''
    }))
    .sort((a, b) => b.start - a.start);

  let output = source;
  for (const range of ranges) {
    output = output.slice(0, range.start) + range.replacement + output.slice(range.end);
  }

  parse(output, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  return { output, removed: ranges.length };
};

const stripCss = (source, file) => {
  let removed = 0;
  let output = '';
  let quote = null;
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (quote) {
      output += char;
      if (char === '\\' && index + 1 < source.length) {
        output += source[index + 1];
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      output += char;
      index += 1;
      continue;
    }

    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      removed += 1;
      index = end === -1 ? source.length : end + 2;
      continue;
    }

    output += char;
    index += 1;
  }

  postcss.parse(output, { from: file });
  return { output, removed };
};

const stripHtmlComments = (source) => {
  let removed = 0;
  const output = source.replace(/<!--[\s\S]*?-->/g, () => {
    removed += 1;
    return '';
  });
  return { output, removed };
};

const normalize = (source) => {
  const withoutTrailing = source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n');
  return `${withoutTrailing.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n*$/, '')}\n`;
};

const aiMatches = (source) => {
  const hits = [];
  source.split('\n').forEach((line, index) => {
    if (aiSignatures.some((pattern) => pattern.test(line))) hits.push({ line: index + 1, text: line.trim() });
  });
  return hits;
};

const processFile = (file) => {
  const source = readFileSync(file, 'utf8');
  const extension = path.extname(file).toLowerCase();
  let result;

  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
    result = stripJs(source, protectUserscriptMetadata(source));
  } else if (extension === '.css') {
    result = stripCss(source, file);
  } else if (extension === '.html' || extension === '.md') {
    result = stripHtmlComments(source);
  } else {
    result = { output: source, removed: 0 };
  }

  let output = normalize(result.output);
  let aiHits = aiMatches(output);

  if (aiHits.length && (extension === '.md' || extension === '.html')) {
    const lines = output.split('\n').filter((line) => !aiSignatures.some((pattern) => pattern.test(line)));
    output = normalize(lines.join('\n'));
    aiHits = aiMatches(output);
  }

  const sizeBefore = Buffer.byteLength(source);
  const sizeAfter = Buffer.byteLength(output);
  if (output !== source) writeFileSync(file, output);

  return {
    file: path.relative(rootDir, file),
    changed: output !== source,
    removed: result.removed,
    bytes: sizeBefore - sizeAfter,
    ai: aiHits
  };
};

const files = [
  ...targetDirs.flatMap((dir) => walk(path.join(rootDir, dir))),
  ...targetFiles.map((file) => path.join(rootDir, file)).filter((file) => existsSync(file))
];

const results = files.map(processFile);
const cleaned = results.filter((item) => item.changed);

for (const item of cleaned) {
  console.log(`${item.file}: ${item.removed} comment(s), ${item.bytes} byte(s) removed`);
}

const comments = cleaned.reduce((sum, item) => sum + item.removed, 0);
const bytes = cleaned.reduce((sum, item) => sum + item.bytes, 0);
console.log(`\nCleaned ${cleaned.length} file(s): ${comments} comment(s), ${bytes} byte(s) removed.`);

const aiHits = results.flatMap((item) => item.ai.map((hit) => ({ ...hit, file: item.file })));
if (aiHits.length) {
  console.warn('\nAI signatures remaining:');
  for (const hit of aiHits) console.warn(`  ${hit.file}:${hit.line} ${hit.text}`);
  process.exitCode = 1;
} else {
  console.log('No AI signatures found in cleaned files.');
}
