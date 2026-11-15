import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAnalyzeArgs,
  buildDownloadArgs,
  buildOptions,
  parseProgressLine,
  summarizeInfo
} from '../src/ytdlp.js';

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

test('analyze arguments pin safe flags and the url', () => {
  const args = buildAnalyzeArgs(VIDEO);
  for (const flag of ['--ignore-config', '--no-exec', '--no-playlist', '--no-warnings', '--skip-download', '--dump-single-json']) {
    assert.ok(args.includes(flag), `missing ${flag}`);
  }
  assert.equal(args.at(-2), '--');
  assert.equal(args.at(-1), VIDEO);
});

test('video download arguments map presets without raw format strings', () => {
  const args = buildDownloadArgs({
    url: VIDEO,
    mode: 'video',
    quality: '1080',
    container: 'mp4',
    audioFormat: 'mp3',
    audioQuality: 192,
    outputTemplate: 'C:\\out\\%(title)s.%(ext)s',
    ffmpegDir: 'C:\\bin'
  });

  assert.equal(args.at(-1), VIDEO);
  assert.equal(args.at(-2), '--');
  assert.ok(args.includes('--merge-output-format'));
  assert.equal(args[args.indexOf('--merge-output-format') + 1], 'mp4');
  assert.equal(args[args.indexOf('--ffmpeg-location') + 1], 'C:\\bin');

  const selector = args[args.indexOf('-f') + 1];
  assert.match(selector, /\[height<=1080\]/);
  assert.match(selector, /bestvideo/);
  assert.match(selector, /bestaudio/);
  assert.ok(!args.includes('-x'));
});

test('audio download arguments use the fixed preset', () => {
  const args = buildDownloadArgs({
    url: VIDEO,
    mode: 'audio',
    quality: null,
    container: null,
    audioFormat: 'mp3',
    audioQuality: 192,
    outputTemplate: 'C:\\out\\%(title)s.%(ext)s',
    ffmpegDir: null
  });

  assert.ok(args.includes('-x'));
  assert.equal(args[args.indexOf('--audio-format') + 1], 'mp3');
  assert.equal(args[args.indexOf('--audio-quality') + 1], '192K');
  assert.ok(!args.includes('-f'));
  assert.equal(args.at(-1), VIDEO);
});

test('parses a yt-dlp progress line', () => {
  const progress = parseProgressLine('[download]  50.0% of 10.00MiB at 2.00MiB/s ETA 00:05');
  assert.equal(progress.progress, 0.5);
  assert.equal(progress.totalBytes, 10 * 1024 * 1024);
  assert.equal(progress.receivedBytes, 5 * 1024 * 1024);
  assert.equal(progress.speed, '2.00MiB/s');
  assert.equal(progress.eta, '00:05');
});

test('parses a completed progress line without speed', () => {
  const progress = parseProgressLine('[download] 100% of 3.50MiB in 00:01');
  assert.equal(progress.progress, 1);
  assert.equal(progress.totalBytes, Math.round(3.5 * 1024 * 1024));
  assert.equal(progress.speed, null);
  assert.equal(progress.eta, null);
});

test('ignores unrelated output lines', () => {
  assert.equal(parseProgressLine('[youtube] Extracting URL'), null);
  assert.equal(parseProgressLine(''), null);
  assert.equal(parseProgressLine(null), null);
});

test('summarizes analyze metadata and builds presets', () => {
  const info = {
    id: 'dQw4w9WgXcQ',
    title: 'Sample title',
    duration: 213,
    thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    uploader: 'Channel',
    formats: [
      { height: 1080 },
      { height: 720 },
      { height: 720 },
      { height: 1080 },
      { height: null }
    ]
  };

  const summary = summarizeInfo(info);
  assert.deepEqual(summary.heights, [1080, 720]);
  assert.equal(summary.id, 'dQw4w9WgXcQ');
  assert.equal(summary.duration, 213);

  const options = buildOptions(summary);
  assert.deepEqual(options.video.map((item) => item.quality), ['best', '1080', '720', '480', '360']);
  assert.deepEqual(options.audio.map((item) => item.format), ['mp3', 'm4a']);
});

test('offers only the best preset when heights are unknown', () => {
  const options = buildOptions({ heights: [] });
  assert.deepEqual(options.video.map((item) => item.quality), ['best']);
});
