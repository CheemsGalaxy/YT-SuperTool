import test from 'node:test';
import assert from 'node:assert/strict';
import { createSponsorBlock } from '../src/core/features/sponsorblock.js';
import { createDocument, createElement, installDom, uninstallDom } from './mini-dom.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mountPlayer = (document) => {
  const player = createElement('div');
  player.setAttribute('id', 'movie_player');
  player.setAttribute('class', 'html5-video-player');
  const video = createElement('video');
  video.readyState = 4;
  video.duration = 300;
  player.appendChild(video);
  document.body.appendChild(player);
  return { player, video };
};

const createBridge = (requests) => ({
  storage: {
    get: async (key, fallback) => fallback,
    onChanged: () => {}
  },
  network: {
    request: async (url) => {
      requests.push(new URL(url).searchParams.get('videoID'));
      return {
        ok: true,
        status: 200,
        json: async () => [{
          UUID: 'segment-1',
          category: 'sponsor',
          segment: [10, 20],
          videoDuration: 300
        }]
      };
    }
  }
});

const setLocation = (videoId) => {
  globalThis.location = { href: `https://www.youtube.com/watch?v=${videoId}` };
};

test('loads segments for the new video after SPA navigation', async () => {
  const document = createDocument();
  installDom(document);
  setLocation('videoA');
  try {
    const { video } = mountPlayer(document);
    const requests = [];
    const feature = createSponsorBlock({ bridge: createBridge(requests) });
    feature.init();
    await wait(20);
    assert.deepEqual(requests, ['videoA']);

    setLocation('videoB');
    document.dispatchEvent({ type: 'yt-navigate-finish' });
    await wait(80);
    assert.deepEqual(requests, ['videoA', 'videoB']);

    video.currentTime = 12;
    video.dispatchEvent({ type: 'timeupdate' });
    assert.equal(video.currentTime, 20);
    feature.stop();
  } finally {
    uninstallDom();
    delete globalThis.location;
  }
});

test('reacts to yt-page-data-updated navigation', async () => {
  const document = createDocument();
  installDom(document);
  setLocation('pageA');
  try {
    mountPlayer(document);
    const requests = [];
    const feature = createSponsorBlock({ bridge: createBridge(requests) });
    feature.init();
    await wait(20);

    setLocation('pageB');
    document.dispatchEvent({ type: 'yt-page-data-updated' });
    await wait(80);
    assert.deepEqual(requests, ['pageA', 'pageB']);
    feature.stop();
  } finally {
    uninstallDom();
    delete globalThis.location;
  }
});

test('skips on the video timeupdate event while the page is hidden', async () => {
  const document = createDocument();
  document.hidden = true;
  installDom(document);
  setLocation('hiddenVideo');
  try {
    const { video } = mountPlayer(document);
    const requests = [];
    const feature = createSponsorBlock({ bridge: createBridge(requests) });
    feature.init();
    await wait(20);

    video.currentTime = 11;
    video.dispatchEvent({ type: 'timeupdate' });
    assert.equal(video.currentTime, 20);
    feature.stop();
  } finally {
    uninstallDom();
    delete globalThis.location;
  }
});

test('stops skipping after stop', async () => {
  const document = createDocument();
  installDom(document);
  setLocation('stoppedVideo');
  try {
    const { video } = mountPlayer(document);
    const feature = createSponsorBlock({ bridge: createBridge([]) });
    feature.init();
    await wait(20);

    feature.stop();
    video.currentTime = 12;
    video.dispatchEvent({ type: 'timeupdate' });
    assert.equal(video.currentTime, 12);
  } finally {
    uninstallDom();
    delete globalThis.location;
  }
});
