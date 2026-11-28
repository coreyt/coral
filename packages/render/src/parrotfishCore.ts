/**
 * Pure presentation model engine for Coral's Anemone v2 output style and
 * Parrotfish modeled presentation transforms. Never alters layout coordinates,
 * flow direction, port contacts, or edge routes.
 */
import type { GraphEdge, GraphNode } from './types.js';
import type { SceneBounds028, ScenePartRecord028 } from './renderScene028.js';
import type { PreparedSpatialScene028 } from './svg/serialize.js';
import { markerId } from './scene.js';

export interface ParrotfishSymbolGlyph {
  readonly name: string;
  readonly viewBox: string;
  readonly paths: readonly { readonly d: string; readonly filled?: boolean }[];
}

export interface ParrotfishNodeStyle {
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly strokeDasharray?: string;
  readonly textColor?: string;
  readonly secondaryTextColor?: string;
  readonly glyphFill?: string;
  readonly glyphStroke?: string;
  readonly accentColor?: string;
  readonly accentPosition?: 'left' | 'top' | 'none';
  readonly accentThickness?: number;
  readonly filterId?: 'anemone-shadow-sm' | 'anemone-shadow-md';
  readonly headerBandFill?: string;
  readonly headerBandBorder?: string;
  readonly iconBadgeFill?: string;
  readonly iconBadgeBorder?: string;
  readonly pillFill?: string;
  readonly pillBorder?: string;
  readonly pillTextColor?: string;
  readonly symbolGlyph?: ParrotfishSymbolGlyph;
}

export interface ParrotfishEdgeStyle {
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly dash?: string;
  readonly labelColor?: string;
  readonly labelBackground?: string;
  readonly labelStroke?: string;
  readonly labelRadius?: number;
  readonly labelPadX?: number;
  readonly labelPadY?: number;
  readonly markerColor?: string;
}

export interface ParrotfishPalette {
  readonly background: string;
  readonly paper: string;
  readonly ink: string;
  readonly softInk: string;
  readonly edge: string;
  readonly containerFill: string;
  readonly containerNestedFill: string;
  readonly containerStroke: string;
  readonly containerDasharray?: string;
  readonly containerLabelColor: string;
  readonly containerLabelBackground?: string;
  readonly containerLabelStroke?: string;
  readonly edgeLabelBackground: string;
  readonly edgeLabelStroke?: string;
  readonly edgeLabelRadius?: number;
  readonly dividerColor?: string;
}

export interface ParrotfishNodeContext {
  readonly id: string;
  readonly notationId?: string;
  readonly type?: string;
  readonly symbolId?: string;
  readonly container: boolean;
  readonly nestingDepth: number;
  readonly theme: 'light' | 'dark';
  readonly node: GraphNode;
}

export interface ParrotfishEdgeContext {
  readonly id: string;
  readonly notationId?: string;
  readonly relationType?: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly theme: 'light' | 'dark';
  readonly edge: GraphEdge;
}

export interface ParrotfishPaletteContext {
  readonly notationId?: string;
  readonly theme: 'light' | 'dark';
}

export interface ParrotfishCanvasPattern {
  readonly color: string;
  readonly opacity: number;
  readonly pitch: number;
}

export interface ParrotfishModel {
  readonly name: string;
  readonly extends?: 'anemone' | 'ane' | 'monochrome' | 'parrotfish' | 'pf';
  readonly light?: Partial<ParrotfishPalette>;
  readonly dark?: Partial<ParrotfishPalette>;
  readonly resolvePalette?: (ctx: ParrotfishPaletteContext) => Partial<ParrotfishPalette> | undefined;
  readonly resolveCanvasPattern?: (ctx: ParrotfishPaletteContext) => ParrotfishCanvasPattern | undefined;
  readonly nodes?: Readonly<Record<string, ParrotfishNodeStyle>>;
  readonly resolveNode?: (ctx: ParrotfishNodeContext) => ParrotfishNodeStyle | undefined;
  readonly edges?: Readonly<Record<string, ParrotfishEdgeStyle>>;
  readonly resolveEdge?: (ctx: ParrotfishEdgeContext) => ParrotfishEdgeStyle | undefined;
  readonly symbols?: Readonly<Record<string, ParrotfishSymbolGlyph>>;
}

export type ParrotfishPresetName = 'anemone' | 'ane' | 'monochrome' | 'parrotfish' | 'pf';
export type ParrotfishModelInput = ParrotfishPresetName | ParrotfishModel;

const mkPal = (s: string, edgeLabelRadius?: number): ParrotfishPalette => {
  const h = (v?: string) => (!v ? undefined : v === 'none' ? v : `#${v}`);
  const [background, paper, ink, softInk, edge, containerFill, containerNestedFill, containerStroke,
    containerDasharray, containerLabelColor, containerLabelBackground, containerLabelStroke,
    edgeLabelBackground, edgeLabelStroke, dividerColor] = s.split('|') as string[];
  return Object.freeze({
    background: h(background)!, paper: h(paper)!, ink: h(ink)!, softInk: h(softInk)!, edge: h(edge)!,
    containerFill: h(containerFill)!, containerNestedFill: h(containerNestedFill)!, containerStroke: h(containerStroke)!,
    ...(containerDasharray !== '' ? { containerDasharray } : {}),
    containerLabelColor: h(containerLabelColor)!,
    ...(containerLabelBackground ? { containerLabelBackground: h(containerLabelBackground) } : {}),
    ...(containerLabelStroke ? { containerLabelStroke: h(containerLabelStroke) } : {}),
    edgeLabelBackground: h(edgeLabelBackground)!,
    ...(edgeLabelStroke ? { edgeLabelStroke: h(edgeLabelStroke) } : {}),
    ...(edgeLabelRadius ? { edgeLabelRadius } : {}),
    ...(dividerColor ? { dividerColor: h(dividerColor) } : {}),
  });
};

