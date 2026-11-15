export const CODES = {
  BAD_REQUEST: { status: 400, message: 'The request is not valid.' },
  INVALID_URL: { status: 400, message: 'Only YouTube video links are supported.' },
  BAD_TOKEN: { status: 401, message: 'Pairing token is missing or invalid.' },
  PAIRING_CODE_INVALID: { status: 401, message: 'Pairing code does not match.' },
  ORIGIN_REJECTED: { status: 403, message: 'Request origin is not allowed.' },
  HOST_REJECTED: { status: 403, message: 'Request host is not allowed.' },
  NOT_FOUND: { status: 404, message: 'Resource not found.' },
  METHOD_NOT_ALLOWED: { status: 405, message: 'Method not allowed.' },
  JOB_EXISTS: { status: 409, message: 'This video is already downloading.' },
  JOB_FINISHED: { status: 409, message: 'This job already finished.' },
  PAIRING_CODE_EXPIRED: { status: 410, message: 'Pairing code expired or was already used.' },
  BODY_TOO_LARGE: { status: 413, message: 'Request body is too large.' },
  ANALYZE_FAILED: { status: 422, message: 'yt-dlp could not read this video.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Try again later.' },
  INTERNAL: { status: 500, message: 'Unexpected companion error.' },
  DOWNLOAD_FAILED: { status: 500, message: 'Download failed.' },
  OUTPUT_MISSING: { status: 500, message: 'Download finished without a media file.' },
  YTDLP_MISSING: { status: 503, message: 'yt-dlp is not available.' },
  FFMPEG_MISSING: { status: 503, message: 'FFmpeg is not available.' },
  OUTPUT_DIR_INVALID: { status: 503, message: 'Output directory is not usable.' },
  PAIRING_UNAVAILABLE: { status: 503, message: 'No active pairing code. Restart the companion or run it with --pair.' },
  QUEUE_FULL: { status: 503, message: 'Download queue is full.' },
  ANALYZE_TIMEOUT: { status: 504, message: 'yt-dlp did not answer in time.' }
};

export class AppError extends Error {
  constructor(code, message) {
    const known = CODES[code] ?? CODES.INTERNAL;
    super(message ?? known.message);
    this.name = 'AppError';
    this.code = CODES[code] ? code : 'INTERNAL';
    this.status = known.status;
  }
}

export const isAppError = (error) => error instanceof AppError;

export const errorPayload = (error) => {
  if (error instanceof AppError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  return { ok: false, error: { code: 'INTERNAL', message: CODES.INTERNAL.message } };
};
