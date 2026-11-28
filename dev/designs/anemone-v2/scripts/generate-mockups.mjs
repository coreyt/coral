#!/usr/bin/env node
/**
 * Deterministic generator for Coral Anemone v2 visual mockups, symbol kit,
 * before/after comparison, paired .coral sources, and interactive gallery.
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT_BASE = '/mnt/data/worktrees/coral-0.2.14/dev/designs/anemone-v2/mockups';
const SYMBOLS_DIR = path.join(OUT_BASE, 'symbols');
const DIAGRAMS_DIR = path.join(OUT_BASE, 'diagrams');
const SOURCES_DIR = path.join(OUT_BASE, 'sources');

for (const d of [OUT_BASE, SYMBOLS_DIR, DIAGRAMS_DIR, SOURCES_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const FONT_SANS = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace";
const FONT_HAND = "'Coral Lowfi Caveat', 'Caveat', 'Virgil', cursive";

// Load Coral's bundled SIL OFL 1.1 Caveat WOFF2 font for portable offline sketch rendering
const caveatSrc = fs.readFileSync('/mnt/data/worktrees/coral-0.2.14/packages/render/src/text/caveat028.ts', 'utf8');
const caveatMatch = caveatSrc.match(/CAVEAT_FONT_DATA_028\s*=\s*'([^']+)'/);
const CAVEAT_FONT_CSS = caveatMatch
  ? `<style>@font-face{font-family:'Coral Lowfi Caveat';src:url('${caveatMatch[1]}') format('woff2');font-weight:400 700;font-style:normal;}</style>`
  : '';

const THEMES = {
  light: {
    canvas: '#F8FAFC',
    canvasDot: '#CBD5E1',
    zoneL1: '#F1F5F9',
    zoneL2: '#E8EFF7',
    card: '#FFFFFF',
    cardExternal: '#F8FAFC',
    cardNote: '#FFFBEB',
    cardNoteBorder: '#FCD34D',
    pill: '#F1F5F9',
    pillBorder: '#E2E8F0',
    borderSubtle: '#DDE4EE',
    borderStrong: '#94A3B8',
    borderZone: '#CBD5E1',
    inkPrimary: '#0F172A',
    inkSecondary: '#475569',
    inkMuted: '#64748B',
    edgeDefault: '#64748B',
    edgeStrong: '#334155',
    rowAlt: '#F8FAFC',
    divider: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowSm1: 0.05,
    shadowSm2: 0.05,
    shadowMd1: 0.07,
    shadowMd2: 0.08,
    accents: {
      coral:   { badge: '#FFE4E6', ink: '#BE123C', border: '#FDA4AF', soft: '#FFF5F6', head: '#FFF1F2' },
      indigo:  { badge: '#EEF2FF', ink: '#4338CA', border: '#C7D2FE', soft: '#F5F7FF', head: '#EEF2FF' },
      teal:    { badge: '#ECFEFF', ink: '#0E7490', border: '#A5F3FC', soft: '#F2FCFD', head: '#ECFEFF' },
      sky:     { badge: '#E0F2FE', ink: '#0369A1', border: '#BAE6FD', soft: '#F4FAFF', head: '#E0F2FE' },
      amber:   { badge: '#FEF3C7', ink: '#B45309', border: '#FDE68A', soft: '#FFFDF5', head: '#FFFBEB' },
      violet:  { badge: '#F3E8FF', ink: '#7E22CE', border: '#E9D5FF', soft: '#FAF5FF', head: '#F5F3FF' },
      emerald: { badge: '#D1FAE5', ink: '#047857', border: '#A7F3D0', soft: '#F3FDF8', head: '#ECFDF5' },
      slate:   { badge: '#F1F5F9', ink: '#475569', border: '#CBD5E1', soft: '#F8FAFC', head: '#F1F5F9' },
      aws:     { badge: '#FFF7ED', ink: '#C2410C', border: '#FDBA74', soft: '#FFFBF5', head: '#FFF7ED' },
      gcp:     { badge: '#EFF6FF', ink: '#1D4ED8', border: '#93C5FD', soft: '#F5F9FF', head: '#EFF6FF' },
      azure:   { badge: '#F0F9FF', ink: '#0369A1', border: '#7DD3FC', soft: '#F4FAFF', head: '#F0F9FF' },
    },
  },
  dark: {
    canvas: '#0B101B',
    canvasDot: '#263248',
    zoneL1: '#111827',
    zoneL2: '#162033',
    card: '#192235',
    cardExternal: '#121928',
    cardNote: '#282012',
    cardNoteBorder: '#785A18',
    pill: '#222E44',
    pillBorder: '#334155',
    borderSubtle: '#2A3750',
    borderStrong: '#475569',
    borderZone: '#2D3B55',
    inkPrimary: '#F1F5F9',
    inkSecondary: '#94A3B8',
    inkMuted: '#7E8FA6',
    edgeDefault: '#7C8DA6',
    edgeStrong: '#CBD5E1',
    rowAlt: '#151D2E',
    divider: '#263249',
    shadowColor: '#000000',
    shadowSm1: 0.28,
    shadowSm2: 0.22,
    shadowMd1: 0.36,
    shadowMd2: 0.28,
    accents: {
      coral:   { badge: '#3B1522', ink: '#FB7185', border: '#881337', soft: '#241019', head: '#2E1420' },
      indigo:  { badge: '#1E254B', ink: '#818CF8', border: '#3730A3', soft: '#161B36', head: '#1B2142' },
      teal:    { badge: '#102E38', ink: '#22D3EE', border: '#155E75', soft: '#0E222B', head: '#112A34' },
      sky:     { badge: '#102B42', ink: '#38BDF8', border: '#075985', soft: '#0D2032', head: '#10263B' },
      amber:   { badge: '#34240E', ink: '#FBBF24', border: '#92400E', soft: '#241A0C', head: '#2B1F0F' },
      violet:  { badge: '#2A1944', ink: '#C084FC', border: '#6B21A8', soft: '#1E1432', head: '#25173B' },
      emerald: { badge: '#0E2E23', ink: '#34D399', border: '#065F46', soft: '#0C221B', head: '#0E2820' },
      slate:   { badge: '#1F293B', ink: '#94A3B8', border: '#475569', soft: '#151D2B', head: '#1B2435' },
      aws:     { badge: '#361E10', ink: '#FB923C', border: '#9A3412', soft: '#26170E', head: '#2E1B10' },
      gcp:     { badge: '#142442', ink: '#60A5FA', border: '#1E40AF', soft: '#101B33', head: '#13203A' },
      azure:   { badge: '#0F283D', ink: '#38BDF8', border: '#075985', soft: '#0C1E2E', head: '#0E2335' },
    },
  },
};

// Unified 24x24 Lucide-grade stroke icon kit (1.75px stroke, round cap/join)
const ICONS = {
  user: `<circle cx="12" cy="8" r="4"/><path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6"/>`,
  browser: `<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>`,
  server: `<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/>`,
  layers: `<path d="M12 3L3 8l9 5 9-5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17l9 5 9-5"/>`,
  box: `<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>`,
  database: `<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6"/><path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3"/>`,
  queue: `<path d="M4 7h12M4 12h16M4 17h12"/><path d="M17 4l3 3-3 3"/><path d="M17 14l3 3-3 3"/>`,
  cloud: `<path d="M6.5 19h11a4 4 0 0 0 .8-7.92A5.5 5.5 0 0 0 7.6 9.5 3.8 3.8 0 0 0 6.5 19z"/>`,
  globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 4 5.8 4 9s-1.5 6.3-4 9c-2.5-2.7-4-5.8-4-9s1.5-6.3 4-9z"/>`,
  shield: `<path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.3-7.5 9.5-4.4-1.2-7.5-4.9-7.5-9.5V6L12 3z"/><path d="M9 12l2 2 4-4"/>`,
  gateway: `<path d="M4 12h5M15 12h5"/><rect x="9" y="6" width="6" height="12" rx="1.5"/><path d="M12 3v3M12 18v3"/>`,
  cpu: `<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="0.8"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>`,
  k8s: `<polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M4 7.5l5.2 3M14.8 13.5l5.2 3M20 7.5l-5.2 3M9.2 13.5L4 16.5"/>`,
  bolt: `<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/>`,
  sparkle: `<path d="M12 3l2.2 6.3L20.5 12l-6.3 2.2L12 20.5l-2.2-6.3L3.5 12l6.3-2.2L12 3z"/>`,
  bot: `<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9.5 15.5h5"/>`,
  search: `<circle cx="10.5" cy="10.5" r="6"/><path d="M15.2 15.2L20 20"/>`,
  wrench: `<path d="M14.5 6.5a4.5 4.5 0 0 0 5.5 5.5l-9.5 9.5a2.1 2.1 0 0 1-3-3l9.5-9.5a4.5 4.5 0 0 0-2.5-2.5z"/>`,
  memory: `<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 12.5h5M8 16h3"/>`,
  stream: `<path d="M3 8c2.5-2.5 5.5-2.5 8 0s5.5 2.5 8 0"/><path d="M3 12.5c2.5-2.5 5.5-2.5 8 0s5.5 2.5 8 0"/><path d="M3 17c2.5-2.5 5.5-2.5 8 0s5.5 2.5 8 0"/>`,
  chart: `<path d="M4 19h16"/><rect x="6" y="12" width="3" height="7" rx="0.8"/><rect x="11" y="8" width="3" height="11" rx="0.8"/><rect x="16" y="5" width="3" height="14" rx="0.8"/>`,
  table: `<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M9.5 9.5v10"/>`,
  code: `<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14"/>`,
  mail: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5L12 13l8.5-6.5"/>`,
  card: `<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h4"/>`,
  lock: `<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`,
  check: `<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.3 2.3 4.8-5"/>`,
  gear: `<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M18 6l-1.6 1.6M7.6 16.4L6 18"/>`,
  file: `<path d="M6 3.5h8l4.5 4.5v12.5a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20.5V5A1.5 1.5 0 0 1 6 3.5z"/><path d="M14 3.5V8h4.5"/>`,
  bucket: `<path d="M5 7h14l-1.5 12a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 7z"/><path d="M4 7h16M9 7V5a3 3 0 0 1 6 0v2"/>`,
  activity: `<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>`,
};

function renderIcon(name, x, y, size, color, strokeWidth = 1.85) {
  const d = ICONS[name] || ICONS.box;
  const scale = size / 24;
  return `<g transform="translate(${x},${y}) scale(${scale.toFixed(4)})" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
}

function svgDefs(t, idPrefix, extra = '') {
  const arrowColors = {
    default: t.edgeDefault,
    strong: t.edgeStrong,
    violet: t.accents.violet.ink,
    amber: t.accents.amber.ink,
    coral: t.accents.coral.ink,
    emerald: t.accents.emerald.ink,
    sky: t.accents.sky.ink,
    indigo: t.accents.indigo.ink,
  };
  const markers = Object.entries(arrowColors).map(([k, color]) => `
    <marker id="${idPrefix}-arr-${k}" viewBox="0 0 10 10" refX="8.2" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
      <path d="M1 1.5 L8.8 5 L1 8.5 L2.7 5 Z" fill="${color}"/>
    </marker>
    <marker id="${idPrefix}-open-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
      <path d="M1.5 1.8 L8.2 5 L1.5 8.2" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  `).join('');

  return `<defs>
    <pattern id="${idPrefix}-dots" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="10" cy="10" r="1" fill="${t.canvasDot}" opacity="0.5"/>
    </pattern>
    <filter id="${idPrefix}-shadow-sm" x="-12%" y="-14%" width="124%" height="136%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.4" flood-color="${t.shadowColor}" flood-opacity="${t.shadowSm1}"/>
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="${t.shadowColor}" flood-opacity="${t.shadowSm2}"/>
    </filter>
    <filter id="${idPrefix}-shadow-md" x="-16%" y="-16%" width="132%" height="142%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="${t.shadowColor}" flood-opacity="${t.shadowMd1}"/>
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="${t.shadowColor}" flood-opacity="${t.shadowMd2}"/>
    </filter>
    ${markers}
    ${extra}
  </defs>`;
}

function wrapSvg({ width, height, title, theme = 'light', idPrefix = 'an2', extraDefs = '', body, bgOverride, noDots = false }) {
  const t = THEMES[theme];
  const bg = bgOverride ?? t.canvas;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT_SANS}" role="img" aria-label="${esc(title)}">
  <title>${esc(title)}</title>
  ${svgDefs(t, idPrefix, extraDefs)}
  <rect width="${width}" height="${height}" fill="${bg}" rx="0"/>
  ${noDots ? '' : `<rect width="${width}" height="${height}" fill="url(#${idPrefix}-dots)"/>`}
  ${body}
</svg>
`;
}

// Helper: rounded orthogonal path from waypoints
function roundedOrthPath(pts, radius = 8) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    if (i < pts.length - 1) {
      const next = pts[i + 1];
      const dx1 = curr[0] - prev[0], dy1 = curr[1] - prev[1];
      const dx2 = next[0] - curr[0], dy2 = next[1] - curr[1];
      const l1 = Math.hypot(dx1, dy1), l2 = Math.hypot(dx2, dy2);
      const r = Math.min(radius, l1 / 2, l2 / 2);
      if (r > 0.5) {
        const p1x = curr[0] - (dx1 / l1) * r;
        const p1y = curr[1] - (dy1 / l1) * r;
        const p2x = curr[0] + (dx2 / l2) * r;
        const p2y = curr[1] + (dy2 / l2) * r;
        d += ` L ${p1x.toFixed(1)} ${p1y.toFixed(1)} Q ${curr[0]} ${curr[1]} ${p2x.toFixed(1)} ${p2y.toFixed(1)}`;
        continue;
      }
    }
    d += ` L ${curr[0]} ${curr[1]}`;
  }
  return d;
}

// Helper: elevated Anemone v2 icon-badged card
function drawCard(t, idPrefix, {
  x, y, w, h, title, tech, desc, desc2, icon = 'server', accent = 'teal',
  external = false, provider, topCap = false, badgeText,
}) {
  const a = t.accents[accent] || t.accents.teal;
  const fill = external ? t.cardExternal : t.card;
  const border = external ? t.borderStrong : t.borderSubtle;
  const dash = external ? ` stroke-dasharray="5 4"` : '';
  const clipId = `${idPrefix}-clip-${Math.round(x)}-${Math.round(y)}`;

  let out = `<g filter="url(#${idPrefix}-shadow-sm)">`;
  if (topCap) {
    out += `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/></clipPath>`;
  }
  out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${border}" stroke-width="1.25"${dash}/>`;
  if (topCap) {
    out += `<rect x="${x}" y="${y}" width="${w}" height="3" fill="${a.ink}" clip-path="url(#${clipId})" opacity="0.88"/>`;
  }

  // Icon squircle 28x28
  const ix = x + 12, iy = y + 12;
  out += `<rect x="${ix}" y="${iy}" width="28" height="28" rx="7" fill="${a.badge}" stroke="${a.border}" stroke-width="0.75"/>`;
  out += renderIcon(icon, ix + 6, iy + 6, 16, a.ink, 1.85);

  // Provider or micro badge top-right
  const tag = provider || badgeText;
  if (tag) {
    const pa = t.accents[tag.toLowerCase()] || a;
    const tw = Math.max(30, tag.length * 6.4 + 12);
    out += `<rect x="${x + w - tw - 10}" y="${y + 11}" width="${tw}" height="17" rx="4.5" fill="${pa.badge}" stroke="${pa.border}" stroke-width="0.75"/>`;
    out += `<text x="${x + w - tw / 2 - 10}" y="${y + 22.8}" font-family="${FONT_MONO}" font-size="9" font-weight="600" fill="${pa.ink}" text-anchor="middle">${esc(tag)}</text>`;
  }

  // Title
  const tx = x + 50;
  out += `<text x="${tx}" y="${y + 24.5}" font-size="13" font-weight="600" fill="${t.inkPrimary}" letter-spacing="-0.01em">${esc(title)}</text>`;

  // Tech pill
  if (tech) {
    const pw = Math.min(w - 60, tech.length * 6.1 + 14);
    out += `<rect x="${tx}" y="${y + 30.5}" width="${pw}" height="17" rx="4.5" fill="${t.pill}" stroke="${t.pillBorder}" stroke-width="0.75"/>`;
    out += `<text x="${tx + 7}" y="${y + 42}" font-family="${FONT_MONO}" font-size="9.5" font-weight="500" fill="${t.inkSecondary}">${esc(tech)}</text>`;
  }

  // Description
  if (desc) {
    const dy = tech ? y + 61 : y + 43;
    out += `<text x="${x + 14}" y="${dy}" font-size="11" font-weight="400" fill="${t.inkSecondary}">${esc(desc)}</text>`;
    if (desc2) {
      out += `<text x="${x + 14}" y="${dy + 14.5}" font-size="11" font-weight="400" fill="${t.inkSecondary}">${esc(desc2)}</text>`;
    }
  }
  out += `</g>`;
  return out;
}

// Helper: layered zone container with top-left anchored header pill
function drawZone(t, {
  x, y, w, h, title, kind, icon = 'layers', level = 1, dashed = true, accent = 'slate',
}) {
  const a = t.accents[accent] || t.accents.slate;
  const fill = level === 1 ? t.zoneL1 : t.zoneL2;
  const stroke = accent === 'slate' ? t.borderZone : a.border;
  const dash = dashed ? ` stroke-dasharray="6 4"` : '';
  const pillW = Math.max(110, title.length * 6.9 + (kind ? kind.length * 5.6 + 22 : 0) + 34);
  const px = x + 14, py = y - 12;

  let out = `<g>`;
  out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" fill-opacity="0.86" stroke="${stroke}" stroke-width="1.25"${dash}/>`;
  // Header pill straddling top border
  out += `<rect x="${px}" y="${py}" width="${pillW}" height="24" rx="7" fill="${t.card}" stroke="${stroke}" stroke-width="1"/>`;
  out += renderIcon(icon, px + 7, py + 5, 14, a.ink, 1.8);
  out += `<text x="${px + 26}" y="${py + 15.8}" font-size="11.5" font-weight="600" fill="${t.inkPrimary}">${esc(title)}</text>`;
  if (kind) {
    const kx = px + 32 + title.length * 6.6;
    out += `<text x="${kx}" y="${py + 15.3}" font-family="${FONT_MONO}" font-size="9" font-weight="600" fill="${a.ink}" letter-spacing="0.04em">${esc(kind)}</text>`;
  }
  out += `</g>`;
  return out;
}

// Helper: edge + pill label
function drawEdge(t, idPrefix, {
  points, colorKey = 'default', dashed = false, dotted = false, open = false,
  width = 1.65, label, proto, labelPos,
}) {
  const colorMap = {
    default: t.edgeDefault,
    strong: t.edgeStrong,
    violet: t.accents.violet.ink,
    amber: t.accents.amber.ink,
    coral: t.accents.coral.ink,
    emerald: t.accents.emerald.ink,
    sky: t.accents.sky.ink,
    indigo: t.accents.indigo.ink,
  };
  const stroke = colorMap[colorKey] || t.edgeDefault;
  const dashAttr = dashed ? ` stroke-dasharray="5 4"` : dotted ? ` stroke-dasharray="2 3"` : '';
  const mType = open ? 'open' : 'arr';
  const d = roundedOrthPath(points, 8);

  let out = `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dashAttr} marker-end="url(#${idPrefix}-${mType}-${colorKey})"/>`;

  if (label || proto) {
    const [lx, ly] = labelPos || [
      (points[0][0] + points[points.length - 1][0]) / 2,
      (points[0][1] + points[points.length - 1][1]) / 2,
    ];
    const lblText = label || '';
    const protoText = proto ? ` · ${proto}` : '';
    const pw = Math.max(46, lblText.length * 6.0 + (proto ? proto.length * 5.6 + 14 : 0) + 16);
    const ph = 20;
    const accentBadge = colorKey !== 'default' && colorKey !== 'strong' ? t.accents[colorKey] : null;
    const pillFill = accentBadge ? accentBadge.soft : t.card;
    const pillStroke = accentBadge ? accentBadge.border : t.borderSubtle;
    const textFill = accentBadge ? accentBadge.ink : t.inkPrimary;
    out += `<g>`;
    out += `<rect x="${(lx - pw / 2).toFixed(1)}" y="${(ly - ph / 2).toFixed(1)}" width="${pw.toFixed(1)}" height="${ph}" rx="6" fill="${pillFill}" fill-opacity="0.96" stroke="${pillStroke}" stroke-width="0.9"/>`;
    if (proto && label) {
      out += `<text x="${lx}" y="${ly + 3.8}" font-size="10.5" font-weight="500" fill="${textFill}" text-anchor="middle">${esc(lblText)}<tspan font-family="${FONT_MONO}" font-size="9.2" fill="${t.inkMuted}">${esc(protoText)}</tspan></text>`;
    } else if (proto) {
      out += `<text x="${lx}" y="${ly + 3.6}" font-family="${FONT_MONO}" font-size="9.5" font-weight="600" fill="${textFill}" text-anchor="middle">${esc(proto)}</text>`;
    } else {
      out += `<text x="${lx}" y="${ly + 3.8}" font-size="10.5" font-weight="500" fill="${textFill}" text-anchor="middle">${esc(lblText)}</text>`;
    }
    out += `</g>`;
  }
  return out;
}

// Helper: header banner for mockups
function drawBanner(t, x, y, eyebrow, title, subtitle) {
  return `
    <text x="${x}" y="${y}" font-family="${FONT_MONO}" font-size="10" font-weight="600" fill="${t.accents.coral.ink}" letter-spacing="0.08em">${esc(eyebrow)}</text>
    <text x="${x}" y="${y + 22}" font-size="19" font-weight="700" fill="${t.inkPrimary}" letter-spacing="-0.02em">${esc(title)}</text>
    <text x="${x}" y="${y + 39}" font-size="12" fill="${t.inkSecondary}">${esc(subtitle)}</text>
  `;
}

// ============================================================================
// 1. SYMBOL KIT SPECIMEN SHEET (Light & Dark)
// ============================================================================
function generateSymbolKit(theme) {
  const t = THEMES[theme];
  const id = `sk-${theme[0]}`;
  const W = 1280, H = 980;
  let body = '';

  body += drawBanner(
    t, 36, 38,
    'CORAL ANEMONE V2 · COMPONENT & SYMBOL SPECIMEN',
    `Symbol Kit & Visual Grammar (${theme === 'light' ? 'Studio Paper Light' : 'Abyssal Slate Dark'})`,
    'Neutral elevated cards, 28px semantic icon squircles, 3-tier typography, structured schema headers, and tactile Excalidraw-class sketch primitives'
  );

  // Section labels helper
  const sec = (x, y, label) =>
    `<text x="${x}" y="${y}" font-family="${FONT_MONO}" font-size="10.5" font-weight="600" fill="${t.inkMuted}" letter-spacing="0.08em">${esc(label)}</text>
     <line x1="${x}" y1="${y + 6}" x2="${W - 36}" y2="${y + 6}" stroke="${t.divider}" stroke-width="1"/>`;

  // ROW 1: C4 ARCHITECTURE
  body += sec(36, 108, '01 · ARCHITECTURE (C4 & SYSTEM DESIGN)');
  body += drawCard(t, id, { x: 36, y: 126, w: 222, h: 82, title: 'Shopper', tech: 'Person', desc: 'Browses & places orders', icon: 'user', accent: 'coral' });
  body += drawCard(t, id, { x: 278, y: 126, w: 230, h: 82, title: 'Order Service', tech: 'Go · gRPC', desc: 'Validates cart & writes ledger', icon: 'server', accent: 'teal', topCap: true });
  body += drawCard(t, id, { x: 528, y: 126, w: 222, h: 82, title: 'Orders DB', tech: 'PostgreSQL 16', desc: 'Primary ACID ledger', icon: 'database', accent: 'amber' });
  body += drawCard(t, id, { x: 770, y: 126, w: 222, h: 82, title: 'Order Events', tech: 'Kafka Topic', desc: 'Async domain stream', icon: 'queue', accent: 'violet' });
  body += drawCard(t, id, { x: 1012, y: 126, w: 232, h: 82, title: 'Stripe API', tech: 'HTTPS · REST', desc: 'Card capture & refunds', icon: 'card', accent: 'slate', external: true, badgeText: 'EXT' });

  // ROW 2: CLOUD INFRASTRUCTURE
  body += sec(36, 240, '02 · CLOUD INFRASTRUCTURE (PROVIDER-BADGED CARDS)');
  body += drawCard(t, id, { x: 36, y: 258, w: 222, h: 82, title: 'Edge WAF', tech: 'CloudFront · TLS', desc: 'DDoS & rate limiting', icon: 'shield', accent: 'sky', provider: 'AWS' });
  body += drawCard(t, id, { x: 278, y: 258, w: 230, h: 82, title: 'EKS Workload', tech: 'Kubernetes 1.31', desc: 'Auto-scaled API pods', icon: 'k8s', accent: 'indigo', provider: 'AWS' });
  body += drawCard(t, id, { x: 528, y: 258, w: 222, h: 82, title: 'Cloud Run Job', tech: 'Serverless', desc: 'Event-driven worker', icon: 'bolt', accent: 'teal', provider: 'GCP' });
  body += drawCard(t, id, { x: 770, y: 258, w: 222, h: 82, title: 'Blob Archive', tech: 'Hot / Cool Tier', desc: 'Immutable audit objects', icon: 'bucket', accent: 'amber', provider: 'Azure' });
  body += drawCard(t, id, { x: 1012, y: 258, w: 232, h: 82, title: 'Observability', tech: 'OTel · Traces', desc: 'SLOs, logs & metrics', icon: 'activity', accent: 'emerald' });

  // ROW 3: AI/ML & DATA ENGINEERING (Replaces unreadable clipart!)
  body += sec(36, 372, '03 · AI / ML & DATA ENGINEERING (REPLACING CLIPART-OVER-TEXT SHAPES)');
  body += drawCard(t, id, { x: 36, y: 390, w: 222, h: 82, title: 'Frontier LLM', tech: 'Tool Calling', desc: 'Reasoning & synthesis', icon: 'sparkle', accent: 'indigo', topCap: true });
  body += drawCard(t, id, { x: 278, y: 390, w: 230, h: 82, title: 'Research Agent', tech: 'ReAct Loop', desc: 'Plans & invokes tools', icon: 'bot', accent: 'violet' });
  body += drawCard(t, id, { x: 528, y: 390, w: 222, h: 82, title: 'Vector Store', tech: 'pgvector · HNSW', desc: '1536-dim embeddings', icon: 'database', accent: 'amber' });
  body += drawCard(t, id, { x: 770, y: 390, w: 222, h: 82, title: 'Safety Guardrail', tech: 'Policy Gate', desc: 'PII & prompt-injection', icon: 'shield', accent: 'emerald' });
  body += drawCard(t, id, { x: 1012, y: 390, w: 232, h: 82, title: 'Event Stream', tech: 'Flink · Iceberg', desc: 'Windowed CDC lakehouse', icon: 'stream', accent: 'sky' });

  // ROW 4: ERD, UML CLASS, CODE & STATE
  body += sec(36, 504, '04 · STRUCTURED CARDS (ERD · UML CLASS · CODE · UML STATE)');

  // ERD Entity card
  const ex = 36, ey = 522, ew = 268, eh = 152;
  body += `<g filter="url(#${id}-shadow-sm)">
    <rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" rx="10" fill="${t.card}" stroke="${t.borderSubtle}" stroke-width="1.25"/>
    <path d="M ${ex + 10} ${ey} H ${ex + ew - 10} Q ${ex + ew} ${ey} ${ex + ew} ${ey + 10} V ${ey + 36} H ${ex} V ${ey + 10} Q ${ex} ${ey} ${ex + 10} ${ey} Z" fill="${t.accents.indigo.head}"/>
    <line x1="${ex}" y1="${ey + 36}" x2="${ex + ew}" y2="${ey + 36}" stroke="${t.accents.indigo.border}" stroke-width="1"/>
    ${renderIcon('table', ex + 12, ey + 10, 16, t.accents.indigo.ink)}
    <text x="${ex + 35}" y="${ey + 22.5}" font-size="13" font-weight="600" fill="${t.inkPrimary}">orders</text>
    <text x="${ex + ew - 12}" y="${ey + 22}" font-family="${FONT_MONO}" font-size="9" font-weight="600" fill="${t.accents.indigo.ink}" text-anchor="end">TABLE</text>
  `;
  const erdRows = [
    ['PK', 'amber', 'id', 'uuid'],
    ['FK', 'sky', 'customer_id', 'uuid'],
    ['', '', 'status', 'order_state'],
    ['', '', 'total_cents', 'bigint'],
  ];
  erdRows.forEach(([badge, bc, col, dtype], idx) => {
    const ry = ey + 36 + idx * 28;
    if (idx % 2 === 1) body += `<rect x="${ex + 1}" y="${ry}" width="${ew - 2}" height="28" fill="${t.rowAlt}"/>`;
    if (badge) {
      const ba = t.accents[bc];
      body += `<rect x="${ex + 12}" y="${ry + 6}" width="24" height="16" rx="3.5" fill="${ba.badge}" stroke="${ba.border}" stroke-width="0.75"/>`;
      body += `<text x="${ex + 24}" y="${ry + 17.2}" font-family="${FONT_MONO}" font-size="8.5" font-weight="700" fill="${ba.ink}" text-anchor="middle">${badge}</text>`;
    }
    body += `<text x="${ex + 44}" y="${ry + 18}" font-size="11.5" font-weight="${badge === 'PK' ? '600' : '400'}" fill="${t.inkPrimary}">${col}</text>`;
    body += `<text x="${ex + ew - 12}" y="${ry + 18}" font-family="${FONT_MONO}" font-size="10.5" fill="${t.inkSecondary}" text-anchor="end">${dtype}</text>`;
  });
  body += `</g>`;

  // UML Interface card
  const ux = 328, uy = 522, uw = 276, uh = 152;
  body += `<g filter="url(#${id}-shadow-sm)">
    <rect x="${ux}" y="${uy}" width="${uw}" height="${uh}" rx="10" fill="${t.card}" stroke="${t.borderSubtle}" stroke-width="1.25"/>
    <path d="M ${ux + 10} ${uy} H ${ux + uw - 10} Q ${ux + uw} ${uy} ${ux + uw} ${uy + 10} V ${uy + 48} H ${ux} V ${uy + 10} Q ${ux} ${uy} ${ux + 10} ${uy} Z" fill="${t.accents.teal.head}"/>
    <line x1="${ux}" y1="${uy + 48}" x2="${ux + uw}" y2="${uy + 48}" stroke="${t.accents.teal.border}" stroke-width="1"/>
    <rect x="${ux + 12}" y="${uy + 8}" width="78" height="15" rx="4" fill="${t.accents.teal.badge}" stroke="${t.accents.teal.border}" stroke-width="0.7"/>
    <text x="${ux + 51}" y="${uy + 18.8}" font-family="${FONT_MONO}" font-size="8.8" font-weight="600" fill="${t.accents.teal.ink}" text-anchor="middle">«interface»</text>
    <text x="${ux + 12}" y="${uy + 39}" font-size="13.5" font-weight="600" fill="${t.inkPrimary}">PaymentGateway</text>
    <text x="${ux + 14}" y="${uy + 69}" font-family="${FONT_MONO}" font-size="11" fill="${t.accents.emerald.ink}">+<tspan fill="${t.inkPrimary}"> charge(order: Order): Receipt</tspan></text>
    <text x="${ux + 14}" y="${uy + 91}" font-family="${FONT_MONO}" font-size="11" fill="${t.accents.emerald.ink}">+<tspan fill="${t.inkPrimary}"> refund(id: UUID): Status</tspan></text>
    <line x1="${ux + 12}" y1="${uy + 106}" x2="${ux + uw - 12}" y2="${uy + 106}" stroke="${t.divider}" stroke-width="1"/>
    <text x="${ux + 14}" y="${uy + 127}" font-family="${FONT_MONO}" font-size="11" fill="${t.accents.amber.ink}">#<tspan fill="${t.inkSecondary}"> timeoutMs: number = 5000</tspan></text>
  </g>`;

  // Code Symbol Cards
  const cx = 628, cy = 522;
  body += `<g filter="url(#${id}-shadow-sm)">
    <rect x="${cx}" y="${cy}" width="260" height="68" rx="10" fill="${t.card}" stroke="${t.borderSubtle}" stroke-width="1.25"/>
    <rect x="${cx + 12}" y="${cy + 13}" width="32" height="22" rx="5.5" fill="${t.accents.teal.badge}" stroke="${t.accents.teal.border}" stroke-width="0.75"/>
    <text x="${cx + 28}" y="${cy + 27.5}" font-family="${FONT_MONO}" font-size="10.5" font-weight="700" fill="${t.accents.teal.ink}" text-anchor="middle">fn</text>
    <text x="${cx + 54}" y="${cy + 28}" font-family="${FONT_MONO}" font-size="12.5" font-weight="600" fill="${t.inkPrimary}">applyParrotfish()</text>
    <text x="${cx + 14}" y="${cy + 53}" font-family="${FONT_MONO}" font-size="10" fill="${t.inkSecondary}">packages/render/src/parrotfish.ts</text>
  </g>`;

  // UML State Card (Recommended visual promotion)
  body += `<g filter="url(#${id}-shadow-sm)">
    <circle cx="${cx + 18}" cy="${cy + 116}" r="9" fill="${t.inkPrimary}"/>
    <path d="M ${cx + 27} ${cy + 116} H ${cx + 58}" stroke="${t.edgeDefault}" stroke-width="1.65" marker-end="url(#${id}-arr-default)"/>
    <rect x="${cx + 60}" y="${cy + 86}" width="150" height="62" rx="14" fill="${t.card}" stroke="${t.accents.indigo.border}" stroke-width="1.4"/>
    <text x="${cx + 135}" y="${cy + 106}" font-size="12.5" font-weight="600" fill="${t.inkPrimary}" text-anchor="middle">Authorizing</text>
    <line x1="${cx + 72}" y1="${cy + 115}" x2="${cx + 198}" y2="${cy + 115}" stroke="${t.divider}" stroke-width="1"/>
    <text x="${cx + 74}" y="${cy + 133}" font-family="${FONT_MONO}" font-size="9.5" fill="${t.inkSecondary}">entry / lockFunds()</text>
    <path d="M ${cx + 210} ${cy + 116} H ${cx + 236}" stroke="${t.edgeDefault}" stroke-width="1.65" marker-end="url(#${id}-arr-default)"/>
    <circle cx="${cx + 248}" cy="${cy + 116}" r="10.5" fill="none" stroke="${t.inkPrimary}" stroke-width="1.75"/>
    <circle cx="${cx + 248}" cy="${cy + 116}" r="6" fill="${t.inkPrimary}"/>
  </g>`;

  // BPMN & Flowchart Mini-Strip
  const bx = 916, by = 522;
  body += `<g filter="url(#${id}-shadow-sm)">
    <!-- BPMN Start -->
    <circle cx="${bx + 24}" cy="${by + 28}" r="18" fill="${t.accents.emerald.head}" stroke="${t.accents.emerald.ink}" stroke-width="2"/>
    <text x="${bx + 24}" y="${by + 60}" font-size="10.5" font-weight="500" fill="${t.inkSecondary}" text-anchor="middle">Start</text>
    <!-- BPMN Task -->
    <rect x="${bx + 62}" y="${by + 6}" width="136" height="46" rx="9" fill="${t.card}" stroke="${t.borderSubtle}" stroke-width="1.25"/>
    ${renderIcon('user', bx + 72, by + 15, 14, t.accents.indigo.ink)}
    <text x="${bx + 92}" y="${by + 33}" font-size="12" font-weight="600" fill="${t.inkPrimary}">Review Claim</text>
    <!-- BPMN XOR Gateway -->
    <polygon points="${bx + 236},${by + 4} ${bx + 260},${by + 28} ${bx + 236},${by + 52} ${bx + 212},${by + 28}" fill="${t.accents.amber.head}" stroke="${t.accents.amber.ink}" stroke-width="1.75"/>
    <path d="M ${bx + 229} ${by + 21} L ${bx + 243} ${by + 35} M ${bx + 243} ${by + 21} L ${bx + 229} ${by + 35}" stroke="${t.accents.amber.ink}" stroke-width="2.2" stroke-linecap="round"/>
    <!-- BPMN End -->
    <circle cx="${bx + 302}" cy="${by + 28}" r="18" fill="${t.accents.coral.head}" stroke="${t.accents.coral.ink}" stroke-width="3.2"/>
    <text x="${bx + 302}" y="${by + 60}" font-size="10.5" font-weight="500" fill="${t.inkSecondary}" text-anchor="middle">End</text>
    <!-- Flowchart Terminal + Decision -->
    <rect x="${bx + 6}" y="${by + 92}" width="104" height="38" rx="19" fill="${t.accents.emerald.head}" stroke="${t.accents.emerald.border}" stroke-width="1.4"/>
    <text x="${bx + 58}" y="${by + 115}" font-size="12" font-weight="600" fill="${t.accents.emerald.ink}" text-anchor="middle">Checkout</text>
    <polygon points="${bx + 194},${by + 78} ${bx + 252},${by + 111} ${bx + 194},${by + 144} ${bx + 136},${by + 111}" fill="${t.card}" stroke="${t.accents.amber.ink}" stroke-width="1.5"/>
    <text x="${bx + 194}" y="${by + 115}" font-size="11.5" font-weight="600" fill="${t.inkPrimary}" text-anchor="middle">In stock?</text>
    <rect x="${bx + 268}" y="${by + 97}" width="54" height="24" rx="12" fill="${t.accents.emerald.badge}" stroke="${t.accents.emerald.border}" stroke-width="0.9"/>
    <text x="${bx + 295}" y="${by + 113}" font-size="10.5" font-weight="600" fill="${t.accents.emerald.ink}" text-anchor="middle">Yes →</text>
  </g>`;

  // ROW 5: CONTAINERS, EDGES & TACTILE SKETCH REGISTER (EXCALIDRAW PARITY)
  body += sec(36, 706, '05 · LAYERED CONTAINERS, SEMANTIC EDGES & TACTILE SKETCH REGISTER (EXCALIDRAW PARITY)');

  // Layered container demo
  body += drawZone(t, { x: 36, y: 734, w: 356, h: 196, title: 'Production VPC', kind: '10.0.0.0/16', icon: 'cloud', level: 1, dashed: false, accent: 'indigo' });
  body += drawZone(t, { x: 56, y: 778, w: 316, h: 134, title: 'Private App Subnet', kind: 'PRIVATE', icon: 'lock', level: 2, dashed: true, accent: 'teal' });
  body += drawCard(t, id, { x: 76, y: 812, w: 276, h: 78, title: 'Checkout API', tech: 'Rust · Axum', desc: 'Idempotent order creation', icon: 'server', accent: 'teal' });

  // Edge vocabulary panel
  const rx = 420, ry = 734, rw = 368, rh = 196;
  body += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="12" fill="${t.card}" stroke="${t.borderSubtle}" stroke-width="1.2"/>`;
  body += `<text x="${rx + 16}" y="${ry + 24}" font-family="${FONT_MONO}" font-size="10" font-weight="600" fill="${t.inkMuted}">CONNECTOR &amp; PILL VOCABULARY</text>`;
  body += drawEdge(t, id, { points: [[rx + 18, ry + 54], [rx + 346, ry + 54]], colorKey: 'strong', width: 1.8, label: 'Synchronous Call', proto: 'HTTPS', labelPos: [rx + 178, ry + 54] });
  body += drawEdge(t, id, { points: [[rx + 18, ry + 94], [rx + 346, ry + 94]], colorKey: 'violet', dashed: true, open: true, label: 'Async Domain Event', proto: 'Kafka', labelPos: [rx + 178, ry + 94] });
  body += drawEdge(t, id, { points: [[rx + 18, ry + 134], [rx + 346, ry + 134]], colorKey: 'amber', label: 'Reads / Writes', proto: 'SQL', labelPos: [rx + 178, ry + 134] });
  body += drawEdge(t, id, { points: [[rx + 18, ry + 172], [rx + 346, ry + 172]], colorKey: 'coral', dashed: true, label: 'Error / Reject', proto: '4xx/5xx', labelPos: [rx + 178, ry + 172] });

  // Tactile Sketch Register preview (Excalidraw feel)
  const sx = 816, sy = 734, sw = 428, sh = 196;
  const skPaper = theme === 'light' ? '#FAF8F4' : '#181613';
  const skBorder = theme === 'light' ? '#DDD6C8' : '#35312B';
  const skInk = theme === 'light' ? '#1E293B' : '#F3F0E8';
  const skSky = theme === 'light' ? '#E0F2FE' : '#162A3A';
  const skButter = theme === 'light' ? '#FEF3C7' : '#3A2F17';
  const skMint = theme === 'light' ? '#DCFCE7' : '#162E22';
  body += `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="12" fill="${skPaper}" stroke="${skBorder}" stroke-width="1.25"/>`;
  body += `<text x="${sx + 16}" y="${sy + 24}" font-family="${FONT_MONO}" font-size="10" font-weight="600" fill="${t.inkMuted}">ANEMONE SKETCH REGISTER (EXCALIDRAW PARITY)</text>`;
  // Hand-drawn box 1
  body += `<path d="M ${sx + 26} ${sy + 50} Q ${sx + 84} ${sy + 47} ${sx + 146} ${sy + 50} Q ${sx + 152} ${sy + 76} ${sx + 148} ${sy + 106} Q ${sx + 88} ${sy + 109} ${sx + 24} ${sy + 105} Q ${sx + 20} ${sy + 76} ${sx + 26} ${sy + 50} Z" fill="${skSky}" stroke="${skInk}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  body += `<text x="${sx + 86}" y="${sy + 84}" font-family="${FONT_HAND}" font-size="21" font-weight="600" fill="${skInk}" text-anchor="middle">Rough Idea</text>`;
  // Curved hand-drawn arrow
  body += `<path d="M ${sx + 154} ${sy + 78} Q ${sx + 188} ${sy + 68} ${sx + 220} ${sy + 78}" fill="none" stroke="${skInk}" stroke-width="2" stroke-linecap="round"/>`;
  body += `<path d="M ${sx + 211} ${sy + 71} L ${sx + 222} ${sy + 78} L ${sx + 212} ${sy + 85}" fill="none" stroke="${skInk}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  // Hand-drawn box 2
  body += `<path d="M ${sx + 230} ${sy + 50} Q ${sx + 305} ${sy + 48} ${sx + 388} ${sy + 51} Q ${sx + 392} ${sy + 78} ${sx + 387} ${sy + 106} Q ${sx + 308} ${sy + 109} ${sx + 228} ${sy + 105} Q ${sx + 224} ${sy + 76} ${sx + 230} ${sy + 50} Z" fill="${skMint}" stroke="${skInk}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  body += `<text x="${sx + 309}" y="${sy + 84}" font-family="${FONT_HAND}" font-size="21" font-weight="600" fill="${skInk}" text-anchor="middle">Shippable Spec</text>`;
  // Sticky note
  body += `<g transform="rotate(-1.2 ${sx + 214} ${sy + 154})" filter="url(#${id}-shadow-sm)">
    <path d="M ${sx + 56} ${sy + 128} H ${sx + 372} V ${sy + 178} H ${sx + 56} Z" fill="${skButter}" stroke="${skInk}" stroke-width="1.5" stroke-linejoin="round"/>
    <text x="${sx + 214}" y="${sy + 160}" font-family="${FONT_HAND}" font-size="21" font-weight="600" fill="${skInk}" text-anchor="middle">Warm ink + highlighter wash, zero drift!</text>
  </g>`;

  const svg = wrapSvg({ width: W, height: H, title: `Coral Anemone v2 Symbol Kit (${theme})`, theme, idPrefix: id, extraDefs: CAVEAT_FONT_CSS, body });
  fs.writeFileSync(path.join(SYMBOLS_DIR, `anemone-v2-symbol-kit-${theme}.svg`), svg);
}

// ============================================================================
// 2. BEFORE vs AFTER COMPARISON (Anemone v1 0.2.14 vs Anemone v2)
// ============================================================================
function generateBeforeAfter() {
  const t = THEMES.light;
  const id = 'cmp';
  const W = 1320, H = 640;
  let body = '';

  body += drawBanner(
    t, 36, 36,
    'SIDE-BY-SIDE VISUAL AUDIT · SAME LAYOUT, SAME ROUTING, SAME CORAL SOURCE',
    'Anemone v1 (0.2.14 Current) vs. Anemone v2 (Figma / IcePanel Parity)',
    'Demonstrating pure presentation-layer elevation: zero change to node coordinates, ports, or orthogonal edge paths'
  );

  // LEFT PANEL: ANEMONE v1 (faithful reproduction of parrotfishCore.ts 0.2.14!)
  const lx = 36, ly = 104, pw = 608, ph = 500;
  body += `<rect x="${lx}" y="${ly}" width="${pw}" height="${ph}" rx="14" fill="#FCFCFD" stroke="#CBD5E1" stroke-width="1.25"/>`;
  body += `<rect x="${lx + 16}" y="${ly + 14}" width="218" height="24" rx="6" fill="#FEE2E2" stroke="#FCA5A5" stroke-width="1"/>`;
  body += `<text x="${lx + 125}" y="${ly + 29.8}" font-family="${FONT_MONO}" font-size="10" font-weight="700" fill="#991B1B" text-anchor="middle">BEFORE · ANEMONE V1 (0.2.14)</text>`;

  // v1 Container (flat dashed wireframe, bare centered text)
  body += `<rect x="${lx + 216}" y="${ly + 64}" width="368" height="292" rx="8" fill="#F4F7FB" stroke="#94A3B8" stroke-width="1.5" stroke-dasharray="6 4"/>`;
  body += `<text x="${lx + 400}" y="${ly + 82}" font-size="14" font-weight="600" fill="#334155" text-anchor="middle">E-Commerce Platform</text>`;

  // v1 Nodes (Tailwind-50 fill + 700 stroke + 3.5px left stripe + monolithic 14px text)
  const v1Node = (x, y, w, h, fill, stroke, accent, textCol, lines, dashed = false) => {
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.7"${dashed ? ' stroke-dasharray="6 3"' : ''}/>`;
    s += `<rect x="${x + 1.5}" y="${y + 7}" width="3.5" height="${h - 14}" rx="1.75" fill="${accent}"/>`;
    lines.forEach((ln, i) => {
      s += `<text x="${x + w / 2 + 2}" y="${y + 24 + i * 18}" font-size="13.5" font-weight="600" fill="${i === 0 ? textCol : '#4B5B70'}" text-anchor="middle">${esc(ln)}</text>`;
    });
    return s;
  };
  body += v1Node(lx + 24, ly + 138, 134, 72, '#FFF1F2', '#BE123C', '#E11D48', '#4C0519', ['Shopper', 'Buys online']);
  body += v1Node(lx + 236, ly + 104, 152, 78, '#F0FDFA', '#0F766E', '#0D9488', '#0F2933', ['Web Storefront', '[React SPA]', 'Catalog UI']);
  body += v1Node(lx + 414, ly + 104, 150, 78, '#F0FDFA', '#0F766E', '#0D9488', '#0F2933', ['Order Service', '[Go / gRPC]', 'Order API']);
  body += v1Node(lx + 236, ly + 252, 152, 74, '#F5F3FF', '#6D28D9', '#7C3AED', '#2E1065', ['Event Bus', '[Kafka]', 'Order events']);
  body += v1Node(lx + 414, ly + 252, 150, 74, '#FFFBEB', '#B45309', '#D97706', '#451A03', ['Orders DB', '[PostgreSQL]', 'Ledger']);
  body += v1Node(lx + 414, ly + 392, 150, 68, '#F8FAFC', '#64748B', '#64748B', '#334155', ['Stripe', 'Card payments'], true);

  // v1 Edges (sharp box labels)
  const v1Edge = (pts, stroke, lbl, lx0, ly0, dashed = false) => {
    const d = roundedOrthPath(pts, 4);
    const rw0 = lbl.length * 7.2 + 8;
    return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.6"${dashed ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#${id}-arr-default)"/>
      <rect x="${lx0 - rw0 / 2}" y="${ly0 - 9}" width="${rw0}" height="17" fill="#FCFCFD"/>
      <text x="${lx0}" y="${ly0 + 3}" font-size="12" font-weight="600" fill="${stroke}" text-anchor="middle">${esc(lbl)}</text>`;
  };
  body += v1Edge([[lx + 158, ly + 174], [lx + 196, ly + 174], [lx + 196, ly + 143], [lx + 236, ly + 143]], '#475569', 'HTTPS', lx + 188, ly + 156);
  body += v1Edge([[lx + 388, ly + 143], [lx + 414, ly + 143]], '#475569', 'RPC', lx + 401, ly + 128);
  body += v1Edge([[lx + 489, ly + 182], [lx + 489, ly + 252]], '#B45309', 'SQL', lx + 489, ly + 217);
  body += v1Edge([[lx + 446, ly + 182], [lx + 446, ly + 216], [lx + 312, ly + 216], [lx + 312, ly + 252]], '#6D28D9', 'event', lx + 372, ly + 216, true);
  body += v1Edge([[lx + 489, ly + 326], [lx + 489, ly + 392]], '#475569', 'charges', lx + 489, ly + 362);

  // v1 Defect callouts at bottom
  body += `<text x="${lx + 20}" y="${ly + 482}" font-size="11" fill="#991B1B">✗ 5 competing pastel fills + harsh borders   ✗ 3.5px side stripes   ✗ Monolithic 14px text   ✗ Flat wireframe zone</text>`;

  // RIGHT PANEL: ANEMONE v2 (Figma / IcePanel Parity)
  const rx = 676, ry = 104;
  body += `<rect x="${rx}" y="${ry}" width="${pw}" height="${ph}" rx="14" fill="${t.canvas}" stroke="${t.accents.indigo.border}" stroke-width="1.4"/>`;
  body += `<rect x="${rx}" y="${ry}" width="${pw}" height="${ph}" rx="14" fill="url(#${id}-dots)"/>`;
  body += `<rect x="${rx + 16}" y="${ry + 14}" width="240" height="24" rx="6" fill="${t.accents.emerald.badge}" stroke="${t.accents.emerald.border}" stroke-width="1"/>`;
  body += `<text x="${rx + 136}" y="${ry + 29.8}" font-family="${FONT_MONO}" font-size="10" font-weight="700" fill="${t.accents.emerald.ink}" text-anchor="middle">AFTER · ANEMONE V2 (PROPOSED)</text>`;

  // v2 Zone
  body += drawZone(t, { x: rx + 212, y: ry + 70, w: 376, h: 288, title: 'E-Commerce Platform', kind: 'SYSTEM', icon: 'layers', level: 1, dashed: true, accent: 'indigo' });

  // v2 Cards
  body += drawCard(t, id, { x: rx + 18, y: ry + 134, w: 146, h: 74, title: 'Shopper', tech: 'Person', desc: 'Browses & buys', icon: 'user', accent: 'coral' });
  body += drawCard(t, id, { x: rx + 228, y: ry + 102, w: 162, h: 78, title: 'Web Storefront', tech: 'React SPA', desc: 'Catalog & checkout', icon: 'browser', accent: 'sky' });
  body += drawCard(t, id, { x: rx + 414, y: ry + 102, w: 158, h: 78, title: 'Order Service', tech: 'Go · gRPC', desc: 'Order ledger API', icon: 'server', accent: 'teal', topCap: true });
  body += drawCard(t, id, { x: rx + 228, y: ry + 258, w: 162, h: 78, title: 'Event Bus', tech: 'Kafka', desc: 'Async order events', icon: 'queue', accent: 'violet' });
  body += drawCard(t, id, { x: rx + 414, y: ry + 258, w: 158, h: 78, title: 'Orders DB', tech: 'PostgreSQL', desc: 'ACID order ledger', icon: 'database', accent: 'amber' });
  body += drawCard(t, id, { x: rx + 414, y: ry + 388, w: 158, h: 72, title: 'Stripe', tech: 'HTTPS', desc: 'Card payments', icon: 'card', accent: 'slate', external: true, badgeText: 'EXT' });

  // v2 Edges
  body += drawEdge(t, id, { points: [[rx + 164, ry + 171], [rx + 194, ry + 171], [rx + 194, ry + 141], [rx + 228, ry + 141]], colorKey: 'strong', proto: 'HTTPS', labelPos: [rx + 194, ry + 114] });
  body += drawEdge(t, id, { points: [[rx + 390, ry + 141], [rx + 414, ry + 141]], colorKey: 'strong' });
  body += drawEdge(t, id, { points: [[rx + 493, ry + 180], [rx + 493, ry + 258]], colorKey: 'amber', label: 'Writes', proto: 'SQL', labelPos: [rx + 493, ry + 219] });
  body += drawEdge(t, id, { points: [[rx + 450, ry + 180], [rx + 450, ry + 219], [rx + 309, ry + 219], [rx + 309, ry + 258]], colorKey: 'violet', dashed: true, open: true, label: 'Emits', proto: 'Event', labelPos: [rx + 354, ry + 219] });
  body += drawEdge(t, id, { points: [[rx + 542, ry + 180], [rx + 542, ry + 206], [rx + 584, ry + 206], [rx + 584, ry + 424], [rx + 572, ry + 424]], colorKey: 'default', label: 'Charges', labelPos: [rx + 548, ry + 368] });

  body += `<text x="${rx + 20}" y="${ry + 482}" font-size="11" fill="#047857">✓ 60-30-10 neutral elevation   ✓ 28px icon squircles   ✓ 3-tier typography   ✓ Anchored zone &amp; edge pills</text>`;

  const svg = wrapSvg({ width: W, height: H, title: 'Coral Anemone v1 vs v2 Comparison', theme: 'light', idPrefix: id, body });
  fs.writeFileSync(path.join(DIAGRAMS_DIR, '01-before-after-comparison.svg'), svg);
}

// ============================================================================
// 3. ARCHITECTURE C4 CONTAINER DIAGRAM
// ============================================================================
function generateArchitectureC4(theme = 'light') {
  const t = THEMES[theme];
  const id = `arch-${theme[0]}`;
  const W = 1220, H = 680;
  let body = '';

  body += drawBanner(
    t, 36, 36,
    '@diagram architecture · ANEMONE V2 PRECISION',
    'E-Commerce Order Platform (C4 Container View)',
    'Elevated neutral cards, 3-tier C4 metadata (Title · Tech Pill · Description), nested trust boundary, and semantic sync/async/data flows'
  );

  // Actors left
  body += drawCard(t, id, { x: 36, y: 178, w: 196, h: 82, title: 'Customer', tech: 'Person', desc: 'Places & tracks orders', icon: 'user', accent: 'coral' });
  body += drawCard(t, id, { x: 36, y: 390, w: 196, h: 82, title: 'Support Ops', tech: 'Internal Staff', desc: 'Handles refunds & disputes', icon: 'user', accent: 'coral' });

  // System Boundary
  body += drawZone(t, { x: 286, y: 118, w: 650, h: 520, title: 'Commerce Platform', kind: 'SYSTEM BOUNDARY', icon: 'layers', level: 1, dashed: true, accent: 'indigo' });

  // Nested Edge Layer + Core Services
  body += drawZone(t, { x: 310, y: 164, w: 254, h: 320, title: 'Client & Edge Tier', kind: 'PUBLIC', icon: 'globe', level: 2, dashed: false, accent: 'sky' });
  body += drawCard(t, id, { x: 330, y: 196, w: 214, h: 84, title: 'Web Storefront', tech: 'Next.js · SSR', desc: 'Catalog, cart & checkout UI', icon: 'browser', accent: 'sky' });
  body += drawCard(t, id, { x: 330, y: 378, w: 214, h: 84, title: 'API Gateway', tech: 'Envoy · JWT', desc: 'AuthN, rate limits & routing', icon: 'gateway', accent: 'sky', topCap: true });

  // Core Services right column inside boundary
  body += drawCard(t, id, { x: 644, y: 168, w: 266, h: 86, title: 'Order Service', tech: 'Go · gRPC', desc: 'Cart validation & state machine', icon: 'server', accent: 'teal', topCap: true });
  body += drawCard(t, id, { x: 644, y: 334, w: 266, h: 86, title: 'Event Bus', tech: 'Apache Kafka', desc: 'Durable domain event topics', icon: 'queue', accent: 'violet' });
  body += drawCard(t, id, { x: 644, y: 506, w: 266, h: 86, title: 'Fulfillment Worker', tech: 'Rust · Consumer', desc: 'Dispatches shipments & emails', icon: 'gear', accent: 'teal' });

  // Orders DB bottom left inside boundary
  body += drawCard(t, id, { x: 330, y: 514, w: 214, h: 84, title: 'Orders Database', tech: 'PostgreSQL 16', desc: 'ACID ledger & outbox table', icon: 'database', accent: 'amber' });

  // External Systems right
  body += drawCard(t, id, { x: 988, y: 168, w: 196, h: 86, title: 'Stripe', tech: 'REST · HTTPS', desc: 'Card capture & 3DS', icon: 'card', accent: 'slate', external: true, badgeText: 'EXT' });
  body += drawCard(t, id, { x: 988, y: 506, w: 196, h: 86, title: 'Postmark', tech: 'SMTP · API', desc: 'Transactional receipts', icon: 'mail', accent: 'slate', external: true, badgeText: 'EXT' });

  // Clean Orthogonal Edges (zero crossings!)
  body += drawEdge(t, id, { points: [[232, 219], [330, 219]], colorKey: 'strong', label: 'Browses', proto: 'HTTPS', labelPos: [272, 219] });
  body += drawEdge(t, id, { points: [[232, 431], [330, 431]], colorKey: 'default', label: 'Admin', proto: 'HTTPS', labelPos: [272, 431] });
  body += drawEdge(t, id, { points: [[437, 280], [437, 378]], colorKey: 'strong', label: 'Submits', proto: 'JSON', labelPos: [437, 329] });
  body += drawEdge(t, id, { points: [[544, 408], [588, 408], [588, 200], [644, 200]], colorKey: 'strong', label: 'Creates', proto: 'gRPC', labelPos: [588, 174] });
  body += drawEdge(t, id, { points: [[644, 234], [616, 234], [616, 556], [544, 556]], colorKey: 'amber', label: 'Writes', proto: 'SQL', labelPos: [616, 492] });
  body += drawEdge(t, id, { points: [[777, 254], [777, 334]], colorKey: 'violet', dashed: true, open: true, label: 'OrderPlaced', proto: 'Avro', labelPos: [777, 294] });
  body += drawEdge(t, id, { points: [[777, 420], [777, 506]], colorKey: 'violet', dashed: true, open: true, label: 'Consumes', proto: 'Async', labelPos: [777, 463] });
  body += drawEdge(t, id, { points: [[910, 211], [988, 211]], colorKey: 'default', label: 'Charges', proto: 'TLS', labelPos: [949, 186] });
  body += drawEdge(t, id, { points: [[910, 549], [988, 549]], colorKey: 'default', label: 'Emails', proto: 'HTTPS', labelPos: [949, 524] });

  const suffix = theme === 'light' ? '' : '-dark';
  const svg = wrapSvg({ width: W, height: H, title: 'C4 E-Commerce Architecture (Anemone v2)', theme, idPrefix: id, body });
  fs.writeFileSync(path.join(DIAGRAMS_DIR, `02-architecture-c4-ecommerce${suffix}.svg`), svg);

  if (theme === 'light') {
    fs.writeFileSync(path.join(SOURCES_DIR, '02-architecture-c4-ecommerce.coral'), `@diagram architecture
@coralVersion "0.2.14"

customer person [description: "Places & tracks orders"] as "Customer"
ops person [description: "Handles refunds & disputes"] as "Support Ops"
stripe externalSystem [technology: "REST / HTTPS", description: "Card capture & 3DS"] as "Stripe"
postmark externalSystem [technology: "SMTP / API", description: "Transactional receipts"] as "Postmark"

platform systemBoundary as "Commerce Platform" {
  edge containerBoundary as "Client & Edge Tier" {
    web container [technology: "Next.js / SSR", description: "Catalog, cart & checkout UI"] as "Web Storefront"
    gw gateway [technology: "Envoy / JWT", description: "AuthN, rate limits & routing"] as "API Gateway"
  }
  orders container [technology: "Go / gRPC", description: "Cart validation & state machine"] as "Order Service"
  bus queue [technology: "Apache Kafka", description: "Durable domain event topics"] as "Event Bus"
  worker container [technology: "Rust / Consumer", description: "Dispatches shipments & emails"] as "Fulfillment Worker"
  db database [technology: "PostgreSQL 16", description: "ACID ledger & outbox table"] as "Orders Database"
}

customer -> platform.edge.web [technology: "HTTPS"] as "Browses"
ops -> platform.edge.gw [technology: "HTTPS"] as "Admin"
platform.edge.web -> platform.edge.gw [technology: "JSON"] as "Submits"
platform.edge.gw -> platform.orders [technology: "gRPC"] as "Creates"
platform.orders -> platform.db [data, technology: "SQL"] as "Writes"
platform.orders -> platform.bus [async, technology: "Avro"] as "OrderPlaced"
platform.bus -> platform.worker [async] as "Consumes"
platform.orders -> stripe [technology: "TLS"] as "Charges"
platform.worker -> postmark [technology: "HTTPS"] as "Emails"
`);
  }
}

// ============================================================================
// 4. CLOUD INFRASTRUCTURE (AWS 3-TIER VPC)
// ============================================================================
function generateCloudAws() {
  const t = THEMES.light;
  const id = 'aws';
  const W = 1264, H = 680;
  let body = '';

  body += drawBanner(
    t, 36, 36,
    '@diagram infrastructure · ANEMONE V2 CLOUD TOPOLOGY',
    'Production 3-Tier AWS VPC Topology (us-east-1)',
    'Uniform cloud resource cards with crisp provider micro-tags and clear visual hierarchy across VPC, Public, Private App, and Data subnets'
  );

  // Edge column (widened for generous badge breathing room)
  body += drawCard(t, id, { x: 36, y: 174, w: 210, h: 78, title: 'End Users', tech: 'HTTPS / HTTP3', desc: 'Global web & mobile', icon: 'user', accent: 'coral' });
  body += drawCard(t, id, { x: 36, y: 316, w: 210, h: 78, title: 'CloudFront CDN', tech: 'Edge PoPs', desc: 'Static cache & TLS', icon: 'globe', accent: 'sky', provider: 'AWS' });
  body += drawCard(t, id, { x: 36, y: 458, w: 210, h: 78, title: 'AWS WAF', tech: 'Managed Rules', desc: 'Bot & rate shield', icon: 'shield', accent: 'emerald', provider: 'AWS' });

  // VPC Zone
  body += drawZone(t, { x: 298, y: 118, w: 930, h: 526, title: 'Production VPC · us-east-1', kind: '10.0.0.0/16 · AWS', icon: 'cloud', level: 1, dashed: false, accent: 'aws' });

  // Public Subnet
  body += drawZone(t, { x: 322, y: 164, w: 238, h: 454, title: 'Public Subnet', kind: 'PUBLIC', icon: 'globe', level: 2, dashed: true, accent: 'emerald' });
  body += drawCard(t, id, { x: 340, y: 212, w: 202, h: 82, title: 'Application LB', tech: 'ALB · TLS 1.3', desc: 'Ingress & health checks', icon: 'gateway', accent: 'sky', provider: 'AWS' });
  body += drawCard(t, id, { x: 340, y: 432, w: 202, h: 82, title: 'NAT Gateway', tech: 'Managed Egress', desc: 'Outbound internet access', icon: 'gateway', accent: 'slate', provider: 'AWS' });

  // Private App Subnet
  body += drawZone(t, { x: 586, y: 164, w: 296, h: 454, title: 'Private App Subnet', kind: 'PRIVATE', icon: 'lock', level: 2, dashed: true, accent: 'indigo' });
  body += drawCard(t, id, { x: 608, y: 212, w: 252, h: 86, title: 'EKS API Cluster', tech: 'Kubernetes · 3 AZ', desc: 'Auto-scaled stateless services', icon: 'k8s', accent: 'indigo', provider: 'AWS', topCap: true });
  body += drawCard(t, id, { x: 608, y: 356, w: 252, h: 82, title: 'SQS + EventBridge', tech: 'FIFO Queue', desc: 'Async background jobs', icon: 'queue', accent: 'violet', provider: 'AWS' });
  body += drawCard(t, id, { x: 608, y: 492, w: 252, h: 82, title: 'Lambda Workers', tech: 'ARM64 · Node 24', desc: 'PDF export & webhooks', icon: 'bolt', accent: 'teal', provider: 'AWS' });

  // Private Data Subnet
  body += drawZone(t, { x: 908, y: 164, w: 296, h: 454, title: 'Private Data Subnet', kind: 'ISOLATED', icon: 'database', level: 2, dashed: true, accent: 'amber' });
  body += drawCard(t, id, { x: 930, y: 212, w: 252, h: 84, title: 'Aurora PostgreSQL', tech: 'Multi-AZ Cluster', desc: 'Primary + read replica', icon: 'database', accent: 'amber', provider: 'AWS' });
  body += drawCard(t, id, { x: 930, y: 356, w: 252, h: 82, title: 'ElastiCache Redis', tech: 'Cluster Mode', desc: 'Sessions & hot cache', icon: 'cpu', accent: 'coral', provider: 'AWS' });
  body += drawCard(t, id, { x: 930, y: 492, w: 252, h: 82, title: 'S3 Asset Vault', tech: 'KMS Encrypted', desc: 'Backups & exported SVGs', icon: 'bucket', accent: 'amber', provider: 'AWS' });

  // Clean Orthogonal Edges
  body += drawEdge(t, id, { points: [[141, 252], [141, 316]], colorKey: 'strong', proto: 'HTTPS', labelPos: [141, 284] });
  body += drawEdge(t, id, { points: [[141, 394], [141, 458]], colorKey: 'strong', proto: 'Inspect', labelPos: [141, 426] });
  body += drawEdge(t, id, { points: [[246, 497], [276, 497], [276, 253], [340, 253]], colorKey: 'strong', proto: '443', labelPos: [276, 374] });
  body += drawEdge(t, id, { points: [[542, 253], [608, 253]], colorKey: 'strong', proto: 'HTTP/2', labelPos: [574, 228] });
  body += drawEdge(t, id, { points: [[734, 298], [734, 356]], colorKey: 'violet', dashed: true, open: true, proto: 'Enqueue', labelPos: [734, 327] });
  body += drawEdge(t, id, { points: [[734, 438], [734, 492]], colorKey: 'violet', dashed: true, open: true, proto: 'Trigger', labelPos: [734, 465] });
  body += drawEdge(t, id, { points: [[860, 254], [930, 254]], colorKey: 'amber', proto: '5432', labelPos: [895, 229] });
  body += drawEdge(t, id, { points: [[860, 274], [895, 274], [895, 397], [930, 397]], colorKey: 'amber', proto: '6379', labelPos: [895, 344] });
  body += drawEdge(t, id, { points: [[860, 533], [930, 533]], colorKey: 'amber', proto: 'S3 API', labelPos: [895, 508] });
  body += drawEdge(t, id, { points: [[608, 533], [574, 533], [574, 473], [542, 473]], colorKey: 'default', dashed: true, open: true, proto: 'Egress', labelPos: [574, 560] });

  const svg = wrapSvg({ width: W, height: H, title: 'AWS 3-Tier VPC Infrastructure (Anemone v2)', theme: 'light', idPrefix: id, body });
  fs.writeFileSync(path.join(DIAGRAMS_DIR, '03-infrastructure-cloud-aws.svg'), svg);
  fs.writeFileSync(path.join(SOURCES_DIR, '03-infrastructure-cloud-aws.coral'), `@diagram infrastructure
@coralVersion "0.2.14"

users users [technology: "HTTPS / HTTP3"] as "End Users"
cdn cdn [provider: "aws", technology: "Edge PoPs"] as "CloudFront CDN"
waf waf [provider: "aws", technology: "Managed Rules"] as "AWS WAF"

vpc vpc [provider: "aws"] as "Production VPC (us-east-1)" {
  pub subnet [variant: public] as "Public Subnet" {
    alb loadBalancer [provider: "aws", technology: "ALB / TLS 1.3"] as "Application LB"
    nat gateway [provider: "aws", technology: "Managed Egress"] as "NAT Gateway"
  }
  app subnet [variant: private] as "Private App Subnet" {
    eks kubernetes [provider: "aws", technology: "Kubernetes 3-AZ"] as "EKS API Cluster"
    sqs queue [provider: "aws", technology: "FIFO Queue"] as "SQS + EventBridge"
    fn function [provider: "aws", technology: "ARM64 / Node 24"] as "Lambda Workers"
  }
  data subnet [variant: private] as "Private Data Subnet" {
    rds database [provider: "aws", technology: "Multi-AZ Cluster"] as "Aurora PostgreSQL"
    redis cache [provider: "aws", technology: "Cluster Mode"] as "ElastiCache Redis"
    s3 storage [provider: "aws", technology: "KMS Encrypted"] as "S3 Asset Vault"
  }
}

users -> cdn [technology: "HTTPS"]
cdn -> waf
waf -> vpc.pub.alb [technology: "443"]
vpc.pub.alb -> vpc.app.eks [technology: "HTTP/2"]
vpc.app.eks -> vpc.app.sqs [async]
vpc.app.sqs -> vpc.app.fn [async]
vpc.app.eks -> vpc.data.rds [data, technology: "5432"]
vpc.app.eks -> vpc.data.redis [data, technology: "6379"]
vpc.app.fn -> vpc.data.s3 [data, technology: "S3 API"]
vpc.app.fn -> vpc.pub.nat [style: dashed] as "Egress"
`);
}

// ============================================================================
// 5. AI/ML AGENTIC RAG PIPELINE (Dark Mode showcase too!)
// ============================================================================
function generateAiMl(theme = 'dark') {
  const t = THEMES[theme];
  const id = `ai-${theme[0]}`;
  const W = 1220, H = 640;
  let body = '';

  body += drawBanner(
    t, 36, 36,
    `@diagram aiml · ANEMONE V2 (${theme.toUpperCase()} MODE)`,
    'Agentic RAG & Policy Guardrail Architecture',
    'Replacing unreadable clipart-over-text shapes (brain, neural-net, gear) with high-contrast elevated AI cards and crisp semantic flows'
  );

  // Input & Input Guardrail
  body += drawCard(t, id, { x: 36, y: 244, w: 184, h: 84, title: 'User Query', tech: 'Chat · Context', desc: 'Prompt + session ID', icon: 'user', accent: 'coral' });
  body += drawCard(t, id, { x: 266, y: 244, w: 196, h: 84, title: 'Input Guardrail', tech: 'PII · Injection', desc: 'Blocks unsafe prompts', icon: 'shield', accent: 'emerald' });

  // Agent Runtime Zone
  body += drawZone(t, { x: 510, y: 120, w: 410, h: 484, title: 'Agent Runtime', kind: 'ORCHESTRATION LOOP', icon: 'bot', level: 1, dashed: true, accent: 'violet' });
  body += drawCard(t, id, { x: 536, y: 162, w: 358, h: 84, title: 'Agent Orchestrator', tech: 'ReAct · Max 6 Steps', desc: 'Plans tool calls, tracks budget & stops', icon: 'bot', accent: 'violet', topCap: true });
  body += drawCard(t, id, { x: 536, y: 304, w: 358, h: 84, title: 'Frontier LLM', tech: 'Structured JSON + Tools', desc: 'Generates plan, citations & final response', icon: 'sparkle', accent: 'indigo', topCap: true });

  // Sub-capabilities inside runtime
  body += drawCard(t, id, { x: 536, y: 472, w: 168, h: 98, title: 'RAG Retriever', tech: 'Hybrid BM25', desc: 'Top-K reranked', desc2: 'grounded chunks', icon: 'search', accent: 'teal' });
  body += drawCard(t, id, { x: 726, y: 472, w: 168, h: 98, title: 'MCP Tools', tech: 'Sandboxed', desc: 'SQL, search &', desc2: 'API connectors', icon: 'wrench', accent: 'sky' });

  // External Knowledge + Output Guardrail right
  body += drawCard(t, id, { x: 968, y: 162, w: 216, h: 84, title: 'Output Guardrail', tech: 'Grounding Check', desc: 'Verifies citations & tone', icon: 'shield', accent: 'emerald' });
  body += drawCard(t, id, { x: 968, y: 304, w: 216, h: 84, title: 'Safe Fallback', tech: 'Refusal Policy', desc: 'Escalates or redacts', icon: 'lock', accent: 'coral' });
  body += drawCard(t, id, { x: 968, y: 472, w: 216, h: 98, title: 'Vector Store', tech: 'pgvector · HNSW', desc: '1536-dim embeddings', desc2: '& metadata filters', icon: 'database', accent: 'amber' });

  // Session memory left bottom
  body += drawCard(t, id, { x: 266, y: 472, w: 196, h: 98, title: 'Session Memory', tech: 'Redis + Summary', desc: 'Short-term turns &', desc2: 'user preferences', icon: 'memory', accent: 'amber' });

  // Clean Edges (zero crossings, zero card intersections!)
  body += drawEdge(t, id, { points: [[220, 286], [266, 286]], colorKey: 'strong' });
  body += drawEdge(t, id, { points: [[462, 274], [486, 274], [486, 192], [536, 192]], colorKey: 'emerald', label: 'Pass', labelPos: [486, 166] });
  body += drawEdge(t, id, { points: [[364, 328], [364, 412], [116, 412], [116, 616], [1202, 616], [1202, 346], [1184, 346]], colorKey: 'coral', dashed: true, label: 'Blocked Prompt', labelPos: [640, 616] });
  body += drawEdge(t, id, { points: [[690, 246], [690, 304]], colorKey: 'indigo', label: 'Prompt', labelPos: [652, 275] });
  body += drawEdge(t, id, { points: [[740, 304], [740, 246]], colorKey: 'violet', dashed: true, open: true, label: 'Tool Call', labelPos: [782, 275] });
  body += drawEdge(t, id, { points: [[620, 388], [620, 472]], colorKey: 'teal', label: 'Retrieve', labelPos: [620, 430] });
  body += drawEdge(t, id, { points: [[810, 388], [810, 472]], colorKey: 'sky', dotted: true, open: true, label: 'Invoke', labelPos: [810, 430] });
  body += drawEdge(t, id, { points: [[620, 570], [620, 594], [1076, 594], [1076, 570]], colorKey: 'amber', label: 'Top-K Cosine', proto: 'SQL', labelPos: [848, 594] });
  body += drawEdge(t, id, { points: [[536, 226], [498, 226], [498, 521], [462, 521]], colorKey: 'amber', dashed: true, open: true, label: 'Read/Write', labelPos: [498, 436] });
  body += drawEdge(t, id, { points: [[894, 204], [968, 204]], colorKey: 'strong', label: 'Draft', labelPos: [931, 180] });
  body += drawEdge(t, id, { points: [[1076, 246], [1076, 304]], colorKey: 'coral', dashed: true, label: 'Fail', labelPos: [1076, 275] });

  const suffix = theme === 'dark' ? '' : '-light';
  const svg = wrapSvg({ width: W, height: H, title: 'Agentic RAG AI/ML Pipeline (Anemone v2)', theme, idPrefix: id, body });
  fs.writeFileSync(path.join(DIAGRAMS_DIR, `04-aiml-rag-agent${suffix}.svg`), svg);
  if (theme === 'dark') {
    fs.writeFileSync(path.join(SOURCES_DIR, '04-aiml-rag-agent.coral'), `@diagram aiml
@coralVersion "0.2.14"

query prompt [description: "Prompt + session ID"] as "User Query"
in_guard guardrail [description: "Blocks unsafe prompts"] as "Input Guardrail"
out_guard guardrail [description: "Verifies citations & tone"] as "Output Guardrail"
fallback annotation [description: "Escalates or redacts"] as "Safe Fallback"
vdb vectorStore [technology: "pgvector / HNSW"] as "Vector Store"
mem memory [technology: "Redis + Summary"] as "Session Memory"

runtime [label: "Agent Runtime"] {
  agent agent [technology: "ReAct / Max 6 Steps"] as "Agent Orchestrator"
  llm llm [technology: "Structured JSON + Tools"] as "Frontier LLM"
  rag retriever [technology: "Hybrid BM25"] as "RAG Retriever"
  tools tool [technology: "Sandboxed"] as "MCP Tools"
}

query -> in_guard
in_guard -> runtime.agent [dataFlow] as "Pass"
in_guard -> fallback [error] as "Blocked Prompt"
runtime.agent -> runtime.llm [inference] as "Prompt"
runtime.llm -> runtime.agent [toolUse] as "Tool Call"
runtime.llm -> runtime.rag [dataFlow] as "Retrieve"
runtime.llm -> runtime.tools [toolUse] as "Invoke"
runtime.rag -> vdb [dataFlow] as "Top-K Cosine"
runtime.agent -> mem [dataFlow] as "Read/Write"
runtime.agent -> out_guard [inference] as "Draft"
out_guard -> fallback [error] as "Fail"
`);
  }
}

// ============================================================================
// 6. CROW'S FOOT ERD DIAGRAM
// ============================================================================
function generateErd() {
  const t = THEMES.light;
  const id = 'erd';
  const W = 1180, H = 620;
  let body = '';

  body += drawBanner(
    t, 36, 36,
    '@diagram erd · ANEMONE V2 SCHEMA DESIGN',
    'Multi-Tenant SaaS Diagramming Schema (Crow’s Foot)',
    'Tinted entity header bands, color-coded PK/FK/UK badges, right-aligned monospace types, and crisp Crow’s Foot cardinality notation'
  );

  function drawTable(x, y, w, name, kind, accent, rows) {
    const a = t.accents[accent];
    const rowH = 28;
    const h = 40 + rows.length * rowH + 6;
    let s = `<g filter="url(#${id}-shadow-sm)">`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${t.card}" stroke="${t.borderSubtle}" stroke-width="1.25"/>`;
    s += `<path d="M ${x + 10} ${y} H ${x + w - 10} Q ${x + w} ${y} ${x + w} ${y + 10} V ${y + 38} H ${x} V ${y + 10} Q ${x} ${y} ${x + 10} ${y} Z" fill="${a.head}"/>`;
    s += `<line x1="${x}" y1="${y + 38}" x2="${x + w}" y2="${y + 38}" stroke="${a.border}" stroke-width="1"/>`;
    s += renderIcon('table', x + 12, y + 11, 15, a.ink);
    s += `<text x="${x + 34}" y="${y + 23.5}" font-size="13" font-weight="600" fill="${t.inkPrimary}">${esc(name)}</text>`;
    s += `<text x="${x + w - 12}" y="${y + 23}" font-family="${FONT_MONO}" font-size="8.8" font-weight="600" fill="${a.ink}" text-anchor="end">${esc(kind)}</text>`;
    rows.forEach(([badge, bc, col, dtype], idx) => {
      const ry = y + 39 + idx * rowH;
      if (idx % 2 === 1) s += `<rect x="${x + 1}" y="${ry}" width="${w - 2}" height="${rowH}" fill="${t.rowAlt}"/>`;
      if (badge) {
        const ba = t.accents[bc];
        s += `<rect x="${x + 12}" y="${ry + 6}" width="25" height="16" rx="3.5" fill="${ba.badge}" stroke="${ba.border}" stroke-width="0.75"/>`;
        s += `<text x="${x + 24.5}" y="${ry + 17.2}" font-family="${FONT_MONO}" font-size="8.5" font-weight="700" fill="${ba.ink}" text-anchor="middle">${badge}</text>`;
      }
      s += `<text x="${x + 45}" y="${ry + 18}" font-size="11.5" font-weight="${badge === 'PK' ? '600' : '400'}" fill="${t.inkPrimary}">${esc(col)}</text>`;
      s += `<text x="${x + w - 12}" y="${ry + 18}" font-family="${FONT_MONO}" font-size="10.2" fill="${t.inkSecondary}" text-anchor="end">${esc(dtype)}</text>`;
    });
    s += `</g>`;
    return s;
  }

  // Crow's foot helper (horizontal or vertical endpoint)
  function crowsFoot(x, y, dir, kind) {
    // dir: 'left' | 'right' | 'up' | 'down' (direction INTO the table)
    const stroke = t.edgeStrong;
    let s = '';
    const v = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
    const h = dir === 'down' ? 1 : dir === 'up' ? -1 : 0;
    if (kind === 'one') {
      // double bar ||
      if (v !== 0) {
        s += `<line x1="${x - v * 8}" y1="${y - 7}" x2="${x - v * 8}" y2="${y + 7}" stroke="${stroke}" stroke-width="1.6"/>`;
        s += `<line x1="${x - v * 13}" y1="${y - 7}" x2="${x - v * 13}" y2="${y + 7}" stroke="${stroke}" stroke-width="1.6"/>`;
      } else {
        s += `<line x1="${x - 7}" y1="${y - h * 8}" x2="${x + 7}" y2="${y - h * 8}" stroke="${stroke}" stroke-width="1.6"/>`;
        s += `<line x1="${x - 7}" y1="${y - h * 13}" x2="${x + 7}" y2="${y - h * 13}" stroke="${stroke}" stroke-width="1.6"/>`;
      }
    } else if (kind === 'many-opt' || kind === 'many-req') {
      if (v !== 0) {
        s += `<path d="M ${x - v * 13} ${y} L ${x} ${y - 8} M ${x - v * 13} ${y} L ${x} ${y + 8}" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round"/>`;
        if (kind === 'many-opt') {
          s += `<circle cx="${x - v * 19}" cy="${y}" r="4" fill="${t.canvas}" stroke="${stroke}" stroke-width="1.5"/>`;
        } else {
          s += `<line x1="${x - v * 16}" y1="${y - 7}" x2="${x - v * 16}" y2="${y + 7}" stroke="${stroke}" stroke-width="1.6"/>`;
        }
      } else {
        s += `<path d="M ${x} ${y - h * 13} L ${x - 8} ${y} M ${x} ${y - h * 13} L ${x + 8} ${y}" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round"/>`;
        if (kind === 'many-opt') {
          s += `<circle cx="${x}" cy="${y - h * 19}" r="4" fill="${t.canvas}" stroke="${stroke}" stroke-width="1.5"/>`;
        } else {
          s += `<line x1="${x - 7}" y1="${y - h * 16}" x2="${x + 7}" y2="${y - h * 16}" stroke="${stroke}" stroke-width="1.6"/>`;
        }
      }
    }
    return s;
  }

  function erdRel(pts, startDir, startKind, endDir, endKind, label, lx, ly) {
    let s = `<path d="${roundedOrthPath(pts, 8)}" fill="none" stroke="${t.edgeDefault}" stroke-width="1.6"/>`;
    s += crowsFoot(pts[0][0], pts[0][1], startDir, startKind);
    s += crowsFoot(pts[pts.length - 1][0], pts[pts.length - 1][1], endDir, endKind);
    const pw = label.length * 6.2 + 16;
    s += `<rect x="${lx - pw / 2}" y="${ly - 10}" width="${pw}" height="20" rx="6" fill="${t.card}" stroke="${t.borderSubtle}" stroke-width="0.9"/>`;
    s += `<text x="${lx}" y="${ly + 3.6}" font-size="10.5" font-weight="500" fill="${t.inkSecondary}" text-anchor="middle">${esc(label)}</text>`;
    return s;
  }

  // Tables
  body += drawTable(44, 130, 266, 'organizations', 'ENTITY', 'indigo', [
    ['PK', 'amber', 'id', 'uuid'],
    ['UK', 'slate', 'slug', 'varchar(64)'],
    ['', '', 'plan_tier', 'plan_enum'],
    ['', '', 'created_at', 'timestamptz'],
  ]);

  body += drawTable(456, 130, 276, 'workspaces', 'ENTITY', 'teal', [
    ['PK', 'amber', 'id', 'uuid'],
    ['FK', 'sky', 'org_id', 'uuid'],
    ['', '', 'name', 'varchar(120)'],
    ['', '', 'default_style', 'render_style'],
  ]);

  body += drawTable(870, 130, 266, 'diagrams', 'ENTITY', 'teal', [
    ['PK', 'amber', 'id', 'uuid'],
    ['FK', 'sky', 'workspace_id', 'uuid'],
    ['', '', 'notation', 'notation_id'],
    ['', '', 'coral_source', 'text'],
  ]);

  body += drawTable(44, 386, 266, 'users', 'ENTITY', 'coral', [
    ['PK', 'amber', 'id', 'uuid'],
    ['FK', 'sky', 'org_id', 'uuid'],
    ['UK', 'slate', 'email', 'citext'],
    ['', '', 'role', 'member_role'],
  ]);

  body += drawTable(456, 386, 276, 'revisions', 'ENTITY', 'amber', [
    ['PK', 'amber', 'id', 'uuid'],
    ['FK', 'sky', 'diagram_id', 'uuid'],
    ['FK', 'sky', 'author_id', 'uuid'],
    ['', '', 'sha256_digest', 'char(64)'],
  ]);

  body += drawTable(870, 386, 266, 'active_exports', 'VIEW', 'emerald', [
    ['FK', 'sky', 'diagram_id', 'uuid'],
    ['', '', 'format', 'svg | png'],
    ['', '', 'render_style', 'anemone'],
    ['', '', 'exported_at', 'timestamptz'],
  ]);

  // Crow's Foot Relationships
  body += erdRel([[310, 206], [456, 206]], 'left', 'one', 'right', 'many-req', 'owns', 383, 184);
  body += erdRel([[732, 206], [870, 206]], 'left', 'one', 'right', 'many-opt', 'contains', 801, 184);
  body += erdRel([[177, 288], [177, 386]], 'up', 'one', 'down', 'many-req', 'has members', 177, 338);
  body += erdRel([[310, 464], [456, 464]], 'left', 'one', 'right', 'many-opt', 'authors', 383, 442);
  body += erdRel([[960, 288], [960, 338], [594, 338], [594, 386]], 'up', 'one', 'down', 'many-req', 'snapshots', 776, 338);
  body += erdRel([[1040, 288], [1040, 386]], 'up', 'one', 'down', 'many-opt', 'projects', 1040, 338);

  const svg = wrapSvg({ width: W, height: H, title: 'Multi-Tenant SaaS Crow’s Foot ERD (Anemone v2)', theme: 'light', idPrefix: id, body });
  fs.writeFileSync(path.join(DIAGRAMS_DIR, '05-erd-saas-crowsfoot.svg'), svg);
  fs.writeFileSync(path.join(SOURCES_DIR, '05-erd-saas-crowsfoot.coral'), `@diagram erd
@coralVersion "0.2.14"

organizations entity as "organizations" {
  attributes {
    + id: uuid [pk]
    + slug: varchar(64) [uk]
    + plan_tier: plan_enum
    + created_at: timestamptz
  }
}

workspaces entity as "workspaces" {
  attributes {
    + id: uuid [pk]
    + org_id: uuid [fk]
    + name: varchar(120)
    + default_style: render_style
  }
}

diagrams entity as "diagrams" {
  attributes {
    + id: uuid [pk]
    + workspace_id: uuid [fk]
    + notation: notation_id
    + coral_source: text
  }
}

users entity as "users" {
  attributes {
    + id: uuid [pk]
    + org_id: uuid [fk]
    + email: citext [uk]
    + role: member_role
  }
}

revisions entity as "revisions" {
  attributes {
    + id: uuid [pk]
    + diagram_id: uuid [fk]
    + author_id: uuid [fk]
    + sha256_digest: char(64)
  }
}

active_exports view as "active_exports" {
  attributes {
    + diagram_id: uuid [fk]
    + format: enum
    + render_style: render_style
    + exported_at: timestamptz
  }
}

organizations -> workspaces [firstEnd: one, secondEnd: oneOrMany] as "owns"
workspaces -> diagrams [firstEnd: one, secondEnd: zeroOrMany] as "contains"
organizations -> users [firstEnd: one, secondEnd: oneOrMany] as "has members"
users -> revisions [firstEnd: one, secondEnd: zeroOrMany] as "authors"
diagrams -> revisions [firstEnd: one, secondEnd: oneOrMany] as "snapshots"
diagrams -> active_exports [firstEnd: one, secondEnd: zeroOrMany] as "projects"
`);
}

// ============================================================================
// 7. BPMN 2.0 SWIMLANE PROCESS DIAGRAM
// ============================================================================
function generateBpmn() {
  const t = THEMES.light;
  const id = 'bpmn';
  const W = 1220, H = 560;
  let body = '';

  body += drawBanner(
    t, 36, 36,
    '@diagram bpmn · ANEMONE V2 PROCESS STUDIO',
    'Order Fulfillment & Exception Handling (BPMN 2.0)',
    'Clean horizontal swimlanes, restrained BPMN semantic event rings, icon-badged task cards, and clear XOR/AND gateway branches'
  );

  // Pool + 3 Lanes
  const px = 36, py = 104, pw = 1148, lh = 136;
  const lanes = [
    { name: 'Customer', accent: 'coral', fill: '#FFFFFF' },
    { name: 'Order Ops', accent: 'indigo', fill: '#F8FAFC' },
    { name: 'Warehouse', accent: 'teal', fill: '#FFFFFF' },
  ];
  body += `<g filter="url(#${id}-shadow-sm)">`;
  body += `<rect x="${px}" y="${py}" width="${pw}" height="${lh * 3}" rx="12" fill="${t.card}" stroke="${t.borderZone}" stroke-width="1.25"/>`;
  lanes.forEach((lane, i) => {
    const ly = py + i * lh;
    const a = t.accents[lane.accent];
    body += `<rect x="${px + 1}" y="${ly + 1}" width="${pw - 2}" height="${lh - 2}" rx="${i === 0 ? 11 : i === 2 ? 11 : 0}" fill="${lane.fill}"/>`;
    body += `<rect x="${px + 1}" y="${ly + 1}" width="40" height="${lh - 2}" fill="${a.head}"/>`;
    body += `<line x1="${px + 41}" y1="${ly}" x2="${px + 41}" y2="${ly + lh}" stroke="${t.borderZone}" stroke-width="1"/>`;
    if (i > 0) body += `<line x1="${px}" y1="${ly}" x2="${px + pw}" y2="${ly}" stroke="${t.borderZone}" stroke-width="1"/>`;
    body += `<text x="${px + 21}" y="${ly + lh / 2}" font-size="11.5" font-weight="700" fill="${a.ink}" text-anchor="middle" transform="rotate(-90 ${px + 21} ${ly + lh / 2})">${lane.name}</text>`;
  });
  body += `</g>`;

  const bpmnTask = (x, y, w, h, title, sub, icon, accent = 'indigo') => {
    const a = t.accents[accent];
    return `<g filter="url(#${id}-shadow-sm)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${t.card}" stroke="${t.borderSubtle}" stroke-width="1.25"/>
      <rect x="${x + 10}" y="${y + 10}" width="24" height="24" rx="6" fill="${a.badge}"/>
      ${renderIcon(icon, x + 15, y + 15, 14, a.ink, 1.85)}
      <text x="${x + 42}" y="${y + 25}" font-size="12.5" font-weight="600" fill="${t.inkPrimary}">${esc(title)}</text>
      <text x="${x + 42}" y="${y + 42}" font-size="10.5" fill="${t.inkSecondary}">${esc(sub)}</text>
    </g>`;
  };
  const bpmnGw = (cx, cy, kind, lbl, lblOffset) => {
    const r = 24;
    const sym = kind === 'xor'
      ? `<path d="M ${cx - 7} ${cy - 7} L ${cx + 7} ${cy + 7} M ${cx + 7} ${cy - 7} L ${cx - 7} ${cy + 7}" stroke="${t.accents.amber.ink}" stroke-width="2.4" stroke-linecap="round"/>`
      : `<path d="M ${cx - 8} ${cy} H ${cx + 8} M ${cx} ${cy - 8} V ${cy + 8}" stroke="${t.accents.amber.ink}" stroke-width="2.4" stroke-linecap="round"/>`;
    const lx = lblOffset ? cx + lblOffset[0] : cx;
    const ly = lblOffset ? cy + lblOffset[1] : cy + r + 15;
    const anchor = lblOffset && lblOffset[0] > 0 ? 'start' : lblOffset && lblOffset[0] < 0 ? 'end' : 'middle';
    return `<g filter="url(#${id}-shadow-sm)">
      <polygon points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}" fill="${t.accents.amber.head}" stroke="${t.accents.amber.ink}" stroke-width="1.75"/>
      ${sym}
      ${lbl ? `<text x="${lx}" y="${ly}" font-size="10.5" font-weight="600" fill="${t.inkSecondary}" text-anchor="${anchor}">${esc(lbl)}</text>` : ''}
    </g>`;
  };

  // Lane 1: Customer
  body += `<circle cx="130" cy="172" r="18" fill="${t.accents.emerald.head}" stroke="${t.accents.emerald.ink}" stroke-width="2"/>`;
  body += `<text x="130" y="206" font-size="10.5" font-weight="600" fill="${t.inkSecondary}" text-anchor="middle">Order Placed</text>`;
  body += bpmnTask(208, 144, 176, 56, 'Submit Order', 'Cart + payment token', 'user', 'coral');
  body += bpmnTask(926, 144, 166, 56, 'Receive Receipt', 'Email & tracking link', 'mail', 'coral');
  body += `<circle cx="1142" cy="172" r="18" fill="${t.accents.coral.head}" stroke="${t.accents.coral.ink}" stroke-width="3.2"/>`;
  body += `<text x="1142" y="206" font-size="10.5" font-weight="600" fill="${t.inkSecondary}" text-anchor="middle">Complete</text>`;

  // Lane 2: Order Ops
  body += bpmnTask(208, 280, 176, 56, 'Authorize Card', 'Stripe capture hold', 'gear', 'indigo');
  body += bpmnGw(466, 308, 'xor', 'Approved?', [-12, 34]);
  body += bpmnTask(560, 280, 170, 56, 'Notify Failure', 'Prompt retry card', 'mail', 'coral');
  body += `<circle cx="786" cy="308" r="17" fill="${t.accents.coral.head}" stroke="${t.accents.coral.ink}" stroke-width="3"/>`;
  body += `<text x="786" y="340" font-size="10.5" font-weight="600" fill="${t.inkSecondary}" text-anchor="middle">Cancelled</text>`;
  body += bpmnGw(870, 308, 'and', 'Join', [32, 4]);

  // Lane 3: Warehouse
  body += bpmnGw(466, 444, 'and', 'Parallel Split');
  body += bpmnTask(560, 416, 176, 56, 'Pick & Pack Box', 'Reserve inventory', 'box', 'teal');
  body += bpmnTask(776, 416, 176, 56, 'Print Carrier Label', 'UPS / FedEx API', 'code', 'teal');

  // Edges
  body += drawEdge(t, id, { points: [[148, 172], [208, 172]], colorKey: 'strong' });
  body += drawEdge(t, id, { points: [[296, 200], [296, 280]], colorKey: 'strong' });
  body += drawEdge(t, id, { points: [[384, 308], [442, 308]], colorKey: 'strong' });
  body += drawEdge(t, id, { points: [[490, 308], [560, 308]], colorKey: 'coral', dashed: true, label: 'No', labelPos: [524, 294] });
  body += drawEdge(t, id, { points: [[730, 308], [769, 308]], colorKey: 'coral' });
  body += drawEdge(t, id, { points: [[466, 332], [466, 420]], colorKey: 'emerald', label: 'Yes', labelPos: [494, 372] });
  body += drawEdge(t, id, { points: [[490, 444], [560, 444]], colorKey: 'strong' });
  body += drawEdge(t, id, { points: [[736, 444], [776, 444]], colorKey: 'strong' });
  body += drawEdge(t, id, { points: [[870, 416], [870, 332]], colorKey: 'strong' });
  body += drawEdge(t, id, { points: [[870, 284], [870, 172], [926, 172]], colorKey: 'strong' });
  body += drawEdge(t, id, { points: [[1092, 172], [1124, 172]], colorKey: 'strong' });

  const svg = wrapSvg({ width: W, height: H, title: 'BPMN Order Fulfillment (Anemone v2)', theme: 'light', idPrefix: id, body });
  fs.writeFileSync(path.join(DIAGRAMS_DIR, '06-bpmn-order-fulfillment.svg'), svg);
  fs.writeFileSync(path.join(SOURCES_DIR, '06-bpmn-order-fulfillment.coral'), `@diagram bpmn
@coralVersion "0.2.14"

customer [symbol: bpmn-lane] as "Customer" {
  start startEvent as "Order Placed"
  submit task as "Submit Order"
  receipt task as "Receive Receipt"
  done endEvent as "Complete"
}

ops [symbol: bpmn-lane] as "Order Ops" {
  auth task as "Authorize Card"
  approved exclusiveGateway as "Approved?"
  notify task as "Notify Failure"
  cancelled endEvent as "Cancelled"
  join parallelGateway as "Join"
}

warehouse [symbol: bpmn-lane] as "Warehouse" {
  split parallelGateway as "Parallel Split"
  pack task as "Pick & Pack Box"
  label task as "Print Carrier Label"
}

customer.start -> customer.submit
customer.submit -> ops.auth
ops.auth -> ops.approved
ops.approved -> ops.notify as "No"
ops.notify -> ops.cancelled
ops.approved -> warehouse.split as "Yes"
warehouse.split -> warehouse.pack
warehouse.pack -> warehouse.label
warehouse.label -> ops.join
ops.join -> customer.receipt
customer.receipt -> customer.done
`);
}

// ============================================================================
// 8. UML SEQUENCE DIAGRAM
// ============================================================================
function generateSequence() {
  const t = THEMES.light;
  const id = 'seq';
  const W = 1140, H = 680;
  let body = '';

  body += drawBanner(
    t, 36, 36,
    '@diagram uml-sequence · ANEMONE V2 SEQUENCE STUDIO',
    'Idempotent Checkout & 3DS Payment Authorization',
    'Elevated participant cards with role badges, soft activation bars, chamfered alt/opt fragment frames, and readable message pills'
  );

  const parts = [
    { x: 112, title: 'Shopper', sub: 'Browser', icon: 'user', accent: 'coral' },
    { x: 344, title: 'Web App', sub: 'Next.js', icon: 'browser', accent: 'sky' },
    { x: 576, title: 'Order API', sub: 'Go · gRPC', icon: 'server', accent: 'teal' },
    { x: 808, title: 'Stripe', sub: 'External', icon: 'card', accent: 'slate' },
    { x: 1018, title: 'Event Bus', sub: 'Kafka', icon: 'queue', accent: 'violet' },
  ];

  // Lifelines first
  parts.forEach((p) => {
    body += `<line x1="${p.x}" y1="168" x2="${p.x}" y2="626" stroke="${t.borderZone}" stroke-width="1.5" stroke-dasharray="5 5"/>`;
  });

  // Combined Fragment (alt) — positioned cleanly outside Web App activation bar at x=344
  body += `<g>
    <rect x="274" y="348" width="790" height="230" rx="10" fill="${t.accents.indigo.soft}" fill-opacity="0.55" stroke="${t.accents.indigo.border}" stroke-width="1.25"/>
    <path d="M 274 358 Q 274 348 284 348 H 332 L 322 372 H 274 Z" fill="${t.accents.indigo.badge}" stroke="${t.accents.indigo.border}" stroke-width="1"/>
    <text x="299" y="363.5" font-family="${FONT_MONO}" font-size="10.5" font-weight="700" fill="${t.accents.indigo.ink}" text-anchor="middle">ALT</text>
    <rect x="364" y="353" width="132" height="19" rx="5" fill="${t.card}" stroke="${t.accents.emerald.border}" stroke-width="0.8"/>
    <text x="430" y="366" font-family="${FONT_MONO}" font-size="9.5" font-weight="600" fill="${t.accents.emerald.ink}" text-anchor="middle">[payment_authorized]</text>
    <line x1="274" y1="484" x2="1064" y2="484" stroke="${t.accents.indigo.border}" stroke-width="1.1" stroke-dasharray="6 4"/>
    <rect x="364" y="492" width="108" height="19" rx="5" fill="${t.card}" stroke="${t.accents.coral.border}" stroke-width="0.8"/>
    <text x="418" y="505" font-family="${FONT_MONO}" font-size="9.5" font-weight="600" fill="${t.accents.coral.ink}" text-anchor="middle">[card_declined]</text>
  </g>`;

  // Activation bars
  const act = (cx, y1, y2, accent) => {
    const a = t.accents[accent];
    return `<rect x="${cx - 5.5}" y="${y1}" width="11" height="${y2 - y1}" rx="3.5" fill="${a.badge}" stroke="${a.ink}" stroke-width="1.25"/>`;
  };
  body += act(344, 198, 570, 'sky');
  body += act(576, 236, 548, 'teal');
  body += act(808, 278, 326, 'slate');

  // Participants (top headers)
  parts.forEach((p) => {
    const a = t.accents[p.accent];
    const w = 156, h = 54, x = p.x - w / 2, y = 114;
    body += `<g filter="url(#${id}-shadow-sm)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${t.card}" stroke="${t.borderSubtle}" stroke-width="1.25"/>
      <rect x="${x + 10}" y="${y + 13}" width="28" height="28" rx="7" fill="${a.badge}" stroke="${a.border}" stroke-width="0.75"/>
      ${renderIcon(p.icon, x + 16, y + 19, 16, a.ink, 1.85)}
      <text x="${x + 48}" y="${y + 26}" font-size="12.5" font-weight="600" fill="${t.inkPrimary}">${p.title}</text>
      <text x="${x + 48}" y="${y + 41}" font-family="${FONT_MONO}" font-size="9.5" fill="${t.inkSecondary}">${p.sub}</text>
    </g>`;
  });

  // Messages helper
  const msg = (x1, x2, y, label, { colorKey = 'strong', dashed = false, open = false, num } = {}) => {
    const mid = (x1 + x2) / 2;
    const stroke = colorKey === 'strong' ? t.edgeStrong : colorKey === 'violet' ? t.accents.violet.ink : colorKey === 'coral' ? t.accents.coral.ink : t.edgeDefault;
    const mType = open ? 'open' : 'arr';
    let s = `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${stroke}" stroke-width="1.65"${dashed ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#${id}-${mType}-${colorKey})"/>`;
    const tag = num ? `${num}. ${label}` : label;
    const pw = tag.length * 6.0 + 18;
    s += `<rect x="${mid - pw / 2}" y="${y - 24}" width="${pw}" height="19" rx="5.5" fill="${t.card}" fill-opacity="0.96" stroke="${t.borderSubtle}" stroke-width="0.85"/>`;
    s += `<text x="${mid}" y="${y - 11}" font-size="10.5" font-weight="500" fill="${colorKey === 'coral' ? t.accents.coral.ink : colorKey === 'violet' ? t.accents.violet.ink : t.inkPrimary}" text-anchor="middle">${esc(tag)}</text>`;
    return s;
  };

  body += msg(112, 338, 206, 'Click "Pay Now"', { num: 1 });
  body += msg(350, 570, 244, 'POST /orders (Idempotency-Key)', { num: 2 });
  body += msg(582, 802, 286, 'createPaymentIntent(amount)', { num: 3 });
  body += msg(802, 582, 326, 'intent_status + 3ds_token', { colorKey: 'default', dashed: true, open: true, num: 4 });
  body += msg(582, 1012, 410, 'publish OrderPaidEvent', { colorKey: 'violet', dashed: true, open: true, num: 5 });
  body += msg(570, 350, 452, '201 Created { orderId }', { colorKey: 'default', dashed: true, open: true, num: 6 });
  body += msg(570, 350, 540, '402 Payment Required', { colorKey: 'coral', dashed: true, open: true, num: 7 });
  body += msg(338, 112, 604, 'Render Confirmation / Retry UI', { colorKey: 'default', dashed: true, open: true, num: 8 });

  // Sticky Note on left
  body += `<g filter="url(#${id}-shadow-sm)">
    <path d="M 42 384 H 242 L 256 398 V 454 H 42 Z" fill="${t.cardNote}" stroke="${t.cardNoteBorder}" stroke-width="1.2"/>
    <path d="M 242 384 V 398 H 256" fill="none" stroke="${t.cardNoteBorder}" stroke-width="1.1"/>
    <text x="54" y="408" font-size="11" font-weight="600" fill="${t.accents.amber.ink}">Idempotency Guarantee</text>
    <text x="54" y="425" font-size="10.5" fill="${t.inkSecondary}">Duplicate clicks reuse the same</text>
    <text x="54" y="440" font-size="10.5" fill="${t.inkSecondary}">key for 24h — zero double charges.</text>
  </g>`;

  const svg = wrapSvg({ width: W, height: H, title: 'UML Sequence Checkout Auth (Anemone v2)', theme: 'light', idPrefix: id, body });
  fs.writeFileSync(path.join(DIAGRAMS_DIR, '07-sequence-checkout-auth.svg'), svg);
  fs.writeFileSync(path.join(SOURCES_DIR, '07-sequence-checkout-auth.coral'), `@diagram uml-sequence
@coralVersion "0.2.14"

shopper actor as "Shopper"
web participant as "Web App"
api participant as "Order API"
stripe participant as "Stripe"
bus participant as "Event Bus"

shopper -> web as "Click Pay Now"
web -> api as "POST /orders (Idempotency-Key)"
api -> stripe as "createPaymentIntent(amount)"
stripe -.-> api [return] as "intent_status + 3ds_token"

alt "payment_authorized" {
  api -> bus [async] as "publish OrderPaidEvent"
  api -.-> web [return] as "201 Created"
} else "card_declined" {
  api -.-> web [return] as "402 Payment Required"
}

web -.-> shopper [return] as "Render Confirmation / Retry UI"
`);
}

// ============================================================================
// 9. TACTILE SKETCH / EXCALIDRAW-PARITY WHITEBOARD DIAGRAM
// ============================================================================
function generateSketch() {
  const id = 'skw';
  const W = 1180, H = 640;
  const paper = '#FAF8F4';
  const ink = '#1E293B';
  const muted = '#57534E';
  const fills = {
    sky: '#E0F2FE',
    butter: '#FEF3C7',
    coral: '#FFE4E6',
    sage: '#DCFCE7',
    lavender: '#F3E8FF',
    white: '#FFFDF9',
  };

  const extraDefs = `
    ${CAVEAT_FONT_CSS}
    <pattern id="${id}-hatch-sky" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="#7DD3FC" stroke-width="1.3" opacity="0.55"/>
    </pattern>
    <pattern id="${id}-hatch-sage" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="#86EFAC" stroke-width="1.3" opacity="0.55"/>
    </pattern>
    <pattern id="${id}-warmdots" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="11" cy="11" r="1" fill="#D6CFC2" opacity="0.65"/>
    </pattern>
  `;

  function handRect(x, y, w, h, fill, title, sub, hatchUrl) {
    const d = `M ${x + 12} ${y + 1} Q ${x + w * 0.5} ${y - 2} ${x + w - 12} ${y + 1} ` +
      `Q ${x + w + 1} ${y + 2} ${x + w - 1} ${y + 14} Q ${x + w + 2} ${y + h * 0.5} ${x + w - 1} ${y + h - 12} ` +
      `Q ${x + w} ${y + h + 1} ${x + w - 12} ${y + h - 1} Q ${x + w * 0.5} ${y + h + 2} ${x + 12} ${y + h - 1} ` +
      `Q ${x - 1} ${y + h} ${x + 1} ${y + h - 12} Q ${x - 2} ${y + h * 0.5} ${x + 1} ${y + 12} ` +
      `Q ${x} ${y} ${x + 12} ${y + 1} Z`;
    return `<g filter="url(#${id}-shadow-sm)">
      <path d="${d}" fill="${fill}" stroke="${ink}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
      ${hatchUrl ? `<path d="${d}" fill="url(#${hatchUrl})" opacity="0.55"/>` : ''}
      <text x="${x + w / 2}" y="${y + (sub ? h * 0.44 : h * 0.58)}" font-family="${FONT_HAND}" font-size="24" font-weight="700" fill="${ink}" text-anchor="middle">${esc(title)}</text>
      ${sub ? `<text x="${x + w / 2}" y="${y + h * 0.75}" font-family="${FONT_HAND}" font-size="17" font-weight="500" fill="${muted}" text-anchor="middle">${esc(sub)}</text>` : ''}
    </g>`;
  }

  function handArrow(d, tipX, tipY, angleDeg, label, lx, ly) {
    const rad = (angleDeg * Math.PI) / 180;
    const len = 12;
    const a1 = rad + 2.65, a2 = rad - 2.65;
    const p1x = tipX + Math.cos(a1) * len, p1y = tipY + Math.sin(a1) * len;
    const p2x = tipX + Math.cos(a2) * len, p2y = tipY + Math.sin(a2) * len;
    let s = `<path d="${d}" fill="none" stroke="${ink}" stroke-width="2.1" stroke-linecap="round"/>`;
    s += `<path d="M ${p1x.toFixed(1)} ${p1y.toFixed(1)} L ${tipX} ${tipY} L ${p2x.toFixed(1)} ${p2y.toFixed(1)}" fill="none" stroke="${ink}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (label) {
      const pw = label.length * 8.2 + 16;
      s += `<rect x="${lx - pw / 2}" y="${ly - 13}" width="${pw}" height="24" rx="6" fill="${paper}" opacity="0.92"/>`;
      s += `<text x="${lx}" y="${ly + 5}" font-family="${FONT_HAND}" font-size="18" font-weight="600" fill="${muted}" text-anchor="middle">${esc(label)}</text>`;
    }
    return s;
  }

  let body = `<rect width="${W}" height="${H}" fill="url(#${id}-warmdots)"/>`;

  // Title in hand-lettered style + mono eyebrow
  body += `<text x="42" y="38" font-family="${FONT_MONO}" font-size="10" font-weight="600" fill="#BE123C" letter-spacing="0.08em">@diagram sketch · ANEMONE V2 TACTILE REGISTER (EXCALIDRAW PARITY)</text>`;
  body += `<text x="42" y="72" font-family="${FONT_HAND}" font-size="34" font-weight="700" fill="${ink}">The Coral Authoring Loop — Why Text + Canvas Beats Two Copies</text>`;

  // Hand-drawn dashed group around Core Loop
  body += `<path d="M 332 128 Q 610 124 888 129 Q 894 295 889 462 Q 610 467 330 461 Q 326 295 332 128 Z" fill="#FFFFFF" fill-opacity="0.52" stroke="#78716C" stroke-width="1.8" stroke-dasharray="8 6" stroke-linecap="round"/>`;
  body += `<text x="356" y="156" font-family="${FONT_HAND}" font-size="20" font-weight="700" fill="#57534E">One Plain-Text .coral File (Git-Reviewed!)</text>`;

  // Nodes
  body += handRect(48, 224, 212, 92, fills.coral, '1. Write DSL', '20 lines of clean text');
  body += handRect(368, 192, 214, 92, fills.sky, '2. Auto Layout', 'Orthogonal, zero overlaps', `${id}-hatch-sky`);
  body += handRect(646, 192, 214, 92, fills.lavender, '3. Drag One Box', 'Nudge key nodes by hand');

  // Hand-drawn Decision Diamond
  const dx = 610, dy = 382;
  body += `<g filter="url(#${id}-shadow-sm)">
    <path d="M ${dx} ${dy - 54} Q ${dx + 46} ${dy - 26} ${dx + 94} ${dy} Q ${dx + 46} ${dy + 28} ${dx} ${dy + 54} Q ${dx - 46} ${dy + 28} ${dx - 94} ${dy} Q ${dx - 46} ${dy - 26} ${dx} ${dy - 54} Z" fill="${fills.butter}" stroke="${ink}" stroke-width="2.1" stroke-linejoin="round"/>
    <text x="${dx}" y="${dy + 6}" font-family="${FONT_HAND}" font-size="22" font-weight="700" fill="${ink}" text-anchor="middle">Looks right?</text>
  </g>`;

  body += handRect(934, 224, 206, 92, fills.sage, '4. Commit SVG', 'Lives beside code forever', `${id}-hatch-sage`);

  // Sticky Note callout bottom-left
  body += `<g transform="rotate(-1.8 158 514)" filter="url(#${id}-shadow-md)">
    <rect x="52" y="454" width="224" height="122" rx="4" fill="${fills.butter}" stroke="#D97706" stroke-width="1.4"/>
    <rect x="134" y="446" width="60" height="16" rx="2" fill="#FDE68A" opacity="0.85"/>
    <text x="72" y="486" font-family="${FONT_HAND}" font-size="20" font-weight="700" fill="#92400E">Key Rule:</text>
    <text x="72" y="512" font-family="${FONT_HAND}" font-size="18" fill="${ink}">Dragging writes one clean</text>
    <text x="72" y="534" font-family="${FONT_HAND}" font-size="18" fill="${ink}">@ (x, y) pinned line back</text>
    <text x="72" y="556" font-family="${FONT_HAND}" font-size="18" fill="${ink}">into the .coral source!</text>
  </g>`;

  // Sticky Note callout bottom-right
  body += `<g transform="rotate(1.4 1030 510)" filter="url(#${id}-shadow-md)">
    <rect x="912" y="456" width="234" height="110" rx="4" fill="${fills.white}" stroke="#94A3B8" stroke-width="1.4"/>
    <text x="930" y="486" font-family="${FONT_HAND}" font-size="21" font-weight="700" fill="#0F766E">Switch styles anytime:</text>
    <text x="930" y="512" font-family="${FONT_HAND}" font-size="19" fill="${muted}">• lowfi (ink wireframe)</text>
    <text x="930" y="534" font-family="${FONT_HAND}" font-size="19" fill="${muted}">• hifi (crisp monochrome)</text>
    <text x="930" y="556" font-family="${FONT_HAND}" font-size="19" fill="${ink}">• anemone (Figma / Sketch)</text>
  </g>`;

  // Hand-drawn Arrows
  body += handArrow('M 262 266 Q 314 246 364 242', 364, 242, -5, 'parse', 310, 236);
  body += handArrow('M 584 238 Q 614 234 642 238', 642, 238, 4, '', 0, 0);
  body += handArrow('M 754 286 Q 748 346 704 374', 704, 374, 150, '1-line diff', 778, 344);
  body += handArrow('M 516 382 Q 456 368 468 290', 468, 290, -82, 'No — tweak!', 430, 356);
  body += handArrow('M 704 388 Q 848 398 952 320', 952, 320, -38, 'Yes — export!', 862, 396);
  // Dashed pointer from sticky note
  body += `<path d="M 278 496 Q 332 486 356 456" fill="none" stroke="#B45309" stroke-width="1.6" stroke-dasharray="5 4" stroke-linecap="round"/>`;

  const svg = wrapSvg({ width: W, height: H, title: 'Excalidraw-Parity Tactile Sketch Diagram (Anemone v2)', theme: 'light', idPrefix: id, extraDefs, body, bgOverride: paper, noDots: true });
  fs.writeFileSync(path.join(DIAGRAMS_DIR, '08-sketch-product-ideation.svg'), svg);
  fs.writeFileSync(path.join(SOURCES_DIR, '08-sketch-product-ideation.coral'), `@diagram sketch
@coralVersion "0.2.14"

write step as "1. Write DSL"
commit step as "4. Commit SVG"
note1 label as "Dragging writes one clean @ (x, y) pinned line back into source"

loop group as "One Plain-Text .coral File" {
  layout box as "2. Auto Layout"
  drag box as "3. Drag One Box"
  check decision as "Looks right?"
}

write -> loop.layout as "parse"
loop.layout -> loop.drag
loop.drag -> loop.check as "1-line diff"
loop.check -> loop.layout as "No — tweak!"
loop.check -> commit as "Yes — export!"
note1 -> loop
`);
}

// Generate all assets!
generateSymbolKit('light');
generateSymbolKit('dark');
generateBeforeAfter();
generateArchitectureC4('light');
generateArchitectureC4('dark');
generateCloudAws();
generateAiMl('dark');
generateAiMl('light');
generateErd();
generateBpmn();
generateSequence();
generateSketch();

// ============================================================================
// 10. INTERACTIVE HTML SHOWCASE & BACKUP GALLERY
// ============================================================================
const galleryItems = [
  { id: 'compare', badge: 'AUDIT', title: '01 · Before (Anemone v1) vs. After (Anemone v2)', desc: 'Direct visual diff of the exact same layout, coordinates, and orthogonal routes — pure presentation craft.', img: './diagrams/01-before-after-comparison.svg', source: null },
  { id: 'symbols', badge: 'SYSTEM', title: 'Symbol & Component Kit (Light + Dark)', desc: 'Complete specimen sheet covering C4 Architecture, Cloud Infrastructure, AI/ML, Data Engineering, Crow’s Foot ERD, UML Class/State, BPMN, Flowchart, and Excalidraw-class Sketch.', img: './symbols/anemone-v2-symbol-kit-light.svg', imgDark: './symbols/anemone-v2-symbol-kit-dark.svg', source: null },
  { id: 'arch', badge: '@diagram architecture', title: '02 · E-Commerce C4 Container Architecture', desc: 'Neutral elevated cards, 28px semantic icon squircles, 3-tier typography (Title · Tech Pill · Description), layered boundaries, and sync/async/data pill labels.', img: './diagrams/02-architecture-c4-ecommerce.svg', imgDark: './diagrams/02-architecture-c4-ecommerce-dark.svg', source: '02-architecture-c4-ecommerce.coral' },
  { id: 'aws', badge: '@diagram infrastructure', title: '03 · Production 3-Tier AWS VPC Topology', desc: 'Uniform cloud resource cards with crisp AWS micro-tags and distinct nested Public / Private App / Isolated Data subnet frames.', img: './diagrams/03-infrastructure-cloud-aws.svg', source: '03-infrastructure-cloud-aws.coral' },
  { id: 'aiml', badge: '@diagram aiml', title: '04 · Agentic RAG & Guardrail Architecture', desc: 'Replaces unreadable clipart-over-text shapes (brain, neural-net, gear) with clean high-contrast cards in Abyssal Slate Dark & Studio Light modes.', img: './diagrams/04-aiml-rag-agent.svg', imgLight: './diagrams/04-aiml-rag-agent-light.svg', source: '04-aiml-rag-agent.coral' },
  { id: 'erd', badge: '@diagram erd', title: '05 · Multi-Tenant SaaS Crow’s Foot ERD', desc: 'Tinted header bands, PK/FK/UK pill badges, right-aligned monospace data types, and crisp Crow’s Foot cardinality endpoints.', img: './diagrams/05-erd-saas-crowsfoot.svg', source: '05-erd-saas-crowsfoot.coral' },
  { id: 'bpmn', badge: '@diagram bpmn', title: '06 · BPMN 2.0 Swimlane Order Fulfillment', desc: 'Clean horizontal swimlanes, semantic emerald/amber/coral event rings, icon-badged task cards, and XOR/AND gateway diamonds.', img: './diagrams/06-bpmn-order-fulfillment.svg', source: '06-bpmn-order-fulfillment.coral' },
  { id: 'seq', badge: '@diagram uml-sequence', title: '07 · Idempotent Checkout Sequence Diagram', desc: 'Elevated participant cards, tinted activation bars, chamfered ALT combined fragment with guard pills, and folded sticky note.', img: './diagrams/07-sequence-checkout-auth.svg', source: '07-sequence-checkout-auth.coral' },
  { id: 'sketch', badge: '@diagram sketch', title: '08 · Tactile Whiteboard Sketch (Excalidraw Parity)', desc: 'Warm studio paper, organic charcoal ink, soft pastel highlighter fills with diagonal hachure, sticky notes, and hand-drawn arrows.', img: './diagrams/08-sketch-product-ideation.svg', source: '08-sketch-product-ideation.coral' },
];

const sourceMap = {};
for (const item of galleryItems) {
  if (item.source) {
    sourceMap[item.id] = fs.readFileSync(path.join(SOURCES_DIR, item.source), 'utf8');
  }
}

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Coral Anemone v2 — Visual Design Language & Mockup Showcase</title>
  <style>
    :root { --bg:#F8FAFC; --card:#FFFFFF; --ink:#0F172A; --muted:#475569; --border:#DDE4EE; --accent:#4338CA; --coral:#BE123C; --code-bg:#0F172A; --code-ink:#E2E8F0; }
    [data-theme="dark"] { --bg:#0B101B; --card:#131B2B; --ink:#F1F5F9; --muted:#94A3B8; --border:#243149; --accent:#818CF8; --coral:#FB7185; --code-bg:#070B12; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:var(--bg); color:var(--ink); line-height:1.5; }
    header { position:sticky; top:0; z-index:20; backdrop-filter:blur(10px); background:color-mix(in srgb,var(--card) 88%,transparent); border-bottom:1px solid var(--border); padding:14px 28px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
    .brand { display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:-0.02em; }
    .dot { width:10px; height:10px; border-radius:999px; background:var(--coral); }
    nav { display:flex; gap:8px; flex-wrap:wrap; }
    button { font:inherit; font-size:13px; font-weight:500; padding:6px 12px; border-radius:8px; border:1px solid var(--border); background:var(--card); color:var(--ink); cursor:pointer; }
    button:hover { border-color:var(--accent); }
    button.active { background:var(--accent); color:#fff; border-color:var(--accent); }
    main { max-width:1360px; margin:0 auto; padding:28px; display:flex; flex-direction:column; gap:32px; }
    .hero { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:28px 32px; }
    .eyebrow { font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:600; color:var(--coral); letter-spacing:0.08em; text-transform:uppercase; }
    h1 { margin:6px 0 8px; font-size:28px; letter-spacing:-0.025em; }
    .hero p { margin:0; color:var(--muted); max-width:860px; }
    .card { background:var(--card); border:1px solid var(--border); border-radius:16px; overflow:hidden; }
    .card-head { padding:18px 24px; border-bottom:1px solid var(--border); display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
    .pill { display:inline-block; font-family:'JetBrains Mono',monospace; font-size:10.5px; font-weight:600; padding:2px 8px; border-radius:6px; background:color-mix(in srgb,var(--accent) 12%,transparent); color:var(--accent); margin-bottom:6px; }
    h2 { margin:0 0 4px; font-size:18px; letter-spacing:-0.015em; }
    .desc { margin:0; font-size:13.5px; color:var(--muted); }
    .actions { display:flex; gap:8px; align-items:center; }
    .stage { padding:20px; background:color-mix(in srgb,var(--bg) 60%,var(--card)); display:flex; justify-content:center; overflow-x:auto; }
    .stage img { max-width:100%; height:auto; border-radius:10px; border:1px solid var(--border); }
    pre.source { display:none; margin:0; padding:18px 24px; background:var(--code-bg); color:var(--code-ink); font-family:'JetBrains Mono',monospace; font-size:12.5px; overflow-x:auto; border-top:1px solid var(--border); }
    pre.source.open { display:block; }
  </style>
</head>
<body>
  <header>
    <div class="brand"><span class="dot"></span> Coral · Anemone v2 Design Language Showcase</div>
    <nav>
      <button id="themeBtn" onclick="toggleTheme()">Toggle Dark Shell</button>
    </nav>
  </header>
  <main>
    <section class="hero">
      <div class="eyebrow">Anemone v2 · Visual Reference &amp; Mockup Pack</div>
      <h1>Figma / IcePanel Precision + Excalidraw Tactile Warmth</h1>
      <p>Standalone SVG mockups demonstrating Coral’s redesigned <strong>Anemone v2</strong> presentation language across C4 Architecture, Cloud Infrastructure, AI/ML, Crow’s Foot ERD, BPMN, UML Sequence, and Tactile Sketch — strictly decoupled from layout and routing via Parrotfish.</p>
    </section>
    ${galleryItems.map((item) => `
    <article class="card" id="${item.id}">
      <div class="card-head">
        <div>
          <span class="pill">${esc(item.badge)}</span>
          <h2>${esc(item.title)}</h2>
          <p class="desc">${esc(item.desc)}</p>
        </div>
        <div class="actions">
          ${item.imgDark ? `<button onclick="swapImg('${item.id}','${item.img}','${item.imgDark}',this)">Switch Light / Dark SVG</button>` : ''}
          ${item.imgLight ? `<button onclick="swapImg('${item.id}','${item.img}','${item.imgLight}',this)">Switch Dark / Light SVG</button>` : ''}
          ${item.source ? `<button onclick="toggleSrc('${item.id}',this)">View Coral Source</button>` : ''}
          <a href="${item.img}" target="_blank" style="text-decoration:none"><button>Open SVG ↗</button></a>
        </div>
      </div>
      <div class="stage"><img id="img-${item.id}" src="${item.img}" alt="${esc(item.title)}"/></div>
      ${item.source ? `<pre class="source" id="src-${item.id}">${esc(sourceMap[item.id])}</pre>` : ''}
    </article>`).join('')}
  </main>
  <script>
    function toggleTheme() {
      const root = document.documentElement;
      root.dataset.theme = root.dataset.theme === 'dark' ? '' : 'dark';
    }
    function toggleSrc(id, btn) {
      const el = document.getElementById('src-' + id);
      const open = el.classList.toggle('open');
      btn.classList.toggle('active', open);
    }
    function swapImg(id, a, b, btn) {
      const img = document.getElementById('img-' + id);
      const isB = img.dataset.alt === '1';
      img.src = isB ? a : b;
      img.dataset.alt = isB ? '0' : '1';
      btn.classList.toggle('active', !isB);
    }
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(OUT_BASE, 'index.html'), html);
console.log('Generated Anemone v2 mockups successfully in:', OUT_BASE);
