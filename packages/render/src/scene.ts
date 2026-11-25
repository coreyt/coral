import { containerStencilShape028, isContainerNode028 } from './containerGeometry028.js';
import { svgPathContour028 } from './svgPathContour028.js';
import { finalSceneRouteIssues028, sceneNodeContour029 } from './sceneRouteValidation028.js';
import { validateRouteSections } from './layout/routeGeometry.js';
import type { Classifier, EdgeLabelPlacement, EndpointMarker, GraphEdge, GraphNode, NotationProfile, Position, RelationshipEnd } from '@graph-ir/core';
import type { LayoutDirection, LayoutSection } from './layout/types.js';
import { glyphRegistry, type GlyphDefinition } from './glyphs/index.js';
import { notationRegistry } from './notations/index.js';
import { resolveNotationNode028 } from './notations/index.js';
import { shapeRegistry } from './shapes/index.js';
import { symbolRegistry } from './symbols/index.js';
import type { NotationEdgeStyle, ShapeDefinition, SymbolDefinition } from './types.js';
import { measureText } from './text/metrics.js';
import { effectiveGraphNotationId028 } from './graphNotation028.js';
import { resolveBpmnConnector028 } from './bpmnConnector028.js';
import { roundedRectanglePath028 } from './roundedRectanglePath028.js';
import { stencilFit028, stencilFitPoint028, stencilRayPoint028 } from './stencilAnchorGeometry028.js';
import { stencilCaptionHeight028 } from './stencilLabelGeometry028.js';
import { bpmnEventFrame028, isBpmnEventSymbol028 } from './bpmnEventVisual028.js';
import { bpmnGatewayFrame028, isBpmnGatewaySymbol028 } from './bpmnGatewayVisual028.js';
import type { SourceEdgeDirection028 } from './sourceDirection028.js';
import type { CatalogSnapshot028, NodeInterpretation028 } from './interpretation028.js';
import { catalogShape029, catalogSymbol029, escapeOffsets029, sceneNodeShape029 } from './catalogLookup029.js';
import { frameFitPoint029, isUserOutlineShape029, type UserOutline029 } from './userSymbolGeometry029.js';

export interface RenderThemeFallback {
  fill: string; stroke: string; text: string; edge: string;
}
export interface ResolvedNodeAppearance {
  symbolId?: string; shapeId: string;
  shapeParameters?: Record<string, number | string | boolean>;
  style: { fill: string; stroke: string; strokeWidth: number; strokeDasharray?: string; doubleOutline?: boolean };
  text: { color: string; fontStyle?: 'italic'; textDecoration?: 'underline' };
  glyph?: GlyphDefinition; symbolMarker?: string;
  /** User-symbol frame outline; contacts and the artwork clip rebuild the shape from it. */
  outline029?: UserOutline029;
  /** User-symbol artwork drawn in place of the shape path, and the definition's label side. */
  artwork029?: { localId: string; tint: 'none' | 'stroke'; label: 'above' | 'below' | 'left' | 'right' | 'center' };
}
export interface ResolvedEndpoint {
  role?: string; multiplicity?: string;
  navigability?: RelationshipEnd['navigability']; marker?: EndpointMarker;
}
export interface ResolvedEdgeAppearance {
  style: { stroke: string; strokeWidth: number; lineStyle: 'solid' | 'dashed' | 'dotted'; strokeDasharray?: string };
  source: ResolvedEndpoint; target: ResolvedEndpoint;
}
export interface MarkerPrimitive { d: string; filled: boolean; }
export interface EndpointLabel {
  endpoint: 'source' | 'target'; kind: 'role' | 'multiplicity'; text: string; x: number; y: number;
}
export interface RenderSceneNode extends ResolvedNodeAppearance {
  id: string; label: string; x: number; y: number; width: number; height: number;
  classifier?: ClassifierPresentation;
  /** Derived frame behavior; never persisted into authored graph meaning. */
  container?: boolean;
  parentId?: string;
}
export interface RenderSceneEdge extends ResolvedEdgeAppearance {
  id: string; sourceId: string; targetId: string; points: Position[]; label?: string; labelPlacement?: EdgeLabelPlacement; endpointLabels: EndpointLabel[];
  /** Generated route elbows may be softened; authored waypoints remain exact. */
  generatedRoute?: boolean;
  /** The first (source) or last (target) segment is an interior anchor's escape. */
  escape029?: { source?: true; target?: true };
}
export interface RenderScene { nodes: RenderSceneNode[]; edges: RenderSceneEdge[]; }

export interface RenderCapabilityDiagnostic {
  code: 'render.capability.unknown-profile' | 'render.capability.unknown-symbol' |
    'render.capability.unknown-variant' | 'render.capability.unknown-shape' |
    'render.capability.profile-contradiction' | 'render.capability.missing-endpoint' |
    'render.capability.semantic-manifest' | 'render.capability.scene-bounds' |
    'render.capability.scene-layout' | 'render.capability.scene-ids' |
    'render.capability.hard-size-text-conflict' | 'render.capability.route' |
    'render.capability.stencil' | 'render.capability.scene-kind' |
    'render.capability.character-only-edition' |
    'coral.port.anchor.symbol-unknown' | 'coral.port.anchor.symbol-unavailable' |
    'coral.port.duplicate';
  message: string;
  nodeId?: string;
  subject?: { kind: 'graph' | 'node' | 'edge' | 'port' | 'sequence'; id: string };
}

export class RenderCapabilityError extends Error {
  readonly diagnostics: readonly RenderCapabilityDiagnostic[];
  constructor(diagnostics: readonly RenderCapabilityDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('; '));
    this.name = 'RenderCapabilityError';
    this.diagnostics = diagnostics;
  }
}

function missingSymbolShape028(nodeId: string, symbol: SymbolDefinition | undefined,
  catalog?: CatalogSnapshot028): RenderCapabilityDiagnostic | undefined {
  if (!symbol || catalogShape029(symbol.shape, catalog)) return undefined;
  return { code: 'render.capability.unknown-shape', nodeId,
    subject: { kind: 'node', id: nodeId },
    message: `render.capability.unknown-shape: node ${nodeId}: symbol ${symbol.id} references unavailable shape ${symbol.shape}` };
}

/** Reject competing UML family identities before any consumer projects a view. */
export function assertProfileNotationAgreement028(notationId?: string, profile?: NotationProfile): void {
  if (profile && notationId && notationId !== `uml-${profile.kind}`) {
    throw new RenderCapabilityError([{
      code: 'render.capability.profile-contradiction',
      message: `render.capability.profile-contradiction: notation ${notationId} contradicts ${profile.id} ${profile.kind}`,
    }]);
  }
}