export const ANEMONE_LIGHT_PALETTE_0214 = mkPal('f8fafc|ffffff|0f172a|475569|64748b|f1f5f9|e8eff7|cbd5e1|6 4|0f172a|ffffff|cbd5e1|ffffff|dde4ee|e2e8f0', 6);
export const ANEMONE_DARK_PALETTE_0214 = mkPal('0b101b|192235|f1f5f9|94a3b8|7c8da6|111827|162033|2d3b55|6 4|f1f5f9|192235|334155|192235|2a3750|263249', 6);
const ANEMONE_SKETCH_LIGHT = mkPal('faf8f4|fffdf9|1e293b|57534e|1e293b|ffffff|f6f2ea|78716c|8 6|44403c|faf8f4|d6cfc2|faf8f4|e7e0d2|d6cfc2', 6);
const ANEMONE_SKETCH_DARK = mkPal('161513|22201d|f3f0e8|a8a29e|e7e2d8|1d1b18|24211d|57534e|8 6|e7e2d8|22201d|44403c|161513|3a3630|3a3630', 6);
const MONO_LIGHT = mkPal('ffffff|ffffff|22272b|858a8e|22272b|none|none|22272b||22272b|||ffffff||');
const MONO_DARK = mkPal('1e1e1e|1e1e1e|f1f5f9|a9bfdc|f1f5f9|none|none|f1f5f9||f1f5f9|||1e1e1e||');

type AnemoneAccentKey =
  | 'coral' | 'indigo' | 'teal' | 'sky' | 'amber' | 'violet' | 'emerald' | 'slate'
  | 'aws' | 'gcp';

interface AnemoneAccentRamp {
  readonly badge: string; readonly ink: string; readonly border: string;
  readonly soft: string; readonly head: string;
}

const ACCENT_RAW: Readonly<Record<'light' | 'dark', Readonly<Record<AnemoneAccentKey, string>>>> = {
  light: {
    coral: 'ffe4e6|be123c|fda4af|fff5f6|fff1f2',
    indigo: 'eef2ff|4338ca|c7d2fe|f5f7ff',
    teal: 'ecfeff|0e7490|a5f3fc|f2fcfd',
    sky: 'e0f2fe|0369a1|bae6fd|f4faff',
    amber: 'fef3c7|b45309|fde68a|fffdf5|fffbeb',
    violet: 'f3e8ff|7e22ce|e9d5ff|faf5ff|f5f3ff',
    emerald: 'd1fae5|047857|a7f3d0|f3fdf8|ecfdf5',
    slate: 'f1f5f9|475569|cbd5e1|f8fafc',
    aws: 'fff7ed|c2410c|fdba74|fffbf5',
    gcp: 'eff6ff|1d4ed8|93c5fd|f5f9ff',
  },
  dark: {
    coral: '3b1522|fb7185|881337|241019',
    indigo: '1e254b|818cf8|3730a3|161b36',
    teal: '102e38|22d3ee|155e75|0e222b',
    sky: '102b42|38bdf8|075985|0d2032',
    amber: '34240e|fbbf24|92400e|241a0c',
    violet: '2a1944|c084fc|6b21a8|1e1432',
    emerald: '0e2e23|34d399|065f46|0c221b',
    slate: '1f293b|94a3b8|475569|151d2b',
    aws: '361e10|fb923c|9a3412|26170e',
    gcp: '142442|60a5fa|1e40af|101b33',
  },
};

function accentOf(theme: 'light' | 'dark', key: AnemoneAccentKey): AnemoneAccentRamp {
  const [badge, ink, border, soft, head] = ACCENT_RAW[theme][key].split('|') as string[];
  return { badge: `#${badge!}`, ink: `#${ink!}`, border: `#${border!}`, soft: `#${soft!}`, head: `#${head ?? badge!}` };
}

const ICON_PATHS: Readonly<Record<string, string>> = {
  user: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8M5 20c1.2-4 4-6 7-6s5.8 2 7 6',
  server: 'M4 5h16v6H4zM4 13h16v6H4zM7 8h.01M7 16h.01M11 8h6M11 16h6',
  database: 'M5 6a7 2.5 0 1 0 14 0a7 2.5 0 1 0-14 0M5 6v12a7 2.5 0 0 0 14 0V6M5 12a7 2.5 0 0 0 14 0',
  queue: 'M4 7h12M4 12h16M4 17h12M17 4l3 3l-3 3M17 14l3 3l-3 3',
  gateway: 'M4 12h5M15 12h5M9 6h6v12H9zM12 3v3M12 18v3',
  shield: 'M12 3l7.5 3v5.5c0 4.6-3.1 8.3-7.5 9.5c-4.4-1.2-7.5-4.9-7.5-9.5V6zM9 12l2 2l4-4',
  sparkle: 'M12 3l2.2 6.3L20.5 12l-6.3 2.2L12 20.5l-2.2-6.3L3.5 12l6.3-2.2z',
  bot: 'M5 7h14v12H5zM12 3v4M9 12h.01M15 12h.01M9.5 15.5h5',
  cloud: 'M6.5 19h11a4 4 0 0 0 .8-7.9A5.5 5.5 0 0 0 7.6 9.5A3.8 3.8 0 0 0 6.5 19z',
  code: 'M8 7l-5 5l5 5M16 7l5 5l-5 5M13.5 5l-3 14',
  layers: 'M12 3L3 8l9 5l9-5zM3 13l9 5l9-5M3 17l9 5l9-5',
  bolt: 'M13 3L5 14h6l-1 7l8-11h-6z',
};

const iconOf = (k?: string): ParrotfishSymbolGlyph | undefined => {
  const d = k ? ICON_PATHS[k] : undefined;
  return d ? { name: k!, viewBox: '0 0 24 24', paths: [{ d }] } : undefined;
};

