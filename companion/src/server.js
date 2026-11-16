import http from 'node:http';
import { binariesSummary } from './binaries.js';
import { AppError, errorPayload } from './errors.js';
import { parseYouTubeUrl } from './url-policy.js';

const BODY_LIMIT = 64 * 1024;
const YOUTUBE_ORIGINS = new Set([
  'https://www.youtube.com',
  'https://youtube.com',
  'https://m.youtube.com',
  'https://music.youtube.com'
]);
const EXTENSION_ORIGIN = /^(chrome-extension|moz-extension|safari-web-extension):\/\/[A-Za-z0-9-]+$/;

export const isAllowedOrigin = (origin) => YOUTUBE_ORIGINS.has(origin) || EXTENSION_ORIGIN.test(origin);

export const isAllowedHost = (host) => {
  if (typeof host !== 'string') return false;
  const match = host.match(/^(127\.0\.0\.1|localhost)(?::(\d{1,5}))?$/i);
  if (!match) return false;
  if (!match[2]) return true;
  const port = Number(match[2]);
  return port > 0 && port <= 65535;
};

const corsHeaders = (origin, { privateNetwork = false } = {}) => {
  const headers = { Vary: 'Origin' };
  if (!origin) return headers;
  headers['Access-Control-Allow-Origin'] = origin;
  headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'content-type, x-ytst-token, x-ytst-client, x-ytst-client-version';
  headers['Access-Control-Max-Age'] = '600';
  if (privateNetwork) headers['Access-Control-Allow-Private-Network'] = 'true';
  return headers;
};

const writeJson = (res, status, payload, headers = {}) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
};

const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0;
  let rejected = false;
  const chunks = [];

  req.on('data', (chunk) => {
    if (rejected) return;
    size += chunk.length;
    if (size > BODY_LIMIT) {
      rejected = true;
      chunks.length = 0;
      reject(new AppError('BODY_TOO_LARGE'));
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (rejected) return;
    resolve(Buffer.concat(chunks).toString('utf8'));
  });

  req.on('error', (error) => {
    if (rejected) return;
    reject(error);
  });
});

const readJson = async (req) => {
  const text = await readBody(req);
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new AppError('BAD_REQUEST', 'Request body must be a JSON object.');
  }
};

const downloadId = (pathname) => {
  const match = pathname.match(/^\/api\/download\/([A-Za-z0-9-]{1,64})$/);
  return match ? match[1] : null;
};

const cancelId = (pathname) => {
  const match = pathname.match(/^\/api\/download\/([A-Za-z0-9-]{1,64})\/cancel$/);
  return match ? match[1] : null;
};

const knownPath = (pathname) => (
  pathname === '/api/health'
  || pathname === '/api/version'
  || pathname === '/api/pair'
  || pathname === '/api/unpair'
  || pathname === '/api/analyze'
  || pathname === '/api/download'
  || pathname === '/api/settings'
  || Boolean(downloadId(pathname))
  || Boolean(cancelId(pathname))
);