/** Reject unavailable visual editions and meaning the shared U1 resolver cannot interpret. */
export function assertRenderableInterpretation028(
  nodes: readonly GraphNode[], notationId?: string, profile?: NotationProfile, catalog?: CatalogSnapshot028,
): void {
  assertProfileNotationAgreement028(notationId, profile);
  if (notationId === 'uml-state') throw new RenderCapabilityError([{
    code: 'render.capability.character-only-edition',
    message: 'render.capability.character-only-edition: UML state supports source and character output; SVG and visual editor display are unavailable.',
  }]);
  if (notationId && !notationRegistry.get(notationId)) throw new RenderCapabilityError([{
    code: 'render.capability.unknown-profile',
    message: `render.capability.unknown-profile: notation ${notationId} is unavailable`,
  }]);
  const diagnostics: RenderCapabilityDiagnostic[] = [];
  const walk = (items: readonly GraphNode[]): void => {
    for (const node of items) {
      if (notationId) {
        const resolution = resolveNotationNode028(node, notationId, catalog);
        if (resolution.status === 'unknown-symbol' || resolution.status === 'unknown-variant') {
          const code = resolution.status === 'unknown-symbol'
            ? 'render.capability.unknown-symbol' : 'render.capability.unknown-variant';
          diagnostics.push({ code, nodeId: node.id, subject: { kind: 'node', id: node.id },
            message: `${code}: node ${node.id}: ${resolution.diagnostics.map((item) => item.message).join('; ')}` });
        }
        const shapeIssue = missingSymbolShape028(node.id,
          resolution.effectiveSymbolId ? catalogSymbol029(resolution.effectiveSymbolId, catalog) : undefined, catalog);
        if (shapeIssue) diagnostics.push(shapeIssue);
      } else {
        const symbol = node.symbol === undefined ? undefined : symbolRegistry.get(node.symbol);
        const code = node.symbol !== undefined && node.symbol !== '' && !symbol
          ? 'render.capability.unknown-symbol'
          : node.variant !== undefined && !symbol?.variants?.[node.variant]
            ? 'render.capability.unknown-variant' : undefined;
        if (code) diagnostics.push({ code, nodeId: node.id, subject: { kind: 'node', id: node.id },
          message: `${code}: node ${node.id}: ${code === 'render.capability.unknown-symbol'
            ? `Unknown symbol ${node.symbol}` : `Unknown variant ${node.variant} for ${node.symbol ?? node.type}`}` });
        const shapeIssue = missingSymbolShape028(node.id, symbol);
        if (shapeIssue) diagnostics.push(shapeIssue);
      }
      walk(node.children ?? []);
    }
  };
  walk(nodes);
  if (diagnostics.length) throw new RenderCapabilityError(diagnostics);
}

export interface ClassifierPresentation {
  stereotype?: string;
  name: string;
  abstract: boolean;
  static: boolean;
  compartments: Array<{ id: string; kind: 'attributes' | 'operations' | 'literals'; rows: string[] }>;
  accessibleName: string;
}

const visibilitySign = { public: '+', private: '-', protected: '#', package: '~' } as const;
export function classifierPresentation(classifier: Classifier | undefined): ClassifierPresentation | undefined {
  if (!classifier) return undefined;
  const compartments = classifier.compartments.flatMap((part) => {
    if (part.kind === 'name') return [];
    const rows = part.items.map((item) => {
      if (item.kind === 'literal') return `${item.name}${item.value === undefined ? '' : ` = ${item.value}`}`;
      const sign = item.visibility ? `${visibilitySign[item.visibility]} ` : '';
      const modifiers = item.modifiers?.length ? ` {${item.modifiers.join(', ')}}` : '';
      if (item.kind === 'attribute') return `${sign}${item.name}${item.type ? `: ${item.type}` : ''}${modifiers}`;
      const params = item.parameters.map((parameter) => `${parameter.name}${parameter.type ? `: ${parameter.type}` : ''}`).join(', ');
      return `${sign}${item.name}(${params})${item.returnType ? `: ${item.returnType}` : ''}${modifiers}`;
    });
    return [{ id: part.id, kind: part.kind, rows }];
  });
  const stereotype = classifier.kind === 'interface' ? '«interface»' : classifier.kind === 'enum' ? '«enumeration»' : undefined;
  const modifiers = classifier.modifiers ?? [];
  return {
    ...(stereotype ? { stereotype } : {}), name: classifier.name,
    abstract: modifiers.includes('abstract'), static: modifiers.includes('static'), compartments,
    accessibleName: [stereotype, classifier.name, ...modifiers, ...compartments.flatMap((part) => part.rows)].filter(Boolean).join(', '),
  };
}

/** Edition 0.2.14 Crow's Foot ERD tabular entity presentation from `node.properties.erdColumns0214`. */
export function erdEntityPresentation0214(node: GraphNode): ClassifierPresentation | undefined {
  const cols = node.properties?.erdColumns0214 as Array<{ name: string; type: string; flags: string[] }> | undefined;
  if (!Array.isArray(cols) || !cols.length) return undefined;
  const stereotype = node.type === 'weakEntity' ? '«weak»' : node.type === 'view' ? '«view»' : undefined;
  const name = node.label ?? node.id;
  const rows = cols.map((col) => {
    const keys = col.flags.filter((f) => f === 'pk' || f === 'fk' || f === 'uk').map((f) => f.toUpperCase());
    const nullable = col.flags.includes('null');
    const badge = keys.length ? `${keys.join(',')} ` : '';
    return `${badge}${col.name}: ${col.type}${nullable ? '?' : ''}`;
  });
  return {
    ...(stereotype ? { stereotype } : {}),
    name,
    abstract: false,
    static: false,
    compartments: [{ id: 'columns', kind: 'attributes', rows }],
    accessibleName: [stereotype, name, ...rows].filter(Boolean).join(', '),
  };
}

/** Unified tabular presentation for UML classifiers and Crow's Foot ERD entities. */
export function effectiveClassifierPresentation0214(node: GraphNode): ClassifierPresentation | undefined {
  return classifierPresentation(node.classifier) ?? erdEntityPresentation0214(node);
}