function elevatedCard(
  theme: 'light' | 'dark',
  accentKey: AnemoneAccentKey,
  opts: {
    fill?: string; stroke?: string; strokeWidth?: number; strokeDasharray?: string;
    topCap?: boolean; headerBand?: boolean; icon?: string;
  } = {},
): ParrotfishNodeStyle {
  const dark = theme === 'dark';
  const a = accentOf(theme, accentKey);
  const symbolGlyph = iconOf(opts.icon);
  return {
    fill: opts.fill ?? (dark ? '#192235' : '#ffffff'),
    stroke: opts.stroke ?? a.border,
    strokeWidth: opts.strokeWidth ?? 1.35,
    ...(opts.strokeDasharray ? { strokeDasharray: opts.strokeDasharray } : {}),
    textColor: dark ? '#f1f5f9' : '#0f172a',
    secondaryTextColor: dark ? '#94a3b8' : '#475569',
    glyphStroke: a.ink,
    glyphFill: a.ink,
    accentColor: a.ink,
    accentPosition: opts.topCap ? 'top' : 'none',
    accentThickness: 2.6,
    filterId: 'anemone-shadow-sm',
    ...(opts.headerBand ? { headerBandFill: a.head, headerBandBorder: a.border } : {}),
    iconBadgeFill: a.badge,
    iconBadgeBorder: a.border,
    pillFill: dark ? '#222e44' : '#f1f5f9',
    pillBorder: dark ? '#334155' : '#e2e8f0',
    pillTextColor: a.ink,
    ...(symbolGlyph ? { symbolGlyph } : {}),
  };
}

function resolveAnemoneV2Node(ctx: ParrotfishNodeContext): ParrotfishNodeStyle | undefined {
  if ((ctx.notationId ?? '').toLowerCase() === 'uml-state') {
    const dark = ctx.theme === 'dark';
    if (ctx.container) return { strokeDasharray: '', stroke: dark ? '#64748b' : '#94a3b8' };
    if (ctx.symbolId === 'uml-state-initial') {
      return { fill: dark ? '#34d399' : '#047857', stroke: dark ? '#34d399' : '#047857', accentPosition: 'none' };
    }
    if (ctx.symbolId === 'uml-state-final') {
      return { stroke: dark ? '#fb7185' : '#be123c', accentPosition: 'none' };
    }
    if (ctx.symbolId === 'uml-state-fork' || ctx.symbolId === 'uml-state-join') {
      return { fill: dark ? '#cbd5e1' : '#334155', stroke: dark ? '#cbd5e1' : '#334155', accentPosition: 'none' };
    }
    if (ctx.symbolId === 'uml-state-choice') {
      const a = accentOf(ctx.theme, 'amber');
      return elevatedCard(ctx.theme, 'amber', { fill: a.soft, stroke: a.ink, strokeWidth: 1.5 });
    }
    if (ctx.symbolId === 'uml-state-note') {
      return elevatedCard(ctx.theme, 'amber', { fill: dark ? '#282012' : '#fffbeb', stroke: dark ? '#785a18' : '#fcd34d' });
    }
    return elevatedCard(ctx.theme, 'teal', { topCap: true });
  }
  if (ctx.container) return undefined;
  const notation = (ctx.notationId ?? '').toLowerCase();
  const sym = (ctx.symbolId ?? '').toLowerCase();
  const key = `${sym} ${(ctx.type ?? '').toLowerCase()}`;
  const dark = ctx.theme === 'dark';
  const provider = String((ctx.node.properties as Record<string, unknown> | undefined)?.provider ?? '').toLowerCase();
  const card = (k: AnemoneAccentKey, o?: Parameters<typeof elevatedCard>[2]) => elevatedCard(ctx.theme, k, o);
  const acc = (k: AnemoneAccentKey) => accentOf(ctx.theme, k);

  if (notation === 'sketch') {
    const ink = dark ? '#f3f0e8' : '#1e293b';
    const isSketchLabel = sym.includes('label') || (ctx.type ?? '').toLowerCase() === 'label';
    const fill = key.includes('decision') ? (dark ? '#3a2f17' : '#fef3c7')
      : key.includes('circle') ? (dark ? '#162e22' : '#dcfce7')
      : key.includes('cloud') ? (dark ? '#381b22' : '#ffe4e6')
      : key.includes('box') ? (dark ? '#2a1e3b' : '#f3e8ff')
      : isSketchLabel ? 'none' : (dark ? '#162a3a' : '#e0f2fe');
    return { fill, stroke: isSketchLabel ? 'none' : ink, strokeWidth: 2, textColor: ink,
      secondaryTextColor: dark ? '#a8a29e' : '#57534e', glyphStroke: ink, glyphFill: ink, accentPosition: 'none' };
  }
  if (/(note|annot|callout|comment)/.test(key)) {
    return card('amber', { fill: dark ? '#282012' : '#fffbeb', stroke: dark ? '#785a18' : '#fcd34d' });
  }
  if (notation === 'erd' || notation === 'uml-class') {
    return card(sym.includes('view') || sym.includes('interface') ? 'teal' : sym.includes('weak') || sym.includes('enum') ? 'amber' : 'indigo', { headerBand: true });
  }
  if (notation === 'bpmn') {
    if (sym.includes('start')) { const a = acc('emerald'); return card('emerald', { fill: a.head, stroke: a.ink, strokeWidth: 2 }); }
    if (sym.includes('end')) { const a = acc('coral'); return card('coral', { fill: a.head, stroke: a.ink, strokeWidth: 3 }); }
    if (sym.includes('intermediate') || sym.includes('gateway')) {
      const a = acc('amber');
      return card('amber', { fill: sym.includes('gateway') ? a.soft : a.head, stroke: a.ink, strokeWidth: 1.7 });
    }
    return card(sym.includes('data') ? 'amber' : 'indigo');
  }
  if (notation === 'flowchart') {
    if (sym.includes('terminal')) {
      const k: AnemoneAccentKey = /(end|stop|done|exit|cancel|fail|reject|error)/.test((ctx.node.label ?? '').toLowerCase()) ? 'coral' : 'emerald';
      const a = acc(k);
      return card(k, { fill: a.head, stroke: a.border, strokeWidth: 1.5 });
    }
    if (sym.includes('decision')) { const a = acc('amber'); return card('amber', { fill: a.soft, stroke: a.ink, strokeWidth: 1.5 }); }
    return card(sym.includes('document') || sym.includes('io') ? 'sky' : 'indigo');
  }
  if (notation === 'block') {
    if (sym.includes('diamond') || sym.includes('cylinder')) return card('amber');
    if (/(pill|circle|oval)/.test(sym)) return card('indigo');
    return card('slate', { stroke: dark ? '#334155' : '#cbd5e1' });
  }
  if (/(external|thirdparty)/.test(key)) {
    return card('slate', { fill: dark ? '#121928' : '#f8fafc', stroke: dark ? '#475569' : '#94a3b8', strokeDasharray: '5 4', icon: 'cloud' });
  }
  if (/(person|actor|user|client)/.test(key)) {
    return card('coral', { stroke: acc('coral').ink, icon: 'user' });
  }
  if (/(database|store|storage|cache|warehouse|lake|bucket|\bdb\b|dataset|vector|memory)/.test(key)) {
    return card('amber', { stroke: acc(provider === 'aws' ? 'aws' : 'amber').border, topCap: true, icon: 'database' });
  }
  if (/(queue|broker|event|stream|topic|kafka|pubsub|bus|agent)/.test(key)) {
    return card('violet', { topCap: true, icon: sym.includes('agent') ? 'bot' : 'queue' });
  }
  if (/(gateway|balancer|cdn|waf|firewall|ingress|dns|proxy|router|network|iam|guardrail|quality)/.test(key)) {
    const sec = /(waf|firewall|iam|guardrail|quality)/.test(key);
    return card(sec ? 'emerald' : 'sky', { topCap: true, icon: sec ? 'shield' : 'gateway' });
  }
  const provKey: AnemoneAccentKey | undefined = provider === 'aws' || provider === 'gcp' ? provider : provider === 'azure' ? 'sky' : undefined;
  if (/(system|llm|model|brain|cluster|k8s|kube|orchestrator|class)/.test(key)) {
    return card(provKey ?? 'indigo', { topCap: true, icon: /(llm|model|brain)/.test(key) ? 'sparkle' : 'layers' });
  }
  if (/(function|lambda|tool|type)/.test(key)) {
    return card(sym.includes('type') ? 'violet' : 'teal', { topCap: true, icon: sym.includes('type') ? 'code' : 'bolt' });
  }
  if (provKey) return card(provKey, { topCap: true, icon: 'server' });
  if (/(start|begin|input|source|ingest|trigger)/.test(key)) return card('emerald', { topCap: true });
  if (/(end|stop|error|reject|alert|fail|terminate)/.test(key)) return card('coral', { topCap: true });
  return card('teal', { topCap: true, icon: notation === 'code' ? 'code' : 'server' });
}

