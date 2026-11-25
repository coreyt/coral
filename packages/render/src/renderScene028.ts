import { containerStencilShape028 } from './containerGeometry028.js';
import { stencilCaptionHeight028, stencilLabelSizing028 } from './stencilLabelGeometry028.js';
/** Typed, JSON-safe scene evidence for the 0.2.8 renderer. Authoring meaning
 * is copied from the input graph; layout supplies coordinates only. */
import type { EdgeLabelPlacement, EndpointMarker, GraphEdge, GraphIR, GraphNode, Position } from '@graph-ir/core';
import { markerId, RenderCapabilityError, symbolMarkerName, symbolMarkerPrimitives, type RenderScene,
  type RenderCapabilityDiagnostic } from './scene.js';
import type { NodeLabelLayout } from './text/sizing.js';
import type { ResolvedFont } from './text/fonts.js';
import { sceneNodeShape029 } from './catalogLookup029.js';
import { svgPathContour028 } from './svgPathContour028.js';
import { stencilFit028 } from './stencilAnchorGeometry028.js';
import { classifierPrimitives028, nodeLabelPrimitives028, stencilPathPrimitives028,
  type StencilPathPrimitive028, type TextRunPrimitive028 } from './drawingPrimitives028.js';
import { inkRoutePath028, routeCornerRadii028, routeMidpoint028, visualDashPattern028,
  visualStyle028, type RenderStyle028 } from './visualStyle028.js';
import { authoredNodeLabelBox028 } from './nodeLabelPlacement028.js';
import { authoredEdgeLabelBox028, measureEdgeLabel028 } from './edgeLabelPlacement028.js';
import { measureText, textInkVertical028 } from './text/metrics.js';
import { bpmnEventCaptionOffsetX028, bpmnEventFrame028, bpmnEventPathPrimitives028,
  isBpmnEventSymbol028 } from './bpmnEventVisual028.js';
import { bpmnGatewayCaptionOffsetX028, bpmnGatewayFrame028,
  isBpmnGatewaySymbol028 } from './bpmnGatewayVisual028.js';
import type { LayoutDirection } from './layout/types.js';
import type { SuccessorSourceGraph028 } from './successorSourceProjection028.js';

export interface SemanticManifest028 {
  /** Authored if supplied separately from the laid-out drawing graph. */
  readonly sourceKind: 'authored' | 'successor-source' | 'render-input';
  readonly graphId: string;
  /** Lossless source-owned 0.2.8 meaning, when the display graph is a bridge. */
  readonly successorSource?: SuccessorSourceGraph028;
  readonly profile?: GraphIR['profile'];
  readonly metadata?: GraphIR['metadata'];
  readonly constraints?: GraphIR['constraints'];
  readonly layoutOptions?: GraphIR['layoutOptions'];
  readonly interaction?: GraphIR['interaction'];
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

export interface SceneBounds028 { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }

function overlapsBounds028(a: SceneBounds028, b: SceneBounds028, margin = 0): boolean {
  return a.x < b.x + b.width + margin && a.x + a.width > b.x - margin &&
    a.y < b.y + b.height + margin && a.y + a.height > b.y - margin;
}

function touchesBounds028(a: SceneBounds028, b: SceneBounds028): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x &&
    a.y <= b.y + b.height && a.y + a.height >= b.y;
}

/** True when a route segment enters a label's measured rectangle. */
function routeHitsBounds028(start: Position, end: Position, bounds: SceneBounds028, margin = 0): boolean {
  const left = bounds.x - margin; const right = bounds.x + bounds.width + margin;
  const top = bounds.y - margin; const bottom = bounds.y + bounds.height + margin;
  const dx = end.x - start.x; const dy = end.y - start.y;
  const p = [-dx, dx, -dy, dy];
  const q = [start.x - left, right - start.x, start.y - top, bottom - start.y];
  let entry = 0; let exit = 1;
  for (let index = 0; index < 4; index += 1) {
    if (Math.abs(p[index]!) < 1e-9) {
      if (q[index]! < 0) return false;
      continue;
    }
    const fraction = q[index]! / p[index]!;
    if (p[index]! < 0) entry = Math.max(entry, fraction);
    else exit = Math.min(exit, fraction);
    if (entry > exit) return false;
  }
  return true;
}

interface BoundsIndex028<T> {
  insert(item: T, bounds: SceneBounds028): void;
  query(bounds: SceneBounds028): readonly T[];
}

function boundsIndex028<T>(): BoundsIndex028<T> {
  const cells = new Map<string, T[]>();
  const entries: { item: T; bounds: SceneBounds028 }[] = [];
  const overflow: { item: T; bounds: SceneBounds028 }[] = [];
  const size = 128;
  const keys = (bounds: SceneBounds028): string[] | undefined => {
    const result: string[] = [];
    const left = Math.floor(bounds.x / size); const right = Math.floor((bounds.x + bounds.width) / size);
    const top = Math.floor(bounds.y / size); const bottom = Math.floor((bounds.y + bounds.height) / size);
    const columns = right - left + 1; const rows = bottom - top + 1;
    // Large segment envelopes and imprecise integer coordinates cannot be
    // enumerated safely. Keep them in a small overflow list instead.
    if (![left, right, top, bottom].every(Number.isSafeInteger) ||
      columns <= 0 || rows <= 0 || columns * rows > 256) return undefined;
    for (let x = left; x <= right; x += 1) for (let y = top; y <= bottom; y += 1)
      result.push(`${x}:${y}`);
    return result;
  };
  return {
    insert(item, bounds) {
      const entry = { item, bounds };
      entries.push(entry);
      const bucketKeys = keys(bounds);
      if (!bucketKeys) { overflow.push(entry); return; }
      for (const key of bucketKeys) {
        const entries = cells.get(key) ?? [];
        entries.push(item);
        cells.set(key, entries);
      }
    },
    query(bounds) {
      const nearby = new Set<T>();
      const bucketKeys = keys(bounds);
      if (!bucketKeys) {
        for (const entry of entries) if (touchesBounds028(bounds, entry.bounds)) nearby.add(entry.item);
      } else {
        for (const key of bucketKeys) for (const item of cells.get(key) ?? []) nearby.add(item);
        for (const entry of overflow) if (touchesBounds028(bounds, entry.bounds)) nearby.add(entry.item);
      }
      return [...nearby];
    },
  };
}