/** Deterministic minimum bounds for a precomputed ClassifierPresentation (UML or ERD). */
export function classifierPresentationMinimumSize0214(
  presentation: ClassifierPresentation | undefined,
  options: { fontSize?: number; fontFamily?: string; fontWeight?: string | number; lineHeight?: number } = {},
): { width: number; height: number } | undefined {
  if (!presentation) return undefined;
  const fontSize = options.fontSize ?? 12;
  const lineHeight = options.lineHeight ?? 1.4;
  const lines = [
    ...(presentation.stereotype ? [presentation.stereotype] : []),
    presentation.name,
    ...presentation.compartments.flatMap((part) => part.rows),
  ];
  const contentWidth = lines.reduce((maximum, line) => Math.max(maximum, measureText({
    text: line,
    fontSize,
    fontFamily: options.fontFamily,
    fontWeight: options.fontWeight,
    lineHeight,
  }).width), 0);
  const lineHeightPixels = Math.ceil(fontSize * lineHeight);
  const emptyCompartments = presentation.compartments.filter((part) => part.rows.length === 0).length;
  return {
    width: Math.max(180, Math.ceil(contentWidth + 32)),
    height: Math.max(96, (lines.length + emptyCompartments) * lineHeightPixels +
      presentation.compartments.length * 5 + 18),
  };
}

/** Deterministic minimum bounds for every visible classifier row and separator. */
export function classifierMinimumSize(
  classifier: Classifier | undefined,
  options: { fontSize?: number; fontFamily?: string; fontWeight?: string | number; lineHeight?: number } = {},
): { width: number; height: number } | undefined {
  const presentation = classifierPresentation(classifier);
  if (!presentation) return undefined;
  const base = classifierPresentationMinimumSize0214(presentation, options)!;
  return { width: base.width, height: Math.max(120, base.height - 2) };
}

/** Match the painted rectangle's aspect-preserving fit before layout and routing. */
export function fitClassifierFrame028(
  classifier: Classifier | undefined,
  shapeId: string,
  size: { width: number; height: number },
): { width: number; height: number } {
  if (!classifier || shapeId !== 'rectangle') return size;
  const [, , shapeWidth, shapeHeight] = shapeRegistry.get(shapeId)!.viewBox
    .trim().split(/[\s,]+/).map(Number);
  const ratio = shapeWidth! / shapeHeight!;
  const width = Math.ceil(Math.max(size.width, size.height * ratio));
  return { width, height: Math.ceil(width / ratio) };
}

/** Reserve the aspect-fitted rectangle outline around an adaptive text box. */
export function fitPlainRectangleInk028(
  classifier: Classifier | undefined,
  shapeId: string,
  size: { width: number; height: number },
): { width: number; height: number } {
  if (classifier || shapeId !== 'rectangle') return size;
  const [, , shapeWidth, shapeHeight] = shapeRegistry.get(shapeId)!.viewBox
    .trim().split(/[\s,]+/).map(Number);
  const width = Math.ceil(Math.max(size.width, size.height * shapeWidth! / shapeHeight!));
  return { width, height: Math.ceil(width * shapeHeight! / shapeWidth!) };
}

/** Edition 0.2.14 display label combining title with optional technology and description. */
export function nodeDisplayText0214(node: GraphNode): string {
  const base = node.label ?? node.id;
  if (node.classifier) return base;
  const tech = typeof node.properties?.technology === 'string' && node.properties.technology.length
    ? node.properties.technology : undefined;
  const desc = typeof node.description === 'string' && node.description.length
    ? node.description : undefined;
  if (!tech && !desc) return base;
  if (node.children?.length || isContainerNode028(node)) return tech ? `${base} [${tech}]` : base;
  return [base, ...(tech ? [`[${tech}]`] : []), ...(desc ? [desc] : [])].join('\n');
}

/** Edition 0.2.14 edge display label combining label with optional [technology]. */
export function edgeDisplayText0214(edge: GraphEdge): string | undefined {
  const tech = typeof edge.properties?.technology === 'string' && edge.properties.technology.length
    ? edge.properties.technology : undefined;
  if (!tech) return edge.label;
  return edge.label ? `${edge.label} [${tech}]` : `[${tech}]`;
}

export function renderSymbolId(node: GraphNode, notationId?: string, catalog?: CatalogSnapshot028): string | undefined {
  return notationId && notationRegistry.get(notationId)
    ? resolveNotationNode028(node, notationId, catalog).effectiveSymbolId : node.symbol;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}
function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function resolveSymbolDefaults(
  symbol: SymbolDefinition | undefined, variant: string | undefined,
): Record<string, unknown> {
  return { ...(symbol?.defaults ?? {}), ...(variant ? symbol?.variants?.[variant]?.defaults ?? {} : {}) };
}

export function resolveNodeAppearance(node: GraphNode, theme: RenderThemeFallback, notationId?: string,
  catalog?: CatalogSnapshot028): ResolvedNodeAppearance {
  const symbolId = renderSymbolId(node, notationId, catalog);
  const symbol = symbolId ? catalogSymbol029(symbolId, catalog) : undefined;
  const user = symbolId ? catalog?.userSymbols?.get(symbolId) : undefined;
  const shapeIssue = missingSymbolShape028(node.id, symbol, catalog);
  if (shapeIssue) throw new RenderCapabilityError([shapeIssue]);
  if (user && !user.artwork029) throw new RenderCapabilityError([{ code: 'render.capability.stencil',
    nodeId: node.id, subject: { kind: 'node', id: node.id },
    message: `render.capability.stencil: node ${node.id}: artwork for ${user.definition.symbolId} is unavailable` }]);
  const defaults = resolveSymbolDefaults(symbol, node.variant);
  const icon = node.variant ? symbol?.variants?.[node.variant]?.icon : undefined;
  if (symbol?.marker) symbolMarkerPrimitives(symbol.marker);
  return {
    ...(symbolId ? { symbolId } : {}),
    shapeId: symbol?.shape ?? 'rectangle',
    ...(numberValue(defaults.cornerRadius) !== undefined
      ? { shapeParameters: { cornerRadius: numberValue(defaults.cornerRadius)! } } : {}),
    // The outline is routing geometry and the artwork clip; it is never painted.
    ...(user ? { outline029: user.outline,
      artwork029: { localId: user.definition.id, tint: user.definition.tint, label: user.definition.label } } : {}),
    style: {
      fill: user ? 'none' : stringValue(defaults.fill) ?? theme.fill,
      stroke: stringValue(defaults.stroke) ?? theme.stroke,
      strokeWidth: numberValue(defaults.strokeWidth) ?? 1.5,
      ...(stringValue(defaults.strokeDasharray) ? { strokeDasharray: stringValue(defaults.strokeDasharray) } : {}),
      ...(typeof defaults.doubleOutline === 'boolean' ? { doubleOutline: defaults.doubleOutline } : {}),
    },
    text: {
      color: stringValue(defaults.color) ?? theme.text,
      ...(defaults.fontStyle === 'italic' ? { fontStyle: 'italic' as const } : {}),
      ...(defaults.textDecoration === 'underline' ? { textDecoration: 'underline' as const } : {}),
    },
    ...(icon ? { glyph: glyphRegistry.require(icon) } : {}),
    ...(symbol?.marker ? { symbolMarker: symbol.marker } : {}),
  };
}

