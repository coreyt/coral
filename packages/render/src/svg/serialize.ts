import { containerNodeIds028, containerParentIds028, isContainerNode028 } from '../containerGeometry028.js';
import { verifySpatialConstraints028, type SpatialSidecar028 } from '../layout/typedSpatial028.js';
/**
 * SVG serialization (R-023).
 *
 * A standalone serializer rather than a snapshot of the live canvas. A DOM
 * snapshot would be browser-only — so the MCP server's forked renderer could
 * never be retired — could not carry HTML labels without `foreignObject`,
 * would bake in browser line-breaking, and would include React Flow's handles,
 * selection rings and minimap. Walking the graph avoids all four.
 */

import type { GraphIR, NotationProfile, Position } from '@graph-ir/core';
import type { GraphNode, GraphEdge } from '../types.js';
import type { LayoutSection } from '../layout/types.js';
import type { LayoutDirection } from '../layout/types.js';
import type { SourceEdgeDirection028 } from '../sourceDirection028.js';
import type { SuccessorSourceGraph028 } from '../successorSourceProjection028.js';
import { visualContour028, visualStyle028, type RenderStyle028 } from '../visualStyle028.js';
import { bpmnEventFrame028, bpmnEventLabelLayout028, bpmnEventMinimumSize028,
  isBpmnEventSymbol028 } from '../bpmnEventVisual028.js';
import { bpmnGatewayFrame028, bpmnGatewayLabelLayout028,
  bpmnGatewayMinimumSize028, isBpmnGatewaySymbol028 } from '../bpmnGatewayVisual028.js';
import { semanticManifest028, spatialOwnerLookup028, spatialPartManifest028, shiftSpatialParts028,
  type SceneOwnerLookup028, type ScenePartRecord028, type SemanticManifest028 } from '../renderScene028.js';
import { serializeScenePart028 } from './projectScene028.js';
import { stencilAnchorPoint028, stencilFitPoint028, stencilRayPoint028 } from '../stencilAnchorGeometry028.js';
import { stencilCaptionHeight028 } from '../stencilLabelGeometry028.js';
import { resolveSuccessorGraphNodes028 } from '../successorInterpretation028.js';
import { assertSemanticSidecar028 } from '../semanticSidecar028.js';
import { layoutPortShape029, semanticLayoutPorts028 } from '../semanticLayoutPorts028.js';
import { catalogShape029, catalogSymbol029 } from '../catalogLookup029.js';
import { documentCatalog029 } from '../documentCatalog029.js';
import type { CatalogSnapshot028, NodeInterpretation028 } from '../interpretation028.js';
import { frameFitPoint029, type UserOutline029 } from '../userSymbolGeometry029.js';
import type { AdmittedSvgArtwork029 } from '../artwork/svgArtworkModel029.js';
import { userSymbolSvgDefinition029 } from '../artwork/svgArtworkSymbol029.js';
import { portAttachmentPolicy028 } from '../portAttachment028.js';
import { measureText, textInkVertical028 } from '../text/metrics.js';
import { effectiveGraphNotationId028 } from '../graphNotation028.js';
import { embeddedFontCss, INTER_FONT_FAMILY } from '../text/inter.js';
import {
  fontMetrics,
  DEFAULT_RENDER_FONT_SETTINGS,
  embeddedFontCssFor,
  resolveDiagramFont,
  resolveFont,
  type DiagramRenderFontSettings,
  type FontFaceRequest,
  type RenderFontWeight,
  type ResolvedFont,
} from '../text/fonts.js';
import {
  computeNodeSize,
  layoutNodeLabel,
  type NodeLabelLayout,
} from '../text/sizing.js';
import {
  markerId,
  markerPrimitives,
  RenderCapabilityError,
  classifierMinimumSize,
  fitClassifierFrame028,
  fitPlainRectangleInk028,
  assertRenderableInterpretation028,
  renderSymbolId,
  resolveRenderScene,
  stableSvgId,
  type RenderSceneEdge,
} from '../scene.js';
import {
  isSequenceRenderGraph,
  layoutSequence,
  sequencePrimitives,
  serializeSequencePrimitive,
  type SequenceGraph,
  type SequenceGroupStyle,
  type SequenceLayoutOptions,
  type SequencePrimitive,
  type SequenceScene,
  type SequenceTheme,
} from '../sequence.js';

/** The one mapping from SVG options to the sequence scene, shared by drawing and face preloading. */
function sequenceLayoutOptions(options: SvgOptions): SequenceLayoutOptions {
  const visual = visualStyle028(options.style ?? 'lowfi', options.theme === 'dark' ? 'dark' : 'light');
  return {
    padding: options.padding,
    fontSize: options.fontSize ?? (options.fontSettings ? undefined : visual.labelSize),
    fontFamily: options.fontFamily ?? (options.fontSettings ? undefined : visual.fontFamily),
    fontSettings: options.fontSettings,
    fontWeight: options.fontWeight ?? (options.fontSettings ? undefined : options.style === 'hifi' ? 600 : 500),
    messageFontWeight: !options.fontSettings && !options.fontWeight &&
      (options.style ?? 'lowfi') === 'lowfi' ? 550 : undefined,
    lineHeight: options.lineHeight ?? (options.fontSettings ? undefined : 1.4),
    ...(options.sequenceGroupStyle ? { groupStyle: options.sequenceGroupStyle } : {}),
  };
}

export interface PreparedSequenceScene028 {
  readonly kind: 'sequence';
  readonly id: string;
  readonly revision: string;
  readonly style: RenderStyle028;
  readonly viewport: Readonly<{ width: number; height: number }>;
  readonly bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly fontFaces: readonly FontFaceRequest[];
  readonly semantic: SemanticManifest028;
  readonly scene: SequenceScene;
  readonly parts: readonly SequencePrimitive[];
  readonly partIndex: Readonly<Record<string, number>>;
  readonly ownerLookup: SceneOwnerLookup028;
  readonly status: 'complete';
  readonly diagnostics: readonly [];
}

/** One sequence envelope for SVG and React. Every drawable child gets a
 * stable owner-derived part ID; element syntax remains projector-specific. */