function edgeLabelPosition028(edgeId: string, classifierLabel: boolean, points: readonly Position[], width: number, height: number,
  preferHorizontal: boolean, segments: BoundsIndex028<readonly [Position, Position]>, nodes: BoundsIndex028<SceneBounds028>,
  labels: BoundsIndex028<SceneBounds028>): { x: number; y: number; bounds: SceneBounds028 } {
  const midpoint = routeMidpoint028(points);
  const boundsAt = (x: number, y: number): SceneBounds028 =>
    box(x - width / 2, y - height, width, height);
  const search = (bounds: SceneBounds028): SceneBounds028 =>
    box(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8);
  const collisions = (bounds: SceneBounds028): number => {
    const bodyCollisions = nodes.query(search(bounds)).filter((node) => overlapsBounds028(bounds, node, 3)).length;
    // Class labels must clear painted bodies. A shorter but occluded slot
    // cannot outrank a readable one merely because both cross one obstacle.
    if (classifierLabel && bodyCollisions > 0) return Number.POSITIVE_INFINITY;
    return bodyCollisions +
      labels.query(search(bounds)).filter((label) => overlapsBounds028(bounds, label, 3)).length +
      segments.query(search(bounds)).filter(([start, end]) => routeHitsBounds028(start, end, bounds, 4)).length;
  };
  // In horizontal class layouts, use the space reserved between columns
  // before considering a long vertical fan-out trunk or the arc midpoint.
  if (classifierLabel && preferHorizontal) {
    for (const margin of [24, 8]) {
      const runs = points.slice(1).map((end, index) => ({ start: points[index]!, end }))
        .filter(({ start, end }) => Math.abs(end.y - start.y) <= 1 && Math.abs(end.x - start.x) >= width + margin * 2)
        .sort((a, b) => Math.abs(b.end.x - b.start.x) - Math.abs(a.end.x - a.start.x));
      for (const { start, end } of runs) {
        const left = Math.min(start.x, end.x) + width / 2 + margin;
        const right = Math.max(start.x, end.x) - width / 2 - margin;
        for (const x of [(left + right) / 2, left + (right - left) * .35,
          left + (right - left) * .65, left, right]) {
          const at = (x - start.x) / (end.x - start.x);
          const shaftY = start.y + (end.y - start.y) * at;
          for (const y of [shaftY - 8, shaftY + height + 8]) {
            const bounds = boundsAt(x, y);
            if (collisions(bounds) === 0) return { x, y, bounds };
          }
        }
      }
    }
  }
  const routeMinX = Math.min(...points.map((point) => point.x));
  const routeMaxX = Math.max(...points.map((point) => point.x));
  const gapPenalty = (bounds: SceneBounds028): number =>
    classifierLabel && preferHorizontal && routeMaxX - routeMinX >= width + 8 &&
    (bounds.x < routeMinX + 4 || bounds.x + bounds.width > routeMaxX - 4) ? 500 : 0;
  const baseline = { x: midpoint.x, y: midpoint.y - 4,
    bounds: boundsAt(midpoint.x, midpoint.y - 4) };
  if (collisions(baseline.bounds) === 0 && gapPenalty(baseline.bounds) === 0) return baseline;
  let best = baseline;
  let bestScore = collisions(baseline.bounds) * 10_000 + gapPenalty(baseline.bounds);
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!; const end = points[index]!;
    const dx = end.x - start.x; const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) continue;
    const nx = -dy / length; const ny = dx / length;
    const extent = (Math.abs(nx) * width + Math.abs(ny) * height) / 2;
    for (const fraction of [0.5, 0.35, 0.65]) for (const side of [-1, 1]) {
      const centerX = start.x + dx * fraction; const originY = start.y + dy * fraction;
      // Tall endpoint bodies can exceed the usual 64 px search. Include their
      // outer normal extent so the complete measured label can clear them.
      const nearby = classifierLabel ? nodes.query(search(boundsAt(centerX, originY + height / 2))) : [];
      const expanded = nearby.map((node) => Math.max(...[
        [node.x, node.y], [node.x + node.width, node.y],
        [node.x, node.y + node.height], [node.x + node.width, node.y + node.height],
      ].map(([x, y]) => ((x! - centerX) * nx + (y! - originY) * ny) * side)) + 8);
      // Short diagonals between tall classifiers can have clear slots
      // directly above/below the shaft that normal-only offsets miss.
      if (classifierLabel && side === -1) for (const gap of [8, 16, 24, 32, 48, 64]) {
        for (const [ox, oy] of [[0, -height / 2 - gap], [0, height / 2 + gap],
          [-width / 2 - gap, 0], [width / 2 + gap, 0]]) {
          const x = centerX + ox!; const centerY = originY + oy!;
          const initial = boundsAt(x, centerY + height / 2);
          // Exact body margins expose narrow readable corridors that fixed
          // offset steps can skip, especially with taller handwritten text.
          const candidates = [[x, centerY], ...nodes.query(search(initial)).flatMap(node => [
            [x, node.y - 4 - height / 2], [x, node.y + node.height + 4 + height / 2],
            [node.x - 4 - width / 2, centerY], [node.x + node.width + 4 + width / 2, centerY],
          ])];
          for (const [cx, cy] of candidates) {
            const y = cy! + height / 2; const bounds = boundsAt(cx!, y);
            const score = collisions(bounds) * 10_000 + gapPenalty(bounds) +
              Math.hypot(cx! - midpoint.x, cy! - midpoint.y) * 0.1 + gap * 0.01;
            if (score < bestScore) { best = { x: cx!, y, bounds }; bestScore = score; }
          }
        }
      }
      for (const gap of new Set([8, 20, 32, 40, 48, 64, ...expanded.filter((gap) => gap > 64)])) {
        const x = centerX + nx * side * (extent + gap);
        const centerY = originY + ny * side * (extent + gap);
        const y = centerY + height / 2;
        const bounds = boundsAt(x, y);
        const score = collisions(bounds) * 10_000 + gapPenalty(bounds) +
          Math.hypot(x - midpoint.x, centerY - midpoint.y) * 0.1 + gap * 0.01;
        if (score < bestScore) { best = { x, y, bounds }; bestScore = score; }
      }
    }
  }
  if (classifierLabel && nodes.query(search(best.bounds)).some((node) => overlapsBounds028(best.bounds, node, 3))) {
    throw new RenderCapabilityError([{
      code: 'render.capability.scene-layout', subject: { kind: 'edge', id: edgeId },
      message: `Edge ${edgeId} label cannot clear the painted node bodies`,
    }]);
  }
  return best;
}
export interface SceneOwnerLookup028 {
  /** Keys are `node:<semantic-id>` or `edge:<semantic-id>`. */
  readonly partIds: Readonly<Record<string, readonly string[]>>;
  /** Union of meaningful painted parts, in viewport coordinates. */
  readonly hitBounds: Readonly<Record<string, SceneBounds028>>;
}
export type SceneGeometry028 =
  | (Omit<StencilPathPrimitive028, 'transform'> & { readonly kind: 'stencil-path';
      readonly transform: Readonly<{ x: number; y: number; scale: number }>;
      readonly innerTransform?: string })
  | { readonly kind: 'route'; readonly points: readonly Position[]; readonly d: string;
      readonly stroke: string; readonly strokeWidth: number;
      readonly cornerRadii?: readonly number[];
      /** Editor selection/gesture width; absent from the visible SVG export. */
      readonly hitStrokeWidth: number; readonly dash?: string;
      readonly markerStart?: string; readonly markerEnd?: string }
  | { readonly kind: 'marker'; readonly contact: Position;
      readonly marker: EndpointMarker; readonly stroke: string }
  | (TextRunPrimitive028 & { readonly kind: 'text'; readonly labelPlacement?: EdgeLabelPlacement;
      readonly background?: string })
  | { readonly kind: 'divider'; readonly x1: number; readonly y1: number;
      readonly x2: number; readonly y2: number; readonly stroke: string;
      readonly strokeWidth: number }
  | { readonly kind: 'decoration-path'; readonly d: string;
      readonly fill: string; readonly stroke: string; readonly strokeWidth: number;
      readonly name: string;
      readonly symbolMarkerId?: string;
      readonly transform: Readonly<{ x: number; y: number; scaleX: number; scaleY: number }> }
  | { readonly kind: 'artwork'; readonly symbolId: string; readonly localId: string;
      /** The node frame; one `<use>` of the definition's `<symbol>` fills it. */
      readonly frame: SceneBounds028;
      /** `#rrggbb` for `tint stroke`; absent when the definition is not tinted. */
      readonly tint?: string };
