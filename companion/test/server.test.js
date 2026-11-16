import assert from 'node:assert/strict';
import { access, rm } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { createJobManager } from '../src/jobs.js';
import { createPairing } from '../src/pairing.js';
import { createServer } from '../src/server.js';
import { buildDownloadArgs, parseProgressLine } from '../src/ytdlp.js';
import { availableBinaries, completingLauncher, makeHome, makeSettings } from './support.js';

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const ORIGIN = 'https://www.youtube.com';

const startApp = async (t, { launcher = completingLauncher(), binaries = availableBinaries() } = {}) => {
  const home = await makeHome();
  const { store, settings } = await makeSettings(home);
  const pairing = createPairing({ store });
  await pairing.load();

  const jobs = createJobManager({
    getSettings: () => settings.get(),
    binaries,
    ytdlp: { buildDownloadArgs, parseProgressLine },
    launcher,
    homeDir: home
  });

  const analyzeCalls = [];
  const ytdlp = {
    analyzeVideo: async (input) => {
      analyzeCalls.push(input);
      return {
        video: {
          id: 'dQw4w9WgXcQ',
          title: 'Sample title',
          duration: 213,
          thumbnail: null,
          uploader: 'Test channel'
        },
        options: {
          video: [{ quality: 'best', label: 'Best available', height: 1080 }],
          audio: [{ format: 'mp3', label: 'MP3 192 kbps' }]
        }
      };
    }
  };

  const server = createServer({ pairing, jobs, settings, binaries, ytdlp, version: '1.0.0' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await jobs.shutdown();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await rm(home, { recursive: true, force: true });
  });

  return { base, home, pairing, jobs, settings, server, analyzeCalls };
};

const request = async (base, pathname, { method = 'GET', token, origin, body, rawBody } = {}) => {
  const headers = {};
  if (token) headers['X-YTST-Token'] = token;
  if (origin) headers.Origin = origin;
  if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000)
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null
  };
};

const pairOverHttp = async (base, pairing) => {
  const { code } = pairing.startPairing();
  const result = await request(base, '/api/pair', { method: 'POST', origin: ORIGIN, body: { code, clientName: 'userscript' } });
  assert.equal(result.status, 200);
  return result.body.token;
};

const rawRequest = (port, { method = 'GET', path: pathname = '/api/health', headers = {} } = {}) => new Promise((resolve, reject) => {
  const client = http.request({ host: '127.0.0.1', port, method, path: pathname, headers }, (response) => {
    let text = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => {
      text += chunk;
    });
    response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: text }));
  });
  client.on('error', reject);
  client.end();
});

test('health is public and reports version data', async (t) => {
  const { base } = await startApp(t);
  const result = await request(base, '/api/health');

  assert.equal(result.status, 200);
  assert.equal(result.body.service, 'yt-super-tool-companion');
  assert.equal(result.body.apiVersion, 1);
  assert.equal(result.body.paired, false);
  assert.equal(result.body.binaries.ytdlp.available, true);
  assert.equal(result.headers.get('cache-control'), 'no-store');
});

test('version payload names a client version the extension meets', async (t) => {
  const { base } = await startApp(t);
  const result = await request(base, '/api/version');

  assert.equal(result.status, 200);
  assert.equal(result.body.companionVersion, '1.0.0');
  assert.equal(result.body.minimumClientVersion, '2.4.3');
});

test('pair flow rejects a wrong code and accepts a valid one once', async (t) => {
  const { base, pairing } = await startApp(t);
  const { code } = pairing.startPairing();

  const wrong = await request(base, '/api/pair', { method: 'POST', body: { code: 'ZZZZ-ZZZZ', clientName: 'mv3' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error.code, 'PAIRING_CODE_INVALID');

  const good = await request(base, '/api/pair', { method: 'POST', body: { code, clientName: 'mv3' } });
  assert.equal(good.status, 200);
  assert.equal(good.body.apiVersion, 1);
  assert.equal(good.body.token.length, 43);

  const reused = await request(base, '/api/pair', { method: 'POST', body: { code, clientName: 'mv3' } });
  assert.equal(reused.status, 410);
  assert.equal(reused.body.error.code, 'PAIRING_CODE_EXPIRED');

  const health = await request(base, '/api/health');
  assert.equal(health.body.paired, true);
});

test('pair rejects unknown client names', async (t) => {
  const { base, pairing } = await startApp(t);
  const { code } = pairing.startPairing();
  const result = await request(base, '/api/pair', { method: 'POST', body: { code, clientName: 'unknown' } });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'BAD_REQUEST');
});

test('token is required for private routes', async (t) => {
  const { base, pairing } = await startApp(t);

  const missing = await request(base, '/api/settings');
  assert.equal(missing.status, 401);
  assert.equal(missing.body.error.code, 'BAD_TOKEN');

  const token = await pairOverHttp(base, pairing);
  const allowed = await request(base, '/api/settings', { token });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.ok, true);
  assert.ok(path.isAbsolute(allowed.body.settings.outputDir));
});

test('unpair revokes the token', async (t) => {
  const { base, pairing } = await startApp(t);
  const token = await pairOverHttp(base, pairing);

  const result = await request(base, '/api/unpair', { method: 'POST', token });
  assert.equal(result.status, 200);

  const after = await request(base, '/api/settings', { token });
  assert.equal(after.status, 401);
});

