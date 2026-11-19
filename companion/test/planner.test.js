import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanner, resumePlanner } from '../src/downloader/planner.js';

test('splits the file into contiguous segments', () => {
  const planner = createPlanner({ size: 10_000_000, connections: 4, chunkBytes: 1_000_000 });
  assert.equal(planner.segments.length, 10);
  assert.equal(planner.segments[0].start, 0);
  assert.equal(planner.segments.at(-1).end, 10_000_000);
  for (let index = 1; index < planner.segments.length; index += 1) {
    assert.equal(planner.segments[index].start, planner.segments[index - 1].end);
  }
});

test('caps the segment count for many connections', () => {
  const planner = createPlanner({ size: 500 * 1024 * 1024, connections: 32, chunkBytes: 1024 * 1024 });
  assert.equal(planner.segments.length, 256);
  assert.equal(planner.segments.at(-1).end, 500 * 1024 * 1024);
});

test('claims and commits bytes without overlap', () => {
  const planner = createPlanner({ size: 100, connections: 2, chunkBytes: 40 });
  const first = planner.claim(0);
  const second = planner.claim(1);
  assert.notEqual(first.start, second.start);
  planner.commit(0, first.end - first.start);
  planner.release(0);
  const third = planner.claim(0);
  assert.notEqual(third, null);
  assert.equal(planner.downloaded(), first.end - first.start);
});

test('releases a failed segment for another worker', () => {
  const planner = createPlanner({ size: 100, connections: 1, chunkBytes: 100 });
  const segment = planner.claim(0);
  planner.commit(0, 25);
  planner.release(0);

  const retry = planner.claim(1);
  assert.equal(retry.cursor, 25);
  assert.equal(retry.end, segment.end);
});

test('reaches completion only when every byte is written', () => {
  const planner = createPlanner({ size: 10, connections: 1, chunkBytes: 10 });
  const segment = planner.claim(0);
  planner.commit(0, 9);
  assert.equal(planner.isComplete(), false);
  planner.commit(0, 1);
  planner.release(0);
  assert.equal(planner.isComplete(), true);
  assert.equal(planner.claim(1), null);
});

test('handles an empty file', () => {
  const planner = createPlanner({ size: 0, connections: 4 });
  assert.equal(planner.segments.length, 0);
  assert.equal(planner.isComplete(), true);
  assert.equal(planner.claim(0), null);
});

test('restores saved progress and keeps cursor positions', () => {
  const saved = [
    { start: 0, cursor: 40, end: 50 },
    { start: 50, cursor: 50, end: 100 }
  ];
  const planner = resumePlanner({ size: 100, saved, connections: 2 });
  assert.equal(planner.downloaded(), 40);
  assert.equal(planner.segments[1].end, 100);
  const claim = planner.claim(0);
  assert.equal(claim.cursor, 40);
  assert.equal(claim.end, 50);
});

test('rejects saved progress with gaps or the wrong size', () => {
  assert.throws(() => resumePlanner({
    size: 100,
    saved: [{ start: 0, cursor: 10, end: 40 }, { start: 50, cursor: 50, end: 100 }]
  }));
  assert.throws(() => resumePlanner({
    size: 120,
    saved: [{ start: 0, cursor: 0, end: 100 }]
  }));
});

test('rejects a worker that owns two segments', () => {
  const planner = createPlanner({ size: 10, connections: 1, chunkBytes: 5 });
  planner.claim(0);
  assert.throws(() => planner.claim(0));
});