export interface ScenePartRecord028 {
  readonly id: string;
  readonly owner: Readonly<{ kind: 'node' | 'edge'; id: string }>;
  readonly role: 'outline' | 'corner-overdraw' | 'inner-outline' | 'node-label' |
    'classifier-name' | 'classifier-stereotype' | 'classifier-row' |
    'classifier-separator' | 'edge-shaft' | 'edge-label' | 'endpoint-label' |
    'source-marker' | 'target-marker' | 'glyph' | 'symbol-marker' | 'artwork';
  readonly bounds: SceneBounds028;
  readonly geometry: SceneGeometry028;
  readonly presentationOnly: boolean;
}

export interface SpatialPartLayout028 {
  readonly node: GraphNode;
  readonly x: number; readonly y: number;
  readonly width: number; readonly height: number;
  readonly font?: ResolvedFont;
  readonly labelLayout?: NodeLabelLayout;
}

export interface SpatialPartManifestOptions028 {
  readonly labelBounds028?: Record<string, SceneBounds028>;
  readonly style: RenderStyle028;
  readonly theme?: 'light' | 'dark';
  readonly shiftX: number;
  readonly shiftY: number;
  readonly defaultFont: ResolvedFont;
  readonly layoutDirection?: LayoutDirection;
}

/** Rebase resolved parts into the final SVG viewport without repeating stencil
 * lookup, text measurement, and semantic resolution for every part. */
export function shiftSpatialParts028(parts: readonly ScenePartRecord028[],
  shiftX: number, shiftY: number, style: RenderStyle028): readonly ScenePartRecord028[] {
  const point = (value: Position): Position => ({ x: value.x + shiftX, y: value.y + shiftY });
  const bounds = (value: SceneBounds028): SceneBounds028 => ({ ...value,
    x: value.x + shiftX, y: value.y + shiftY });
  return parts.map((part): ScenePartRecord028 => {
    const geometry = part.geometry;
    switch (geometry.kind) {
      case 'route': {
        const points = geometry.points.map(point);
        return { ...part, bounds: bounds(part.bounds), geometry: { ...geometry,
          points, d: inkRoutePath028(points, style, geometry.cornerRadii) } };
      }
      case 'marker':
        return { ...part, bounds: bounds(part.bounds), geometry: { ...geometry,
          contact: point(geometry.contact) } };
      case 'stencil-path':
        return { ...part, bounds: bounds(part.bounds), geometry: { ...geometry,
          transform: { ...geometry.transform,
            x: geometry.transform.x + shiftX, y: geometry.transform.y + shiftY } } };
      case 'decoration-path':
        return { ...part, bounds: bounds(part.bounds), geometry: { ...geometry,
          transform: { ...geometry.transform,
            x: geometry.transform.x + shiftX, y: geometry.transform.y + shiftY } } };
      case 'divider':
        return { ...part, bounds: bounds(part.bounds), geometry: { ...geometry,
          x1: geometry.x1 + shiftX, y1: geometry.y1 + shiftY,
          x2: geometry.x2 + shiftX, y2: geometry.y2 + shiftY } };
      case 'artwork':
        return { ...part, bounds: bounds(part.bounds), geometry: { ...geometry, frame: bounds(geometry.frame) } };
      case 'text':
        return { ...part, bounds: bounds(part.bounds), geometry: { ...geometry,
          x: geometry.x + shiftX, y: geometry.y + shiftY,
          // Node text primitives retain their local measured ink bounds;
          // edge labels are already expressed in scene coordinates.
          inkBounds: part.owner.kind === 'edge'
            ? bounds(geometry.inkBounds) : geometry.inkBounds } };
    }
  });
}

function clone<T>(value: T): T { return structuredClone(value); }
function failure(code: RenderCapabilityDiagnostic['code'], message: string,
  subject?: RenderCapabilityDiagnostic['subject']): never {
  throw new RenderCapabilityError([{ code, message: `${code}: ${message}`,
    ...(subject ? { subject } : {}) }]);
}

/** The semantic snapshot never infers direction, ports, or an endpoint kind. */
export function semanticManifest028(
  drawing: { id?: string; nodes: GraphNode[]; edges: GraphEdge[]; profile?: GraphIR['profile'];
    metadata?: GraphIR['metadata']; interaction?: GraphIR['interaction'];
    constraints?: GraphIR['constraints']; layoutOptions?: GraphIR['layoutOptions'] },
  authored?: GraphIR,
  successorSource?: SuccessorSourceGraph028,
): SemanticManifest028 {
  const source = authored ?? drawing;
  const flatten = (nodes: readonly GraphNode[]): string[] => nodes.flatMap((node) => [node.id, ...flatten(node.children ?? [])]);
  const sameIds = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length && new Set(left).size === left.length &&
    new Set(right).size === right.length && left.every((id) => right.includes(id));
  if (authored && (!sameIds(flatten(authored.nodes), flatten(drawing.nodes)) ||
    !sameIds(authored.edges.map((edge) => edge.id), drawing.edges.map((edge) => edge.id)))) {
    failure('render.capability.semantic-manifest', 'authored and drawing graph IDs differ',
      { kind: 'graph', id: source.id ?? '' });
  }
  if (successorSource && (successorSource.id !== source.id ||
    !sameIds(flatten(successorSource.nodes as GraphNode[]), flatten(drawing.nodes)) ||
    !sameIds(successorSource.edges.map((edge) => edge.id), drawing.edges.map((edge) => edge.id)))) {
    failure('render.capability.semantic-manifest', 'successor source and drawing graph IDs differ',
      { kind: 'graph', id: source.id ?? '' });
  }
  const edges = clone(source.edges);
  const nodes = clone(source.nodes);
  return { sourceKind: successorSource ? 'successor-source' : authored ? 'authored' : 'render-input',
    graphId: source.id ?? '',
    ...(successorSource ? { successorSource: clone(successorSource) } : {}),
    ...(source.profile ? { profile: clone(source.profile) } : {}),
    ...(source.metadata ? { metadata: clone(source.metadata) } : {}),
    ...(source.constraints ? { constraints: clone(source.constraints) } : {}),
    ...(source.layoutOptions ? { layoutOptions: clone(source.layoutOptions) } : {}),
    ...(source.interaction ? { interaction: clone(source.interaction) } : {}),
    nodes, edges };
}

function box(x: number, y: number, width: number, height: number): SceneBounds028 {
  if (![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0) {
    failure('render.capability.scene-bounds', 'non-finite or negative bounds');
  }
  return { x, y, width, height };
}

function pointBounds(points: readonly Position[]): SceneBounds028 {
  if (!points.length) failure('render.capability.route', 'missing route points');
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs); const minY = Math.min(...ys);
  return box(minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY);
}

/** Stable selection lookup. Decorative overdraw cannot enlarge a semantic
 * object's hit target; text and markers do contribute to its visible area. */
export function spatialOwnerLookup028(parts: readonly ScenePartRecord028[]): SceneOwnerLookup028 {
  const partIds: Record<string, string[]> = Object.create(null);
  const hitBounds: Record<string, SceneBounds028> = Object.create(null);
  for (const part of parts) {
    const key = `${part.owner.kind}:${part.owner.id}`;
    (partIds[key] ??= []).push(part.id);
    if (part.presentationOnly) continue;
    const hit = part.geometry.kind === 'route'
      ? box(part.bounds.x - part.geometry.hitStrokeWidth / 2,
        part.bounds.y - part.geometry.hitStrokeWidth / 2,
        part.bounds.width + part.geometry.hitStrokeWidth,
        part.bounds.height + part.geometry.hitStrokeWidth)
      : part.bounds;
    const prior = hitBounds[key];
    if (!prior) { hitBounds[key] = hit; continue; }
    const x = Math.min(prior.x, hit.x);
    const y = Math.min(prior.y, hit.y);
    const right = Math.max(prior.x + prior.width, hit.x + hit.width);
    const bottom = Math.max(prior.y + prior.height, hit.y + hit.height);
    hitBounds[key] = box(x, y, right - x, bottom - y);
  }
  return { partIds, hitBounds };
}

