import assert from 'node:assert/strict';
import test from 'node:test';
import { CompanionError, createCompanionClient } from '../src/core/companion/client.js';
import { COMPANION_BASE_URL, COMPANION_TOKEN_KEY } from '../src/core/companion/constants.js';

const createStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async get(key, fallback) {
      return data.has(key) ? data.get(key) : fallback;
    },
    async set(key, value) {
      data.set(key, value);
    }
  };
};

const createTransport = (handler) => {
  const calls = [];
  const transport = async (request) => {
    calls.push(request);
    return handler(request, calls.length - 1);
  };
  transport.calls = calls;
  return transport;
};

const ok = (body) => ({ status: 200, data: { ok: true, ...body } });

const health = (overrides = {}) => ok({
  service: 'yt-super-tool-companion',
  companionVersion: '1.0.0',
  apiVersion: 1,
  paired: false,
  binaries: { ytdlp: { available: true }, ffmpeg: { available: true } },
  ...overrides
});

const makeClient = ({ transport, storage = createStorage(), ...overrides } = {}) => createCompanionClient({
  transport,
  storage,
  clientName: 'userscript',
  clientVersion: '2.4.3',
  ...overrides
});

test('requires a transport and storage', () => {
  assert.throws(() => createCompanionClient({ storage: createStorage() }), /transport/);
  assert.throws(() => createCompanionClient({ transport: async () => ({}) }), /storage/);
});

test('exposes the fixed loopback base url', () => {
  const client = makeClient({ transport: createTransport(() => health()) });
  assert.equal(COMPANION_BASE_URL, 'http://127.0.0.1:47831');
  assert.equal(client.baseUrl, COMPANION_BASE_URL);
  assert.equal(COMPANION_TOKEN_KEY, 'companionToken');
  assert.equal(client.clientName, 'userscript');
});

test('reports not-running when the transport fails', async () => {
  const client = makeClient({
    transport: createTransport(() => {
      throw new Error('ECONNREFUSED');
    })
  });

  const result = await client.status();
  assert.equal(result.state, 'not-running');
  assert.equal(result.error.code, 'NOT_RUNNING');
});

test('reports not-running when the transport returns status zero', async () => {
  const timeout = makeClient({ transport: createTransport(() => ({ status: 0, error: 'TIMEOUT' })) });
  const timeoutResult = await timeout.status();
  assert.equal(timeoutResult.state, 'not-running');
  assert.equal(timeoutResult.error.code, 'TIMEOUT');

  const offline = makeClient({ transport: createTransport(() => ({ status: 0, error: 'NOT_RUNNING' })) });
  const offlineResult = await offline.status();
  assert.equal(offlineResult.state, 'not-running');
  assert.equal(offlineResult.error.code, 'NOT_RUNNING');
});

test('reports incompatible when the health payload has a different api version', async () => {
  const client = makeClient({ transport: createTransport(() => health({ apiVersion: 2 })) });
  const result = await client.status();
  assert.equal(result.state, 'incompatible');
  assert.equal(result.health.apiVersion, 2);
});

test('reports not-paired when the companion has no token or the client has no token', async () => {
  const unpaired = makeClient({ transport: createTransport(() => health({ paired: false })) });
  assert.equal((await unpaired.status()).state, 'not-paired');

  const paired = makeClient({ transport: createTransport(() => health({ paired: true })) });
  assert.equal((await paired.status()).state, 'not-paired');
});

test('reports ready when both sides are paired', async () => {
  const storage = createStorage({ [COMPANION_TOKEN_KEY]: 'stored-token' });
  const transport = createTransport(() => health({ paired: true }));
  const client = makeClient({ transport, storage });

  const result = await client.status();
  assert.equal(result.state, 'ready');
  assert.equal(result.health.paired, true);
  assert.equal(transport.calls[0].path, '/api/health');
  assert.equal(transport.calls[0].headers['X-YTST-Token'], undefined);
  assert.equal(transport.calls[0].headers['X-YTST-Client'], 'userscript');
  assert.equal(transport.calls[0].headers['X-YTST-Client-Version'], '2.4.3');
});

test('reports error when health fails with a server error', async () => {
  const client = makeClient({
    transport: createTransport(() => ({ status: 500, data: { ok: false, error: { code: 'INTERNAL' } } }))
  });

  const result = await client.status();
  assert.equal(result.state, 'error');
  assert.equal(result.error.code, 'REQUEST_FAILED');
  assert.equal(result.error.serverCode, 'INTERNAL');
});