export const ANEMONE_MODEL_0214: ParrotfishModel = Object.freeze<ParrotfishModel>({
  name: 'anemone',
  light: ANEMONE_LIGHT_PALETTE_0214,
  dark: ANEMONE_DARK_PALETTE_0214,
  resolvePalette: (ctx) => (ctx.notationId ?? '').toLowerCase() === 'sketch'
    ? (ctx.theme === 'dark' ? ANEMONE_SKETCH_DARK : ANEMONE_SKETCH_LIGHT)
    : (ctx.theme === 'dark' ? ANEMONE_DARK_PALETTE_0214 : ANEMONE_LIGHT_PALETTE_0214),
  resolveCanvasPattern: (ctx) => (ctx.notationId ?? '').toLowerCase() === 'sketch'
    ? { color: ctx.theme === 'dark' ? '#33302b' : '#d6cfc2', opacity: 0.6, pitch: 22 }
    : { color: ctx.theme === 'dark' ? '#263248' : '#cbd5e1', opacity: 0.48, pitch: 20 },
  resolveNode: resolveAnemoneV2Node,
  resolveEdge(ctx: ParrotfishEdgeContext) {
    const rel = (ctx.relationType ?? '').toLowerCase();
    const lbl = (ctx.edge.label ?? '').trim().toLowerCase();
    const dark = ctx.theme === 'dark';
    if ((ctx.notationId ?? '').toLowerCase() === 'uml-state' && rel === 'annotation') {
      return { stroke: dark ? '#64748b' : '#94a3b8', dash: '4 3' };
    }
    if ((ctx.notationId ?? '').toLowerCase() === 'sketch') {
      return {
        stroke: dark ? '#e7e2d8' : '#1e293b', strokeWidth: 1.9,
        labelColor: dark ? '#d6cfc2' : '#44403c', labelBackground: dark ? '#161513' : '#faf8f4',
        labelStroke: dark ? '#3a3630' : '#e7e0d2', labelRadius: 6, labelPadX: 5, labelPadY: 2,
      };
    }
    const edgeWith = (k: AnemoneAccentKey, dash?: string): ParrotfishEdgeStyle => {
      const a = accentOf(ctx.theme, k);
      return { stroke: a.ink, strokeWidth: 1.65, ...(dash ? { dash } : {}),
        labelColor: a.ink, labelBackground: a.soft, labelStroke: a.border, labelRadius: 6, labelPadX: 6, labelPadY: 2.5 };
    };
    if (/^(async|event|stream|stream-flow|streamflow)$/.test(rel)) return edgeWith('violet', '5 4');
    if (/^(data|data-flow|dataflow|reads|writes)$/.test(rel)) return edgeWith('amber');
    if (/^(error|fail|reject)$/.test(rel) || /^(no|fail|false|error|reject|blocked|declined)$/.test(lbl)) return edgeWith('coral', '4 3');
    if (/^(yes|pass|true|ok|approved|valid)$/.test(lbl)) return edgeWith('emerald');
    return {
      stroke: dark ? '#7c8da6' : '#64748b', strokeWidth: 1.65,
      labelColor: dark ? '#e2e8f0' : '#0f172a', labelBackground: dark ? '#192235' : '#ffffff',
      labelStroke: dark ? '#2a3750' : '#dde4ee', labelRadius: 6, labelPadX: 6, labelPadY: 2.5,
    };
  },
});

export const MONOCHROME_MODEL_0214: ParrotfishModel = Object.freeze({
  name: 'monochrome',
  light: MONO_LIGHT,
  dark: MONO_DARK,
});

const extraPresets = new Map<string, ParrotfishModel>();
export function registerParrotfishPreset0215(name: string, model: ParrotfishModel): void {
  extraPresets.set(name, model);
}

export interface ParrotfishSequenceTheme0215 {
  readonly background: string; readonly fill: string; readonly stroke: string;
  readonly text: string; readonly edge: string; readonly noteFill: string;
}

