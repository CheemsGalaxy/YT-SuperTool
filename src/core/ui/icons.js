import { createSvgElement } from '../dom-safe.js';

const ICONS = {
  home: [
    ['path', { d: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9.5Z' }]
  ],
  play: [
    ['path', { d: 'M9 6.5v11l9-5.5-9-5.5Z' }]
  ],
  shield: [
    ['path', { d: 'M12 3.2 5 6v5.4c0 4.2 2.9 7.3 7 8.4 4.1-1.1 7-4.2 7-8.4V6l-7-2.8Z' }],
    ['path', { d: 'm9.2 12.2 2.1 2.1 3.9-4' }]
  ],
  shorts: [
    ['rect', { x: '7', y: '3', width: '10', height: '18', rx: '3' }],
    ['path', { d: 'm11 9.2 4 2.8-4 2.8V9.2Z' }]
  ],
  thumbdown: [
    ['path', { d: 'M7 3v10' }],
    ['path', { d: 'M7 13.5 10.6 20a1.8 1.8 0 0 0 3.2-1.4L13.2 15H18a2 2 0 0 0 2-2.4l-1.2-6A2 2 0 0 0 16.8 5H7' }],
    ['path', { d: 'M4 3v10h3' }]
  ],
  repeat: [
    ['path', { d: 'M4 9V8a4 4 0 0 1 4-4h10' }],
    ['polyline', { points: '15 1 18 4 15 7' }],
    ['path', { d: 'M20 15v1a4 4 0 0 1-4 4H6' }],
    ['polyline', { points: '9 17 6 20 9 23' }]
  ],
  skip: [
    ['path', { d: 'M5 5.5v13l9-6.5-9-6.5Z' }],
    ['path', { d: 'M18 5v14' }]
  ],
  gauge: [
    ['path', { d: 'M4.2 18a9 9 0 1 1 15.6 0' }],
    ['path', { d: 'm12 14 4.5-4.5' }],
    ['circle', { cx: '12', cy: '14', r: '1.4' }]
  ],
  pip: [
    ['rect', { x: '3', y: '5', width: '18', height: '14', rx: '2' }],
    ['rect', { x: '12.5', y: '11.5', width: '6', height: '4.5', rx: '1' }]
  ],
  camera: [
    ['path', { d: 'M5 8.5h3l1.5-2.2h5L16 8.5h3a2 2 0 0 1 2 2v6.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6.8a2 2 0 0 1 2-2Z' }],
    ['circle', { cx: '12', cy: '13.4', r: '3.2' }]
  ],
  download: [
    ['path', { d: 'M12 4v10' }],
    ['path', { d: 'm8 10.5 4 4 4-4' }],
    ['path', { d: 'M5 19.5h14' }]
  ],
  braces: [
    ['path', { d: 'M9 4 4.5 12 9 20' }],
    ['path', { d: 'M15 4l4.5 8L15 20' }]
  ],
  layers: [
    ['path', { d: 'm12 3.5 8 4-8 4-8-4 8-4Z' }],
    ['path', { d: 'm4 12 8 4 8-4' }],
    ['path', { d: 'm4 16.5 8 4 8-4' }]
  ],
  fast: [
    ['path', { d: 'm6 5.5 6 6.5-6 6.5' }],
    ['path', { d: 'm13 5.5 6 6.5-6 6.5' }]
  ],
  chevron: [
    ['path', { d: 'm6 9.5 6 6 6-6' }]
  ],
  close: [
    ['path', { d: 'm6 6 12 12' }],
    ['path', { d: 'M18 6 6 18' }]
  ],
  check: [
    ['path', { d: 'm5 12.5 4.5 4.5L19 7.5' }]
  ],
  reset: [
    ['path', { d: 'M4.5 5.5V10H9' }],
    ['path', { d: 'M5 14a7.5 7.5 0 1 0 2.2-7.2L4.5 10' }]
  ],
  sliders: [
    ['path', { d: 'M4 7h10' }],
    ['path', { d: 'M18 7h2' }],
    ['circle', { cx: '16', cy: '7', r: '2' }],
    ['path', { d: 'M4 12h4' }],
    ['path', { d: 'M12 12h8' }],
    ['circle', { cx: '10', cy: '12', r: '2' }],
    ['path', { d: 'M4 17h12' }],
    ['circle', { cx: '18', cy: '17', r: '2' }]
  ]
};

export function createIcon(name, size = 20, { strokeWidth } = {}) {
  const shapes = ICONS[name] || ICONS.sliders;
  const svg = createSvgElement('svg', {
    viewBox: '0 0 24 24',
    width: String(size),
    height: String(size),
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': String(strokeWidth || (size <= 16 ? 1.5 : 1.75)),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    className: 'ytst-icon'
  });

  for (const [tag, attributes] of shapes) {
    svg.appendChild(createSvgElement(tag, attributes));
  }
  return svg;
}

export function createBrandMark(size = 16) {
  const svg = createSvgElement('svg', {
    viewBox: '0 0 24 24',
    width: String(size),
    height: String(size),
    fill: 'currentColor',
    'aria-hidden': 'true',
    focusable: 'false',
    className: 'ytst-icon'
  });
  svg.appendChild(createSvgElement('path', { d: 'M9.4 6.1v11.8L19 12 9.4 6.1Z' }));
  return svg;
}

export default createIcon;