export interface SymbolIndexEntry { id?: string; variant?: string; type?: string; }
export type SymbolIndex = ReadonlyMap<string, SymbolIndexEntry>;

export function resolveSymbolIndex(nodes: GraphNode[], notationId?: string,
  catalog?: CatalogSnapshot028): Map<string, SymbolIndexEntry> {
  const out = new Map<string, SymbolIndexEntry>();
  const walk = (items: GraphNode[]) => items.forEach((node) => {
    out.set(node.id, { id: renderSymbolId(node, notationId, catalog), variant: node.variant,
      type: node.type });
    walk(node.children ?? []);
  });
  walk(nodes);
  return out;
}

function catalogStyle(edge: GraphEdge, nodes: GraphNode[] | SymbolIndex, notationId?: string): NotationEdgeStyle | undefined {
  if (!notationId) return undefined;
  const notation = notationRegistry.get(notationId);
  if (!notation) return undefined;
  const styles = notation.edgeStyles ?? {};
  const symbols = Array.isArray(nodes) ? resolveSymbolIndex(nodes, notationId) : nodes as SymbolIndex;
  if (notationId === 'bpmn') {
    const relation = resolveBpmnConnector028(edge, symbols).effectiveRelation;
    // A presentation connection rule cannot silently supply BPMN semantics:
    // an untyped neutral/dashed/data connector stays visibly a draft.
    return relation === undefined ? undefined : styles[relation];
  }
  if (edge.type && styles[edge.type]) return styles[edge.type];
  const source = symbols.get(edge.source);
  const target = symbols.get(edge.target);
  const rule = notation.connectionRules.find((candidate) => candidate.from === source?.id
    && (!candidate.fromVariant || candidate.fromVariant === source?.variant)
    && !!target?.id && candidate.to.includes(target.id));
  if (rule?.edgeStyle) {
    const resolved = styles[rule.edgeStyle];
    if (!resolved) throw new Error(`render.catalog.invalid: ${notationId}.${rule.edgeStyle}`);
    return resolved;
  }
  if (typeof notation.defaultEdgeStyle !== 'string') return notation.defaultEdgeStyle;
  const resolved = styles[notation.defaultEdgeStyle];
  if (!resolved) throw new Error(`render.catalog.invalid: ${notationId}.${notation.defaultEdgeStyle}`);
  return resolved;
}

function legacyMarker(
  kind: NotationEdgeStyle['targetArrow'] | undefined,
  fill: NotationEdgeStyle['targetFill'] = 'unspecified',
): EndpointMarker | undefined {
  return kind ? { kind, fill } : undefined;
}
function multiplicity(end?: RelationshipEnd): string | undefined {
  if (!end?.multiplicity) return undefined;
  const { lower, upper } = end.multiplicity;
  return lower === upper ? String(lower) : `${lower}..${upper}`;
}
function endpoint(end: RelationshipEnd | undefined, fallback?: EndpointMarker): ResolvedEndpoint {
  const marker = end?.marker ?? fallback ?? (end?.navigability === 'navigable'
    ? { kind: 'arrow' as const, fill: 'open' as const } : undefined);
  return {
    ...(end?.role !== undefined ? { role: end.role } : {}),
    ...(multiplicity(end) !== undefined ? { multiplicity: multiplicity(end) } : {}),
    ...(end?.navigability !== undefined ? { navigability: end.navigability } : {}),
    ...(marker ? { marker } : {}),
  };
}

export function resolveEdgeAppearance(
  edge: GraphEdge, nodes: GraphNode[] | SymbolIndex, notationId: string | undefined, themeEdge: string,
  sourceDirection?: SourceEdgeDirection028,
): ResolvedEdgeAppearance {
  const catalog = catalogStyle(edge, nodes, notationId);
  const lineStyle = edge.style?.lineStyle ?? catalog?.lineStyle ?? 'solid';
  const strokeDasharray = lineStyle === 'dashed' ? '6,4' : lineStyle === 'dotted' ? '2,4' : undefined;
  const canonicalSequence = notationId === 'bpmn' &&
    resolveBpmnConnector028(edge, Array.isArray(nodes)
      ? resolveSymbolIndex(nodes, notationId) : nodes as SymbolIndex, sourceDirection).canonicalSequenceArrow;
  const canonicalEnd = (resolved: ResolvedEndpoint): ResolvedEndpoint =>
    canonicalSequence && resolved.marker?.kind === 'arrow'
      ? { ...resolved, marker: { kind: 'triangle', fill: 'filled' } } : resolved;
  return {
    style: {
      stroke: catalog?.stroke ?? themeEdge,
      strokeWidth: catalog?.strokeWidth ?? 2,
      lineStyle,
      ...(strokeDasharray ? { strokeDasharray } : {}),
    },
    source: canonicalEnd(endpoint(edge.sourceEnd, legacyMarker(catalog?.sourceArrow, catalog?.sourceFill))),
    target: canonicalEnd(endpoint(edge.targetEnd, legacyMarker(
      catalog?.targetArrow ?? (catalog || notationId === 'bpmn' ? undefined : 'arrow'), catalog?.targetFill,
    ))),
  };
}

/** Crow's Foot variants use 1.4x the standard endpoint viewport. */
export function markerSize028(marker: EndpointMarker): number {
  return marker.kind === 'crow-foot' || marker.kind.endsWith('many') ? 14 : 10;
}

export function markerPrimitives(marker: EndpointMarker): MarkerPrimitive[] {
  const filled = marker.fill === 'filled';
  switch (marker.kind) {
    case 'none': return [];
    case 'arrow': return [{ d: 'M2 2 L14 8 L2 14', filled }];
    case 'triangle': return [{ d: 'M2 2 L14 8 L2 14 Z', filled }];
    case 'diamond': return [{ d: 'M1 8 L8 2 L15 8 L8 14 Z', filled }];
    case 'circle': return [{ d: 'M8 2 A6 6 0 1 1 8 14 A6 6 0 1 1 8 2', filled }];
    case 'bar': return [{ d: 'M10 2 L10 14', filled: false }];
    case 'crow-foot': return [{ d: 'M3 8 L14 2 M3 8 L14 8 M3 8 L14 14', filled: false }];
    case 'zero-or-one': return [{ d: 'M5 5 A3 3 0 1 1 5 11 A3 3 0 1 1 5 5 M11 2 L11 14', filled: false }];
    case 'one': return [{ d: 'M7 2 L7 14 M12 2 L12 14', filled: false }];
    case 'zero-or-many': return [{ d: 'M4 5 A3 3 0 1 1 4 11 A3 3 0 1 1 4 5 M8 8 L14 2 M8 8 L14 8 M8 8 L14 14', filled: false }];
    case 'one-or-many': return [{ d: 'M5 2 L5 14 M8 8 L14 2 M8 8 L14 8 M8 8 L14 14', filled: false }];
  }
}