export function resolveParrotfishSequenceTheme0215(
  modelInput: ParrotfishModelInput,
  theme: 'light' | 'dark' = 'light',
): ParrotfishSequenceTheme0215 {
  const model = resolveParrotfishModel(modelInput);
  const dark = theme === 'dark';
  const dynPalette = model.resolvePalette?.({ notationId: 'uml-sequence', theme });
  const fallback = model.name === 'monochrome'
    ? (dark ? MONO_DARK : MONO_LIGHT)
    : (dark ? ANEMONE_DARK_PALETTE_0214 : ANEMONE_LIGHT_PALETTE_0214);
  const palette: ParrotfishPalette = { ...fallback, ...(dark ? model.dark : model.light), ...dynPalette };
  if (model.name === 'anemone') {
    return {
      background: palette.background, fill: palette.paper, stroke: dark ? '#475569' : '#94a3b8',
      text: palette.ink, edge: palette.edge, noteFill: dark ? '#282012' : '#fffbeb',
    };
  }
  const pStyle = model.resolveNode?.({
    id: '__p', notationId: 'uml-sequence', type: 'participant', symbolId: 'uml-participant',
    container: false, nestingDepth: 0, theme, node: { id: '__p', type: 'participant', label: '' },
  });
  const nStyle = model.resolveNode?.({
    id: '__n', notationId: 'uml-sequence', type: 'note', symbolId: 'note',
    container: false, nestingDepth: 0, theme, node: { id: '__n', type: 'note', label: '' },
  });
  const eStyle = model.resolveEdge?.({
    id: '__e', notationId: 'uml-sequence', relationType: 'sync',
    sourceId: 'a', targetId: 'b', theme, edge: { id: '__e', source: 'a', target: 'b' },
  });
  return {
    background: palette.background,
    fill: pStyle?.fill ?? palette.paper,
    stroke: pStyle?.stroke ?? palette.edge,
    text: pStyle?.textColor ?? palette.ink,
    edge: eStyle?.stroke ?? palette.edge,
    noteFill: nStyle?.fill ?? (dark ? '#282012' : '#fffbeb'),
  };
}

export function resolveParrotfishModel(input: ParrotfishModelInput): ParrotfishModel {
  if (typeof input === 'string') {
    if (input === 'anemone' || input === 'ane') return ANEMONE_MODEL_0214;
    if (input === 'monochrome') return MONOCHROME_MODEL_0214;
    const reg = extraPresets.get(input);
    if (reg) return reg;
    return ANEMONE_MODEL_0214;
  }
  if (!input.extends) return input;
  const base = resolveParrotfishModel(input.extends);
  return {
    name: input.name,
    light: { ...base.light, ...input.light },
    dark: { ...base.dark, ...input.dark },
    resolvePalette: (ctx) => ({
      ...base.resolvePalette?.(ctx),
      ...(ctx.theme === 'dark' ? input.dark : input.light),
      ...input.resolvePalette?.(ctx),
    }),
    resolveCanvasPattern: input.resolveCanvasPattern ?? base.resolveCanvasPattern,
    nodes: { ...base.nodes, ...input.nodes },
    edges: { ...base.edges, ...input.edges },
    symbols: { ...base.symbols, ...input.symbols },
    resolveNode: (ctx) => ({ ...base.resolveNode?.(ctx), ...input.resolveNode?.(ctx) }),
    resolveEdge: (ctx) => ({ ...base.resolveEdge?.(ctx), ...input.resolveEdge?.(ctx) }),
  };
}

function nodeNestingDepth(node: GraphNode, byId: ReadonlyMap<string, GraphNode>): number {
  let depth = 0;
  let cur = node.parent;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) { seen.add(cur); depth += 1; cur = byId.get(cur)?.parent; }
  return depth;
}

const rRectPath = (w: number, h: number, r: number): string => {
  const c = Math.min(r, w / 2, h / 2);
  return `M${c} 0 H${w - c} Q${w} 0 ${w} ${c} V${h - c} Q${w} ${h} ${w - c} ${h} H${c} Q0 ${h} 0 ${h - c} V${c} Q0 0 ${c} 0 Z`;
};

const topBandPath = (w: number, h: number, r: number): string => {
  const c = Math.min(r, w / 2, h);
  return `M${c} 0 H${w - c} Q${w} 0 ${w} ${c} V${h} H0 V${c} Q0 0 ${c} 0 Z`;
};

const overlaps = (a: SceneBounds028, b: SceneBounds028, p = 2): boolean =>
  a.x - p < b.x + b.width && a.x + a.width + p > b.x && a.y - p < b.y + b.height && a.y + a.height + p > b.y;

