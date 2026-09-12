// content/features/speed.js

(function () {
	const MIN_SPEED = 0.25;
	const MAX_SPEED = 10;
	const STEP = 0.05;
	const KEY_STEP = 0.25;
	const DEFAULT_SPEED = 1;
	const PRESETS = [0.75, 1, 1.25, 1.5];
	const SAVE_DEBOUNCE = 200;

	let currentSpeed = DEFAULT_SPEED;
	let isExpanded = false;
	let container = null;
	let titleWrapper = null;
	let video = null;
	let onKeydown = null;
	let onRateChange = null;
	let initRetryTimer = 0;
	let initRetryCount = 0;
	let titleObserver = null;
	let badgeRef = null;
	let sliderRef = null;
	let presetButtons = [];
	let saveTimer = 0;

	const clampSpeed = v => Math.min(MAX_SPEED, Math.max(MIN_SPEED, Number(v) || DEFAULT_SPEED));
	const normalizeSpeed = v => Math.round(clampSpeed(v) / STEP) * STEP;
	const formatSpeed = v => `${v.toFixed(2)}x`;

	function saveSpeed(speed) {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			chrome.storage.local.set({ playbackSpeed: speed });
		}, SAVE_DEBOUNCE);
	}

	function syncPresetStates() {
		for (const button of presetButtons) {
			const presetValue = parseFloat(button.textContent);
			button.classList.toggle('is-active', Math.abs(presetValue - currentSpeed) < 0.001);
		}
	}

	function applySpeed(value, persist = true) {
		const next = Number(normalizeSpeed(value).toFixed(2));

		if (next === currentSpeed) {
			if (persist) saveSpeed(currentSpeed);
			return;
		}

		currentSpeed = next;
		if (video && video.playbackRate !== currentSpeed) video.playbackRate = currentSpeed;

		if (container) {
			if (badgeRef) {
				const span = badgeRef.querySelector('span');
				if (span) span.textContent = formatSpeed(currentSpeed);
			}
			if (sliderRef) {
				sliderRef.value = String(currentSpeed);
				sliderRef.title = formatSpeed(currentSpeed);
			}
			syncPresetStates();
		}

		if (persist) saveSpeed(currentSpeed);
	}

	function addStyles() {
		if (document.querySelector('style[data-yt-supertool="speed-style"]')) return;
		const style = document.createElement('style');
		style.dataset.ytSupertool = 'speed-style';
		style.textContent = `
			[data-yt-supertool="speed"] {
				display: inline-grid;
				grid-template-columns: 68px 0 0;
				align-items: center;
				height: 32px;
				padding: 0;
				margin: 0 0 6px;
				border-radius: 16px;
				background: rgba(28, 28, 28, 0.85);
				backdrop-filter: blur(12px);
				-webkit-backdrop-filter: blur(12px);
				border: 1px solid rgba(255, 255, 255, 0.08);
				color: #fff;
				font: 500 13px/1 "Roboto", "Arial", sans-serif;
				overflow: hidden;
				vertical-align: middle;
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
				transition: grid-template-columns 0.25s cubic-bezier(0.4, 0, 0.2, 1),
					background-color 0.15s ease;
			}
			[data-yt-supertool="speed"].is-expanded {
				grid-template-columns: 68px 1fr auto;
				padding: 0 12px 0 0;
				max-width: min(92vw, 440px);
			}
			[data-yt-supertool="speed"] .yt-supertool-speed-badge {
				grid-column: 1;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				gap: 6px;
				width: 100%;
				height: 32px;
				border: 0;
				background: transparent;
				color: inherit;
				font: inherit;
				cursor: pointer;
				padding: 0;
				transition: background-color 0.15s ease;
			}
			[data-yt-supertool="speed"] .yt-supertool-speed-badge:hover {
				background: rgba(255, 255, 255, 0.1);
			}
			[data-yt-supertool="speed"] .yt-supertool-speed-badge svg {
				width: 16px;
				height: 16px;
				flex-shrink: 0;
				opacity: 0.9;
			}
			[data-yt-supertool="speed"] .yt-supertool-speed-slider-wrap {
				grid-column: 2;
				display: flex;
				align-items: center;
				min-width: 0;
				width: 100%;
				height: 32px;
				padding: 0 12px 0 6px;
				box-sizing: border-box;
			}
			[data-yt-supertool="speed"] .yt-supertool-speed-slider {
				width: 100%;
				min-width: 0;
				height: 32px;
				margin: 0;
				appearance: none;
				-webkit-appearance: none;
				background: transparent;
				cursor: pointer;
				padding: 0;
			}
			[data-yt-supertool="speed"] .yt-supertool-speed-slider::-webkit-slider-runnable-track {
				height: 3px;
				border-radius: 2px;
				background: rgba(255, 255, 255, 0.25);
			}
			[data-yt-supertool="speed"] .yt-supertool-speed-slider::-webkit-slider-thumb {
				appearance: none;
				-webkit-appearance: none;
				width: 12px;
				height: 12px;
				margin-top: -4.5px;
				border: 0;
				border-radius: 50%;
				background: #fff;
				transition: transform 0.1s ease;
			}
			[data-yt-supertool="speed"] .yt-supertool-speed-slider:hover::-webkit-slider-thumb {
				transform: scale(1.2);
			}
			[data-yt-supertool="speed"] .yt-supertool-speed-slider::-moz-range-track {
				height: 3px;
				border-radius: 2px;
				background: rgba(255, 255, 255, 0.25);
			}
			[data-yt-supertool="speed"] .yt-supertool-speed-slider::-moz-range-thumb {
				width: 12px;
				height: 12px;
				border: 0;
				border-radius: 50%;
				background: #fff;
			}
			[data-yt-supertool="speed"] .yt-supertool-speed-presets {
				grid-column: 3;
				display: inline-flex;
				gap: 4px;
				flex-shrink: 0;
				align-items: center;
			}
			[data-yt-supertool="speed"]:not(.is-expanded) .yt-supertool-speed-slider-wrap,
			[data-yt-supertool="speed"]:not(.is-expanded) .yt-supertool-speed-presets {
				display: none;
			}
			[data-yt-supertool="speed"] .yt-supertool-speed-presets button {
				height: 24px;
				padding: 0 8px;
				border: 1px solid rgba(255, 255, 255, 0.15);
				border-radius: 12px;
				background: rgba(255, 255, 255, 0.05);
				color: #fff;
				font: 500 11px/1 Roboto, Arial, sans-serif;
				cursor: pointer;
				transition: background-color 0.15s ease, border-color 0.15s ease;
				box-sizing: border-box;
			}
			[data-yt-supertool="speed"] .yt-supertool-speed-presets button:hover {
				background: rgba(255, 255, 255, 0.15);
				border-color: rgba(255, 255, 255, 0.25);
			}
			[data-yt-supertool="speed"] .yt-supertool-speed-presets button.is-active {
				background: #fff;
				color: #0f0f0f;
				border-color: #fff;
			}
			@media (max-width: 900px) {
				[data-yt-supertool="speed"].is-expanded {
					max-width: 88vw;
				}
				[data-yt-supertool="speed"] .yt-supertool-speed-presets {
					gap: 2px;
				}
				[data-yt-supertool="speed"] .yt-supertool-speed-presets button {
					padding: 0 6px;
					font-size: 10px;
				}
			}
		`;
		document.head.append(style);
	}

	function findTitleWrapper() {
		const titleContainer = document.querySelector('#title h1 yt-formatted-string')
			|| document.querySelector('#title h1')
			|| document.querySelector('h1.title')
			|| document.querySelector('ytd-watch-metadata h1')
			|| document.querySelector('#above-the-fold h1');

		return document.querySelector('#title')
			|| document.querySelector('ytd-watch-metadata')
			|| document.querySelector('#above-the-fold')
			|| titleContainer?.closest('#title')
			|| titleContainer?.parentElement
			|| null;
	}

	function initSpeed(player) {
		if (!player) return;
		const targetWrapper = findTitleWrapper();
		if (!targetWrapper) {
			if (initRetryCount < 4) {
				clearTimeout(initRetryTimer);
				initRetryCount += 1;
				initRetryTimer = setTimeout(() => initSpeed(player), 250);
			}
			return;
		}
		initRetryCount = 0;

		const existing = document.querySelector('[data-yt-supertool="speed"]');

		// Di chuyển UI cũ sang title wrapper mới sau SPA navigation.
		if (existing && existing.parentElement !== targetWrapper) {
			targetWrapper.prepend(existing);
			container = existing;
			titleWrapper = targetWrapper;
			video = player.querySelector('video') || document.querySelector('.html5-video-player video');
			if (video && video.playbackRate !== currentSpeed) video.playbackRate = currentSpeed;
			return;
		}

		// Nếu container đã tồn tại trong wrapper này thì giữ nguyên UI.
		if (existing) {
			container = existing;
			titleWrapper = targetWrapper;
			video = player.querySelector('video') || document.querySelector('.html5-video-player video');
			if (video && video.playbackRate !== currentSpeed) video.playbackRate = currentSpeed;
			existing.classList.toggle('is-expanded', isExpanded);
			return;
		}

		stopSpeed();
		addStyles();

		video = player.querySelector('video') || document.querySelector('.html5-video-player video');
		titleWrapper = targetWrapper;

		const el = document.createElement('span');
		el.dataset.ytSupertool = 'speed';
		el.title = 'Playback speed';
		if (isExpanded) el.classList.add('is-expanded');

		const badge = document.createElement('button');
		badge.type = 'button';
		badge.className = 'yt-supertool-speed-badge';
		badge.setAttribute('aria-label', 'Playback speed');
		badge.innerHTML = `
			<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
				<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm.5-13h-1v6l5.25 3.15.75-1.23-4.5-2.67V7Z"/>
			</svg>
			<span>${formatSpeed(currentSpeed)}</span>
		`;
		badge.addEventListener('click', event => {
			event.preventDefault();
			event.stopPropagation();
			isExpanded = !isExpanded;
			el.classList.toggle('is-expanded', isExpanded);
		});

		const slider = document.createElement('input');
		slider.type = 'range';
		slider.className = 'yt-supertool-speed-slider';
		slider.min = String(MIN_SPEED);
		slider.max = String(MAX_SPEED);
		slider.step = String(STEP);
		slider.value = String(currentSpeed);
		slider.setAttribute('aria-label', 'Playback speed');
		slider.addEventListener('input', event => applySpeed(event.target.value));
		slider.addEventListener('dblclick', event => {
			event.preventDefault();
			applySpeed(DEFAULT_SPEED);
		});

		const sliderWrap = document.createElement('span');
		sliderWrap.className = 'yt-supertool-speed-slider-wrap';
		sliderWrap.appendChild(slider);

		const presets = document.createElement('span');
		presets.className = 'yt-supertool-speed-presets';
		PRESETS.forEach(preset => {
			const button = document.createElement('button');
			button.type = 'button';
			button.textContent = `${preset}x`;
			button.title = `Set playback speed to ${preset}x`;
			button.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				applySpeed(preset);
			});
			presets.append(button);
		});

		el.append(badge, sliderWrap, presets);
		titleWrapper.prepend(el);
		container = el;
		badgeRef = badge;
		sliderRef = slider;
		presetButtons = Array.from(presets.querySelectorAll('button'));

		if (!titleObserver && document.body) {
			const observeTarget = document.querySelector('#content')
				|| document.querySelector('#columns')
				|| document.body;
			titleObserver = new MutationObserver(() => {
				if (!container || container.isConnected) return;
				const currentWrapper = findTitleWrapper();
				if (currentWrapper) {
					currentWrapper.prepend(container);
					titleWrapper = currentWrapper;
				}
			});
			titleObserver.observe(observeTarget, { childList: true, subtree: true });
		}

		if (video && video.playbackRate !== currentSpeed) video.playbackRate = currentSpeed;
		syncPresetStates();

		onRateChange = () => {
			if (!video) return;
			const rate = Number(video.playbackRate.toFixed(2));
			if (Math.abs(rate - currentSpeed) > 0.001) {
				currentSpeed = rate;
				const span = badge.querySelector('span');
				if (span) span.textContent = formatSpeed(currentSpeed);
				slider.value = String(currentSpeed);
				syncPresetStates();
				saveSpeed(currentSpeed);
			}
		};
		video?.addEventListener('ratechange', onRateChange);

		onKeydown = event => {
			const active = document.activeElement;
			if (active?.matches('input, textarea, [contenteditable="true"]')) return;
			if (event.key !== '>' && event.key !== '<') return;
			event.preventDefault();
			applySpeed(currentSpeed + (event.key === '>' ? KEY_STEP : -KEY_STEP));
		};
		document.addEventListener('keydown', onKeydown);

		chrome.storage.local.get({ playbackSpeed: DEFAULT_SPEED }, result => {
			const saved = Number(result.playbackSpeed);
			if (saved >= MIN_SPEED && saved <= MAX_SPEED) applySpeed(saved, false);
		});
	}

	function stopSpeed() {
		clearTimeout(initRetryTimer);
		clearTimeout(saveTimer);
		initRetryTimer = 0;
		saveTimer = 0;
		initRetryCount = 0;
		titleObserver?.disconnect();
		titleObserver = null;
		badgeRef = null;
		sliderRef = null;
		presetButtons = [];
		if (onKeydown) {
			document.removeEventListener('keydown', onKeydown);
			onKeydown = null;
		}
		if (onRateChange && video) {
			video.removeEventListener('ratechange', onRateChange);
			onRateChange = null;
		}
		document.querySelectorAll('[data-yt-supertool="speed"]').forEach(element => element.remove());
		container = null;
		titleWrapper = null;
		video = null;
	}

	window.YTSuperTool = window.YTSuperTool || {};
	window.YTSuperTool.speed = { initSpeed, stopSpeed, cleanupSpeed: stopSpeed };
})();