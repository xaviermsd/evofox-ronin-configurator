/**
 * EvoFox Ronin icon set — vanilla port of the Electric Lime starter set
 * (Appendix F) plus the app's own icons, all drawn to the same spec:
 * 24×24 grid, outline, stroke 1.8, round caps + joins, stroke = currentColor,
 * default size 18 (13–15 in badges/toasts, 16 in tabs). Never lime on light.
 *
 * Usage
 *   icon('plug')                → SVG markup string (18px)
 *   icon('check', 15)           → SVG at 15px
 *   <i data-icon="plug"></i>    → replaced at runtime by hydrateIcons()
 *   spot('no-keyboard')         → 160×110 spot illustration (empty/error states)
 */

export const ICONS = {
  /* ---------- starter set (Appendix F) ---------- */
  shield: '<path d="M12 3 5 6v5.5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4M4 13a8 8 0 0 0 14.9 3.9M20 20v-4h-4"/>',
  upload: '<path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5"/><rect x="3" y="13" width="18" height="8" rx="2"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  fullscreenExit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  sparkle: '<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.5L12 15l-1.8-4.5L5.5 9l4.7-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  wand: '<path d="m4 20 11-11M14 4v3M12.5 5.5h3M19 9v3M17.5 10.5h3M18 3.5l.6 1.4 1.4.6-1.4.6L18 7.5l-.6-1.4-1.4-.6 1.4-.6z"/><path d="m13 8 3 3"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.1-4-7.8-9-7.8z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="10" cy="7" r="1" fill="currentColor"/><circle cx="14.5" cy="7" r="1" fill="currentColor"/>',
  type: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  shapes: '<circle cx="7.5" cy="7.5" r="4"/><rect x="12.5" y="12.5" width="8" height="8" rx="1.5"/><path d="M14 3.5 19.5 9h-5.5z"/>',
  brand: '<path d="M12 2.5 14.6 8l6 .6-4.5 4 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.5-4 6-.6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1 0 8z"/>',
  target: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  speed: '<path d="M4.5 17a8 8 0 1 1 15 0"/><path d="m12 13 4-4.5"/><circle cx="12" cy="13.5" r="1.4" fill="currentColor" stroke="none"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  magnet: '<path d="M5 4h4v8a3 3 0 0 0 6 0V4h4v8a7 7 0 0 1-14 0z"/><path d="M5 8h4M15 8h4"/>',
  alignH: '<path d="M12 3v18"/><rect x="6" y="7" width="12" height="4" rx="1"/><rect x="8" y="13" width="8" height="4" rx="1"/>',
  alignV: '<path d="M3 12h18"/><rect x="7" y="6" width="4" height="12" rx="1"/><rect x="13" y="8" width="4" height="8" rx="1"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
  dots: [5, 12, 19].flatMap((x) => [5, 12, 19].map((y) => `<circle cx="${x}" cy="${y}" r="1.6" fill="currentColor" stroke="none"/>`)).join(''),

  /* ---------- EvoFox app icons (same spec) ---------- */
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  plug: '<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>',
  usbC: '<rect x="3" y="9" width="18" height="6" rx="3"/><path d="M7.5 12h9"/>',
  dongle: '<rect x="7" y="10" width="10" height="11" rx="2"/><path d="M9 10V4h6v6"/><path d="M11 6.5h.01M13 6.5h.01"/>',
  signal: '<path d="M2.5 9.5a13.5 13.5 0 0 1 19 0"/><path d="M5.5 12.8a9 9 0 0 1 13 0"/><path d="M8.6 16a4.6 4.6 0 0 1 6.8 0"/><path d="M12 19.5h.01"/>',
  bluetooth: '<path d="m7 7.5 10 9-5 4.5V3l5 4.5-10 9"/>',
  battery: '<rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/><path d="M6 10.5v3M9.5 10.5v3"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  underglow: '<rect x="5.5" y="7" width="13" height="10" rx="2"/><path d="M2.5 9v6M21.5 9v6"/><path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01M9.5 13.5h5"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  save: '<path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8 4v5h7V4"/><rect x="8" y="13" width="8" height="5" rx="1"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 0 2 2h13v-3"/><path d="M9 7.5h6"/>',
  fnKey: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 15V9h3M8 12h2.5"/><path d="M13.5 15v-4M13.5 12.5a1.75 1.75 0 0 1 3.5 0V15"/>',
  knob: '<circle cx="12" cy="12" r="7.5"/><path d="M12 8v4"/><path d="M12 2.5v1M21.5 12h-1M3.5 12h-1M18.7 5.3l-.7.7M5.3 5.3l.7.7"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.8 3.5 5.8 3.5 9s-1 6.2-3.5 9c-2.5-2.8-3.5-5.8-3.5-9s1-6.2 3.5-9z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
  heart: '<path d="M12 20s-7-4.35-9-8.5C1.5 8 3.5 5 6.5 5c2 0 3.5 1 4.5 2.5h2C14 6 15.5 5 17.5 5c3 0 5 3 3.5 6.5C19 15.65 12 20 12 20z"/>',
  fox: '<path d="M5.75 3.56 9.81 8.56h4.38l4.06-5 .94 8.13 1.87 1.87L12 20.75l-9.06-7.19 1.87-1.87z"/><path d="M7.6 13.25l2.5.78M16.4 13.25l-2.5.78"/><path d="M5.75 14.5l3.75 1.1L12 18.25l2.5-2.65 3.75-1.1"/>',

  /* ---------- lighting mode families (23 modes → 8 glyphs) ---------- */
  modeWave: '<path d="M2.5 9.5c1.6-2.7 3.2-2.7 4.8 0s3.2 2.7 4.8 0 3.2-2.7 4.8 0 2.2 2.2 3.6 1.3"/><path d="M2.5 15.5c1.6-2.7 3.2-2.7 4.8 0s3.2 2.7 4.8 0 3.2-2.7 4.8 0 2.2 2.2 3.6 1.3"/>',
  modeRipple: '<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.1 5.1a9.8 9.8 0 0 0 0 13.8M18.9 5.1a9.8 9.8 0 0 1 0 13.8"/>',
  modeBreathe: '<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="8.5" stroke-dasharray="2.2 3"/>',
  modeStatic: '<rect x="4" y="4" width="16" height="16" rx="3"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.5"/>',
  modeSpectrum: '<circle cx="9" cy="9.5" r="5"/><circle cx="15" cy="9.5" r="5"/><circle cx="12" cy="14.5" r="5"/>',
  modeLaser: '<path d="M3.5 20.5 14 10"/><circle cx="15.5" cy="8.5" r="1.8"/><path d="M15.5 2.5v2M21.5 8.5h-2M19.7 4.3l-1.4 1.4M19.7 12.7l-1.4-1.4"/>',
};

