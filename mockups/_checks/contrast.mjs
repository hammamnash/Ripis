// Contrast audit for the Ripis mockups.
//   node mockups/_checks/contrast.mjs
// Tokens are copied verbatim from .ai/03-design.md §2.1, §2.9, §3, §4, §11.
// WCAG 2.1: 4.5:1 for text, 3:1 for non-text/UI (1.4.11).
// floor === null  =>  informational, not a WCAG requirement for that role.

const ink = (hex) => {
  const c = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = v.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};
const ratio = (a, b) => {
  const [x, y] = [ink(a), ink(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const T = {
  light: {
    canvas: '#f4f2f0', surface: '#ffffff', wash: '#f4f2f0', panel: '#1a1919',
    ink: '#0c0a08', ash: '#6d6c6b', hairline: '#e5e7eb', skeleton: '#d3d3d3',
    highlighter: '#e4f222', blush: '#fbe1d1', 'on-blush': '#5d2a1a',
    positive: '#16653f', warning: '#a35a00', negative: '#a3261c',
    'wash-positive': '#e6f2ea', 'wash-warning': '#fdf0dd', 'wash-negative': '#fbe9e7',
    'ash-warm': '#9e9891', // = the dark theme's ash, proposed as the on-panel ash
    // The adopted on-panel layer: on --surface-inverted the semantic colours are
    // the dark-set values, in BOTH themes. Identical strings on purpose.
    'on-panel-ash': '#9e9891', 'on-panel-positive': '#66d19b', 'on-panel-negative': '#ff9d95',
  },
  dark: {
    canvas: '#14120f', surface: '#1e1b18', wash: '#1a1714', panel: '#262220',
    ink: '#f4f2f0', ash: '#9e9891', hairline: '#3a3430', skeleton: '#423b36',
    highlighter: '#e4f222', blush: '#3a2018', 'on-blush': '#fbe1d1',
    positive: '#66d19b', warning: '#eab308', negative: '#ff9d95',
    'wash-positive': '#16261e', 'wash-warning': '#2b2412', 'wash-negative': '#2e1a18',
    'on-panel-ash': '#9e9891', 'on-panel-positive': '#66d19b', 'on-panel-negative': '#ff9d95',
  },
  fixed: { paper: '#ffffff', onHighlighter: '#0c0a08', bone: '#f4f2f0', smoke: '#d3d3d3' },
};

// [theme, fg, bg, floor, label]
const CHECKS = [
  // --- text on page surfaces
  ['light', 'ink', 'canvas', 4.5, 'body text on canvas'],
  ['light', 'ink', 'surface', 4.5, 'card text on paper'],
  ['light', 'ink', 'wash', 4.5, 'recessed group text'],
  ['light', 'ash', 'canvas', 4.5, 'secondary text on canvas'],
  ['light', 'ash', 'surface', 4.5, 'secondary text on card'],
  ['light', 'ash', 'wash', 4.5, 'micro-label on wash'],
  ['dark', 'ink', 'canvas', 4.5, 'body text on canvas'],
  ['dark', 'ink', 'surface', 4.5, 'body text on card'],
  ['dark', 'ink', 'wash', 4.5, 'body text on wash'],
  ['dark', 'ash', 'canvas', 4.5, 'secondary text on canvas'],
  ['dark', 'ash', 'surface', 4.5, 'secondary text on card'],
  ['dark', 'ash', 'wash', 4.5, 'micro-label on wash'],

  // --- the accent
  ['light', 'ink', 'highlighter', 4.5, 'ink on the accent (highlighter button)'],
  ['dark', 'ink', 'highlighter', null, 'TRAP: dark ink on the accent — 1.10:1. §2.9 rule 1 exists to stop this; use --color-on-action'],
  ['dark', 'onHighlighter', 'highlighter', 4.5, '§2.9 rule 1: onHighlighter on the accent, in dark too'],

  // --- money semantics on surfaces, and on their own washes
  ['light', 'positive', 'canvas', 4.5, 'income on canvas'],
  ['light', 'positive', 'surface', 4.5, 'income on card'],
  ['light', 'warning', 'canvas', 4.5, 'warning on canvas'],
  ['light', 'negative', 'canvas', 4.5, 'negative on canvas'],
  ['light', 'positive', 'wash-positive', 4.5, 'income text on its wash'],
  ['light', 'warning', 'wash-warning', 4.5, 'warning text on its wash'],
  ['light', 'negative', 'wash-negative', 4.5, 'negative text on its wash'],
  ['dark', 'positive', 'canvas', 4.5, 'income on canvas'],
  ['dark', 'warning', 'canvas', 4.5, 'warning on canvas'],
  ['dark', 'negative', 'canvas', 4.5, 'negative on canvas'],
  ['dark', 'positive', 'wash-positive', 4.5, 'income text on its wash'],
  ['dark', 'warning', 'wash-warning', 4.5, 'warning text on its wash'],
  ['dark', 'negative', 'wash-negative', 4.5, 'negative text on its wash'],

  // --- the Insight Card (warm surface, roles swap between themes)
  ['light', 'on-blush', 'blush', 4.5, 'sienna on blush (insight card)'],
  ['dark', 'on-blush', 'blush', 4.5, 'peach on the dark warm surface (insight card)'],

  // --- the Net Worth Hero: #panel, in both themes
  ['light', 'paper', 'panel', 4.5, 'hero figure (paper) on the obsidian panel'],
  ['dark', 'paper', 'panel', 4.5, 'hero figure (paper) on the raised panel'],
  ['light', 'ash', 'panel', null, 'DEFECT: hero micro-label (ash) on the obsidian panel — 3.35:1, below the 4.5 floor'],
  ['dark', 'ash', 'panel', 4.5, 'hero micro-label (ash) on the raised panel'],
  ['light', 'positive', 'panel', null, 'DEFECT: hero delta (positive) on the obsidian panel — 2.48:1, below the 4.5 floor'],
  ['light', 'negative', 'panel', null, 'DEFECT: hero delta (negative) on the obsidian panel — 2.38:1, below the 4.5 floor'],
  ['dark', 'positive', 'panel', 4.5, 'hero delta (positive) on the raised panel'],
  ['dark', 'negative', 'panel', 4.5, 'hero delta (negative) on the raised panel'],
  ['light', 'smoke', 'panel', 4.5, 'smoke as the on-panel muted label (not allowed)'],

  // --- enforced: the on-panel aliases the mockups actually render
  ['light', 'on-panel-ash', 'panel', 4.5, 'ADOPTED --color-ash-on-panel on the obsidian panel'],
  ['light', 'on-panel-positive', 'panel', 4.5, 'ADOPTED --color-positive-on-panel on the obsidian panel'],
  ['light', 'on-panel-negative', 'panel', 4.5, 'ADOPTED --color-negative-on-panel on the obsidian panel'],
  ['dark', 'on-panel-ash', 'panel', 4.5, 'ADOPTED --color-ash-on-panel on the raised panel'],
  ['dark', 'on-panel-positive', 'panel', 4.5, 'ADOPTED --color-positive-on-panel on the raised panel'],
  ['dark', 'on-panel-negative', 'panel', 4.5, 'ADOPTED --color-negative-on-panel on the raised panel'],

  // --- informational: tonal steps, not text and not controls
  ['light', 'panel', 'canvas', null, 'hero panel vs canvas — the deliberate inversion'],
  ['dark', 'panel', 'canvas', null, 'dark hero vs canvas — elevation moves away'],
  ['light', 'surface', 'canvas', null, 'card vs canvas (hairline does the work)'],
  ['dark', 'surface', 'canvas', null, 'dark card vs canvas'],
  ['light', 'hairline', 'canvas', null, 'light hairline vs canvas'],
  ['dark', 'hairline', 'canvas', null, 'dark hairline vs canvas'],
  ['light', 'skeleton', 'canvas', null, 'smoke on bone — documented 1.34:1, never carries text'],
  ['dark', 'skeleton', 'canvas', null, 'dark skeleton vs canvas'],
];

const SERIES = [
  ['light', ['#0c0a08', '#7d8c22', '#a3351c', '#6d6c6b', '#8b8279', '#5d2a1a'], '#ffffff', 'light chart 1-6 on paper'],
  ['light', ['#0c0a08', '#7d8c22', '#a3351c', '#6d6c6b', '#8b8279', '#5d2a1a'], '#f4f2f0', 'light chart 1-6 on bone'],
  ['dark', ['#f4f2f0', '#e4f222', '#fbe1d1', '#c9c3bb', '#bf5a3e', '#6d6c6b'], '#14120f', 'dark chart 1-6 on canvas'],
];

const pad = (s, n) => String(s).padEnd(n);
let fails = 0;
const report = (ok, line) => { if (!ok) fails++; console.log(`${ok ? 'pass' : 'FAIL'}  ${line}`); };

console.log('== text and surface pairs ==');
for (const [theme, fg, bg, floor, label] of CHECKS) {
  const set = theme === 'light' ? T.light : T.dark;
  const f = set[fg] ?? T.fixed[fg];
  const b = set[bg] ?? T.fixed[bg];
  const r = ratio(f, b);
  if (floor === null) {
    console.log(`info  ${pad(theme, 5)} ${pad(fg + ' on ' + bg, 30)} ${r.toFixed(2).padStart(5)}:1  ${label}`);
  } else {
    report(r >= floor, `${pad(theme, 5)} ${pad(fg + ' on ' + bg, 30)} ${r.toFixed(2).padStart(5)}:1  floor ${floor}  ${label}`);
  }
}

console.log('\n== chart series (§4) — 3:1 floor ==');
for (const [theme, hexes, bg, label] of SERIES) {
  const rs = hexes.map((h) => ratio(h, bg));
  report(rs.every((r) => r >= 3), `${pad(theme, 5)} ${pad(label, 30)} ${rs.map((r) => r.toFixed(2)).join(' / ')}`);
}

console.log(`\n${fails === 0 ? 'ALL REQUIRED PAIRS PASS' : fails + ' REQUIRED PAIR(S) BELOW FLOOR'}`);
