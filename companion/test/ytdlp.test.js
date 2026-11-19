import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  analyzeVideo,
  buildAnalyzeArgs,
  buildDownloadArgs,
  buildMergeArgs,
  buildOptions,
  buildResolveArgs,
  describeYtdlpError,
  parseFfmpegProgress,
  parseProgressLine,
  planFromInfo,
  safeFileName,
  summarizeInfo
} from '../src/ytdlp.js';

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const fakeSpawn = ({ code = 1, stdout = '', stderr = '' } = {}) => () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
  let pending = 2;
  const done = () => {
    pending -= 1;
    if (pending === 0) child.emit('close', code, null);
  };
  child.stdout.on('end', done);
  child.stderr.on('end', done);
  child.stdout.end(stdout);
  child.stderr.end(stderr);
  return child;
};

test('analyze arguments pin safe flags and the url', () => {
  const args = buildAnalyzeArgs(VIDEO);
  for (const flag of ['--ignore-config', '--no-exec', '--no-playlist', '--no-warnings', '--skip-download', '--dump-single-json']) {
    assert.ok(args.includes(flag), `missing ${flag}`);
  }
  assert.equal(args[args.indexOf('--js-runtimes') + 1], `node:${process.execPath}`);
  assert.equal(args.at(-2), '--');
  assert.equal(args.at(-1), VIDEO);
});

test('cookie source and node runtime are passed to yt-dlp', () => {
  const analyze = buildAnalyzeArgs(VIDEO, { cookiesFromBrowser: 'edge', jsRuntimePath: 'C:\\node\\node.exe' });
  assert.equal(analyze[analyze.indexOf('--cookies-from-browser') + 1], 'edge');
  assert.equal(analyze[analyze.indexOf('--js-runtimes') + 1], 'node:C:\\node\\node.exe');

  const download = buildDownloadArgs({
    url: VIDEO,
    mode: 'video',
    quality: '720',
    container: 'mp4',
    outputTemplate: 'C:\\out\\%(title)s.%(ext)s',
    cookiesFromBrowser: 'firefox'
  });
  assert.equal(download[download.indexOf('--cookies-from-browser') + 1], 'firefox');
  assert.equal(download[download.indexOf('--js-runtimes') + 1], `node:${process.execPath}`);
});

test('cookie file replaces the browser source', () => {
  const file = 'C:\\Users\\Cheems\\cookies.txt';
  const analyze = buildAnalyzeArgs(VIDEO, { cookiesFromBrowser: 'edge', cookiesFile: file });
  assert.equal(analyze[analyze.indexOf('--cookies') + 1], file);
  assert.ok(!analyze.includes('--cookies-from-browser'));

  const download = buildDownloadArgs({
    url: VIDEO,
    mode: 'video',
    quality: '720',
    container: 'mp4',
    outputTemplate: 'C:\\out\\%(title)s.%(ext)s',
    cookiesFile: file
  });
  assert.equal(download[download.indexOf('--cookies') + 1], file);
  assert.ok(!download.includes('--cookies-from-browser'));
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

test('classifies yt-dlp failures without echoing raw output', () => {
  const disk = describeYtdlpError("ERROR: [Errno 28] No space left on device: '/home/user/file.part'");
  assert.equal(disk.code, 'OUTPUT_DIR_INVALID');
  assert.equal(disk.message, 'The output folder is out of free space.');

  const permission = describeYtdlpError('ERROR: unable to open for writing: [Errno 13] Permission denied');
  assert.equal(permission.code, 'OUTPUT_DIR_INVALID');
  assert.equal(permission.message, 'The output folder is not writable.');

  const forbidden = describeYtdlpError('ERROR: unable to download video data: HTTP Error 403: Forbidden');
  assert.equal(forbidden.code, 'DOWNLOAD_FAILED');
  assert.equal(forbidden.message, 'YouTube refused this download (HTTP 403).');

  const unknown = describeYtdlpError('ERROR: something new happened');
  assert.equal(unknown.code, 'DOWNLOAD_FAILED');
  assert.equal(unknown.message, 'Download failed.');

  const bot = describeYtdlpError("ERROR: Sign in to confirm you're not a bot");
  assert.equal(bot.message, 'YouTube asked for a bot check. Retry, or turn on browser cookies in the companion settings.');

  const age = describeYtdlpError('ERROR: Sign in to confirm your age');
  assert.equal(age.message, 'This video is age restricted. Turn on browser cookies in the companion settings to download it.');

  const locked = describeYtdlpError('ERROR: Could not copy Chrome cookie database.', { browser: 'edge' });
  assert.equal(locked.code, 'DOWNLOAD_FAILED');
  assert.match(locked.message, /could not read cookies from Microsoft Edge/);
  assert.match(locked.message, /Quit Microsoft Edge completely/);

  const decrypt = describeYtdlpError('ERROR: Failed to decrypt with DPAPI', { browser: 'chrome' });
  assert.match(decrypt.message, /could not decrypt cookies from Google Chrome/);

  const unreadable = describeYtdlpError('ERROR: could not read cookies', {});
  assert.match(unreadable.message, /the selected browser/);

  const badFile = describeYtdlpError("ERROR: '/home/user/cookies.txt' does not look like a Netscape format cookies file");
  assert.equal(badFile.code, 'DOWNLOAD_FAILED');
  assert.match(badFile.message, /Export YouTube cookies to a fresh Netscape cookies.txt file/);
});

test('analyze names the browser when cookies are locked', async () => {
  const promise = analyzeVideo({
    ytdlpPath: 'yt-dlp',
    url: VIDEO,
    cookiesFromBrowser: 'edge',
    spawnImpl: fakeSpawn({ stderr: 'ERROR: Could not copy Chrome cookie database.' })
  });
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, 'ANALYZE_FAILED');
    assert.match(error.message, /Microsoft Edge/);
    return true;
  });
});