export const createServer = ({
  pairing,
  jobs,
  settings,
  binaries,
  ytdlp,
  version = '1.0.0',
  apiVersion = 1,
  logger = null
}) => {
  const authenticate = async (req) => {
    const token = req.headers['x-ytst-token'];
    if (typeof token !== 'string' || token.length === 0) throw new AppError('BAD_TOKEN');
    const valid = await pairing.verifyToken(token);
    if (!valid) throw new AppError('BAD_TOKEN');
    return token;
  };

  const handler = async (req, res) => {
    let headers = {};

    try {
      if (!isAllowedHost(req.headers.host)) throw new AppError('HOST_REJECTED');

      const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
      if (origin && !isAllowedOrigin(origin)) throw new AppError('ORIGIN_REJECTED');
      headers = corsHeaders(origin, {
        privateNetwork: String(req.headers['access-control-request-private-network'] ?? '').toLowerCase() === 'true'
      });

      if (req.method === 'OPTIONS') {
        res.writeHead(204, headers);
        res.end();
        return;
      }

      const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;

      if (req.method === 'GET' && pathname === '/api/health') {
        writeJson(res, 200, {
          ok: true,
          service: 'yt-super-tool-companion',
          companionVersion: version,
          apiVersion,
          platform: `${process.platform}-${process.arch}`,
          paired: pairing.isPaired(),
          binaries: binariesSummary(binaries)
        }, headers);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/version') {
        writeJson(res, 200, {
          ok: true,
          service: 'yt-super-tool-companion',
          companionVersion: version,
          apiVersion,
          minimumClientVersion: '2.4.3'
        }, headers);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/pair') {
        const body = await readJson(req);
        if (typeof body.code !== 'string' || body.code.trim().length === 0) {
          throw new AppError('BAD_REQUEST', 'Pairing code is required.');
        }
        if (!['userscript', 'mv2', 'mv3'].includes(body.clientName)) {
          throw new AppError('BAD_REQUEST', 'Unknown client name.');
        }
        const result = await pairing.pair({ code: body.code, clientName: body.clientName });
        writeJson(res, 200, {
          ok: true,
          token: result.token,
          companionVersion: version,
          apiVersion,
          pairedAt: result.pairedAt
        }, headers);
        return;
      }

      if (pathname.startsWith('/api/')) {
        await authenticate(req);
      }

      if (req.method === 'POST' && pathname === '/api/unpair') {
        const token = req.headers['x-ytst-token'];
        await pairing.unpair(token);
        writeJson(res, 200, { ok: true }, headers);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/analyze') {
        const body = await readJson(req);
        const parsed = parseYouTubeUrl(body.url);
        if (!binaries?.ytdlp?.available) throw new AppError('YTDLP_MISSING');
        let result;
        try {
          result = await ytdlp.analyzeVideo({ ytdlpPath: binaries.ytdlp.path, url: parsed.url });
        } catch (error) {
          throw error instanceof AppError ? error : new AppError('ANALYZE_FAILED');
        }
        writeJson(res, 200, { ok: true, video: result.video, options: result.options }, headers);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/download') {
        const body = await readJson(req);
        const job = await jobs.create(body);
        writeJson(res, 202, { ok: true, job }, headers);
        return;
      }

      const id = downloadId(pathname);
      if (req.method === 'GET' && id) {
        const job = jobs.get(id);
        if (!job) throw new AppError('NOT_FOUND');
        writeJson(res, 200, { ok: true, job }, headers);
        return;
      }

      const cancelTarget = cancelId(pathname);
      if (req.method === 'POST' && cancelTarget) {
        const job = await jobs.cancel(cancelTarget);
        writeJson(res, 202, { ok: true, job }, headers);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/settings') {
        writeJson(res, 200, { ok: true, settings: settings.get() }, headers);
        return;
      }

      if (req.method === 'PUT' && pathname === '/api/settings') {
        const body = await readJson(req);
        const updated = await settings.update(body);
        writeJson(res, 200, { ok: true, settings: updated }, headers);
        return;
      }

      throw new AppError(knownPath(pathname) ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND');
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (!(error instanceof AppError)) logger?.error(error instanceof Error ? error : new Error(String(error)));
      const appError = error instanceof AppError ? error : new AppError('INTERNAL');
      const extra = appError.code === 'BODY_TOO_LARGE' ? { ...headers, Connection: 'close' } : headers;
      writeJson(res, appError.status, errorPayload(error), extra);
    }
  };

  const server = http.createServer((req, res) => {
    handler(req, res).catch((error) => {
      if (!res.headersSent) writeJson(res, 500, errorPayload(error), {});
      else res.destroy();
    });
  });

  server.on('clientError', (error, socket) => {
    if (!socket.writable) return;
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  return server;
};