test('pairs without a token and stores the issued token', async () => {
  const storage = createStorage();
  const transport = createTransport(() => ok({
    token: 'issued-token',
    companionVersion: '1.0.0',
    apiVersion: 1,
    pairedAt: '2026-11-15T00:00:00.000Z'
  }));
  const client = makeClient({ transport, storage });

  const result = await client.pair('ABCD-2345');
  assert.deepEqual(result, {
    companionVersion: '1.0.0',
    apiVersion: 1,
    pairedAt: '2026-11-15T00:00:00.000Z'
  });
  assert.equal(storage.data.get(COMPANION_TOKEN_KEY), 'issued-token');
  assert.equal(await client.isPaired(), true);

  const request = transport.calls[0];
  assert.equal(request.path, '/api/pair');
  assert.equal(request.method, 'POST');
  assert.deepEqual(request.body, { code: 'ABCD-2345', clientName: 'userscript' });
  assert.equal(request.headers['X-YTST-Token'], undefined);
});

test('recovers a pairing token the background stored when the response was lost', async () => {
  const storage = createStorage({ [COMPANION_TOKEN_KEY]: 'recovered-token' });
  const transport = createTransport(() => new Promise(() => {}));
  const client = makeClient({ transport, storage, timeouts: { pair: 10 }, timeoutGrace: 10 });

  const result = await client.pair('ABCD-2345');
  assert.equal(result.recovered, true);
  assert.equal(result.apiVersion, 1);
  assert.equal(await client.isPaired(), true);
  assert.equal(transport.calls.length, 1);
});

test('throws TIMEOUT when a pairing response is lost and no token was stored', async () => {
  const transport = createTransport(() => new Promise(() => {}));
  const client = makeClient({ transport, storage: createStorage(), timeouts: { pair: 10 }, timeoutGrace: 10 });

  await assert.rejects(
    () => client.pair('ABCD-2345'),
    (error) => error instanceof CompanionError && error.code === 'TIMEOUT'
  );
});

test('rejects a pairing answer from an incompatible companion', async () => {
  const storage = createStorage();
  const transport = createTransport(() => ok({ token: 'issued-token', apiVersion: 2 }));
  const client = makeClient({ transport, storage });

  await assert.rejects(
    () => client.pair('ABCD-2345'),
    (error) => error instanceof CompanionError && error.code === 'INCOMPATIBLE'
  );
  assert.equal(storage.data.has(COMPANION_TOKEN_KEY), false);
});