test('analyze reports a safe message when yt-dlp fails', async () => {
  const stderr = 'ERROR: unable to download video data: HTTP Error 403: Forbidden https://rr3.googlevideo.com/videoplayback?sig=SECRET';
  const promise = analyzeVideo({ ytdlpPath: 'yt-dlp', url: VIDEO, spawnImpl: fakeSpawn({ stderr }) });
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, 'ANALYZE_FAILED');
    assert.equal(error.message, 'YouTube refused this download (HTTP 403).');
    assert.doesNotMatch(error.message, /googlevideo|SECRET/);
    return true;
  });
});

test('analyze keeps its default message for unknown failures', async () => {
  const promise = analyzeVideo({ ytdlpPath: 'yt-dlp', url: VIDEO, spawnImpl: fakeSpawn({ stderr: 'ERROR: something new happened' }) });
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, 'ANALYZE_FAILED');
    assert.equal(error.message, 'yt-dlp could not read this video.');
    return true;
  });
});

test('analyze passes the cookie source to yt-dlp', async () => {
  let spawnedArgs = null;
  const spawnImpl = (command, args) => {
    spawnedArgs = args;
    return fakeSpawn({
      code: 0,
      stdout: JSON.stringify({ id: 'dQw4w9WgXcQ', title: 'Sample', duration: 1, formats: [{ height: 360 }] })
    })();
  };
  const result = await analyzeVideo({ ytdlpPath: 'yt-dlp', url: VIDEO, cookiesFromBrowser: 'edge', spawnImpl });
  assert.equal(result.video.id, 'dQw4w9WgXcQ');
  assert.equal(spawnedArgs[spawnedArgs.indexOf('--cookies-from-browser') + 1], 'edge');
});

test('analyze passes the cookie file to yt-dlp', async () => {
  let spawnedArgs = null;
  const spawnImpl = (command, args) => {
    spawnedArgs = args;
    return fakeSpawn({
      code: 0,
      stdout: JSON.stringify({ id: 'dQw4w9WgXcQ', title: 'Sample', duration: 1, formats: [{ height: 360 }] })
    })();
  };
  const file = 'C:\\Users\\Cheems\\cookies.txt';
  const result = await analyzeVideo({ ytdlpPath: 'yt-dlp', url: VIDEO, cookiesFile: file, spawnImpl });
  assert.equal(result.video.id, 'dQw4w9WgXcQ');
  assert.equal(spawnedArgs[spawnedArgs.indexOf('--cookies') + 1], file);
  assert.ok(!spawnedArgs.includes('--cookies-from-browser'));
});

test('resolve arguments use the same safe flags and skip the download', () => {
  const args = buildResolveArgs(VIDEO, { mode: 'video', quality: '720', container: 'mp4' });
  for (const flag of ['--ignore-config', '--no-exec', '--no-playlist', '--dump-single-json', '--skip-download']) {
    assert.ok(args.includes(flag), `missing ${flag}`);
  }
  assert.equal(args[args.indexOf('--js-runtimes') + 1], `node:${process.execPath}`);
  assert.equal(args.at(-2), '--');
  assert.equal(args.at(-1), VIDEO);
  assert.match(args[args.indexOf('-f') + 1], /\[height<=720\]/);
});

test('resolve arguments request best audio for audio mode', () => {
  const args = buildResolveArgs(VIDEO, { mode: 'audio', quality: null, container: null });
  assert.equal(args[args.indexOf('-f') + 1], 'ba/b');
});