export function prepareSequenceScene028(graph: SequenceGraph, options: SvgOptions = {},
  themeOverride?: SequenceTheme): PreparedSequenceScene028 {
  const theme = resolveTheme(options.theme);
  const visual = visualStyle028(options.style ?? 'lowfi', options.theme === 'dark' ? 'dark' : 'light');
  const scene = layoutSequence(graph, sequenceLayoutOptions(options));
  const primitives = sequencePrimitives(scene, themeOverride ?? {
    background: theme.background, fill: visual.paper, stroke: visual.ink,
    text: visual.ink, edge: visual.ink,
    noteFill: theme === DARK_THEME ? '#3f3a24' : '#fef9c3',
  }, options.style ?? 'lowfi');
  const partIndex: Record<string, number> = {};
  const ownerPartIds: Record<string, string[]> = Object.create(null);
  let paintIndex = 0;
  const own = (items: readonly SequencePrimitive[], parent = 'sequence',
    inheritedOwner = 'sequence'): SequencePrimitive[] =>
    items.map((part, index) => {
      const semanticOwner = Object.entries(part.attrs).find(([key]) =>
        key.startsWith('data-coral-sequence-') && key !== 'data-coral-sequence-part-id');
      const owner = semanticOwner ? `${semanticOwner[0].slice('data-coral-sequence-'.length)}:${semanticOwner[1]}`
        : inheritedOwner;
      const id = `${semanticOwner ? owner : parent}:${part.tag}:${index}`;
      partIndex[id] = paintIndex++;
      (ownerPartIds[owner] ??= []).push(id);
      return { ...part, attrs: { ...part.attrs, 'data-coral-part-id': id },
        ...(part.children ? { children: own(part.children, id, owner) } : {}) };
    });
  const parts = own(primitives);
  const hitBounds: Record<string, { x: number; y: number; width: number; height: number }> = Object.create(null);
  const addBounds = (owner: string, bounds: { x: number; y: number; width: number; height: number }) => {
    const previous = hitBounds[owner];
    if (!previous) { hitBounds[owner] = bounds; return; }
    const x = Math.min(previous.x, bounds.x);
    const y = Math.min(previous.y, bounds.y);
    hitBounds[owner] = { x, y,
      width: Math.max(previous.x + previous.width, bounds.x + bounds.width) - x,
      height: Math.max(previous.y + previous.height, bounds.y + bounds.height) - y };
  };
  for (const participant of scene.participants) {
    addBounds(`participant:${participant.id}`, participant.header);
    addBounds(`participant:${participant.id}`, { x: participant.lifeline.x - 6,
      y: participant.lifeline.y1, width: 12,
      height: participant.lifeline.y2 - participant.lifeline.y1 });
  }
  for (const message of scene.messages) {
    const xs = message.points.map((point) => point.x);
    const ys = message.points.map((point) => point.y);
    addBounds(`message:${message.id}`, { x: Math.min(...xs) - 10,
      y: Math.min(...ys) - 10, width: Math.max(...xs) - Math.min(...xs) + 20,
      height: Math.max(...ys) - Math.min(...ys) + 20 });
    if (message.labelBounds) addBounds(`message:${message.id}`, message.labelBounds);
    else if (message.label) {
      const ink = measureText({ text: message.label.lines.join('\n'),
        fontFamily: scene.messageFont.cssFamily, fontSize: scene.messageFont.size,
        fontWeight: scene.messageFont.weight });
      addBounds(`message:${message.id}`, { x: message.label.x - ink.width / 2,
        y: message.label.y - ink.height, width: ink.width, height: ink.height });
    }
  }
  for (const activation of scene.activations) addBounds(`activation:${activation.id}`, activation);
  for (const note of scene.notes) addBounds(`note:${note.id}`, note);
  for (const group of scene.groups ?? []) addBounds(`group:${group.id}`, {
    x: group.x, y: group.y, width: group.width, height: group.height });
  for (const region of scene.regions ?? []) addBounds(`region:${region.id}`, region);
  for (const fragment of scene.fragments) {
    addBounds(`fragment:${fragment.id}`, fragment);
    for (const [index, operand] of fragment.operands.entries()) {
      const top = index === 0 ? fragment.tab.y + fragment.tab.height : operand.separatorY!;
      const bottom = fragment.operands[index + 1]?.separatorY ?? fragment.y + fragment.height;
      addBounds(`operand:${operand.id}`, { x: fragment.x, y: top,
        width: fragment.width, height: bottom - top });
    }
  }
  const semantic = semanticManifest028(graph, options.semanticGraph, options.successorSource);
  const revision = options.revision === undefined
    ? sceneFingerprint028({ semantic, scene, parts, style: options.style ?? 'lowfi' })
    : String(options.revision);
  return { kind: 'sequence', id: graph.id ?? '', revision,
    style: options.style ?? 'lowfi', viewport: { width: scene.width, height: scene.height },
    bounds: { x: 0, y: 0, width: scene.width, height: scene.height },
    fontFaces: scene.faces, semantic, scene, parts, partIndex,
    ownerLookup: { partIds: ownerPartIds, hitBounds },
    status: 'complete', diagnostics: [] };
}

/** A sequence graph draws the shared sequence primitives; routes and ELK never apply. */
function renderSequenceSvg(graph: SequenceGraph, options: SvgOptions): string {
  const prepared = prepareSequenceScene028(graph, options);
  const scene = prepared.scene;
  const fontFamily = scene.font.cssFamily ?? INTER_FONT_FAMILY;
  // Embed exactly the portable faces the scene draws with (R-033 AC-4).
  const fontCss = scene.faces.length ? embeddedFontCssFor(scene.faces) : embeddedFontCss();
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}" `
      + `font-family="${escapeXml(fontFamily)}" role="img" data-coral-sequence="${escapeXml(graph.id ?? '')}">`,
    `<title>${escapeXml(options.title ?? scene.title)}</title>`,
    `<desc>${escapeXml(options.description ?? scene.description)}</desc>`,
    `<defs><style>${fontCss}</style></defs>`,
    ...prepared.parts.map(serializeSequencePrimitive),
    '</svg>',
  ].join('\n');
}

export interface SvgTheme {
  background: string;
  nodeFill: string;
  nodeStroke: string;
  text: string;
  edge: string;
}

export const LIGHT_THEME: SvgTheme = {
  background: '#ffffff',
  nodeFill: '#f8fafc',
  nodeStroke: '#334155',
  text: '#0f172a',
  edge: '#475569',
};

export const DARK_THEME: SvgTheme = {
  background: '#1e1e1e',
  nodeFill: '#2d2d2d',
  nodeStroke: '#94a3b8',
  text: '#f1f5f9',
  edge: '#94a3b8',
};

export interface SvgOptions {
  /** Graph-absolute resolved primary labels, consumed verbatim. */
  labelBounds028?: SpatialSidecar028['labelBounds028'];
  /** 0.2.8 visual family. `thx` is reserved. */
  style?: RenderStyle028;
  theme?: 'light' | 'dark' | SvgTheme;
  /** Padding around the content, in pixels. */
  padding?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: RenderFontWeight;
  lineHeight?: number;
  fontSettings?: DiagramRenderFontSettings;
  title?: string;
  description?: string;
  /** Verified graph-absolute routes from the shared layout boundary. */
  edgeRoutes?: ReadonlyMap<string, readonly LayoutSection[]>;
  /** Direction chosen by layout for deterministic idle semantic port contacts. */
  layoutDirection?: LayoutDirection;
  /** Authored operator direction retained by the successor source projection. */
  sourceDirections?: ReadonlyMap<string, SourceEdgeDirection028>;
  /** Optional notation override when graph metadata is unavailable. */
  notation?: string;
  /** Visual rendering mode for sequence regions, participant groups, and frames ('shaded' default, or 'bordered'). */
  sequenceGroupStyle?: SequenceGroupStyle;
  /** Authored meaning before layout added derived positions and dimensions. */
  semanticGraph?: GraphIR;
  /** Source-owned successor graph retained alongside the temporary display graph. */
  successorSource?: SuccessorSourceGraph028;
  /** Edition 0.2.9 document catalog; derived from `successorSource` when omitted. */
  documentCatalog029?: CatalogSnapshot028;
  /** Caller-chosen DOM scope for multiple inline instances. Omission gives reproducible standalone bytes. */
  domIdNamespace?: string;
  /** Document edit revision, when a live consumer has one. */
  revision?: string | number;
}

/** A node placed and sized, ready to draw. */
export interface PlacedNode {
  node: GraphNode;
  x: number;
  y: number;
  width: number;
  height: number;
  font?: ResolvedFont;
  labelLayout?: NodeLabelLayout;
}

/** One user-symbol definition drawn by the scene: written once per rendered document. */
export interface SceneArtworkDefinition029 {
  readonly symbolId: string;
  readonly localId: string;
  readonly artwork: AdmittedSvgArtwork029;
  readonly tint: 'none' | 'stroke';
  readonly outline: UserOutline029;
}

/** The `<symbol>` text of every drawn definition, shared by the SVG writer and the canvas. */
export function sceneArtworkDefinitions029(definitions: readonly SceneArtworkDefinition029[], scope: string): string {
  return definitions.map((entry) => userSymbolSvgDefinition029(scope, entry.localId, entry.artwork,
    { tint: entry.tint, outline: entry.outline })).join('');
}