export function applyParrotfishToScene0214(
  scene: PreparedSpatialScene028,
  modelInput: ParrotfishModelInput = 'anemone',
  theme: 'light' | 'dark' = 'light',
): PreparedSpatialScene028 {
  const model = resolveParrotfishModel(modelInput);
  const fallbackPalette = model.name === 'monochrome'
    ? (theme === 'dark' ? MONO_DARK : MONO_LIGHT)
    : (theme === 'dark' ? ANEMONE_DARK_PALETTE_0214 : ANEMONE_LIGHT_PALETTE_0214);
  const palette: ParrotfishPalette = {
    ...fallbackPalette,
    ...(theme === 'dark' ? model.dark : model.light),
    ...model.resolvePalette?.({ notationId: scene.notationId, theme }),
  };
  const canvasPattern = model.resolveCanvasPattern?.({ notationId: scene.notationId, theme });

  const placedById = new Map(scene.nodes.map((n) => [n.node.id, n] as const));
  const rawNodeById = new Map(scene.nodes.map((n) => [n.node.id, n.node] as const));
  const resolvedNodeById = new Map(scene.resolved.nodes.map((n) => [n.id, n] as const));
  const resolvedEdgeById = new Map(scene.resolved.edges.map((e) => [e.id, e] as const));
  const semanticEdgeById = new Map(scene.semantic.edges.map((e) => [e.id, e] as const));

  const nodeTextBoxes = new Map<string, SceneBounds028[]>();
  const nodeFirstDividerY = new Map<string, number>();
  for (const part of scene.parts) {
    if (part.owner.kind !== 'node') continue;
    if (part.geometry.kind === 'text') {
      const list = nodeTextBoxes.get(part.owner.id) ?? [];
      list.push(part.bounds);
      nodeTextBoxes.set(part.owner.id, list);
    } else if (part.geometry.kind === 'divider') {
      const prev = nodeFirstDividerY.get(part.owner.id);
      if (prev === undefined || part.geometry.y1 < prev) nodeFirstDividerY.set(part.owner.id, part.geometry.y1);
    }
  }

  const mkDeco = (
    id: string, owner: ScenePartRecord028['owner'], bounds: SceneBounds028, d: string,
    fill: string, name: string, stroke = 'none', strokeWidth = 0, scaleX = 1, scaleY = 1, presentationOnly = true,
  ): ScenePartRecord028 => ({
    id, owner, role: 'glyph', bounds, presentationOnly,
    geometry: { kind: 'decoration-path', d, fill, stroke, strokeWidth, name, transform: { x: bounds.x, y: bounds.y, scaleX, scaleY } },
  });
  const explicitSymbolOf = (id: string, symId?: string, type?: string) =>
    model.symbols?.[id] ?? (symId ? model.symbols?.[symId] : undefined) ?? (type ? model.symbols?.[type] : undefined);

  const nodeStyleMap = new Map<string, ParrotfishNodeStyle>();
  for (const rn of scene.resolved.nodes) {
    const raw = rawNodeById.get(rn.id);
    if (!raw) continue;
    const dyn = model.resolveNode?.({
      id: rn.id, notationId: scene.notationId, type: raw.type, symbolId: rn.symbolId,
      container: Boolean(rn.container), nestingDepth: nodeNestingDepth(raw, rawNodeById), theme, node: raw,
    });
    const byId = model.nodes?.[rn.id];
    const glyphOverride = explicitSymbolOf(rn.id, rn.symbolId, raw.type);
    const rawMeta = (raw.properties as { coralStyle0214?: {
      fill?: string; stroke?: string; accentColor?: string; strokeColor?: string; fillColor?: string;
      lineStyle?: 'solid' | 'dashed' | 'dotted'; strokeWeight?: 'regular' | 'thick';
    } & Partial<ParrotfishNodeStyle> } | undefined)?.coralStyle0214;
    const metaStyle: ParrotfishNodeStyle | undefined = rawMeta ? {
      ...rawMeta,
      ...(rawMeta.fillColor ? { fill: rawMeta.fillColor } : {}),
      ...(rawMeta.strokeColor ? { stroke: rawMeta.strokeColor, accentColor: rawMeta.accentColor ?? rawMeta.strokeColor } : {}),
      ...(rawMeta.lineStyle === 'dashed' ? { strokeDasharray: '6 4' }
        : rawMeta.lineStyle === 'dotted' ? { strokeDasharray: '2 3' }
        : rawMeta.lineStyle === 'solid' ? { strokeDasharray: '' } : {}),
      ...(rawMeta.strokeWeight === 'thick' ? { strokeWidth: 2.5 } : {}),
    } : undefined;
    nodeStyleMap.set(rn.id, {
      ...(rn.symbolId ? model.nodes?.[rn.symbolId] : undefined),
      ...(raw.type ? model.nodes?.[raw.type] : undefined),
      ...dyn, ...byId, ...metaStyle,
      ...(glyphOverride && !byId?.symbolGlyph ? { symbolGlyph: glyphOverride } : {}),
    });
  }

  const edgeStyleMap = new Map<string, ParrotfishEdgeStyle>();
  for (const re of scene.resolved.edges) {
    const relationType = semanticEdgeById.get(re.id)?.type;
    const raw: GraphEdge = {
      id: re.id, source: re.sourceId, target: re.targetId,
      ...(relationType ? { type: relationType } : {}), ...(re.label ? { label: re.label } : {}),
    };
    const dyn = model.resolveEdge?.({
      id: re.id, notationId: scene.notationId, relationType, sourceId: re.sourceId, targetId: re.targetId, theme, edge: raw,
    });
    edgeStyleMap.set(re.id, { ...(relationType ? model.edges?.[relationType] : undefined), ...dyn, ...model.edges?.[re.id] });
  }

  const overriddenGlyphNodes = new Set<string>();
  const addedAccents = new Set<string>();
  const addedHeaderBands = new Set<string>();
  const seenFirstDivider = new Set<string>();
  const addedNativeGlyphBadges = new Set<string>();
  const styledParts: ScenePartRecord028[] = [];
  let usesElevation = false;

  for (const part of scene.parts) {
    if (part.owner.kind === 'edge') {
      const es = edgeStyleMap.get(part.owner.id);
      const re = resolvedEdgeById.get(part.owner.id);
      const edgeStroke = es?.stroke ?? palette.edge;
      const markerStroke = es?.markerColor ?? edgeStroke;
      if (part.geometry.kind === 'route') {
        styledParts.push({
          ...part,
          geometry: {
            ...part.geometry,
            stroke: edgeStroke,
            strokeWidth: es?.strokeWidth ?? part.geometry.strokeWidth,
            ...(es?.dash !== undefined ? { dash: es.dash || undefined } : {}),
            ...(re?.source.marker ? { markerStart: markerId(re.source.marker, markerStroke) } : {}),
            ...(re?.target.marker ? { markerEnd: markerId(re.target.marker, markerStroke) } : {}),
          },
        });
      } else if (part.geometry.kind === 'marker') {
        styledParts.push({ ...part, geometry: { ...part.geometry, stroke: markerStroke } });
      } else if (part.geometry.kind === 'text') {
        if (part.role === 'endpoint-label') {
          styledParts.push({
            ...part,
            geometry: { ...part.geometry, fill: palette.softInk, background: palette.background, backgroundRadius: 3, backgroundPadX: 2, backgroundPadY: 0.5 },
          });
        } else {
          const bgRadius = es?.labelRadius ?? palette.edgeLabelRadius;
          const bgStroke = es?.labelStroke ?? palette.edgeLabelStroke;
          styledParts.push({
            ...part,
            geometry: {
              ...part.geometry,
              fill: es?.labelColor ?? palette.ink,
              background: es?.labelBackground ?? part.geometry.background ?? palette.edgeLabelBackground,
              ...(bgStroke ? { backgroundStroke: bgStroke } : {}),
              ...(bgRadius ? { backgroundRadius: bgRadius } : {}),
              ...(es?.labelPadX !== undefined ? { backgroundPadX: es.labelPadX } : {}),
              ...(es?.labelPadY !== undefined ? { backgroundPadY: es.labelPadY } : {}),
            },
          });
        }
      } else {
        styledParts.push(part);
      }
      continue;
    }

    const rn = resolvedNodeById.get(part.owner.id);
    const placed = placedById.get(part.owner.id);
    const ns = nodeStyleMap.get(part.owner.id);
    const isContainer = Boolean(rn?.container);

    if (part.geometry.kind === 'stencil-path') {
      const isFilledInner = part.role === 'inner-outline' && part.geometry.fill !== 'none';
      const fill = isContainer
        ? (ns?.fill ?? (placed && nodeNestingDepth(placed.node, rawNodeById) > 0 ? palette.containerNestedFill : palette.containerFill))
        : isFilledInner
          ? (ns?.glyphFill ?? ns?.stroke ?? palette.ink)
          : (part.geometry.fill === 'none' ? 'none' : (ns?.fill ?? palette.paper));
      const stroke = isContainer
        ? (ns?.stroke ?? palette.containerStroke)
        : (isFilledInner && part.geometry.stroke === 'none' ? 'none' : (ns?.stroke ?? palette.ink));
      const rawDash = isContainer
        ? (ns?.strokeDasharray !== undefined ? ns.strokeDasharray
          : (palette.containerDasharray !== undefined ? palette.containerDasharray : part.geometry.strokeDasharray))
        : (ns?.strokeDasharray !== undefined ? ns.strokeDasharray : part.geometry.strokeDasharray);
      const strokeDasharray = rawDash ? rawDash : undefined;
      const strokeWidth = ns?.strokeWidth !== undefined ? ns.strokeWidth / part.geometry.transform.scale : part.geometry.strokeWidth;
      const filterId = !isContainer && part.role === 'outline' && fill !== 'none' ? ns?.filterId : undefined;
      if (filterId) usesElevation = true;
      const { strokeDasharray: _omitDash, ...restGeom } = part.geometry;
      void _omitDash;
      styledParts.push({
        ...part,
        geometry: {
          ...restGeom, fill, stroke, strokeWidth,
          ...(strokeDasharray ? { strokeDasharray } : {}),
          ...(filterId ? { filterId } : {}),
        },
      });

      const firstDivY = nodeFirstDividerY.get(part.owner.id);
      if (!isContainer && part.role === 'outline' && firstDivY !== undefined && ns?.headerBandFill && !addedHeaderBands.has(part.owner.id)) {
        addedHeaderBands.add(part.owner.id);
        const bw = Math.max(0, part.bounds.width - 1.5);
        const bh = Math.max(0, firstDivY - part.bounds.y - 0.75);
        if (bw > 4 && bh > 4) {
          const cornerR = typeof rn?.shapeParameters?.cornerRadius === 'number' ? rn.shapeParameters.cornerRadius : 4;
          styledParts.push(mkDeco(`${part.owner.id}:anemone-header-band`, part.owner,
            { x: part.bounds.x + 0.75, y: part.bounds.y + 0.75, width: bw, height: bh },
            topBandPath(bw, bh, cornerR), ns.headerBandFill, 'Header band'));
        }
      }

      if (!isContainer && part.role === 'outline' && !addedAccents.has(part.owner.id)
        && rn?.shapeId === 'rectangle' && !rn.artwork029 && firstDivY === undefined
        && ns?.accentColor && ns.accentPosition && ns.accentPosition !== 'none' && placed) {
        addedAccents.add(part.owner.id);
        const { x: ax, y: ay, width: aw, height: ah } = part.bounds;
        const t = ns.accentThickness ?? 2.6;
        const inset = Math.min(8, Math.max(4, Math.min(aw, ah) * 0.1));
        const isTop = ns.accentPosition === 'top';
        const w = isTop ? Math.max(0, aw - inset * 2) : t;
        const h = isTop ? t : Math.max(0, ah - inset * 2);
        styledParts.push(mkDeco(`${part.owner.id}:parrotfish-accent`, part.owner,
          { x: isTop ? ax + inset : ax + 1, y: isTop ? ay + 0.75 : ay + inset, width: w, height: h },
          rRectPath(w, h, Math.min(1.5, t / 2)), ns.accentColor, 'Accent'));
      }

      if (!isContainer && part.role === 'outline' && ns?.symbolGlyph && !rn?.glyph
        && rn?.shapeId === 'rectangle' && firstDivY === undefined && !overriddenGlyphNodes.has(part.owner.id) && placed) {
        const boxes = nodeTextBoxes.get(part.owner.id) ?? [];
        const badgeSize = Math.min(20, Math.max(16, part.bounds.height * 0.34));
        const candidate: SceneBounds028 = { x: part.bounds.x + 8, y: part.bounds.y + (ns.accentPosition === 'top' ? 9 : 8), width: badgeSize, height: badgeSize };
        const clear = Boolean(explicitSymbolOf(part.owner.id, rn.symbolId, placed.node.type))
          || (candidate.x + badgeSize < part.bounds.x + part.bounds.width - 8
            && candidate.y + badgeSize < part.bounds.y + part.bounds.height - 6
            && !boxes.some((b) => overlaps(candidate, b, 4)));
        if (clear) {
          overriddenGlyphNodes.add(part.owner.id);
          const [, , gw, gh] = ns.symbolGlyph.viewBox.split(/\s+/).map(Number);
          const pad = ns.iconBadgeFill ? 3.5 : 0;
          const iconSize = Math.max(10, badgeSize - pad * 2);
          if (ns.iconBadgeFill) {
            styledParts.push(mkDeco(`${part.owner.id}:anemone-icon-badge`, part.owner, candidate,
              rRectPath(badgeSize, badgeSize, 5.5), ns.iconBadgeFill, 'Icon badge',
              ns.iconBadgeBorder ?? 'none', ns.iconBadgeBorder ? 0.75 : 0));
          }
          const ib = { x: candidate.x + pad, y: candidate.y + pad, width: iconSize, height: iconSize };
          ns.symbolGlyph.paths.forEach((p, idx) => styledParts.push(mkDeco(
            `${part.owner.id}:parrotfish-glyph:${idx + 1}`, part.owner, ib, p.d,
            p.filled ? (ns.glyphFill ?? ns.stroke ?? palette.ink) : 'none', ns.symbolGlyph!.name,
            ns.glyphStroke ?? ns.stroke ?? palette.ink, 1.75, iconSize / (gw || 24), iconSize / (gh || 24),
          )));
        }
      }
      continue;
    }

    if (part.geometry.kind === 'decoration-path') {
      if (part.role === 'glyph' && ns?.symbolGlyph && explicitSymbolOf(part.owner.id, rn?.symbolId, placed?.node.type)) {
        if (!overriddenGlyphNodes.has(part.owner.id)) {
          overriddenGlyphNodes.add(part.owner.id);
          const [, , gw, gh] = ns.symbolGlyph.viewBox.split(/\s+/).map(Number);
          const glyphSize = Math.min(20, part.bounds.width || 18);
          ns.symbolGlyph.paths.forEach((p, idx) => styledParts.push(mkDeco(
            `${part.owner.id}:glyph:${idx + 1}`, part.owner, part.bounds, p.d,
            p.filled ? (ns.glyphFill ?? ns.stroke ?? palette.ink) : 'none', ns.symbolGlyph!.name,
            ns.glyphStroke ?? ns.stroke ?? palette.ink, 1.5, glyphSize / (gw || 24), glyphSize / (gh || 24), false,
          )));
        }
        continue;
      }
      if (part.role === 'glyph' && ns?.iconBadgeFill && !addedNativeGlyphBadges.has(part.owner.id) && part.bounds.width > 0 && part.bounds.height > 0) {
        addedNativeGlyphBadges.add(part.owner.id);
        const bw = part.bounds.width + 6;
        const bh = part.bounds.height + 6;
        styledParts.push(mkDeco(`${part.owner.id}:anemone-native-glyph-badge`, part.owner,
          { x: part.bounds.x - 3, y: part.bounds.y - 3, width: bw, height: bh },
          rRectPath(bw, bh, 5), ns.iconBadgeFill, 'Glyph badge',
          ns.iconBadgeBorder ?? 'none', ns.iconBadgeBorder ? 0.75 : 0));
      }
      const gStroke = ns?.glyphStroke ?? ns?.stroke ?? palette.ink;
      const gFill = part.geometry.fill === 'none' ? 'none' : (ns?.glyphFill ?? gStroke);
      styledParts.push({ ...part, geometry: { ...part.geometry, fill: gFill, stroke: gStroke } });
      continue;
    }

    if (part.geometry.kind === 'divider') {
      const isFirst = !seenFirstDivider.has(part.owner.id);
      seenFirstDivider.add(part.owner.id);
      styledParts.push({
        ...part,
        geometry: {
          ...part.geometry,
          stroke: isFirst ? (ns?.headerBandBorder ?? ns?.stroke ?? palette.containerStroke) : (palette.dividerColor ?? ns?.stroke ?? palette.containerStroke),
        },
      });
      continue;
    }

    if (part.geometry.kind === 'artwork') {
      styledParts.push({ ...part, geometry: { ...part.geometry, ...(part.geometry.tint ? { tint: ns?.glyphStroke ?? ns?.stroke ?? palette.ink } : {}) } });
      continue;
    }

    if (part.geometry.kind === 'text') {
      const hasCardMeta = Boolean(placed && (
        (typeof placed.node.properties?.technology === 'string' && placed.node.properties.technology.length > 0)
        || (typeof placed.node.description === 'string' && placed.node.description.length > 0)
      ));
      const trimmed = part.geometry.text.trim();
      const isTechLine = hasCardMeta && part.role === 'node-label' && !part.id.endsWith(':label:1')
        && trimmed.startsWith('[') && trimmed.endsWith(']');
      const isSecondary = part.role === 'classifier-stereotype'
        || (hasCardMeta && part.role === 'node-label' && !part.id.endsWith(':label:1'));

      if (isContainer) {
        const bg = palette.containerLabelBackground;
        styledParts.push({
          ...part,
          geometry: {
            ...part.geometry,
            fill: ns?.textColor ?? palette.containerLabelColor,
            ...(bg ? { background: bg, backgroundStroke: palette.containerLabelStroke ?? palette.containerStroke, backgroundRadius: 6, backgroundPadX: 8, backgroundPadY: 2.5 } : {}),
          },
        });
        continue;
      }
      if (isTechLine && ns?.pillFill) {
        styledParts.push({
          ...part,
          geometry: {
            ...part.geometry,
            fill: ns.pillTextColor ?? ns.secondaryTextColor ?? palette.softInk,
            fontSize: Math.max(10.5, part.geometry.fontSize - 2), fontWeight: 500,
            background: ns.pillFill, ...(ns.pillBorder ? { backgroundStroke: ns.pillBorder } : {}),
            backgroundRadius: 4.5, backgroundPadX: 5, backgroundPadY: 1,
          },
        });
        continue;
      }
      styledParts.push({
        ...part,
        geometry: {
          ...part.geometry,
          fill: isSecondary ? (ns?.secondaryTextColor ?? palette.softInk) : (ns?.textColor ?? palette.ink),
          ...(isSecondary && hasCardMeta && part.role === 'node-label' ? { fontSize: Math.max(11, part.geometry.fontSize - 1.5), fontWeight: 400 } : {}),
        },
      });
      continue;
    }

    styledParts.push(part);
  }

  const partIndex: Record<string, number> = {};
  const ownerPartIds: Record<string, string[]> = Object.create(null);
  styledParts.forEach((p, idx) => {
    partIndex[p.id] = idx;
    const key = `${p.owner.kind}:${p.owner.id}`;
    (ownerPartIds[key] ??= []).push(p.id);
  });

  return {
    ...scene,
    parts: styledParts, partIndex,
    ownerLookup: { ...scene.ownerLookup, partIds: ownerPartIds },
    renderStyle0214: model.name === 'anemone' ? 'anemone' : scene.renderStyle0214 ?? scene.style,
    background0214: palette.background,
    parrotfishModel0214: model.name,
    ...(canvasPattern ? { canvasPattern0216: canvasPattern } : {}),
    ...(usesElevation ? { elevationTheme0216: theme } : {}),
  };
}
