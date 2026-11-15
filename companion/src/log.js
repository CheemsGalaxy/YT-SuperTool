const TOKEN_PATTERN = /[A-Za-z0-9_-]{43}/g;
const CODE_PATTERN = /\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/g;
const QUERY_PATTERN = /(\?[^\s]*)/g;

export const redact = (value) => String(value ?? '')
  .replace(TOKEN_PATTERN, '[redacted]')
  .replace(CODE_PATTERN, '[redacted]')
  .replace(QUERY_PATTERN, '');

export const createLog = ({ limit = 200, debug = false } = {}) => {
  const entries = [];

  const push = (level, message) => {
    const entry = { at: new Date().toISOString(), level, message: redact(message) };
    entries.push(entry);
    if (entries.length > limit) entries.shift();
    return entry;
  };

  const info = (message) => push('info', message);
  const warn = (message) => push('warn', message);
  const error = (message) => {
    const text = debug && message instanceof Error ? `${message.message}\n${message.stack}` : message instanceof Error ? message.message : message;
    return push('error', text);
  };

  return { info, warn, error, entries: () => entries.slice(), clear: () => { entries.length = 0; } };
};