test('plan maps requested downloads to byte ranges', () => {
  const info = {
    id: 'dQw4w9WgXcQ',
    title: 'Sample',
    duration: 213,
    requested_downloads: [
      { url: 'https://media.test/v', format_id: '137', ext: 'mp4', vcodec: 'avc1', acodec: 'none', filesize: 1000 },
      { url: 'https://media.test/a', format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a', filesize_approx: 2000 }
    ]
  };

  const plan = planFromInfo(info, { mode: 'video', container: 'mp4' });
  assert.equal(plan.id, 'dQw4w9WgXcQ');
  assert.equal(plan.extension, 'mp4');
  assert.equal(plan.streams.length, 2);
  assert.equal(plan.streams[0].size, 1000);
  assert.equal(plan.streams[1].size, 2000);
  assert.equal(plan.totalBytes, 3000);
  assert.equal(plan.streams[1].ext, 'm4a');
});

test('plan flattens merged requested formats into separate streams', () => {
  const plan = planFromInfo({
    id: 'x',
    title: 'Merged',
    duration: 10,
    requested_downloads: [{
      format_id: '137+140',
      ext: 'mp4',
      requested_formats: [
        { url: 'https://media.test/v', format_id: '137', ext: 'mp4', vcodec: 'avc1', acodec: 'none', filesize: 300 },
        { url: 'https://media.test/a', format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a', filesize: 200 }
      ]
    }]
  }, { mode: 'video', container: 'mp4' });

  assert.equal(plan.streams.length, 2);
  assert.deepEqual(plan.streams.map((stream) => stream.ext), ['mp4', 'm4a']);
  assert.equal(plan.totalBytes, 500);
});

test('plan keeps safe media headers and drops cookies', () => {
  const plan = planFromInfo({
    id: 'x',
    title: 't',
    duration: 1,
    requested_downloads: [{
      url: 'https://media.test/v',
      ext: 'mp4',
      filesize: 10,
      http_headers: {
        'User-Agent': 'UA/1',
        Accept: '*/*',
        Cookie: 'secret=1',
        Range: 'bytes=0-1',
        'X-Custom': 'no'
      }
    }]
  }, { mode: 'video', container: 'mp4' });

  assert.deepEqual(plan.streams[0].headers, { 'User-Agent': 'UA/1', Accept: '*/*' });
});

test('plan marks audio output as mp3', () => {
  const plan = planFromInfo({
    id: 'x',
    title: 't',
    duration: 1,
    requested_downloads: [{ url: 'https://media.test/a', ext: 'webm', filesize: 10 }]
  }, { mode: 'audio', container: null });
  assert.equal(plan.extension, 'mp3');
});

test('plan requests a fallback when no direct url exists', () => {
  assert.throws(
    () => planFromInfo({ id: 'x', title: 't', requested_downloads: [{ format_id: '18' }] }, { mode: 'video', container: 'mp4' }),
    (error) => error.code === 'DOWNLOAD_FAILED' && error.fallback === true
  );
});

test('safe file names drop reserved characters and trailing dots', () => {
  assert.equal(safeFileName('A/B:C*D?E"F<G>H|I'), 'A B C D E F G H I');
  assert.equal(safeFileName('  trailing dots...  '), 'trailing dots');
  assert.equal(safeFileName(''), 'video');
  assert.equal(safeFileName(null, 'fallback'), 'fallback');
  assert.equal(safeFileName('x'.repeat(300)).length, 120);
});

test('merge arguments copy video and audio into the container', () => {
  const args = buildMergeArgs({
    inputs: ['C:\\tmp\\v.mp4', 'C:\\tmp\\a.m4a'],
    output: 'C:\\out\\final.mp4',
    mode: 'video',
    container: 'mp4'
  });

  assert.equal(args[args.indexOf('-map') + 1], '0:v:0');
  assert.equal(args.filter((item) => item === '-map').length, 2);
  assert.equal(args[args.indexOf('-c') + 1], 'copy');
  assert.equal(args[args.indexOf('-movflags') + 1], '+faststart');
  assert.equal(args.at(-1), 'C:\\out\\final.mp4');
});

test('audio merge arguments re-encode with the requested bitrate', () => {
  const args = buildMergeArgs({
    inputs: ['C:\\tmp\\a.webm'],
    output: 'C:\\out\\final.mp3',
    mode: 'audio',
    container: null,
    audioFormat: 'mp3',
    audioQuality: 256
  });

  assert.equal(args[args.indexOf('-c:a') + 1], 'libmp3lame');
  assert.equal(args[args.indexOf('-b:a') + 1], '256k');
  assert.ok(args.includes('-vn'));
});

test('parses ffmpeg progress against the duration', () => {
  assert.equal(parseFfmpegProgress('out_time_ms=5000000', 10), 0.5);
  assert.equal(parseFfmpegProgress('out_time_ms=10000000', 10), 1);
  assert.equal(parseFfmpegProgress('out_time_ms=20000000', 10), 1);
  assert.equal(parseFfmpegProgress('out_time_ms=1000000', 0), null);
  assert.equal(parseFfmpegProgress('frame=10', 10), null);
  assert.equal(parseFfmpegProgress(null, 10), null);
});