export function symbolMarkerPrimitives(marker: string): MarkerPrimitive[] {
  switch (marker) {
    case 'X': return [{ d: 'M3 3 L13 13 M13 3 L3 13', filled: false }];
    case '+': return [{ d: 'M8 2 L8 14 M2 8 L14 8', filled: false }];
    case 'O': return [{ d: 'M8 2 A6 6 0 1 1 8 14 A6 6 0 1 1 8 2', filled: false }];
    case 'pentagon': return [{ d: 'M8 2 L14 6.5 L11.7 14 L4.3 14 L2 6.5 Z', filled: false }];
    default: throw new Error(`render.catalog.invalid-symbol-marker: ${marker}`);
  }
}

export function symbolMarkerName(marker: string): string {
  switch (marker) {
    case 'X': return 'Exclusive gateway marker';
    case '+': return 'Parallel gateway marker';
    case 'O': return 'Inclusive gateway marker';
    case 'pentagon': return 'Event-based gateway marker';
    default: throw new Error(`render.catalog.invalid-symbol-marker: ${marker}`);
  }
}

export function resolveShapePath(
  shape: ShapeDefinition,
  parameters?: Record<string, number | string | boolean>,
): string {
  if (shape.id !== 'rectangle' || typeof parameters?.cornerRadius !== 'number'
    || parameters.cornerRadius <= 0) return shape.path;
  const [, , width = 100, height = 60] = shape.viewBox.split(/\s+/).map(Number);
  const radius = Math.min(parameters.cornerRadius, width / 2, height / 2);
  return roundedRectanglePath028(width, height, radius);
}

export function stableSvgId(prefix: string, value: string): string {
  return `${prefix}-${[...value].map((char) => char.codePointAt(0)!.toString(16)).join('-')}`;
}
export function markerId(marker: EndpointMarker, stroke: string): string {
  return stableSvgId('coral-marker', `${marker.kind}|${marker.fill}|${stroke}`);
}
/** A marker ID scoped to one SVG/React canvas instance. Semantic marker IDs
 * remain stable; the DOM scope prevents collisions between open diagrams. */
export function markerDomId028(marker: EndpointMarker, stroke: string,
  instance: string): string {
  return `${stableSvgId('coral-instance', instance)}-${markerId(marker, stroke)}`;
}

function vector(points: Position[], endpointKind: 'source' | 'target', sourceCentre: Position, targetCentre: Position) {
  const order = endpointKind === 'source' ? points : [...points].reverse();
  for (let index = 1; index < order.length; index += 1) {
    const dx = order[index].x - order[0].x; const dy = order[index].y - order[0].y;
    const length = Math.hypot(dx, dy);
    if (length > 0) {
      const direction = endpointKind === 'source' ? 1 : -1;
      return { x: direction * dx / length, y: direction * dy / length };
    }
  }
  let dx = targetCentre.x - sourceCentre.x;
  let dy = targetCentre.y - sourceCentre.y;
  const length = Math.hypot(dx, dy);
  if (!length) { dx = 1; dy = 0; }
  const divisor = Math.hypot(dx, dy);
  return { x: dx / divisor, y: dy / divisor };
}
function clean(value: number): number { return Object.is(value, -0) ? 0 : Number(value.toFixed(4)); }

export function placeEndpointLabels(
  points: Position[], source: ResolvedEndpoint, target: ResolvedEndpoint,
  sourceCentre: Position, targetCentre: Position,
): EndpointLabel[] {
  const labels: EndpointLabel[] = [];
  const add = (kind: 'source' | 'target', end: ResolvedEndpoint) => {
    const tangent = vector(points, kind, sourceCentre, targetCentre);
    const anchor = kind === 'source' ? points[0] ?? sourceCentre : points.at(-1) ?? targetCentre;
    const direction = kind === 'source' ? 1 : -1;
    const base = { x: anchor.x + direction * 14 * tangent.x, y: anchor.y + direction * 14 * tangent.y };
    const normal = { x: -tangent.y, y: tangent.x };
    const push = (labelKind: 'role' | 'multiplicity', text: string, normalOffset: number) => labels.push({
      endpoint: kind, kind: labelKind, text,
      x: clean(base.x + normalOffset * normal.x), y: clean(base.y + normalOffset * normal.y),
    });
    if (end.role) push('role', end.role, -10);
    if (end.multiplicity) push('multiplicity', end.multiplicity, 10);
  };
  add('source', source); add('target', target);
  return labels;
}

