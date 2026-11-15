import assert from 'node:assert/strict';
import test from 'node:test';
import { parseYouTubeUrl } from '../src/url-policy.js';

const invalid = (url) => {
  assert.throws(() => parseYouTubeUrl(url), (error) => error.code === 'INVALID_URL', `expected ${url} to be rejected`);
};

test('accepts watch links and drops extra parameters', () => {
  const result = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=30');
  assert.equal(result.videoId, 'dQw4w9WgXcQ');
  assert.equal(result.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});

test('accepts short and alternate hosts', () => {
  assert.equal(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=12').videoId, 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeUrl('https://m.youtube.com/shorts/dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeUrl('https://www.youtube.com/live/dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
});

test('accepts music youtube watch links', () => {
  assert.equal(parseYouTubeUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
});

test('rejects other hosts and protocols', () => {
  invalid('https://example.com/watch?v=dQw4w9WgXcQ');
  invalid('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ');
  invalid('javascript:alert(1)');
  invalid('file:///C:/video.mp4');
  invalid('ftp://youtube.com/watch?v=dQw4w9WgXcQ');
});

test('rejects non-video paths', () => {
  invalid('https://www.youtube.com/playlist?list=PL123');
  invalid('https://www.youtube.com/results?search_query=test');
  invalid('https://www.youtube.com/@channel');
  invalid('https://www.youtube.com/watch');
  invalid('https://www.youtube.com/watch?v=short');
  invalid('https://youtu.be/dQw4w9WgXcQ/extra');
});

test('rejects credentials and unusual ports', () => {
  invalid('https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ');
  invalid('https://www.youtube.com:8080/watch?v=dQw4w9WgXcQ');
});

test('rejects malformed input', () => {
  invalid('');
  invalid(null);
  invalid(undefined);
  invalid(42);
  invalid('not a url');
});