test('sends the stored token on private routes', async () => {
  const storage = createStorage({ [COMPANION_TOKEN_KEY]: 'stored-token' });
  const transport = createTransport(() => ok({ job: { id: 'job-1', state: 'queued' } }));
  const client = makeClient({ transport, storage });

  const job = await client.start({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', mode: 'video' });
  assert.equal(job.id, 'job-1');
  assert.equal(transport.calls[0].path, '/api/download');
  assert.equal(transport.calls[0].method, 'POST');
  assert.equal(transport.calls[0].headers['X-YTST-Token'], 'stored-token');
});

test('throws NOT_PAIRED before any request when no token is stored', async () => {
  const transport = createTransport(() => ok({ settings: {} }));
  const client = makeClient({ transport, storage: createStorage() });

  await assert.rejects(
    () => client.getSettings(),
    (error) => error instanceof CompanionError && error.code === 'NOT_PAIRED'
  );
  assert.equal(transport.calls.length, 0);
});

test('clears the stored token on 401', async () => {
  const storage = createStorage({ [COMPANION_TOKEN_KEY]: 'stale-token' });
  const transport = createTransport(() => ({
    status: 401,
    data: { ok: false, error: { code: 'BAD_TOKEN', message: 'Pairing token is missing or invalid.' } }
  }));
  const client = makeClient({ transport, storage });

  await assert.rejects(
    () => client.getSettings(),
    (error) => error.code === 'UNAUTHORIZED'
      && error.status === 401
      && error.serverCode === 'BAD_TOKEN'
      && error.message === 'Pairing token is missing or invalid.'
  );
  assert.equal(storage.data.get(COMPANION_TOKEN_KEY), null);
  assert.equal(await client.isPaired(), false);
});

test('maps other server errors to REQUEST_FAILED', async () => {
  const client = makeClient({
    storage: createStorage({ [COMPANION_TOKEN_KEY]: 'stored-token' }),
    transport: createTransport(() => ({
      status: 403,
      data: { ok: false, error: { code: 'ORIGIN_REJECTED', message: 'Request origin is not allowed.' } }
    }))
  });

  await assert.rejects(
    () => client.getSettings(),
    (error) => error.code === 'REQUEST_FAILED'
      && error.status === 403
      && error.serverCode === 'ORIGIN_REJECTED'
      && error.message === 'Request origin is not allowed.'
  );
});

test('rejects malformed and unsuccessful payloads', async () => {
  const storage = createStorage({ [COMPANION_TOKEN_KEY]: 'stored-token' });

  const noStatus = makeClient({ transport: createTransport(() => ({})), storage });
  await assert.rejects(() => noStatus.getSettings(), (error) => error.code === 'BAD_RESPONSE');

  const missingOk = makeClient({
    transport: createTransport(() => ({ status: 200, data: { job: {} } })),
    storage
  });
  await assert.rejects(() => missingOk.getSettings(), (error) => error.code === 'BAD_RESPONSE');

  const brokenJson = makeClient({
    transport: createTransport(() => ({ status: 200, data: '{not json' })),
    storage
  });
  await assert.rejects(() => brokenJson.getSettings(), (error) => error.code === 'BAD_RESPONSE');

  const failedHealth = makeClient({ transport: createTransport(() => ({})) });
  const state = await failedHealth.status();
  assert.equal(state.state, 'error');
  assert.equal(state.error.code, 'BAD_RESPONSE');
});

test('parses a string payload', async () => {
  const client = makeClient({
    transport: createTransport(() => ({
      status: 200,
      data: JSON.stringify({ ok: true, settings: { videoQuality: '720' } })
    })),
    storage: createStorage({ [COMPANION_TOKEN_KEY]: 'stored-token' })
  });

  const settings = await client.getSettings();
  assert.deepEqual(settings, { videoQuality: '720' });
});

test('builds job routes and encodes the id', async () => {
  const storage = createStorage({ [COMPANION_TOKEN_KEY]: 'stored-token' });
  const transport = createTransport((request) => {
    if (request.method === 'POST') return ok({ job: { id: 'job/1', state: 'cancelled' } });
    return ok({ job: { id: 'job/1', state: 'running', progress: 0.5 } });
  });
  const client = makeClient({ transport, storage });

  const job = await client.get('job/1');
  assert.equal(job.progress, 0.5);
  assert.equal(transport.calls[0].path, '/api/download/job%2F1');

  const cancelled = await client.cancel('job/1');
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(transport.calls[1].path, '/api/download/job%2F1/cancel');
  assert.equal(transport.calls[1].method, 'POST');
});

test('returns analyze results and updates settings', async () => {
  const storage = createStorage({ [COMPANION_TOKEN_KEY]: 'stored-token' });
  const transport = createTransport((request) => {
    if (request.path === '/api/analyze') {
      return ok({
        video: { id: 'dQw4w9WgXcQ', title: 'Sample' },
        options: { video: [{ quality: 'best' }], audio: [{ format: 'mp3' }] }
      });
    }
    return ok({ settings: { videoQuality: '1080', ...request.body } });
  });
  const client = makeClient({ transport, storage });

  const analysis = await client.analyze('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(analysis.video.id, 'dQw4w9WgXcQ');
  assert.equal(analysis.options.audio[0].format, 'mp3');
  assert.deepEqual(transport.calls[0].body, { url: 'https://youtu.be/dQw4w9WgXcQ' });

  const settings = await client.updateSettings({ videoQuality: '720' });
  assert.equal(settings.videoQuality, '720');
  assert.equal(transport.calls[1].method, 'PUT');
  assert.deepEqual(transport.calls[1].body, { videoQuality: '720' });
});

test('unpair clears the local token even when the request fails', async () => {
  const storage = createStorage({ [COMPANION_TOKEN_KEY]: 'stored-token' });
  const transport = createTransport(() => {
    throw new Error('socket closed');
  });
  const client = makeClient({ transport, storage });

  await assert.rejects(() => client.unpair(), (error) => error.code === 'NOT_RUNNING');
  assert.equal(storage.data.get(COMPANION_TOKEN_KEY), null);
});

test('unpair posts to the companion and clears the token', async () => {
  const storage = createStorage({ [COMPANION_TOKEN_KEY]: 'stored-token' });
  const transport = createTransport(() => ok({}));
  const client = makeClient({ transport, storage });

  await client.unpair();
  assert.equal(transport.calls[0].path, '/api/unpair');
  assert.equal(transport.calls[0].headers['X-YTST-Token'], 'stored-token');
  assert.equal(storage.data.get(COMPANION_TOKEN_KEY), null);
});

test('clearToken removes the stored value', async () => {
  const storage = createStorage({ [COMPANION_TOKEN_KEY]: 'stored-token' });
  const client = makeClient({ transport: createTransport(() => ok({})), storage });

  assert.equal(await client.isPaired(), true);
  await client.clearToken();
  assert.equal(await client.isPaired(), false);
  assert.equal(storage.data.get(COMPANION_TOKEN_KEY), null);
});
