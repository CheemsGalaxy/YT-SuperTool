import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { downloadSegmented } from '../src/downloader/engine.js';

const makeBody = (size) => {
  const body = Buffer.alloc(size);
  for (let index = 0; index < size; index += 1) body[index] = (index * 31 + 7) & 0xff;
  return body;
};

const serve = (body, { ranges = true, delayMs = 0, chunk = 64 * 1024 } = {}) => {
  const stats = { requests: 0, rangeRequests: 0 };
  const server = createServer((request, response) => {
    stats.requests += 1;
    const header = request.headers.range;

    if (ranges && header) {
      stats.rangeRequests += 1;
      const match = header.match(/^bytes=(\d+)-(\d+)$/);
      if (!match) {
        response.writeHead(416);
        response.end();
        return;
      }
      const start = Number(match[1]);
      const end = Math.min(body.length - 1, Number(match[2]));
      if (start > end) {
        response.writeHead(416, { 'Content-Range': `bytes */${body.length}` });
        response.end();
        return;
      }
      response.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${body.length}`,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
        ETag: '"fixture-v1"'
      });
      const slice = body.subarray(start, end + 1);
      if (!delayMs) {
        response.end(slice);
        return;
      }
      let offset = 0;
      const timer = setInterval(() => {
        const piece = slice.subarray(offset, offset + chunk);
        offset += piece.length;
        if (offset >= slice.length) {
          clearInterval(timer);
          response.end(piece);
          return;
        }
        response.write(piece);
      }, delayMs);
      response.on('close', () => clearInterval(timer));
      return;
    }

    response.writeHead(200, { 'Content-Length': body.length, 'Accept-Ranges': ranges ? 'bytes' : 'none' });
    response.end(body);
  });

  return { server, stats };
};

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

const makeWorkdir = (t) => mkdtemp(path.join(os.tmpdir(), 'ytst-engine-')).then((dir) => {
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
});

test('downloads a file over several range connections', async (t) => {
  const body = makeBody(8 * 1024 * 1024);
  const { server, stats } = serve(body);
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const dir = await makeWorkdir(t);
  const target = path.join(dir, 'media.bin');

  const result = await downloadSegmented({
    url: `http://127.0.0.1:${port}/media`,
    filePath: target,
    connections: 4,
    chunkBytes: 512 * 1024
  });

  assert.equal(result.size, body.length);
  assert.equal(result.resumed, false);
  assert.deepEqual(await readFile(target), body);
  assert.ok(stats.rangeRequests >= 5, `only ${stats.rangeRequests} range requests`);
});

test('falls back to one stream when the server ignores ranges', async (t) => {
  const body = makeBody(512 * 1024);
  const { server, stats } = serve(body, { ranges: false });
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const dir = await makeWorkdir(t);
  const target = path.join(dir, 'single.bin');

  const result = await downloadSegmented({
    url: `http://127.0.0.1:${port}/media`,
    filePath: target,
    connections: 8
  });

  assert.equal(result.size, body.length);
  assert.deepEqual(await readFile(target), body);
  assert.equal(stats.rangeRequests, 0);
});

test('reports progress while bytes arrive', async (t) => {
  const body = makeBody(2 * 1024 * 1024);
  const { server } = serve(body);
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const dir = await makeWorkdir(t);
  const seen = [];

  await downloadSegmented({
    url: `http://127.0.0.1:${port}/media`,
    filePath: path.join(dir, 'progress.bin'),
    connections: 2,
    chunkBytes: 256 * 1024,
    onProgress: (progress) => seen.push(progress)
  });

  assert.ok(seen.length > 0);
  assert.equal(seen.at(-1).received, body.length);
  assert.equal(seen.at(-1).total, body.length);
  assert.ok(seen.every((progress) => progress.received <= progress.total));
});

test('stops every worker when the signal aborts', async (t) => {
  const body = makeBody(4 * 1024 * 1024);
  const { server } = serve(body, { delayMs: 15 });
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const dir = await makeWorkdir(t);
  const target = path.join(dir, 'cancelled.bin');
  const controller = new AbortController();
  let last = null;

  await assert.rejects(
    downloadSegmented({
      url: `http://127.0.0.1:${port}/media`,
      filePath: target,
      connections: 2,
      chunkBytes: 256 * 1024,
      signal: controller.signal,
      onProgress: (progress) => {
        last = progress;
        if (progress.received > 128 * 1024) controller.abort();
      }
    }),
    (error) => error.name === 'AbortError'
  );

  assert.ok(last === null || last.received < body.length);
  const info = await stat(target).catch(() => null);
  assert.ok(info === null || info.size === body.length);
});

test('resumes a download from a saved state file', async (t) => {
  const body = makeBody(1024 * 1024);
  const ranges = [];
  const server = createServer((request, response) => {
    const match = String(request.headers.range ?? '').match(/^bytes=(\d+)-(\d+)$/);
    if (!match) {
      response.writeHead(200, { 'Content-Length': body.length, 'Accept-Ranges': 'bytes' });
      response.end(body);
      return;
    }
    const start = Number(match[1]);
    const end = Math.min(body.length - 1, Number(match[2]));
    if (end > start) ranges.push(start);
    response.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${body.length}`,
      'Content-Length': end - start + 1,
      ETag: '"fixture-v1"'
    });
    response.end(body.subarray(start, end + 1));
  });
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const dir = await makeWorkdir(t);
  const target = path.join(dir, 'resume.bin');
  const statePath = path.join(dir, 'resume.json');
  const half = body.length / 2;
  await writeFile(target, body.subarray(0, half));
  await writeFile(statePath, JSON.stringify({
    url: `http://127.0.0.1:${port}/media`,
    size: body.length,
    etag: '"fixture-v1"',
    segments: [
      { start: 0, cursor: half, end: half },
      { start: half, cursor: half, end: body.length }
    ]
  }));

  const result = await downloadSegmented({
    url: `http://127.0.0.1:${port}/media`,
    filePath: target,
    statePath,
    connections: 2,
    chunkBytes: 256 * 1024
  });

  assert.equal(result.resumed, true);
  assert.deepEqual(await readFile(target), body);
  assert.ok(ranges.length > 0);
  assert.ok(ranges.every((start) => start >= half), `range started before saved cursor: ${ranges.join(',')}`);
  assert.equal(await stat(statePath).catch(() => null), null);
});

test('rejects a redirect to an unsupported protocol', async (t) => {
  const server = createServer((request, response) => {
    response.writeHead(302, { Location: 'file:///etc/passwd' });
    response.end();
  });
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const dir = await makeWorkdir(t);

  await assert.rejects(
    downloadSegmented({
      url: `http://127.0.0.1:${port}/media`,
      filePath: path.join(dir, 'redirect.bin'),
      connections: 1
    }),
    (error) => error.code === 'DOWNLOAD_FAILED' && /unsupported protocol/.test(error.message)
  );
});

test('removes resume state after a completed download', async (t) => {
  const body = makeBody(256 * 1024);
  const { server } = serve(body);
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const dir = await makeWorkdir(t);
  const statePath = path.join(dir, 'media.mdm.json');

  await downloadSegmented({
    url: `http://127.0.0.1:${port}/media`,
    filePath: path.join(dir, 'media.bin'),
    statePath,
    connections: 2
  });

  assert.equal(await stat(statePath).catch(() => null), null);
});