test('rejects foreign origins and allows YouTube origins', async (t) => {
  const { base } = await startApp(t);

  const foreign = await request(base, '/api/health', { origin: 'https://evil.example' });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.error.code, 'ORIGIN_REJECTED');
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);

  const youtube = await request(base, '/api/health', { origin: ORIGIN });
  assert.equal(youtube.status, 200);
  assert.equal(youtube.headers.get('access-control-allow-origin'), ORIGIN);

  const extension = await request(base, '/api/health', { origin: 'chrome-extension://abcdefghijklmnop' });
  assert.equal(extension.status, 200);
});

test('rejects a foreign Host header', async (t) => {
  const { server } = await startApp(t);
  const port = server.address().port;

  const foreign = await rawRequest(port, { headers: { Host: 'evil.example' } });
  assert.equal(foreign.status, 403);

  const loopback = await rawRequest(port, { headers: { Host: `127.0.0.1:${port}` } });
  assert.equal(loopback.status, 200);
});

test('answers CORS preflight for allowed origins', async (t) => {
  const { base } = await startApp(t);
  const response = await fetch(`${base}/api/settings`, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'content-type,x-ytst-token'
    }
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(response.headers.get('access-control-allow-headers'), /x-ytst-token/);
});

test('analyze validates the url and returns presets', async (t) => {
  const { base, pairing } = await startApp(t);
  const token = await pairOverHttp(base, pairing);

  const ok = await request(base, '/api/analyze', { method: 'POST', token, body: { url: VIDEO } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.video.id, 'dQw4w9WgXcQ');
  assert.deepEqual(ok.body.options.video.map((item) => item.quality), ['best']);

  const invalid = await request(base, '/api/analyze', { method: 'POST', token, body: { url: 'https://example.com/video' } });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'INVALID_URL');

  const anonymous = await request(base, '/api/analyze', { method: 'POST', body: { url: VIDEO } });
  assert.equal(anonymous.status, 401);
});

test('analyze uses the configured cookie source', async (t) => {
  const { base, pairing, analyzeCalls } = await startApp(t);
  const token = await pairOverHttp(base, pairing);

  await request(base, '/api/settings', { method: 'PUT', token, body: { cookiesFromBrowser: 'edge' } });
  const ok = await request(base, '/api/analyze', { method: 'POST', token, body: { url: VIDEO } });
  assert.equal(ok.status, 200);
  assert.equal(analyzeCalls.at(-1).cookiesFromBrowser, 'edge');
});

test('download lifecycle reaches completion and blocks cancel', async (t) => {
  const { base, home, pairing } = await startApp(t);
  const token = await pairOverHttp(base, pairing);

  const created = await request(base, '/api/download', { method: 'POST', token, body: { url: VIDEO, mode: 'video', quality: '1080' } });
  assert.equal(created.status, 202);
  assert.equal(created.body.job.state, 'queued');

  let job = created.body.job;
  for (let attempt = 0; attempt < 100 && job.state !== 'completed'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const current = await request(base, `/api/download/${job.id}`, { token });
    assert.equal(current.status, 200);
    job = current.body.job;
  }

  assert.equal(job.state, 'completed');
  assert.equal(job.progress, 1);
  assert.ok(job.outputPath.startsWith(path.join(home, 'Downloads', 'YT SuperTool')));
  await access(job.outputPath);

  const cancel = await request(base, `/api/download/${job.id}/cancel`, { method: 'POST', token });
  assert.equal(cancel.status, 409);
  assert.equal(cancel.body.error.code, 'JOB_FINISHED');
});

test('download reports missing binaries', async (t) => {
  const { base, pairing } = await startApp(t, { binaries: { ytdlp: { available: false, error: 'NOT_FOUND' }, ffmpeg: { available: true } } });
  const token = await pairOverHttp(base, pairing);

  const result = await request(base, '/api/download', { method: 'POST', token, body: { url: VIDEO } });
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, 'YTDLP_MISSING');
});

test('settings update is validated', async (t) => {
  const { base, home, pairing } = await startApp(t);
  const token = await pairOverHttp(base, pairing);

  const updated = await request(base, '/api/settings', { method: 'PUT', token, body: { videoQuality: '720' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.settings.videoQuality, '720');

  const invalid = await request(base, '/api/settings', { method: 'PUT', token, body: { videoQuality: '999' } });
  assert.equal(invalid.status, 400);

  const outside = await request(base, '/api/settings', {
    method: 'PUT',
    token,
    body: { outputDir: path.join(path.dirname(home), 'outside') }
  });
  assert.equal(outside.status, 503);
  assert.equal(outside.body.error.code, 'OUTPUT_DIR_INVALID');
});

test('rejects oversized bodies', async (t) => {
  const { base } = await startApp(t);
  const result = await request(base, '/api/pair', {
    method: 'POST',
    origin: ORIGIN,
    rawBody: JSON.stringify({ code: 'A'.repeat(70000), clientName: 'userscript' })
  });
  assert.equal(result.status, 413);
  assert.equal(result.body.error.code, 'BODY_TOO_LARGE');
});

test('returns 404 and 405 for unknown routes', async (t) => {
  const { base, pairing } = await startApp(t);
  const token = await pairOverHttp(base, pairing);

  const missing = await request(base, '/api/unknown', { token });
  assert.equal(missing.status, 404);

  const wrongMethod = await request(base, '/api/download', { method: 'DELETE', token });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.body.error.code, 'METHOD_NOT_ALLOWED');
});