/** Reproject an already interpreted edge during a canvas drag. Only geometry
 * changes: semantic ends, paint tokens, IDs, and text remain scene-owned. */
export function retargetSpatialEdgeParts028(parts: readonly ScenePartRecord028[],
  points: readonly Position[], style: RenderStyle028): readonly ScenePartRecord028[] {
  const shaft = parts.find((part) => part.role === 'edge-shaft' && part.geometry.kind === 'route');
  if (!shaft || shaft.geometry.kind !== 'route' || points.length < 2)
    failure('render.capability.route', 'transient edge has no valid scene route');
  const routeGeometry = shaft.geometry;
  const oldPoints = routeGeometry.points;
  const first = oldPoints[0]!; const last = oldPoints.at(-1)!;
  const newFirst = points[0]!; const newLast = points.at(-1)!;
  const oldMiddle = routeMidpoint028(oldPoints);
  const newMiddle = routeMidpoint028(points);
  const delta = (from: Position, to: Position) => ({ x: to.x - from.x, y: to.y - from.y });
  const sourceDelta = delta(first, newFirst);
  const targetDelta = delta(last, newLast);
  const middleDelta = delta(oldMiddle, newMiddle);
  const shiftedBounds = (bounds: SceneBounds028, move: Position) =>
    box(bounds.x + move.x, bounds.y + move.y, bounds.width, bounds.height);
  return parts.map((part): ScenePartRecord028 => {
    if (part.id === shaft.id) return { ...part, bounds: pointBounds(points),
      geometry: { ...routeGeometry, points: points.map((point) => ({ ...point })),
        cornerRadii: undefined,
        d: inkRoutePath028(points, style) } };
    const authoredMove = part.role === 'edge-label' && part.geometry.kind === 'text' && part.geometry.labelPlacement
      ? (() => { const bounds = authoredEdgeLabelBox028(points, part.geometry.labelPlacement, part.bounds.width, part.bounds.height);
        return { x: bounds.x - part.bounds.x, y: bounds.y - part.bounds.y }; })() : undefined;
    const move = part.role === 'source-marker' ? sourceDelta
      : part.role === 'target-marker' ? targetDelta
        : part.role === 'edge-label' ? authoredMove ?? middleDelta
          : part.role === 'endpoint-label' && part.geometry.kind === 'text'
            ? part.geometry.endpoint === 'source' ? sourceDelta : targetDelta
            : undefined;
    if (!move) return part;
    if (part.geometry.kind === 'marker') return { ...part,
      bounds: shiftedBounds(part.bounds, move), geometry: { ...part.geometry,
        contact: { x: part.geometry.contact.x + move.x,
          y: part.geometry.contact.y + move.y } } };
    if (part.geometry.kind === 'text') return { ...part,
      bounds: shiftedBounds(part.bounds, move), geometry: { ...part.geometry,
        x: part.geometry.x + move.x, y: part.geometry.y + move.y,
        inkBounds: shiftedBounds(part.geometry.inkBounds, move) } };
    return part;
  });
}

/** Paint-order part manifest. The SVG and React projectors may each express
 * these as elements, but cannot choose new geometry or remeasure labels. */
