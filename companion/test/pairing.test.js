import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import test from 'node:test';
import {
  CODE_TTL_MS,
  RATE_LIMIT,
  createPairing,
  formatPairingCode,
  generatePairingCode,
  normalizePairingCode
} from '../src/pairing.js';
import { createStore } from '../src/store.js';
import { makeHome } from './support.js';

const setup = async (t, { start = true } = {}) => {
  const home = await makeHome();
  t.after(() => rm(home, { recursive: true, force: true }));
  const store = createStore({ dataDir: home });
  let clock = 1_000_000;
  const pairing = createPairing({ store, now: () => clock });
  await pairing.load();
  if (start) pairing.startPairing();
  return {
    pairing,
    store,
    advance: (ms) => {
      clock += ms;
    }
  };
};

test('generates readable eight character codes', () => {
  for (let index = 0; index < 50; index += 1) {
    const code = generatePairingCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.equal(formatPairingCode(code).length, 9);
    assert.equal(normalizePairingCode(formatPairingCode(code).toLowerCase()), code);
  }
});

test('pairs once and stores only a hash', async (t) => {
  const { pairing, store, advance } = await setup(t);
  const code = pairing.currentCode().code;

  const result = await pairing.pair({ code: formatPairingCode(code), clientName: 'userscript' });
  assert.equal(typeof result.token, 'string');
  assert.equal(result.token.length, 43);
  assert.equal(await pairing.verifyToken(result.token), true);
  assert.equal(await pairing.verifyToken('wrong-token'), false);
  assert.equal(pairing.isPaired(), true);

  const stored = await store.load('pairing.json', null);
  assert.equal(stored.tokens.length, 1);
  assert.equal(stored.tokens[0].hash.length, 64);
  assert.notEqual(stored.tokens[0].hash, result.token);

  await assert.rejects(
    () => pairing.pair({ code, clientName: 'mv3' }),
    (error) => error.code === 'PAIRING_CODE_EXPIRED'
  );

  advance(1000);
  const reloaded = createPairing({ store });
  await reloaded.load();
  assert.equal(await reloaded.verifyToken(result.token), true);
});

test('rejects a wrong code and keeps the active code usable', async (t) => {
  const { pairing } = await setup(t);
  const code = pairing.currentCode().code;

  await assert.rejects(
    () => pairing.pair({ code: 'ZZZZ-ZZZZ', clientName: 'mv2' }),
    (error) => error.code === 'PAIRING_CODE_INVALID'
  );

  const result = await pairing.pair({ code, clientName: 'mv2' });
  assert.equal(await pairing.verifyToken(result.token), true);
});

test('expires a code after ten minutes', async (t) => {
  const { pairing, advance } = await setup(t);
  const code = pairing.currentCode().code;
  advance(CODE_TTL_MS + 1);

  await assert.rejects(
    () => pairing.pair({ code, clientName: 'userscript' }),
    (error) => error.code === 'PAIRING_CODE_EXPIRED'
  );
});

test('rate limits pairing attempts', async (t) => {
  const { pairing } = await setup(t);

  for (let index = 0; index < RATE_LIMIT; index += 1) {
    await assert.rejects(
      () => pairing.pair({ code: 'ZZZZ-ZZZZ', clientName: 'userscript' }),
      (error) => error.code === 'PAIRING_CODE_INVALID'
    );
  }

  await assert.rejects(
    () => pairing.pair({ code: pairing.currentCode().code, clientName: 'userscript' }),
    (error) => error.code === 'RATE_LIMITED'
  );
});

test('reports no active code after pairing', async (t) => {
  const { pairing } = await setup(t);
  const code = pairing.currentCode().code;
  await pairing.pair({ code, clientName: 'userscript' });

  await assert.rejects(
    () => pairing.pair({ code: 'ABCD-2345', clientName: 'userscript' }),
    (error) => error.code === 'PAIRING_UNAVAILABLE'
  );
});

test('unpair revokes the token and prints a new code', async (t) => {
  const { pairing } = await setup(t);
  const code = pairing.currentCode().code;
  const { token } = await pairing.pair({ code, clientName: 'mv3' });

  await pairing.unpair(token);
  assert.equal(await pairing.verifyToken(token), false);
  assert.equal(pairing.isPaired(), false);
  assert.ok(pairing.currentCode()?.code);
});
