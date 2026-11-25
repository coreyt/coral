/**
 * Pure presentation model engine for Parrotfish and the Anemone output style.
 *
 * Strictly owns presentation (style, colors, strokes, accents, decorative
 * symbol glyphs, typography colors, edge/marker colors) and NEVER alters
 * layout coordinates, flow direction, port contacts, or edge routes.
 */
import type { GraphEdge, GraphNode } from './types.js';
import type { ScenePartRecord028 } from './renderScene028.js';
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
  /** Decorative symbol/glyph override (leaves node frame and ports untouched). */
  readonly symbolGlyph?: ParrotfishSymbolGlyph;
}

export interface ParrotfishEdgeStyle {
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly dash?: string;
  readonly labelColor?: string;
  readonly labelBackground?: string;
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
  readonly edgeLabelBackground: string;
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

export interface ParrotfishModel {
  readonly name: string;
  /** Optional base preset to inherit palettes and rules from. */
  readonly extends?: 'anemone' | 'ane' | 'monochrome';
  readonly light?: Partial<ParrotfishPalette>;
  readonly dark?: Partial<ParrotfishPalette>;
  /** Static node style rules keyed by `symbolId`, `type`, or node `id`. */
  readonly nodes?: Readonly<Record<string, ParrotfishNodeStyle>>;
  /** Dynamic per-node presentation resolver (cannot alter geometry). */
  readonly resolveNode?: (ctx: ParrotfishNodeContext) => ParrotfishNodeStyle | undefined;
  /** Static edge style rules keyed by `relationType` or edge `id`. */
  readonly edges?: Readonly<Record<string, ParrotfishEdgeStyle>>;
  /** Dynamic per-edge presentation resolver (cannot alter routing). */
  readonly resolveEdge?: (ctx: ParrotfishEdgeContext) => ParrotfishEdgeStyle | undefined;
  /** Optional decorative symbol glyph overrides keyed by `symbolId`, `type`, or node `id`. */
  readonly symbols?: Readonly<Record<string, ParrotfishSymbolGlyph>>;
}

export type ParrotfishPresetName = 'anemone' | 'ane' | 'monochrome';
export type ParrotfishModelInput = ParrotfishPresetName | ParrotfishModel;

export const ANEMONE_LIGHT_PALETTE_0214: ParrotfishPalette = Object.freeze({
  background: '#fcfcfd',
  paper: '#ffffff',
  ink: '#16202e',
  softInk: '#4b5b70',
  edge: '#475569',
  containerFill: '#f4f7fb',
  containerNestedFill: '#edf4f7',
  containerStroke: '#94a3b8',
  containerDasharray: '6 4',
  containerLabelColor: '#334155',
  edgeLabelBackground: '#fcfcfd',
});

export const ANEMONE_DARK_PALETTE_0214: ParrotfishPalette = Object.freeze({
  background: '#0f172a',
  paper: '#162032',
  ink: '#f1f5f9',
  softInk: '#94a3b8',
  edge: '#94a3b8',
  containerFill: '#131d31',
  containerNestedFill: '#17253d',
  containerStroke: '#475569',
  containerDasharray: '6 4',
  containerLabelColor: '#cbd5e1',
  edgeLabelBackground: '#0f172a',
});

const MONO_LIGHT: ParrotfishPalette = Object.freeze({
  background: '#ffffff',
  paper: '#ffffff',
  ink: '#22272b',
  softInk: '#858a8e',
  edge: '#22272b',
  containerFill: 'none',
  containerNestedFill: 'none',
  containerStroke: '#22272b',
  containerLabelColor: '#22272b',
  edgeLabelBackground: '#ffffff',
});

const MONO_DARK: ParrotfishPalette = Object.freeze({
  background: '#1e1e1e',
  paper: '#1e1e1e',
  ink: '#f1f5f9',
  softInk: '#a9bfdc',
  edge: '#f1f5f9',
  containerFill: 'none',
  containerNestedFill: 'none',
  containerStroke: '#f1f5f9',
  containerLabelColor: '#f1f5f9',
  edgeLabelBackground: '#1e1e1e',
});

type RoleTone = 'coral' | 'teal' | 'indigo' | 'amber' | 'violet' | 'sky' | 'emerald' | 'stone' | 'aws' | 'azure' | 'gcp';

const mkTone = (
  fill: string, stroke: string, textColor: string, accentColor: string,
  accentPosition: 'left' | 'top' = 'left', strokeDasharray?: string,
): ParrotfishNodeStyle => ({
  fill, stroke, textColor, accentColor, accentPosition, glyphStroke: stroke, glyphFill: stroke,
  ...(strokeDasharray ? { strokeDasharray } : {}),
});

const TONE_STYLES: Readonly<Record<'light' | 'dark', Readonly<Record<RoleTone, ParrotfishNodeStyle>>>> = {
  light: {
    coral: mkTone('#fff1f2', '#be123c', '#4c0519', '#e11d48'),
    teal: mkTone('#f0fdfa', '#0f766e', '#0f2933', '#0d9488'),
    indigo: mkTone('#eef2ff', '#3730a3', '#1e1b4b', '#4f46e5'),
    amber: mkTone('#fffbeb', '#b45309', '#451a03', '#d97706'),
    violet: mkTone('#f5f3ff', '#6d28d9', '#2e1065', '#7c3aed'),
    sky: mkTone('#f0f9ff', '#0369a1', '#0c2d48', '#0284c7'),
    emerald: mkTone('#ecfdf5', '#047857', '#064e3b', '#059669'),
    stone: mkTone('#f8fafc', '#64748b', '#334155', '#64748b', 'left', '6 3'),
    aws: mkTone('#fff7ed', '#c2410c', '#431407', '#ea580c', 'top'),
    azure: mkTone('#f0f9ff', '#0369a1', '#082f49', '#0284c7', 'top'),
    gcp: mkTone('#eff6ff', '#1d4ed8', '#172554', '#2563eb', 'top'),
  },
  dark: {
    coral: mkTone('#2c131c', '#fb7185', '#ffe4e6', '#f43f5e'),
    teal: mkTone('#102a2e', '#2dd4bf', '#ccfbf1', '#14b8a6'),
    indigo: mkTone('#1b1d3d', '#818cf8', '#e0e7ff', '#6366f1'),
    amber: mkTone('#2c2010', '#fbbf24', '#fef3c7', '#f59e0b'),
    violet: mkTone('#23183b', '#a78bfa', '#ede9fe', '#8b5cf6'),
    sky: mkTone('#0f2537', '#38bdf8', '#e0f2fe', '#0ea5e9'),
    emerald: mkTone('#0e2920', '#34d399', '#d1fae5', '#10b981'),
    stone: mkTone('#1e293b', '#94a3b8', '#e2e8f0', '#94a3b8', 'left', '6 3'),
    aws: mkTone('#2d1c10', '#fb923c', '#ffedd5', '#f97316', 'top'),
    azure: mkTone('#0f2537', '#38bdf8', '#e0f2fe', '#0ea5e9', 'top'),
    gcp: mkTone('#152242', '#60a5fa', '#dbeafe', '#3b82f6', 'top'),
  },
};

function classifyAnemoneTone(ctx: ParrotfishNodeContext): RoleTone | undefined {
  const key = `${ctx.symbolId ?? ''} ${ctx.type ?? ''}`.toLowerCase();
  const provider = String((ctx.node.properties as Record<string, unknown> | undefined)?.provider ?? '').toLowerCase();
  if (provider === 'aws' || key.includes('aws')) return 'aws';
  if (provider === 'azure' || key.includes('azure')) return 'azure';
  if (provider === 'gcp' || key.includes('gcp')) return 'gcp';
  if (/\b(person|actor|user|client)\b/.test(key) || key.includes('arch-actor') || key.includes('arch-person')) return 'coral';
  if (/\b(external|externalsystem|thirdparty)\b/.test(key) || key.includes('arch-external')) return 'stone';
  if (/\b(database|store|storage|cache|warehouse|lake|bucket|db|erd-entity|entity|table)\b/.test(key)) return 'amber';
  if (/\b(queue|broker|event-bus|eventbus|stream|topic|kafka|pubsub|bus)\b/.test(key)) return 'violet';
  if (/\b(gateway|load-balancer|loadbalancer|cdn|waf|firewall|ingress|dns|proxy|router|network)\b/.test(key)) return 'sky';
  if (/\b(system|agent|orchestrator|llm|model|brain|cluster|k8s|kubernetes)\b/.test(key)) return 'indigo';
  if (/\b(start|begin|input|source|ingest|trigger)\b/.test(key)) return 'emerald';
  if (/\b(end|stop|error|reject|alert|fail|terminate)\b/.test(key)) return 'coral';
  if (/\b(decision|gateway|condition|branch|check|note|annotation|callout)\b/.test(key)) return 'amber';
  return 'teal';
}

export const ANEMONE_MODEL_0214: ParrotfishModel = Object.freeze<ParrotfishModel>({
  name: 'anemone',
  light: ANEMONE_LIGHT_PALETTE_0214,
  dark: ANEMONE_DARK_PALETTE_0214,
  resolveNode(ctx: ParrotfishNodeContext) {
    if (ctx.container) return undefined;
    const tone = classifyAnemoneTone(ctx);
    return tone ? TONE_STYLES[ctx.theme][tone] : undefined;
  },
  resolveEdge(ctx: ParrotfishEdgeContext) {
    const rel = (ctx.relationType ?? '').toLowerCase();
    const dark = ctx.theme === 'dark';
    if (rel === 'async' || rel === 'event' || rel === 'stream' || rel === 'stream-flow' || rel === 'streamflow') {
      return { stroke: dark ? '#a78bfa' : '#6d28d9', labelColor: dark ? '#ddd6fe' : '#5b21b6' };
    }
    if (rel === 'data' || rel === 'data-flow' || rel === 'dataflow' || rel === 'reads' || rel === 'writes') {
      return { stroke: dark ? '#fbbf24' : '#b45309', labelColor: dark ? '#fde68a' : '#92400e' };
    }
    if (rel === 'error' || rel === 'fail' || rel === 'reject') {
      return { stroke: dark ? '#fb7185' : '#be123c', labelColor: dark ? '#fecdd3' : '#9f1239' };
    }
    return undefined;
  },
});

export const MONOCHROME_MODEL_0214: ParrotfishModel = Object.freeze({
  name: 'monochrome',
  light: MONO_LIGHT,
  dark: MONO_DARK,
});

export function resolveParrotfishModel(input: ParrotfishModelInput): ParrotfishModel {
  if (input === 'anemone' || input === 'ane') return ANEMONE_MODEL_0214;
  if (input === 'monochrome') return MONOCHROME_MODEL_0214;
  if (!input.extends) return input;
  const base = resolveParrotfishModel(input.extends);
  return {
    name: input.name,
    light: { ...base.light, ...input.light },
    dark: { ...base.dark, ...input.dark },
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
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    depth += 1;
    cur = byId.get(cur)?.parent;
  }
  return depth;
}

/**
 * Pure presentation transform on an already-prepared spatial scene.
 * Preserves exact node positions, dimensions, viewport, bounds, portContacts,
 * and edge route geometry (`d` and points) while applying modeled styling.
 */
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
  };

  const placedById = new Map(scene.nodes.map((n) => [n.node.id, n] as const));
  const rawNodeById = new Map(scene.nodes.map((n) => [n.node.id, n.node] as const));
  const resolvedNodeById = new Map(scene.resolved.nodes.map((n) => [n.id, n] as const));
  const resolvedEdgeById = new Map(scene.resolved.edges.map((e) => [e.id, e] as const));
  const semanticEdgeById = new Map(scene.semantic.edges.map((e) => [e.id, e] as const));

  const nodeStyleMap = new Map<string, ParrotfishNodeStyle>();
  for (const rn of scene.resolved.nodes) {
    const raw = rawNodeById.get(rn.id);
    if (!raw) continue;
    const ctx: ParrotfishNodeContext = {
      id: rn.id,
      notationId: scene.notationId,
      type: raw.type,
      symbolId: rn.symbolId,
      container: Boolean(rn.container),
      nestingDepth: nodeNestingDepth(raw, rawNodeById),
      theme,
      node: raw,
    };
    const bySymbol = rn.symbolId ? model.nodes?.[rn.symbolId] : undefined;
    const byType = raw.type ? model.nodes?.[raw.type] : undefined;
    const byId = model.nodes?.[rn.id];
    const dyn = model.resolveNode?.(ctx);
    const glyphOverride = model.symbols?.[rn.id]
      ?? (rn.symbolId ? model.symbols?.[rn.symbolId] : undefined)
      ?? (raw.type ? model.symbols?.[raw.type] : undefined);
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
      ...bySymbol,
      ...byType,
      ...dyn,
      ...byId,
      ...metaStyle,
      ...(glyphOverride && !dyn?.symbolGlyph && !byId?.symbolGlyph ? { symbolGlyph: glyphOverride } : {}),
    });
  }

  const edgeStyleMap = new Map<string, ParrotfishEdgeStyle>();
  for (const re of scene.resolved.edges) {
    const relationType = semanticEdgeById.get(re.id)?.type;
    const raw: GraphEdge = {
      id: re.id,
      source: re.sourceId,
      target: re.targetId,
      ...(relationType ? { type: relationType } : {}),
      ...(re.label ? { label: re.label } : {}),
    };
    const ctx: ParrotfishEdgeContext = {
      id: re.id,
      notationId: scene.notationId,
      relationType,
      sourceId: re.sourceId,
      targetId: re.targetId,
      theme,
      edge: raw,
    };
    const byRel = relationType ? model.edges?.[relationType] : undefined;
    const byId = model.edges?.[re.id];
    const dyn = model.resolveEdge?.(ctx);
    edgeStyleMap.set(re.id, { ...byRel, ...dyn, ...byId });
  }

  const overriddenGlyphNodes = new Set<string>();
  const addedAccents = new Set<string>();
  const styledParts: ScenePartRecord028[] = [];

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
        styledParts.push({
          ...part,
          geometry: { ...part.geometry, stroke: markerStroke },
        });
      } else if (part.geometry.kind === 'text') {
        styledParts.push({
          ...part,
          geometry: {
            ...part.geometry,
            fill: es?.labelColor ?? palette.ink,
            background: es?.labelBackground ?? part.geometry.background ?? palette.edgeLabelBackground,
          },
        });
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
      const fill = isContainer
        ? (ns?.fill ?? (placed && nodeNestingDepth(placed.node, rawNodeById) > 0 ? palette.containerNestedFill : palette.containerFill))
        : (part.geometry.fill === 'none' ? 'none' : (ns?.fill ?? palette.paper));
      const stroke = isContainer
        ? (ns?.stroke ?? palette.containerStroke)
        : (ns?.stroke ?? palette.ink);
      const strokeDasharray = isContainer
        ? (ns?.strokeDasharray ?? part.geometry.strokeDasharray ?? palette.containerDasharray)
        : (ns?.strokeDasharray ?? part.geometry.strokeDasharray);
      const strokeWidth = ns?.strokeWidth !== undefined
        ? ns.strokeWidth / part.geometry.transform.scale
        : part.geometry.strokeWidth;
      styledParts.push({
        ...part,
        geometry: {
          ...part.geometry,
          fill,
          stroke,
          strokeWidth,
          ...(strokeDasharray ? { strokeDasharray } : {}),
        },
      });

      if (!isContainer && part.role === 'outline' && !addedAccents.has(part.owner.id)
        && rn?.shapeId === 'rectangle' && !rn.artwork029
        && ns?.accentColor && ns.accentPosition && ns.accentPosition !== 'none' && placed) {
        addedAccents.add(part.owner.id);
        const ax = part.bounds.x;
        const ay = part.bounds.y;
        const aw = part.bounds.width;
        const ah = part.bounds.height;
        const thickness = ns.accentThickness ?? 3.5;
        const inset = Math.min(8, Math.max(4, Math.min(aw, ah) * 0.14));
        const r = Math.min(2, thickness / 2);
        const accentD = ns.accentPosition === 'top'
          ? `M${inset} ${1 + r} Q${inset} 1 ${inset + r} 1 H${aw - inset - r} Q${aw - inset} 1 ${aw - inset} ${1 + r} V${1 + thickness - r} Q${aw - inset} ${1 + thickness} ${aw - inset - r} ${1 + thickness} H${inset + r} Q${inset} ${1 + thickness} ${inset} ${1 + thickness - r} Z`
          : `M${1 + r} ${inset} H${1 + thickness - r} Q${1 + thickness} ${inset} ${1 + thickness} ${inset + r} V${ah - inset - r} Q${1 + thickness} ${ah - inset} ${1 + thickness - r} ${ah - inset} H${1 + r} Q1 ${ah - inset} 1 ${ah - inset - r} V${inset + r} Q1 ${inset} ${1 + r} ${inset} Z`;
        styledParts.push({
          id: `${part.owner.id}:parrotfish-accent`,
          owner: part.owner,
          role: 'glyph',
          bounds: ns.accentPosition === 'top'
            ? { x: ax + inset, y: ay + 1, width: Math.max(0, aw - inset * 2), height: thickness }
            : { x: ax + 1, y: ay + inset, width: thickness, height: Math.max(0, ah - inset * 2) },
          geometry: {
            kind: 'decoration-path',
            d: accentD,
            fill: ns.accentColor,
            stroke: 'none',
            strokeWidth: 0,
            name: 'Accent',
            transform: { x: ax, y: ay, scaleX: 1, scaleY: 1 },
          },
          presentationOnly: true,
        });
      }

      if (!isContainer && part.role === 'outline' && ns?.symbolGlyph && !rn?.glyph && !overriddenGlyphNodes.has(part.owner.id) && placed) {
        overriddenGlyphNodes.add(part.owner.id);
        const [, , gw, gh] = ns.symbolGlyph.viewBox.split(/\s+/).map(Number);
        const glyphSize = Math.min(18, part.bounds.height / 3);
        const gx = part.bounds.x + (ns.accentPosition === 'left' ? 10 : 8);
        const gy = part.bounds.y + (ns.accentPosition === 'top' ? 10 : 8);
        ns.symbolGlyph.paths.forEach((p, idx) => styledParts.push({
          id: `${part.owner.id}:parrotfish-glyph:${idx + 1}`,
          owner: part.owner,
          role: 'glyph',
          bounds: { x: gx, y: gy, width: glyphSize, height: glyphSize },
          geometry: {
            kind: 'decoration-path',
            d: p.d,
            fill: p.filled ? (ns.glyphFill ?? ns.stroke ?? palette.ink) : 'none',
            stroke: ns.glyphStroke ?? ns.stroke ?? palette.ink,
            strokeWidth: 1.5,
            name: ns.symbolGlyph!.name,
            transform: { x: gx, y: gy, scaleX: glyphSize / (gw || 24), scaleY: glyphSize / (gh || 24) },
          },
          presentationOnly: true,
        }));
      }
      continue;
    }

    if (part.geometry.kind === 'decoration-path') {
      if (part.role === 'glyph' && ns?.symbolGlyph) {
        if (!overriddenGlyphNodes.has(part.owner.id)) {
          overriddenGlyphNodes.add(part.owner.id);
          const [, , gw, gh] = ns.symbolGlyph.viewBox.split(/\s+/).map(Number);
          const glyphSize = Math.min(20, part.bounds.width || 18);
          ns.symbolGlyph.paths.forEach((p, idx) => styledParts.push({
            id: `${part.owner.id}:glyph:${idx + 1}`,
            owner: part.owner,
            role: 'glyph',
            bounds: part.bounds,
            geometry: {
              kind: 'decoration-path',
              d: p.d,
              fill: p.filled ? (ns.glyphFill ?? ns.stroke ?? palette.ink) : 'none',
              stroke: ns.glyphStroke ?? ns.stroke ?? palette.ink,
              strokeWidth: 1.5,
              name: ns.symbolGlyph!.name,
              transform: { x: part.bounds.x, y: part.bounds.y, scaleX: glyphSize / (gw || 24), scaleY: glyphSize / (gh || 24) },
            },
            presentationOnly: false,
          }));
        }
        continue;
      }
      const gStroke = ns?.glyphStroke ?? ns?.stroke ?? palette.ink;
      const gFill = part.geometry.fill === 'none' ? 'none' : (ns?.glyphFill ?? gStroke);
      styledParts.push({
        ...part,
        geometry: { ...part.geometry, fill: gFill, stroke: gStroke },
      });
      continue;
    }

    if (part.geometry.kind === 'divider') {
      styledParts.push({
        ...part,
        geometry: { ...part.geometry, stroke: ns?.stroke ?? palette.containerStroke },
      });
      continue;
    }

    if (part.geometry.kind === 'artwork') {
      styledParts.push({
        ...part,
        geometry: {
          ...part.geometry,
          ...(part.geometry.tint ? { tint: ns?.stroke ?? palette.ink } : {}),
        },
      });
      continue;
    }

    if (part.geometry.kind === 'text') {
      const hasCardMeta = Boolean(placed && (
        (typeof placed.node.properties?.technology === 'string' && placed.node.properties.technology.length > 0) ||
        (typeof placed.node.description === 'string' && placed.node.description.length > 0)
      ));
      const isSecondaryLine = part.role === 'classifier-stereotype' ||
        (hasCardMeta && part.role === 'node-label' && !part.id.endsWith(':label:1'));
      const fill = isContainer
        ? (ns?.textColor ?? palette.containerLabelColor)
        : isSecondaryLine
          ? (ns?.secondaryTextColor ?? palette.softInk)
          : (ns?.textColor ?? palette.ink);
      styledParts.push({
        ...part,
        geometry: { ...part.geometry, fill },
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
    parts: styledParts,
    partIndex,
    ownerLookup: { ...scene.ownerLookup, partIds: ownerPartIds },
    renderStyle0214: model.name === 'anemone' ? 'anemone' : scene.renderStyle0214 ?? scene.style,
    background0214: palette.background,
    parrotfishModel0214: model.name,
  };
}
