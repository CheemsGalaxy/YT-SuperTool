const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;
const CHUNKS_PER_CONNECTION = 8;

const invalid = (message) => {
  throw new Error(message);
};

const validateSize = (size) => {
  if (!Number.isSafeInteger(size) || size < 0) invalid('Download size must be a non-negative safe integer.');
};

export const createPlanner = ({ size, connections = 8, chunkBytes = DEFAULT_CHUNK_BYTES } = {}) => {
  validateSize(size);
  if (!Number.isInteger(connections) || connections < 1) invalid('Connections must be a positive integer.');

  const target = Math.max(1, Math.floor(Number(chunkBytes) || DEFAULT_CHUNK_BYTES));
  const maximum = Math.max(1, Math.floor(connections) * CHUNKS_PER_CONNECTION);
  const count = size === 0 ? 0 : Math.max(1, Math.min(maximum, Math.ceil(size / target)));
  const segments = [];
  let start = 0;

  for (let index = 0; index < count; index += 1) {
    const length = Math.floor(size / count) + (index < size % count ? 1 : 0);
    segments.push({ start, cursor: start, end: start + length, worker: null });
    start += length;
  }

  const planner = {
    size,
    segments,
    claim(worker) {
      if (worker === null || worker === undefined) invalid('A worker id is required.');
      if (segments.some((segment) => segment.worker === worker)) invalid('This worker already owns a segment.');
      const segment = segments.find((item) => item.worker === null && item.cursor < item.end);
      if (!segment) return null;
      segment.worker = worker;
      return { start: segment.start, cursor: segment.cursor, end: segment.end };
    },
    commit(worker, bytes) {
      const segment = segments.find((item) => item.worker === worker);
      if (!segment) invalid('This worker owns no segment.');
      if (!Number.isSafeInteger(bytes) || bytes < 0) invalid('Committed bytes must be a non-negative safe integer.');
      if (segment.cursor + bytes > segment.end) invalid('The worker wrote past its segment.');
      segment.cursor += bytes;
    },
    release(worker) {
      const segment = segments.find((item) => item.worker === worker);
      if (segment) segment.worker = null;
    },
    downloaded() {
      let total = 0;
      for (const segment of segments) total += segment.cursor - segment.start;
      return total;
    },
    isComplete() {
      return segments.every((segment) => segment.cursor === segment.end);
    },
    save() {
      return segments.map(({ start, cursor, end }) => ({ start, cursor, end }));
    }
  };

  return planner;
};

export const resumePlanner = ({ size, saved, connections = 8, chunkBytes = DEFAULT_CHUNK_BYTES } = {}) => {
  validateSize(size);
  if (!Array.isArray(saved) || saved.length === 0) invalid('Saved segments are required.');

  let expected = 0;
  for (const segment of saved) {
    if (!segment || !Number.isSafeInteger(segment.start) || !Number.isSafeInteger(segment.cursor) || !Number.isSafeInteger(segment.end)) {
      invalid('Saved segments are malformed.');
    }
    if (segment.start !== expected || segment.cursor < segment.start || segment.cursor > segment.end || segment.end <= segment.start) {
      invalid('Saved segments do not tile the download.');
    }
    expected = segment.end;
  }
  if (expected !== size) invalid('Saved segments do not cover the download size.');

  const planner = createPlanner({ size, connections, chunkBytes });
  planner.segments.splice(0, planner.segments.length, ...saved.map((segment) => ({
    start: segment.start,
    cursor: segment.cursor,
    end: segment.end,
    worker: null
  })));
  return planner;
};