export function resolveContourContact028(
  node: Pick<RenderSceneNode, 'id' | 'x' | 'y' | 'width' | 'height' | 'shapeId' | 'symbolId' | 'shapeParameters' | 'container'>,
  toward: Position, fallback: Position,
  options: Pick<NonNullable<Parameters<typeof resolveRenderScene>[1]>, 'layoutDirection' | 'visibleContour'> = {},
): Position {
    if (![node.x, node.y, node.width, node.height, toward.x, toward.y,
      fallback.x, fallback.y].every(Number.isFinite)) {
      throw new RenderCapabilityError([{ code: 'render.capability.scene-bounds',
        subject: { kind: 'node', id: node.id },
        message: `render.capability.scene-bounds: node ${node.id} has non-finite contact geometry` }]);
    }
    if (isBpmnEventSymbol028(node.symbolId)) {
      // Bare semantic-scene callers may not have run the production measured
      // sizing pass yet. The prepared scene validates the final hard size.
      if (node.width < 56 || node.height < ((options.layoutDirection === 'DOWN' || options.layoutDirection === 'UP') ? 64 : 68)) return fallback;
      const frame = bpmnEventFrame028(node.width, node.height, options.layoutDirection ?? 'RIGHT');
      const center = { x: node.x + frame.x + 28, y: node.y + frame.y + 28 };
      const dx = toward.x - center.x;
      const dy = toward.y - center.y;
      const length = Math.hypot(dx, dy);
      return length > 1e-7 ? { x: center.x + dx / length * 24,
        y: center.y + dy / length * 24 } : fallback;
    }
    if (isBpmnGatewaySymbol028(node.symbolId)) {
      if (node.width < 104 || node.height < 104) return fallback;
      const frame = bpmnGatewayFrame028(node.width, node.height,
        options.layoutDirection ?? 'RIGHT');
      const shape = sceneNodeShape029(node)!;
      const normalized = { x: (toward.x - node.x - frame.x) / frame.width,
        y: (toward.y - node.y - frame.y) / frame.height };
      const visibleShape = options.visibleContour
        ? { ...shape, type: 'path' as const, path: options.visibleContour(shape.id, node.shapeParameters) } : shape;
      const outline = stencilRayPoint028(visibleShape, normalized);
      const fitted = stencilFitPoint028(shape, outline, frame.width, frame.height);
      return { x: node.x + frame.x + fitted.x * frame.width,
        y: node.y + frame.y + fitted.y * frame.height };
    }
    const registered = sceneNodeShape029(node);
    if (!registered) return fallback;
    const shape = containerStencilShape028(registered, node.width, node.height, node.container);
    if (node.shapeId === 'rectangle') {
      const fit = stencilFit028(shape, node.width, node.height);
      const left = node.x + fit.offsetX;
      const right = left + fit.fittedWidth;
      const top = node.y + fit.offsetY;
      const bottom = top + fit.fittedHeight;
      const radius = node.shapeParameters?.cornerRadius;
      const flatInset = typeof radius === 'number' && radius > 0
        ? radius * fit.scale + 1 : 0;
      // Preserve the lane coordinate when a free contact is on the layout
      // box's side or the painted flat side. Aspect fitting can inset the
      // painted frame several pixels; a center ray would shift its contact
      // sideways and tilt a vertical lane. Rounded corners still need a ray.
      const tolerance = 1;
      const painted = options.visibleContour?.(shape.id, node.shapeParameters,
        node.container && shape.id === 'rectangle' ? { width: node.width, height: node.height } : undefined);
      const lane = (axis: 'x' | 'y', coordinate: number, leading: boolean): Position | undefined => {
        const path = painted ?? resolveShapePath(shape, node.shapeParameters);
        const segments = svgPathContour028(path === shape.path ? shape : { ...shape, path });
        const values: number[] = [];
        for (const { start, end } of segments) {
          const a = axis === 'x' ? left + start.x * fit.fittedWidth : top + start.y * fit.fittedHeight;
          const b = axis === 'x' ? left + end.x * fit.fittedWidth : top + end.y * fit.fittedHeight;
          if (Math.abs(a - b) < 1e-9 || coordinate < Math.min(a, b) - 1e-6 || coordinate > Math.max(a, b) + 1e-6) continue;
          const t = (coordinate - a) / (b - a);
          values.push(axis === 'x' ? top + (start.y + t * (end.y - start.y)) * fit.fittedHeight
            : left + (start.x + t * (end.x - start.x)) * fit.fittedWidth);
        }
        if (!values.length) return undefined;
        const value = leading ? Math.min(...values) : Math.max(...values);
        return axis === 'x' ? { x: coordinate, y: value } : { x: value, y: coordinate };
      };
      if (fallback.x >= left + flatInset && fallback.x <= right - flatInset) {
        if (Math.abs(fallback.y - top) <= tolerance ||
          Math.abs(fallback.y - node.y) <= tolerance) return lane('x', fallback.x, true) ?? { x: fallback.x, y: top };
        if (Math.abs(fallback.y - bottom) <= tolerance ||
          Math.abs(fallback.y - node.y - node.height) <= tolerance)
          return lane('x', fallback.x, false) ?? { x: fallback.x, y: bottom };
      }
      if (fallback.y >= top + flatInset && fallback.y <= bottom - flatInset) {
        if (Math.abs(fallback.x - left) <= tolerance ||
          Math.abs(fallback.x - node.x) <= tolerance) return lane('y', fallback.y, true) ?? { x: left, y: fallback.y };
        if (Math.abs(fallback.x - right) <= tolerance ||
          Math.abs(fallback.x - node.x - node.width) <= tolerance)
          return lane('y', fallback.y, false) ?? { x: right, y: fallback.y };
      }
    }
    const normalizedToward = {
      x: (toward.x - node.x) / node.width,
      y: (toward.y - node.y) / node.height,
    };
    if (Math.abs(normalizedToward.x - 0.5) + Math.abs(normalizedToward.y - 0.5) < 1e-7)
      return fallback;
    const radius = node.shapeParameters?.cornerRadius;
    // A user outline is frame geometry and is never painted by itself: contact it exactly.
    const userOutline = isUserOutlineShape029(shape);
    const visibleShape = options.visibleContour && !userOutline
      ? { ...shape, type: 'path' as const,
        path: options.visibleContour(shape.id, node.shapeParameters,
          node.container && shape.id === 'rectangle' ? { width: node.width, height: node.height } : undefined) } : shape;
    const outline = stencilRayPoint028(visibleShape, normalizedToward,
      typeof radius === 'number' ? { cornerRadius: radius } : undefined);
    const fitted = frameFitPoint029(shape, outline, node.width, node.height, { symbolId: node.symbolId, layoutDirection: options.layoutDirection });
    return { x: node.x + fitted.x * node.width,
      y: node.y + fitted.y * node.height };
  }

/**
 * Keep an orthogonal connector's lane at a free contact: slide along the axis
 * of the segment that arrives from `next` until it meets the visible outline.
 * A centre ray would move the contact sideways and tilt that segment into a
 * neighbour. Returns undefined when the lane misses the outline, or for BPMN
 * events and gateways, whose dedicated contacts are unchanged.
 */
