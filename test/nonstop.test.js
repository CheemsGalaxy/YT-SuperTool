import test from 'node:test';
import assert from 'node:assert/strict';
import { createNonstop } from '../src/core/features/nonstop.js';
import { createDocument, createElement, installDom, uninstallDom } from './mini-dom.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mountPrompt = (document, text, { withButton = true } = {}) => {
  const container = createElement('ytd-popup-container');
  const dialog = createElement('tp-yt-paper-dialog');
  dialog.setAttribute('role', 'dialog');
  const prompt = createElement('yt-confirm-dialog-renderer');
  prompt.setAttribute('class', 'yt-confirm-dialog-renderer');
  const line = createElement('yt-formatted-string');
  line.textContent = text;
  const buttons = createElement('div');
  buttons.setAttribute('class', 'buttons');
  const renderer = createElement('yt-button-renderer');
  renderer.setAttribute('id', 'confirm-button');
  const shape = createElement('yt-button-shape');
  const button = createElement('button');
  button.setAttribute('aria-label', 'Có');
  button.textContent = 'Có';
  if (withButton) shape.appendChild(button);
  renderer.appendChild(shape);
  buttons.appendChild(renderer);
  prompt.append(line, buttons);
  dialog.appendChild(prompt);
  container.appendChild(dialog);
  document.body.appendChild(container);
  return { container, dialog, prompt, line, renderer, shape, button };
};

const mountSnackbar = (document, text) => {
  const container = createElement('snackbar-container');
  container.setAttribute('class', 'ytSnackbarContainerHost');
  const notice = createElement('div');
  notice.setAttribute('class', 'ytSnackbarContainerSnackbarContainer');
  const line = createElement('span');
  line.setAttribute('role', 'text');
  line.textContent = text;
  notice.appendChild(line);
  container.appendChild(notice);
  document.body.appendChild(container);
  return { container, notice, line };
};

const mountPlayer = (document) => {  const player = createElement('div');
  player.setAttribute('id', 'movie_player');
  player.playVideoCalls = 0;
  player.playVideo = () => {
    player.playVideoCalls += 1;
  };
  const video = createElement('video');
  video.paused = true;
  video.playCalls = 0;
  video.play = () => {
    video.paused = false;
    video.playCalls += 1;
  };
  player.appendChild(video);
  document.body.appendChild(player);
  return { player, video };
};

test('dismisses Vietnamese pause prompt present at init', () => {
  const document = createDocument();
  installDom(document);
  try {
    const { button } = mountPrompt(document, 'Video đã tạm dừng. Tiếp tục xem?');
    const { player, video } = mountPlayer(document);
    const nonstop = createNonstop();
    nonstop.init();
    assert.equal(button.clicks, 1);
    assert.equal(player.playVideoCalls, 1);
    assert.equal(video.playCalls, 1);
    nonstop.stop();
  } finally {
    uninstallDom();
  }
});

test('dismisses English pause prompt added after init', () => {
  const document = createDocument();
  installDom(document);
  try {
    const nonstop = createNonstop();
    nonstop.init();
    const { button } = mountPrompt(document, 'Video paused. Continue watching?');
    nonstop.update([{ target: document.body, addedNodes: [document.body.childNodes[0]] }]);
    assert.equal(button.clicks, 1);
    nonstop.stop();
  } finally {
    uninstallDom();
  }
});

test('dismisses prompt when pause text arrives after the dialog shell', () => {
  const document = createDocument();
  installDom(document);
  try {
    const { prompt, line, button } = mountPrompt(document, '');
    const nonstop = createNonstop();
    nonstop.init();
    assert.equal(button.clicks, 0);

    line.textContent = 'Video đã tạm dừng. Tiếp tục xem?';
    nonstop.update([{ target: line, addedNodes: [...line.childNodes] }]);
    assert.equal(button.clicks, 1);

    prompt.setAttribute('data-touched', '1');
    nonstop.update([{ target: prompt, addedNodes: [] }]);
    assert.equal(button.clicks, 1);
    nonstop.stop();
  } finally {
    uninstallDom();
  }
});

test('retries until the confirm button renders', async () => {
  const document = createDocument();
  installDom(document);
  try {
    const { shape, button } = mountPrompt(document, 'Video đã tạm dừng. Tiếp tục xem?', { withButton: false });
    const nonstop = createNonstop();
    nonstop.init();
    assert.equal(button.clicks, 0);

    await wait(50);
    shape.appendChild(button);
    await wait(400);
    assert.equal(button.clicks, 1);
    nonstop.stop();
  } finally {
    uninstallDom();
  }
});

test('ignores unrelated dialogs', () => {
  const document = createDocument();
  installDom(document);
  try {
    const { button } = mountPrompt(document, 'Xoá video này?');
    const { video } = mountPlayer(document);
    const nonstop = createNonstop();
    nonstop.init();
    nonstop.update([{ target: document.body, addedNodes: [...document.body.childNodes] }]);
    assert.equal(button.clicks, 0);
    assert.equal(video.playCalls, 0);
    nonstop.stop();
  } finally {
    uninstallDom();
  }
});

test('waits for a hidden prompt to become visible', () => {
  const document = createDocument();
  installDom(document);
  try {
    const { prompt, button } = mountPrompt(document, 'Video đã tạm dừng. Tiếp tục xem?');
    prompt.setAttribute('hidden', '');
    const nonstop = createNonstop();
    nonstop.init();
    assert.equal(button.clicks, 0);

    prompt.attributes.delete('hidden');
    nonstop.update([{ target: prompt, addedNodes: [] }]);
    assert.equal(button.clicks, 1);
    nonstop.stop();
  } finally {
    uninstallDom();
  }
});

test('removes the Vietnamese interruption snackbar', () => {
  const document = createDocument();
  installDom(document);
  try {
    const { notice } = mountSnackbar(document, 'Bạn đang gặp sự cố gây gián đoạn?');
    const nonstop = createNonstop();
    nonstop.init();
    assert.equal(notice.parentNode, null);
    nonstop.stop();
  } finally {
    uninstallDom();
  }
});

test('removes an English interruption snackbar added after init', () => {
  const document = createDocument();
  installDom(document);
  try {
    const nonstop = createNonstop();
    nonstop.init();
    const { container, notice } = mountSnackbar(document, 'Experiencing interruptions?');
    nonstop.update([{ target: document.body, addedNodes: [container] }]);
    assert.equal(notice.parentNode, null);
    nonstop.stop();
  } finally {
    uninstallDom();
  }
});

test('keeps unrelated snackbars', () => {
  const document = createDocument();
  installDom(document);
  try {
    const { notice } = mountSnackbar(document, 'Đã sao chép liên kết');
    const nonstop = createNonstop();
    nonstop.init();
    assert.notEqual(notice.parentNode, null);
    nonstop.stop();
  } finally {
    uninstallDom();
  }
});