/** Lighting mode id → icon family (config.js BACKLIGHT_MODES). */
export const MODE_ICON = {
  1: 'modeWave', 2: 'sparkle', 3: 'modeRipple', 4: 'modeLaser', 5: 'modeSpectrum', 6: 'modeSpectrum',
  7: 'modeStatic', 8: 'modeBreathe', 9: 'modeWave', 10: 'modeLaser', 11: 'modeRipple', 12: 'modeWave',
  13: 'modeWave', 14: 'modeRipple', 15: 'modeRipple', 16: 'sparkle', 17: 'modeSpectrum', 18: 'modeWave',
  19: 'modeLaser', 20: 'modeLaser', 23: 'palette', 128: 'music', 21: 'moon',
};

export function icon(name, size = 18, cls = '') {
  const inner = ICONS[name] || ICONS.info;
  return `<svg class="icon${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
}

/** Replace every <i data-icon="name" data-size="16"></i> under root. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-icon]:not([data-hydrated])').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 18);
    el.setAttribute('data-hydrated', '');
    el.setAttribute('aria-hidden', 'true');
  });
}

/* ---------- spot illustrations (guide ch. 11) ----------
   160×110: --panel card, ink outline + hard ink offset, one lime badge with
   an ink glyph. Colours come from tokens via inline style. */
const INK = 'fill:var(--ink)';
const CARD = 'fill:var(--panel);stroke:var(--ink);stroke-width:3';
const LIME = 'fill:var(--lime);stroke:var(--ink);stroke-width:3';
const BAR = 'fill:var(--ink)';
const BAR_SOFT = 'fill:var(--panel-2);stroke:var(--ink);stroke-width:2';
const GLYPH = 'fill:none;stroke:var(--ink);stroke-width:3;stroke-linecap:round;stroke-linejoin:round';

function card(inner) {
  return `<rect x="20" y="28" width="108" height="66" rx="14" style="${INK}" transform="translate(5 5)"/>
    <rect x="20" y="28" width="108" height="66" rx="14" style="${CARD}"/>${inner}`;
}
function badge(glyph) {
  return `<circle cx="124" cy="30" r="17" style="${INK}" transform="translate(4 4)"/>
    <circle cx="124" cy="30" r="17" style="${LIME}"/><g style="${GLYPH}">${glyph}</g>`;
}
const KEYS = [0, 1, 2, 3, 4].map((i) => `<rect x="${32 + i * 17}" y="44" width="13" height="11" rx="3" style="${BAR_SOFT}"/>`).join('')
  + [0, 1, 2, 3].map((i) => `<rect x="${32 + i * 17}" y="60" width="13" height="11" rx="3" style="${BAR_SOFT}"/>`).join('')
  + `<rect x="100" y="60" width="13" height="11" rx="3" style="fill:var(--lime);stroke:var(--ink);stroke-width:2"/>`
  + `<rect x="44" y="76" width="56" height="8" rx="4" style="${BAR}"/>`;
const LINES = `<rect x="34" y="48" width="58" height="9" rx="4.5" style="${BAR}"/>
  <rect x="34" y="64" width="40" height="9" rx="4.5" style="${BAR_SOFT}"/>`;

const SPOTS = {
  'no-keyboard': card(KEYS) + badge('<path d="M118 22v6M130 22v6M114 28h20v3a10 10 0 0 1-20 0zM124 41v3"/>'),
  'no-results': card(LINES) + badge('<circle cx="122" cy="28" r="6"/><path d="m127 33 4 4"/>'),
  done: card(LINES) + badge('<path d="m116 30 5 5 10-11"/>'),
  error: card(LINES) + badge('<path d="M124 21v11M124 38h.01"/>'),
};

export function spot(name, cls = 'spot') {
  return `<svg class="${cls}" viewBox="0 0 160 110" aria-hidden="true" focusable="false">${SPOTS[name] || SPOTS.done}</svg>`;
}