export function laneContourContact029(
  node: Pick<RenderSceneNode, 'id' | 'x' | 'y' | 'width' | 'height' | 'shapeId' | 'symbolId' | 'shapeParameters' | 'container'>,
  next: Position, axis: 'x' | 'y',
  options: Pick<NonNullable<Parameters<typeof resolveRenderScene>[1]>, 'layoutDirection' | 'visibleContour'> = {},
  margin = 1e-6,
): Position | undefined {
  if (![node.x, node.y, node.width, node.height, next.x, next.y].every(Number.isFinite)) return undefined;
  if (!options.visibleContour && isBpmnEventSymbol028(node.symbolId)) {
    if (node.width < 56 || node.height < ((options.layoutDirection === 'DOWN' || options.layoutDirection === 'UP') ? 64 : 68)) return undefined;
    const frame = bpmnEventFrame028(node.width, node.height, options.layoutDirection ?? 'RIGHT');
    const cx = node.x + frame.x + 28, cy = node.y + frame.y + 28, r = 24;
    if (axis === 'y') {
      const dy = next.y - cy;
      if (Math.abs(dy) >= r - margin) return undefined;
      const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
      return { x: next.x >= cx ? cx + dx : cx - dx, y: next.y };
    }
    const dx = next.x - cx;
    if (Math.abs(dx) >= r - margin) return undefined;
    const dy = Math.sqrt(Math.max(0, r * r - dx * dx));
    return { x: next.x, y: next.y >= cy ? cy + dy : cy - dy };
  }
  if (!options.visibleContour && isBpmnGatewaySymbol028(node.symbolId)) {
    if (node.width < 104 || node.height < 104) return undefined;
    const frame = bpmnGatewayFrame028(node.width, node.height, options.layoutDirection ?? 'RIGHT');
    const cx = node.x + frame.x + frame.width / 2, cy = node.y + frame.y + frame.height / 2;
    const hw = frame.width / 2, hh = frame.height / 2;
    if (axis === 'y') {
      const dy = Math.abs(next.y - cy);
      if (dy > hh - margin) return undefined;
      const dx = hw * (1 - dy / hh);
      return { x: next.x >= cx ? cx + dx : cx - dx, y: next.y };
    }
    const dx = Math.abs(next.x - cx);
    if (dx > hw - margin) return undefined;
    const dy = hh * (1 - dx / hw);
    return { x: next.x, y: next.y >= cy ? cy + dy : cy - dy };
  }
  if (!sceneNodeShape029(node)) return undefined;
  const coordinate = axis === 'x' ? next.x : next.y;
  const low = axis === 'x' ? node.x : node.y, high = low + (axis === 'x' ? node.width : node.height);
  if (coordinate <= low + margin || coordinate >= high - margin) return undefined;
  const contour = sceneNodeContour029(node, options.layoutDirection ?? 'RIGHT', options.visibleContour);
  let best: Position | undefined;
  for (const { start, end } of contour) {
    const a = axis === 'x' ? start.x : start.y, b = axis === 'x' ? end.x : end.y;
    if (Math.abs(a - b) < 1e-9 || coordinate < Math.min(a, b) - 1e-6 || coordinate > Math.max(a, b) + 1e-6) continue;
    const t = (coordinate - a) / (b - a);
    const hit = axis === 'x' ? { x: coordinate, y: start.y + t * (end.y - start.y) }
      : { x: start.x + t * (end.x - start.x), y: coordinate };
    const distance = axis === 'x' ? Math.abs(hit.y - next.y) : Math.abs(hit.x - next.x);
    if (!best || distance < (axis === 'x' ? Math.abs(best.y - next.y) : Math.abs(best.x - next.x))) best = hit;
  }
  return best;
}