export interface PreparedSpatialScene028 {
  readonly kind: 'spatial';
  readonly id: string;
  readonly revision: string;
  readonly style: RenderStyle028;
  readonly notationId?: string;
  readonly nodes: readonly PlacedNode[];
  readonly resolved: ReturnType<typeof resolveRenderScene>;
  readonly viewport: Readonly<{ width: number; height: number; shiftX: number; shiftY: number }>;
  readonly bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly fontFamily: string;
  readonly fontFaces: readonly FontFaceRequest[];
  readonly semantic: SemanticManifest028;
  readonly parts: readonly ScenePartRecord028[];
  /** JSON-safe lookup from stable part identity to paint order. */
  readonly partIndex: Readonly<Record<string, number>>;
  readonly ownerLookup: SceneOwnerLookup028;
  /** Named port contacts in viewport coordinates. Idle ports use the node's
   * fitted contour; routed ports use the exact connector endpoint. */
  readonly portContacts: Readonly<Record<string, Readonly<Record<string, Position>>>>;
  /** Used user-symbol definitions sorted by local ID; absent without user symbols. */
  readonly artwork029?: readonly SceneArtworkDefinition029[];
  readonly status: 'complete';
  readonly diagnostics: readonly [];
}

function sceneFingerprint028(value: unknown): string {
  let hash = 2166136261;
  const source = JSON.stringify(value);
  for (let index = 0; index < source.length; index += 1)
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const DEFAULT_WIDTH = 120;
const DEFAULT_HEIGHT = 60;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveTheme(theme: SvgOptions['theme']): SvgTheme {
  if (theme === 'dark') return DARK_THEME;
  if (theme === undefined || theme === 'light') return LIGHT_THEME;
  return theme;
}

function validPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validWeight(value: unknown): value is RenderFontWeight {
  return value === 'normal' || value === 'bold'
    || (typeof value === 'number' && Number.isFinite(value));
}

export function usesPortableSvgFonts(options: SvgOptions): boolean {
  void options;
  return true;
}

export function resolveSvgNodeFont(
  node: GraphNode | undefined,
  options: SvgOptions,
): ResolvedFont | undefined {
  if (!usesPortableSvgFonts(options)) return undefined;
  const visual = visualStyle028(options.style ?? 'lowfi');
  const base = options.fontSettings
    ? resolveDiagramFont(options.fontSettings,
      node ? renderSymbolId(node, options.notation, options.documentCatalog029) : undefined, node?.type)
    : resolveFont({ family: visual.fontFamily, size: visual.labelSize,
      weight: options.style === 'hifi' ? 600 : 500, lineHeight: 1.4 });
  return resolveFont({
    family: typeof options.fontFamily === 'string' && options.fontFamily.trim()
      ? options.fontFamily
      : base.requestedFamily,
    size: validPositive(options.fontSize) ? options.fontSize : base.size,
    weight: validWeight(options.fontWeight) ? options.fontWeight : base.weight,
    lineHeight: validPositive(options.lineHeight) ? options.lineHeight : base.lineHeight,
  });
}

function alternateVisualFont028(node: GraphNode, options: SvgOptions): ResolvedFont | undefined {
  if (options.fontFamily || options.fontSize || options.fontWeight || options.lineHeight) return undefined;
  // When a caller explicitly selects a visual style (e.g. `hifi` or `lowfi`),
  // size nodes to that style's own font instead of inflating compact `hifi`
  // layouts to fit `lowfi`'s 26 px handwritten Caveat face. Style-agnostic
  // layouts (`options.style === undefined`) keep sizing for the larger of both.
  if (options.style) return undefined;
  const selected = visualStyle028('lowfi');
  const settings = options.fontSettings;
  if (settings) {
    const symbolId = renderSymbolId(node, options.notation, options.documentCatalog029);
    if ((symbolId && settings.symbolOverrides?.[symbolId]) || settings.symbolOverrides?.[node.type])
      return undefined;
    const requested = settings.default;
    if (requested?.family !== selected.fontFamily || requested.size !== selected.labelSize ||
        requested.weight !== 500 ||
        requested.lineHeight !== 1.4) return undefined;
  }
  const alternate = visualStyle028('hifi');
  return resolveFont({ family: alternate.fontFamily, size: alternate.labelSize,
    weight: 600, lineHeight: 1.4 });
}

/** Measure a node with the same font and symbol rules used by the serializer. */
export function measureSvgNode(node: GraphNode, options: SvgOptions): { width: number; height: number } {
  const font = resolveSvgNodeFont(node, options);
  if (!font) {
    const measured = measureText({
      text: node.label ?? node.id,
      fontSize: options.fontSize ?? DEFAULT_RENDER_FONT_SETTINGS.size,
    });
    return {
      width: Math.max(DEFAULT_WIDTH, measured.width + 32),
      height: Math.max(DEFAULT_HEIGHT, measured.height + 24),
    };
  }
  const symbolId = renderSymbolId(node, options.notation, options.documentCatalog029);
  // A user symbol's frame is exactly its definition size; labels never resize it.
  const user = symbolId ? options.documentCatalog029?.userSymbols?.get(symbolId) : undefined;
  if (user) return { width: user.outline.width, height: user.outline.height };
  const shapeId = catalogSymbol029(symbolId ?? '', options.documentCatalog029)?.shape ?? 'rectangle';
  if (isBpmnEventSymbol028(renderSymbolId(node, options.notation, options.documentCatalog029))) {
    const selected = bpmnEventMinimumSize028(node.label ?? node.id, font, options.layoutDirection ?? 'RIGHT');
    const alternate = alternateVisualFont028(node, options);
    if (!alternate) return selected;
    const other = bpmnEventMinimumSize028(node.label ?? node.id, alternate, options.layoutDirection ?? 'RIGHT');
    return { width: Math.max(selected.width, other.width),
      height: Math.max(selected.height, other.height) };
  }
  if (isBpmnGatewaySymbol028(renderSymbolId(node, options.notation, options.documentCatalog029))) {
    const direction = options.layoutDirection ?? 'RIGHT';
    const selected = bpmnGatewayMinimumSize028(node.label ?? node.id, font, direction);
    const alternate = alternateVisualFont028(node, options);
    if (!alternate) return selected;
    const other = bpmnGatewayMinimumSize028(node.label ?? node.id, alternate, direction);
    return { width: Math.max(selected.width, other.width),
      height: Math.max(selected.height, other.height) };
  }
  const measure = (face: ResolvedFont) => computeNodeSize({
    text: node.label ?? node.id,
    shapeId,
    sizingMode: 'adaptive',
    fontFamily: face.cssFamily,
    fontSize: face.size,
    fontWeight: face.weight,
    lineHeight: face.lineHeight,
    notationId: options.notation,
    symbolId,
    layoutDirection: options.layoutDirection,
  });
  const selectedBase = measure(font);
  const selectedClassifier = classifierMinimumSize(node.classifier, {
    fontSize: font.size, fontFamily: font.cssFamily,
    fontWeight: font.weight, lineHeight: font.lineHeight,
  });
  const selected = { width: Math.max(selectedBase.width, selectedClassifier?.width ?? 0),
    height: Math.max(selectedBase.height, selectedClassifier?.height ?? 0) };
  const fitDiamond = (size: { width: number; height: number }) =>
    shapeId === 'diamond' && stencilCaptionHeight028(shapeId, { notationId: options.notation, symbolId }) === 0
      ? { width: Math.max(size.width, size.height),
        height: Math.max(size.width, size.height) } : size;
  const fitRectangleInk = (size: { width: number; height: number }) =>
    fitPlainRectangleInk028(node.classifier, shapeId, size);
  const otherFont = alternateVisualFont028(node, options);
  if (!otherFont) return fitRectangleInk(fitDiamond(fitClassifierFrame028(node.classifier, shapeId, selected)));
  const otherBase = measure(otherFont);
  const otherClassifier = classifierMinimumSize(node.classifier, {
    fontSize: otherFont.size, fontFamily: otherFont.cssFamily,
    fontWeight: otherFont.weight, lineHeight: otherFont.lineHeight,
  });
  const other = { width: Math.max(otherBase.width, otherClassifier?.width ?? 0),
    height: Math.max(otherBase.height, otherClassifier?.height ?? 0) };
  return fitRectangleInk(fitDiamond(fitClassifierFrame028(node.classifier, shapeId,
    { width: Math.max(selected.width, other.width),
      height: Math.max(selected.height, other.height) })));
}

/** Elastic frames use their own full-width title region, independent of the
 * nominal process glyph's inset. Bounds describe actual glyph ink. */
function containerTitleLayout028(node: GraphNode, width: number, font: ResolvedFont): NodeLabelLayout {
  const measured = measureText({ text: node.label ?? node.id, fontFamily: font.cssFamily,
    fontSize: font.size, fontWeight: font.weight, lineHeight: font.lineHeight,
    maxWidth: Math.max(1, width - 16) });
  const metrics = textInkVertical028(measured.lines.join(''), font);
  const lineHeightPx = Math.ceil(font.size * font.lineHeight);
  const height = (metrics.ascent + metrics.descent) * font.size +
    Math.max(0, measured.lines.length - 1) * lineHeightPx;
  return { width, height, textBox: { x: 8, y: 3.5, width: Math.max(1, width - 16), height },
    lines: measured.lines, lineHeightPx,
    baselines: measured.lines.map((_, index) => 3.5 + metrics.ascent * font.size + index * lineHeightPx),
    textWidth: measured.width, textHeight: height };
}
export function containerTitleBox028(node: GraphNode, width: number, options: SvgOptions = {}) {
  const fonts = [resolveSvgNodeFont(node, options), alternateVisualFont028(node, options)].filter(
    (font): font is ResolvedFont => Boolean(font));
  const layouts = fonts.map(font => containerTitleLayout028(node, width, font));
  const textWidth = Math.max(0, ...layouts.map(layout => layout.textWidth));
  return { x: (width - textWidth) / 2, y: 3.5, width: textWidth,
    height: Math.max(0, ...layouts.map(layout => layout.textHeight)) };
}
/**
 * D6 (owner, 2026-11-15): the padding ELK places a mixed group's automatic
 * children in, so they keep the header and side insets beside positioned
 * siblings. Undefined unless some children are positioned and some are not;
 * a group whose children are all positioned keeps its earlier layout.
 */
export function containerAutomaticPadding028(node: GraphNode, options: SvgOptions = {}, hasChildren = false):
  NonNullable<GraphNode['layoutOptions']>['padding'] {
  const children = node.children ?? [];
  if (!children.some(child => child.position) || children.every(child => child.position)) return undefined;
  return containerLayoutOptions028({ ...node, children: children.map(({ position: _position, ...child }) => child) },
    options, hasChildren)?.padding;
}

/** The narrowest width layout can give a node: an automatic frame fits its children. */
function narrowestFrameWidth028(node: GraphNode, options: SvgOptions): number {
  if (node.dimensions) return node.dimensions.width;
  if (!node.children?.length) return measureSvgNode(node, options).width;
  const side = (node.layoutOptions?.padding?.left ?? 20) + (node.layoutOptions?.padding?.right ?? 20);
  return side + Math.max(...node.children.map(child => narrowestFrameWidth028(child, options)));
}

export function containerLayoutOptions028(node: GraphNode, options: SvgOptions = {}, hasChildren = false): GraphNode['layoutOptions'] {
  if (!isContainerNode028(node) && !hasChildren) return node.layoutOptions;
  // Explicit local coordinates are already frame-relative. Derive header
  // padding only for automatic child placement; never translate authored pins.
  if (node.children?.some(child => child.position)) {
    const childFrames = node.children.map(child => ({ ...measureSvgNode(child, options), ...child.dimensions,
      x: child.position?.x ?? 0, y: child.position?.y ?? 0 }));
    const right = node.dimensions ? Math.max(0, Math.min(20, node.dimensions.width -
      Math.max(...childFrames.map(child => child.x + child.width)))) : 20;
    const bottom = node.dimensions ? Math.max(0, Math.min(20, node.dimensions.height -
      Math.max(...childFrames.map(child => child.y + child.height)))) : 20;
    return { ...node.layoutOptions, padding: { left: 0, top: 0, right, bottom, ...node.layoutOptions?.padding } };
  }
  // An automatic frame fits its children, not its own label: it can be as
  // narrow as its widest child plus side padding, where the title wraps into
  // the most lines. Reserve the header for that width so the title never
  // reaches the children or the connectors entering them.
  const titleWidth = narrowestFrameWidth028(node, options);
  const topClearance = options.style === 'hifi' && (options.layoutDirection === 'DOWN' || options.layoutDirection === 'UP') ? 38 : 24;
  const header = node.labelPlacement ? 0 : containerTitleBox028(node, titleWidth, options).height + topClearance;
  const childHeight = Math.max(0, ...(node.children ?? []).map(child =>
    child.dimensions?.height ?? measureSvgNode(child, options).height));
  const bottom = node.dimensions && childHeight
    ? Math.max(0, Math.min(20, node.dimensions.height - Math.ceil(header) - childHeight)) : 20;
  return { ...node.layoutOptions, padding: { left: 20, right: 20, bottom, top: Math.ceil(header),
    ...node.layoutOptions?.padding } };
}

/** Enumerate the exact embedded faces a rendered graph needs. */
export function svgFontFaceRequests(
  graph: { nodes: GraphNode[]; edges: GraphEdge[]; metadata?: { notation?: string } } & Omit<SequenceGraph, 'nodes' | 'edges' | 'metadata'>,
  options: SvgOptions,
): FontFaceRequest[] {
  if (!usesPortableSvgFonts(options)) return [];
  // A sequence SVG embeds its scene's faces, including the bold fragment keyword.
  if (isSequenceRenderGraph(graph)) {
    return layoutSequence(graph, sequenceLayoutOptions(options)).faces;
  }
  const requests: FontFaceRequest[] = [];
  const walk = (nodes: GraphNode[]) => {
    for (const node of nodes) {
      const font = resolveSvgNodeFont(node, options);
      if (font) requests.push({ id: font.id, weight: font.weight });
      walk(node.children ?? []);
    }
  };
  walk(graph.nodes);
  const nodeIds = new Set<string>();
  const collectIds = (nodes: GraphNode[]) => nodes.forEach((node) => {
    nodeIds.add(node.id);
    collectIds(node.children ?? []);
  });
  collectIds(graph.nodes);
  if (graph.edges.some((edge) => edge.label
    && nodeIds.has(edge.source)
    && nodeIds.has(edge.target))) {
    const font = resolveSvgNodeFont(undefined, options);
    if (font) requests.push({ id: font.id, weight: font.weight });
  }
  return [...new Map(requests.map((request) => [
    `${request.id}:${request.weight}`,
    request,
  ])).values()];
}

/** Flatten to drawable nodes with absolute geometry. */
function place(nodes: GraphNode[], options: SvgOptions, portable: boolean, containers = containerNodeIds028(nodes)): PlacedNode[] {
  const out: PlacedNode[] = [];
  const legacySize = options.fontSize ?? DEFAULT_RENDER_FONT_SETTINGS.size;

  const walk = (list: GraphNode[], offsetX = 0, offsetY = 0) => {
    for (const node of list) {
      const label = node.label ?? node.id;
      const symbolId = renderSymbolId(node, options.notation, options.documentCatalog029);
      const shapeId = symbolId
        ? catalogSymbol029(symbolId, options.documentCatalog029)?.shape ?? 'rectangle'
        : 'rectangle';
      const font = portable ? resolveSvgNodeFont(node, options) : undefined;
      const measured = portable
        ? measureSvgNode(node, options)
        : measureText({ text: label, fontSize: legacySize });
      const classifierSize = classifierMinimumSize(node.classifier, {
        fontSize: portable ? font!.size : legacySize,
        fontFamily: portable ? font!.cssFamily : options.fontFamily ?? INTER_FONT_FAMILY,
        fontWeight: portable ? font!.weight : 'normal',
        lineHeight: portable ? font!.lineHeight : 1.4,
      });
      const otherFont = portable ? alternateVisualFont028(node, options) : undefined;
      const otherClassifierSize = otherFont ? classifierMinimumSize(node.classifier, {
        fontSize: otherFont.size, fontFamily: otherFont.cssFamily,
        fontWeight: otherFont.weight, lineHeight: otherFont.lineHeight,
      }) : undefined;
      let width = node.dimensions?.width ?? (portable
        ? Math.max(measured.width, classifierSize?.width ?? 0, otherClassifierSize?.width ?? 0)
        : Math.max(DEFAULT_WIDTH, measured.width + 32, classifierSize?.width ?? 0));
      let height = node.dimensions?.height ?? (portable
        ? Math.max(measured.height, classifierSize?.height ?? 0, otherClassifierSize?.height ?? 0)
        : Math.max(DEFAULT_HEIGHT, measured.height + 24, classifierSize?.height ?? 0));
      if (containers.has(node.id) && !node.dimensions?.width && portable) {
        width = Math.max(width, measureText({ text: label, fontFamily: font!.cssFamily, fontSize: font!.size,
          fontWeight: font!.weight, lineHeight: font!.lineHeight }).width + 16);
      }
      if (containers.has(node.id) && node.children?.length) {
        const childFrames = node.children.map(child => ({ ...measureSvgNode(child, options), ...child.dimensions,
          x: child.position?.x ?? 0, y: child.position?.y ?? 0 }));
        if (!node.dimensions?.width) width = Math.max(width,
          ...childFrames.map(child => child.x + child.width + 8));
        if (!node.dimensions?.height) height = Math.max(height,
          ...childFrames.map(child => child.y + child.height + 8));
      }
      let labelLayout = portable && !node.labelPlacement
        ? containers.has(node.id) ? containerTitleLayout028(node, width, font!)
          : isBpmnEventSymbol028(symbolId)
          ? (() => {
            const minimum = bpmnEventMinimumSize028(label, font!, options.layoutDirection ?? 'RIGHT');
            if (width + 1e-6 < minimum.width || height + 1e-6 < minimum.height) {
              throw new RenderCapabilityError([{
                code: 'render.capability.hard-size-text-conflict',
                subject: { kind: 'node', id: node.id },
                message: `render.capability.hard-size-text-conflict: BPMN event ${node.id} ` +
                  `caption requires ${minimum.width}×${minimum.height}px, has ${width}×${height}px`,
              }]);
            }
            return bpmnEventLabelLayout028(label, font!, width, height, options.layoutDirection ?? 'RIGHT');
          })()
          : isBpmnGatewaySymbol028(symbolId)
            ? (() => {
              const direction = options.layoutDirection ?? 'RIGHT';
              const minimum = bpmnGatewayMinimumSize028(label, font!, direction);
              if (width + 1e-6 < minimum.width || height + 1e-6 < minimum.height) {
                throw new RenderCapabilityError([{
                  code: 'render.capability.hard-size-text-conflict',
                  subject: { kind: 'node', id: node.id },
                  message: `render.capability.hard-size-text-conflict: BPMN gateway ${node.id} ` +
                    `caption requires ${minimum.width}×${minimum.height}px, has ${width}×${height}px`,
                }]);
              }
              return bpmnGatewayLabelLayout028(label, font!, width, height, direction);
            })()
          : layoutNodeLabel({
            text: label,
            shapeId,
            sizingMode: 'adaptive',
            dimensions: { width, height },
            fontFamily: font!.cssFamily,
            fontSize: font!.size,
            fontWeight: font!.weight,
            lineHeight: font!.lineHeight,
            notationId: options.notation,
            symbolId,
            layoutDirection: options.layoutDirection,
          })
        : undefined;

      if (labelLayout && containers.has(node.id) && !portable) {
        const top = labelLayout.baselines[0] - fontMetrics(font!.id, font!.weight).ascent * font!.size;
        const offset = 8 - top;
        labelLayout = { ...labelLayout, baselines: labelLayout.baselines.map(value => value + offset),
          textBox: { ...labelLayout.textBox, y: labelLayout.textBox.y + offset } };
      }

      out.push({
        node,
        x: offsetX + (node.position?.x ?? 0),
        y: offsetY + (node.position?.y ?? 0),
        width,
        height,
        font,
        labelLayout,
      });

      if (node.children) {
        walk(node.children, offsetX + (node.position?.x ?? 0), offsetY + (node.position?.y ?? 0));
      }
    }
  };

  walk(nodes);
  return out;
}

/** View-only handle contacts for ports without a routed connector. */
function idlePortContacts028(
  placed: readonly PlacedNode[], notationId: string | undefined,
  shiftX: number, shiftY: number, direction: LayoutDirection, catalog?: CatalogSnapshot028,
): Record<string, Record<string, Position>> {
  const contacts: Record<string, Record<string, Position>> = Object.create(null);
  for (const item of placed) {
    const { node, width, height } = item;
    const symbolId = renderSymbolId(node, notationId, catalog);
    const symbol = symbolId ? catalogSymbol029(symbolId, catalog) : undefined;
    const catalogPorts = node.variant && symbol?.variants?.[node.variant]?.ports !== undefined
      ? symbol.variants[node.variant]!.ports! : symbol?.ports;
    const ports = node.ports !== undefined
      ? node.ports.map((port) => ({ id: port.id, side: port.side, position: port.position }))
      : catalogPorts !== undefined
        ? catalogPorts.map((port) => ({ id: port.id, side: port.anchor, position: port.position }))
        : [{ id: 'in', side: 'NORTH' as const, position: undefined },
          { id: 'out', side: 'SOUTH' as const, position: undefined }];
    if (!ports.length) continue;
    const perSide: Record<string, typeof ports> = Object.create(null);
    for (const port of ports) (perSide[port.side] ??= []).push(port);
    const shape = node.ports === undefined
      ? catalogShape029(symbol?.shape ?? 'rectangle', catalog) : undefined;
    const eventFrame = isBpmnEventSymbol028(symbolId)
      ? bpmnEventFrame028(width, height, direction) : undefined;
    const gatewayFrame = isBpmnGatewaySymbol028(symbolId)
      ? bpmnGatewayFrame028(width, height, direction) : undefined;
    const nodeContacts: Record<string, Position> = Object.create(null);
    for (const port of ports) {
      const index = perSide[port.side]!.indexOf(port);
      const along = port.position ?? (index + 1) / (perSide[port.side]!.length + 1);
      const toward = port.side === 'NORTH' ? { x: along, y: 0 }
        : port.side === 'SOUTH' ? { x: along, y: 1 }
          : port.side === 'EAST' ? { x: 1, y: along } : { x: 0, y: along };
      const framePoint = eventFrame ? {
        x: (eventFrame.x + 28 + (port.side === 'EAST' ? 24 : port.side === 'WEST' ? -24 : 0)) / width,
        y: (eventFrame.y + 28 + (port.side === 'SOUTH' ? 24 : port.side === 'NORTH' ? -24 : 0)) / height,
      } : gatewayFrame && shape ? {
        x: (gatewayFrame.x + gatewayFrame.width * stencilFitPoint028(shape,
          stencilRayPoint028(shape, toward), gatewayFrame.width, gatewayFrame.height).x) / width,
        y: (gatewayFrame.y + gatewayFrame.height * stencilFitPoint028(shape,
          stencilRayPoint028(shape, toward), gatewayFrame.width, gatewayFrame.height).y) / height,
      } : undefined;
      const contourPoint = shape && !eventFrame
        ? frameFitPoint029(shape, stencilRayPoint028(shape, toward), width, height, { notationId, symbolId }) : undefined;
      const point = framePoint ?? contourPoint ?? toward;
      nodeContacts[port.id] = { x: item.x + shiftX + point.x * width,
        y: item.y + shiftY + point.y * height };
    }
    contacts[node.id] = nodeContacts;
  }
  return contacts;
}

/** Source declarations remain semantic; only these contour contacts enter the view scene. */
function sourceIdlePortContacts028(
  placed: readonly PlacedNode[], graph: GraphIR, source: SuccessorSourceGraph028,
  notationId: string | undefined, shiftX: number, shiftY: number,
  direction: LayoutDirection, fixedPorts?: Set<string>, catalog?: CatalogSnapshot028,
): Record<string, Record<string, Position>> {
  const interpretations = resolveSuccessorGraphNodes028(source);
  assertSemanticSidecar028(graph, notationId, interpretations);
  const contacts: Record<string, Record<string, Position>> = Object.create(null);
  for (const item of placed) {
    const interpreted = interpretations.get(item.node.id)!;
    if (renderSymbolId(item.node, notationId, catalog) !== interpreted.effectiveSymbolId ||
      item.node.variant !== interpreted.effectiveVariantId) {
      throw new RenderCapabilityError([{
        code: 'render.capability.semantic-manifest',
        subject: { kind: 'node', id: item.node.id },
        message: `render.capability.semantic-manifest: node ${item.node.id} drawing symbol or variant differs from source`,
      }]);
    }
    if (interpreted.invalidAnchorPortIds.length || interpreted.portCollisions.length) {
      throw new RenderCapabilityError([
        ...interpreted.invalidAnchorPortIds.map((portId) => {
          const issue = interpreted.diagnostics.find((entry) => entry.portId === portId);
          const code = issue?.code === 'coral.port.anchor.symbol-unavailable'
            ? 'coral.port.anchor.symbol-unavailable' as const
            : 'coral.port.anchor.symbol-unknown' as const;
          return { code, subject: { kind: 'port' as const, id: `${item.node.id}:${portId}` },
            message: `${code}: ${issue?.message ?? 'Named stencil anchor is unavailable'}` };
        }),
        ...interpreted.portCollisions.map((portId) => ({
          code: 'coral.port.duplicate' as const,
          subject: { kind: 'port' as const, id: `${item.node.id}:${portId}` },
          message: `coral.port.duplicate: node ${item.node.id} has conflicting port ${portId}`,
        })),
      ]);
    }
    const symbol = interpreted.effectiveSymbolId
      ? catalogSymbol029(interpreted.effectiveSymbolId, catalog) : undefined;
    const layoutPorts = semanticLayoutPorts028(interpreted, symbol,
      interpreted.effectiveVariantId, direction).ports;
    if (!layoutPorts.length) continue;
    const nodeContacts: Record<string, Position> = Object.create(null);
    for (const port of interpreted.semanticPorts) {
      // A named anchor is an authored pin; generic anchors follow the attachment policy.
      if (typeof port.anchor === 'object' ||
        portAttachmentPolicy028(port, direction, port.direction === 'in' ? 'target' : 'source').fixed)
        fixedPorts?.add(JSON.stringify([item.node.id, port.id]));
      const layoutPort = layoutPorts.find((entry) => entry.id === port.id)!;
      const shapeId = layoutPort.stencilShapeId ?? interpreted.effectiveShapeId ?? 'rectangle';
      const shape = layoutPortShape029(layoutPort) ?? catalogShape029(shapeId, catalog);
      if (!shape) throw new Error(`coral.port.anchor.geometry-unsupported: ${shapeId}`);
      // Idle free ports have a stable view default. A connected route replaces
      // it below without changing the source's anchor class or semantic ID.
      const outlinePoint = layoutPort.outlinePoint ?? (() => {
        const policy = portAttachmentPolicy028(port, direction,
          port.direction === 'in' ? 'target' : 'source');
        const anchor = policy.preferred ?? policy.eligible[0]!;
        return stencilAnchorPoint028(shape, anchor,
          layoutPort.freeStencil?.cornerRadius !== undefined
            ? { cornerRadius: layoutPort.freeStencil.cornerRadius } : undefined);
      })();
      const eventFrame = isBpmnEventSymbol028(interpreted.effectiveSymbolId)
        ? bpmnEventFrame028(item.width, item.height, direction) : undefined;
      const gatewayFrame = isBpmnGatewaySymbol028(interpreted.effectiveSymbolId)
        ? bpmnGatewayFrame028(item.width, item.height, direction) : undefined;
      const fitted = eventFrame
        ? { x: eventFrame.x + 4 + outlinePoint.x * 48,
          y: eventFrame.y + 4 + outlinePoint.y * 48 }
        : gatewayFrame
          ? (() => {
            const point = stencilFitPoint028(shape, outlinePoint,
              gatewayFrame.width, gatewayFrame.height);
            return { x: gatewayFrame.x + point.x * gatewayFrame.width,
              y: gatewayFrame.y + point.y * gatewayFrame.height };
          })()
          : frameFitPoint029(shape, outlinePoint, item.width, item.height, { notationId, symbolId: interpreted.effectiveSymbolId, layoutDirection: direction });
      nodeContacts[port.id] = { x: item.x + shiftX +
        (eventFrame || gatewayFrame ? fitted.x : fitted.x * item.width),
      y: item.y + shiftY +
        (eventFrame || gatewayFrame ? fitted.y : fitted.y * item.height) };
    }
    contacts[item.node.id] = nodeContacts;
  }
  return contacts;
}

/** Resolve all spatial geometry and text rows before either consumer paints. */
export function prepareSpatialScene028(
  graph: { nodes: GraphNode[]; edges: GraphEdge[]; metadata?: { notation?: string };
    profile?: NotationProfile } & Omit<SequenceGraph, 'nodes' | 'edges' | 'metadata'>,
  options: SvgOptions = {}
): PreparedSpatialScene028 {
  const authoredDirection = (options.semanticGraph as SpatialSidecar028 | undefined)?.layoutOptions028?.direction ??
    (graph as SpatialSidecar028).layoutOptions028?.direction;
  if (authoredDirection) options = { ...options, layoutDirection: authoredDirection };
  const visualStyle = visualStyle028(options.style ?? 'lowfi', options.theme === 'dark' ? 'dark' : 'light');
  const notationId = options.notation ?? effectiveGraphNotationId028(graph);
  // User symbols resolve only through the document catalog: supplied, carried
  // by the SVG layout graph, or built from the source-owned successor.
  const carried = (graph as { documentCatalog029?: CatalogSnapshot028 }).documentCatalog029;
  const sourceSymbols = options.successorSource?.userSymbols029;
  const catalog = options.documentCatalog029 ?? carried ??
    (sourceSymbols?.length && notationId ? documentCatalog029(notationId, sourceSymbols) : undefined);
  if (catalog) options = { ...options, documentCatalog029: catalog };
  // Escapes of authored ports need the parse interpretations: the GraphIR 3
  // display node no longer carries them.
  const interpretations029 = catalog?.userSymbols?.size ? options.successorSource
    ? resolveSuccessorGraphNodes028(options.successorSource)
    : (graph as { semanticInterpretations029?: ReadonlyMap<string, NodeInterpretation028> }).semanticInterpretations029
    : undefined;
  assertRenderableInterpretation028(graph.nodes, notationId, graph.profile, catalog);
  if (isSequenceRenderGraph(graph)) throw new Error('render.capability.scene-kind: sequence graphs require the sequence scene');
  const effectiveOptions = { ...options, notation: notationId };
  const unresolvedRoute = graph.edges.find((edge) =>
    edge.routeIntent && !(options.edgeRoutes?.get(edge.id)?.length));
  if (unresolvedRoute) {
    throw new Error(`layout.capability.unsupported: edge ${unresolvedRoute.id} requires a verified resolved route`);
  }
  const padding = options.padding ?? 24;
  const portable = usesPortableSvgFonts(options);
  const defaultFont = portable ? resolveSvgNodeFont(undefined, effectiveOptions) : undefined;
  const fontFamily = defaultFont?.cssFamily ?? options.fontFamily ?? visualStyle.fontFamily;

  const containerIds = containerNodeIds028(options.semanticGraph?.nodes ?? graph.nodes);
  const placed = place(graph.nodes, effectiveOptions, portable, containerIds);
  const sourceDirections = options.successorSource
    ? new Map(options.successorSource.edges.map((edge) => [edge.id, edge.direction] as const))
    : options.sourceDirections;
  if (options.successorSource && options.sourceDirections &&
    [...sourceDirections!].some(([id, direction]) => options.sourceDirections?.get(id) !== direction)) {
    throw new RenderCapabilityError([{
      code: 'render.capability.semantic-manifest',
      subject: { kind: 'graph', id: graph.id ?? '' },
      message: 'render.capability.semantic-manifest: source direction sidecar differs from successor source',
    }]);
  }
  const scene = resolveRenderScene({
    ...graph,
    metadata: { ...graph.metadata, ...(effectiveOptions.notation ? { notation: effectiveOptions.notation } : {}) },
  }, {
    theme: { fill: visualStyle.paper, stroke: visualStyle.ink,
      text: visualStyle.ink, edge: visualStyle.ink },
    edgeRoutes: options.edgeRoutes,
    sourceDirections, containerNodeIds: containerIds,
    nodeParentIds: containerParentIds028(options.semanticGraph?.nodes ?? graph.nodes),
    visibleContour: (shapeId, parameters, containerFrame) => visualContour028(shapeId,
      options.style ?? 'lowfi', parameters, containerFrame),
    nodeGeometry: new Map(placed.map((node) => [node.node.id, node])),
    layoutDirection: options.layoutDirection ?? 'RIGHT',
    ...(catalog ? { documentCatalog029: catalog } : {}),
    ...(interpretations029 ? { semanticInterpretations029: interpretations029 } : {}),
  });
  const semantic = semanticManifest028(graph, options.semanticGraph, options.successorSource);
  const partFont = defaultFont ?? resolveFont({ family: visualStyle.fontFamily,
    size: visualStyle.labelSize, weight: options.style === 'hifi' ? 600 : 500 });
  const partOptions = { style: (options.style ?? 'lowfi') as RenderStyle028,
    theme: (options.theme === 'dark' ? 'dark' : 'light') as 'dark' | 'light',
    defaultFont: partFont, layoutDirection: options.layoutDirection ?? 'RIGHT',
    labelBounds028: options.labelBounds028 ?? (graph as SpatialSidecar028).labelBounds028 };
  // Include routes, labels, marker ink and node decorations in the viewport.
  // Node-only bounds clipped manual waypoints and outer relationship labels.
  const unshifted = spatialPartManifest028(scene, placed, {
    ...partOptions, shiftX: 0, shiftY: 0,
  });
  const spatialConstraints028 = (options.semanticGraph as SpatialSidecar028 | undefined)?.spatialConstraints028 ??
    (graph as SpatialSidecar028).spatialConstraints028 ?? options.successorSource?.constraints;
  if (spatialConstraints028?.some((c) => c.strength !== 'preferred')) {
    const rectangles = new Map(placed.map((layout) => [layout.node.id,
      { x: layout.x, y: layout.y, width: layout.width, height: layout.height }]));
    for (const edge of scene.edges) {
      const x = Math.min(...edge.points.map((p) => p.x)); const y = Math.min(...edge.points.map((p) => p.y));
      rectangles.set(`edge:${edge.id}`, { x, y, width: Math.max(...edge.points.map((p) => p.x)) - x,
        height: Math.max(...edge.points.map((p) => p.y)) - y });
    }
    for (const part of unshifted) if (part.role === 'node-label' || part.role === 'edge-label')
      rectangles.set(`${part.role}:${part.owner.id}`, part.bounds);
    const failed = verifySpatialConstraints028({ ...(options.semanticGraph ?? graph),
      spatialConstraints028 } as GraphIR & SpatialSidecar028, rectangles, spatialConstraints028.filter((c) => c.strength !== 'preferred'));
    if (failed.length) throw new RenderCapabilityError(failed.map((id) => ({ code: 'render.capability.scene-layout' as const,
      subject: { kind: 'graph' as const, id: graph.id ?? '' }, message: `Final scene failed required spatial constraint "${id}"` })));
  }
  const boxes = [
    ...placed.map((node) => ({ x: node.x, y: node.y,
      width: node.width, height: node.height })),
    ...unshifted.map((part) => part.bounds),
  ];
  const minX = Math.min(0, ...boxes.map((box) => box.x));
  const minY = Math.min(0, ...boxes.map((box) => box.y));
  const maxX = Math.max(0, ...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(0, ...boxes.map((box) => box.y + box.height));
  const width = Math.ceil(maxX - minX + padding * 2);
  const height = Math.ceil(maxY - minY + padding * 2);
  const shiftX = padding - minX;
  const shiftY = padding - minY;
  const parts = shiftSpatialParts028(unshifted, shiftX, shiftY, partOptions.style);

  const partIndex = Object.fromEntries(parts.map((part, index) => [part.id, index]));
  const ownerLookup = spatialOwnerLookup028(parts);
  const fixedPorts = new Set<string>();
  const portContacts = options.successorSource
    ? sourceIdlePortContacts028(placed, options.semanticGraph ?? graph as GraphIR, options.successorSource,
      notationId, shiftX, shiftY, options.layoutDirection ?? 'RIGHT', fixedPorts, catalog)
    : idlePortContacts028(placed, notationId, shiftX, shiftY,
      options.layoutDirection ?? 'RIGHT', catalog);
  const resolvedEdges = new Map(scene.edges.map((edge) => [edge.id, edge]));
  const routedContacts: Record<string, Record<string, Position>> = Object.create(null);
  for (const edge of graph.edges) {
    const route = resolvedEdges.get(edge.id);
    if (!route) continue;
    // An escaped endpoint's contact is the attachment, one point inside the escape.
    const escapes = (route.escape029?.source ? 1 : 0) + (route.escape029?.target ? 1 : 0);
    if (route.points.length < 2 + escapes) throw new RenderCapabilityError([{ code: 'render.capability.route',
      subject: { kind: 'edge', id: edge.id },
      message: `render.capability.route: edge ${edge.id} has an incomplete escape segment` }]);
    for (const [nodeId, portId, contact] of [
      [edge.source, edge.sourcePort, route.escape029?.source ? route.points[1] : route.points[0]],
      [edge.target, edge.targetPort, route.escape029?.target ? route.points.at(-2) : route.points.at(-1)],
    ] as const) {
      if (!portId || !contact) continue;
      const shifted = { x: contact.x + shiftX, y: contact.y + shiftY };
      const nodePorts = portContacts[nodeId] ??= Object.create(null);
      const routedNodePorts = routedContacts[nodeId] ??= Object.create(null);
      const expected = nodePorts[portId];
      if (options.edgeRoutes?.has(edge.id) && fixedPorts.has(JSON.stringify([nodeId, portId])) && expected &&
        Math.hypot(expected.x - shifted.x, expected.y - shifted.y) > .15)
        throw new RenderCapabilityError([{ code: 'render.capability.route',
          subject: { kind: 'port', id: `${nodeId}:${portId}` },
          message: `render.capability.route: port ${nodeId}:${portId} does not preserve its exact authored contact` }]);
      const previous = routedNodePorts[portId];
      if (previous && Math.hypot(previous.x - shifted.x, previous.y - shifted.y) > 1e-6)
        throw new RenderCapabilityError([{ code: 'render.capability.route',
          subject: { kind: 'port', id: `${nodeId}:${portId}` },
          message: `render.capability.route: port ${nodeId}:${portId} has conflicting routed contacts` }]);
      nodePorts[portId] = shifted;
      routedNodePorts[portId] = shifted;
    }
  }
  const used = new Map<string, SceneArtworkDefinition029>();
  for (const part of parts) {
    if (part.geometry.kind !== 'artwork' || used.has(part.geometry.symbolId)) continue;
    // resolveNodeAppearance already refused a user symbol without admitted artwork.
    const user = catalog!.userSymbols!.get(part.geometry.symbolId)!;
    used.set(part.geometry.symbolId, Object.freeze({ symbolId: part.geometry.symbolId, localId: user.definition.id,
      artwork: user.artwork029!, tint: user.definition.tint, outline: user.outline }));
  }
  const artwork029 = used.size ? Object.freeze([...used.values()].sort((a, b) =>
    a.localId < b.localId ? -1 : a.localId > b.localId ? 1 : 0)) : undefined;
  const revision = options.revision === undefined
    ? sceneFingerprint028({ semantic, placed, parts, portContacts,
      style: options.style ?? 'lowfi', layoutDirection: options.layoutDirection ?? 'RIGHT',
      ...(artwork029 ? { artwork029: artwork029.map((entry) => [entry.localId, entry.artwork.canonicalText, entry.tint]) } : {}) })
    : String(options.revision);
  return { kind: 'spatial', id: graph.id ?? '', revision, style: options.style ?? 'lowfi',
    ...(artwork029 ? { artwork029 } : {}),
    ...(notationId ? { notationId } : {}), nodes: placed, resolved: scene,
    viewport: { width, height, shiftX, shiftY }, fontFamily,
    bounds: { x: 0, y: 0, width, height }, partIndex, ownerLookup, portContacts,
    fontFaces: svgFontFaceRequests(graph, effectiveOptions), semantic, parts,
    status: 'complete', diagnostics: [] };
}

/**
 * Render a graph to a standalone SVG document.
 * Positions come from `node.position`; source consumers lay out first.
 */
export function renderSvg(
  graph: { nodes: GraphNode[]; edges: GraphEdge[]; metadata?: { notation?: string };
    profile?: NotationProfile } & Omit<SequenceGraph, 'nodes' | 'edges' | 'metadata'>,
  options: SvgOptions = {}
): string {
  if (isSequenceRenderGraph(graph)) return renderSequenceSvg(graph, options);
  const prepared = prepareSpatialScene028(graph, options);
  const theme = resolveTheme(options.theme);
  const portable = usesPortableSvgFonts(options);
  const { width, height } = prepared.viewport;
  const fontFamily = prepared.fontFamily;
  const scene = prepared.resolved;
  const domNamespace = stableSvgId('coral-instance',
    options.domIdNamespace ?? 'standalone');

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" font-family="${escapeXml(fontFamily)}">`
  );
  if (options.title) parts.push(`<title>${escapeXml(options.title)}</title>`);
  if (options.description) parts.push(`<desc>${escapeXml(options.description)}</desc>`);

  const faceRequests = prepared.fontFaces;
  const fontCss = portable ? embeddedFontCssFor(faceRequests) : embeddedFontCss();
  const markerDefinitions = new Map<string, { marker: NonNullable<RenderSceneEdge['source']['marker']>; stroke: string }>();
  for (const part of prepared.parts) {
    if (part.geometry.kind !== 'marker') continue;
    const { marker, stroke } = part.geometry;
    markerDefinitions.set(markerId(marker, stroke), { marker, stroke });
  }
  const markerSvg = [...markerDefinitions.entries()].map(([id, definition]) => {
    const paths = markerPrimitives(definition.marker).map((primitive) =>
      `<path d="${primitive.d}" fill="${primitive.filled ? definition.stroke : 'none'}" stroke="${definition.stroke}" stroke-width="1.5"/>`).join('');
    return `<marker id="${domNamespace}-${id}" viewBox="0 0 16 16" refX="14" refY="8" markerWidth="10" markerHeight="10" orient="auto-start-reverse" markerUnits="strokeWidth">${paths}</marker>`;
  }).join('');
  const artworkSvg = prepared.artwork029 ? sceneArtworkDefinitions029(prepared.artwork029, domNamespace) : '';
  parts.push(`<defs><style>${fontCss}</style>${markerSvg}${artworkSvg}</defs>`);
  parts.push(`<rect width="${width}" height="${height}" fill="${theme.background}"/>`);

  // The prepared scene owns the drawing order and geometry. The projector
  // only translates typed records into SVG elements and accessibility groups.
  const byOwner = new Map<string, ScenePartRecord028[]>();
  for (const part of prepared.parts) {
    const key = `${part.owner.kind}:${part.owner.id}`;
    const owned = byOwner.get(key) ?? [];
    owned.push(part);
    byOwner.set(key, owned);
  }
  for (const edge of scene.edges) {
    parts.push(`<g data-coral-edge="${escapeXml(edge.id)}">`);
    for (const [kind, end] of [['source', edge.source], ['target', edge.target]] as const) {
      if (!end.navigability) continue;
      const name = escapeXml([`${kind} ${end.navigability}`,
        ...(end.role ? [`role ${end.role}`] : []),
        ...(end.multiplicity ? [`multiplicity ${end.multiplicity}`] : [])].join(', '));
      parts.push(`<g data-coral-endpoint="${kind}" data-coral-navigability="${end.navigability}" aria-label="${name}"><title>${name}</title></g>`);
    }
    for (const part of byOwner.get(`edge:${edge.id}`) ?? []) parts.push(serializeScenePart028(part, domNamespace));
    parts.push('</g>');
  }
  for (const node of scene.nodes) {
    parts.push(`<g data-coral-node="${escapeXml(node.id)}">`);
    let glyphOpen = false;
    for (const part of byOwner.get(`node:${node.id}`) ?? []) {
      if (part.role === 'glyph' && !glyphOpen) {
        const name = part.geometry.kind === 'decoration-path' ? part.geometry.name : 'Symbol';
        const titleId = stableSvgId('coral-glyph-title', `${domNamespace}:${node.id}`);
        parts.push(`<g role="img" aria-labelledby="${titleId}"><title id="${titleId}">${escapeXml(name)}</title>`);
        glyphOpen = true;
      } else if (part.role !== 'glyph' && glyphOpen) {
        parts.push('</g>');
        glyphOpen = false;
      }
      parts.push(serializeScenePart028(part, domNamespace));
    }
    if (glyphOpen) parts.push('</g>');
    if (node.classifier) parts.push(`<title>${escapeXml(node.classifier.accessibleName)}</title>`);
    parts.push('</g>');
  }

  parts.push('</svg>');
  return parts.join('\n');
}
