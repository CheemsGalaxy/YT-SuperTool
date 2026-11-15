import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export const CODE_TTL_MS = 10 * 60 * 1000;
export const RATE_LIMIT = 5;
export const RATE_WINDOW_MS = 60 * 1000;
export const MAX_TOKENS = 8;

export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');

export const normalizePairingCode = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const formatPairingCode = (code) => {
  const normalized = normalizePairingCode(code);
  if (normalized.length !== CODE_LENGTH) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
};

export const generatePairingCode = () => {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return code;
};

const safeEqual = (left, right) => {
  const a = createHash('sha256').update(String(left)).digest();
  const b = createHash('sha256').update(String(right)).digest();
  return timingSafeEqual(a, b);
};

export const createPairing = ({ store, now = () => Date.now(), onChange = () => {}, maxTokens = MAX_TOKENS }) => {
  let tokens = [];
  let code = null;
  let consumedCode = null;
  let expiresAt = 0;
  let attempts = [];
  let loaded = false;

  const load = async () => {
    if (loaded) return;
    const data = await store.load('pairing.json', { tokens: [] });
    tokens = Array.isArray(data?.tokens)
      ? data.tokens.filter((item) => typeof item?.hash === 'string' && /^[a-f0-9]{64}$/.test(item.hash))
      : [];
    loaded = true;
  };

  const persist = () => store.save('pairing.json', { tokens });

  const isPaired = () => tokens.length > 0;

  const currentCode = () => (code && now() < expiresAt ? { code, expiresAt } : null);

  const startPairing = () => {
    code = generatePairingCode();
    consumedCode = null;
    expiresAt = now() + CODE_TTL_MS;
    attempts = [];
    onChange({ code, expiresAt });
    return { code, expiresAt };
  };

  const allowAttempt = () => {
    const timestamp = now();
    const cutoff = timestamp - RATE_WINDOW_MS;
    attempts = attempts.filter((time) => time > cutoff);
    if (attempts.length >= RATE_LIMIT) {
      throw new AppError('RATE_LIMITED', 'Too many pairing attempts. Wait a minute and try again.');
    }
    attempts.push(timestamp);
  };

  const pair = async ({ code: input, clientName }) => {
    await load();
    allowAttempt();

    const provided = normalizePairingCode(input);

    if (!code) {
      if (consumedCode && provided && safeEqual(provided, consumedCode)) {
        throw new AppError('PAIRING_CODE_EXPIRED');
      }
      throw new AppError('PAIRING_UNAVAILABLE');
    }

    if (now() >= expiresAt) {
      consumedCode = code;
      code = null;
      expiresAt = 0;
      throw new AppError('PAIRING_CODE_EXPIRED');
    }

    if (!provided || !safeEqual(provided, code)) {
      throw new AppError('PAIRING_CODE_INVALID');
    }

    const token = randomBytes(32).toString('base64url');
    const pairedAt = new Date(now()).toISOString();
    tokens.push({ hash: hashToken(token), clientName: String(clientName ?? 'unknown'), pairedAt });
    if (tokens.length > maxTokens) tokens = tokens.slice(tokens.length - maxTokens);

    consumedCode = code;
    code = null;
    expiresAt = 0;
    attempts = [];
    await persist();

    return { token, pairedAt };
  };

  const verifyToken = async (token) => {
    await load();
    if (typeof token !== 'string' || token.length === 0) return false;
    const hash = hashToken(token);
    return tokens.some((item) => safeEqual(item.hash, hash));
  };

  const unpair = async (token) => {
    await load();
    const hash = hashToken(token);
    tokens = tokens.filter((item) => !safeEqual(item.hash, hash));
    await persist();
    if (tokens.length === 0) startPairing();
    return true;
  };

  return {
    load,
    isPaired,
    count: () => tokens.length,
    currentCode,
    startPairing,
    pair,
    verifyToken,
    unpair
  };
};