export function resolveRenderScene(
  graph: { nodes: GraphNode[]; edges: GraphEdge[]; metadata?: { notation?: string }; profile?: NotationProfile },
  options: {
    theme?: RenderThemeFallback;
    edgeRoutes?: ReadonlyMap<string, readonly LayoutSection[]>;
    nodeGeometry?: ReadonlyMap<string, { x: number; y: number; width: number; height: number }>;
    sourceDirections?: ReadonlyMap<string, SourceEdgeDirection028>;
    layoutDirection?: LayoutDirection;
    visibleContour?: (shapeId: string,
      parameters?: Readonly<Record<string, number | string | boolean>>,
      containerFrame?: { width: number; height: number }) => string;
    containerNodeIds?: ReadonlySet<string>;
    nodeParentIds?: ReadonlyMap<string, string>;
    /** Edition 0.2.9 document catalog; user symbols resolve only through it. */
    documentCatalog029?: CatalogSnapshot028;
    /** Parse interpretations; they keep authored ports that the GraphIR 3 display node lacks. */
    semanticInterpretations029?: ReadonlyMap<string, NodeInterpretation028>;
  } = {},
): RenderScene {
  const notationId = effectiveGraphNotationId028(graph);
  const catalog = options.documentCatalog029;
  assertRenderableInterpretation028(graph.nodes, notationId, graph.profile, catalog);
  const theme = options.theme ?? { fill: '#f8fafc', stroke: '#334155', text: '#0f172a', edge: '#475569' };
  const sceneNodes: RenderSceneNode[] = [];
  const symbols = new Map<string, SymbolIndexEntry>();
  const walk = (nodes: GraphNode[], ox = 0, oy = 0, parentId?: string) => nodes.forEach((node) => {
    const appearance = resolveNodeAppearance(node, theme, notationId, catalog);
    const symbol = appearance.symbolId ? catalogSymbol029(appearance.symbolId, catalog) : undefined;
    const shape = sceneNodeShape029(appearance);
    const defaults = resolveSymbolDefaults(symbol, node.variant);
    const geometry = options.nodeGeometry?.get(node.id);
    const x = geometry?.x ?? ox + (node.position?.x ?? 0); const y = geometry?.y ?? oy + (node.position?.y ?? 0);
    const classifier = effectiveClassifierPresentation0214(node);
    const classifierSize = node.classifier
      ? classifierMinimumSize(node.classifier)
      : classifierPresentationMinimumSize0214(classifier);
    const defaultWidth = numberValue(defaults.width) ?? shape?.defaultSize.width ?? 120;
    const defaultHeight = numberValue(defaults.height) ?? shape?.defaultSize.height ?? 60;
    const width = geometry?.width ?? node.dimensions?.width ?? Math.max(defaultWidth, classifierSize?.width ?? 0);
    const height = geometry?.height ?? node.dimensions?.height ?? Math.max(defaultHeight, classifierSize?.height ?? 0);
    sceneNodes.push({ id: node.id, label: node.label ?? node.id, x, y, width, height, ...appearance,
      ...(classifier ? { classifier } : {}),
      ...((options.nodeParentIds?.get(node.id) ?? node.parent ?? parentId) ?
        { parentId: options.nodeParentIds?.get(node.id) ?? node.parent ?? parentId } : {}),
      ...(isContainerNode028(node) || options.containerNodeIds?.has(node.id) ? { container: true } : {}) });
    symbols.set(node.id, { id: appearance.symbolId, variant: node.variant, type: node.type });
    walk(node.children ?? [], x, y, node.id);
  });
  walk(graph.nodes);
  const byId = new Map(sceneNodes.map((node) => [node.id, node]));
  const graphNodeById = new Map<string, GraphNode>();
  const index = (items: readonly GraphNode[]): void => items.forEach((node) => {
    graphNodeById.set(node.id, node); index(node.children ?? []);
  });
  index(graph.nodes);
  const sceneEdges = graph.edges.flatMap((edge): RenderSceneEdge[] => {
    const from = byId.get(edge.source); const to = byId.get(edge.target);
    if (!from || !to) throw new RenderCapabilityError([{
      code: 'render.capability.missing-endpoint',
      message: `render.capability.missing-endpoint: edge ${edge.id} references ${!from ? edge.source : edge.target}`,
    }]);
    const sections = options.edgeRoutes?.get(edge.id);
    if (sections) {
      const issues = validateRouteSections(sections, { allowCoincidentCheckpoints: Boolean(edge.routeIntent?.waypoints.length) });
      if (issues.length) throw new RenderCapabilityError(issues.map((issue) => ({
        code: 'render.capability.route', subject: { kind: 'edge', id: edge.id },
        message: `Edge ${edge.id}: ${issue.message}`,
      })));
    }
    const defaultCentre = (node: RenderSceneNode): Position => {
      const shape = sceneNodeShape029(node);
      if (shape && stencilCaptionHeight028(shape.id, { symbolId: node.symbolId }) > 0) {
        const fit = stencilFit028(shape, node.width, node.height, { symbolId: node.symbolId, layoutDirection: options.layoutDirection });
        return { x: node.x + fit.offsetX + fit.fittedWidth / 2, y: node.y + fit.offsetY + fit.fittedHeight / 2 };
      }
      return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
    };
    const points = sections?.length ? sections.flatMap((section, index) => [
      ...(index === 0 ? [section.startPoint] : []), ...section.bendPoints, section.endPoint,
    ]) : [defaultCentre(from), defaultCentre(to)];
    // A free endpoint is geometric layout choice, not a semantic port. ELK's
    // rectangle contact can sit outside an aspect-fitted diamond or ellipse.
    // Place only those free contacts on the visible contour; named ports keep
    // their exact layout attachment and GraphIR identity.
    if (points.length >= 2) {
      const sourceToward = points[1]!;
      const targetToward = points.at(-2)!;
      // An axis-aligned terminal segment keeps its lane; a centre ray would tilt it.
      const lane = (node: RenderSceneNode, contact: Position, next: Position): Position | undefined =>
        !sections?.length ? undefined
          : Math.abs(contact.x - next.x) <= 0.5 ? laneContourContact029(node, next, 'x', options)
            : Math.abs(contact.y - next.y) <= 0.5 ? laneContourContact029(node, next, 'y', options) : undefined;
      const origStart = { ...points[0]! };
      const origEnd = { ...points[points.length - 1]! };
      if (!edge.sourcePort || isBpmnEventSymbol028(from.symbolId)) {
        const laneHit = points.length > 1 && (!edge.sourcePort || isBpmnEventSymbol028(from.symbolId))
          ? lane(from, origStart, sourceToward) : undefined;
        points[0] = laneHit ?? resolveContourContact028(from, sourceToward, origStart, options);
        // If a 3+ point generated route's orthogonal terminal segment got snapped onto a
        // gateway/event vertex, keep the first leg orthogonal by sliding points[1] if perpendicular.
        if (!laneHit && !edge.routeIntent && points.length >= 3) {
          if (Math.abs(origStart.y - points[1]!.y) <= 0.5 && Math.abs(points[1]!.x - points[2]!.x) <= 0.5) {
            points[1] = { x: points[1]!.x, y: points[0]!.y };
          } else if (Math.abs(origStart.x - points[1]!.x) <= 0.5 && Math.abs(points[1]!.y - points[2]!.y) <= 0.5) {
            points[1] = { x: points[0]!.x, y: points[1]!.y };
          }
        }
      }
      if (!edge.targetPort || isBpmnEventSymbol028(to.symbolId)) {
        const curTargetToward = points.at(-2)!;
        const laneHit = points.length > 1 && (!edge.targetPort || isBpmnEventSymbol028(to.symbolId))
          ? lane(to, origEnd, curTargetToward) : undefined;
        points[points.length - 1] = laneHit ?? resolveContourContact028(to, curTargetToward, origEnd, options);
        if (!laneHit && !edge.routeIntent && points.length >= 3) {
          const last = points.length - 1;
          if (Math.abs(origEnd.y - points[last - 1]!.y) <= 0.5 && Math.abs(points[last - 1]!.x - points[last - 2]!.x) <= 0.5) {
            points[last - 1] = { x: points[last - 1]!.x, y: points[last]!.y };
          } else if (Math.abs(origEnd.x - points[last - 1]!.x) <= 0.5 && Math.abs(points[last - 1]!.y - points[last - 2]!.y) <= 0.5) {
            points[last - 1] = { x: points[last]!.x, y: points[last - 1]!.y };
          }
        }
      }
    }
    // An interior anchor's escape is part of the connector: add it after the
    // contour step, and only to a routed connector whose endpoint names the port.
    const escape: { source?: true; target?: true } = {};
    if (sections?.length && catalog?.userSymbols?.size && notationId) {
      const nodeOf = (id: string) => graphNodeById.get(id);
      const interpret = (id: string) => {
        const parsed = options.semanticInterpretations029?.get(id);
        if (parsed) return parsed;
        const graphNode = nodeOf(id);
        return graphNode ? resolveNotationNode028(graphNode, notationId, catalog) : undefined;
      };
      const offsets = escapeOffsets029(edge, interpret(edge.source), interpret(edge.target));
      if (offsets.source) {
        points.unshift({ x: points[0]!.x + offsets.source.x, y: points[0]!.y + offsets.source.y });
        escape.source = true;
      }
      if (offsets.target) {
        const end = points.at(-1)!;
        points.push({ x: end.x + offsets.target.x, y: end.y + offsets.target.y });
        escape.target = true;
      }
    }
    const appearance = resolveEdgeAppearance(edge, symbols, notationId, theme.edge,
      options.sourceDirections?.get(edge.id));
    const sourceCentre = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const targetCentre = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    const edgeLabel = edgeDisplayText0214(edge);
    return [{ id: edge.id, sourceId: edge.source, targetId: edge.target, points,
      generatedRoute: edge.routeIntent === undefined,
      ...(escape.source || escape.target ? { escape029: escape } : {}),
      ...(edgeLabel ? { label: edgeLabel } : {}),
      ...(edge.labelPlacement ? { labelPlacement: structuredClone(edge.labelPlacement) } : {}), ...appearance,
      endpointLabels: placeEndpointLabels(points, appearance.source, appearance.target, sourceCentre, targetCentre) }];
  });
  const scene = { nodes: sceneNodes, edges: sceneEdges };
  if (options.edgeRoutes?.size) {
    const issues = finalSceneRouteIssues028(scene, graph.nodes, options);
    if (issues.length) throw new RenderCapabilityError(issues.map((issue) => ({
      code: 'render.capability.route', subject: { kind: 'edge', id: issue.edgeId }, message: issue.message,
    })));
  }
  return scene;
}