export function spatialPartManifest028(
  scene: RenderScene, layouts: readonly SpatialPartLayout028[],
  options: SpatialPartManifestOptions028,
): readonly ScenePartRecord028[] {
  const visual = visualStyle028(options.style, options.theme ?? 'light');
  const byId = new Map(layouts.map((layout) => [layout.node.id, layout]));
  const parts: ScenePartRecord028[] = [];
  const add = (part: ScenePartRecord028) => { parts.push(part); };
  const authoredNodeLabels = new Map<string, ScenePartRecord028>();
  const nodeLabelPart = (id: string, text: string, bounds: SceneBounds028, baselineOffset: number,
    font: ResolvedFont,
    placement?: NonNullable<GraphNode['labelPlacement']>): ScenePartRecord028 => ({
    id: `${id}:label:1`, owner: { kind: 'node', id }, role: 'node-label', bounds, presentationOnly: false,
    geometry: { kind: 'text', id: `${id}:label:1`, ownerId: id, role: 'node-label', text,
      x: bounds.x + bounds.width / 2, y: bounds.y + baselineOffset, inkBounds: bounds,
      ...(placement ? { labelPlacement: clone(placement) } : {}), anchor: 'middle', fontFamily: font.cssFamily,
      fontSize: font.size, fontWeight: font.weight, lineHeight: font.lineHeight, fill: visual.ink } });
  /** Nodes whose label came from a user-symbol definition side; already checked clear. */
  const preferredUserLabels = new Set<string>();
  for (const layout of layouts) {
    const placement = layout.node.labelPlacement;
    const resolved = options.labelBounds028?.[`node-label:${layout.node.id}`];
    if (!placement && !resolved) continue;
    if (layout.node.classifier) failure('render.capability.scene-layout',
      `Node ${layout.node.id} classifier heading label placement is not executable`, { kind: 'node', id: layout.node.id });
    const font = layout.font ?? options.defaultFont;
    const text = layout.node.label ?? layout.node.id;
    if (!text) {
      authoredNodeLabelBox028({ x: layout.x, y: layout.y, width: layout.width, height: layout.height }, placement ?? { side: 'center' }, 0, 0);
      continue;
    }
    const measured = measureEdgeLabel028({ text, fontFamily: font.cssFamily,
      fontSize: font.size, fontWeight: font.weight, lineHeight: font.lineHeight });
    const bounds = resolved ? { ...resolved, x: resolved.x + options.shiftX, y: resolved.y + options.shiftY }
      : authoredNodeLabelBox028({ x: layout.x + options.shiftX, y: layout.y + options.shiftY,
        width: layout.width, height: layout.height }, placement!, measured.width, measured.height);
    if (resolved && (Math.abs(resolved.width - measured.width) > 1e-6 || Math.abs(resolved.height - measured.height) > 1e-6))
      failure('render.capability.scene-layout', `Node ${layout.node.id} resolved label measurement is stale`, { kind: 'node', id: layout.node.id });
    if (placement && resolved) {
      const expected = authoredNodeLabelBox028({ x: layout.x, y: layout.y, width: layout.width, height: layout.height },
        placement, measured.width, measured.height);
      if (Math.abs(expected.x - resolved.x) > 1e-6 || Math.abs(expected.y - resolved.y) > 1e-6)
        failure('render.capability.scene-layout', `Node ${layout.node.id} resolved label contradicts authored placement`, { kind: 'node', id: layout.node.id });
    }
    authoredNodeLabels.set(layout.node.id, nodeLabelPart(layout.node.id, text, bounds, measured.baselineOffset, font, placement));
  }
  // A user symbol's definition label side is a preference, not an authored
  // placement: the label takes the first side whose box is clear of other
  // nodes, connectors, markers and labels, else it stays inside the frame.
  const sceneById = new Map(scene.nodes.map((node) => [node.id, node]));
  for (const layout of layouts) {
    const preferred = sceneById.get(layout.node.id)?.artwork029?.label;
    const text = layout.node.label ?? layout.node.id;
    if (!preferred || preferred === 'center' || !text || authoredNodeLabels.has(layout.node.id) ||
      options.labelBounds028?.[`node-label:${layout.node.id}`]) continue;
    const font = layout.font ?? options.defaultFont;
    const measured = measureEdgeLabel028({ text, fontFamily: font.cssFamily,
      fontSize: font.size, fontWeight: font.weight, lineHeight: font.lineHeight });
    const frame = box(layout.x + options.shiftX, layout.y + options.shiftY, layout.width, layout.height);
    // An enclosing container surrounds its member's label; it is not an obstacle.
    const ancestors = new Set<string>();
    for (let parent = sceneById.get(layout.node.id)?.parentId; parent && !ancestors.has(parent);
      parent = sceneById.get(parent)?.parentId) ancestors.add(parent);
    const clear = (bounds: SceneBounds028): boolean =>
      !layouts.some((other) => other.node.id !== layout.node.id && !ancestors.has(other.node.id) && overlapsBounds028(bounds,
        box(other.x + options.shiftX, other.y + options.shiftY, other.width, other.height), 3)) &&
      ![...authoredNodeLabels.values()].some((label) => overlapsBounds028(bounds, label.bounds, 3)) &&
      !scene.edges.some((edge) => edge.points.slice(1).some((end, index) => routeHitsBounds028(
        { x: edge.points[index]!.x + options.shiftX, y: edge.points[index]!.y + options.shiftY },
        { x: end.x + options.shiftX, y: end.y + options.shiftY }, bounds, visual.strokeWidth / 2 + 2)) ||
        ([[edge.source, edge.points[0], edge.points[1]], [edge.target, edge.points.at(-1), edge.points.at(-2)]] as const)
          .some(([end, point, next]) => {
            if (!point || !end.marker || end.marker.kind === 'none') return false;
            // A marker is drawn in a 10 x stroke square with refX 14, refY 8 of
            // 16, so on an axis-aligned final segment it reaches 5 x stroke
            // across the segment; other segments keep the rotation-safe square.
            const along = visual.strokeWidth * 10 + 2;
            const vertical = next !== undefined && Math.abs(next.x - point.x) < 1e-6 && Math.abs(next.y - point.y) >= 1e-6;
            const horizontal = next !== undefined && Math.abs(next.y - point.y) < 1e-6 && Math.abs(next.x - point.x) >= 1e-6;
            const across = vertical || horizontal ? visual.strokeWidth * 5 + 2 : along;
            const [halfWidth, halfHeight] = horizontal ? [along, across] : [across, along];
            return overlapsBounds028(bounds, box(point.x + options.shiftX - halfWidth, point.y + options.shiftY - halfHeight,
              halfWidth * 2, halfHeight * 2));
          }) ||
        edge.endpointLabels.some((label) => {
          const ink = measureText({ text: label.text, fontFamily: options.defaultFont.cssFamily,
            fontSize: options.defaultFont.size, fontWeight: options.defaultFont.weight });
          return overlapsBounds028(bounds, box(label.x + options.shiftX - ink.width / 2,
            label.y + options.shiftY - ink.height, ink.width, ink.height), 3);
        }));
    const sides = [preferred, ...(['below', 'above', 'right', 'left'] as const).filter((side) => side !== preferred)];
    const bounds = sides.map((side) => authoredNodeLabelBox028(frame, { side }, measured.width, measured.height))
      .find(clear);
    if (!bounds) continue;
    authoredNodeLabels.set(layout.node.id, nodeLabelPart(layout.node.id, text, bounds, measured.baselineOffset, font));
    preferredUserLabels.add(layout.node.id);
  }
  const nodeObstacles: { id: string; bounds: SceneBounds028 }[] = [];
  const labelIndices = (scene.edges.some((edge) => edge.label) || authoredNodeLabels.size) ? (() => {
    const routeIndex = boundsIndex028<readonly [Position, Position]>();
    for (const edge of scene.edges) for (let index = 1; index < edge.points.length; index += 1) {
      const segment = [edge.points[index - 1]!, edge.points[index]!].map((point) =>
        ({ x: point.x + options.shiftX, y: point.y + options.shiftY })) as [Position, Position];
      routeIndex.insert(segment, pointBounds(segment));
    }
    const nodeIndex = boundsIndex028<SceneBounds028>();
    const insertNode = (id: string, bounds: SceneBounds028) => {
      nodeIndex.insert(bounds, bounds); nodeObstacles.push({ id, bounds });
    };
    for (const layout of layouts) {
      const bounds = box(layout.x + options.shiftX, layout.y + options.shiftY,
        layout.width, layout.height);
      if (scene.nodes.find(node => node.id === layout.node.id)?.container) {
        // A container's interior is usable by its children and their edges.
        // Reserve its border and actual title ink rather than a solid body.
        const node = scene.nodes.find((candidate) => candidate.id === layout.node.id)!;
        const shape = containerStencilShape028(sceneNodeShape029(node)!, layout.width, layout.height, node.container);
        const fit = stencilFit028(shape, layout.width, layout.height);
        const stencil = stencilPathPrimitives028({ ownerId: node.id, style: options.style,
          shapeId: node.shapeId, parameters: node.shapeParameters, fill: 'none',
          stroke: visual.ink, strokeWidth: visual.strokeWidth, scale: fit.scale,
          doubleOutline: node.style.doubleOutline,
          ...(node.container && node.shapeId === 'rectangle' ? { containerFrame: { width: layout.width, height: layout.height } } : {}) });
        for (const primitive of stencil) {
          const thickness = visual.strokeWidth + (primitive.transform ? fit.scale * 2 : 1);
          for (const segment of svgPathContour028({ ...shape, path: primitive.d })) {
            const points = [segment.start, segment.end].map((point) => ({
              x: bounds.x + fit.offsetX + point.x * fit.fittedWidth,
              y: bounds.y + fit.offsetY + point.y * fit.fittedHeight }));
            const envelope = pointBounds(points);
            const border = box(envelope.x - thickness, envelope.y - thickness,
              envelope.width + thickness * 2, envelope.height + thickness * 2);
            insertNode(layout.node.id, border);
          }
        }
        if (layout.labelLayout) for (const run of nodeLabelPrimitives028(layout.node.id, layout.labelLayout,
          layout.font ?? options.defaultFont, visual.ink)) {
          const ink = box(bounds.x + run.inkBounds.x, bounds.y + run.inkBounds.y, run.inkBounds.width, run.inkBounds.height);
          insertNode(layout.node.id, ink);
        }
      } else insertNode(layout.node.id, bounds);
    }
    // Exact node captions reserve space before any movable edge label.
    for (const part of authoredNodeLabels.values()) nodeIndex.insert(part.bounds, part.bounds);
    const labelIndex = boundsIndex028<SceneBounds028>();
    for (const edge of scene.edges) for (const [endpoint, point] of [
      [edge.source, edge.points[0]], [edge.target, edge.points.at(-1)],
    ] as const) {
      if (!point || !endpoint.marker || endpoint.marker.kind === 'none') continue;
      const radius = visual.strokeWidth * 10 + 2;
      const bounds = box(point.x + options.shiftX - radius, point.y + options.shiftY - radius, radius * 2, radius * 2);
      labelIndex.insert(bounds, bounds);
    }
    // Endpoint labels have fixed positions. Reserve their measured ink before
    // placing any movable main edge label, including labels on other edges.
    for (const edge of scene.edges) for (const label of edge.endpointLabels) {
      const measured = measureText({ text: label.text,
        fontFamily: options.defaultFont.cssFamily, fontSize: options.defaultFont.size,
        fontWeight: options.defaultFont.weight });
      const bounds = box(label.x + options.shiftX - measured.width / 2,
        label.y + options.shiftY - measured.height, measured.width, measured.height);
      labelIndex.insert(bounds, bounds);
    }
    return { routeIndex, nodeIndex, labelIndex };
  })() : undefined;
  const authoredLabels = new Map<string, { x: number; y: number; bounds: SceneBounds028 }>();
  for (const edge of [...scene.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    const resolved = options.labelBounds028?.[`edge-label:${edge.id}`];
    if (!edge.label || (!edge.labelPlacement && !resolved)) continue;
    const measured = measureEdgeLabel028({ text: edge.label, fontFamily: options.defaultFont.cssFamily,
      fontSize: options.defaultFont.size, fontWeight: options.defaultFont.weight, lineHeight: options.defaultFont.lineHeight });
    const points = edge.points.map((point) => ({ x: point.x + options.shiftX, y: point.y + options.shiftY }));
    const bounds = resolved ? { ...resolved, x: resolved.x + options.shiftX, y: resolved.y + options.shiftY }
      : authoredEdgeLabelBox028(points, edge.labelPlacement!, measured.width, measured.height);
    if (resolved && (Math.abs(resolved.width - measured.width) > 1e-6 || Math.abs(resolved.height - measured.height) > 1e-6))
      failure('render.capability.scene-layout', `Edge ${edge.id} resolved label measurement is stale`, { kind: 'edge', id: edge.id });
    if (edge.labelPlacement && resolved) {
      const expected = authoredEdgeLabelBox028(points, edge.labelPlacement, measured.width, measured.height);
      if (Math.abs(expected.x - bounds.x) > 1e-6 || Math.abs(expected.y - bounds.y) > 1e-6)
        failure('render.capability.scene-layout', `Edge ${edge.id} resolved label contradicts authored placement`, { kind: 'edge', id: edge.id });
    }
    const conflicts = labelIndices!.nodeIndex.query(bounds).some((node) => overlapsBounds028(bounds, node)) ||
      labelIndices!.labelIndex.query(bounds).some((label) => overlapsBounds028(bounds, label)) ||
      scene.edges.some((other) => other.id !== edge.id && other.points.slice(1).some((end, index) =>
        routeHitsBounds028({ x: other.points[index].x + options.shiftX, y: other.points[index].y + options.shiftY },
          { x: end.x + options.shiftX, y: end.y + options.shiftY }, bounds, visual.strokeWidth / 2)));
    if (conflicts) failure('render.capability.scene-layout', `Edge ${edge.id} authored label placement overlaps a node, label, endpoint marker or another connector`,
      { kind: 'edge', id: edge.id });
    authoredLabels.set(edge.id, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height, bounds });
    labelIndices!.labelIndex.insert(bounds, bounds);
  }
  for (const edge of scene.edges) {
    const points = edge.points.map((point) => ({ x: point.x + options.shiftX, y: point.y + options.shiftY }));
    const cornerRadii = options.style === 'hifi' && edge.generatedRoute
      ? routeCornerRadii028(points, scene.nodes.map((node) => box(
        node.x + options.shiftX, node.y + options.shiftY, node.width, node.height)))
      : undefined;
    add({ id: `${edge.id}:shaft`, owner: { kind: 'edge', id: edge.id }, role: 'edge-shaft',
      bounds: pointBounds(points), geometry: { kind: 'route', points,
        d: inkRoutePath028(points, options.style, cornerRadii),
        ...(cornerRadii ? { cornerRadii } : {}),
        stroke: visual.ink, strokeWidth: visual.strokeWidth, hitStrokeWidth: 20,
        dash: visualDashPattern028(edge.id, options.style, edge.style.lineStyle),
        ...(edge.source.marker && edge.source.marker.kind !== 'none'
          ? { markerStart: markerId(edge.source.marker, visual.ink) } : {}),
        ...(edge.target.marker && edge.target.marker.kind !== 'none'
          ? { markerEnd: markerId(edge.target.marker, visual.ink) } : {}) },
      presentationOnly: false });
    for (const endpoint of ['source', 'target'] as const) {
      const marker = edge[endpoint].marker;
      if (!marker || marker.kind === 'none') continue;
      const contact = endpoint === 'source' ? points[0]! : points.at(-1)!;
      // SVG markerUnits="strokeWidth" scales the 10x10 marker viewport by
      // the visible stroke. Rotation can place any corner around the contact.
      const markerRadius = visual.strokeWidth * 10 + 2;
      add({ id: `${edge.id}:${endpoint}-marker`, owner: { kind: 'edge', id: edge.id },
        role: endpoint === 'source' ? 'source-marker' : 'target-marker',
        bounds: box(contact.x - markerRadius, contact.y - markerRadius,
          markerRadius * 2, markerRadius * 2),
        geometry: { kind: 'marker', contact, marker: clone(marker), stroke: visual.ink },
        presentationOnly: false });
    }
    if (edge.label) {
      const measured = measureEdgeLabel028({ text: edge.label, fontFamily: options.defaultFont.cssFamily,
        fontSize: options.defaultFont.size, fontWeight: options.defaultFont.weight, lineHeight: options.defaultFont.lineHeight });
      const classifierLabel = Boolean(byId.get(edge.sourceId)?.node.classifier || byId.get(edge.targetId)?.node.classifier);
      const label = authoredLabels.get(edge.id) ?? edgeLabelPosition028(edge.id, classifierLabel, points, measured.width, measured.height,
        options.layoutDirection === 'RIGHT' || options.layoutDirection === 'LEFT', labelIndices!.routeIndex, labelIndices!.nodeIndex, labelIndices!.labelIndex);
      if (!authoredLabels.has(edge.id)) labelIndices!.labelIndex.insert(label.bounds, label.bounds);
      add({ id: `${edge.id}:label`, owner: { kind: 'edge', id: edge.id }, role: 'edge-label',
        bounds: label.bounds,
        geometry: { kind: 'text', id: `${edge.id}:label`, ownerId: edge.id,
          role: 'node-label', text: edge.label, x: label.x, y: label.bounds.y + measured.baselineOffset,
          ...(edge.labelPlacement ? { labelPlacement: clone(edge.labelPlacement), background: visual.paper } : {}),
          inkBounds: label.bounds,
          anchor: 'middle', fontFamily: options.defaultFont.cssFamily,
          fontSize: options.defaultFont.size, fontWeight: options.defaultFont.weight,
          lineHeight: options.defaultFont.lineHeight, fill: visual.ink },
        presentationOnly: false });
    }
    for (const label of edge.endpointLabels) {
      const x = label.x + options.shiftX; const y = label.y + options.shiftY;
      const measured = measureText({ text: label.text,
        fontFamily: options.defaultFont.cssFamily, fontSize: options.defaultFont.size,
        fontWeight: options.defaultFont.weight });
      add({ id: `${edge.id}:${label.endpoint}:${label.kind}`, owner: { kind: 'edge', id: edge.id },
        role: 'endpoint-label', bounds: box(x - measured.width / 2, y - measured.height,
          measured.width, measured.height), geometry: { kind: 'text',
          id: `${edge.id}:${label.endpoint}:${label.kind}`, ownerId: edge.id,
          role: 'node-label', text: label.text, x, y,
          endpoint: label.endpoint, endpointLabelKind: label.kind,
          inkBounds: { x: x - measured.width / 2, y: y - measured.height,
            width: measured.width, height: measured.height },
          anchor: 'middle', fontFamily: options.defaultFont.cssFamily,
          fontSize: options.defaultFont.size, fontWeight: options.defaultFont.weight,
          lineHeight: options.defaultFont.lineHeight, fill: visual.ink },
        presentationOnly: false });
    }
  }
  for (const node of scene.nodes) {
    const layout = byId.get(node.id);
    if (!layout) failure('render.capability.scene-layout', `missing node ${node.id}`,
      { kind: 'node', id: node.id });
    const x = layout.x + options.shiftX; const y = layout.y + options.shiftY;
    const installedShape = sceneNodeShape029(node);
    const shape = installedShape && containerStencilShape028(installedShape, layout.width, layout.height, node.container);
    if (!shape) failure('render.capability.stencil', `${node.shapeId} is not installed`,
      { kind: 'node', id: node.id });
    const eventFrame = isBpmnEventSymbol028(node.symbolId)
      ? bpmnEventFrame028(layout.width, layout.height, options.layoutDirection ?? 'RIGHT') : undefined;
    const gatewayFrame = isBpmnGatewaySymbol028(node.symbolId)
      ? bpmnGatewayFrame028(layout.width, layout.height,
        options.layoutDirection ?? 'RIGHT') : undefined;
    const frame = gatewayFrame ?? box(0, 0, layout.width, layout.height);
    const fit = eventFrame ? undefined : stencilFit028(shape, frame.width, frame.height, { symbolId: node.symbolId, layoutDirection: options.layoutDirection });
    if (node.outline029 && node.artwork029) {
      // The per-definition outline clip is exact only for frames of the definition's aspect ratio.
      const { width: W, height: H } = node.outline029;
      if (Math.abs(layout.width * H - layout.height * W) > 1e-6 * W * H)
        failure('render.capability.scene-layout', `Node ${node.id} frame ${layout.width}×${layout.height} does not keep the aspect ratio of ${node.outline029.symbolId}`,
          { kind: 'node', id: node.id });
      const artworkFrame = box(x, y, layout.width, layout.height);
      add({ id: `${node.id}:artwork`, owner: { kind: 'node', id: node.id }, role: 'artwork',
        bounds: artworkFrame, presentationOnly: false,
        geometry: { kind: 'artwork', symbolId: node.outline029.symbolId, localId: node.artwork029.localId,
          frame: artworkFrame,
          ...(node.artwork029.tint === 'stroke' ? { tint: visual.ink } : {}) } });
    }
    const stencil = node.artwork029 ? [] : eventFrame
      ? bpmnEventPathPrimitives028(node.id, node.symbolId!, options.style,
        visual.paper, visual.ink)
      : stencilPathPrimitives028({ ownerId: node.id, style: options.style,
        shapeId: node.shapeId, parameters: node.shapeParameters,
        fill: (Boolean(layout.node.children?.length) || layout.node.type === 'group') && !layout.node.classifier ? 'none' : visual.paper,
        stroke: visual.ink, strokeWidth: visual.strokeWidth,
        strokeDasharray: node.style.strokeDasharray,
        doubleOutline: node.style.doubleOutline, scale: fit!.scale,
        ...(node.container && node.shapeId === 'rectangle' ? { containerFrame: { width: layout.width, height: layout.height } } : {}) });
    for (const primitive of stencil) {
      const partX = x + (eventFrame?.x ?? frame.x);
      const partY = y + (eventFrame?.y ?? frame.y);
      add({ id: primitive.id,
        owner: { kind: 'node', id: node.id }, role: primitive.role,
        bounds: eventFrame
          ? box(partX, partY, eventFrame.width, eventFrame.height)
          : primitive.role === 'corner-overdraw'
            ? box(partX - 6 * fit!.scale, partY - 6 * fit!.scale,
              frame.width + 12 * fit!.scale, frame.height + 12 * fit!.scale)
            : box(partX, partY, frame.width, frame.height),
        geometry: { ...primitive, kind: 'stencil-path',
          ...(primitive.transform ? { innerTransform: primitive.transform } : {}),
          transform: eventFrame ? { x: partX, y: partY, scale: 1 }
            : { x: partX + fit!.offsetX - fit!.viewX * fit!.scale,
              y: partY + fit!.offsetY - fit!.viewY * fit!.scale, scale: fit!.scale } },
        presentationOnly: primitive.role === 'corner-overdraw' });
    }
    if (node.glyph) {
      const [, , glyphWidth, glyphHeight] = node.glyph.viewBox.split(/\s+/).map(Number);
      const glyphSize = Math.min(20, layout.height / 3);
      node.glyph.paths.forEach((path, index) => add({
        id: `${node.id}:glyph:${index + 1}`, owner: { kind: 'node', id: node.id }, role: 'glyph',
        bounds: box(x + 8, y + 8, glyphSize, glyphSize),
        geometry: { kind: 'decoration-path', d: path.d,
          fill: path.filled ? visual.ink : 'none', stroke: visual.ink,
          strokeWidth: 1.5, name: node.glyph!.name,
          transform: { x: x + 8, y: y + 8,
            scaleX: glyphSize / glyphWidth!, scaleY: glyphSize / glyphHeight! } },
        presentationOnly: false,
      }));
    }
    if (node.symbolMarker) {
      const name = symbolMarkerName(node.symbolMarker);
      const gatewayMarker = Boolean(gatewayFrame);
      const markerSize = gatewayMarker
        ? Math.min(36, frame.width / 4, frame.height / 4) : 16;
      const markerX = gatewayMarker ? x + frame.x + (frame.width - markerSize) / 2
        : x + layout.width - 22;
      const markerY = gatewayMarker ? y + frame.y + (frame.height - markerSize) / 2 : y + 6;
      symbolMarkerPrimitives(node.symbolMarker).forEach((marker, index) => add({
        id: `${node.id}:symbol-marker:${index + 1}`, owner: { kind: 'node', id: node.id },
        role: 'symbol-marker', bounds: box(markerX, markerY, markerSize, markerSize),
        geometry: { kind: 'decoration-path', d: marker.d, fill: 'none',
          stroke: visual.ink, strokeWidth: 1.5, name,
          symbolMarkerId: node.symbolMarker,
          transform: { x: markerX, y: markerY,
            scaleX: markerSize / 16, scaleY: markerSize / 16 } },
        presentationOnly: false,
      }));
    }
    const font = layout.font ?? options.defaultFont;
    if (node.classifier) {
      const drawing = classifierPrimitives028(node.id, node.classifier, layout.width, font, visual.ink);
      const frame = eventFrame ?? box(fit!.offsetX, fit!.offsetY,
        fit!.fittedWidth, fit!.fittedHeight);
      const fitsFrame = drawing.text.every((run) =>
        run.inkBounds.x >= frame.x - 1e-6 &&
        run.inkBounds.x + run.inkBounds.width <= frame.x + frame.width + 1e-6 &&
        run.inkBounds.y >= frame.y - 1e-6 &&
        run.inkBounds.y + run.inkBounds.height <= frame.y + frame.height + 1e-6) &&
        drawing.separators.every((divider) =>
          divider.x1 >= frame.x - 1e-6 && divider.x2 <= frame.x + frame.width + 1e-6 &&
          divider.y1 >= frame.y - 1e-6 && divider.y1 <= frame.y + frame.height + 1e-6);
      if (drawing.requiredHeight > layout.height + 1e-6 || !fitsFrame) {
        failure('render.capability.hard-size-text-conflict',
          `classifier ${node.id} rows require a frame larger than ${layout.width}×${layout.height}px`,
          { kind: 'node', id: node.id });
      }
      for (const divider of drawing.separators) add({ id: divider.id,
        owner: { kind: 'node', id: node.id }, role: divider.role,
        bounds: box(x + divider.x1, y + divider.y1, divider.x2 - divider.x1, 0),
        geometry: { kind: 'divider', x1: x + divider.x1, y1: y + divider.y1,
          x2: x + divider.x2, y2: y + divider.y2,
          stroke: divider.stroke, strokeWidth: divider.strokeWidth }, presentationOnly: false });
      for (const run of drawing.text) add({ id: run.id,
        owner: { kind: 'node', id: node.id }, role: run.role,
        bounds: box(x + run.inkBounds.x, y + run.inkBounds.y,
          run.inkBounds.width, run.inkBounds.height),
        geometry: { ...run, kind: 'text', x: x + run.x, y: y + run.y,
          ...(node.text.fontStyle ? { fontStyle: node.text.fontStyle } : {}),
          ...(node.text.textDecoration ? { textDecoration: node.text.textDecoration } : {}) },
        presentationOnly: false });
    } else if (authoredNodeLabels.has(node.id)) {
      const part = authoredNodeLabels.get(node.id)!;
      add(part.geometry.kind === 'text' ? { ...part, geometry: { ...part.geometry,
        ...(node.text.fontStyle ? { fontStyle: node.text.fontStyle } : {}),
        ...(node.text.textDecoration ? { textDecoration: node.text.textDecoration } : {}) } } : part);
    } else if (layout.labelLayout) {
      if ((stencilCaptionHeight028(shape.id, { symbolId: node.symbolId }) > 0 || shape.id === 'hexagon') && layout.labelLayout.lines.some((line) => line.length > 0) &&
        (layout.labelLayout.textWidth > layout.labelLayout.textBox.width + 1e-6 ||
          layout.labelLayout.textHeight > layout.labelLayout.textBox.height + 1e-6))
        failure('render.capability.hard-size-text-conflict',
          `Node ${node.id} label cannot fit its painted ${node.shapeId} text region (${layout.labelLayout.textWidth}×${layout.labelLayout.textHeight} in ${layout.labelLayout.textBox.width}×${layout.labelLayout.textBox.height})`, { kind: 'node', id: node.id });
      const runs = nodeLabelPrimitives028(node.id, layout.labelLayout, font, visual.ink).map(run => {
        if (!node.container) return run;
        const ink = textInkVertical028(run.text, font);
        return { ...run, inkBounds: { ...run.inkBounds,
          y: run.y - ink.ascent * font.size, height: (ink.ascent + ink.descent) * font.size } };
      });
      const labelOffsetX = gatewayFrame
        ? bpmnGatewayCaptionOffsetX028(layout.labelLayout,
          options.layoutDirection ?? 'RIGHT') : eventFrame
          ? bpmnEventCaptionOffsetX028(layout.labelLayout, options.layoutDirection ?? 'RIGHT') : 0;
      for (const run of runs) {
        add({ id: run.id, owner: { kind: 'node', id: node.id }, role: run.role,
          bounds: box(x + run.inkBounds.x + labelOffsetX, y + run.inkBounds.y,
            run.inkBounds.width, run.inkBounds.height),
          geometry: { ...run, kind: 'text', x: x + run.x + labelOffsetX, y: y + run.y,
            inkBounds: { ...run.inkBounds, x: run.inkBounds.x + labelOffsetX },
            ...(node.text.fontStyle ? { fontStyle: node.text.fontStyle } : {}),
            ...(node.text.textDecoration ? { textDecoration: node.text.textDecoration } : {}) },
          presentationOnly: false });
      }
    }
  }
  for (const [id, label] of authoredNodeLabels) {
    if (preferredUserLabels.has(id)) continue;
    const bounds = label.bounds;
    const otherBody = nodeObstacles.some((obstacle) => obstacle.id !== id && overlapsBounds028(bounds, obstacle.bounds));
    const otherLabel = parts.some((part) => part.id !== label.id && part.geometry.kind === 'text' &&
      overlapsBounds028(bounds, part.bounds));
    const connector = scene.edges.some((edge) => edge.points.slice(1).some((end, index) => routeHitsBounds028(
      { x: edge.points[index].x + options.shiftX, y: edge.points[index].y + options.shiftY },
      { x: end.x + options.shiftX, y: end.y + options.shiftY }, bounds, visual.strokeWidth / 2)));
    const marker = parts.some((part) => part.geometry.kind === 'marker' && overlapsBounds028(bounds, part.bounds));
    if (otherBody || otherLabel || connector || marker) failure('render.capability.scene-layout',
      `Node ${id} authored label placement overlaps a node, label, connector or endpoint marker`, { kind: 'node', id });
  }
  // Captions belong to their node but remain clear of every connector,
  // including routes attached to that same icon. Never hide a hard-route clash.
  for (const node of scene.nodes) {
    const shape028 = sceneNodeShape029(node)!;
    const isCaptionedIcon = stencilCaptionHeight028(shape028.id, { symbolId: node.symbolId }) > 0;
    const region = stencilLabelSizing028(shape028, { symbolId: node.symbolId }).textRegion;
    if (!node.container && !isCaptionedIcon && (!region || region.y <= 0.5)) continue;
    const captions = parts.filter((part) => part.owner.kind === 'node' &&
      part.owner.id === node.id && part.geometry.kind === 'text' && part.bounds.width > 0);
    if (node.container) for (const child of scene.nodes) {
      let parentId = child.parentId;
      const seen = new Set<string>();
      while (parentId && !seen.has(parentId)) {
        if (parentId === node.id) {
          const childParts = parts.filter(part => part.owner.kind === 'node' && part.owner.id === child.id &&
            (part.role === 'outline' || part.geometry.kind === 'text'));
          if (captions.some(caption => childParts.some(part => overlapsBounds028(caption.bounds, part.bounds))))
            failure('render.capability.scene-layout', `Child ${child.id} overlaps container ${node.id} caption`,
              { kind: 'node', id: child.id });
          break;
        }
        seen.add(parentId);
        parentId = scene.nodes.find(candidate => candidate.id === parentId)?.parentId;
      }
    }
    for (const edge of scene.edges) for (const caption of captions) {
      if (edge.points.slice(1).some((end, index) => routeHitsBounds028(
        { x: edge.points[index].x + options.shiftX, y: edge.points[index].y + options.shiftY },
        { x: end.x + options.shiftX, y: end.y + options.shiftY }, caption.bounds, visual.strokeWidth / 2)))
        failure('render.capability.scene-layout', `Connector "${edge.id}" (${edge.sourceId} → ${edge.targetId}) crosses the ${node.container ? 'container' : 'icon'} "${node.id}" caption`,
          { kind: 'edge', id: edge.id });
    }
  }
  for (const [id, authored] of authoredLabels) {
    if (parts.some((part) => part.owner.kind === 'edge' && part.id !== `${id}:label` &&
      part.geometry.kind === 'text' && overlapsBounds028(authored.bounds, part.bounds)))
      failure('render.capability.scene-layout', `Edge ${id} authored label placement overlaps another label`, { kind: 'edge', id });
  }
  const ids = new Set<string>();
  for (const part of parts) {
    if (ids.has(part.id)) failure('render.capability.scene-ids', `duplicate part ${part.id}`,
      part.owner);
    ids.add(part.id);
  }
  return parts;
}
