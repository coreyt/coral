import { containerStencilShape028, isContainerNode028 } from '../containerGeometry028.js';
import { routeFixedGeometry, terminalElbowCandidates } from './routeFixedGeometry.js';
import { captionedStencilFrame029, isSideCaptionDirection0211, stencilCaptionHeight028 } from '../stencilLabelGeometry028.js';
import type {
  GraphEdge,
  GraphIR,
  GraphNode,
  Padding,
  Port,
  RouteAnchor,
  SpatialConstraint,
} from '@graph-ir/core';
import { authoredNodeLabelBox028 } from '../nodeLabelPlacement028.js';
import { userSymbolOutsideLabels029 } from './userSymbolOutsideLabels029.js';
import { alignGroupColumns0211 } from './alignmentPolish0211.js';
import { alignFlowchartSpine0211 } from './flowchartSpineAlign0211.js';
import { coordinateBatchRoutes0211, type BatchNodeInfo0211 } from './batchRouter0211.js';
import { inkBoundsForFrame0211 } from './shapeInkBounds0211.js';
import { LayoutExecutionError } from './engine.js';
import { authoredEdgeLabelBox028, measureEdgeLabel028 } from '../edgeLabelPlacement028.js';
import { edgeProximity028, proximityClearance028, withoutProximity028 } from '../proximityLayout028.js';
import { prepareSpatialScene028, resolveSvgNodeFont, containerTitleBox028, type SvgOptions } from '../svg/serialize.js';
import { laneContourContact029, resolveContourContact028, resolveNodeAppearance, resolveRenderScene, RenderCapabilityError } from '../scene.js';
import { computeElkLayout, normalizeLayoutOptions } from './engine.js';
import { shapeRegistry } from '../shapes/index.js';
import { catalogShape029, catalogSymbol029, sceneNodeShape029 } from '../catalogLookup029.js';
import type { CatalogSnapshot028 } from '../interpretation028.js';
import { layoutPortShape029 } from '../semanticLayoutPorts028.js';
import { frameFitPoint029, isUserOutlineShape029 } from '../userSymbolGeometry029.js';
import { renderSymbolId, resolveEdgeAppearance, resolveSymbolIndex } from '../scene.js';
import { effectiveGraphNotationId028 } from '../graphNotation028.js';
import { bpmnGatewayFrame028, isBpmnGatewaySymbol028 } from '../bpmnGatewayVisual028.js';
import { bpmnEventCaptionBox028, bpmnEventFrame028, isBpmnEventSymbol028 } from '../bpmnEventVisual028.js';
import { isStateCircleSymbol0217, isStateSyncBarSymbol0217, stateCircleRadius0217 } from '../stateVisual0217.js';
import { cornerAnchorForAttachment028, stencilAnchorPoint028, stencilFitPoint028,
  stencilRayPoint028, stencilFit028, StencilAnchorGeometryCapabilityError } from '../stencilAnchorGeometry028.js';
import type {
  LayoutOptionInput,
  LayoutResult,
  LayoutDirection,
  LayoutPort,
  LayoutNode,
  LayoutSection,
  OutsideLabel029,
  Point,
  ResolvedEdgeRoute,
  ResolvedLayout,
  ResolvedNodeRect,
  SpatialLayoutDiagnostic,
  SpatialLayoutRequest,
} from './types.js';

import { mergeAuthoredLayoutOptions028, nodeConstraint028, spatialConstraintReferences028, spatialReferenceKey028, verifySpatialConstraints028,
  type SpatialSidecar028, type SpatialConstraint028 } from './typedSpatial028.js';

import { validateRouteSections, segmentIntersectsBox, RouteGeometryError } from './routeGeometry.js';
import {
  alignVisualFlow0210,
  buildAlignedFlowRoute0210,
  type AlignableRect,
  type VisualFlowAlignResult0210,
  type VisualNodeMetrics0210,
} from './visualFlowAlign0210.js';

const TOLERANCE = 1e-6;
const DEFAULT_WIDTH = 150;
const DEFAULT_HEIGHT = 60;

interface NodeRecord {
  node: GraphNode;
  notationId?: string;
  /** Edition 0.2.9 document catalog; user symbols resolve only through it. */
  catalog?: CatalogSnapshot028;
  direction: LayoutDirection;
  parentId?: string;
  padding: Required<Padding>;
  autoSized: boolean;
  binding?: { ownerId: string; offset: Point };
  linearBinding?: { owners: Array<{ id: string; weight: number }>; offset: Point };
  fixedPoints?: Point[];
  spatialSynthetic?: boolean;
  authoredLabelSize?: { width: number; height: number };
  /** The label ELK reserved for a user symbol; routes keep clear of it like the body. */
  reservedLabel029?: OutsideLabel029;
  containerTitleOptions?: SvgOptions;
  portIncidence?: Map<string, number>;
}

interface MutableRect extends ResolvedNodeRect {
  fixed: boolean;
}

export class SpatialLayoutError extends Error {
  readonly diagnostics: SpatialLayoutDiagnostic[];

  constructor(diagnostics: SpatialLayoutDiagnostic[]) {
    const visible = diagnostics.length ? diagnostics : [{ code: 'layout.capability.unsupported' as const, severity: 'error' as const,
      message: 'Spatial geometry could not be verified' }];
    super(visible.map((diagnostic) => diagnostic.message).join('; '));
    this.name = 'SpatialLayoutError';
    this.diagnostics = visible;
  }
}

const zeroPadding = (): Required<Padding> => ({ top: 0, right: 0, bottom: 0, left: 0 });

function padding(node: GraphNode): Required<Padding> {
  return { ...zeroPadding(), ...node.layoutOptions?.padding };
}

function indexNodes(nodes: GraphNode[], direction: LayoutDirection,
  notationId?: string, catalog?: CatalogSnapshot028, parentId?: string,
  out = new Map<string, NodeRecord>()): Map<string, NodeRecord> {
  for (const node of nodes) {
    out.set(node.id, {
      node, direction, ...(notationId ? { notationId } : {}), ...(catalog ? { catalog } : {}),
      ...(parentId ? { parentId } : {}), padding: padding(node),
      autoSized: node.dimensions === undefined && Boolean(node.children?.length),
    });
    indexNodes(node.children ?? [], direction, notationId, catalog, node.id, out);
  }
  return out;
}

/** Shared by direct layout and editor workers before computing candidates. */
export function codeBranchRoutingDefaults028(notationId: string | undefined,
  effectiveOptions?: Record<string, string | number | boolean>): Record<string, number> {
  const edgeNodeKey = 'elk.layered.spacing.edgeNodeBetweenLayers';
  const edgeEdgeKey = 'elk.layered.spacing.edgeEdgeBetweenLayers';
  if (notationId === 'code') {
    return effectiveOptions?.[edgeNodeKey] === undefined ? { [edgeNodeKey]: 28 } : {};
  }
  if (notationId === 'aiml') {
    return {
      ...(effectiveOptions?.[edgeNodeKey] === undefined ? { [edgeNodeKey]: 36 } : {}),
      ...(effectiveOptions?.[edgeEdgeKey] === undefined ? { [edgeEdgeKey]: 16 } : {}),
    };
  }
  return {};
}

function inputNode(
  node: GraphNode,
  parentPadding: Required<Padding>,
  operation: SpatialLayoutRequest['operation'],
  automaticPadding?: SpatialLayoutRequest['automaticPadding028'],
): LayoutNode {
  const authored = node.position && (operation !== 'reflow' || node.pinned)
    ? { x: node.position.x + parentPadding.left, y: node.position.y + parentPadding.top }
    : undefined;
  const position = authored;
  return {
    id: node.id,
    width: node.dimensions?.width ?? DEFAULT_WIDTH,
    height: node.dimensions?.height ?? DEFAULT_HEIGHT,
    ...(position ? { position } : {}),
    ...(node.pinned !== undefined ? { pinned: node.pinned } : {}),
    ...(node.ports ? { ports: node.ports } : {}),
    ...(node.layoutOptions ? { layoutOptions: node.layoutOptions } : {}),
    ...(automaticPadding?.has(node.id) ? { automaticPadding028: automaticPadding.get(node.id)! } : {}),
    ...(node.children ? {
      children: node.children.map((child) => inputNode(child, padding(node), operation, automaticPadding)),
    } : {}),
  };
}

/** Rank UML generalizations from base to subtype without changing authored edge meaning. */
export function classGeneralizationRankEdges028(graph: GraphIR, notationId?: string): Set<string> {
  if (notationId !== 'uml-class') return new Set();
  const symbols = resolveSymbolIndex(graph.nodes, notationId);
  const generalizations = graph.edges.filter((edge) => {
    const appearance = resolveEdgeAppearance(edge, symbols, notationId, '#000');
    const isOpenTriangle = (endpoint: typeof appearance.source) =>
      endpoint.marker?.kind === 'triangle' && endpoint.marker.fill !== 'filled';
    return isOpenTriangle(appearance.target) && !isOpenTriangle(appearance.source);
  });
  // A named side or authored route is geometric intent. Keep its whole base
  // family in the original rank orientation so free heads meet that side.
  const authoredBases = new Set(generalizations.filter((edge) =>
    edge.sourcePort || edge.targetPort || edge.routeIntent).map((edge) => edge.target));
  return new Set(generalizations.filter((edge) => !authoredBases.has(edge.target))
    .map((edge) => edge.id));
}

/**
 * When sibling containers inside a compound graph form a directed cycle
 * (e.g. Public Subnet -> Private Subnet via ALB->API and Private -> Public via
 * Worker->NAT), ELK's greedy cycle breaker can invert the container flow order.
 * Reversing only the back-edges from later-declared sibling containers to
 * earlier-declared sibling containers keeps the architectural container order
 * clean left-to-right while preserving true semantic arrowheads.
 */
function nestedContainerCycleBackEdges0211(graph: GraphIR): Set<string> {
  const result = new Set<string>();
  const parentOf = new Map<string, string>();
  const siblingOrder = new Map<string, number>();
  const hasChildren = new Set<string>();
  const walk = (nodes: readonly GraphNode[], parentId?: string) => {
    nodes.forEach((node, idx) => {
      siblingOrder.set(node.id, idx);
      if (parentId) parentOf.set(node.id, parentId);
      if (node.children?.length) {
        hasChildren.add(node.id);
        walk(node.children, node.id);
      }
    });
  };
  walk(graph.nodes);
  if (hasChildren.size < 2) return result;

  const ancestorChain = (id: string): string[] => {
    const chain: string[] = [];
    let cur: string | undefined = id;
    while (cur) { chain.push(cur); cur = parentOf.get(cur); }
    return chain.reverse();
  };

  // Group cross-container edges by the lowest common parent container.
  const byParent = new Map<string, Array<{ edge: GraphEdge; srcChild: string; tgtChild: string }>>();
  for (const edge of graph.edges) {
    if (edge.routeIntent || edge.sourcePort || edge.targetPort || edge.source === edge.target) continue;
    const sc = ancestorChain(edge.source);
    const tc = ancestorChain(edge.target);
    let lca = -1;
    while (lca + 1 < sc.length && lca + 1 < tc.length && sc[lca + 1] === tc[lca + 1]) lca++;
    const srcChild = sc[lca + 1];
    const tgtChild = tc[lca + 1];
    if (!srcChild || !tgtChild || srcChild === tgtChild) continue;
    if (!hasChildren.has(srcChild) || !hasChildren.has(tgtChild)) continue;
    const parentKey = lca >= 0 ? sc[lca]! : '__root__';
    const list = byParent.get(parentKey) ?? [];
    list.push({ edge, srcChild, tgtChild });
    byParent.set(parentKey, list);
  }

  for (const entries of byParent.values()) {
    // Only act when sibling containers actually have a directed cycle.
    const adj = new Map<string, Set<string>>();
    for (const { srcChild, tgtChild } of entries) {
      const s = adj.get(srcChild) ?? new Set<string>();
      s.add(tgtChild);
      adj.set(srcChild, s);
    }
    const state = new Map<string, number>();
    let hasCycle = false;
    const dfs = (u: string): void => {
      state.set(u, 1);
      for (const v of adj.get(u) ?? []) {
        if (state.get(v) === 1) { hasCycle = true; return; }
        if (!state.has(v)) dfs(v);
        if (hasCycle) return;
      }
      state.set(u, 2);
    };
    for (const u of adj.keys()) {
      if (!state.has(u)) dfs(u);
      if (hasCycle) break;
    }
    if (!hasCycle) continue;
    for (const { edge, srcChild, tgtChild } of entries) {
      if ((siblingOrder.get(srcChild) ?? 0) > (siblingOrder.get(tgtChild) ?? 0)) {
        result.add(edge.id);
      }
    }
  }
  return result;
}

function hasDirectedCycle(graph: GraphIR): boolean {
  const targets = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const next = targets.get(edge.source) ?? [];
    next.push(edge.target);
    targets.set(edge.source, next);
  }
  const states = new Map<string, 'visiting' | 'visited'>();
  const visit = (id: string): boolean => {
    if (states.get(id) === 'visiting') return true;
    if (states.get(id) === 'visited') return false;
    states.set(id, 'visiting');
    for (const target of targets.get(id) ?? []) if (visit(target)) return true;
    states.set(id, 'visited');
    return false;
  };
  return [...targets.keys()].some(visit);
}

/** Find one long forward BPMN path without changing source topology or labels. */
function bpmnSpineNodes(graph: GraphIR): string[] {
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, number>();
  for (const node of graph.nodes) incoming.set(node.id, 0);
  for (const edge of graph.edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }
  // Discard feedback edges from this layout hint. They remain in the graph.
  const state = new Map<string, 'visiting' | 'visited'>();
  const feedback = new Set<string>();
  const visit = (id: string): void => {
    if (state.has(id)) return;
    state.set(id, 'visiting');
    for (const edge of outgoing.get(id) ?? []) {
      if (state.get(edge.target) === 'visiting') feedback.add(edge.id);
      else visit(edge.target);
    }
    state.set(id, 'visited');
  };
  for (const node of graph.nodes) visit(node.id);
  const ends = new Set(graph.nodes.filter((node) =>
    renderSymbolId(node, 'bpmn') === 'bpmn-end-event' || node.type === 'endEvent')
    .map((node) => node.id));
  const score = new Map<string, { reachesEnd: boolean; length: number }>();
  const better = (left: { reachesEnd: boolean; length: number },
    right: { reachesEnd: boolean; length: number }): boolean =>
    Number(left.reachesEnd) > Number(right.reachesEnd) ||
    (left.reachesEnd === right.reachesEnd && left.length > right.length);
  const longest = (id: string): { reachesEnd: boolean; length: number } => {
    if (score.has(id)) return score.get(id)!;
    let result = { reachesEnd: ends.has(id), length: 0 };
    for (const edge of outgoing.get(id) ?? []) {
      if (feedback.has(edge.id)) continue;
      const child = longest(edge.target);
      const candidate = { reachesEnd: child.reachesEnd, length: child.length + 1 };
      if (better(candidate, result)) result = candidate;
    }
    score.set(id, result);
    return result;
  };
  const starts = graph.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
  if (!starts.length) return [];
  const start = starts.reduce((best, node) =>
    better(longest(node.id), longest(best.id)) ? node : best);
  const spine = [start.id];
  let current = start.id;
  while (true) {
    const next = (outgoing.get(current) ?? [])
      .filter((edge) => !feedback.has(edge.id))
      .reduce<GraphEdge | undefined>((best, edge) =>
        !best || better(longest(edge.target), longest(best.target)) ? edge : best, undefined);
    if (!next) break;
    spine.push(next.target);
    current = next.target;
  }
  return spine;
}

function inputEdges(edges: GraphEdge[], rankReversed: Set<string>) {
  return edges.map((edge) => rankReversed.has(edge.id) ? ({
    id: edge.id, source: edge.target, target: edge.source,
    ...(edge.targetPort ? { sourcePort: edge.targetPort } : {}),
    ...(edge.sourcePort ? { targetPort: edge.sourcePort } : {}),
  }) : ({
    id: edge.id, source: edge.source, target: edge.target,
    ...(edge.sourcePort ? { sourcePort: edge.sourcePort } : {}),
    ...(edge.targetPort ? { targetPort: edge.targetPort } : {}),
  }));
}

function reverseSections(sections: LayoutSection[]): LayoutSection[] {
  return sections.slice().reverse().map((section) => ({
    startPoint: section.endPoint,
    bendPoints: section.bendPoints.slice().reverse(),
    endPoint: section.startPoint,
  }));
}

function unsupportedPlacement(graph: GraphIR): SpatialLayoutDiagnostic[] {
  const diagnostics: SpatialLayoutDiagnostic[] = [];
  const visit = (nodes: GraphNode[]) => {
    for (const node of nodes) {
      if (node.labelPlacement) {
        try { authoredNodeLabelBox028({ x: 0, y: 0, width: 0, height: 0 }, node.labelPlacement, 0, 0); }
        catch { diagnostics.push({ code: 'layout.capability.unsupported', severity: 'error',
          message: `Invalid label placement for node "${node.id}"`, path: `nodes.${node.id}.labelPlacement`,
          subject: { kind: 'node', id: node.id } }); }
      }
      visit(node.children ?? []);
    }
  };
  visit(graph.nodes);
  for (const edge of graph.edges) if (edge.labelPlacement) {
    try { authoredEdgeLabelBox028([{ x: 0, y: 0 }], edge.labelPlacement, 0, 0); }
    catch { diagnostics.push({ code: 'layout.capability.unsupported', severity: 'error',
      message: `Invalid label placement for edge "${edge.id}"`, path: `edges.${edge.id}.labelPlacement`,
      subject: { kind: 'edge', id: edge.id } }); }
  }
  return diagnostics;
}

function initialRects(
  graph: GraphIR,
  layout: Awaited<ReturnType<typeof computeElkLayout>>,
  operation: SpatialLayoutRequest['operation'],
  records: Map<string, NodeRecord>,
): Map<string, MutableRect> {
  const result = new Map<string, MutableRect>();
  for (const { outsideLabel029, ...laid } of layout.nodes) {
    const record = records.get(laid.id)!;
    if (outsideLabel029) record.reservedLabel029 = outsideLabel029;
    const authored = record.node.position && (operation !== 'reflow' || record.node.pinned)
      ? {
          x: record.node.position.x + (record.parentId ? records.get(record.parentId)!.padding.left : 0),
          y: record.node.position.y + (record.parentId ? records.get(record.parentId)!.padding.top : 0),
        }
      : undefined;
    result.set(laid.id, {
      ...laid,
      position: authored ?? laid.position,
      absolutePosition: { ...laid.absolutePosition },
      width: record.node.dimensions?.width ?? laid.width,
      height: record.node.dimensions?.height ?? laid.height,
      fixed: Boolean(record.node.pinned || (record.node.position && operation !== 'reflow')),
    });
  }
  recomputeAbsolute(result, records);
  return result;
}

function recomputeAbsolute(rects: Map<string, MutableRect>, records: Map<string, NodeRecord>): void {
  const pending = new Set(rects.keys());
  while (pending.size) {
    let progressed = false;
    for (const id of [...pending].sort()) {
      const rect = rects.get(id)!;
      const parentId = records.get(id)?.parentId;
      if (parentId && pending.has(parentId)) continue;
      const parent = parentId ? rects.get(parentId) : undefined;
      rect.absolutePosition = parent
        ? { x: parent.absolutePosition.x + rect.position.x, y: parent.absolutePosition.y + rect.position.y }
        : { ...rect.position };
      pending.delete(id);
      progressed = true;
    }
    if (!progressed) break;
  }
}

function cloneRects(rects: Map<string, MutableRect>): Map<string, MutableRect> {
  return new Map([...rects].map(([id, rect]) => [id, {
    ...rect, position: { ...rect.position }, absolutePosition: { ...rect.absolutePosition },
  }]));
}

function moveAbsolute(
  rect: MutableRect,
  axis: 'x' | 'y',
  value: number,
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
): boolean {
  if (Math.abs(rect.absolutePosition[axis] - value) <= TOLERANCE) return true;
  if (rect.fixed) return false;
  const parentId = records.get(rect.id)?.parentId;
  const parentValue = parentId ? rects.get(parentId)!.absolutePosition[axis] : 0;
  rect.position[axis] = value - parentValue;
  recomputeAbsolute(rects, records);
  return true;
}

function scopeBounds(
  scope: Extract<SpatialConstraint, { kind: 'boundary' }>['scope'],
  rects: Map<string, MutableRect>, records: Map<string, NodeRecord>,
): { left: number; top: number; right: number; bottom: number } | undefined {
  if (scope.kind === 'node') {
    const rect = rects.get(scope.nodeId);
    if (!rect) return undefined;
    return {
      left: rect.absolutePosition.x,
      top: rect.absolutePosition.y,
      right: rect.absolutePosition.x + rect.width,
      bottom: rect.absolutePosition.y + rect.height,
    };
  }
  const top = [...rects.values()].filter((rect) => !records.get(rect.id)?.parentId && !records.get(rect.id)?.spatialSynthetic);
  if (!top.length) return undefined;
  return {
    left: Math.min(...top.map((rect) => rect.absolutePosition.x)),
    top: Math.min(...top.map((rect) => rect.absolutePosition.y)),
    right: Math.max(...top.map((rect) => rect.absolutePosition.x + rect.width)),
    bottom: Math.max(...top.map((rect) => rect.absolutePosition.y + rect.height)),
  };
}

function close(left: number, right: number): boolean {
  return Math.abs(left - right) <= TOLERANCE;
}

function constraintSatisfied(constraint: SpatialConstraint, rects: Map<string, MutableRect>, records: Map<string, NodeRecord>): boolean {
  if (constraint.kind === 'relative') {
    const subject = rects.get(constraint.subject.nodeId);
    const target = rects.get(constraint.target.nodeId);
    if (!subject || !target) return false;
    const gap = constraint.gap ?? 0;
    const horizontal = constraint.relation === 'left-of' || constraint.relation === 'right-of';
    const primary = horizontal ? 'x' : 'y';
    const perpendicular = horizontal ? 'y' : 'x';
    const subjectSize = horizontal ? subject.width : subject.height;
    const targetSize = horizontal ? target.width : target.height;
    const separated = constraint.relation === 'left-of' || constraint.relation === 'above'
      ? subject.absolutePosition[primary] + subjectSize + gap <= target.absolutePosition[primary] + TOLERANCE
      : subject.absolutePosition[primary] + TOLERANCE >= target.absolutePosition[primary] + targetSize + gap;
    const perpendicularSubjectSize = horizontal ? subject.height : subject.width;
    const perpendicularTargetSize = horizontal ? target.height : target.width;
    const offset = constraint.alignment === 'start' ? 0
      : constraint.alignment === 'end' ? perpendicularTargetSize - perpendicularSubjectSize
        : (perpendicularTargetSize - perpendicularSubjectSize) / 2;
    return separated && close(
      subject.absolutePosition[perpendicular], target.absolutePosition[perpendicular] + offset,
    );
  }
  if (constraint.kind === 'boundary') {
    const subject = rects.get(constraint.subject.nodeId);
    const bounds = scopeBounds(constraint.scope, rects, records);
    if (!subject || !bounds) return false;
    const inset = constraint.inset ?? 0;
    const actual = constraint.side === 'left' ? subject.absolutePosition.x
      : constraint.side === 'right' ? subject.absolutePosition.x + subject.width
        : constraint.side === 'top' ? subject.absolutePosition.y
          : subject.absolutePosition.y + subject.height;
    const content = Boolean((constraint as SpatialConstraint & { contentBoundary028?: boolean }).contentBoundary028);
    if (!content) {
      const expected = constraint.side === 'left' ? bounds.left + inset : constraint.side === 'right' ? bounds.right - inset
        : constraint.side === 'top' ? bounds.top + inset : bounds.bottom - inset;
      return close(actual, expected);
    }
    const pad = constraint.scope.kind === 'node' ? records.get(constraint.scope.nodeId)?.padding ?? zeroPadding() : zeroPadding();
    const expected = constraint.side === 'left' ? bounds.left + pad.left + inset
      : constraint.side === 'right' ? bounds.right - pad.right - inset
        : constraint.side === 'top' ? bounds.top + pad.top + inset : bounds.bottom - pad.bottom - inset;
    return close(actual, expected) && subject.absolutePosition.x >= bounds.left + pad.left + inset - TOLERANCE &&
      subject.absolutePosition.y >= bounds.top + pad.top + inset - TOLERANCE &&
      subject.absolutePosition.x + subject.width <= bounds.right - pad.right - inset + TOLERANCE &&
      subject.absolutePosition.y + subject.height <= bounds.bottom - pad.bottom - inset + TOLERANCE;
  }
  const arranged = constraint.subjects.map((subject) => rects.get(subject.nodeId));
  if (arranged.some((rect) => !rect)) return false;
  const nodes = arranged as MutableRect[];
  if (constraint.direction === 'reverse') nodes.reverse();
  const primary = constraint.axis === 'row' ? 'x' : 'y';
  const perpendicular = constraint.axis === 'row' ? 'y' : 'x';
  const gap = constraint.gap ?? 0;
  const first = nodes[0];
  for (let position = 1; position < nodes.length; position += 1) {
    const previous = nodes[position - 1];
    const current = nodes[position];
    const previousSize = primary === 'x' ? previous.width : previous.height;
    if (current.absolutePosition[primary] + TOLERANCE < previous.absolutePosition[primary] + previousSize + gap) return false;
    const firstSize = perpendicular === 'x' ? first.width : first.height;
    const currentSize = perpendicular === 'x' ? current.width : current.height;
    const offset = constraint.alignment === 'start' ? 0
      : constraint.alignment === 'end' ? firstSize - currentSize : (firstSize - currentSize) / 2;
    if (!close(current.absolutePosition[perpendicular], first.absolutePosition[perpendicular] + offset)) return false;
  }
  return true;
}

interface DifferenceEdge { from: number; to: number; weight: number }
interface MinimumSeparation028 { before: string; after: string; axis: 'x' | 'y'; gap: number }

function differenceSolution(variableCount: number, edges: DifferenceEdge[]): number[] | null {
  const distance = Array<number>(variableCount).fill(0);
  for (let pass = 0; pass < variableCount; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      const candidate = distance[edge.from] + edge.weight;
      if (distance[edge.to] > candidate + TOLERANCE) {
        distance[edge.to] = candidate;
        changed = true;
        if (pass === variableCount - 1) return null;
      }
    }
    if (!changed) break;
  }
  return distance;
}

function equality(edges: DifferenceEdge[], left: number, right: number, delta: number): void {
  // x_left - x_right = delta
  edges.push({ from: right, to: left, weight: delta });
  edges.push({ from: left, to: right, weight: -delta });
}

function constraintDifferenceEdges(
  constraint: SpatialConstraint,
  axis: 'x' | 'y',
  indices: Map<string, number>,
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
  graphExtrema: ReadonlyMap<string, string>,
  deferAutoAlignments: boolean,
): DifferenceEdge[] | null {
  const edges: DifferenceEdge[] = [];
  const index = (id: string) => indices.get(id);
  const size = (rect: MutableRect) => axis === 'x' ? rect.width : rect.height;
  if (constraint.kind === 'relative') {
    const subject = rects.get(constraint.subject.nodeId);
    const target = rects.get(constraint.target.nodeId);
    const s = subject && index(subject.id);
    const t = target && index(target.id);
    if (!subject || !target || s === undefined || t === undefined) return null;
    const horizontal = constraint.relation === 'left-of' || constraint.relation === 'right-of';
    if ((axis === 'x') === horizontal) {
      const gap = constraint.gap ?? 0;
      if (constraint.relation === 'left-of' || constraint.relation === 'above') {
        // subject + size + gap <= target
        edges.push({ from: t, to: s, weight: -(size(subject) + gap) });
      } else {
        edges.push({ from: s, to: t, weight: -(size(target) + gap) });
      }
    } else {
      const alignment = constraint.alignment ?? 'center';
      if (deferAutoAlignments && alignment !== 'start'
        && (records.get(subject.id)?.autoSized || records.get(target.id)?.autoSized)) return [];
      const delta = constraint.alignment === 'start' ? 0
        : constraint.alignment === 'end' ? size(target) - size(subject)
          : (size(target) - size(subject)) / 2;
      equality(edges, s, t, delta);
    }
    return edges;
  }
  if (constraint.kind === 'boundary') {
    const subject = rects.get(constraint.subject.nodeId);
    const s = subject && index(subject.id);
    if (!subject || s === undefined) return null;
    const relevant = axis === 'x'
      ? constraint.side === 'left' || constraint.side === 'right'
      : constraint.side === 'top' || constraint.side === 'bottom';
    const inset = constraint.inset ?? 0;
    if (constraint.scope.kind === 'node') {
      const scope = rects.get(constraint.scope.nodeId);
      const t = scope && index(scope.id);
      if (!scope || t === undefined) return null;
      const content = Boolean((constraint as SpatialConstraint & { contentBoundary028?: boolean }).contentBoundary028);
      const pad = content ? records.get(scope.id)?.padding ?? zeroPadding() : zeroPadding();
      if (!content && !relevant) return [];
      const leading = (axis === 'x' ? pad.left : pad.top) + inset;
      const trailing = (axis === 'x' ? pad.right : pad.bottom) + inset;
      if (content) {
        edges.push({ from: s, to: t, weight: -leading });
        edges.push({ from: t, to: s, weight: size(scope) - size(subject) - trailing });
      }
      if (!relevant) return edges;
      const delta = constraint.side === 'left' ? pad.left + inset
        : constraint.side === 'right' ? scope.width - pad.right - inset - subject.width
          : constraint.side === 'top' ? pad.top + inset
            : scope.height - pad.bottom - inset - subject.height;
      equality(edges, s, t, delta);
      return edges;
    }
    const content = Boolean((constraint as SpatialConstraint & { contentBoundary028?: boolean }).contentBoundary028);
    if (!content && !relevant) return [];
    const leading = axis === 'x' ? 'left' : 'top';
    const trailing = axis === 'x' ? 'right' : 'bottom';
    for (const side of content ? [leading, trailing] : [constraint.side]) {
      const extremeId = graphExtrema.get(side);
      const extreme = extremeId ? rects.get(extremeId) : undefined;
      const e = extremeId ? index(extremeId) : undefined;
      if (!extreme || e === undefined) return null;
      if (content) edges.push(side === leading ? { from: s, to: e, weight: -inset }
        : { from: e, to: s, weight: size(extreme) - size(subject) - inset });
      if (side === constraint.side && relevant)
        equality(edges, s, e, side === leading ? inset : size(extreme) - size(subject) - inset);
      for (const candidate of [...rects.values()].filter((rect) => !records.get(rect.id)?.parentId && !records.get(rect.id)?.spatialSynthetic)) {
        const c = index(candidate.id)!;
        edges.push(side === leading ? { from: c, to: e, weight: 0 }
          : { from: e, to: c, weight: size(extreme) - size(candidate) });
      }
    }
    return edges;
  }
  const arranged = constraint.subjects.map((subject) => rects.get(subject.nodeId));
  if (arranged.some((rect) => !rect)) return null;
  const nodes = arranged as MutableRect[];
  if (constraint.direction === 'reverse') nodes.reverse();
  const primary = (axis === 'x') === (constraint.axis === 'row');
  for (let position = 1; position < nodes.length; position += 1) {
    const previous = nodes[position - 1];
    const current = nodes[position];
    const p = index(previous.id)!;
    const c = index(current.id)!;
    if (primary) {
      edges.push({ from: c, to: p, weight: -(size(previous) + (constraint.gap ?? 0)) });
    } else {
      const first = nodes[0];
      const f = index(first.id)!;
      const alignment = constraint.alignment ?? 'center';
      if (deferAutoAlignments && alignment !== 'start'
        && (records.get(current.id)?.autoSized || records.get(first.id)?.autoSized)) continue;
      const delta = constraint.alignment === 'start' ? 0
        : constraint.alignment === 'end' ? size(first) - size(current)
          : (size(first) - size(current)) / 2;
      equality(edges, c, f, delta);
    }
  }
  return edges;
}

function solveDifferenceAxis(
  constraints: SpatialConstraint[], axis: 'x' | 'y',
  rects: Map<string, MutableRect>, records: Map<string, NodeRecord>,
  apply: boolean,
  retainCandidates: boolean,
  retainCandidateFrame: 'absolute' | 'local',
  containAutoSized: boolean,
  deferAutoAlignments: boolean,
  minimumSeparations: readonly MinimumSeparation028[] = [],
  preserveNonnegativeOrigins = minimumSeparations.length > 0,
): boolean {
  const ids = [...rects.keys()].sort();
  const indices = new Map(ids.map((id, index) => [id, index]));
  const zero = ids.length;
  const base: DifferenceEdge[] = [];
  for (const separation of minimumSeparations) {
    if (separation.axis !== axis) continue;
    const before = rects.get(separation.before)!;
    base.push({ from: indices.get(separation.after)!, to: indices.get(separation.before)!,
      weight: -((axis === 'x' ? before.width : before.height) + separation.gap) });
  }
  for (const id of ids) {
    const rect = rects.get(id)!;
    const record = records.get(id)!;
    const current = indices.get(id)!;
    if (record.binding) equality(base, current, indices.get(record.binding.ownerId)!, record.binding.offset[axis]);
    if (record.fixedPoints?.length) for (const point of record.fixedPoints) {
      // The actual connector endpoints/authored waypoints stay inside its AABB.
      base.push({ from: zero, to: current, weight: point[axis] });
      base.push({ from: current, to: zero, weight: (axis === 'x' ? rect.width : rect.height) - point[axis] });
    }
    // A soft hint must not introduce a negative canvas origin. Explicit
    // negative coordinates retain their existing authority.
    if (preserveNonnegativeOrigins && !record.parentId && !rect.fixed && rect.absolutePosition[axis] >= 0)
      base.push({ from: current, to: zero, weight: 0 });
    if (rect.fixed) {
      if (record.parentId) {
        equality(base, current, indices.get(record.parentId)!, rect.position[axis]);
      } else {
        equality(base, current, zero, rect.absolutePosition[axis]);
      }
    }
    if (record.parentId) {
      const parent = rects.get(record.parentId)!;
      const parentIndex = indices.get(record.parentId)!;
      const pad = records.get(record.parentId)!.padding;
      const leading = axis === 'x' ? pad.left : pad.top;
      const trailing = axis === 'x' ? pad.right : pad.bottom;
      // parent + leading <= child <= parent + parentSize - trailing - childSize
      base.push({ from: current, to: parentIndex, weight: -leading });
      if (containAutoSized || !records.get(record.parentId)!.autoSized) {
        base.push({ from: parentIndex, to: current, weight: (axis === 'x' ? parent.width : parent.height) - trailing -
          (axis === 'x' ? rect.width : rect.height) });
      }
    }
  }
  const graphBoundary = constraints.filter((constraint): constraint is Extract<SpatialConstraint, { kind: 'boundary' }> =>
    constraint.kind === 'boundary' && constraint.scope.kind === 'graph' &&
    (Boolean((constraint as SpatialConstraint & { contentBoundary028?: boolean }).contentBoundary028) ||
      ((axis === 'x') === (constraint.side === 'left' || constraint.side === 'right'))));
  const extremaCandidates = ids.filter((id) => !records.get(id)?.parentId && !records.get(id)?.spatialSynthetic);
  if (graphBoundary.length > 0 && extremaCandidates.length === 0) return false;
  const linearBindings = ids.filter((id) => records.get(id)?.linearBinding);
  const oracle = (edges: DifferenceEdge[]): number[] | null => {
    if (!linearBindings.length) return differenceSolution(ids.length + 1, edges);
    const count = ids.length + 1;
    const matrix: number[][] = []; const bounds: number[] = [];
    const add = (terms: Array<[number, number]>, right: number) => {
      const row = Array<number>(count * 2).fill(0);
      for (const [index, weight] of terms) { row[index * 2] += weight; row[index * 2 + 1] -= weight; }
      matrix.push(row); bounds.push(right);
    };
    for (const edge of edges) add([[edge.to, 1], [edge.from, -1]], edge.weight);
    add([[zero, 1]], 0); add([[zero, -1]], 0);
    for (const id of linearBindings) {
      const binding = records.get(id)!.linearBinding!;
      const terms: Array<[number, number]> = [[indices.get(id)!, 1],
        ...binding.owners.map((owner): [number, number] => [indices.get(owner.id)!, -owner.weight])];
      add(terms, binding.offset[axis]); add(terms.map(([index, weight]) => [index, -weight]), -binding.offset[axis]);
    }
    const solution = new SpatialLinearProgram(matrix, bounds, Array<number>(count * 2).fill(0)).solve();
    return solution ? Array.from({ length: count }, (_, i) => solution[i * 2]! - solution[i * 2 + 1]!) : null;
  };
  let solution: number[] | null = null;
  const evaluate = (assignment: Map<string, string>) => {
    const candidateEdges = [...base];
    let valid = true;
    for (const constraint of constraints) {
      const next = constraintDifferenceEdges(
        constraint, axis, indices, rects, records, assignment, deferAutoAlignments,
      );
      if (!next) { valid = false; break; }
      candidateEdges.push(...next);
    }
    if (!valid || !oracle(candidateEdges)) return;

    // Preserve candidate geometry in stable ID order whenever it remains
    // jointly feasible. This is the deterministic lexicographic continuity
    // objective layered over the complete difference-constraint oracle.
    const selected = [...candidateEdges];
    if (retainCandidates) {
      for (const id of ids) {
        const rect = rects.get(id)!;
        if (rect.fixed) continue;
        const trial = [...selected];
        const parentId = records.get(id)?.parentId;
        if (retainCandidateFrame === 'local' && parentId) {
          equality(trial, indices.get(id)!, indices.get(parentId)!, rect.position[axis]);
        } else {
          equality(trial, indices.get(id)!, zero, rect.absolutePosition[axis]);
        }
        if (oracle(trial)) selected.push(...trial.slice(selected.length));
      }
    }
    solution = oracle(selected);
  };
  // Every boundary on one graph side observes the same geometric extremum.
  // Enumerate at most one candidate per present side, lazily, and stop at the
  // first feasible stable assignment instead of materializing n^k maps.
  const sides = [...new Set(graphBoundary.flatMap((constraint) =>
    (constraint as SpatialConstraint & { contentBoundary028?: boolean }).contentBoundary028
      ? axis === 'x' ? ['left', 'right'] : ['top', 'bottom'] : [constraint.side]))];
  const enumerate = (position: number, chosen: Map<string, string>) => {
    if (solution) return;
    if (position === sides.length) {
      evaluate(chosen);
      return;
    }
    for (const candidate of extremaCandidates) {
      chosen.set(sides[position], candidate);
      enumerate(position + 1, chosen);
      if (solution) return;
    }
  };
  if (sides.length) enumerate(0, new Map());
  else evaluate(new Map());
  if (!solution) return false;
  if (apply) {
    const origin = solution[zero];
    for (const id of ids) rects.get(id)!.absolutePosition[axis] = solution[indices.get(id)!] - origin;
  }
  return true;
}

function differenceFeasible(
  constraints: SpatialConstraint[], rects: Map<string, MutableRect>, records: Map<string, NodeRecord>,
  apply: boolean,
  options: {
    retainCandidates?: boolean;
    retainCandidateFrame?: 'absolute' | 'local';
    containAutoSized?: boolean;
    deferAutoAlignments?: boolean;
    minimumSeparations?: readonly MinimumSeparation028[];
    preserveNonnegativeOrigins?: boolean;
  } = {},
): boolean {
  const retainCandidates = options.retainCandidates ?? true;
  const retainCandidateFrame = options.retainCandidateFrame ?? 'absolute';
  const containAutoSized = options.containAutoSized ?? true;
  const deferAutoAlignments = options.deferAutoAlignments ?? false;
  const trial = apply ? rects : cloneRects(rects);
  if (!solveDifferenceAxis(
    constraints, 'x', trial, records, apply, retainCandidates, retainCandidateFrame,
    containAutoSized, deferAutoAlignments, options.minimumSeparations, options.preserveNonnegativeOrigins,
  )) return false;
  if (!solveDifferenceAxis(
    constraints, 'y', trial, records, apply, retainCandidates, retainCandidateFrame,
    containAutoSized, deferAutoAlignments, options.minimumSeparations, options.preserveNonnegativeOrigins,
  )) return false;
  if (apply) {
    for (const rect of rects.values()) {
      const parentId = records.get(rect.id)?.parentId;
      const parent = parentId ? rects.get(parentId) : undefined;
      rect.position = parent ? {
        x: rect.absolutePosition.x - parent.absolutePosition.x,
        y: rect.absolutePosition.y - parent.absolutePosition.y,
      } : { ...rect.absolutePosition };
    }
  }
  return true;
}

function replaceRects(target: Map<string, MutableRect>, source: Map<string, MutableRect>): void {
  target.clear();
  for (const [id, rect] of source) target.set(id, rect);
}

function boundaryMinimumExtent(
  scopeId: string,
  axis: 'x' | 'y',
  constraints: SpatialConstraint[],
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
): number {
  let required = 0;
  const scope = rects.get(scopeId);
  if (!scope) return required;
  for (const constraint of constraints) {
    if (constraint.kind !== 'boundary' || constraint.scope.kind !== 'node'
      || constraint.scope.nodeId !== scopeId
      || (axis === 'x' ? constraint.side !== 'right' : constraint.side !== 'bottom')) continue;
    const subject = rects.get(constraint.subject.nodeId);
    if (!subject) continue;
    if (!isAncestor(scopeId, subject.id, records)) continue;
    const subjectSize = axis === 'x' ? subject.width : subject.height;
    const relativeTrailing = subject.absolutePosition[axis] - scope.absolutePosition[axis] + subjectSize;
    required = Math.max(required, relativeTrailing + (constraint.inset ?? 0));
  }
  return required;
}

interface SizeEquation {
  left: string;
  right: string;
  delta: number;
}

function applyJointEqualitySizes(
  constraints: SpatialConstraint[],
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
): boolean {
  let changed = false;
  for (const axis of ['x', 'y'] as const) {
    const ids = [...rects.keys()].sort();
    const positionIndex = new Map(ids.map((id, index) => [id, index]));
    const autoIds = ids.filter((id) => records.get(id)!.autoSized);
    const sizeIndex = new Map(autoIds.map((id, index) => [id, ids.length + index]));
    const variableCount = ids.length + autoIds.length;
    const rows: number[][] = [];
    const size = (id: string) => {
      const rect = rects.get(id)!;
      return axis === 'x' ? rect.width : rect.height;
    };
    const equation = (
      terms: Array<{ kind: 'position' | 'size'; id: string; coefficient: number }>,
      right: number,
    ) => {
      const row = Array<number>(variableCount + 1).fill(0);
      let constant = right;
      for (const term of terms) {
        if (term.kind === 'position') {
          row[positionIndex.get(term.id)!] += term.coefficient;
          continue;
        }
        const index = sizeIndex.get(term.id);
        if (index === undefined) constant -= term.coefficient * size(term.id);
        else row[index] += term.coefficient;
      }
      row[variableCount] = constant;
      rows.push(row);
    };
    for (const id of ids) {
      const rect = rects.get(id)!;
      if (!rect.fixed) continue;
      const parentId = records.get(id)?.parentId;
      equation(parentId ? [
        { kind: 'position', id, coefficient: 1 },
        { kind: 'position', id: parentId, coefficient: -1 },
      ] : [{ kind: 'position', id, coefficient: 1 }], parentId ? rect.position[axis] : rect.absolutePosition[axis]);
    }
    const alignmentEquation = (
      left: string,
      right: string,
      alignment: 'start' | 'center' | 'end' | undefined,
    ) => {
      const normalized = alignment ?? 'center';
      const factor = normalized === 'center' ? 2 : 1;
      const terms: Array<{ kind: 'position' | 'size'; id: string; coefficient: number }> = [
        { kind: 'position', id: left, coefficient: factor },
        { kind: 'position', id: right, coefficient: -factor },
      ];
      if (normalized !== 'start') terms.push(
        { kind: 'size', id: left, coefficient: 1 },
        { kind: 'size', id: right, coefficient: -1 },
      );
      equation(terms, 0);
    };
    for (const constraint of constraints) {
      if (constraint.kind === 'boundary') {
        const horizontal = constraint.side === 'left' || constraint.side === 'right';
        if ((axis === 'x') !== horizontal) continue;
        if (constraint.scope.kind !== 'node') continue;
        const leading = constraint.side === 'left' || constraint.side === 'top';
        const terms: Array<{ kind: 'position' | 'size'; id: string; coefficient: number }> = [
          { kind: 'position', id: constraint.subject.nodeId, coefficient: 1 },
          { kind: 'position', id: constraint.scope.nodeId, coefficient: -1 },
        ];
        if (!leading) terms.push(
          { kind: 'size', id: constraint.subject.nodeId, coefficient: 1 },
          { kind: 'size', id: constraint.scope.nodeId, coefficient: -1 },
        );
        equation(terms, leading ? (constraint.inset ?? 0) : -(constraint.inset ?? 0));
        continue;
      }
      if (constraint.kind === 'relative') {
        const primaryIsX = constraint.relation === 'left-of' || constraint.relation === 'right-of';
        if (axis !== (primaryIsX ? 'y' : 'x')) continue;
        alignmentEquation(constraint.subject.nodeId, constraint.target.nodeId, constraint.alignment);
        continue;
      }
      const perpendicularAxis = constraint.axis === 'row' ? 'y' : 'x';
      if (axis !== perpendicularAxis) continue;
      const subjects = constraint.subjects.map((subject) => subject.nodeId);
      if (constraint.direction === 'reverse') subjects.reverse();
      for (let position = 1; position < subjects.length; position += 1) {
        alignmentEquation(subjects[position], subjects[0], constraint.alignment);
      }
    }
    let pivotRow = 0;
    const pivotColumns: number[] = [];
    for (let column = 0; column < variableCount && pivotRow < rows.length; column += 1) {
      let selected = pivotRow;
      for (let row = pivotRow + 1; row < rows.length; row += 1) {
        if (Math.abs(rows[row][column]) > Math.abs(rows[selected][column])) selected = row;
      }
      if (Math.abs(rows[selected][column]) <= TOLERANCE) continue;
      [rows[pivotRow], rows[selected]] = [rows[selected], rows[pivotRow]];
      const divisor = rows[pivotRow][column];
      for (let entry = column; entry <= variableCount; entry += 1) rows[pivotRow][entry] /= divisor;
      for (let row = 0; row < rows.length; row += 1) {
        if (row === pivotRow || Math.abs(rows[row][column]) <= TOLERANCE) continue;
        const factor = rows[row][column];
        for (let entry = column; entry <= variableCount; entry += 1) {
          rows[row][entry] -= factor * rows[pivotRow][entry];
        }
      }
      pivotColumns[pivotRow] = column;
      pivotRow += 1;
    }
    const pivotSet = new Set(pivotColumns);
    const inconsistent = rows.some((row) =>
      row.slice(0, variableCount).every((value) => Math.abs(value) <= TOLERANCE)
      && Math.abs(row[variableCount]) > TOLERANCE);
    if (inconsistent) continue;
    for (const id of autoIds) {
      const column = sizeIndex.get(id)!;
      const rowIndex = pivotColumns.indexOf(column);
      if (rowIndex < 0) continue;
      const dependsOnFreeVariable = rows[rowIndex].slice(0, variableCount)
        .some((value, index) => index !== column && !pivotSet.has(index) && Math.abs(value) > TOLERANCE);
      if (dependsOnFreeVariable) continue;
      const derived = rows[rowIndex][variableCount];
      if (!Number.isFinite(derived)) continue;
      const rect = rects.get(id)!;
      const current = axis === 'x' ? rect.width : rect.height;
      const next = Math.max(current, derived);
      if (close(current, next)) continue;
      if (axis === 'x') rect.width = next;
      else rect.height = next;
      changed = true;
    }
  }
  return changed;
}

class SpatialLinearProgram {
  private readonly rows: number;
  private readonly columns: number;
  private readonly basic: number[];
  private readonly nonBasic: number[];
  private readonly tableau: number[][];

  constructor(matrix: number[][], bounds: number[], objective: number[]) {
    this.rows = bounds.length;
    this.columns = objective.length;
    this.basic = Array<number>(this.rows);
    this.nonBasic = Array<number>(this.columns + 1);
    this.tableau = Array.from({ length: this.rows + 2 }, () =>
      Array<number>(this.columns + 2).fill(0));
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        this.tableau[row][column] = matrix[row][column];
      }
    }
    for (let row = 0; row < this.rows; row += 1) {
      this.basic[row] = this.columns + row;
      this.tableau[row][this.columns] = -1;
      this.tableau[row][this.columns + 1] = bounds[row];
    }
    for (let column = 0; column < this.columns; column += 1) {
      this.nonBasic[column] = column;
      this.tableau[this.rows][column] = -objective[column];
    }
    this.nonBasic[this.columns] = -1;
    this.tableau[this.rows + 1][this.columns] = 1;
  }

  private pivot(row: number, column: number): void {
    const inverse = 1 / this.tableau[row][column];
    for (let otherRow = 0; otherRow < this.rows + 2; otherRow += 1) {
      if (otherRow === row) continue;
      for (let otherColumn = 0; otherColumn < this.columns + 2; otherColumn += 1) {
        if (otherColumn === column) continue;
        this.tableau[otherRow][otherColumn] -=
          this.tableau[row][otherColumn] * this.tableau[otherRow][column] * inverse;
      }
    }
    for (let otherColumn = 0; otherColumn < this.columns + 2; otherColumn += 1) {
      if (otherColumn !== column) this.tableau[row][otherColumn] *= inverse;
    }
    for (let otherRow = 0; otherRow < this.rows + 2; otherRow += 1) {
      if (otherRow !== row) this.tableau[otherRow][column] *= -inverse;
    }
    this.tableau[row][column] = inverse;
    [this.basic[row], this.nonBasic[column]] = [this.nonBasic[column], this.basic[row]];
  }

  private simplex(phase: 1 | 2): boolean {
    const objectiveRow = phase === 1 ? this.rows + 1 : this.rows;
    while (true) {
      let entering = -1;
      for (let column = 0; column <= this.columns; column += 1) {
        if (phase === 2 && this.nonBasic[column] === -1) continue;
        if (entering < 0
          || this.tableau[objectiveRow][column] < this.tableau[objectiveRow][entering] - TOLERANCE
          || (close(this.tableau[objectiveRow][column], this.tableau[objectiveRow][entering])
            && this.nonBasic[column] < this.nonBasic[entering])) entering = column;
      }
      if (entering < 0 || this.tableau[objectiveRow][entering] >= -TOLERANCE) return true;
      let leaving = -1;
      for (let row = 0; row < this.rows; row += 1) {
        if (this.tableau[row][entering] <= TOLERANCE) continue;
        const ratio = this.tableau[row][this.columns + 1] / this.tableau[row][entering];
        const best = leaving < 0 ? 0
          : this.tableau[leaving][this.columns + 1] / this.tableau[leaving][entering];
        if (leaving < 0 || ratio < best - TOLERANCE
          || (close(ratio, best) && this.basic[row] < this.basic[leaving])) leaving = row;
      }
      if (leaving < 0) return false;
      this.pivot(leaving, entering);
    }
  }

  solve(): number[] | null {
    if (this.rows === 0) return Array<number>(this.columns).fill(0);
    let row = 0;
    for (let candidate = 1; candidate < this.rows; candidate += 1) {
      if (this.tableau[candidate][this.columns + 1] < this.tableau[row][this.columns + 1]) row = candidate;
    }
    if (this.tableau[row][this.columns + 1] < -TOLERANCE) {
      this.pivot(row, this.columns);
      if (!this.simplex(1) || this.tableau[this.rows + 1][this.columns + 1] < -TOLERANCE) return null;
      if (Math.abs(this.tableau[this.rows + 1][this.columns + 1]) > TOLERANCE) return null;
      const artificial = this.basic.indexOf(-1);
      if (artificial >= 0) {
        let entering = 0;
        for (let column = 1; column <= this.columns; column += 1) {
          if (this.tableau[artificial][column] < this.tableau[artificial][entering] - TOLERANCE
            || (close(this.tableau[artificial][column], this.tableau[artificial][entering])
              && this.nonBasic[column] < this.nonBasic[entering])) entering = column;
        }
        this.pivot(artificial, entering);
      }
    }
    if (!this.simplex(2)) return null;
    const solution = Array<number>(this.columns).fill(0);
    for (let basic = 0; basic < this.rows; basic += 1) {
      if (this.basic[basic] < this.columns) {
        solution[this.basic[basic]] = this.tableau[basic][this.columns + 1];
      }
    }
    return solution;
  }
}

function applyJointLinearSizes(
  constraints: SpatialConstraint[],
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
): boolean {
  let changed = false;
  for (const axis of ['x', 'y'] as const) {
    const ids = [...rects.keys()].sort();
    const autoIds = ids.filter((id) => records.get(id)!.autoSized);
    if (!autoIds.length) continue;
    const positionPlus = new Map(ids.map((id, index) => [id, index * 2]));
    const positionMinus = new Map(ids.map((id, index) => [id, index * 2 + 1]));
    const growthIndex = new Map(autoIds.map((id, index) => [id, ids.length * 2 + index]));
    const variableCount = ids.length * 2 + autoIds.length;
    const matrix: number[][] = [];
    const bounds: number[] = [];
    const floor = new Map(autoIds.map((id) => {
      const rect = rects.get(id)!;
      return [id, axis === 'x' ? rect.width : rect.height] as const;
    }));
    type LinearTerm = { kind: 'position' | 'size'; id: string; coefficient: number };
    const fixedSize = (id: string) => {
      const rect = rects.get(id)!;
      return axis === 'x' ? rect.width : rect.height;
    };
    const inequality = (terms: LinearTerm[], right: number) => {
      const row = Array<number>(variableCount).fill(0);
      let adjusted = right;
      for (const term of terms) {
        if (term.kind === 'position') {
          row[positionPlus.get(term.id)!] += term.coefficient;
          row[positionMinus.get(term.id)!] -= term.coefficient;
          continue;
        }
        const growth = growthIndex.get(term.id);
        if (growth === undefined) adjusted -= term.coefficient * fixedSize(term.id);
        else {
          adjusted -= term.coefficient * floor.get(term.id)!;
          row[growth] += term.coefficient;
        }
      }
      matrix.push(row);
      bounds.push(adjusted);
    };
    const equation = (terms: LinearTerm[], right: number) => {
      inequality(terms, right);
      inequality(terms.map((term) => ({ ...term, coefficient: -term.coefficient })), -right);
    };
    const aligned = (left: string, right: string, alignment: 'start' | 'center' | 'end' | undefined) => {
      const normalized = alignment ?? 'center';
      const factor = normalized === 'center' ? 2 : 1;
      const terms: LinearTerm[] = [
        { kind: 'position', id: left, coefficient: factor },
        { kind: 'position', id: right, coefficient: -factor },
      ];
      if (normalized !== 'start') terms.push(
        { kind: 'size', id: left, coefficient: 1 },
        { kind: 'size', id: right, coefficient: -1 },
      );
      equation(terms, 0);
    };
    for (const id of ids) {
      const rect = rects.get(id)!;
      const record = records.get(id)!;
      if (rect.fixed) {
        equation(record.parentId ? [
          { kind: 'position', id, coefficient: 1 },
          { kind: 'position', id: record.parentId, coefficient: -1 },
        ] : [{ kind: 'position', id, coefficient: 1 }],
        record.parentId ? rect.position[axis] : rect.absolutePosition[axis]);
      }
      if (!record.parentId) continue;
      const pad = records.get(record.parentId)!.padding;
      const leading = axis === 'x' ? pad.left : pad.top;
      const trailing = axis === 'x' ? pad.right : pad.bottom;
      inequality([
        { kind: 'position', id: record.parentId, coefficient: 1 },
        { kind: 'position', id, coefficient: -1 },
      ], -leading);
      inequality([
        { kind: 'position', id, coefficient: 1 },
        { kind: 'size', id, coefficient: 1 },
        { kind: 'position', id: record.parentId, coefficient: -1 },
        { kind: 'size', id: record.parentId, coefficient: -1 },
      ], -trailing);
    }
    for (const constraint of constraints) {
      if (constraint.kind === 'boundary') {
        if (constraint.scope.kind !== 'node') continue;
        const horizontal = constraint.side === 'left' || constraint.side === 'right';
        if ((axis === 'x') !== horizontal) continue;
        const leading = constraint.side === 'left' || constraint.side === 'top';
        const terms: LinearTerm[] = [
          { kind: 'position', id: constraint.subject.nodeId, coefficient: 1 },
          { kind: 'position', id: constraint.scope.nodeId, coefficient: -1 },
        ];
        if (!leading) terms.push(
          { kind: 'size', id: constraint.subject.nodeId, coefficient: 1 },
          { kind: 'size', id: constraint.scope.nodeId, coefficient: -1 },
        );
        equation(terms, leading ? (constraint.inset ?? 0) : -(constraint.inset ?? 0));
        continue;
      }
      if (constraint.kind === 'relative') {
        const subject = constraint.subject.nodeId;
        const target = constraint.target.nodeId;
        const primaryIsX = constraint.relation === 'left-of' || constraint.relation === 'right-of';
        if ((axis === 'x') === primaryIsX) {
          const gap = constraint.gap ?? 0;
          if (constraint.relation === 'left-of' || constraint.relation === 'above') inequality([
            { kind: 'position', id: subject, coefficient: 1 },
            { kind: 'size', id: subject, coefficient: 1 },
            { kind: 'position', id: target, coefficient: -1 },
          ], -gap);
          else inequality([
            { kind: 'position', id: target, coefficient: 1 },
            { kind: 'size', id: target, coefficient: 1 },
            { kind: 'position', id: subject, coefficient: -1 },
          ], -gap);
        } else aligned(subject, target, constraint.alignment);
        continue;
      }
      const subjects = constraint.subjects.map((subject) => subject.nodeId);
      if (constraint.direction === 'reverse') subjects.reverse();
      const primaryIsX = constraint.axis === 'row';
      for (let position = 1; position < subjects.length; position += 1) {
        if ((axis === 'x') === primaryIsX) inequality([
          { kind: 'position', id: subjects[position - 1], coefficient: 1 },
          { kind: 'size', id: subjects[position - 1], coefficient: 1 },
          { kind: 'position', id: subjects[position], coefficient: -1 },
        ], -(constraint.gap ?? 0));
        else aligned(subjects[position], subjects[0], constraint.alignment);
      }
    }
    const objective = Array<number>(variableCount).fill(0);
    for (const index of growthIndex.values()) objective[index] = -1;
    const graphBoundaries = constraints.filter(
      (constraint): constraint is Extract<SpatialConstraint, { kind: 'boundary' }> =>
        constraint.kind === 'boundary' && constraint.scope.kind === 'graph'
        && (Boolean((constraint as SpatialConstraint & { contentBoundary028?: boolean }).contentBoundary028)
          || ((axis === 'x') === (constraint.side === 'left' || constraint.side === 'right'))),
    );
    const extremaCandidates = ids.filter((id) => !records.get(id)?.parentId && !records.get(id)?.spatialSynthetic);
    let solution: number[] | null = null;
    const solveAssignment = (chosen: ReadonlyMap<string, string>) => {
      const baseRows = matrix.length;
      for (const constraint of graphBoundaries) {
        const content = Boolean((constraint as SpatialConstraint & { contentBoundary028?: boolean }).contentBoundary028);
        const leadingSide = axis === 'x' ? 'left' : 'top';
        const trailingSide = axis === 'x' ? 'right' : 'bottom';
        for (const side of content ? [leadingSide, trailingSide] : [constraint.side]) {
          const extreme = chosen.get(side)!;
          const leading = side === leadingSide;
          const terms: LinearTerm[] = [
            { kind: 'position', id: constraint.subject.nodeId, coefficient: 1 },
            { kind: 'position', id: extreme, coefficient: -1 },
          ];
          if (!leading) terms.push(
            { kind: 'size', id: constraint.subject.nodeId, coefficient: 1 },
            { kind: 'size', id: extreme, coefficient: -1 },
          );
          const delta = leading ? (constraint.inset ?? 0) : -(constraint.inset ?? 0);
          if (side === constraint.side) equation(terms, delta);
          else if (leading) inequality(terms.map((term) => ({ ...term, coefficient: -term.coefficient })), -delta);
          else inequality(terms, delta);
          for (const candidate of extremaCandidates) {
            if (leading) inequality([
              { kind: 'position', id: extreme, coefficient: 1 },
              { kind: 'position', id: candidate, coefficient: -1 },
            ], 0);
            else inequality([
              { kind: 'position', id: candidate, coefficient: 1 },
              { kind: 'size', id: candidate, coefficient: 1 },
              { kind: 'position', id: extreme, coefficient: -1 },
              { kind: 'size', id: extreme, coefficient: -1 },
            ], 0);
          }
        }
      }
      const candidate = new SpatialLinearProgram(matrix, bounds, objective).solve();
      matrix.length = baseRows;
      bounds.length = baseRows;
      if (candidate) solution = candidate;
    };
    const sides = [...new Set(graphBoundaries.flatMap((constraint) =>
      (constraint as SpatialConstraint & { contentBoundary028?: boolean }).contentBoundary028
        ? axis === 'x' ? ['left', 'right'] : ['top', 'bottom'] : [constraint.side]))];
    const enumerate = (position: number, chosen: Map<string, string>) => {
      if (solution) return;
      if (position === sides.length) {
        solveAssignment(chosen);
        return;
      }
      for (const candidate of extremaCandidates) {
        chosen.set(sides[position], candidate);
        enumerate(position + 1, chosen);
        if (solution) return;
      }
    };
    if (sides.length && extremaCandidates.length) enumerate(0, new Map());
    else if (!sides.length) solveAssignment(new Map());
    if (!solution) continue;
    for (const id of autoIds) {
      const rect = rects.get(id)!;
      const current = floor.get(id)!;
      const rawNext = current + Math.max(0, solution[growthIndex.get(id)!]);
      const nearestInteger = Math.round(rawNext);
      const next = close(rawNext, nearestInteger) ? nearestInteger : rawNext;
      if (close(current, next)) continue;
      if (axis === 'x') rect.width = next;
      else rect.height = next;
      changed = true;
    }
  }
  return changed;
}

function fixedRelativePositionComponents(
  axis: 'x' | 'y',
  constraints: SpatialConstraint[],
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
): Map<string, string> {
  const origin = '\0graph-origin';
  const adjacent = new Map<string, Set<string>>();
  const connect = (left: string, right: string) => {
    const leftEdges = adjacent.get(left) ?? new Set<string>();
    leftEdges.add(right);
    adjacent.set(left, leftEdges);
    const rightEdges = adjacent.get(right) ?? new Set<string>();
    rightEdges.add(left);
    adjacent.set(right, rightEdges);
  };
  for (const rect of rects.values()) {
    if (!rect.fixed) continue;
    const parentId = records.get(rect.id)?.parentId;
    if (parentId) connect(rect.id, parentId);
    else connect(rect.id, origin);
  }
  for (const constraint of constraints) {
    if (constraint.kind === 'boundary') {
      const relevantLeading = axis === 'x' ? constraint.side === 'left' : constraint.side === 'top';
      const relevantTrailing = axis === 'x' ? constraint.side === 'right' : constraint.side === 'bottom';
      const fixedTrailing = relevantTrailing && constraint.scope.kind === 'node'
        && !records.get(constraint.subject.nodeId)?.autoSized
        && !records.get(constraint.scope.nodeId)?.autoSized;
      if ((relevantLeading || fixedTrailing) && constraint.scope.kind === 'node') {
        connect(constraint.subject.nodeId, constraint.scope.nodeId);
      }
      continue;
    }
    if (constraint.kind === 'relative') {
      const primaryIsX = constraint.relation === 'left-of' || constraint.relation === 'right-of';
      if (axis === (primaryIsX ? 'x' : 'y')) continue;
      const subjectAuto = Boolean(records.get(constraint.subject.nodeId)?.autoSized);
      const targetAuto = Boolean(records.get(constraint.target.nodeId)?.autoSized);
      if ((constraint.alignment ?? 'center') === 'start' || (!subjectAuto && !targetAuto)) {
        connect(constraint.subject.nodeId, constraint.target.nodeId);
      }
      continue;
    }
    const perpendicularAxis = constraint.axis === 'row' ? 'y' : 'x';
    if (axis !== perpendicularAxis) continue;
    const subjects = constraint.subjects.map((subject) => subject.nodeId);
    if (constraint.direction === 'reverse') subjects.reverse();
    const first = subjects[0];
    for (let position = 1; position < subjects.length; position += 1) {
      const current = subjects[position];
      const currentAuto = Boolean(records.get(current)?.autoSized);
      const firstAuto = Boolean(records.get(first)?.autoSized);
      if ((constraint.alignment ?? 'center') === 'start' || (!currentAuto && !firstAuto)) {
        connect(current, first);
      }
    }
  }
  const components = new Map<string, string>();
  for (const root of [origin, ...[...rects.keys()].sort()]) {
    if (components.has(root)) continue;
    components.set(root, root);
    const pending = [root];
    while (pending.length) {
      const current = pending.shift()!;
      for (const next of adjacent.get(current) ?? []) {
        if (components.has(next)) continue;
        components.set(next, root);
        pending.push(next);
      }
    }
  }
  components.delete(origin);
  return components;
}

function applyAutoAlignmentSizes(
  constraints: SpatialConstraint[],
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
): boolean {
  const fixed = '\0fixed-size';
  const equationsByAxis = new Map<'x' | 'y', SizeEquation[]>([['x', []], ['y', []]]);
  const relativeComponentsByAxis = new Map<'x' | 'y', Map<string, string>>([
    ['x', fixedRelativePositionComponents('x', constraints, rects, records)],
    ['y', fixedRelativePositionComponents('y', constraints, rects, records)],
  ]);
  const addAlignment = (
    left: MutableRect,
    right: MutableRect,
    axis: 'x' | 'y',
    alignment: 'start' | 'center' | 'end' | undefined,
  ) => {
    const normalized = alignment ?? 'center';
    const leftAuto = Boolean(records.get(left.id)?.autoSized);
    const rightAuto = Boolean(records.get(right.id)?.autoSized);
    if (normalized === 'start' || (!leftAuto && !rightAuto)) return;
    // A relaxed coordinate may be moved by the complete position solve. Only
    // participants in the same authored fixed-relative component may determine
    // an auto dimension. The entire component may still translate; only the
    // invariant coordinate difference matters. Separate components retain
    // their position degrees of freedom for the complete solve.
    const components = relativeComponentsByAxis.get(axis)!;
    if (components.get(left.id) !== components.get(right.id)) return;
    const factor = normalized === 'center' ? 2 : 1;
    let delta = factor * (right.absolutePosition[axis] - left.absolutePosition[axis]);
    let leftId = left.id;
    let rightId = right.id;
    if (!leftAuto) {
      leftId = fixed;
      delta -= axis === 'x' ? left.width : left.height;
    }
    if (!rightAuto) {
      rightId = fixed;
      delta += axis === 'x' ? right.width : right.height;
    }
    equationsByAxis.get(axis)!.push({ left: leftId, right: rightId, delta });
  };

  for (const constraint of constraints) {
    if (constraint.kind === 'relative') {
      const subject = rects.get(constraint.subject.nodeId);
      const target = rects.get(constraint.target.nodeId);
      if (!subject || !target) continue;
      const primaryIsX = constraint.relation === 'left-of' || constraint.relation === 'right-of';
      addAlignment(subject, target, primaryIsX ? 'y' : 'x', constraint.alignment);
      continue;
    }
    if (constraint.kind !== 'arrangement') continue;
    const nodes = constraint.subjects.map((subject) => rects.get(subject.nodeId));
    if (nodes.some((node) => !node)) continue;
    const arranged = nodes as MutableRect[];
    if (constraint.direction === 'reverse') arranged.reverse();
    const first = arranged[0];
    const axis = constraint.axis === 'row' ? 'y' : 'x';
    for (let position = 1; position < arranged.length; position += 1) {
      addAlignment(arranged[position], first, axis, constraint.alignment);
    }
  }

  let changed = false;
  for (const axis of ['x', 'y'] as const) {
    const equations = equationsByAxis.get(axis)!;
    const adjacent = new Map<string, Array<{ id: string; delta: number }>>();
    const connect = (from: string, to: string, delta: number) => {
      const edges = adjacent.get(from) ?? [];
      edges.push({ id: to, delta });
      adjacent.set(from, edges);
    };
    for (const equation of equations) {
      // size(left) - size(right) = delta
      connect(equation.right, equation.left, equation.delta);
      connect(equation.left, equation.right, -equation.delta);
    }
    const visited = new Set<string>();
    for (const root of [...adjacent.keys()].sort()) {
      if (visited.has(root)) continue;
      const offsets = new Map<string, number>([[root, 0]]);
      const pending = [root];
      let consistent = true;
      while (pending.length) {
        const current = pending.shift()!;
        visited.add(current);
        for (const edge of adjacent.get(current) ?? []) {
          const expected = offsets.get(current)! + edge.delta;
          const existing = offsets.get(edge.id);
          if (existing !== undefined) {
            if (!close(existing, expected)) consistent = false;
            continue;
          }
          offsets.set(edge.id, expected);
          pending.push(edge.id);
        }
      }
      if (!consistent) continue;
      const fixedOffset = offsets.get(fixed);
      const base = fixedOffset !== undefined ? -fixedOffset : Math.max(
        ...[...offsets].filter(([id]) => id !== fixed).map(([id, offset]) => {
          const rect = rects.get(id)!;
          return (axis === 'x' ? rect.width : rect.height) - offset;
        }),
      );
      for (const [id, offset] of offsets) {
        if (id === fixed) continue;
        const rect = rects.get(id)!;
        const current = axis === 'x' ? rect.width : rect.height;
        const derived = base + offset;
        // If the deferred positional witness asks for less than the normalized
        // enclosure, keep the enclosure and let the complete position solve
        // seek another leading coordinate. Never violate containment to force
        // one relaxed witness.
        const next = Math.max(current, derived);
        if (close(current, next)) continue;
        if (axis === 'x') rect.width = next;
        else rect.height = next;
        changed = true;
      }
    }
  }
  return changed;
}

function fitAutoContainersForConstraints(
  constraints: SpatialConstraint[],
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
  minimumSeparations: readonly MinimumSeparation028[] = [],
): void {
  const candidates = cloneRects(rects);
  const restoreCandidatePositions = () => {
    for (const [id, candidate] of candidates) {
      const rect = rects.get(id)!;
      rect.position = { ...candidate.position };
      rect.absolutePosition = { ...candidate.absolutePosition };
    }
    recomputeAbsolute(rects, records);
  };
  const deferredBoundaries = new Set(constraints.filter((constraint) =>
    constraint.kind === 'boundary' && constraint.scope.kind === 'node'
    && records.get(constraint.scope.nodeId)?.autoSized
    && (constraint.side === 'right' || constraint.side === 'bottom')));
  const sizingConstraints = constraints.filter((constraint) => !deferredBoundaries.has(constraint));
  const limit = Math.max(1, records.size * 2);
  // Normalize provisional engine geometry before any size-dependent authored
  // relation can reject it. Hard coordinates retain their authored local
  // positions; every movable node starts at its parent's leading padding (or
  // the graph origin). The sizing solves may retain this normalized baseline,
  // but never the incoming soft engine coordinates captured above.
  for (const rect of rects.values()) {
    if (rect.fixed) continue;
    const parentId = records.get(rect.id)?.parentId;
    const parentPadding = parentId ? records.get(parentId)!.padding : zeroPadding();
    rect.position = { x: parentPadding.left, y: parentPadding.top };
  }
  recomputeAbsolute(rects, records);
  resizeAutoContainers(rects, records, constraints, true);
  applyJointEqualitySizes(constraints, rects, records);
  applyJointLinearSizes(constraints, rects, records);
  resizeAutoContainers(rects, records, constraints, false);
  for (let pass = 0; pass < limit; pass += 1) {
    const dimensionsBefore = new Map([...rects].map(([id, rect]) => [id, [rect.width, rect.height] as const]));
    const completeTrial = cloneRects(rects);
    const complete = differenceFeasible(sizingConstraints, completeTrial, records, true, {
      minimumSeparations,
      retainCandidates: true,
      retainCandidateFrame: 'local',
      containAutoSized: false,
    });
    if (complete) {
      replaceRects(rects, completeTrial);
    } else if (!differenceFeasible(sizingConstraints, rects, records, true, {
      minimumSeparations,
      retainCandidates: true,
      retainCandidateFrame: 'local',
      containAutoSized: false,
      deferAutoAlignments: true,
    })) {
      break;
    }
    // Boundary equations and child displacement determine enclosure floors.
    // Deferred center/end alignment then solves size-difference equations over
    // auto containers (with fixed-size nodes anchored at zero).
    resizeAutoContainers(rects, records, constraints, true);
    applyJointEqualitySizes(constraints, rects, records);
    applyJointLinearSizes(constraints, rects, records);
    applyAutoAlignmentSizes(sizingConstraints, rects, records);
    // Alignment growth can occur below another auto-container. Propagate that
    // new enclosure outward without shrinking the just-solved dimensions.
    resizeAutoContainers(rects, records, constraints, false);
    const dimensionsChanged = [...rects].some(([id, rect]) => {
      const before = dimensionsBefore.get(id)!;
      return !close(before[0], rect.width) || !close(before[1], rect.height);
    });
    if (complete && !dimensionsChanged) break;
  }
  // The relaxed solve exists only to derive the smallest authored-feasible
  // auto-container dimensions. Restore the incoming candidate coordinates so
  // the complete solve can retain each one iff it fits those dimensions.
  restoreCandidatePositions();
}

function resolveConstraints(
  constraints: SpatialConstraint[], rects: Map<string, MutableRect>, records: Map<string, NodeRecord>,
): { accepted: string[]; rejected: string[]; diagnostics: SpatialLayoutDiagnostic[] } {
  // An unconstrained graph already has candidate positions from ELK (or the
  // caller). Running the difference solver here normalizes auto containers to
  // their minimum size and can erase nested sibling positions before overlap
  // repair sees them.
  if (constraints.length === 0) return { accepted: [], rejected: [], diagnostics: [] };
  const required = constraints.filter((constraint) => (constraint.strength ?? 'required') === 'required');
  fitAutoContainersForConstraints(required, rects, records);
  if (!differenceFeasible(required, rects, records, true)) throw new SpatialLayoutError(required.map((constraint) => ({
    code: 'layout.constraint.required-unsatisfied', severity: 'error',
    message: `Required constraint "${constraint.id}" cannot be satisfied`, path: `constraints.${constraint.id}`,
  })));
  const accepted = required.map((constraint) => constraint.id);
  const acceptedConstraints = [...required];
  const rejected: string[] = [];
  const diagnostics: SpatialLayoutDiagnostic[] = [];
  for (const preference of constraints.filter((constraint) => constraint.strength === 'preferred')) {
    const trial = cloneRects(rects);
    fitAutoContainersForConstraints([...acceptedConstraints, preference], trial, records);
    if (differenceFeasible([...acceptedConstraints, preference], trial, records, true)) {
      accepted.push(preference.id);
      acceptedConstraints.push(preference);
      replaceRects(rects, trial);
    } else {
      rejected.push(preference.id);
      diagnostics.push({
        code: 'layout.constraint.preferred-rejected', severity: 'warning',
        message: `Preferred constraint "${preference.id}" conflicts with accepted intent`,
        path: `constraints.${preference.id}`,
      });
    }
  }
  fitAutoContainersForConstraints(acceptedConstraints, rects, records);
  if (!differenceFeasible(acceptedConstraints, rects, records, true)) {
    throw new SpatialLayoutError([{
      code: 'layout.constraint.required-unsatisfied', severity: 'error',
      message: 'Accepted spatial constraints could not be resolved atomically', path: 'constraints',
    }]);
  }
  if (!acceptedConstraints.every((constraint) => constraintSatisfied(constraint, rects, records))) {
    throw new SpatialLayoutError([{
      code: 'layout.constraint.required-unsatisfied', severity: 'error',
      message: 'Final geometry did not verify every accepted spatial constraint', path: 'constraints',
    }]);
  }
  return { accepted, rejected, diagnostics };
}

function portPoint(rect: MutableRect, port: Port, record?: NodeRecord): Point {
  const derived = port as DerivedPort;
  let outline = derived.outlinePoint;
  if (!outline && derived.attachment === 'free' && derived.freeStencil) {
    const shape = layoutPortShape029(derived);
    if (!shape) throw new StencilAnchorGeometryCapabilityError(derived.freeStencil.shapeId);
    if (derived.attachmentClass === 'corner') {
      const anchor = cornerAnchorForAttachment028(port.side, port.position ?? 0.5);
      outline = stencilAnchorPoint028(shape, anchor, derived.freeStencil);
    } else {
      const position = port.position ?? 0.5;
      const toward = port.side === 'NORTH' ? { x: position, y: 0 }
        : port.side === 'SOUTH' ? { x: position, y: 1 }
          : port.side === 'EAST' ? { x: 1, y: position } : { x: 0, y: position };
      outline = stencilRayPoint028(shape, toward, derived.freeStencil);
    }
  }
  if (record && isBpmnGatewaySymbol028(renderSymbolId(record.node, record.notationId, record.catalog))) {
    const frame = bpmnGatewayFrame028(rect.width, rect.height, record.direction);
    const shape = shapeRegistry.get(derived.stencilShapeId ??
      derived.freeStencil?.shapeId ?? 'diamond')!;
    const position = port.position ?? 0.5;
    const toward = port.side === 'NORTH' ? { x: position, y: 0 }
      : port.side === 'SOUTH' ? { x: position, y: 1 }
        : port.side === 'EAST' ? { x: 1, y: position } : { x: 0, y: position };
    const fitted = stencilFitPoint028(shape,
      outline ?? stencilRayPoint028(shape, toward), frame.width, frame.height);
    return { x: rect.absolutePosition.x + frame.x + fitted.x * frame.width,
      y: rect.absolutePosition.y + frame.y + fitted.y * frame.height };
  }
  if (outline) {
    const portSymbolId = record ? renderSymbolId(record.node, record.notationId, record.catalog) : undefined;
    if (isStateCircleSymbol0217(portSymbolId)) {
      const r = stateCircleRadius0217(rect.width, rect.height);
      return {
        x: rect.absolutePosition.x + rect.width / 2 + (outline.x - 0.5) * 2 * r,
        y: rect.absolutePosition.y + rect.height / 2 + (outline.y - 0.5) * 2 * r,
      };
    }
    const shapeId = derived.stencilShapeId ?? derived.freeStencil?.shapeId;
    const shape = layoutPortShape029(derived);
    if (shapeId && !shape) throw new StencilAnchorGeometryCapabilityError(shapeId);
    const elastic = Boolean(record && isContainerNode028(record.node)) || isStateSyncBarSymbol0217(portSymbolId);
    const fittedShape = shape && containerStencilShape028(shape, rect.width, rect.height, elastic);
    const point = fittedShape
      ? frameFitPoint029(fittedShape, outline, rect.width, rect.height,
        { notationId: record?.notationId, symbolId: portSymbolId, layoutDirection: record?.direction })
      : outline;
    return { x: rect.absolutePosition.x + rect.width * point.x,
      y: rect.absolutePosition.y + rect.height * point.y };
  }
  const position = port.position ?? 0.5;
  if (port.side === 'NORTH') return { x: rect.absolutePosition.x + rect.width * position, y: rect.absolutePosition.y };
  if (port.side === 'SOUTH') return { x: rect.absolutePosition.x + rect.width * position, y: rect.absolutePosition.y + rect.height };
  if (port.side === 'EAST') return { x: rect.absolutePosition.x + rect.width, y: rect.absolutePosition.y + rect.height * position };
  return { x: rect.absolutePosition.x, y: rect.absolutePosition.y + rect.height * position };
}

type DerivedPort = Port & { attachment?: 'free' | 'fixed'; attachmentClass?: 'side' | 'corner';
  outlinePoint?: Point; stencilShapeId?: string; freeStencil?: { shapeId: string; cornerRadius?: number };
  frameOutline029?: LayoutPort['frameOutline029'] };

/** Shared view-only normalization for source-authored `side` and `corner` hints. */
export function constrainFreePortAttachment(
  port: Pick<LayoutPort, 'attachmentClass'>,
  choice: Pick<Port, 'side' | 'position'>,
): Pick<Port, 'side' | 'position'> {
  if (port.attachmentClass === 'corner') {
    return { side: choice.side, position: (choice.position ?? 0.5) > 0.5 ? 1 : 0 };
  }
  // Side deliberately excludes a corner. A modest interior margin makes the
  // distinction visible while preserving layout's choice of side and offset.
  if (port.attachmentClass === 'side') {
    return { side: choice.side, position: Math.max(0.05, Math.min(0.95, choice.position ?? 0.5)) };
  }
  return choice;
}

/** Decode a graph-absolute route endpoint into a derived stencil-side attachment. */
export function attachmentFromBoundaryPoint(
  node: Pick<ResolvedNodeRect, 'absolutePosition' | 'width' | 'height'>,
  point: Point,
): Pick<Port, 'side' | 'position'> {
  const x = point.x - node.absolutePosition.x;
  const y = point.y - node.absolutePosition.y;
  const distances: Array<[Port['side'], number]> = [
    ['WEST', Math.abs(x)], ['EAST', Math.abs(x - node.width)],
    ['NORTH', Math.abs(y)], ['SOUTH', Math.abs(y - node.height)],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  const side = distances[0]![0];
  const extent = side === 'NORTH' || side === 'SOUTH' ? node.width : node.height;
  const along = side === 'NORTH' || side === 'SOUTH' ? x : y;
  return { side, position: extent > 0 ? Math.max(0, Math.min(1, along / extent)) : 0.5 };
}

/** Painted glyph frame for captioned icons when resolving contour-point sides. */
function isCaptionedIcon029(nodeId: string, records: Map<string, NodeRecord>): boolean {
  const record = records.get(nodeId);
  if (!record) return false;
  const symbolId = renderSymbolId(record.node, record.notationId, record.catalog);
  const shapeId = symbolId ? catalogSymbol029(symbolId, record.catalog)?.shape : undefined;
  return Boolean(shapeId && stencilCaptionHeight028(shapeId, { notationId: record.notationId, symbolId }) > 0);
}

function attachmentFrame029(
  node: Pick<ResolvedNodeRect, 'absolutePosition' | 'width' | 'height'>,
  record?: NodeRecord,
): Pick<ResolvedNodeRect, 'absolutePosition' | 'width' | 'height'> {
  if (!record) return node;
  const symbolId = renderSymbolId(record.node, record.notationId, record.catalog);
  const shapeId = symbolId ? catalogSymbol029(symbolId, record.catalog)?.shape : undefined;
  const shape = shapeId ? catalogShape029(shapeId, record.catalog) : undefined;
  const ctx = { notationId: record.notationId, symbolId, layoutDirection: record.direction };
  if (!shape || !stencilCaptionHeight028(shape.id, ctx)) return node;
  const { glyph } = captionedStencilFrame029(shape, node.width, node.height, ctx);
  return {
    absolutePosition: { x: node.absolutePosition.x + glyph.x, y: node.absolutePosition.y + glyph.y },
    width: glyph.width,
    height: glyph.height,
  };
}

/** Carry ELK's derived free-port choice into post-layout route repair. */
function applyFreePortAttachments(
  graph: GraphIR,
  layout: LayoutResult,
  records: Map<string, NodeRecord>,
): void {
  const candidateNodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const candidateEdges = new Map(layout.edges.map((edge) => [edge.id, edge.sections]));
  const derived = new Map<string, Map<string, Pick<Port, 'side' | 'position'>>>();
  const capture = (nodeId: string, portId: string | undefined, point: Point | undefined): void => {
    if (!portId || !point) return;
    const record = records.get(nodeId);
    const port = record?.node.ports?.find((item) => item.id === portId) as DerivedPort | undefined;
    const node = candidateNodes.get(nodeId);
    if (port?.attachment !== 'free' || !node) return;
    const choices = derived.get(nodeId) ?? new Map<string, Pick<Port, 'side' | 'position'>>();
    if (!choices.has(portId)) choices.set(portId,
      constrainFreePortAttachment(port, attachmentFromBoundaryPoint(node, point)));
    derived.set(nodeId, choices);
  };
  for (const edge of graph.edges) {
    const sections = candidateEdges.get(edge.id);
    if (!sections?.length) continue;
    capture(edge.source, edge.sourcePort, sections[0]?.startPoint);
    capture(edge.target, edge.targetPort, sections.at(-1)?.endPoint);
  }
  for (const [nodeId, choices] of derived) {
    const record = records.get(nodeId)!;
    record.node = { ...record.node, ports: record.node.ports?.map((port) => ({
      ...port, ...(choices.get(port.id) ?? {}),
    })) };
  }
}

function centre(rect: MutableRect): Point {
  return { x: rect.absolutePosition.x + rect.width / 2, y: rect.absolutePosition.y + rect.height / 2 };
}

/** Resolve mixed nodes and corner-only hints after geometry, not from provisional ELK sides. */
function applyGeometryBoundFreePortAttachments(
  graph: GraphIR,
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
): Set<string> {
  const reroute = new Set<string>();
  const edges = [...graph.edges].sort((a, b) => a.id.localeCompare(b.id));
  for (const [nodeId, record] of records) {
    const ports = record.node.ports as DerivedPort[] | undefined;
    const mixed = ports?.some((port) => port.attachment === 'free') &&
      ports.some((port) => port.attachment !== 'free');
    const cornerHint = ports?.some((port) => port.attachment === 'free' && port.attachmentClass === 'corner');
    if (!ports || (!mixed && !cornerHint)) continue;
    const rect = rects.get(nodeId);
    if (!rect) continue;
    const origin = centre(rect);
    const choices = new Map<string, Pick<Port, 'side' | 'position'>>();
    for (const port of ports.filter((item) => item.attachment === 'free')) {
      if (!mixed && port.attachmentClass !== 'corner') continue;
      const incident = edges.flatMap((edge) => {
        const otherId = edge.source === nodeId && edge.sourcePort === port.id ? edge.target
          : edge.target === nodeId && edge.targetPort === port.id ? edge.source : undefined;
        const other = otherId ? rects.get(otherId) : undefined;
        return other ? [{ edgeId: edge.id, point: centre(other) }] : [];
      });
      if (!incident.length) continue;
      for (const item of incident) reroute.add(item.edgeId);
      const average = { x: incident.reduce((sum, item) => sum + item.point.x, 0) / incident.length,
        y: incident.reduce((sum, item) => sum + item.point.y, 0) / incident.length };
      const dx = average.x - origin.x;
      const dy = average.y - origin.y;
      const side: Port['side'] = Math.abs(dx) <= TOLERANCE && Math.abs(dy) <= TOLERANCE
        ? port.side : Math.abs(dx) >= Math.abs(dy)
          ? dx >= 0 ? 'EAST' : 'WEST' : dy >= 0 ? 'SOUTH' : 'NORTH';
      const horizontal = side === 'NORTH' || side === 'SOUTH';
      const span = horizontal ? rect.width : rect.height;
      const along = horizontal ? average.x - rect.absolutePosition.x : average.y - rect.absolutePosition.y;
      choices.set(port.id, constrainFreePortAttachment(port, { side,
        position: span > 0 ? Math.max(0, Math.min(1, along / span)) : 0.5 }));
    }
    if (choices.size) record.node = { ...record.node, ports: ports.map((port) => ({
      ...port, ...(choices.get(port.id) ?? {}),
    })) };
  }
  return reroute;
}

function anchorPoint(
  anchor: RouteAnchor,
  attachments: { source: Point; target: Point },
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
): Point | undefined {
  if (anchor.kind === 'source' || anchor.kind === 'target') return { ...attachments[anchor.kind] };
  const rect = rects.get(anchor.nodeId);
  if (!rect) return undefined;
  if (anchor.kind === 'port') {
    const port = records.get(anchor.nodeId)?.node.ports?.find((candidate) => candidate.id === anchor.portId);
    return port ? portPoint(rect, port, records.get(anchor.nodeId)) : undefined;
  }
  return centre(rect);
}

function flowObjectCenter028(rect: MutableRect, records: Map<string, NodeRecord>): Point {
  const record = records.get(rect.id);
  const symbol = record && renderSymbolId(record.node, record.notationId, record.catalog);
  const frame = isBpmnEventSymbol028(symbol) ? bpmnEventFrame028(rect.width, rect.height, record?.direction ?? 'RIGHT')
    : record && isBpmnGatewaySymbol028(symbol)
      ? bpmnGatewayFrame028(rect.width, rect.height, record.direction) : undefined;
  return frame ? { x: rect.absolutePosition.x + frame.x + frame.width / 2,
    y: rect.absolutePosition.y + frame.y + frame.height / 2 } : centre(rect);
}

/** Flat generated horizontal BPMN uses visible centers, not caption frames.
 * Leave authored geometry alone; abandon this preference if its full frames
 * cannot remain separate. Route preparation runs after these view-only moves. */
function alignHorizontalBpmnSpine028(spine: readonly string[], rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>, edges: readonly GraphEdge[]): boolean {
  const original = cloneRects(rects);
  const main = spine.map((id) => rects.get(id)!);
  const mainIds = new Set(spine);
  const peers = [...rects.values()].filter((node) => !mainIds.has(node.id)).map((node) => {
    const peer = main.filter((candidate) => Math.min(node.absolutePosition.x + node.width,
      candidate.absolutePosition.x + candidate.width) -
      Math.max(node.absolutePosition.x, candidate.absolutePosition.x) > 1)
      .sort((a, b) => Math.abs(centre(a).x - centre(node).x) - Math.abs(centre(b).x - centre(node).x))[0];
    return { node, peer, above: peer ? centre(node).y < centre(peer).y : false };
  });
  const baseline = Math.max(...main.map((node) => flowObjectCenter028(node, records).y));
  for (const node of main) moveAbsolute(node, 'y', node.absolutePosition.y + baseline -
    flowObjectCenter028(node, records).y, rects, records);
  for (const { node, peer, above } of peers) {
    if (!peer) continue;
    const desired = above ? peer.absolutePosition.y - node.height - 40
      : peer.absolutePosition.y + peer.height + 40;
    if (above ? node.absolutePosition.y > desired : node.absolutePosition.y < desired)
      moveAbsolute(node, 'y', desired, rects, records);
  }
  const nodes = [...rects.values()];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i]!; const b = nodes[j]!;
    if (Math.min(a.absolutePosition.x + a.width, b.absolutePosition.x + b.width) -
        Math.max(a.absolutePosition.x, b.absolutePosition.x) > TOLERANCE &&
      Math.min(a.absolutePosition.y + a.height, b.absolutePosition.y + b.height) -
        Math.max(a.absolutePosition.y, b.absolutePosition.y) > TOLERANCE) {
      for (const [id, saved] of original) rects.set(id, saved);
      return false;
    }
  }
  // A preferred alignment must not discard a drawable engine route. Verify
  // every generated connector before accepting the moved frames; restore the
  // engine geometry if an outside corridor cannot avoid the other frames.
  for (const edge of edges) {
    if (directFreeRoute(edge, rects, records, 'RIGHT', false, true)) continue;
    try { horizontalBpmnCorridor028(edge, rects, records); }
    catch (error) {
      if (!(error instanceof SpatialLayoutError)) throw error;
      for (const [id, saved] of original) rects.set(id, saved);
      return false;
    }
  }
  return true;
}

function boundaryPoint(
  rect: MutableRect,
  toward: Point,
  portId: string | undefined,
  records: Map<string, NodeRecord>,
  coincidentSide: number,
): Point {
  const record = records.get(rect.id);
  if (portId) {
    const port = record?.node.ports?.find((candidate) => candidate.id === portId);
    if (port) return portPoint(rect, port, record);
  }
  const c = centre(rect);
  const dx = toward.x - c.x; const dy = toward.y - c.y;
  const scale = Math.abs(dx) + Math.abs(dy) <= TOLERANCE ? 0
    : 1 / Math.max(Math.abs(dx) / (rect.width / 2), Math.abs(dy) / (rect.height / 2));
  const fallback = scale ? { x: c.x + dx * scale, y: c.y + dy * scale }
    : coincidentSide === 1 ? { x: c.x - rect.width / 2, y: c.y }
      : coincidentSide === 2 ? { x: c.x, y: c.y + rect.height / 2 }
        : coincidentSide === 3 ? { x: c.x, y: c.y - rect.height / 2 }
          : { x: c.x + rect.width / 2, y: c.y };
  if (!record) return fallback;
  const appearance = resolveNodeAppearance(record.node,
    { fill: '#fff', stroke: '#000', text: '#000', edge: '#000' }, record.notationId, record.catalog);
  return resolveContourContact028({ ...appearance, id: rect.id,
    x: rect.absolutePosition.x, y: rect.absolutePosition.y, width: rect.width, height: rect.height,
    container: isContainerNode028(record.node) },
    toward, fallback, { layoutDirection: record.direction });
}

/** A free contact on the engine's orthogonal lane: the engine contact and the
 * next route point share an axis, so the contact slides along it to the
 * visible outline instead of following a centre ray that tilts the segment. */
function laneBoundaryPoint(rect: MutableRect, engine: Point, next: Point, portId: string | undefined,
  records: Map<string, NodeRecord>): Point | undefined {
  const axis = Math.abs(engine.x - next.x) <= TOLERANCE ? 'x' : Math.abs(engine.y - next.y) <= TOLERANCE ? 'y' : undefined;
  return axis ? laneAxisPoint029(rect, next, axis, portId, records) : undefined;
}
/** The visible-outline contact on the lane through `next` along `axis` ('x' = vertical lane). */
function laneAxisPoint029(rect: MutableRect, next: Point, axis: 'x' | 'y', portId: string | undefined,
  records: Map<string, NodeRecord>, margin = TOLERANCE): Point | undefined {
  const record = records.get(rect.id);
  if (portId || !record) return undefined;
  const appearance = resolveNodeAppearance(record.node,
    { fill: '#fff', stroke: '#000', text: '#000', edge: '#000' }, record.notationId, record.catalog);
  return laneContourContact029({ ...appearance, id: rect.id,
    x: rect.absolutePosition.x, y: rect.absolutePosition.y, width: rect.width, height: rect.height,
    container: isContainerNode028(record.node) }, next, axis, { layoutDirection: record.direction }, margin);
}

function oppositeCoincidentSide(side: number): number {
  return [1, 0, 3, 2][side] ?? 1;
}

function edgeAttachments(
  edge: GraphEdge,
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
  coincidentSide: number,
): { source: Point; target: Point } {
  const source = rects.get(edge.source)!;
  const target = rects.get(edge.target)!;
  return {
    source: boundaryPoint(source, centre(target), edge.sourcePort, records, coincidentSide),
    target: boundaryPoint(
      target,
      centre(source),
      edge.targetPort,
      records,
      oppositeCoincidentSide(coincidentSide),
    ),
  };
}

export interface RouteContacts {
  sourcePoint: Point; targetPoint: Point;
  sourceDirection: 'up' | 'down' | 'right' | 'left';
  /** Motion into the target, rather than its outward normal. */
  targetDirection: 'up' | 'down' | 'right' | 'left';
}

/** Adapter boundary: rectangles and checkpoints are graph-absolute, source is unchanged. */
export function resolveRouteContacts(graph: GraphIR, nodes: readonly ResolvedNodeRect[],
  options: { direction?: LayoutDirection; waypoints?: ReadonlyMap<string, readonly Point[]>;
    documentCatalog029?: CatalogSnapshot028 } = {},
): Map<string, RouteContacts> {
  const records = indexNodes(graph.nodes, options.direction ?? 'DOWN', effectiveGraphNotationId028(graph),
    options.documentCatalog029);
  const rects = new Map(nodes.map((node) => [node.id, { ...node, fixed: true }]));
  const normal = (rect: MutableRect, point: Point): RouteContacts['sourceDirection'] => {
    const c = flowObjectCenter028(rect, records);
    const dx = (point.x - c.x) / rect.width; const dy = (point.y - c.y) / rect.height;
    return Math.abs(dx) > Math.abs(dy) ? dx >= 0 ? 'right' : 'left' : dy >= 0 ? 'down' : 'up';
  };
  const opposite = { up: 'down', down: 'up', right: 'left', left: 'right' } as const;
  return new Map(graph.edges.map((edge) => {
    const source = rects.get(edge.source); const target = rects.get(edge.target);
    if (!source || !target) throw new SpatialLayoutError([{ code: 'layout.geometry.invalid', severity: 'error',
      message: `Edge "${edge.id}" references an unavailable endpoint`, subject: { kind: 'edge', id: edge.id } }]);
    const sourcePort = edge.sourcePort ? records.get(edge.source)?.node.ports?.find((port) => port.id === edge.sourcePort) : undefined;
    const targetPort = edge.targetPort ? records.get(edge.target)?.node.ports?.find((port) => port.id === edge.targetPort) : undefined;
    if (edge.sourcePort && !sourcePort || edge.targetPort && !targetPort)
      throw new SpatialLayoutError([{ code: 'layout.route.anchor-missing', severity: 'error',
        message: `Edge "${edge.id}" references an unavailable port`, subject: { kind: 'edge', id: edge.id } }]);
    const sideDirection = { NORTH: 'up', SOUTH: 'down', EAST: 'right', WEST: 'left' } as const;
    const checkpoints = options.waypoints?.get(edge.id);
    const sourcePoint = boundaryPoint(source, checkpoints?.[0] ?? centre(target), edge.sourcePort, records, 0);
    const targetPoint = boundaryPoint(target, checkpoints?.at(-1) ?? centre(source), edge.targetPort, records, 1);
    return [edge.id, { sourcePoint, targetPoint,
      sourceDirection: sourcePort ? sideDirection[sourcePort.side] : normal(source, sourcePoint),
      targetDirection: opposite[targetPort ? sideDirection[targetPort.side] : normal(target, targetPoint)] }];
  }));
}

/** Check externally routed fixed geometry against the final painted bodies.
 * Only supplied route IDs are checked; unrelated connectors keep their policy. */
export function validateRouteGeometryAtNodes(graph: GraphIR, nodes: readonly ResolvedNodeRect[],
  edgeRoutes: ReadonlyMap<string, readonly LayoutSection[]>, direction: LayoutDirection = 'DOWN',
  documentCatalog029?: CatalogSnapshot028): void {
  resolveRenderScene({ ...graph, edges: graph.edges.filter((edge) => edgeRoutes.has(edge.id)) }, {
    edgeRoutes, layoutDirection: direction, ...(documentCatalog029 ? { documentCatalog029 } : {}),
    nodeGeometry: new Map(nodes.map((node) => [node.id, { x: node.absolutePosition.x,
      y: node.absolutePosition.y, width: node.width, height: node.height }])),
  });
}

function routeEdge(
  edge: GraphEdge,
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
  coincidentSide: number,
): ResolvedEdgeRoute {
  const attachments = edgeAttachments(edge, rects, records, coincidentSide);
  const authored = edge.routeIntent?.waypoints ?? [];
  const pointsById = new Map<string, Point>();
  const resolving = new Set<string>();
  const solveWaypoint = (id: string): Point => {
    const known = pointsById.get(id);
    if (known) return known;
    const waypoint = authored.find((item) => item.id === id);
    if (!waypoint) throw new SpatialLayoutError([{ code: 'layout.route.anchor-missing', severity: 'error',
      message: `Route waypoint "${id}" has an unavailable local anchor`, path: `edges.${edge.id}.routeIntent` }]);
    if (resolving.has(id)) {
      // A free affine cycle has one translation degree of freedom. Anchor it
      // deterministically at the source attachment, then verify every equation.
      const seed = { ...attachments.source }; pointsById.set(id, seed); return seed;
    }
    resolving.add(id);
    let result: Point;
    if (waypoint.placement.kind === 'absolute') result = { ...waypoint.placement.position };
    else {
      const anchor = waypoint.placement.anchor as RouteAnchor | { kind: 'waypoint'; waypointId: string };
      const point = anchor.kind === 'waypoint' ? solveWaypoint(anchor.waypointId) : anchorPoint(anchor, attachments, rects, records);
      if (!point) throw new SpatialLayoutError([{ code: 'layout.route.anchor-missing', severity: 'error',
        message: `Route waypoint "${id}" has an unavailable anchor`, path: `edges.${edge.id}.routeIntent.${id}` }]);
      result = { x: point.x + waypoint.placement.offset.x, y: point.y + waypoint.placement.offset.y };
    }
    const seeded = pointsById.get(id);
    if (seeded && (!close(seeded.x, result.x) || !close(seeded.y, result.y)))
      throw new SpatialLayoutError([{ code: 'layout.constraint.required-unsatisfied', severity: 'error',
        message: `Route waypoint cycle at "${id}" has inconsistent offsets`, path: `edges.${edge.id}.routeIntent.${id}` }]);
    pointsById.set(id, result); resolving.delete(id); return result;
  };
  let waypoints = authored.map((waypoint) => ({ id: waypoint.id, point: solveWaypoint(waypoint.id) }));
  if (waypoints.length) {
    const toward = (endpoint: 'source' | 'target', waypoint: typeof authored[number], point: Point): Point => {
      const placement = waypoint.placement;
      const rect = rects.get(edge[endpoint])!;
      return placement.kind === 'relative' && placement.anchor.kind === endpoint
        ? { x: centre(rect).x + placement.offset.x, y: centre(rect).y + placement.offset.y } : point;
    };
    // Exact vertices determine the facing contact. An automatic semantic
    // port is still free: ELK's choice toward the far endpoint can point into
    // the body when the adjacent authored vertex lies on another side.
    // Fixed ports and authored side/corner restrictions remain authoritative.
    const authoredContact = (endpoint: 'source' | 'target', waypoint: typeof authored[number], point: Point, side: number) => {
      const nodeId = edge[endpoint];
      const portId = endpoint === 'source' ? edge.sourcePort : edge.targetPort;
      const record = records.get(nodeId)!;
      const port = record.node.ports?.find((item) => item.id === portId) as DerivedPort | undefined;
      if (portId && (port?.attachment !== 'free' || port.attachmentClass
        || record.portIncidence?.get(portId) !== 1)) return attachments[endpoint];
      const rect = rects.get(nodeId)!;
      const contact = boundaryPoint(rect, toward(endpoint, waypoint, point), undefined, records, side);
      if (!port) return contact;
      const choice = attachmentFromBoundaryPoint(attachmentFrame029(rect, record), contact);
      const accepted = { ...port, ...choice };
      record.node = { ...record.node, ports: record.node.ports?.map((item) => item.id === port.id ? accepted : item) };
      return portPoint(rect, accepted, record);
    };
    attachments.source = authoredContact('source', authored[0]!, waypoints[0]!.point, coincidentSide);
    attachments.target = authoredContact('target', authored.at(-1)!, waypoints.at(-1)!.point, oppositeCoincidentSide(coincidentSide));
    pointsById.clear(); resolving.clear();
    waypoints = authored.map((waypoint) => ({ id: waypoint.id, point: solveWaypoint(waypoint.id) }));
  }
  const points = [
    attachments.source,
    ...waypoints.map((waypoint) => waypoint.point),
    attachments.target,
  ];
  const sections: LayoutSection[] = [];
  for (let index = 0; index < points.length - 1; index += 1) sections.push({
    startPoint: points[index], bendPoints: [], endPoint: points[index + 1],
  });
  return { id: edge.id, sections, waypointIds: waypoints.map((waypoint) => waypoint.id) };
}

function candidateRoute(
  edge: GraphEdge,
  sections: LayoutSection[],
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
  coincidentSide: number,
): ResolvedEdgeRoute {
  if (!sections.length) return routeEdge(edge, rects, records, coincidentSide);
  const cloned = sections.map((section) => ({
    startPoint: { ...section.startPoint },
    bendPoints: section.bendPoints.map((point) => ({ ...point })),
    endPoint: { ...section.endPoint },
  }));
  const source = rects.get(edge.source)!;
  const target = rects.get(edge.target)!;
  const first = cloned[0];
  const last = cloned[cloned.length - 1];
  // Fitting a contact past a provisional elbow can turn its terminal leg
  // inward. Generated elbows inside that endpoint are disposable; exact
  // authored vertices use routeEdge and never enter this repair.
  const outward = (rect: MutableRect, contact: Point, next: Point) => {
    const c = flowObjectCenter028(rect, records);
    return (contact.x - c.x) * (next.x - contact.x) / rect.width ** 2 +
      (contact.y - c.y) * (next.y - contact.y) / rect.height ** 2 >= -TOLERANCE;
  };
  // Keep the engine's orthogonal lane where it reaches the visible outline.
  const engineStart = { ...first.startPoint }, engineEnd = { ...last.endPoint };
  const startContact = (next: Point) => laneBoundaryPoint(source, engineStart, next, edge.sourcePort, records)
    ?? boundaryPoint(source, next, edge.sourcePort, records, coincidentSide);
  const endContact = (next: Point) => laneBoundaryPoint(target, engineEnd, next, edge.targetPort, records)
    ?? boundaryPoint(target, next, edge.targetPort, records, oppositeCoincidentSide(coincidentSide));
  do {
    first.startPoint = startContact(first.bendPoints[0] ?? first.endPoint);
    if (!first.bendPoints.length || outward(source, first.startPoint, first.bendPoints[0]!)) break;
    first.bendPoints.shift();
  } while (first.bendPoints.length);
  first.startPoint = startContact(first.bendPoints[0] ?? first.endPoint);
  // When contour fitting shifts a captioned-glyph contact off ELK's outer box
  // centerline, propagate that shift to the first orthogonal bend so the
  // terminal leg stays dead-level rather than tilting diagonally (DRQ-03/DRQ-12).
  if (first.bendPoints.length && isCaptionedIcon029(edge.source, records)) {
    const b0 = first.bendPoints[0]!;
    const after0 = first.bendPoints[1] ?? first.endPoint;
    if (close(engineStart.y, b0.y) && !close(first.startPoint.y, b0.y) && close(b0.x, after0.x)) {
      b0.y = first.startPoint.y;
    } else if (close(engineStart.x, b0.x) && !close(first.startPoint.x, b0.x) && close(b0.y, after0.y)) {
      b0.x = first.startPoint.x;
    }
  }
  do {
    last.endPoint = endContact(last.bendPoints.at(-1) ?? last.startPoint);
    if (!last.bendPoints.length || outward(target, last.endPoint, last.bendPoints.at(-1)!)) break;
    last.bendPoints.pop();
  } while (last.bendPoints.length);
  last.endPoint = endContact(last.bendPoints.at(-1) ?? last.startPoint);
  if (last.bendPoints.length && isCaptionedIcon029(edge.target, records)) {
    const bLast = last.bendPoints.at(-1)!;
    const beforeLast = last.bendPoints.length >= 2 ? last.bendPoints.at(-2)! : last.startPoint;
    if (close(engineEnd.y, bLast.y) && !close(last.endPoint.y, bLast.y) && close(bLast.x, beforeLast.x)) {
      bLast.y = last.endPoint.y;
    } else if (close(engineEnd.x, bLast.x) && !close(last.endPoint.x, bLast.x) && close(bLast.y, beforeLast.y)) {
      bLast.x = last.endPoint.x;
    }
  }
  return { id: edge.id, sections: cloned, waypointIds: [] };
}

/** Collapse only a generated, isolated block return staircase. Keep the
 * engine's exact port contacts and outward stubs, and use an existing lane. */
function simplifyBlockFeedback028(
  edge: GraphEdge, route: ResolvedEdgeRoute, graph: GraphIR,
  rects: Map<string, MutableRect>, records: Map<string, NodeRecord>,
  direction: LayoutDirection, candidates: Map<string, LayoutSection[]>,
): ResolvedEdgeRoute {
  if ((direction !== 'RIGHT' && direction !== 'LEFT') || route.sections.length !== 1 ||
    route.waypointIds.length || graph.constraints?.length ||
    graph.nodes.some((node) => node.position || node.pinned || node.children?.length) ||
    graph.edges.some((item) => item.routeIntent || item.labelPlacement)) return route;
  const source = rects.get(edge.source); const target = rects.get(edge.target);
  if (!source || !target || source === target) return route;
  const backwards = (from: MutableRect, to: MutableRect) => direction === 'RIGHT'
    ? centre(from).x > centre(to).x : centre(from).x < centre(to).x;
  if (!backwards(source, target)) return route;
  // Retain independent engine lanes for multiple returns, including overlaps.
  if (graph.edges.some((other) => other.id !== edge.id && rects.has(other.source) &&
    rects.has(other.target) && backwards(rects.get(other.source)!, rects.get(other.target)!))) return route;
  const section = route.sections[0]!;
  const points = [section.startPoint, ...section.bendPoints, section.endPoint];
  if (section.bendPoints.length <= 4 || points.some((point, index) => index > 0 &&
    !close(point.x, points[index - 1]!.x) && !close(point.y, points[index - 1]!.y))) return route;
  const first = section.bendPoints[0]!; const last = section.bendPoints.at(-1)!;
  if (!close(first.y, section.startPoint.y) || !close(last.y, section.endPoint.y)) return route;
  const lanes = [...new Set(section.bendPoints.map(({ y }) => y))]
    .filter((y) => y < Math.min(section.startPoint.y, section.endPoint.y) ||
      y > Math.max(section.startPoint.y, section.endPoint.y))
    // Prefer the existing outer lane so the straightened return does not
    // visually merge with the bottom/top frame of intermediate blocks.
    .sort((a, b) => Math.abs(b - section.startPoint.y) - Math.abs(a - section.startPoint.y));
  for (const y of lanes) {
    const bends = [{ ...first }, { x: first.x, y }, { x: last.x, y }, { ...last }];
    const replacement = [section.startPoint, ...bends, section.endPoint];
    const blocked = [...rects.values()].some((rect) =>
      occupiedBoxes(rect, records, 2).some((box) => replacement.some((point, index) => {
        if (index === 0 || (rect.id === edge.source && index === 1) ||
          (rect.id === edge.target && index === replacement.length - 1)) return false;
        return segmentIntersectsBox(replacement[index - 1]!, point, box);
      })));
    if (blocked) continue;
    // Never exchange an engine staircase for a newly crossing/shared shaft.
    const crosses = [...candidates].some(([id, sections]) => id !== edge.id && sections.some((other) => {
      const otherPoints = [other.startPoint, ...other.bendPoints, other.endPoint];
      return replacement.slice(1).some((end, index) => {
        const start = replacement[index]!;
        return otherPoints.slice(1).some((b, otherIndex) => {
          const a = otherPoints[otherIndex]!;
          // Interior intersection including collinear overlap; shared end
          // contacts are excluded by a tiny inset at both segment ends.
          const dx = b.x - a.x; const dy = b.y - a.y;
          if (Math.abs(dx) > TOLERANCE && Math.abs(dy) > TOLERANCE) return true;
          const inset = 1e-4;
          return segmentIntersectsBox(start, end, {
            x: Math.min(a.x, b.x) + (Math.abs(dx) > TOLERANCE ? inset : -inset),
            y: Math.min(a.y, b.y) + (Math.abs(dy) > TOLERANCE ? inset : -inset),
            width: Math.abs(dx) > TOLERANCE ? Math.max(0, Math.abs(dx) - inset * 2) : inset * 2,
            height: Math.abs(dy) > TOLERANCE ? Math.max(0, Math.abs(dy) - inset * 2) : inset * 2,
          });
        });
      });
    }));
    if (!crosses) return { ...route, sections: [{ ...section, bendPoints: bends }] };
  }
  return route;
}

/** Stretch only generated route coordinates after a soft spacing change.
 * One axis mapping per edge preserves straight/orthogonal legs and chosen
 * endpoint sides; candidateRoute rebinds contacts to the final stencil. */
function proximitySections028(sections: LayoutSection[], edge: GraphEdge,
  candidates: ReadonlyMap<string, LayoutResult['nodes'][number]>,
  rects: Map<string, MutableRect>): LayoutSection[] {
  const a = candidates.get(edge.source), b = candidates.get(edge.target);
  const source = rects.get(edge.source), target = rects.get(edge.target);
  if (!a || !b || !source || !target) return [];
  const point = (value: Point): Point => {
    const map = (axis: 'x' | 'y'): number => {
      const size = axis === 'x' ? 'width' : 'height';
      const start = a.absolutePosition[axis] + a[size] / 2;
      const end = b.absolutePosition[axis] + b[size] / 2;
      const from = centre(source)[axis], to = centre(target)[axis];
      const fraction = Math.abs(end - start) < TOLERANCE ? 0.5
        : Math.max(0, Math.min(1, (value[axis] - start) / (end - start)));
      return value[axis] + (from - start) * (1 - fraction) + (to - end) * fraction;
    };
    return { x: map('x'), y: map('y') };
  };
  return sections.map((section) => ({ startPoint: point(section.startPoint),
    bendPoints: section.bendPoints.map(point), endPoint: point(section.endPoint) }));
}

/** Give a generated return edge its own exterior corridor and side entry. */
function feedbackSideRoute(
  edge: GraphEdge,
  graph: GraphIR,
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
  direction: LayoutDirection,
): ResolvedEdgeRoute | undefined {
  if (direction !== 'DOWN' || edge.routeIntent || edge.sourcePort || edge.targetPort ||
    edge.source === edge.target) return undefined;
  if (graph.edges.some((candidate) => candidate.id !== edge.id &&
    candidate.source === edge.source && candidate.target === edge.target)) return undefined;
  const source = rects.get(edge.source); const target = rects.get(edge.target);
  if (!source || !target || centre(source).y <= centre(target).y) return undefined;
  if ([edge.source, edge.target].some((id) => {
    const record = records.get(id);
    return record && isBpmnGatewaySymbol028(renderSymbolId(record.node, record.notationId, record.catalog));
  })) return undefined;
  const forward = new Map<string, string[]>();
  for (const candidate of graph.edges) {
    if (candidate.id === edge.id) continue;
    const next = forward.get(candidate.source) ?? [];
    next.push(candidate.target);
    forward.set(candidate.source, next);
  }
  const pending = [edge.target]; const visited = new Set<string>();
  let closesCycle = false;
  while (pending.length) {
    const id = pending.pop()!;
    if (id === edge.source) { closesCycle = true; break; }
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...forward.get(id) ?? []);
  }
  if (!closesCycle) return undefined;
  const west = centre(source).x <= centre(target).x;
  if (graph.edges.some((candidate) => {
    if (candidate.id === edge.id || candidate.target !== edge.target) return false;
    const other = rects.get(candidate.source);
    return other && centre(other).y > centre(target).y &&
      (centre(other).x <= centre(target).x) === west;
  })) return undefined;
  const toward = (rect: MutableRect): Point => ({
    x: centre(rect).x + (west ? -rect.width * 10 : rect.width * 10),
    y: centre(rect).y,
  });
  const start = boundaryPoint(source, toward(source), undefined, records, 0);
  const end = boundaryPoint(target, toward(target), undefined, records, 0);
  const laneX = west
    ? Math.min(source.absolutePosition.x, target.absolutePosition.x) - 20
    : Math.max(source.absolutePosition.x + source.width,
      target.absolutePosition.x + target.width) + 20;
  const bendPoints = [{ x: laneX, y: start.y }, { x: laneX, y: end.y }];
  const points = [start, ...bendPoints, end];
  for (const obstacle of rects.values()) {
    if (obstacle.id === edge.source || obstacle.id === edge.target ||
      isAncestor(obstacle.id, edge.source, records) ||
      isAncestor(obstacle.id, edge.target, records)) continue;
    if (occupiedBoxes(obstacle, records, 4).some((bounds) =>
      points.some((point, index) => index > 0 &&
        segmentIntersectsBox(points[index - 1]!, point, bounds)))) return undefined;
  }
  return { id: edge.id, sections: [{ startPoint: start, bendPoints,
    endPoint: end }], waypointIds: [] };
}

/** Keep generated horizontal feedback out of the forward connector's gap. */
function horizontalGeneratedFeedbackRoute028(
  edge: GraphEdge, graph: GraphIR, rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>, direction: LayoutDirection,
): ResolvedEdgeRoute | undefined {
  if ((direction !== 'RIGHT' && direction !== 'LEFT') || edge.routeIntent ||
    edge.sourcePort || edge.targetPort || edge.source === edge.target ||
    graph.constraints?.length || graph.nodes.some((node) =>
      node.position || node.pinned || node.children?.length)) return undefined;
  const source = rects.get(edge.source); const target = rects.get(edge.target);
  if (!source || !target) return undefined;
  const backwards = (from: MutableRect, to: MutableRect) => direction === 'RIGHT'
    ? centre(from).x > centre(to).x : centre(from).x < centre(to).x;
  if (!backwards(source, target)) return undefined;
  // Feedback edges with overlapping spans retain their independent engine
  // lanes; different endpoint IDs alone do not prevent a merged return shaft.
  if (graph.edges.some((other) => {
    if (other.id === edge.id) return false;
    const from = rects.get(other.source); const to = rects.get(other.target);
    if (!from || !to || !backwards(from, to)) return false;
    const overlaps = Math.min(Math.max(centre(source).x, centre(target).x),
      Math.max(centre(from).x, centre(to).x)) >=
      Math.max(Math.min(centre(source).x, centre(target).x),
        Math.min(centre(from).x, centre(to).x));
    return other.target === edge.target || other.source === edge.source || overlaps;
  })) return undefined;
  const next = new Map<string, string[]>();
  for (const other of graph.edges) {
    if (other.id === edge.id) continue;
    const targets = next.get(other.source) ?? [];
    targets.push(other.target);
    next.set(other.source, targets);
  }
  const pending = [edge.target]; const visited = new Set<string>();
  let closesCycle = false;
  while (pending.length) {
    const id = pending.pop()!;
    if (id === edge.source) { closesCycle = true; break; }
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...next.get(id) ?? []);
  }
  if (!closesCycle) return undefined;
  for (const above of [true, false]) {
    const toward = (rect: MutableRect): Point => ({ x: centre(rect).x,
      y: above ? rect.absolutePosition.y - 1000 : rect.absolutePosition.y + rect.height + 1000 });
    const start = boundaryPoint(source, toward(source), undefined, records, 0);
    const end = boundaryPoint(target, toward(target), undefined, records, 0);
    const relevant = [...rects.values()].filter((rect) =>
      rect.absolutePosition.x + rect.width + 4 >= Math.min(start.x, end.x) &&
      rect.absolutePosition.x - 4 <= Math.max(start.x, end.x));
    const laneY = above ? Math.min(...relevant.map((rect) => rect.absolutePosition.y)) - 24
      : Math.max(...relevant.map((rect) => rect.absolutePosition.y + rect.height)) + 24;
    const bendPoints = [{ x: start.x, y: laneY }, { x: end.x, y: laneY }];
    const points = [start, ...bendPoints, end];
    const blocked = [...rects.values()].some((rect) => {
      if (rect.id === edge.source || rect.id === edge.target) return false;
      return occupiedBoxes(rect, records, 4).some((box) => points.some((point, index) =>
        index > 0 && segmentIntersectsBox(points[index - 1]!, point, box)));
    });
    if (!blocked) return { id: edge.id, sections: [{ startPoint: start,
      bendPoints, endPoint: end }], waypointIds: [] };
  }
  return undefined;
}

/** Replace an ELK staircase with a clear diagonal departure and vertical lane. */
function clearDownwardBranchRoute(
  edge: GraphEdge,
  graph: GraphIR,
  candidateSections: LayoutSection[],
  candidateEdges: Map<string, LayoutSection[]>,
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
  direction: LayoutDirection,
  notationId: string | undefined,
): ResolvedEdgeRoute | undefined {
  if (direction !== 'DOWN' || edge.routeIntent || edge.sourcePort || edge.targetPort ||
    candidateSections.length !== 1 ||
    (notationId !== 'bpmn' && candidateSections[0]!.bendPoints.length < 3) ||
    graph.edges.some((other) => other.id !== edge.id &&
      other.source === edge.source && other.target === edge.target)) return undefined;
  const sourceRecord = records.get(edge.source);
  const sourceSymbol = sourceRecord && renderSymbolId(sourceRecord.node, sourceRecord.notationId, sourceRecord.catalog);
  if (notationId === 'flowchart' ? sourceSymbol !== 'flowchart-decision'
    : notationId === 'bpmn' ? !isBpmnGatewaySymbol028(sourceSymbol)
      : true) return undefined;
  const source = rects.get(edge.source); const target = rects.get(edge.target);
  if (!source || !target) return undefined;
  const sourceCenter = flowObjectCenter028(source, records); const targetCenter = flowObjectCenter028(target, records);
  const side = Math.sign(targetCenter.x - sourceCenter.x);
  const sourceBottom = source.absolutePosition.y + source.height;
  const targetTop = target.absolutePosition.y;
  const gap = targetTop - sourceBottom;
  if (!side || gap < (notationId === 'bpmn' ? 16 : 100) ||
    Math.abs(targetCenter.x - sourceCenter.x) < 24) return undefined;
  const margin = Math.min(14, target.width / 4);
  const elbowY = sourceBottom + Math.min(32, gap / 4);
  for (const offset of [0, 12, 24, 36]) {
    const laneX = targetCenter.x + side * offset;
    if (laneX < target.absolutePosition.x + margin ||
      laneX > target.absolutePosition.x + target.width - margin) continue;
    if (graph.edges.some((other) => other.id !== edge.id && other.target === edge.target &&
      (candidateEdges.get(other.id) ?? []).some((section) =>
        Math.abs(section.endPoint.x - laneX) < 22))) continue;
    const bend = { x: laneX, y: elbowY };
    const frame = notationId === 'bpmn'
      ? bpmnGatewayFrame028(source.width, source.height, direction) : undefined;
    const start = frame
      ? { x: source.absolutePosition.x + frame.x + frame.width / 2,
        y: source.absolutePosition.y + frame.y + frame.height }
      : boundaryPoint(source, bend, undefined, records, 0);
    const end = { x: laneX, y: targetTop };
    if (start.y >= bend.y || bend.y >= end.y) continue;
    const caption = gatewayCaptionBox(source, records);
    if (caption && caption.width > 0 && caption.height > 0 &&
      segmentIntersectsBox(start, bend, caption)) continue;
    const points = [start, bend, end];
    let blocked = false;
    for (const obstacle of rects.values()) {
      if (obstacle.id === edge.source || obstacle.id === edge.target ||
        isAncestor(obstacle.id, edge.source, records) ||
        isAncestor(obstacle.id, edge.target, records)) continue;
      const bounds = { x: obstacle.absolutePosition.x - 4,
        y: obstacle.absolutePosition.y - 4,
        width: obstacle.width + 8, height: obstacle.height + 8 };
      if (points.some((point, index) => index > 0 &&
        segmentIntersectsBox(points[index - 1]!, point, bounds))) {
        blocked = true; break;
      }
    }
    if (!blocked) return { id: edge.id, sections: [{ startPoint: start,
      bendPoints: [bend], endPoint: end }], waypointIds: [] };
  }
  return undefined;
}


function gatewayCaptionBox(rect: MutableRect, records: Map<string, NodeRecord>):
  { x: number; y: number; width: number; height: number } | undefined {
  const record = records.get(rect.id);
  if (!record || !isBpmnGatewaySymbol028(renderSymbolId(record.node, record.notationId, record.catalog))) return;
  const frame = bpmnGatewayFrame028(rect.width, rect.height, record.direction);
  const side = record.direction === 'DOWN' || record.direction === 'UP';
  return side
    ? { x: rect.absolutePosition.x + frame.x + frame.width + 12,
      y: rect.absolutePosition.y, width: rect.width - frame.x - frame.width - 12,
      height: rect.height }
    : { x: rect.absolutePosition.x,
      y: rect.absolutePosition.y + frame.y + frame.height + 12,
      width: rect.width, height: rect.height - frame.y - frame.height - 12 };
}

function occupiedBoxes(rect: MutableRect, records: Map<string, NodeRecord>, clearance: number):
  Array<{ x: number; y: number; width: number; height: number }> {
  const record = records.get(rect.id);
  const symbol = record && renderSymbolId(record.node, record.notationId, record.catalog);
  const boxes = record && isBpmnGatewaySymbol028(symbol)
    ? (() => {
      const frame = bpmnGatewayFrame028(rect.width, rect.height, record.direction);
      const caption = gatewayCaptionBox(rect, records);
      return [{ x: rect.absolutePosition.x + frame.x,
        y: rect.absolutePosition.y + frame.y, width: frame.width, height: frame.height },
      ...(caption && caption.width > 0 && caption.height > 0 ? [caption] : [])];
    })()
    : [{ x: rect.absolutePosition.x, y: rect.absolutePosition.y,
      width: rect.width, height: rect.height }];
  // A reserved user-symbol label occupies its side like the body.
  if (record?.reservedLabel029) boxes.push(reservedLabelBox029(rect, record.reservedLabel029));
  return boxes.map((box) => ({ x: box.x - clearance, y: box.y - clearance,
    width: box.width + clearance * 2, height: box.height + clearance * 2 }));
}

/** The box ELK reserved beside the body for a user symbol's label, grown by `clearance`. */
function reservedLabelBox029(rect: MutableRect, label: OutsideLabel029, clearance = 0) {
  const box = authoredNodeLabelBox028({ ...rect.absolutePosition, width: rect.width, height: rect.height },
    { side: label.side }, label.width, label.height);
  return { x: box.x - clearance, y: box.y - clearance, width: box.width + clearance * 2, height: box.height + clearance * 2 };
}

function nodeCaptionBox028(rect: MutableRect, records: Map<string, NodeRecord>) {
  const icon = records.get(rect.id);
  if (icon?.node.labelPlacement && icon.authoredLabelSize) return authoredNodeLabelBox028({
    ...rect.absolutePosition, width: rect.width, height: rect.height }, icon.node.labelPlacement,
    icon.authoredLabelSize.width, icon.authoredLabelSize.height);
  if (icon?.containerTitleOptions && isContainerNode028(icon.node) && !icon.node.labelPlacement) {
    const title = containerTitleBox028(icon.node, rect.width, icon.containerTitleOptions);
    return { ...title, x: rect.absolutePosition.x + title.x, y: rect.absolutePosition.y + title.y };
  }
  const symbolId = icon && renderSymbolId(icon.node, icon.notationId, icon.catalog);
  const shapeId = symbolId ? catalogSymbol029(symbolId, icon?.catalog)?.shape : undefined;
  const shape = shapeId ? catalogShape029(shapeId, icon?.catalog) : undefined;
  const ctx = icon ? { notationId: icon.notationId, symbolId, layoutDirection: icon.direction } : undefined;
  if (shape && stencilCaptionHeight028(shape.id, ctx)) {
    const textBox = captionedStencilFrame029(shape, rect.width, rect.height, ctx).textBox;
    // Pad by 2 px on all sides so stroke-width scene checks clear painted ink
    // while keeping the left/right side-exit lanes and top escape channel open.
    return {
      x: rect.absolutePosition.x + textBox.x - 2,
      y: rect.absolutePosition.y + textBox.y - 2,
      width: textBox.width + 4,
      height: textBox.height + 4,
    };
  }
  const gateway = gatewayCaptionBox(rect, records);
  if (gateway) return gateway;
  const record = records.get(rect.id);
  if (!record || !isBpmnEventSymbol028(renderSymbolId(record.node, record.notationId, record.catalog))) return;
  const frame = bpmnEventCaptionBox028(rect.width, rect.height, record.direction);
  return { ...frame, x: rect.absolutePosition.x + frame.x, y: rect.absolutePosition.y + frame.y };
}

/** Replace a generated dogleg only when a free, direct connector is clear. */
function directFreeRoute(
  edge: GraphEdge,
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
  direction: LayoutDirection,
  rankReversed: boolean,
  protectEventCaptions = false,
  actualAlignedGeometry = false,
  orthogonal = false,
): ResolvedEdgeRoute | undefined {
  if (edge.source === edge.target) return undefined;
  const source = rects.get(edge.source); const target = rects.get(edge.target);
  if (!source || !target) return undefined;
  const freePort = (nodeId: string, portId: string | undefined): DerivedPort | undefined | false => {
    if (!portId) return undefined;
    const port = records.get(nodeId)?.node.ports?.find((item) => item.id === portId) as
      DerivedPort | undefined;
    return port?.attachment === 'free' && !port.attachmentClass
      && (!actualAlignedGeometry || records.get(nodeId)?.portIncidence?.get(portId) === 1) ? port : false;
  };
  const sourcePort = freePort(edge.source, edge.sourcePort);
  const targetPort = freePort(edge.target, edge.targetPort);
  if (sourcePort === false || targetPort === false) return undefined;
  const sourceCenter = flowObjectCenter028(source, records); const targetCenter = flowObjectCenter028(target, records);
  const advance = direction === 'DOWN' ? targetCenter.y - sourceCenter.y
    : direction === 'UP' ? sourceCenter.y - targetCenter.y
      : direction === 'RIGHT' ? targetCenter.x - sourceCenter.x
        : sourceCenter.x - targetCenter.x;
  const sideways = actualAlignedGeometry && close(advance, 0)
    && (close(sourceCenter.x, targetCenter.x) || close(sourceCenter.y, targetCenter.y))
    && (!close(sourceCenter.x, targetCenter.x) || !close(sourceCenter.y, targetCenter.y));
  if (advance <= 0 && !rankReversed && !sideways) return undefined;
  const contact = (rect: MutableRect, toward: Point, port: DerivedPort | undefined): Point => {
    const point = boundaryPoint(rect, toward, undefined, records, 0);
    const record = records.get(rect.id);
    // Event and gateway contacts already use their painted flow-object frame.
    // Remapping an auto port against the full caption box moves it off that ink.
    if (!port || (record && (isBpmnGatewaySymbol028(
      renderSymbolId(record.node, record.notationId, record.catalog)) || isBpmnEventSymbol028(
      renderSymbolId(record.node, record.notationId, record.catalog))))) return point;
    return portPoint(rect, { ...port, ...attachmentFromBoundaryPoint(attachmentFrame029(rect, record), point) }, record);
  };
  let start = contact(source, targetCenter, sourcePort || undefined);
  let end = contact(target, sourceCenter, targetPort || undefined);
  let bendPoints: Point[] = [];
  if (orthogonal && Math.abs(start.x - end.x) > 0.5 && Math.abs(start.y - end.y) > 0.5) {
    const h = direction === 'RIGHT' || direction === 'LEFT';
    const mid = h ? (start.x + end.x) / 2 : (start.y + end.y) / 2;
    const sPt = h ? { x: mid, y: sourceCenter.y } : { x: sourceCenter.x, y: mid };
    const ePt = h ? { x: mid, y: targetCenter.y } : { x: targetCenter.x, y: mid };
    const axis = h ? 'y' : 'x';
    const ss = (!sourcePort ? laneAxisPoint029(source, sPt, axis, undefined, records, 4) : undefined)
      ?? contact(source, sPt, sourcePort || undefined);
    const se = (!targetPort ? laneAxisPoint029(target, ePt, axis, undefined, records, 4) : undefined)
      ?? contact(target, ePt, targetPort || undefined);
    if (h ? (Math.abs(ss.y - sPt.y) > 0.5 || Math.abs(se.y - ePt.y) > 0.5)
      : (Math.abs(ss.x - sPt.x) > 0.5 || Math.abs(se.x - ePt.x) > 0.5)) return undefined;
    start = ss; end = se;
    const zMid = h ? (ss.x + se.x) / 2 : (ss.y + se.y) / 2;
    bendPoints = (h ? Math.abs(ss.y - se.y) : Math.abs(ss.x - se.x)) <= 0.5
      ? [] : h ? [{ x: zMid, y: ss.y }, { x: zMid, y: se.y }] : [{ x: ss.x, y: zMid }, { x: se.x, y: zMid }];
  }
  const routePoints = [start, ...bendPoints, end];
  const hitsBox = (box: { x: number; y: number; width: number; height: number }): boolean =>
    routePoints.some((point, index) => index > 0 && segmentIntersectsBox(routePoints[index - 1]!, point, box));
  for (const rect of [source, target]) {
    const caption = (protectEventCaptions || orthogonal) ? nodeCaptionBox028(rect, records)
      : gatewayCaptionBox(rect, records);
    if (caption && caption.width > 0 && caption.height > 0 && hitsBox(caption)) return undefined;
  }
  // A shortcut may not cross a label ELK reserved, including its endpoints'.
  for (const rect of rects.values()) {
    const label = records.get(rect.id)?.reservedLabel029;
    if (label && hitsBox(reservedLabelBox029(rect, label, 4))) return undefined;
  }
  for (const rect of rects.values()) {
    if (rect.id === edge.source || rect.id === edge.target) continue;
    // An enclosing frame may surround its own connector, but all other
    // occupied boxes need a clearance margin for the stroke and marker.
    let ancestor = false;
    for (const endpoint of [edge.source, edge.target]) {
      let parentId = records.get(endpoint)?.parentId;
      while (parentId) {
        if (parentId === rect.id) { ancestor = true; break; }
        parentId = records.get(parentId)?.parentId;
      }
    }
    if (ancestor) continue;
    const clearance = rankReversed ? 10 : 4;
    if (hitsBox({
      x: rect.absolutePosition.x - clearance, y: rect.absolutePosition.y - clearance,
      width: rect.width + 2 * clearance, height: rect.height + 2 * clearance,
    })) return undefined;
  }
  if (actualAlignedGeometry) for (const [nodeId, port, point] of [
    [edge.source, sourcePort, start], [edge.target, targetPort, end],
  ] as const) {
    if (!port) continue;
    const record = records.get(nodeId)!;
    const attachment = attachmentFromBoundaryPoint(attachmentFrame029(rects.get(nodeId)!, records.get(nodeId)), point);
    record.node = { ...record.node, ports: record.node.ports?.map((item) =>
      item.id === port.id ? { ...item, ...attachment } : item) };
  }
  return { id: edge.id, sections: [{ startPoint: start, bendPoints, endPoint: end }],
    waypointIds: [] };
}

/** A return or shortcut spanning a task uses one clear outside corridor,
 * retaining its authored direction with only two elbows. */
function horizontalBpmnCorridor028(edge: GraphEdge, rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>): ResolvedEdgeRoute {
  const source = rects.get(edge.source)!; const target = rects.get(edge.target)!;
  const sourceCenter = flowObjectCenter028(source, records);
  const targetCenter = flowObjectCenter028(target, records);
  for (const above of [true, false]) {
    const toward = (rect: MutableRect, center: Point) => ({ x: center.x,
      y: above ? rect.absolutePosition.y - 1000 : rect.absolutePosition.y + rect.height + 1000 });
    const start = boundaryPoint(source, toward(source, sourceCenter), undefined, records, 0);
    const end = boundaryPoint(target, toward(target, targetCenter), undefined, records, 0);
    const relevant = [...rects.values()].filter((node) =>
      node.absolutePosition.x + node.width + 4 >= Math.min(start.x, end.x) &&
      node.absolutePosition.x - 4 <= Math.max(start.x, end.x));
    const laneY = above ? Math.min(...relevant.map((node) => node.absolutePosition.y)) - 20
      : Math.max(...relevant.map((node) => node.absolutePosition.y + node.height)) + 20;
    const bends = [{ x: start.x, y: laneY }, { x: end.x, y: laneY }];
    const points = [start, ...bends, end];
    const blocked = [...rects.values()].some((node) => {
      const boxes = node.id === source.id || node.id === target.id
        ? [nodeCaptionBox028(node, records)].filter((box): box is NonNullable<typeof box> => Boolean(box))
        : occupiedBoxes(node, records, 4);
      return boxes.some((box) => points.some((point, index) => index > 0 &&
        segmentIntersectsBox(points[index - 1]!, point, box)));
    });
    if (!blocked) return { id: edge.id, sections: [{ startPoint: start, bendPoints: bends, endPoint: end }],
      waypointIds: [] };
  }
  throw new SpatialLayoutError([{ code: 'layout.capability.unsupported', severity: 'error',
    message: `BPMN connector ${edge.id} has no clear horizontal corridor`,
    path: `edges.${edge.id}`, subject: { kind: 'edge', id: edge.id } }]);
}

/** Use an open vertical corridor for an unported UML generalization spine. */
function straightClassRankLane(
  edge: GraphEdge,
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
  direction: LayoutDirection,
): ResolvedEdgeRoute | undefined {
  if (direction !== 'DOWN' || edge.sourcePort || edge.targetPort) return undefined;
  const source = rects.get(edge.source); const target = rects.get(edge.target);
  if (!source || !target) return undefined;
  const classifierRect = (id: string): boolean => {
    const node = records.get(id)?.node;
    return Boolean(node?.classifier && (!node.symbol ||
      catalogSymbol029(node.symbol, records.get(id)?.catalog)?.shape === 'rectangle'));
  };
  if (!classifierRect(edge.source) || !classifierRect(edge.target)) return undefined;
  const sourceTop = source.absolutePosition.y;
  const targetBottom = target.absolutePosition.y + target.height;
  if (sourceTop - targetBottom < 16) return undefined;
  const margin = 10;
  const lower = Math.max(source.absolutePosition.x, target.absolutePosition.x) + margin;
  const upper = Math.min(source.absolutePosition.x + source.width,
    target.absolutePosition.x + target.width) - margin;
  if (upper <= lower) return undefined;
  let intervals: Array<[number, number]> = [[lower, upper]];
  const obstacles = [...rects.values()].filter((obstacle) => {
    if (obstacle.id === edge.source || obstacle.id === edge.target) return false;
    for (const endpoint of [edge.source, edge.target]) {
      let parentId = records.get(endpoint)?.parentId;
      while (parentId) {
        if (parentId === obstacle.id) return false;
        parentId = records.get(parentId)?.parentId;
      }
    }
    return true;
  });
  for (const obstacle of obstacles) {
    const y = obstacle.absolutePosition.y;
    if (y - 4 >= sourceTop || y + obstacle.height + 4 <= targetBottom) continue;
    const left = obstacle.absolutePosition.x - 4;
    const right = obstacle.absolutePosition.x + obstacle.width + 4;
    intervals = intervals.flatMap(([start, end]) => {
      if (right <= start || left >= end) return [[start, end]];
      return [
        ...(left - start >= 2 ? [[start, left] as [number, number]] : []),
        ...(end - right >= 2 ? [[right, end] as [number, number]] : []),
      ];
    });
    if (!intervals.length) return undefined;
  }
  const desired = (centre(source).x + centre(target).x) / 2;
  intervals.sort((left, right) => (right[1] - right[0]) - (left[1] - left[0]) ||
    Math.abs((left[0] + left[1]) / 2 - desired) -
    Math.abs((right[0] + right[1]) / 2 - desired));
  const [start, end] = intervals[0]!;
  const x = (start + end) / 2;
  const startPoint = { x, y: sourceTop };
  const endPoint = { x, y: targetBottom };
  if (obstacles.some((obstacle) => segmentIntersectsBox(startPoint, endPoint, {
    x: obstacle.absolutePosition.x - 4, y: obstacle.absolutePosition.y - 4,
    width: obstacle.width + 8, height: obstacle.height + 8,
  }))) return undefined;
  return { id: edge.id, sections: [{ startPoint, bendPoints: [], endPoint }], waypointIds: [] };
}

/** Keep generated routes clear of event, gateway, and icon caption frames. */
function avoidNodeCaption028(
  edge: GraphEdge, route: ResolvedEdgeRoute,
  rects: Map<string, MutableRect>, records: Map<string, NodeRecord>,
  edgeLabelSize?: { width: number; height: number },
): void {
  const points = route.sections.flatMap((section, index) => index === 0
    ? [section.startPoint, ...section.bendPoints, section.endPoint]
    : [...section.bendPoints, section.endPoint]);
  const verifyEventRings = (routePoints: Point[]): void => {
    for (const nodeId of [edge.source, edge.target]) {
      const rect = rects.get(nodeId); const record = records.get(nodeId);
      if (!rect || !record || !isBpmnEventSymbol028(renderSymbolId(record.node, record.notationId, record.catalog))) continue;
      const center = flowObjectCenter028(rect, records);
      const entersRing = routePoints.some((point, index) => {
        if (index === 0) return false;
        const previous = routePoints[index - 1]!;
        const dx = point.x - previous.x; const dy = point.y - previous.y;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared ? Math.max(0, Math.min(1,
          ((center.x - previous.x) * dx + (center.y - previous.y) * dy) / lengthSquared)) : 0;
        return Math.hypot(previous.x + dx * t - center.x,
          previous.y + dy * t - center.y) < 24 - TOLERANCE;
      });
      if (entersRing) throw new SpatialLayoutError([{
        code: 'layout.capability.unsupported', severity: 'error',
        message: `BPMN route ${edge.id} crosses event ${nodeId} ring`,
        path: `edges.${edge.id}`, subject: { kind: 'edge', id: edge.id },
      }]);
    }
  };
  const start = points[0]!; const end = points.at(-1)!;
  const captionBoxes: Array<{ nodeId: string; box: { x: number; y: number;
    width: number; height: number } }> = [];
  const ancestorOfEndpoint = (containerId: string): boolean =>
    [edge.source, edge.target].some((endpoint) => {
      let parentId = records.get(endpoint)?.parentId;
      while (parentId) {
        if (parentId === containerId) return true;
        parentId = records.get(parentId)?.parentId;
      }
      return false;
    });
  const thirdPartyClear = (candidate: Point[]): boolean => {
    for (const rect of rects.values()) {
      if (rect.id === edge.source || rect.id === edge.target) continue;
      if (ancestorOfEndpoint(rect.id)) {
        const title = nodeCaptionBox028(rect, records);
        if (title && title.width > 0 && title.height > 0 && candidate.some((point, index) => index > 0 &&
          segmentIntersectsBox(candidate[index - 1]!, point, {
            x: title.x - 4, y: title.y - 4, width: title.width + 8, height: title.height + 8,
          }))) return false;
        continue;
      }
      if (candidate.some((point, index) => index > 0 &&
        segmentIntersectsBox(candidate[index - 1]!, point, {
          // Include stroke and the bounded lowfi bow, not just box interior.
          x: rect.absolutePosition.x - 4, y: rect.absolutePosition.y - 4,
          width: rect.width + 8, height: rect.height + 8,
        }))) return false;
    }
    return true;
  };
  const isFreeEndpoint = (nodeId: string, portId: string | undefined): boolean => {
    if (!portId) return true;
    const port = records.get(nodeId)?.node.ports?.find((item) => item.id === portId) as DerivedPort | undefined;
    return Boolean(port?.attachment === 'free' && !port.attachmentClass);
  };
  type EscapeResult = {
    bends: Point[];
    newContact?: Point;
    newFarContact?: Point;
    replaceMid?: boolean;
    trimMidFirst?: boolean;
    trimMidLast?: boolean;
  };
  const escape = (
    endpoint: 'source' | 'target',
    nodeId: string,
    contact: Point,
    next: Point,
    farPoint: Point,
  ): EscapeResult | undefined => {
    const record = records.get(nodeId); const rect = rects.get(nodeId);
    if (!record || !rect) return;
    const caption = nodeCaptionBox028(rect, records);
    if (!caption) return;
    const event = isBpmnEventSymbol028(renderSymbolId(record.node, record.notationId, record.catalog));
    const iconSymbolId = renderSymbolId(record.node, record.notationId, record.catalog);
    const iconShape = catalogSymbol029(iconSymbolId ?? '', record.catalog)?.shape;
    const icon = Boolean(iconShape && stencilCaptionHeight028(iconShape, { notationId: record.notationId, symbolId: iconSymbolId }));
    const side = record.direction === 'DOWN' || record.direction === 'UP';
    captionBoxes.push({ nodeId, box: caption });
    const edgeLabel = edgeLabelSize && edge.labelPlacement
      ? authoredEdgeLabelBox028(points, edge.labelPlacement, edgeLabelSize.width, edgeLabelSize.height) : undefined;
    const labelOverlap = edgeLabel && edgeLabel.x < caption.x + caption.width &&
      edgeLabel.x + edgeLabel.width > caption.x && edgeLabel.y < caption.y + caption.height &&
      edgeLabel.y + edgeLabel.height > caption.y;
    if (caption.width <= 0 || caption.height <= 0 ||
      (!segmentIntersectsBox(contact, next, caption) && !labelOverlap)) return;
    if (edge.routeIntent) throw new SpatialLayoutError([{
      code: 'layout.capability.unsupported', severity: 'error',
      message: record.node.labelPlacement ? `Authored route ${edge.id} crosses node ${nodeId} label`
        : icon ? `Authored route ${edge.id} crosses icon ${nodeId} caption`
          : `Authored route ${edge.id} crosses BPMN ${event ? 'event' : 'gateway'} ${nodeId} caption`,
      path: `edges.${edge.id}.routeIntent`, subject: { kind: 'edge', id: edge.id },
    }]);
    const placement = record.node.labelPlacement;
    if (placement && placement.side !== 'center') {
      // Leave the exact contact on the body boundary, then clear the caption
      // on its outer side before rejoining the generated path.
      if (placement.side === 'above' || placement.side === 'below') {
        const right = contact.x >= rect.absolutePosition.x + rect.width - TOLERANCE ||
          (contact.x > rect.absolutePosition.x + TOLERANCE && next.x >= contact.x);
        const edgeSide = edge.labelPlacement?.side;
        const labelClearance = !edgeLabelSize ? 0 : edgeSide === (right ? 'left' : 'right')
          ? edgeLabelSize.width + (edge.labelPlacement?.offset ?? 0)
          : edgeSide === (right ? 'right' : 'left') ? 0 : edgeLabelSize.width / 2;
        const laneX = right ? Math.max(caption.x + caption.width, rect.absolutePosition.x + rect.width) + 8 + labelClearance
          : Math.min(caption.x, rect.absolutePosition.x) - 8 - labelClearance;
        const laneY = placement.side === 'below' ? caption.y + caption.height + 8 : caption.y - 8;
        return { bends: [{ x: laneX, y: contact.y }, { x: laneX, y: laneY }] };
      }
      const below = contact.y >= rect.absolutePosition.y + rect.height - TOLERANCE ||
        (contact.y > rect.absolutePosition.y + TOLERANCE && next.y >= contact.y);
      const edgeSide = edge.labelPlacement?.side;
      const labelClearance = !edgeLabelSize ? 0 : edgeSide === (below ? 'above' : 'below')
        ? edgeLabelSize.height + (edge.labelPlacement?.offset ?? 0)
        : edgeSide === (below ? 'below' : 'above') ? 0 : edgeLabelSize.height / 2;
      const laneY = below ? Math.max(caption.y + caption.height, rect.absolutePosition.y + rect.height) + 8 + labelClearance
        : Math.min(caption.y, rect.absolutePosition.y) - 8 - labelClearance;
      const laneX = placement.side === 'right' ? caption.x + caption.width + 8 : caption.x - 8;
      return { bends: [{ x: contact.x, y: laneY }, { x: laneX, y: laneY }] };
    }
    if (side) {
      const channelX = caption.x - 6;
      const outsideY = next.y >= contact.y
        ? rect.absolutePosition.y + rect.height + 8 : rect.absolutePosition.y - 8;
      const bends = [{ x: channelX, y: contact.y }, { x: channelX, y: outsideY }];
      if (next.y > rect.absolutePosition.y - 8 &&
        next.y < rect.absolutePosition.y + rect.height + 8) {
        const farX = Math.max(rect.absolutePosition.x + rect.width + 8, next.x);
        bends.push({ x: farX, y: outsideY }, { x: farX, y: next.y });
      }
      return { bends };
    }
    const portId = endpoint === 'source' ? edge.sourcePort : edge.targetPort;
    if (icon && isFreeEndpoint(nodeId, portId)) {
      const gf = attachmentFrame029(rect, record);
      const gx = gf.absolutePosition.x + gf.width / 2, gy = gf.absolutePosition.y + gf.height / 2;
      if (caption.y >= gf.absolutePosition.y + gf.height - 2) {
        const isSrc = endpoint === 'source';
        const farNodeId = isSrc ? edge.target : edge.source, farPortId = isSrc ? edge.targetPort : edge.sourcePort;
        const farRect = rects.get(farNodeId);
        const midPoints = points.slice(1, -1);
        const adjMid = isSrc ? midPoints[0] : midPoints.at(-1), secMid = isSrc ? midPoints[1] : midPoints.at(-2);
        const minJoinY = caption.y + caption.height + 10;
        const canMerge = Boolean(adjMid && adjMid.y >= caption.y + caption.height + 4);
        const safeJoinY = Math.max(minJoinY, canMerge ? adjMid!.y : Math.min(farPoint.y - 16, Math.max(minJoinY, (caption.y + caption.height + farPoint.y) / 2)));
        const trimAdj = Boolean(canMerge && secMid && close(adjMid!.y, secMid.y));
        const clearL = Math.min(caption.x, gf.absolutePosition.x) - 10;
        const clearR = Math.max(caption.x + caption.width, gf.absolutePosition.x + gf.width) + 10;
        const vFlow = record.direction === 'DOWN' || record.direction === 'UP';
        const clearPreview = (pts: Point[], extra?: { x: number; y: number; width: number; height: number }) =>
          !pts.some((pt, i) => i > 0 && (segmentIntersectsBox(pts[i - 1]!, pt, caption)
            || Boolean(extra && extra.width > 0 && extra.height > 0 && segmentIntersectsBox(pts[i - 1]!, pt, extra))))
          && thirdPartyClear(pts);
        const sideAt = (x: number, goLeft: boolean) =>
          laneAxisPoint029(rect, { x, y: gy }, 'y', undefined, records, 4)
            ?? boundaryPoint(rect, { x: rect.absolutePosition.x + (goLeft ? -1000 : rect.width + 1000), y: gy }, undefined, records, 0);
        for (const goLeft of [farPoint.x < gx - 1, !(farPoint.x < gx - 1)]) {
          const outX = goLeft ? clearL : clearR;
          if (vFlow && (goLeft ? farPoint.x <= clearL : farPoint.x >= clearR)) {
            const sc = sideAt(farPoint.x, goLeft);
            const db = [{ x: farPoint.x, y: sc.y }];
            if (clearPreview(isSrc ? [sc, ...db, end] : [start, ...db, sc])) return { bends: db, newContact: sc, replaceMid: true };
          }
          const sc = sideAt(outX, goLeft);
          if (vFlow && farRect && isFreeEndpoint(farNodeId, farPortId)) {
            const fc = laneAxisPoint029(farRect, { x: outX, y: sc.y }, 'x', undefined, records, 12);
            if (fc && close(fc.x, outX)) {
              const db = [{ x: outX, y: sc.y }];
              if (clearPreview(isSrc ? [sc, ...db, fc] : [fc, ...db, sc], nodeCaptionBox028(farRect, records))) {
                return { bends: db, newContact: sc, newFarContact: fc, replaceMid: true };
              }
            }
          }
          const joinY = vFlow ? safeJoinY : (canMerge ? adjMid!.y : farPoint.y);
          const bends: Point[] = [{ x: outX, y: sc.y }, { x: outX, y: joinY }];
          if (!midPoints.length && Math.abs(farPoint.x - outX) > 0.5 && Math.abs(farPoint.y - joinY) > 0.5) bends.push({ x: farPoint.x, y: joinY });
          else if (canMerge && !trimAdj && Math.abs(adjMid!.x - outX) > 0.5 && Math.abs(adjMid!.y - joinY) > 0.5) bends.push({ x: adjMid!.x, y: joinY });
          const preview = isSrc
            ? [sc, ...bends, ...(trimAdj ? midPoints.slice(1) : midPoints), end]
            : [start, ...(trimAdj ? midPoints.slice(0, -1) : midPoints), ...bends.slice().reverse(), sc];
          if (clearPreview(preview)) return { bends, newContact: sc, trimMidFirst: isSrc && trimAdj, trimMidLast: !isSrc && trimAdj };
        }
      }
    }
    const channelY = icon
      ? caption.y - 5
      : caption.y - 6;
    const outsideX = next.x >= contact.x
      ? rect.absolutePosition.x + rect.width + 8 : rect.absolutePosition.x - 8;
    const bends = [{ x: contact.x, y: channelY }, { x: outsideX, y: channelY }];
    if (event || icon) {
      // Stay outside the entire caption before rejoining a lower waypoint.
      // A diagonal directly from the top channel can cut back through text.
      bends.push({ x: outsideX, y: caption.y + caption.height + 8 });
    } else if (next.x > rect.absolutePosition.x - 8 &&
      next.x < rect.absolutePosition.x + rect.width + 8) {
      const farY = Math.max(rect.absolutePosition.y + rect.height + 8, next.y);
      bends.push({ x: outsideX, y: farY }, { x: next.x, y: farY });
    }
    return { bends };
  };
  const fromSource = escape('source', edge.source, start, points[1] ?? end, end);
  const intoTarget = escape('target', edge.target, end, points.at(-2) ?? start, start);
  if (!fromSource && !intoTarget) {
    verifyEventRings(points);
    for (const { nodeId, box } of captionBoxes) {
      if (points.some((point, index) => index > 0 &&
        segmentIntersectsBox(points[index - 1]!, point, box))) {
        throw new SpatialLayoutError([{
          code: 'layout.capability.unsupported', severity: 'error',
          message: records.get(nodeId)?.node.labelPlacement ? `Route ${edge.id} crosses node ${nodeId} caption`
            : `Route ${edge.id} crosses BPMN flow-object ${nodeId} caption`,
          path: `edges.${edge.id}`, subject: { kind: 'edge', id: edge.id },
        }]);
      }
    }
  }
  if (fromSource || intoTarget) {
    // Generated ELK stubs may themselves sit beside the caption. Start with
    // the shortest repaired candidate for explicit labels, then verify every
    // caption and third-party body before replacing the generated route.
    const explicitCaption = records.get(edge.source)?.node.labelPlacement || records.get(edge.target)?.node.labelPlacement;
    const directSingleSide = (fromSource?.replaceMid && !intoTarget) || (intoTarget?.replaceMid && !fromSource);
    let midPoints = (explicitCaption || directSingleSide) ? [] : points.slice(1, -1);
    if (fromSource?.trimMidFirst && midPoints.length) midPoints = midPoints.slice(1);
    if (intoTarget?.trimMidLast && midPoints.length) midPoints = midPoints.slice(0, -1);
    const finalStart = fromSource?.newContact ?? (directSingleSide ? intoTarget?.newFarContact : undefined) ?? start;
    const finalEnd = intoTarget?.newContact ?? (directSingleSide ? fromSource?.newFarContact : undefined) ?? end;
    const bendPoints = [...(fromSource?.bends ?? []), ...midPoints,
      ...(intoTarget?.bends.slice().reverse() ?? [])];
    const repaired = [finalStart, ...bendPoints, finalEnd];
    for (const { nodeId, box } of captionBoxes) {
      if (repaired.some((point, index) => index > 0 &&
        segmentIntersectsBox(repaired[index - 1]!, point, box))) {
        throw new SpatialLayoutError([{
          code: 'layout.capability.unsupported', severity: 'error',
          message: records.get(nodeId)?.node.labelPlacement ? `Caption detour for ${edge.id} still crosses node ${nodeId} caption`
            : `BPMN caption detour for ${edge.id} still crosses flow-object ${nodeId} caption`,
          path: `edges.${edge.id}`, subject: { kind: 'edge', id: edge.id },
        }]);
      }
    }
    verifyEventRings(repaired);
    for (const rect of rects.values()) {
      if (rect.id === edge.source || rect.id === edge.target) continue;
      // Ancestor frames intentionally surround their descendant connectors.
      if (ancestorOfEndpoint(rect.id)) continue;
      if (repaired.some((point, index) => index > 0 &&
        segmentIntersectsBox(repaired[index - 1]!, point, {
          // Include stroke and the bounded lowfi bow, not just box interior.
          x: rect.absolutePosition.x - 4, y: rect.absolutePosition.y - 4,
          width: rect.width + 8, height: rect.height + 8,
        }))) throw new SpatialLayoutError([{
        code: 'layout.capability.unsupported', severity: 'error',
        message: records.get(edge.source)?.node.labelPlacement || records.get(edge.target)?.node.labelPlacement
          ? `Caption detour for ${edge.id} crosses node ${rect.id}`
          : `BPMN caption detour for ${edge.id} crosses node ${rect.id}`,
        path: `edges.${edge.id}`, subject: { kind: 'edge', id: edge.id },
      }]);
    }
    route.sections = [{ startPoint: finalStart, bendPoints, endPoint: finalEnd }];
  }
}

/** Keep free open-triangle heads distinct on the same classifier border. */
function spreadClassifierTriangleContacts(
  graph: GraphIR,
  routes: ResolvedEdgeRoute[],
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
): void {
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const notationId = effectiveGraphNotationId028(graph);
  const symbols = resolveSymbolIndex(graph.nodes, notationId);
  const groups = new Map<string, Array<{
    route: ResolvedEdgeRoute; endpoint: 'source' | 'target';
    coordinate: number; otherCoordinate: number; fixed: boolean;
  }>>();
  for (const route of routes) {
    const edge = edges.get(route.id);
    if (!edge) continue;
    const appearance = resolveEdgeAppearance(edge, symbols, notationId, '#000');
    for (const endpoint of ['source', 'target'] as const) {
      const marker = appearance[endpoint].marker;
      const openTriangle = marker?.kind === 'triangle' && marker.fill !== 'filled';
      if (!openTriangle) continue;
      const nodeId = edge[endpoint];
      const fixed = Boolean(edge.routeIntent || edge[endpoint === 'source' ? 'sourcePort' : 'targetPort']);
      const node = records.get(nodeId)?.node;
      if (!node?.classifier || node.symbol &&
        catalogSymbol029(node.symbol, records.get(nodeId)?.catalog)?.shape !== 'rectangle') continue;
      const rect = rects.get(nodeId);
      const contact = endpoint === 'source' ? route.sections[0]?.startPoint
        : route.sections.at(-1)?.endPoint;
      if (!rect || !contact) continue;
      const { x, y } = rect.absolutePosition;
      const side = Math.abs(contact.x - x) < 0.01 ? 'WEST'
        : Math.abs(contact.x - x - rect.width) < 0.01 ? 'EAST'
        : Math.abs(contact.y - y) < 0.01 ? 'NORTH'
        : Math.abs(contact.y - y - rect.height) < 0.01 ? 'SOUTH' : undefined;
      if (!side) continue;
      const coordinate = side === 'WEST' || side === 'EAST' ? contact.y : contact.x;
      const otherContact = endpoint === 'source' ? route.sections.at(-1)?.endPoint
        : route.sections[0]?.startPoint;
      const otherCoordinate = side === 'WEST' || side === 'EAST'
        ? otherContact?.y ?? coordinate : otherContact?.x ?? coordinate;
      const key = `${nodeId}\0${side}`;
      const group = groups.get(key) ?? [];
      group.push({ route, endpoint, coordinate, otherCoordinate, fixed });
      groups.set(key, group);
    }
  }
  // The lowfi 2.3 px shaft scales the open triangle marker to at most about
  // 22 px of vertical ink after rotation and stroke; reserve visible space.
  const spacing = 24;
  const pinnedClearance = 26;
  const margin = 10;
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    group.sort((left, right) => left.coordinate - right.coordinate ||
      left.route.id.localeCompare(right.route.id));
    const [nodeId, side] = key.split('\0');
    const rect = rects.get(nodeId!)!;
    const vertical = side === 'WEST' || side === 'EAST';
    const origin = rect.absolutePosition[vertical ? 'y' : 'x'];
    const extent = vertical ? rect.height : rect.width;
    const span = spacing * (group.length - 1);
    if (extent - 2 * margin < span) throw new SpatialLayoutError([{
      code: 'layout.capability.unsupported', severity: 'error', path: `nodes.${nodeId}`,
      subject: { kind: 'node', id: nodeId! },
      message: `Classifier ${nodeId} ${side} side needs ${span + 2 * margin}px for ${group.length} open triangle heads; has ${extent}px`,
    }]);
    // Preserve the order of the other endpoints to avoid avoidable shaft
    // crossings when ELK's initial classifier contacts arrive out of order.
    const free = group.filter((item) => !item.fixed).sort((left, right) =>
      left.otherCoordinate - right.otherCoordinate ||
      left.route.id.localeCompare(right.route.id));
    const currentFree = group.filter((item) => !item.fixed);
    const orderChanged = free.some((item, index) => item !== currentFree[index]);
    if (!orderChanged && group.every((item, index) => index === 0 ||
      item.coordinate - group[index - 1]!.coordinate >=
        (item.fixed || group[index - 1]!.fixed ? pinnedClearance : spacing))) continue;
    const pinned = group.filter((item) => item.fixed).map((item) => item.coordinate);
    if (pinned.some((point, index) => index > 0 && point - pinned[index - 1]! < pinnedClearance)) {
      throw new SpatialLayoutError([{
        code: 'layout.capability.unsupported', severity: 'error', path: `nodes.${nodeId}`,
        subject: { kind: 'node', id: nodeId! },
        message: `Classifier ${nodeId} ${side} side has overlapping authored open triangle heads`,
      }]);
    }
    if (!free.length) throw new SpatialLayoutError([{
      code: 'layout.capability.unsupported', severity: 'error', path: `nodes.${nodeId}`,
      subject: { kind: 'node', id: nodeId! },
      message: `Classifier ${nodeId} ${side} side has overlapping authored open triangle heads`,
    }]);
    const minimum = origin + margin;
    const maximum = origin + extent - margin;
    const candidates = new Set<number>();
    for (let index = 0; index <= group.length; index += 1) {
      candidates.add(minimum + index * spacing);
      candidates.add(maximum - index * spacing);
      for (const point of pinned) {
        const offset = index === 0 ? 0 : pinnedClearance + (index - 1) * spacing;
        candidates.add(point + offset);
        candidates.add(point - offset);
      }
    }
    for (const item of free) candidates.add(item.coordinate);
    const options = [...candidates].filter((value) => value >= minimum && value <= maximum &&
      pinned.every((point) => Math.abs(value - point) >= pinnedClearance)).sort((a, b) => a - b);
    const back: number[][] = [];
    let costs = options.map((value) => (value - free[0]!.coordinate) ** 2);
    back.push(options.map(() => -1));
    for (let index = 1; index < free.length; index += 1) {
      const next = options.map(() => Number.POSITIVE_INFINITY);
      const parents = options.map(() => -1);
      let previous = 0;
      let best = Number.POSITIVE_INFINITY;
      let bestIndex = -1;
      for (let candidate = 0; candidate < options.length; candidate += 1) {
        while (previous < candidate && options[previous]! <= options[candidate]! - spacing) {
          if (costs[previous]! < best) {
            best = costs[previous]!;
            bestIndex = previous;
          }
          previous += 1;
        }
        if (bestIndex >= 0) {
          next[candidate] = best + (options[candidate]! - free[index]!.coordinate) ** 2;
          parents[candidate] = bestIndex;
        }
      }
      costs = next;
      back.push(parents);
    }
    let selected = costs.indexOf(Math.min(...costs));
    if (selected < 0 || !Number.isFinite(costs[selected])) throw new SpatialLayoutError([{
      code: 'layout.capability.unsupported', severity: 'error', path: `nodes.${nodeId}`,
      subject: { kind: 'node', id: nodeId! },
      message: `Classifier ${nodeId} ${side} side cannot separate ${group.length} open triangle heads while preserving authored contacts`,
    }]);
    const placements = Array<number>(free.length);
    for (let index = free.length - 1; index >= 0; index -= 1) {
      placements[index] = options[selected]!;
      selected = back[index]![selected]!;
    }
    const original = free.map((item) => {
      const section = item.endpoint === 'source' ? item.route.sections[0]!
        : item.route.sections.at(-1)!;
      const contact = item.endpoint === 'source' ? section.startPoint : section.endPoint;
      const bend = item.endpoint === 'source' ? section.bendPoints[0]
        : section.bendPoints.at(-1);
      return { item, contact: { ...contact }, bends: section.bendPoints.map((pt) => ({ ...pt })) };
    });
    let blockedPlacement = false;
    for (const [index, item] of free.entries()) {
      const contact = item.endpoint === 'source' ? item.route.sections[0]!.startPoint
        : item.route.sections.at(-1)!.endPoint;
      if (vertical) contact.y = placements[index]!;
      else contact.x = placements[index]!;
      // Keep the short approach to a newly spaced flat classifier side
      // orthogonal. The original ELK bend still aims at the old contact and
      // otherwise creates a diagonal fan across neighboring heads.
      const section = item.endpoint === 'source' ? item.route.sections[0]!
        : item.route.sections.at(-1)!;
      const bend = item.endpoint === 'source' ? section.bendPoints[0]
        : section.bendPoints.at(-1);
      if (bend) {
        if (vertical) bend.y = contact.y;
        else bend.x = contact.x;
      } else if (vertical && Math.abs(section.startPoint.y - section.endPoint.y) > TOLERANCE) {
        const midX = (section.startPoint.x + section.endPoint.x) / 2;
        section.bendPoints = [{ x: midX, y: section.startPoint.y }, { x: midX, y: section.endPoint.y }];
      } else if (!vertical && Math.abs(section.startPoint.x - section.endPoint.x) > TOLERANCE) {
        const midY = (section.startPoint.y + section.endPoint.y) / 2;
        section.bendPoints = [{ x: section.startPoint.x, y: midY }, { x: section.endPoint.x, y: midY }];
      }
      const neighbor = item.endpoint === 'source'
        ? section.bendPoints[1] ?? section.endPoint
        : section.bendPoints.at(-2) ?? section.startPoint;
      const activeBend = item.endpoint === 'source' ? section.bendPoints[0] : section.bendPoints.at(-1);
      const edge = edges.get(item.route.id)!;
      const blocked = [...rects.values()].some((obstacle) => {
        if (obstacle.id === edge.source || obstacle.id === edge.target ||
          isAncestor(obstacle.id, edge.source, records) ||
          isAncestor(obstacle.id, edge.target, records)) return false;
        const bounds = { x: obstacle.absolutePosition.x - 4,
          y: obstacle.absolutePosition.y - 4,
          width: obstacle.width + 8, height: obstacle.height + 8 };
        return segmentIntersectsBox(contact, activeBend ?? neighbor, bounds) ||
          (activeBend !== undefined && segmentIntersectsBox(activeBend, neighbor, bounds));
      });
      if (blocked) blockedPlacement = true;
    }
    if (blockedPlacement) {
      // Preserve the candidate's already clear routes when moving a triangle
      // head would cut a neighboring node. The original group may be kept
      // only when its marker heads are already visibly separate.
      for (const { item, contact: savedContact, bends: savedBends } of original) {
        const section = item.endpoint === 'source' ? item.route.sections[0]!
          : item.route.sections.at(-1)!;
        const contact = item.endpoint === 'source' ? section.startPoint : section.endPoint;
        contact.x = savedContact.x;
        contact.y = savedContact.y;
        section.bendPoints = savedBends;
      }
      if (orderChanged && group.every((item, index) => index === 0 ||
        item.coordinate - group[index - 1]!.coordinate >=
          (item.fixed || group[index - 1]!.fixed ? pinnedClearance : spacing))) continue;
      throw new SpatialLayoutError([{
        code: 'layout.capability.unsupported', severity: 'error', path: `nodes.${nodeId}`,
        subject: { kind: 'node', id: nodeId! },
        message: `Classifier ${nodeId} ${side} side cannot separate open triangle heads without crossing a node`,
      }]);
    }
  }
}

function publicRects(rects: Map<string, MutableRect>): ResolvedNodeRect[] {
  return [...rects.values()].sort((a, b) => a.id.localeCompare(b.id)).map(({ fixed: _fixed, ...rect }) => rect);
}

function resizeAutoContainers(
  rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>,
  constraints: SpatialConstraint[] = [],
  allowShrink = false,
): boolean {
  const depth = (id: string) => {
    let value = 0;
    let parent = records.get(id)?.parentId;
    while (parent) { value += 1; parent = records.get(parent)?.parentId; }
    return value;
  };
  let changed = false;
  const containers = [...records.values()].filter((record) => record.autoSized)
    .sort((left, right) => depth(right.node.id) - depth(left.node.id));
  for (const record of containers) {
    const rect = rects.get(record.node.id)!;
    const children = [...records.values()].filter((candidate) => candidate.parentId === record.node.id)
      .map((candidate) => rects.get(candidate.node.id)!);
    if (!children.length) continue;
    const minimum = record.node.layoutOptions?.sizeConstraints?.includes('MINIMUM_SIZE')
      ? record.node.layoutOptions.minimumSize
      : undefined;
    const requiredWidth = Math.max(
      minimum?.width ?? DEFAULT_WIDTH,
      boundaryMinimumExtent(record.node.id, 'x', constraints, rects, records),
      ...children.map((child) => child.absolutePosition.x + child.width - rect.absolutePosition.x + record.padding.right),
    );
    const requiredHeight = Math.max(
      minimum?.height ?? DEFAULT_HEIGHT,
      boundaryMinimumExtent(record.node.id, 'y', constraints, rects, records),
      ...children.map((child) => child.absolutePosition.y + child.height - rect.absolutePosition.y + record.padding.bottom),
    );
    const nextWidth = allowShrink ? requiredWidth : Math.max(rect.width, requiredWidth);
    const nextHeight = allowShrink ? requiredHeight : Math.max(rect.height, requiredHeight);
    if (!close(nextWidth, rect.width)) { rect.width = nextWidth; changed = true; }
    if (!close(nextHeight, rect.height)) { rect.height = nextHeight; changed = true; }
  }
  return changed;
}

function containmentSatisfied(rects: Map<string, MutableRect>, records: Map<string, NodeRecord>): boolean {
  for (const rect of rects.values()) {
    const parentId = records.get(rect.id)?.parentId;
    if (!parentId) continue;
    const parent = rects.get(parentId)!;
    const pad = records.get(parentId)!.padding;
    if (rect.absolutePosition.x + TOLERANCE < parent.absolutePosition.x + pad.left
      || rect.absolutePosition.y + TOLERANCE < parent.absolutePosition.y + pad.top
      || rect.absolutePosition.x + rect.width > parent.absolutePosition.x + parent.width - pad.right + TOLERANCE
      || rect.absolutePosition.y + rect.height > parent.absolutePosition.y + parent.height - pad.bottom + TOLERANCE) return false;
  }
  return true;
}

function isAncestor(ancestor: string, node: string, records: Map<string, NodeRecord>): boolean {
  const seen = new Set<string>();
  let parent = records.get(node)?.parentId;
  while (parent && !seen.has(parent)) {
    if (parent === ancestor) return true;
    seen.add(parent);
    parent = records.get(parent)?.parentId;
  }
  return false;
}

function overlappingPairs(rects: Map<string, MutableRect>, records: Map<string, NodeRecord>): Array<[MutableRect, MutableRect]> {
  const values = [...rects.values()].filter((rect) => !records.get(rect.id)?.spatialSynthetic)
    .sort((left, right) => left.id.localeCompare(right.id));
  const out: Array<[MutableRect, MutableRect]> = [];
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      const a = values[left];
      const b = values[right];
      if (isAncestor(a.id, b.id, records) || isAncestor(b.id, a.id, records)) continue;
      const width = Math.min(a.absolutePosition.x + a.width, b.absolutePosition.x + b.width) -
        Math.max(a.absolutePosition.x, b.absolutePosition.x);
      const height = Math.min(a.absolutePosition.y + a.height, b.absolutePosition.y + b.height) -
        Math.max(a.absolutePosition.y, b.absolutePosition.y);
      if (width > TOLERANCE && height > TOLERANCE) out.push([a, b]);
    }
  }
  return out;
}

function repairOverlaps(
  rects: Map<string, MutableRect>, records: Map<string, NodeRecord>, constraints: SpatialConstraint[],
  minimumSeparations: readonly MinimumSeparation028[] = [],
): SpatialLayoutDiagnostic[] {
  const diagnostics: SpatialLayoutDiagnostic[] = [];
  const repairedSeparations = [...minimumSeparations];
  for (let pass = 0; pass < rects.size; pass += 1) {
    const overlaps = overlappingPairs(rects, records);
    if (!overlaps.length) return diagnostics;
    let moved = false;
    for (const [left, right] of overlaps) {
      if (left.fixed && right.fixed) continue;
      let best: { rects: Map<string, MutableRect>; overlaps: number; separation: MinimumSeparation028 } | undefined;
      for (const moving of [right, left]) {
        if (moving.fixed) continue;
        const stationary = moving.id === right.id ? left : right;
        for (const axis of ['x', 'y'] as const) for (const after of [true, false]) {
          const trial = cloneRects(rects);
          const trialMoving = trial.get(moving.id)!;
          const trialStationary = trial.get(stationary.id)!;
          const next = trialStationary.absolutePosition[axis] + (after
            ? (axis === 'x' ? trialStationary.width : trialStationary.height) + 1
            : -(axis === 'x' ? trialMoving.width : trialMoving.height) - 1);
          const separation = { before: after ? stationary.id : moving.id,
            after: after ? moving.id : stationary.id, axis, gap: 1 };
          // A candidate coordinate is only a continuity preference. Carry the
          // proposed repair into witness feasibility so a degenerate graph
          // extremum cannot collapse the pair together again.
          if (!moveAbsolute(trialMoving, axis, next, trial, records) ||
              !differenceFeasible(constraints, trial, records, true, { containAutoSized: false,
                minimumSeparations: [...repairedSeparations, separation],
                preserveNonnegativeOrigins: minimumSeparations.length > 0 })) continue;
          const count = overlappingPairs(trial, records).length;
          if (!best || count < best.overlaps) best = { rects: trial, overlaps: count, separation };
        }
      }
      if (best) {
        rects.clear();
        for (const [id, rect] of best.rects) rects.set(id, rect);
        repairedSeparations.push(best.separation);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const remaining = overlappingPairs(rects, records);
  const avoidable = remaining.filter(([left, right]) => !(left.fixed && right.fixed));
  if (avoidable.length) throw new SpatialLayoutError([{
    code: 'layout.constraint.required-unsatisfied', severity: 'error',
    message: `Constraint repair left avoidable overlap between ${avoidable[0][0].id} and ${avoidable[0][1].id}`,
    path: 'nodes',
  }]);
  for (const [left, right] of remaining) diagnostics.push({
    code: 'layout.constraint.overlap-forced', severity: 'warning',
    message: `Authored exact or pinned geometry forces overlap between "${left.id}" and "${right.id}"`,
    path: `nodes.${left.id}`,
    subject: { kind: 'node', id: left.id },
  });
  return diagnostics;
}

export function canPublishResolvedLayout(result: ResolvedLayout, currentRevision: string): boolean {
  return result.revision === currentRevision && !result.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function proximityEdges028(graph: GraphIR): GraphEdge[] {
  return graph.edges.filter((edge) => edge.source !== edge.target && edgeProximity028(edge) > 1)
    .sort((a, b) => edgeProximity028(b) - edgeProximity028(a) || a.id.localeCompare(b.id));
}
function proximitySeparation028(edge: GraphEdge, rects: Map<string, MutableRect>,
  direction: LayoutDirection, baseline: number): MinimumSeparation028 | undefined {
  const a = rects.get(edge.source), b = rects.get(edge.target);
  if (!a || !b) return undefined;
  let axis: 'x' | 'y' = direction === 'RIGHT' || direction === 'LEFT' ? 'x' : 'y';
  if (Math.abs(centre(a)[axis] - centre(b)[axis]) < TOLERANCE) axis = axis === 'x' ? 'y' : 'x';
  const before = centre(a)[axis] <= centre(b)[axis] ? a : b;
  return { before: before.id, after: before === a ? b.id : a.id, axis,
    gap: proximityClearance028(baseline, edgeProximity028(edge)) };
}

function proximityProtections028(graph: GraphIR, rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>, baseline: number): MinimumSeparation028[] {
  const separations: MinimumSeparation028[] = [];
  const connected = new Set(graph.edges.flatMap((edge) =>
    [`${edge.source}\0${edge.target}`, `${edge.target}\0${edge.source}`]));
  const values = [...rects.values()];
  // Preserve one existing separating axis for every unrelated pair, so a
  // successful hint cannot move a node into another node or a sibling group.
  for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) {
    const a = values[i], b = values[j];
    if (isAncestor(a.id, b.id, records) || isAncestor(b.id, a.id, records)) continue;
    for (const axis of ['x', 'y'] as const) {
      const size = axis === 'x' ? 'width' : 'height';
      if (a.absolutePosition[axis] + a[size] <= b.absolutePosition[axis] + TOLERANCE) {
        const gap = connected.has(`${a.id}\0${b.id}`)
          ? Math.min(baseline, Math.max(0, b.absolutePosition[axis] - a.absolutePosition[axis] - a[size])) : 0;
        separations.push({ before: a.id, after: b.id, axis, gap }); break;
      }
      if (b.absolutePosition[axis] + b[size] <= a.absolutePosition[axis] + TOLERANCE) {
        const gap = connected.has(`${a.id}\0${b.id}`)
          ? Math.min(baseline, Math.max(0, a.absolutePosition[axis] - b.absolutePosition[axis] - b[size])) : 0;
        separations.push({ before: b.id, after: a.id, axis, gap }); break;
      }
    }
  }
  return separations;
}

/** Check every affected generated connector, including unhinted edges. */
function generatedRoutesClear028(graph: GraphIR, routes: ResolvedEdgeRoute[],
  rects: Map<string, MutableRect>, records: Map<string, NodeRecord>): boolean {
  return !routes.some((route) => {
    const edge = graph.edges.find((edge) => edge.id === route.id)!;
    if (edge.routeIntent) return false;
    return [...rects.values()].some((obstacle) => {
      if (obstacle.id === edge.source || obstacle.id === edge.target ||
        isAncestor(obstacle.id, edge.source, records) || isAncestor(obstacle.id, edge.target, records)) return false;
      return route.sections.some((section) => {
        const points = [section.startPoint, ...section.bendPoints, section.endPoint];
        return occupiedBoxes(obstacle, records, 2).some((bounds) => points.some((point, index) =>
          index > 0 && segmentIntersectsBox(points[index - 1]!, point, bounds)));
      });
    });
  });
}

/** Add separation only, without the perpendicular alignment of a relative
 * authored constraint. Every trial preserves stronger accepted intent. */
function applyProximity028(graph: GraphIR, rects: Map<string, MutableRect>,
  records: Map<string, NodeRecord>, constraints: SpatialConstraint[],
  direction: LayoutDirection, baseline: number): SpatialLayoutDiagnostic[] {
  const hints = proximityEdges028(graph);
  if (!hints.length) return [];
  const separations = proximityProtections028(graph, rects, records, baseline);
  const diagnostics: SpatialLayoutDiagnostic[] = [];
  for (const edge of hints) {
    const preference = proximitySeparation028(edge, rects, direction, baseline);
    if (!preference) continue;
    const trial = cloneRects(rects);
    const candidates = [...separations, preference];
    if (!isAncestor(edge.source, edge.target, records) && !isAncestor(edge.target, edge.source, records)
      && differenceFeasible(constraints, trial, records, true, { minimumSeparations: candidates })
      && containmentSatisfied(trial, records)
      && constraints.every((constraint) => constraintSatisfied(constraint, trial, records))
      && overlappingPairs(trial, records).length <= overlappingPairs(rects, records).length) {
      separations.push(preference);
      replaceRects(rects, trial);
    } else diagnostics.push({ code: 'layout.proximity.rejected', severity: 'warning',
      message: `Edge "${edge.id}" proximity tier ${edgeProximity028(edge)} yields to stronger geometry or constraints`,
      path: `edges.${edge.id}.proximityHint`, subject: { kind: 'edge', id: edge.id } });
  }
  return diagnostics;
}

/** Reserve measured label room before asking ELK for generated positions.
 * Horizontal automatic labels need a clear gap between columns; exact labels
 * also need room for their authored fraction and offset. Authored positions,
 * pins, constraints and routes remain authoritative. */
export function authoredLabelLayerSpacing028(graph: Pick<GraphIR, 'edges' | 'nodes'>, direction: LayoutDirection,
  sceneOptions: SvgOptions = {}): number {
  let spacing = 0;
  const nodeById = new Map<string, GraphNode>();
  const visit = (nodes: GraphNode[]) => { for (const node of nodes) { nodeById.set(node.id, node); visit(node.children ?? []); } };
  visit(graph.nodes);
  const horizontal = direction === 'RIGHT' || direction === 'LEFT';
  const styles = sceneOptions.style
    ? [sceneOptions.style] : ['lowfi', 'hifi'] as const;
  for (const style of styles) {
    const options = { ...sceneOptions, style };
    const font = resolveSvgNodeFont(undefined, options);
    if (!font) continue;
    for (const edge of graph.edges) {
      if (!edge.label || edge.routeIntent) continue;
      if (!edge.labelPlacement) {
        if (horizontal && edge.source !== edge.target) {
          const measured = measureEdgeLabel028({ text: edge.label, fontFamily: font.cssFamily,
            fontSize: font.size, fontWeight: font.weight, lineHeight: font.lineHeight });
          spacing = Math.max(spacing, Math.ceil(measured.width + 48));
        }
        continue;
      }
      const fraction = Math.min(edge.labelPlacement.at ?? .5, 1 - (edge.labelPlacement.at ?? .5));
      if (fraction <= 0) continue;
      const measured = measureEdgeLabel028({ text: edge.label, fontFamily: font.cssFamily,
        fontSize: font.size, fontWeight: font.weight, lineHeight: font.lineHeight });
      // Include the conservative endpoint-marker envelope used by the scene.
      const reversed = direction === 'LEFT' || direction === 'UP';
      const negative = horizontal ? 'left' : 'above';
      const positive = horizontal ? 'right' : 'below';
      const forward = reversed ? negative : positive;
      const backward = reversed ? positive : negative;
      const extent = horizontal ? measured.width : measured.height;
      const offset = edge.labelPlacement.offset ?? 0;
      const leading = edge.labelPlacement.side === backward ? extent + offset
        : edge.labelPlacement.side === forward ? 0 : extent / 2;
      const trailing = edge.labelPlacement.side === forward ? extent + offset
        : edge.labelPlacement.side === backward ? 0 : extent / 2;
      const captionOutset = (id: string, side: string) => {
        const node = nodeById.get(id);
        if (node?.labelPlacement?.side !== side || node.label === '') return 0;
        const nodeFont = resolveSvgNodeFont(node, options)!;
        const caption = measureEdgeLabel028({ text: node.label ?? node.id, fontFamily: nodeFont.cssFamily,
          fontSize: nodeFont.size, fontWeight: nodeFont.weight, lineHeight: nodeFont.lineHeight });
        return (horizontal ? caption.width : caption.height) + (node.labelPlacement.offset ?? 0);
      };
      const at = edge.labelPlacement.at ?? .5;
      const required = Math.max(
        (Math.max(leading, 24) + captionOutset(edge.source, forward)) / at,
        (Math.max(trailing, 24) + captionOutset(edge.target, backward)) / (1 - at));
      if (Number.isFinite(required)) spacing = Math.max(spacing, Math.ceil(required));
    }
  }
  return spacing;
}

/** One affine geometry phase: node frames and independently movable labels
 * share the existing complete difference-constraint oracle. Route rectangles
 * retain all authored anchors; nonlinear authored edge-label feedback is
 * diagnosed if the finite dependency iteration cannot reach a verified state. */
function resolveTypedGeometry028(typed: SpatialConstraint028[], graph: GraphIR,
  actual: Map<string, MutableRect>, records: Map<string, NodeRecord>, initialEdges: ResolvedEdgeRoute[],
  options: SpatialLayoutRequest['proximitySceneOptions'], legacy: SpatialConstraint[],
  direction: LayoutDirection, proximityBaseline: number, routingStyle?: 'orthogonal' | 'polyline',
  authoredRoutingStyle?: 'orthogonal' | 'polyline') {
  const required = typed.filter((item) => item.strength !== 'preferred');
  const requiredLegacy = legacy.filter((item) => item.strength !== 'preferred');
  const initial = cloneRects(actual);
  const cloneEdges = (edges: ResolvedEdgeRoute[]) => edges.map((edge) => ({ ...edge,
    waypointIds: [...edge.waypointIds], sections: edge.sections.map((section) => ({ startPoint: { ...section.startPoint },
      endPoint: { ...section.endPoint }, bendPoints: section.bendPoints.map((p) => ({ ...p })) })) }));
  const attempt = (constraints: SpatialConstraint028[], preserveSceneFailure = false,
    legacyConstraints = requiredLegacy, minimumSeparations: readonly MinimumSeparation028[] = [],
    candidate?: { nodes: Map<string, MutableRect>; edges: ResolvedEdgeRoute[]; labels: NonNullable<ResolvedLayout['labelBounds028']> }) => {
    const references = new Map(constraints.flatMap(spatialConstraintReferences028).map((ref) => [spatialReferenceKey028(ref), ref]));
    const dependencies = new Map<string, Set<string>>();
    for (const constraint of constraints) {
      const keys = spatialConstraintReferences028(constraint).map(spatialReferenceKey028);
      for (const key of keys) {
        const peers = dependencies.get(key) ?? new Set<string>();
        for (const peer of keys) if (peer !== key) peers.add(peer);
        dependencies.set(key, peers);
      }
    }
    const reaches = (start: string, targets: Set<string>, seen = new Set<string>()): boolean => {
      if (targets.has(start)) return true;
      if (seen.has(start)) return false; seen.add(start);
      return [...dependencies.get(start) ?? []].some((next) => reaches(next, targets, seen));
    };
    for (const edge of graph.edges) if (edge.labelPlacement) {
      const points = initialEdges.find((route) => route.id === edge.id)?.sections.flatMap((section) =>
        [section.startPoint, ...section.bendPoints, section.endPoint]) ?? [];
      const unique = points.filter((p, i) => !i || !close(p.x, points[i - 1]!.x) || !close(p.y, points[i - 1]!.y));
      const at = edge.labelPlacement.at ?? .5;
      if (unique.length > 2 && at !== 0 && at !== 1 && reaches(`edge-label:${edge.id}`, new Set([edge.source, edge.target])))
        throw new SpatialLayoutError([{ code: 'layout.constraint.dependency-unsupported', severity: 'error',
          message: `Unsupported nonlinear dependency cycle for edge "${edge.id}" arc-label placement`, path: `edges.${edge.id}.labelPlacement` }]);
    }
    const nodeRects = cloneRects(candidate?.nodes ?? initial);
    let routes = cloneEdges(candidate?.edges ?? initialEdges);
    let labels: NonNullable<ResolvedLayout['labelBounds028']> = { ...candidate?.labels };
    for (let pass = 0; pass <= references.size + records.size + 2; pass++) {
      const rects = cloneRects(nodeRects); const indexed = new Map(records);
      // A boundary constrains the actual centerline envelope. Generated bends
      // are independent degrees of freedom; shrinking their envelope must not
      // translate endpoint contacts or authored waypoint equations.
      for (const constraint of constraints) if (constraint.kind === 'boundary' && constraint.subject.kind === 'edge') {
        const edgeId = constraint.subject.edgeId;
        const edge = graph.edges.find((edge) => edge.id === edgeId);
        const route = routes.find((route) => route.id === edge?.id);
        if (!edge || !route || edge.routeIntent) continue;
        const bounds = scopeBounds(constraint.scope, nodeRects, records);
        if (!bounds) return undefined;
        const pad = constraint.scope.kind === 'node' ? records.get(constraint.scope.nodeId)?.padding ?? zeroPadding() : zeroPadding();
        const inset = constraint.inset ?? 0;
        const left = bounds.left + pad.left + inset, top = bounds.top + pad.top + inset;
        const right = bounds.right - pad.right - inset, bottom = bounds.bottom - pad.bottom - inset;
        if (left > right || top > bottom) return undefined;
        const generated = route.sections.flatMap((section) => section.bendPoints);
        if (!generated.length && route.sections.length) {
          const section = route.sections[0]!;
          section.bendPoints.push({ x: (section.startPoint.x + section.endPoint.x) / 2,
            y: (section.startPoint.y + section.endPoint.y) / 2 });
          generated.push(section.bendPoints[0]!);
        }
        for (const point of generated) { point.x = Math.max(left, Math.min(right, point.x)); point.y = Math.max(top, Math.min(bottom, point.y)); }
        const trailing = constraint.side === 'right' || constraint.side === 'bottom';
        // Distinct leading/trailing witnesses let opposite boundary equations
        // expand or shrink the generated envelope independently.
        if (generated.length === 1 && constraints.some((other) => other !== constraint && other.kind === 'boundary' &&
          other.subject.kind === 'edge' && other.subject.edgeId === edge.id && other.side !== constraint.side)) {
          const point = { ...generated[0]! }; route.sections.at(-1)!.bendPoints.push(point); generated.push(point);
        }
        const witness = trailing ? generated.at(-1) : generated[0];
        if (witness) {
          if (constraint.side === 'left') witness.x = left;
          else if (constraint.side === 'right') witness.x = right;
          else if (constraint.side === 'top') witness.y = top;
          else witness.y = bottom;
        }
      }
      const routeById = new Map(routes.map((route) => [route.id, route]));
      const synthetic = new Map<string, { x: number; y: number; width: number; height: number }>();
      for (const [key, ref] of references) {
        if (ref.kind === 'node') { if (!rects.has(ref.nodeId)) return undefined; continue; }
        const ownerNode = 'nodeId' in ref ? records.get(ref.nodeId)?.node : undefined;
        const ownerEdge = 'edgeId' in ref ? graph.edges.find((edge) => edge.id === ref.edgeId) : undefined;
        const route = ownerEdge ? routeById.get(ownerEdge.id) : undefined;
        const points = route?.sections.flatMap((section, index) => index ? [...section.bendPoints, section.endPoint] :
          [section.startPoint, ...section.bendPoints, section.endPoint]) ?? [];
        let box: { x: number; y: number; width: number; height: number };
        let binding: NodeRecord['binding']; let linearBinding: NodeRecord['linearBinding']; let fixedPoints: Point[] | undefined; let fixed = false;
        if (ref.kind === 'edge') {
          if (!points.length) return undefined;
          const x = Math.min(...points.map((p) => p.x)); const y = Math.min(...points.map((p) => p.y));
          box = { x, y, width: Math.max(...points.map((p) => p.x)) - x, height: Math.max(...points.map((p) => p.y)) - y };
          fixedPoints = ownerEdge?.routeIntent ? points : [points[0]!, points.at(-1)!];
        } else {
          const owner = ownerNode ?? ownerEdge;
          if (!owner?.label || ownerNode?.classifier) return undefined;
          const font = resolveSvgNodeFont(ownerNode, { notation: effectiveGraphNotationId028(graph), ...options });
          const measured = measureEdgeLabel028({ text: owner.label, fontFamily: font?.cssFamily,
            fontSize: font?.size, fontWeight: font?.weight, lineHeight: font?.lineHeight });
          if (ref.kind === 'node-label') {
            const ownerRect = nodeRects.get(ref.nodeId)!;
            const frame = { ...ownerRect.absolutePosition, width: ownerRect.width, height: ownerRect.height };
            box = authoredNodeLabelBox028(frame, ownerNode?.labelPlacement ?? { side: 'center' }, measured.width, measured.height);
            if (ownerNode?.labelPlacement) binding = { ownerId: ref.nodeId,
              offset: { x: box.x - frame.x, y: box.y - frame.y } };
          } else {
            if (!points.length) return undefined;
            box = authoredEdgeLabelBox028(points, ownerEdge?.labelPlacement ?? { side: 'above', offset: 8 }, measured.width, measured.height);
            fixed = Boolean(ownerEdge?.labelPlacement);
            const at = ownerEdge?.labelPlacement?.at ?? .5;
            // Arc length on one straight segment is affine in its fixed-side
            // endpoint contacts. Endpoint fractions 0/1 are affine on any path.
            if (ownerEdge?.labelPlacement && (points.length === 2 || at === 0 || at === 1)) {
              const source = nodeRects.get(ownerEdge.source)!; const target = nodeRects.get(ownerEdge.target)!;
              const weights = [{ id: ownerEdge.source, weight: 1 - at }, { id: ownerEdge.target, weight: at }];
              linearBinding = { owners: weights, offset: {
                x: box.x - (1 - at) * source.absolutePosition.x - at * target.absolutePosition.x,
                y: box.y - (1 - at) * source.absolutePosition.y - at * target.absolutePosition.y,
              } };
              fixed = false;
            }
          }
          if (!binding && !linearBinding && !fixed && labels[key]) box = labels[key]!;
        }
        synthetic.set(key, box);
        rects.set(key, { id: key, position: { x: box.x, y: box.y }, absolutePosition: { x: box.x, y: box.y },
          width: box.width, height: box.height, fixed });
        indexed.set(key, { node: { id: key, type: 'node' }, direction: 'RIGHT', padding: zeroPadding(), autoSized: false, spatialSynthetic: true,
          ...(binding ? { binding } : {}), ...(linearBinding ? { linearBinding } : {}), ...(fixedPoints ? { fixedPoints } : {}) });
      }
      const all = [...legacyConstraints, ...constraints.map(nodeConstraint028)];
      fitAutoContainersForConstraints(all, rects, indexed, minimumSeparations);
      if (!differenceFeasible(all, rects, indexed, true, { minimumSeparations })) return undefined;
      let overlapDiagnostics: SpatialLayoutDiagnostic[];
      try { overlapDiagnostics = repairOverlaps(rects, indexed, all, minimumSeparations); }
      catch (error) { if (error instanceof SpatialLayoutError) return undefined; throw error; }
      if (!containmentSatisfied(rects, indexed) || !all.every((c) => constraintSatisfied(c, rects, indexed))) return undefined;
      const movedNodes = [...nodeRects.keys()].some((id) => !close(rects.get(id)!.absolutePosition.x, nodeRects.get(id)!.absolutePosition.x) ||
        !close(rects.get(id)!.absolutePosition.y, nodeRects.get(id)!.absolutePosition.y));
      for (const id of nodeRects.keys()) nodeRects.set(id, rects.get(id)!);
      labels = {};
      for (const [key, ref] of references) if (ref.kind === 'node-label' || ref.kind === 'edge-label') {
        const r = rects.get(key)!; labels[key] = { ...r.absolutePosition, width: r.width, height: r.height };
      }
      if (movedNodes) routes = graph.edges.map((edge) => edge.routeIntent ? routeEdge(edge, nodeRects, records, 0) :
        candidateRoute(edge, routeById.get(edge.id)?.sections ?? [], nodeRects, records, 0));
      else routes = routes.map((route) => {
        const key = `edge:${route.id}`; const next = rects.get(key); const before = synthetic.get(key);
        if (!next || !before || graph.edges.find((edge) => edge.id === route.id)?.routeIntent) return route;
        const dx = next.absolutePosition.x - before.x; const dy = next.absolutePosition.y - before.y;
        return { ...route, sections: route.sections.map((section, i, sections) => ({
          startPoint: i === 0 ? section.startPoint : { x: section.startPoint.x + dx, y: section.startPoint.y + dy },
          endPoint: i === sections.length - 1 ? section.endPoint : { x: section.endPoint.x + dx, y: section.endPoint.y + dy },
          bendPoints: section.bendPoints.map((p) => ({ x: p.x + dx, y: p.y + dy })) })) };
      });
      try { validateFinalRoutes028(graph, routes, nodeRects, records, routingStyle, options, authoredRoutingStyle); }
      catch (error) { if (error instanceof SpatialLayoutError) return undefined; throw error; }
      if (minimumSeparations.length && !generatedRoutesClear028(graph, routes, nodeRects, records)) return undefined;
      const finalBoxes = new Map([...nodeRects].map(([id, r]) => [id, { ...r.absolutePosition, width: r.width, height: r.height }]));
      for (const [key, box] of Object.entries(labels)) finalBoxes.set(key, box);
      for (const route of routes) {
        const points = route.sections.flatMap((s) => [s.startPoint, ...s.bendPoints, s.endPoint]);
        if (!points.length) continue;
        const x = Math.min(...points.map((p) => p.x)), y = Math.min(...points.map((p) => p.y));
        finalBoxes.set(`edge:${route.id}`, { x, y, width: Math.max(...points.map((p) => p.x)) - x,
          height: Math.max(...points.map((p) => p.y)) - y });
      }
      // Explicit edge labels are equations on the actual final route, not
      // arbitrary fixed rectangles retained from an earlier routing phase.
      let stable = true;
      for (const [key, ref] of references) if (ref.kind === 'node-label') {
        const node = records.get(ref.nodeId)!.node;
        if (!node.labelPlacement) continue;
        const owner = nodeRects.get(ref.nodeId)!; const label = labels[key]!;
        const expected = authoredNodeLabelBox028({ ...owner.absolutePosition, width: owner.width, height: owner.height },
          node.labelPlacement, label.width, label.height);
        if (!close(expected.x, label.x) || !close(expected.y, label.y)) stable = false;
        finalBoxes.set(key, expected);
      }
      for (const [key, ref] of references) if (ref.kind === 'edge-label') {
        const edge = graph.edges.find((edge) => edge.id === ref.edgeId)!;
        if (!edge.labelPlacement) continue;
        const route = routes.find((route) => route.id === edge.id)!;
        const points = route.sections.flatMap((s, i) => i ? [...s.bendPoints, s.endPoint] : [s.startPoint, ...s.bendPoints, s.endPoint]);
        const label = labels[key]!;
        const final = authoredEdgeLabelBox028(points, edge.labelPlacement, label.width, label.height);
        if (!close(final.x, label.x) || !close(final.y, label.y)) stable = false;
        finalBoxes.set(key, final);
      }
      if (stable && !verifySpatialConstraints028(graph, finalBoxes, constraints).length &&
        legacyConstraints.every((c) => constraintSatisfied(c, nodeRects, records)) &&
        minimumSeparations.every(({ before, after, axis, gap }) => {
          const a = nodeRects.get(before)!, b = nodeRects.get(after)!;
          return a.absolutePosition[axis] + (axis === 'x' ? a.width : a.height) + gap <= b.absolutePosition[axis] + TOLERANCE;
        })) {
        // A preference commits the complete verified state, including route and
        // label clearance, rather than just its rectangle inequalities.
        const nodes = [...records].map(([id, { node }]) => {
          const rest = { ...node }; delete rest.children; const rect = nodeRects.get(id)!;
          return { ...rest, position: rect.absolutePosition, dimensions: { width: rect.width, height: rect.height } };
        });
        const needsPaintAdmission = options !== undefined || references.size > 0 &&
          [...references.values()].some(ref => ref.kind !== 'node') ||
          graph.edges.some(edge => edge.labelPlacement) || [...records.values()].some(record => record.node.labelPlacement);
        try { if (needsPaintAdmission) prepareSpatialScene028({ ...graph, nodes }, { ...options, labelBounds028: labels,
          edgeRoutes: new Map(routes.map((route) => [route.id, route.sections])), semanticGraph: graph }); }
        catch (error) {
          if (error instanceof RenderCapabilityError && !preserveSceneFailure) return undefined;
          throw error;
        }
        return { nodes: nodeRects, edges: routes, labels, diagnostics: overlapDiagnostics };
      }
    }
    throw new SpatialLayoutError([{ code: 'layout.capability.unsupported', severity: 'error',
      message: 'The finite route geometry resolver could not realize and verify the requested rectangle equations', path: 'constraints' }]);
  };
  // Authored gaps are lower bounds. Prefer enough visible shaft for connected
  // neighbours while retaining every required equation, pin and containment.
  const generatedEdges = graph.edges.filter(edge => !edge.routeIntent);
  const connected = new Set(generatedEdges.flatMap(edge =>
    [`${edge.source}\0${edge.target}`, `${edge.target}\0${edge.source}`]));
  let readableSeparations: MinimumSeparation028[] = [];
  const addReadable = (before: string, after: string, axis: 'x' | 'y', gap = 0) => {
    if (connected.has(`${before}\0${after}`) && gap < proximityBaseline)
      readableSeparations.push({ before, after, axis, gap: proximityBaseline });
  };
  for (const constraint of [...requiredLegacy, ...required.map(nodeConstraint028)]) {
    if (constraint.kind === 'arrangement') {
      const ids = constraint.subjects.map(subject => subject.nodeId);
      if (constraint.direction === 'reverse') ids.reverse();
      // A connector that skips a subject still needs room to leave and
      // rejoin beside that subject. Count the edges spanning each gap.
      const positions = new Map(ids.map((id, index) => [id, index]));
      const crossings = Array<number>(ids.length + 1).fill(0);
      for (const edge of generatedEdges) {
        const source = positions.get(edge.source), target = positions.get(edge.target);
        if (source === undefined || target === undefined || source === target) continue;
        crossings[Math.min(source, target) + 1]++;
        crossings[Math.max(source, target) + 1]--;
      }
      let crossing = 0;
      for (let index = 1; index < ids.length; index++) {
        crossing += crossings[index]!;
        if (crossing > 0 && (constraint.gap ?? 0) < proximityBaseline) readableSeparations.push({
          before: ids[index - 1]!, after: ids[index]!, axis: constraint.axis === 'row' ? 'x' : 'y', gap: proximityBaseline,
        });
      }
    } else if (constraint.kind === 'relative') {
      const before = constraint.relation === 'left-of' || constraint.relation === 'above';
      addReadable(before ? constraint.subject.nodeId : constraint.target.nodeId,
        before ? constraint.target.nodeId : constraint.subject.nodeId,
        constraint.relation === 'left-of' || constraint.relation === 'right-of' ? 'x' : 'y', constraint.gap);
    }
  }
  let state: ReturnType<typeof attempt>;
  if (readableSeparations.length) {
    try { state = attempt(required, false, requiredLegacy, readableSeparations); }
    catch (error) { if (!(error instanceof SpatialLayoutError || error instanceof RenderCapabilityError)) throw error; }
    if (!state) readableSeparations = [];
  }
  state ??= attempt(required, true);
  if (!state) throw new SpatialLayoutError(required.map((constraint) => ({ code: 'layout.constraint.required-unsatisfied',
    severity: 'error', message: `Required constraint "${constraint.id}" cannot be satisfied with its measured rectangles and fixed anchors`,
    path: `constraints.${constraint.id}` })));
  const accepted = [...required]; const rejected: string[] = []; const diagnostics: SpatialLayoutDiagnostic[] = [];
  const acceptedLegacy = [...requiredLegacy];
  // Both carriers share one strength hierarchy. Legacy authored preferences
  // precede typed preferences when an API caller supplies both representations.
  for (const { constraint: preference, isLegacy } of [
    ...legacy.filter((item) => item.strength === 'preferred').map((constraint) => ({ constraint, isLegacy: true })),
    ...typed.filter((item) => item.strength === 'preferred').map((constraint) => ({ constraint, isLegacy: false })),
  ]) {
    const nextTyped = isLegacy ? accepted : [...accepted, preference as SpatialConstraint028];
    const nextLegacy = isLegacy ? [...acceptedLegacy, preference as SpatialConstraint] : acceptedLegacy;
    let trial: ReturnType<typeof attempt>;
    try { trial = attempt(nextTyped, false, nextLegacy, readableSeparations); } catch (error) { if (!(error instanceof SpatialLayoutError)) throw error; }
    if (!trial && readableSeparations.length) {
      // Authored preferences outrank automatic breathing room. Retry their
      // complete geometry before deciding that the preference must yield.
      try { trial = attempt(nextTyped, false, nextLegacy); }
      catch (error) { if (!(error instanceof SpatialLayoutError)) throw error; }
      if (trial) readableSeparations = [];
    }
    if (trial) { state = trial;
      if (isLegacy) acceptedLegacy.push(preference as SpatialConstraint); else accepted.push(preference as SpatialConstraint028); }
    else { rejected.push(preference.id); diagnostics.push({ code: 'layout.constraint.preferred-rejected', severity: 'warning',
      message: `Preferred constraint "${preference.id}" yields to required geometry`, path: `constraints.${preference.id}` }); }
  }
  // Proximity is admitted last against the complete accepted geometry. Every
  // trial reroutes and validates labels atomically, retaining earlier hints.
  const separations = [...readableSeparations, ...proximityProtections028(graph, state.nodes, records, proximityBaseline)];
  for (const edge of proximityEdges028(graph)) {
    const separation = proximitySeparation028(edge, state.nodes, direction, proximityBaseline);
    if (!separation) continue;
    let trial: ReturnType<typeof attempt>;
    if (!isAncestor(edge.source, edge.target, records) && !isAncestor(edge.target, edge.source, records)) {
      try { trial = attempt(accepted, false, acceptedLegacy, [...separations, separation], state); }
      catch (error) { if (!(error instanceof SpatialLayoutError)) throw error; }
    }
    if (trial) { state = trial; separations.push(separation); }
    else diagnostics.push({ code: 'layout.proximity.rejected', severity: 'warning',
      message: `Edge "${edge.id}" proximity tier ${edgeProximity028(edge)} yields to accepted geometry, routes or labels`,
      path: `edges.${edge.id}.proximityHint`, subject: { kind: 'edge', id: edge.id } });
  }
  replaceRects(actual, state.nodes);
  return { edges: state.edges, labels: state.labels, accepted: [...acceptedLegacy, ...accepted].map(({ id }) => id), rejected,
    diagnostics: [...diagnostics, ...state.diagnostics] };
}

/** Keep repaired middle legs outside both endpoint frames. Contacts may lie
 * inside aspect-fitted outer boxes; outward escape legs keep them exact. */
/** Side exits at a captioned icon glyph's mid-height, nearest side first. */
function captionSideExits029(rect: MutableRect, records: Map<string, NodeRecord>, toward: Point):
  Array<{ point: Point; outward: 'left' | 'right' }> {
  const record = records.get(rect.id);
  const symbolId = record && renderSymbolId(record.node, record.notationId, record.catalog);
  const shapeId = symbolId ? catalogSymbol029(symbolId, record?.catalog)?.shape : undefined;
  const shape = shapeId ? catalogShape029(shapeId, record?.catalog) : undefined;
  const ctx = record ? { notationId: record.notationId, symbolId, layoutDirection: record.direction } : undefined;
  if (!shape || !stencilCaptionHeight028(shape.id, ctx)) return [];
  const fit = stencilFit028(shape, rect.width, rect.height, ctx);
  const middle = rect.absolutePosition.y + fit.offsetY + fit.fittedHeight / 2;
  const exits = (['left', 'right'] as const).flatMap((outward) => {
    const beyond = { x: outward === 'left' ? rect.absolutePosition.x - 1 : rect.absolutePosition.x + rect.width + 1, y: middle };
    const point = laneAxisPoint029(rect, beyond, 'y', undefined, records);
    return point ? [{ point, outward }] : [];
  });
  return exits.sort((a, b) => Math.abs(a.point.x - toward.x) - Math.abs(b.point.x - toward.x));
}

function repairGeneratedRoute028(edge: GraphEdge, route: ResolvedEdgeRoute, graph: GraphIR,
  rects: Map<string, MutableRect>, records: Map<string, NodeRecord>,
  obstacles: Array<{ id: string; x: number; y: number; width: number; height: number }>,
  routingStyle?: 'orthogonal' | 'polyline', sceneOptions?: SpatialLayoutRequest['proximitySceneOptions']): void {
  const start = route.sections[0]!.startPoint; const end = route.sections.at(-1)!.endPoint;
  const currentNodes = (nodes: GraphNode[]): GraphNode[] => nodes.map((node) => ({
    ...(records.get(node.id)?.node ?? node),
    ...(node.children ? { children: currentNodes(node.children) } : {}),
  }));
  const contacts = resolveRouteContacts({ ...graph, nodes: currentNodes(graph.nodes), edges: [edge] }, publicRects(rects), {
    direction: records.get(edge.source)?.direction, waypoints: new Map([[edge.id, [start, end]]]),
    ...(records.get(edge.source)?.catalog ? { documentCatalog029: records.get(edge.source)!.catalog } : {}),
  }).get(edge.id)!;
  const source = rects.get(edge.source)!; const target = rects.get(edge.target)!;
  // A body-clear repair may still cut through an endpoint's external caption
  // or a containing group's header. These measured ink boxes are obstacles
  // throughout the middle path, not just on its first and last segments.
  const captions = [...rects.values()].flatMap((rect) => {
    const caption = nodeCaptionBox028(rect, records);
    return caption && caption.width > 0 && caption.height > 0
      ? [{ ...caption, id: `${rect.id}:caption` }] : [];
  });
  // Preserve an already clear caption corridor when only its terminal join
  // needs an elbow. Exact edge-label placement keeps the global repair path.
  if (!edge.labelPlacement) for (const candidate of terminalElbowCandidates(route.sections)) {
    if (validateRouteSections(candidate, { sourcePoint: start, targetPoint: end,
      sourceDirection: contacts.sourceDirection, targetDirection: contacts.targetDirection,
      obstacles: [...obstacles, ...captions], routingStyle: routingStyle ?? 'orthogonal' }).length) continue;
    try {
      validateRouteGeometryAtNodes(graph, publicRects(rects), new Map([[edge.id, candidate]]),
        records.get(edge.source)?.direction, records.get(edge.source)?.catalog);
    } catch (error) { if (error instanceof RenderCapabilityError) continue; throw error; }
    route.sections = candidate;
    return;
  }
  const labelSizes = edge.labelPlacement && edge.label ? (['lowfi', 'hifi'] as const).map((style) => {
    const font = resolveSvgNodeFont(undefined, { ...sceneOptions, style });
    return measureEdgeLabel028({ text: edge.label!, fontFamily: font?.cssFamily,
      fontSize: font?.size, fontWeight: font?.weight, lineHeight: font?.lineHeight });
  }) : undefined;
  // Endpoint escape and engine legs can briefly retrace the same line.
  // Those generated excursions are not checkpoints: remove them before any
  // exact label fraction is evaluated against the final route's arc length.
  // Terminal contacts may move to a captioned icon's side exits below.
  const terminal = { start, end, sourceDirection: contacts.sourceDirection, targetDirection: contacts.targetDirection };
  const compactGenerated = (points: Point[], extra: typeof captions): Point[] => {
    const unique: Point[] = [];
    for (const point of points) {
      while (unique.length > 1) {
        const a = unique.at(-2)!, b = unique.at(-1)!;
        if (!(close(a.x, b.x) && close(b.x, point.x)) && !(close(a.y, b.y) && close(b.y, point.y))) break;
        unique.pop();
      }
      if (!unique.length || !close(point.x, unique.at(-1)!.x) || !close(point.y, unique.at(-1)!.y)) unique.push(point);
    }
    if (unique.length < 2 || validateRouteSections([{ startPoint: unique[0]!,
      bendPoints: unique.slice(1, -1), endPoint: unique.at(-1)! }], {
      sourcePoint: terminal.start, targetPoint: terminal.end, sourceDirection: terminal.sourceDirection,
      targetDirection: terminal.targetDirection, obstacles: [...obstacles, ...captions, ...extra],
      routingStyle: routingStyle ?? 'orthogonal',
    }).length) return points;
    return unique;
  };
  const routeWith = (extra: typeof captions) => compactGenerated(routeFixedGeometry({ id: edge.id,
    sourceId: edge.source, targetId: edge.target,
    sourcePoint: terminal.start, targetPoint: terminal.end, sourceDirection: terminal.sourceDirection,
    targetDirection: terminal.targetDirection, obstacles: [...obstacles, ...captions, ...extra], routingStyle,
    sourceBounds: { id: edge.source, ...source.absolutePosition, width: source.width, height: source.height },
    targetBounds: { id: edge.target, ...target.absolutePosition, width: target.width, height: target.height },
  }).flatMap((section, index) => index
    ? [...section.bendPoints, section.endPoint] : [section.startPoint, ...section.bendPoints, section.endPoint]), extra);
  let points: Point[];
  try { points = routeWith([]); }
  catch (error) {
    // A captioned icon's bottom contact cannot leave without crossing its own
    // caption. Try the glyph's side exits for free contacts before refusing.
    if (!(error instanceof RouteGeometryError)) throw error;
    const opposite = { left: 'right', right: 'left' } as const;
    const sourceExits = edge.sourcePort ? [] : captionSideExits029(source, records, centre(target));
    const targetExits = edge.targetPort ? [] : captionSideExits029(target, records, centre(source));
    const options = [
      ...sourceExits.map((exit) => ({ start: exit.point, sourceDirection: exit.outward })),
      ...targetExits.map((exit) => ({ end: exit.point, targetDirection: opposite[exit.outward] })),
      ...sourceExits.flatMap((from) => targetExits.map((into) => ({ start: from.point,
        sourceDirection: from.outward, end: into.point, targetDirection: opposite[into.outward] }))),
    ];
    let found: Point[] | undefined;
    for (const option of options) {
      Object.assign(terminal, { start, end, sourceDirection: contacts.sourceDirection,
        targetDirection: contacts.targetDirection }, option);
      try { found = routeWith([]); break; }
      catch (cause) { if (!(cause instanceof RouteGeometryError)) throw cause; }
    }
    if (!found) throw error;
    points = found;
  }
  if (labelSizes && edge.labelPlacement) {
    const width = Math.max(...labelSizes.map((size) => size.width));
    const height = Math.max(...labelSizes.map((size) => size.height));
    const label = authoredEdgeLabelBox028(points, edge.labelPlacement, width, height);
    const conflicts = captions.filter(caption => label.x < caption.x + caption.width &&
      label.x + label.width > caption.x && label.y < caption.y + caption.height &&
      label.y + label.height > caption.y);
    // Only a caption that conflicts with the exact label needs extra room.
    // Its translated envelope describes every shaft point whose authored
    // label would overlap it; shared routing keeps the detour orthogonal.
    if (conflicts.length) points = routeWith(conflicts.map(caption => {
      const { side, offset = 0 } = edge.labelPlacement!;
      return { id: `${caption.id}:edge-label`, width: caption.width + width,
        height: caption.height + height,
        x: caption.x + (side === 'left' ? offset : side === 'right' ? -offset - width : -width / 2),
        y: caption.y + (side === 'above' ? offset : side === 'below' ? -offset - height : -height / 2) };
    }));
  }
  route.sections = [{ startPoint: points[0]!, bendPoints: points.slice(1, -1), endPoint: points.at(-1)! }];
  avoidNodeCaption028(edge, route, rects, records, labelSizes ? {
    width: Math.max(...labelSizes.map((size) => size.width)),
    height: Math.max(...labelSizes.map((size) => size.height)),
  } : undefined);
}

/** Ancestor interiors are open routing space; their painted titles are not. */
function finalRouteObstacles028(edge: GraphEdge, rects: Map<string, MutableRect>, records: Map<string, NodeRecord>) {
  return [...rects.values()].flatMap(rect => {
    const container = isContainerNode028(records.get(rect.id)!.node);
    if (rect.id === edge.source || rect.id === edge.target ||
      isAncestor(rect.id, edge.source, records) || isAncestor(rect.id, edge.target, records)) {
      const caption = container ? nodeCaptionBox028(rect, records) : undefined;
      return caption && caption.width > 0 && caption.height > 0
        ? [{ ...caption, id: `${rect.id}:caption` }] : [];
    }
    return occupiedBoxes(rect, records, 0).map((box, index) => ({ ...box, id: `${rect.id}:${index}` }));
  });
}

/** A shared port needs only its exact contact-to-outer-frame escape plus 8px. */
function parallelStemLength028(id: string, portId: string, point: Point,
  rects: Map<string, MutableRect>, records: Map<string, NodeRecord>): number {
  const rect = rects.get(id)!, port = records.get(id)?.node.ports?.find(item => item.id === portId);
  const inset = port?.side === 'NORTH' ? point.y - rect.absolutePosition.y
    : port?.side === 'SOUTH' ? rect.absolutePosition.y + rect.height - point.y
      : port?.side === 'WEST' ? point.x - rect.absolutePosition.x
        : rect.absolutePosition.x + rect.width - point.x;
  return 8 + Math.max(0, inset);
}

/** Positive collinear shaft overlap; exact shared ports may require one short
 * outward stem, but never a shared middle corridor. */
function parallelShaftOverlap028(a: GraphEdge, ar: ResolvedEdgeRoute,
  b: GraphEdge, br: ResolvedEdgeRoute,
  rects: Map<string, MutableRect>, records: Map<string, NodeRecord>): boolean {
  const points = (route: ResolvedEdgeRoute) => route.sections.flatMap((section, index) =>
    index ? [...section.bendPoints, section.endPoint] : [section.startPoint, ...section.bendPoints, section.endPoint]);
  const ap = points(ar), bp = points(br);
  const contacts = (edge: GraphEdge, route: Point[]) => [
    { id: edge.source, port: edge.sourcePort, point: route[0]! },
    { id: edge.target, port: edge.targetPort, point: route.at(-1)! },
  ];
  for (let i = 1; i < ap.length; i++) for (let j = 1; j < bp.length; j++) {
    const start = ap[i - 1]!, end = ap[i]!, otherStart = bp[j - 1]!, otherEnd = bp[j]!;
    const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
    if (length < TOLERANCE) continue;
    const cross = (p: Point) => Math.abs((p.x - start.x) * dy - (p.y - start.y) * dx) / length;
    if (cross(otherStart) > TOLERANCE || cross(otherEnd) > TOLERANCE) continue;
    const progress = (p: Point) => ((p.x - start.x) * dx + (p.y - start.y) * dy) / length;
    const from = Math.max(0, Math.min(progress(otherStart), progress(otherEnd)));
    const to = Math.min(length, Math.max(progress(otherStart), progress(otherEnd)));
    if (to - from <= TOLERANCE) continue;
    const ends = [from, to].map(t => ({ x: start.x + dx * t / length, y: start.y + dy * t / length }));
    const forcedStem = contacts(a, ap).some(left => contacts(b, bp).some(right =>
      left.port && right.port && left.id === right.id &&
      records.get(left.id)?.node.ports?.find(port => port.id === left.port)?.side ===
        records.get(right.id)?.node.ports?.find(port => port.id === right.port)?.side &&
      Math.hypot(left.point.x - right.point.x, left.point.y - right.point.y) < TOLERANCE &&
      ends.every(p => Math.hypot(p.x - left.point.x, p.y - left.point.y) <= parallelStemLength028(left.id, left.port!, left.point, rects, records) + TOLERANCE)));
    if (!forcedStem) return true;
  }
  return false;
}

/** Use the painted cross-axis span, including aspect fitting, for contact slots. */
function parallelCrossSpan028(rect: MutableRect, records: Map<string, NodeRecord>, horizontal: boolean): number {
  const record = records.get(rect.id)!;
  const appearance = resolveNodeAppearance(record.node,
    { fill: '#fff', stroke: '#000', text: '#000', edge: '#000' }, record.notationId, record.catalog);
  if (isStateCircleSymbol0217(appearance.symbolId)) return 2 * stateCircleRadius0217(rect.width, rect.height);
  if (isStateSyncBarSymbol0217(appearance.symbolId)) return horizontal ? rect.height : rect.width;
  const shape = containerStencilShape028(sceneNodeShape029(appearance)!, rect.width, rect.height, isContainerNode028(record.node));
  // A user outline is frame geometry and spans the whole box.
  if (isUserOutlineShape029(shape)) return horizontal ? rect.height : rect.width;
  const fit = stencilFit028(shape, rect.width, rect.height, { notationId: record.notationId, symbolId: appearance.symbolId, layoutDirection: record.direction });
  return horizontal ? fit.fittedHeight : fit.fittedWidth;
}

/** Distinct free implicit arrowheads need visible room at both node borders. */
function parallelImplicitContactsClose028(a: GraphEdge, ar: ResolvedEdgeRoute, b: GraphEdge, br: ResolvedEdgeRoute, clearance: number): boolean {
  if (a.routeIntent || b.routeIntent) return false;
  const contacts = (edge: GraphEdge, route: ResolvedEdgeRoute) => [
    { id: edge.source, port: edge.sourcePort, point: route.sections[0]!.startPoint },
    { id: edge.target, port: edge.targetPort, point: route.sections.at(-1)!.endPoint },
  ];
  return contacts(a, ar).some(left => contacts(b, br).some(right => left.id === right.id && !left.port && !right.port &&
    Math.hypot(left.point.x - right.point.x, left.point.y - right.point.y) < clearance - TOLERANCE));
}

/** Preserve clear engine lanes. Only overlapping generated parallels need a
 * bounded fixed-geometry reroute; authored vertices and shared ports stay exact. */
function separateParallelRoutes028(graph: GraphIR, routes: ResolvedEdgeRoute[],
  rects: Map<string, MutableRect>, records: Map<string, NodeRecord>, repair = true, contactClearance = 0): void {
  const groups = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    if (edge.source === edge.target) continue;
    const key = [edge.source, edge.target].sort().join('\0');
    const group = groups.get(key) ?? []; group.push(edge); groups.set(key, group);
  }
  const byId = new Map(routes.map(route => [route.id, route]));
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const leftRect = rects.get(group[0]!.source)!, rightRect = rects.get(group[0]!.target)!;
    if (Math.hypot(centre(leftRect).x - centre(rightRect).x, centre(leftRect).y - centre(rightRect).y) < TOLERANCE) continue;
    const horizontalContacts = Math.abs(centre(rightRect).x - centre(leftRect).x) >= Math.abs(centre(rightRect).y - centre(leftRect).y);
    const implicitCount = (id: string) => group.filter(edge => !edge.routeIntent &&
      !(edge.source === id ? edge.sourcePort : edge.targetPort)).length;
    const practicalClearance = contactClearance ? Math.min(contactClearance,
      ...[leftRect, rightRect].map(rect => Math.max(0, parallelCrossSpan028(rect, records, horizontalContacts) - 8) /
        Math.max(1, implicitCount(rect.id) - 1))) : 0;
    const pairs = group.flatMap((edge, index) => group.slice(index + 1).map(other => [edge, other] as const));
    const implicitSpread = pairs.some(([edge, other]) =>
      parallelImplicitContactsClose028(edge, byId.get(edge.id)!, other, byId.get(other.id)!, practicalClearance));
    if (!implicitSpread && !pairs.some(([edge, other]) => (!edge.routeIntent || !other.routeIntent) &&
      parallelShaftOverlap028(edge, byId.get(edge.id)!, other, byId.get(other.id)!, rects, records))) continue;
    // Degrade only generated pairs; a connector beside an authored route refuses (R-039 AC-8).
    const offending = repair ? [] : pairs.filter(([edge, other]) =>
      parallelImplicitContactsClose028(edge, byId.get(edge.id)!, other, byId.get(other.id)!, practicalClearance) ||
      ((!edge.routeIntent || !other.routeIntent) && parallelShaftOverlap028(edge, byId.get(edge.id)!, other, byId.get(other.id)!, rects, records)));
    if (!repair && offending.every(([edge, other]) => !edge.routeIntent && !other.routeIntent) &&
      offending.every(([edge, other]) => {
        const reason = parallelShaftOverlap028(edge, byId.get(edge.id)!, other, byId.get(other.id)!, rects, records)
          ? 'shares a corridor with a parallel connector' : 'meets its node too close to a parallel connector';
        return degradeRoute029(records, edge, reason) && degradeRoute029(records, other, reason);
      })) continue;
    if (!repair) throw new SpatialLayoutError([{ code: 'layout.route.invalid', severity: 'error',
      message: `Parallel connectors between "${group[0]!.source}" and "${group[0]!.target}" share a middle shaft`,
      subject: { kind: 'edge', id: group[0]!.id } }]);
    const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const [firstId, secondId] = [group[0]!.source, group[0]!.target].sort();
    const first = rects.get(firstId!)!, second = rects.get(secondId!)!;
    const a = flowObjectCenter028(first, records), b = flowObjectCenter028(second, records);
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const accepted = ordered.filter(edge => edge.routeIntent).map(edge => ({ edge, route: byId.get(edge.id)! }));
    const executionOrder = [...ordered].sort((a, b) => {
      const bends = (edge: GraphEdge) => byId.get(edge.id)!.sections.reduce((sum, section) => sum + section.bendPoints.length, 0);
      return bends(b) - bends(a) || a.id.localeCompare(b.id);
    });
    for (const edge of executionOrder) {
      if (edge.routeIntent) continue;
      const index = ordered.indexOf(edge);
      const edgeNeedsSpread = pairs.some(([a, b]) => (a.id === edge.id || b.id === edge.id) &&
        parallelImplicitContactsClose028(a, byId.get(a.id)!, b, byId.get(b.id)!, practicalClearance));
      if (!edgeNeedsSpread && !accepted.some(prior => parallelShaftOverlap028(edge, byId.get(edge.id)!, prior.edge, prior.route, rects, records))) {
        accepted.push({ edge, route: byId.get(edge.id)! }); continue;
      }
      const source = rects.get(edge.source)!, target = rects.get(edge.target)!;
      const sourceCenter = flowObjectCenter028(source, records), targetCenter = flowObjectCenter028(target, records);
      const fraction = (index - (ordered.length - 1) / 2) / Math.max(1, ordered.length - 1);
      const shift = fraction * 24 * (ordered.length - 1);
      const contact = (rect: MutableRect, other: Point, portId: string | undefined): Point => {
        const c = flowObjectCenter028(rect, records);
        const implicit = ordered.filter(peer => !peer.routeIntent &&
          !(peer.source === rect.id ? peer.sourcePort : peer.targetPort));
        const slot = implicit.indexOf(edge), count = implicit.length;
        const contactFraction = (slot - (count - 1) / 2) / Math.max(1, count - 1);
        const safeSpan = Math.max(0, parallelCrossSpan028(rect, records, horizontal) - 8);
        let offset = contactFraction * Math.min(24 * Math.max(1, count - 1), safeSpan);
        if (!portId && count === 1) {
          const centered = boundaryPoint(rect, other, undefined, records, 0);
          const occupied = accepted.some(prior => [{ id: prior.edge.source, point: prior.route.sections[0]!.startPoint },
            { id: prior.edge.target, point: prior.route.sections.at(-1)!.endPoint }].some(contact => contact.id === rect.id &&
              Math.hypot(centered.x - contact.point.x, centered.y - contact.point.y) < Math.max(TOLERANCE, practicalClearance)));
          if (occupied) offset = (index % 2 ? 1 : -1) * Math.min(24, safeSpan / 2);
        }
        const facingGap = horizontal ? Math.abs(targetCenter.x - sourceCenter.x) - (source.width + target.width) / 2
          : Math.abs(targetCenter.y - sourceCenter.y) - (source.height + target.height) / 2;
        const outer = facingGap < 16 && !portId;
        const side = shift < 0 ? -1 : 1;
        const toward = horizontal
          ? outer ? { x: c.x + offset, y: c.y + side * rect.height / 2 }
            : { x: c.x + Math.sign(other.x - c.x || 1) * rect.width / 2, y: c.y + offset }
          : outer ? { x: c.x + side * rect.width / 2, y: c.y + offset }
            : { x: c.x + offset, y: c.y + Math.sign(other.y - c.y || 1) * rect.height / 2 };
        return boundaryPoint(rect, toward, portId, records, 0);
      };
      const start = contact(source, targetCenter, edge.sourcePort), end = contact(target, sourceCenter, edge.targetPort);
      const direction = (rect: MutableRect, point: Point, portId?: string): RouteContacts['sourceDirection'] => {
        const port = records.get(rect.id)?.node.ports?.find(item => item.id === portId);
        if (port) return ({ NORTH: 'up', SOUTH: 'down', WEST: 'left', EAST: 'right' } as const)[port.side];
        const c = flowObjectCenter028(rect, records), dx = (point.x - c.x) / rect.width, dy = (point.y - c.y) / rect.height;
        return Math.abs(dx) > Math.abs(dy) ? dx >= 0 ? 'right' : 'left' : dy >= 0 ? 'down' : 'up';
      };
      const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
      const obstacles = finalRouteObstacles028(edge, rects, records);
      for (const rect of rects.values()) {
        const caption = nodeCaptionBox028(rect, records);
        if (caption && caption.width > 0 && caption.height > 0 && !obstacles.some(box => box.id === `${rect.id}:caption`))
          obstacles.push({ ...caption, id: `${rect.id}:caption` });
      }
      // Existing accepted shafts reserve slim middle corridors. Leave each
      // elbow open so exact shared-port stems can branch in opposite directions.
      for (const prior of accepted) for (const section of prior.route.sections) {
        const points = [section.startPoint, ...section.bendPoints, section.endPoint];
        for (let i = 1; i < points.length; i++) {
          const p = points[i - 1]!, q = points[i]!, length = Math.hypot(q.x - p.x, q.y - p.y);
          if (length <= 6) continue;
          const sharedContacts = [{ id: edge.source, port: edge.sourcePort, point: start },
            { id: edge.target, port: edge.targetPort, point: end }].filter(contact => contact.port &&
            [{ id: prior.edge.source, port: prior.edge.sourcePort, point: prior.route.sections[0]!.startPoint },
              { id: prior.edge.target, port: prior.edge.targetPort, point: prior.route.sections.at(-1)!.endPoint }].some(other =>
              other.id === contact.id && other.port &&
              Math.hypot(other.point.x - contact.point.x, other.point.y - contact.point.y) < TOLERANCE &&
              records.get(other.id)?.node.ports?.find(port => port.id === other.port)?.side ===
                records.get(contact.id)?.node.ports?.find(port => port.id === contact.port)?.side));
          const nearStart = sharedContacts.find(contact => Math.hypot(p.x - contact.point.x, p.y - contact.point.y) < TOLERANCE);
          const nearEnd = sharedContacts.find(contact => Math.hypot(q.x - contact.point.x, q.y - contact.point.y) < TOLERANCE);
          const fromStem = nearStart ? parallelStemLength028(nearStart.id, nearStart.port!, nearStart.point, rects, records) : 0;
          const toStem = nearEnd ? parallelStemLength028(nearEnd.id, nearEnd.port!, nearEnd.point, rects, records) : 0;
          if (length <= fromStem + toStem + TOLERANCE) continue;
          const inset = Math.min(3, length / 3), ux = (q.x - p.x) / length, uy = (q.y - p.y) / length;
          const from = nearStart ? Math.min(length, fromStem + 3) : inset, to = nearEnd ? Math.min(length, toStem + 3) : inset;
          if (from + to >= length) continue;
          const x1 = p.x + ux * from, y1 = p.y + uy * from, x2 = q.x - ux * to, y2 = q.y - uy * to;
          obstacles.push({ id: `${prior.edge.id}:shaft:${i}`, x: Math.min(x1, x2) - 2, y: Math.min(y1, y2) - 2,
            width: Math.abs(x2 - x1) + 4, height: Math.abs(y2 - y1) + 4 });
        }
      }
      let replacement: ResolvedEdgeRoute | undefined;
      const span = Math.max(horizontal ? first.height : first.width, horizontal ? second.height : second.width);
      for (const lane of [shift, ...Array.from({ length: 8 }, (_, attempt) =>
        (attempt % 2 ? 1 : -1) * (span / 2 + 24 + (Math.floor(index / 2) + Math.floor(attempt / 2)) * 20))]) {
        const escape = (rect: MutableRect, point: Point, side: RouteContacts['sourceDirection'], distance = 8): Point =>
          side === 'up' ? { x: point.x, y: Math.min(point.y - distance, rect.absolutePosition.y - distance) }
            : side === 'down' ? { x: point.x, y: Math.max(point.y + distance, rect.absolutePosition.y + rect.height + distance) }
              : side === 'left' ? { x: Math.min(point.x - distance, rect.absolutePosition.x - distance), y: point.y }
                : { x: Math.max(point.x + distance, rect.absolutePosition.x + rect.width + distance), y: point.y };
        // Staggered nodes need nested elbows: otherwise the next contact's
        // escape can land inside the previous connector's vertical leg.
        const crossAdvance = horizontal ? b.y - a.y : b.x - a.x;
        const nesting = crossAdvance >= 0 ? ordered.length - 1 - index : index;
        const sourceNesting = edge.source === firstId ? nesting : ordered.length - 1 - nesting;
        const targetNesting = ordered.length - 1 - sourceNesting;
        const engineFrom = escape(source, start, direction(source, start, edge.sourcePort));
        const engineTo = escape(target, end, direction(target, end, edge.targetPort));
        const from = escape(source, start, direction(source, start, edge.sourcePort), 8 + (edge.sourcePort ? 0 : sourceNesting) * 8);
        const to = escape(target, end, direction(target, end, edge.targetPort), 8 + (edge.targetPort ? 0 : targetNesting) * 8);
        const corridor = horizontal ? [{ x: from.x, y: middle.y + lane }, { x: to.x, y: middle.y + lane }]
          : [{ x: middle.x + lane, y: from.y }, { x: middle.x + lane, y: to.y }];
        const waypoints = [from, ...corridor, to];
        const distinctWaypoints = waypoints.filter((point, index) =>
          Math.hypot(point.x - engineFrom.x, point.y - engineFrom.y) > TOLERANCE &&
          Math.hypot(point.x - engineTo.x, point.y - engineTo.y) > TOLERANCE && (!index ||
            Math.hypot(point.x - waypoints[index - 1]!.x, point.y - waypoints[index - 1]!.y) > TOLERANCE));
        try {
          const sections = routeFixedGeometry({ id: edge.id, sourceId: edge.source, targetId: edge.target,
            sourcePoint: start, targetPoint: end, sourceDirection: direction(source, start, edge.sourcePort),
            targetDirection: opposite[direction(target, end, edge.targetPort)], obstacles, waypoints: distinctWaypoints, routingStyle: 'orthogonal',
            sourceBounds: { id: edge.source, ...source.absolutePosition, width: source.width, height: source.height },
            targetBounds: { id: edge.target, ...target.absolutePosition, width: target.width, height: target.height } });
          const points = sections.flatMap((section, i) => i ? [...section.bendPoints, section.endPoint]
            : [section.startPoint, ...section.bendPoints, section.endPoint]).filter((point, i, all) => !i ||
              Math.hypot(point.x - all[i - 1]!.x, point.y - all[i - 1]!.y) > TOLERANCE);
          const compact: Point[] = [];
          for (const point of points) {
            while (compact.length > 1) {
              const a = compact.at(-2)!, b = compact.at(-1)!;
              if (Math.abs((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) > TOLERANCE) break;
              compact.pop();
            }
            if (!compact.length || Math.hypot(point.x - compact.at(-1)!.x, point.y - compact.at(-1)!.y) > TOLERANCE) compact.push(point);
          }
          const candidate = { id: edge.id, sections: [{ startPoint: compact[0]!, bendPoints: compact.slice(1, -1), endPoint: compact.at(-1)! }], waypointIds: [] };
          if (accepted.some(prior => parallelShaftOverlap028(edge, candidate, prior.edge, prior.route, rects, records))) continue;
          replacement = candidate; break;
        } catch (error) { if (!(error instanceof RouteGeometryError)) throw error; }
      }
      if (!replacement && !accepted.some(prior => prior.edge.routeIntent &&
        parallelShaftOverlap028(edge, byId.get(edge.id)!, prior.edge, prior.route, rects, records)) &&
        degradeRoute029(records, edge, 'shares a corridor with a parallel connector')) {
        accepted.push({ edge, route: byId.get(edge.id)! });
        continue;
      }
      if (!replacement) throw new SpatialLayoutError([{ code: 'layout.route.invalid', severity: 'error',
        message: `Connector "${edge.id}" (${edge.source} → ${edge.target}) has no clear corridor beside its parallel connector`, subject: { kind: 'edge', id: edge.id } }]);
      const route = byId.get(edge.id)!; route.sections = replacement.sections;
      accepted.push({ edge, route });
    }
  }
}

/**
 * A bent generated orthogonal route may keep a diagonal leg from a detour,
 * a dropped engine elbow or a contour contact. Replace each such leg with
 * the clear elbow, and re-take a free contact on the elbow's lane so the leg
 * meets the visible outline square. A single straight segment is the
 * deliberate direct shortcut and an all-diagonal route a deliberate
 * polyline; both are left alone, as is any leg whose elbows would cross an
 * obstacle.
 */
function orthogonalizeGeneratedRoute029(edge: GraphEdge, route: ResolvedEdgeRoute,
  rects: Map<string, MutableRect>, records: Map<string, NodeRecord>,
  obstacles: ReadonlyArray<{ x: number; y: number; width: number; height: number }>,
  others: readonly ResolvedEdgeRoute[], edgesById?: ReadonlyMap<string, GraphEdge>,
  routingStyle?: 'orthogonal' | 'polyline'): void {
  const points = route.sections.flatMap((section, index) => index
    ? [...section.bendPoints, section.endPoint] : [section.startPoint, ...section.bendPoints, section.endPoint]);
  if (points.length < 2) return;
  const hasCaptionedIcon = isCaptionedIcon029(edge.source, records) || isCaptionedIcon029(edge.target, records);
  // A 2-point straight segment is a deliberate direct shortcut unless a
  // captioned glyph's off-center contour tilted an orthogonal edge (DRQ-12).
  if (points.length === 2 && !(routingStyle !== 'polyline' && hasCaptionedIcon)) return;
  // An all-diagonal multi-segment route is a deliberate polyline; mixed legs are a broken orthogonal route.
  if (points.length >= 3 && !points.slice(1).some((point, index) => close(point.x, points[index]!.x) || close(point.y, points[index]!.y))) return;
  const source = rects.get(edge.source)!, target = rects.get(edge.target)!;
  const box = (rect: MutableRect) => ({ x: rect.absolutePosition.x, y: rect.absolutePosition.y, width: rect.width, height: rect.height });
  const within = (point: Point, rect: MutableRect) => point.x >= rect.absolutePosition.x - 0.5 && point.y >= rect.absolutePosition.y - 0.5
    && point.x <= rect.absolutePosition.x + rect.width + 0.5 && point.y <= rect.absolutePosition.y + rect.height + 0.5;
  const diagonal = (a: Point, b: Point) => Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5;
  // A decision or gateway branch deliberately departs diagonally (clearDownwardBranchRoute).
  const sourceRecord = records.get(edge.source);
  const sourceSymbol = sourceRecord && renderSymbolId(sourceRecord.node, sourceRecord.notationId, sourceRecord.catalog);
  const branchDeparture = sourceSymbol === 'flowchart-decision' || isBpmnGatewaySymbol028(sourceSymbol);
  // Icon and container captions are painted ink a new elbow must also clear.
  const captions = [...rects.values()].flatMap((rect) => {
    const caption = nodeCaptionBox028(rect, records);
    return caption && caption.width > 0 && caption.height > 0 ? [caption] : [];
  });
  // A new leg may not share a shaft with another connector, except on a valid
  // shared-endpoint fan-out/fan-in trunk (DRQ-14).
  const shafts = others.filter((other) => other.id !== route.id).flatMap((other) => {
    const otherEdge = edgesById?.get(other.id);
    const line = other.sections.flatMap((section, index) => index
      ? [...section.bendPoints, section.endPoint] : [section.startPoint, ...section.bendPoints, section.endPoint]);
    return line.slice(1).map((point, index) => ({
      c: line[index]!, d: point, otherEdge,
      isFirst: index === 0, isLast: index === line.length - 2,
    }));
  });
  type SharedTrunk = { kind: 'source' | 'target'; nodeId: string; point: Point };
  const sharesShaft = (a: Point, b: Point, trunk?: SharedTrunk) => shafts.some(({ c, d, otherEdge, isFirst, isLast }) => {
    const vertical = Math.abs(a.x - b.x) <= 1 && Math.abs(c.x - d.x) <= 1 && Math.abs(a.x - c.x) <= 1;
    const horizontal = Math.abs(a.y - b.y) <= 1 && Math.abs(c.y - d.y) <= 1 && Math.abs(a.y - c.y) <= 1;
    if (!vertical && !horizontal) return false;
    const [p, q, r, t] = vertical ? [a.y, b.y, c.y, d.y] : [a.x, b.x, c.x, d.x];
    if (Math.min(Math.max(p, q), Math.max(r, t)) - Math.max(Math.min(p, q), Math.min(r, t)) <= 1) return false;
    // Allow sharing the terminal trunk when both edges branch from the exact
    // same source contact or merge into the exact same target contact.
    if (trunk && otherEdge) {
      const samePair = (otherEdge.source === edge.source && otherEdge.target === edge.target)
        || (otherEdge.source === edge.target && otherEdge.target === edge.source);
      if (!samePair) {
        if (trunk.kind === 'source' && isFirst && otherEdge.source === trunk.nodeId
          && close(c.x, trunk.point.x) && close(c.y, trunk.point.y)) return false;
        if (trunk.kind === 'target' && isLast && otherEdge.target === trunk.nodeId
          && close(d.x, trunk.point.x) && close(d.y, trunk.point.y)) return false;
      }
    }
    return true;
  });
  const clear = (a: Point, b: Point, own: MutableRect[], trunk?: SharedTrunk) =>
    ![...obstacles, ...captions].some((obstacle) => segmentIntersectsBox(a, b, obstacle))
    && ![source, target].some((rect) => !own.includes(rect) && segmentIntersectsBox(a, b, box(rect)))
    && !sharesShaft(a, b, trunk);
  let changed = false;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!, b = points[index]!;
    if (!diagonal(a, b) || (within(a, source) && within(b, source)) || (within(a, target) && within(b, target))) continue;
    const first = index === 1, last = index === points.length - 1;
    if (first && branchDeparture) continue;
    // Best: a free contact slides onto the far point's own lane, so the
    // terminal leg is straight without a new elbow.
    let slid = false;
    for (const slideSource of [true, false]) {
      if (slideSource ? !(first && !edge.sourcePort) : !(last && !edge.targetPort)) continue;
      const [rect, far] = slideSource ? [source, b] : [target, a];
      const contact = laneAxisPoint029(rect, far, 'y', undefined, records, 4)
        ?? laneAxisPoint029(rect, far, 'x', undefined, records, 4);
      const trunk: SharedTrunk = slideSource
        ? { kind: 'source', nodeId: edge.source, point: contact ?? a }
        : { kind: 'target', nodeId: edge.target, point: contact ?? b };
      if (contact && !diagonal(contact, far) && clear(contact, far, first && last ? [source, target] : [rect], trunk)) {
        points[slideSource ? index - 1 : index] = contact;
        changed = true;
        slid = true;
        break;
      }
    }
    if (slid) continue;
    const hugsOwnBorder = (p: Point, q: Point, r: MutableRect): boolean => {
      if (Math.hypot(q.x - p.x, q.y - p.y) <= 0.5) return false;
      const rx = r.absolutePosition.x, ry = r.absolutePosition.y;
      return (Math.abs(p.x - q.x) <= 0.5 && (Math.abs(p.x - rx) <= 0.5 || Math.abs(p.x - rx - r.width) <= 0.5)
          && Math.min(Math.max(p.y, q.y), ry + r.height) - Math.max(Math.min(p.y, q.y), ry) > 0.5)
        || (Math.abs(p.y - q.y) <= 0.5 && (Math.abs(p.y - ry) <= 0.5 || Math.abs(p.y - ry - r.height) <= 0.5)
          && Math.min(Math.max(p.x, q.x), rx + r.width) - Math.max(Math.min(p.x, q.x), rx) > 0.5);
    };
    for (const horizontalFirst of [true, false]) {
      const elbow = horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
      const start = first ? laneAxisPoint029(source, elbow, horizontalFirst ? 'y' : 'x', edge.sourcePort, records, 4)
        ?? (edge.sourcePort ? a : undefined) : a;
      const end = last ? laneAxisPoint029(target, elbow, horizontalFirst ? 'x' : 'y', edge.targetPort, records, 4)
        ?? (edge.targetPort ? b : undefined) : b;
      if (!start || !end || diagonal(start, elbow) || diagonal(elbow, end)
        || (first && hugsOwnBorder(start, elbow, source)) || (last && hugsOwnBorder(elbow, end, target))) continue;
      if (!clear(start, elbow, first ? [source] : [], first ? { kind: 'source', nodeId: edge.source, point: start } : undefined)
        || !clear(elbow, end, last ? [target] : [], last ? { kind: 'target', nodeId: edge.target, point: end } : undefined)) continue;
      points.splice(index - 1, 2, start, elbow, end);
      changed = true;
      break;
    }
    if (changed && !diagonal(points[index - 1]!, points[index]!)) continue;
    const gapMid = (a0: number, a1: number, b0: number, b1: number) =>
      a1 + 4 < b0 ? [(a1 + b0) / 2, (a0 + b1) / 2] : b1 + 4 < a0 ? [(b1 + a0) / 2, (a0 + b1) / 2] : [];
    const xC = [...gapMid(source.absolutePosition.x, source.absolutePosition.x + source.width, target.absolutePosition.x, target.absolutePosition.x + target.width).slice(0, 1), (a.x + b.x) / 2];
    const yC = [...gapMid(source.absolutePosition.y, source.absolutePosition.y + source.height, target.absolutePosition.y, target.absolutePosition.y + target.height).slice(0, 1), (a.y + b.y) / 2];
    let jogged = false;
    for (const hJog of [true, false]) {
      for (const mid of hJog ? xC : yC) {
        const jog = hJog ? [{ x: mid, y: a.y }, { x: mid, y: b.y }] : [{ x: a.x, y: mid }, { x: b.x, y: mid }];
        const axis = hJog ? 'y' : 'x';
        const start = first ? (edge.sourcePort ? a : laneAxisPoint029(source, jog[0]!, axis, undefined, records, 4)) : a;
        const end = last ? (edge.targetPort ? b : laneAxisPoint029(target, jog[1]!, axis, undefined, records, 4)) : b;
        if (!start || !end) continue;
        const line = [start, ...jog, end];
        if (line.slice(1).some((pt, step) => diagonal(line[step]!, pt))
          || (first && hugsOwnBorder(line[0]!, line[1]!, source))
          || (last && hugsOwnBorder(line[2]!, line[3]!, target))
          || !line.slice(1).every((pt, step) => clear(line[step]!, pt,
            step === 0 && first ? [source] : step === 2 && last ? [target] : [],
            step === 0 && first ? { kind: 'source', nodeId: edge.source, point: start }
              : step === 2 && last ? { kind: 'target', nodeId: edge.target, point: end } : undefined))) continue;
        points.splice(index - 1, 2, ...line);
        changed = jogged = true;
        break;
      }
      if (jogged) break;
    }
  }
  if (!changed) return;
  const compact: Point[] = [];
  for (const point of points) {
    if (compact.length && close(point.x, compact.at(-1)!.x) && close(point.y, compact.at(-1)!.y)) continue;
    // A new elbow on an existing straight run is not a bend.
    while (compact.length > 1) {
      const a = compact.at(-2)!, b = compact.at(-1)!;
      if (!(close(a.x, b.x) && close(b.x, point.x)) && !(close(a.y, b.y) && close(b.y, point.y))) break;
      compact.pop();
    }
    compact.push(point);
  }
  route.sections = [{ startPoint: compact[0]!, bendPoints: compact.slice(1, -1), endPoint: compact.at(-1)! }];
}

/** Final routes are checked after every geometry/constraint adjustment. Only
 * generated bends may be repaired; exact authored vertices are never moved. */
function validateFinalRoutes028(graph: GraphIR, routes: ResolvedEdgeRoute[],
  rects: Map<string, MutableRect>, records: Map<string, NodeRecord>, routingStyle?: 'orthogonal' | 'polyline',
  sceneOptions?: SpatialLayoutRequest['proximitySceneOptions'], authoredRoutingStyle?: 'orthogonal' | 'polyline'): void {
  const authoredStyle = ((graph as SpatialSidecar028).layoutOptions028?.edgeRouting ?? graph.layoutOptions?.edgeRouting)?.toUpperCase();
  authoredRoutingStyle ??= authoredStyle === 'ORTHOGONAL' ? 'orthogonal' : authoredStyle === 'POLYLINE' ? 'polyline' : undefined;
  routingStyle ??= authoredRoutingStyle;
  const byId = new Map(graph.edges.map((edge) => [edge.id, edge]));
  for (const route of routes) {
    const edge = byId.get(route.id)!;
    const obstacles = finalRouteObstacles028(edge, rects, records);
    if (!edge.routeIntent) {
      // Repeated engine elbows are disposable. Keep the corridor and loop,
      // rather than replacing an otherwise good route because of one stub.
      const points = route.sections.flatMap((section, index) => index
        ? [...section.bendPoints, section.endPoint] : [section.startPoint, ...section.bendPoints, section.endPoint]);
      const unique = points.filter((point, index) => !index || !close(point.x, points[index - 1]!.x) || !close(point.y, points[index - 1]!.y));
      if (unique.length >= 2 && unique.length < points.length) route.sections = [{
        startPoint: unique[0]!, bendPoints: unique.slice(1, -1), endPoint: unique.at(-1)!,
      }];
    }
    // ELK's layered default is orthogonal; only an explicit polyline style opts out.
    if (!edge.routeIntent && routingStyle !== 'polyline' && route.sections.length)
      orthogonalizeGeneratedRoute029(edge, route, rects, records, obstacles, routes, byId, routingStyle);
    let issues = validateRouteSections(route.sections, { obstacles,
      routingStyle: edge.routeIntent ? authoredRoutingStyle : routingStyle,
      allowCoincidentCheckpoints: Boolean(edge.routeIntent?.waypoints.length) });
    if (!issues.length) continue;
    if (!edge.routeIntent && route.sections.length) {
      try {
        repairGeneratedRoute028(edge, route, graph, rects, records, obstacles, routingStyle, sceneOptions);
        issues = validateRouteSections(route.sections, { obstacles, routingStyle });
      } catch (error) { if (!(error instanceof RouteGeometryError)) throw error; issues = error.issues; }
    }
    if (issues.length) throw new SpatialLayoutError(issues.map((issue) => ({
      code: 'layout.route.invalid', severity: 'error', message: `Edge "${edge.id}": ${issue.message}`,
      path: `edges.${edge.id}.routeIntent`, subject: { kind: 'edge', id: edge.id },
    })));
  }
  separateParallelRoutes028(graph, routes, rects, records, true, sceneOptions ? 18 : 0);
  try { validateRouteGeometryAtNodes(graph, publicRects(rects), new Map(routes.map((route) => [route.id, route.sections])),
    records.values().next().value?.direction, records.values().next().value?.catalog); }
  catch (error) {
    if (!(error instanceof RenderCapabilityError)) throw error;
    const badIds = new Set(error.diagnostics.filter((d) => d.subject?.kind === 'edge').map((d) => d.subject!.id));
    let repaired = false;
    for (const id of badIds) {
      const edge = byId.get(id); const route = routes.find((route) => route.id === id);
      if (!edge || !route || edge.routeIntent) continue;
      const obstacles = finalRouteObstacles028(edge, rects, records);
      try { repairGeneratedRoute028(edge, route, graph, rects, records, obstacles, routingStyle, sceneOptions); repaired = true; }
      catch (cause) { if (!(cause instanceof RouteGeometryError || cause instanceof SpatialLayoutError)) throw cause; }
    }
    try {
      if (!repaired) throw error;
      validateRouteGeometryAtNodes(graph, publicRects(rects), new Map(routes.map((route) => [route.id, route.sections])),
        records.values().next().value?.direction, records.values().next().value?.catalog);
    } catch (cause) {
      if (!(cause instanceof RenderCapabilityError)) throw cause;
      throw new SpatialLayoutError(cause.diagnostics.map((diagnostic) => ({
        code: 'layout.route.invalid', severity: 'error', message: diagnostic.message,
        ...(diagnostic.subject?.kind === 'edge' ? { path: `edges.${diagnostic.subject.id}.routeIntent`,
          subject: { kind: 'edge' as const, id: diagnostic.subject.id } } : {}),
      })));
    }
  }
  separateParallelRoutes028(graph, routes, rects, records, false, sceneOptions ? 18 : 0);
}

/** Validate the complete engine response before overlaying intent or simplifying bends. */
function validateLayoutCandidate028(graph: GraphIR, layout: LayoutResult, records: Map<string, NodeRecord>): void {
  const invalid = (message: string): never => { throw new SpatialLayoutError([{
    code: 'layout.geometry.invalid', severity: 'error', message,
  }]); };
  const ids = new Set<string>();
  for (const node of layout.nodes) {
    if (!records.has(node.id) || ids.has(node.id)) invalid(`Layout has an unexpected or duplicate node "${node.id}"`);
    ids.add(node.id);
    if (![node.position.x, node.position.y, node.absolutePosition.x, node.absolutePosition.y,
      node.width, node.height].every(Number.isFinite) || node.width <= 0 || node.height <= 0)
      invalid(`Node "${node.id}" has invalid final geometry`);
  }
  if (ids.size !== records.size) invalid('Layout is missing required nodes');
  if (![layout.width, layout.height].every(Number.isFinite)) invalid('Layout has invalid bounds');
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  const seen = new Set<string>();
  for (const edge of layout.edges) {
    if (!edgeIds.has(edge.id) || seen.has(edge.id)) invalid(`Layout has an unexpected or duplicate edge "${edge.id}"`);
    seen.add(edge.id);
    for (let i = 0; i < edge.sections.length; i++) {
      const section = edge.sections[i]!;
      const points = [section.startPoint, ...section.bendPoints, section.endPoint];
      if (!points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) invalid(`Edge "${edge.id}" has non-finite route geometry`);
      const previous = edge.sections[i - 1]?.endPoint;
      if (previous && (!close(previous.x, section.startPoint.x) || !close(previous.y, section.startPoint.y)))
        invalid(`Edge "${edge.id}" has discontinuous route sections`);
    }
  }

}

/**
 * Degraded-route warnings for one layout attempt, keyed by its node records.
 * Present only on the last-resort attempt: a generated connector that still
 * cannot get its own corridor beside a generated parallel connector is drawn
 * and named in a warning. Passing through a node body, crossing a container
 * title and sharing an authored route's shaft are never degraded.
 */
const degradedRouteSink029 = new WeakMap<Map<string, NodeRecord>, SpatialLayoutDiagnostic[]>();
function degradeRoute029(records: Map<string, NodeRecord>, edge: GraphEdge, reason: string): boolean {
  const sink = degradedRouteSink029.get(records);
  if (!sink || edge.routeIntent || namesLegacyPin029(edge, (id) => records.get(id)?.node.ports)) return false;
  if (!sink.some((item) => item.subject?.id === edge.id && item.message.endsWith(reason)))
    sink.push({ code: 'layout.route.degraded', severity: 'warning',
      message: `Connector "${edge.id}" (${edge.source} → ${edge.target}) ${reason}`,
      path: `edges.${edge.id}`, subject: { kind: 'edge', id: edge.id } });
  return true;
}

/** An edge naming a legacy box pin (a port with no attachment class) is authored geometry. */
function namesLegacyPin029(edge: GraphEdge, portsOf: (nodeId: string) => readonly { id: string; attachment?: string }[] | undefined): boolean {
  return ([[edge.source, edge.sourcePort], [edge.target, edge.targetPort]] as const).some(([nodeId, portId]) =>
    portId !== undefined && portsOf(nodeId)?.some((port) => port.id === portId && port.attachment === undefined));
}

/** True when every finding names a generated (not authored) connector. */
function generatedRouteFailure029(error: unknown, graph: GraphIR): error is SpatialLayoutError {
  if (!(error instanceof SpatialLayoutError) || !error.diagnostics.length) return false;
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const ports = new Map<string, GraphNode['ports']>();
  const index = (nodes: readonly GraphNode[]): void => { for (const node of nodes) {
    ports.set(node.id, node.ports); index(node.children ?? []);
  } };
  index(graph.nodes);
  return error.diagnostics.every((diagnostic) => {
    const edge = diagnostic.subject?.kind === 'edge' ? edges.get(diagnostic.subject.id) : undefined;
    return Boolean(edge && !edge.routeIntent && !namesLegacyPin029(edge, (id) => ports.get(id))) &&
      (diagnostic.code === 'layout.route.invalid' || diagnostic.code === 'layout.capability.unsupported');
  });
}

/** Bounded relayouts for a generated-route failure: wider spacing, then the other node placement. */
function routeRetryRequests029(request: SpatialLayoutRequest): [SpatialLayoutRequest, string][] {
  // A caller-supplied engine candidate is re-run only through the caller's engine.
  if (request.candidateLayout && !request.relayoutCandidate) return [];
  const scale = (spacing: LayoutOptionInput['spacing'] | undefined, fallback: number) => ({
    ...spacing,
    nodeNode: (spacing?.nodeNode ?? fallback) * 1.5,
    layerSpacing: (spacing?.layerSpacing ?? fallback) * 1.5,
  });
  const defaults = request.defaults ?? { algorithm: 'layered', direction: 'DOWN' };
  const wider: SpatialLayoutRequest = { ...request, defaults: { ...defaults, spacing: scale(defaults.spacing, 20) },
    ...(request.options ? { options: { ...request.options,
      ...(request.options.spacing ? { spacing: scale(request.options.spacing, 20) } : {}) } } : {}) };
  const strategyKey = 'elk.layered.nodePlacement.strategy';
  const current = request.options?.elkOptions?.[strategyKey] ?? defaults.elkOptions?.[strategyKey];
  const other = current === 'NETWORK_SIMPLEX' ? 'BRANDES_KOEPF' : 'NETWORK_SIMPLEX';
  const placement: SpatialLayoutRequest = { ...wider, defaults: { ...wider.defaults!,
    elkOptions: { ...wider.defaults!.elkOptions, [strategyKey]: other } } };
  return [[wider, 'with 1.5× node and layer spacing'], [placement, `with 1.5× spacing and ${other} node placement`]];
}

export async function resolveSpatialLayout(request: SpatialLayoutRequest): Promise<ResolvedLayout> {
  try {
    return await resolveSpatialLayoutWithReservations029(request);
  } catch (error) {
    if (!generatedRouteFailure029(error, request.graph) || request.execution?.signal?.aborted) throw error;
    // A generated connector the router could not draw: lay out again with
    // more room, then with the other node placement. Authored geometry is
    // never retried; its refusal is the author's to resolve.
    for (const [retry, change] of routeRetryRequests029(request)) {
      try {
        const resolved = await resolveSpatialLayoutWithReservations029(retry.relayoutCandidate && retry.candidateLayout
          ? { ...retry, candidateLayout: await retry.relayoutCandidate({ defaults: retry.defaults!,
            ...(retry.options ? { options: retry.options } : {}) }) } : retry);
        const subject = error.diagnostics[0]!.subject!;
        return { ...resolved, diagnostics: [...resolved.diagnostics, { code: 'layout.route.retried', severity: 'warning',
          message: `Connector "${subject.id}" could not be drawn at the requested spacing; laid out again ${change}`,
          path: `edges.${subject.id}`, subject }] };
      } catch (cause) { if (!generatedRouteFailure029(cause, retry.graph) || request.execution?.signal?.aborted) throw cause; }
    }
    // Last resort: draw with a shared corridor beside a generated parallel
    // connector, named in a warning. Anything else still refuses with the
    // first finding.
    try { return await resolveSpatialLayoutWithReservations029(request, true); }
    catch (cause) { if (cause instanceof SpatialLayoutError) throw error; throw cause; }
  }
}

async function resolveSpatialLayoutWithReservations029(request: SpatialLayoutRequest, degrade = false): Promise<ResolvedLayout> {
  // A layout whose ELK input reserved a user-symbol label and then failed is
  // laid out again without reservations, so a label side never refuses.
  const trace = { reserve: true, reserved: false, degrade };
  try {
    return await resolveSpatialLayoutOnce029(request, trace);
  } catch (error) {
    if (!trace.reserved || !(error instanceof SpatialLayoutError || error instanceof LayoutExecutionError)) throw error;
    if (request.execution?.signal?.aborted) throw error;
    return resolveSpatialLayoutOnce029(request, { reserve: false, reserved: false, degrade });
  }
}

async function resolveSpatialLayoutOnce029(request: SpatialLayoutRequest,
  trace: { reserve: boolean; reserved: boolean; degrade?: boolean }): Promise<ResolvedLayout> {
  const checkCancelled = () => {
    if (request.execution?.signal?.aborted) throw new DOMException('Layout cancelled', 'AbortError');
  };
  checkCancelled();
  const sidecar = request.graph as GraphIR & SpatialSidecar028;
  const typed = sidecar.spatialConstraints028;
  if (sidecar.routeIntents028) request = { ...request, graph: { ...request.graph,
    edges: request.graph.edges.map((edge) => {
      const route = sidecar.routeIntents028 && Object.hasOwn(sidecar.routeIntents028, edge.id)
        ? sidecar.routeIntents028[edge.id] : undefined;
      if (!route) return edge;
      return { ...edge, routeIntent: { waypoints: route.waypoints.map((waypoint) => ({ ...waypoint,
        placement: waypoint.placement.kind === 'absolute' ? waypoint.placement : { ...waypoint.placement,
          anchor: waypoint.placement.anchor.kind === 'first' ? { kind: 'source' }
            : waypoint.placement.anchor.kind === 'second' ? { kind: 'target' } : waypoint.placement.anchor } })) } } as GraphEdge;
    }) } };
  if (sidecar.layoutOptions028) request = { ...request, options: mergeAuthoredLayoutOptions028(request.options, sidecar.layoutOptions028) };
  const unsupported = unsupportedPlacement(request.graph);
  if (unsupported.length) throw new SpatialLayoutError(unsupported);
  const effectiveOptions = normalizeLayoutOptions(
    request.options ?? request.graph.layoutOptions,
    request.defaults ?? { algorithm: 'layered', direction: 'DOWN' },
  ).effectiveOptions;
  // Engine defaults choose generated elbows; only explicit input restricts
  // the straight segments joining exact authored route vertices.
  const explicitRouting = normalizeLayoutOptions(request.options ?? request.graph.layoutOptions,
    { algorithm: 'layered', direction: 'DOWN' }).effectiveOptions['elk.edgeRouting'];
  const authoredRoutingStyle = explicitRouting === 'ORTHOGONAL' ? 'orthogonal'
    : explicitRouting === 'POLYLINE' ? 'polyline' : undefined;
  const requestedDirection = effectiveOptions?.['elk.direction'] ??
    request.defaults?.direction ?? request.graph.layoutOptions?.direction;
  const direction: LayoutDirection = requestedDirection === 'RIGHT' ||
    requestedDirection === 'LEFT' || requestedDirection === 'UP' ||
    requestedDirection === 'DOWN' ? requestedDirection : 'DOWN';
  const notationId = effectiveGraphNotationId028(request.graph);
  const records = indexNodes(request.graph.nodes, direction, notationId, request.documentCatalog029);
  if (trace.degrade) degradedRouteSink029.set(records, []);
  for (const edge of request.graph.edges) for (const endpoint of ['source', 'target'] as const) {
    const portId = endpoint === 'source' ? edge.sourcePort : edge.targetPort;
    const record = records.get(edge[endpoint]);
    if (!portId || !record) continue;
    const incidence = record.portIncidence ??= new Map<string, number>();
    incidence.set(portId, (incidence.get(portId) ?? 0) + 1);
  }
  for (const record of records.values()) record.containerTitleOptions = request.proximitySceneOptions;
  for (const { node } of records.values()) {
    if (!node.labelPlacement || node.labelPlacement.side === 'center' || node.label === '') continue;
    const sizes = (['lowfi', 'hifi'] as const).map((style) => {
      const font = resolveSvgNodeFont(node, { ...request.proximitySceneOptions, style });
      return measureEdgeLabel028({ text: node.label ?? node.id, fontFamily: font?.cssFamily,
        fontSize: font?.size, fontWeight: font?.weight, lineHeight: font?.lineHeight });
    });
    records.get(node.id)!.authoredLabelSize = { width: Math.max(...sizes.map((size) => size.width)),
      height: Math.max(...sizes.map((size) => size.height)) };
  }
  const bpmnSpine = notationId === 'bpmn' && (!request.candidateLayout || Boolean(request.relayoutCandidate))
    && (direction === 'DOWN' || direction === 'RIGHT' || direction === 'LEFT')
    && effectiveOptions?.['elk.algorithm'] === 'layered'
    && !(request.graph.constraints?.length)
    && !(typed?.length)
    && request.graph.nodes.every((node) => !node.position && !node.pinned && !node.children?.length)
    && request.graph.edges.every((edge) => !edge.routeIntent && !edge.sourcePort && !edge.targetPort &&
      (direction !== 'RIGHT' || edge.source !== edge.target))
    ? bpmnSpineNodes(request.graph) : [];
  const constraints: SpatialConstraint[] = bpmnSpine.length > 2 && direction === 'DOWN' ? [{
    id: '__coral_bpmn_forward_spine', kind: 'arrangement', strength: 'preferred',
    axis: 'column', alignment: 'center', gap: 25,
    subjects: bpmnSpine.map((nodeId) => ({ kind: 'node', nodeId })),
  }] : (request.graph.constraints ?? []);
  const rankReversed = request.candidateLayout
    ? new Set(request.candidateRankReversedEdgeIds ?? [])
    : new Set([
      ...classGeneralizationRankEdges028(request.graph, notationId),
      ...(notationId === 'architecture' ? nestedContainerCycleBackEdges0211(request.graph) : []),
    ]);
  const suppliedOptions = request.options ?? request.graph.layoutOptions;
  // GraphIR's public layoutOptions type has no elkOptions field, but existing
  // callers may carry one through at runtime. Preserve it when adding a
  // default instead of replacing the whole authored option record.
  const suppliedElkOptions = (suppliedOptions as LayoutOptionInput | undefined)?.elkOptions;
  const cycleBreaking = 'elk.layered.cycleBreaking.strategy';
  const useSourceOrderForFeedback = (notationId === 'flowchart' ||
    notationId === 'sketch' && (direction === 'RIGHT' || direction === 'LEFT')) &&
    !request.candidateLayout && hasDirectedCycle(request.graph) &&
    request.defaults?.elkOptions?.[cycleBreaking] === undefined &&
    suppliedElkOptions?.[cycleBreaking] === undefined;
  // A return edge should not lift its collection step above the initiating
  // decision. ELK's model-order cycle breaker treats source order as the
  // forward path while retaining and routing the feedback connector.
  const cycleOptions = useSourceOrderForFeedback
    ? { ...suppliedOptions, elkOptions: { ...suppliedElkOptions,
      [cycleBreaking]: 'MODEL_ORDER' } } : suppliedOptions;
  const labelSpacing = authoredLabelLayerSpacing028(request.graph, direction, request.proximitySceneOptions);
  // Code branches need a readable departure before traversing across a class's
  // children. ELK's 10px default crowds that traverse against the class frame.
  // Reserve room during routing, so final validation still owns the result;
  // explicit caller spacing and authored routes retain their own geometry.
  const cornerOptions = codeBranchRoutingDefaults028(notationId, effectiveOptions);
  const layoutOptions = labelSpacing > 0 || Object.keys(cornerOptions).length ? { ...cycleOptions, elkOptions: {
    ...(cycleOptions as LayoutOptionInput | undefined)?.elkOptions,
    ...cornerOptions,
    ...(labelSpacing > 0 ? { 'elk.layered.spacing.nodeNodeBetweenLayers': String(Math.max(labelSpacing,
      Number(effectiveOptions['elk.layered.spacing.nodeNodeBetweenLayers'] ?? 0))) } : {}),
  } } : cycleOptions;
  const elkEdges = inputEdges(request.graph.edges, rankReversed);
  const elkNodes = request.graph.nodes.map((node) => inputNode(node, zeroPadding(), request.operation, request.automaticPadding028));
  // A user symbol's definition label side is reserved in ELK's input
  // (c4-design.md "Reservation in layout"); the editor reserves in its own request.
  const reservedNodes = !trace.reserve || request.candidateLayout ? elkNodes : userSymbolOutsideLabels029({
    nodes: elkNodes, edges: elkEdges, sourceNodes: request.graph.nodes, notationId,
    catalog: request.documentCatalog029, direction, layered: effectiveOptions['elk.algorithm'] === 'layered',
    sceneOptions: request.proximitySceneOptions,
  });
  if (reservedNodes !== elkNodes) trace.reserved = true;
  const layout = request.candidateLayout ?? await computeElkLayout({
    id: request.graph.id,
    nodes: [...reservedNodes],
    edges: elkEdges,
    defaults: request.defaults ?? { algorithm: 'layered', direction: 'DOWN' },
    options: layoutOptions,
  }, request.execution);
  checkCancelled();
  validateLayoutCandidate028(request.graph, layout, records);
  applyFreePortAttachments(request.graph, layout, records);
  const rects = initialRects(request.graph, layout, request.operation, records);
  const reservedLabels = [...records.values()].some((record) => record.reservedLabel029);
  if (bpmnSpine.length > 2 && direction === 'DOWN') {
    const spine = new Set(bpmnSpine);
    for (const side of rects.values()) {
      if (spine.has(side.id)) continue;
      const peer = bpmnSpine.map((id) => rects.get(id)).find((candidate) => candidate &&
        Math.min(side.absolutePosition.y + side.height,
          candidate.absolutePosition.y + candidate.height) -
        Math.max(side.absolutePosition.y, candidate.absolutePosition.y) > 1);
      if (!peer) continue;
      const relation = centre(side).x < centre(peer).x ? 'left-of' : 'right-of';
      constraints.push({ id: `__coral_bpmn_side_${side.id}`, kind: 'relative',
        strength: 'preferred',
        subject: { kind: 'node', nodeId: side.id }, relation,
        target: { kind: 'node', nodeId: peer.id }, gap: 40 });
    }
  }
  const initialConstraints = typed?.length ? constraints.filter((constraint) => constraint.strength !== 'preferred') : constraints;
  let resolved = resolveConstraints(initialConstraints, rects, records);
  let overlapDiagnostics: SpatialLayoutDiagnostic[] = [];
  for (let pass = 0; pass < Math.max(1, records.size * 2); pass += 1) {
    let accepted = new Set(resolved.accepted);
    let acceptedConstraints = constraints
      .filter((constraint) => accepted.has(constraint.id));
    if (resizeAutoContainers(rects, records, acceptedConstraints)) {
      resolved = resolveConstraints(initialConstraints, rects, records);
      accepted = new Set(resolved.accepted);
      acceptedConstraints = constraints
        .filter((constraint) => accepted.has(constraint.id));
    }
    overlapDiagnostics = repairOverlaps(
      rects, records, acceptedConstraints,
    );
    if (!resizeAutoContainers(rects, records, acceptedConstraints)) break;
    resolved = resolveConstraints(initialConstraints, rects, records);
  }
  const horizontalBpmnAligned = (direction === 'RIGHT' || direction === 'LEFT') && bpmnSpine.length > 1
    && alignHorizontalBpmnSpine028(bpmnSpine, rects, records, request.graph.edges);
  // 0.2.14 Slice 20: Align off-spine / cyclic / grouped horizontal BPMN pairs
  // (event or gateway adjacent to a task) by their visual glyph center so
  // single horizontal edges attach dead-center instead of 16px off-center.
  if ((direction === 'RIGHT' || direction === 'LEFT') && notationId === 'bpmn'
    && !typed?.length && !constraints.length && !request.candidateLayout
    && [...records.values()].every(({ node }) => !node.position && !node.pinned && !node.labelPlacement)) {
    const spineSet = horizontalBpmnAligned ? new Set(bpmnSpine) : new Set<string>();
    const isCaptionedBpmn = (id: string): boolean => {
      const rec = records.get(id);
      if (!rec) return false;
      const sym = renderSymbolId(rec.node, rec.notationId, rec.catalog);
      return isBpmnEventSymbol028(sym) || isBpmnGatewaySymbol028(sym);
    };
    const allRects = [...rects.values()];
    const overlapsOther = (moved: MutableRect): boolean => {
      for (const other of allRects) {
        if (other.id === moved.id) continue;
        if (records.get(other.id)?.node.children?.length || isContainerNode028(records.get(other.id)!.node)) continue;
        if (Math.min(moved.absolutePosition.x + moved.width, other.absolutePosition.x + other.width) -
            Math.max(moved.absolutePosition.x, other.absolutePosition.x) > TOLERANCE &&
          Math.min(moved.absolutePosition.y + moved.height, other.absolutePosition.y + other.height) -
            Math.max(moved.absolutePosition.y, other.absolutePosition.y) > TOLERANCE) {
          return true;
        }
      }
      return false;
    };
    for (const edge of request.graph.edges) {
      const src = rects.get(edge.source);
      const tgt = rects.get(edge.target);
      if (!src || !tgt || src.parentId || tgt.parentId) continue;
      if (records.get(src.id)?.node.children?.length || records.get(tgt.id)?.node.children?.length) continue;
      const horizSep = direction === 'RIGHT'
        ? tgt.absolutePosition.x - (src.absolutePosition.x + src.width)
        : src.absolutePosition.x - (tgt.absolutePosition.x + tgt.width);
      if (horizSep < 10) continue;
      const srcCap = isCaptionedBpmn(src.id);
      const tgtCap = isCaptionedBpmn(tgt.id);
      if (srcCap === tgtCap) continue;
      const mover = srcCap && !spineSet.has(src.id) ? src : tgtCap && !spineSet.has(tgt.id) ? tgt : undefined;
      if (!mover) continue;
      const anchor = mover === src ? tgt : src;
      const deltaY = flowObjectCenter028(anchor, records).y - flowObjectCenter028(mover, records).y;
      if (Math.abs(deltaY) < 2 || Math.abs(deltaY) > 24) continue;
      const savedY = mover.absolutePosition.y;
      moveAbsolute(mover, 'y', savedY + deltaY, rects, records);
      const parentOk = !mover.parentId || containmentSatisfied(rects, records);
      if (!parentOk || overlapsOther(mover)) {
        moveAbsolute(mover, 'y', savedY, rects, records);
      }
    }
  }
  const visualMetrics0210 = (rect: AlignableRect): VisualNodeMetrics0210 => {
    const r = rect as MutableRect, rec = records.get(r.id);
    const isCaptionedIcon = isCaptionedIcon029(r.id, records);
    const hasBottomCaption = isCaptionedIcon && !isSideCaptionDirection0211(direction);
    const f = isCaptionedIcon ? attachmentFrame029(r, rec) : undefined;
    const symId = rec ? renderSymbolId(rec.node, rec.notationId, rec.catalog) : undefined;
    const shpId = symId ? catalogSymbol029(symId, rec?.catalog)?.shape : undefined;
    const ink = f
      ? inkBoundsForFrame0211(shpId, { x: f.absolutePosition.x, y: f.absolutePosition.y, width: f.width, height: f.height })
      : undefined;
    const ctr = ink ? { x: ink.x + ink.width / 2, y: ink.y + ink.height / 2 } : flowObjectCenter028(r, records);
    const cap = isCaptionedIcon ? nodeCaptionBox028(r, records) : undefined;
    return {
      centerOffsetX: ctr.x - r.absolutePosition.x, centerOffsetY: ctr.y - r.absolutePosition.y,
      glyphWidth: ink ? ink.width : r.width, glyphHeight: ink ? ink.height : r.height, hasBottomCaption,
      ...(cap ? { captionBox: { x: cap.x - r.absolutePosition.x, y: cap.y - r.absolutePosition.y, width: cap.width, height: cap.height } } : {}),
    };
  };
  const isFixedPort = (id: string, pId: string | undefined) =>
    Boolean(pId && (records.get(id)?.node.ports?.find((p) => p.id === pId) as DerivedPort | undefined)?.attachment !== 'free');
  const visualFlowAlign: VisualFlowAlignResult0210 = !horizontalBpmnAligned
    && effectiveOptions['elk.algorithm'] === 'layered'
    && effectiveOptions['elk.edgeRouting'] !== 'POLYLINE' && effectiveOptions['elk.edgeRouting'] !== 'SPLINES'
    && !typed?.length && !constraints.length && !request.candidateLayout
    && notationId !== 'uml-class' && notationId !== 'bpmn'
    && (notationId === 'aiml' || notationId === 'data-engineering' || [...records.keys()].some((id) => isCaptionedIcon029(id, records)))
    && request.graph.nodes.every((n) => !n.position && !n.pinned && !n.children?.length && !n.labelPlacement)
    && request.graph.edges.every((e) => !e.routeIntent && !e.labelPlacement && !isFixedPort(e.source, e.sourcePort) && !isFixedPort(e.target, e.targetPort))
    ? alignVisualFlow0210(request.graph, rects, visualMetrics0210, direction,
      Number(effectiveOptions['elk.spacing.nodeNode'] ?? 50), Number(effectiveOptions['elk.layered.spacing.nodeNodeBetweenLayers'] ?? 80))
    : { aligned: false, layerOf: new Map(), corridorMid: [], visualCenter: new Map() };
  const preGroupAlignMatchesCandidate = layout.nodes.every((node) => {
    const rect = rects.get(node.id)!;
    return close(rect.absolutePosition.x, node.absolutePosition.x)
      && close(rect.absolutePosition.y, node.absolutePosition.y)
      && close(rect.width, node.width) && close(rect.height, node.height);
  });
  const flowchartSpineAlign = !visualFlowAlign.aligned && !horizontalBpmnAligned
    && notationId === 'flowchart'
    && effectiveOptions['elk.algorithm'] === 'layered'
    && effectiveOptions['elk.edgeRouting'] !== 'POLYLINE' && effectiveOptions['elk.edgeRouting'] !== 'SPLINES'
    && !typed?.length && !constraints.length && !request.candidateLayout
    && [...records.values()].every(({ node }) => !node.position && !node.pinned && !node.labelPlacement)
    && request.graph.edges.every((e) => !e.routeIntent && !e.labelPlacement && !isFixedPort(e.source, e.sourcePort) && !isFixedPort(e.target, e.targetPort))
    ? alignFlowchartSpine0211(
      request.graph,
      rects,
      direction,
      Number(effectiveOptions['elk.spacing.nodeNode'] ?? 36),
      (id) => records.get(id)?.padding,
    )
    : { aligned: false, spineIds: new Set<string>() };
  let groupAligned = false;
  if (!visualFlowAlign.aligned && !flowchartSpineAlign.aligned && !typed?.length && !constraints.length && !request.candidateLayout
    && effectiveOptions['elk.algorithm'] === 'layered'
    && request.graph.nodes.some((n) => n.children?.length)) {
    groupAligned = alignGroupColumns0211(request.graph, rects, visualMetrics0210, direction, (id) => records.get(id)?.padding);
  }
  const accepted = new Set(resolved.accepted);
  const beforeProximity = !typed?.length && request.graph.edges.some((edge) => edgeProximity028(edge) > 1)
    ? cloneRects(rects) : undefined;
  const preProximityMatchesCandidate = preGroupAlignMatchesCandidate;
  const proximityBaseline = Number(effectiveOptions['elk.layered.spacing.nodeNodeBetweenLayers'] ?? effectiveOptions['elk.spacing.nodeNode'] ?? 50);
  const proximityDiagnostics = typed?.length ? [] : applyProximity028(request.graph, rects, records,
    constraints.filter((constraint) => accepted.has(constraint.id)), direction,
    proximityBaseline);
  if (!containmentSatisfied(rects, records)
    || !constraints.filter((constraint) => accepted.has(constraint.id))
      .every((constraint) => constraintSatisfied(constraint, rects, records))) {
    throw new SpatialLayoutError([{
      code: 'layout.constraint.required-unsatisfied', severity: 'error',
      message: 'Final geometry failed joint containment or constraint verification', path: 'nodes',
    }]);
  }
  const candidateEdges = new Map(layout.edges.map((edge) => [edge.id, edge.sections]));
  const candidateNodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const geometryChanged = [...rects.values()].some((rect) => {
    const candidate = candidateNodes.get(rect.id);
    return !candidate
      || !close(rect.absolutePosition.x, candidate.absolutePosition.x)
      || !close(rect.absolutePosition.y, candidate.absolutePosition.y)
      || !close(rect.width, candidate.width)
      || !close(rect.height, candidate.height);
  });
  const proximityOnlyChanged = geometryChanged && (preProximityMatchesCandidate || groupAligned);
  const proximityMoved = beforeProximity && [...rects.values()].some((rect) => {
    const before = beforeProximity.get(rect.id)!;
    return !close(rect.absolutePosition.x, before.absolutePosition.x)
      || !close(rect.absolutePosition.y, before.absolutePosition.y);
  });
  const useGeneratedRoutes = !geometryChanged || proximityOnlyChanged;
  const generatedBpmnGraph = notationId === 'bpmn'
    && !(request.graph.constraints?.length)
    && !(typed?.length)
    && request.graph.nodes.every((node) => !node.position && !node.pinned && !node.children?.length);
  const coincidentSides = new Map<string, number>();
  const parallel = new Map<string, GraphEdge[]>();
  const outgoingCount = new Map<string, number>(); const incomingCount = new Map<string, number>();
  for (const edge of request.graph.edges) {
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) ?? 0) + 1);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    const key = [edge.source, edge.target].sort().join('\0');
    const values = parallel.get(key) ?? [];
    values.push(edge);
    parallel.set(key, values);
  }
  for (const values of parallel.values()) {
    values.sort((left, right) => left.id.localeCompare(right.id))
      .forEach((edge, index) => coincidentSides.set(edge.id, index % 4));
  }
  const parallelIds = new Set([...parallel.values()].filter(group => group.length > 1 &&
    group[0]!.source !== group[0]!.target).flatMap(group => group.map(edge => edge.id)));
  const separatedFeedbackPairs = new Set((notationId === 'flowchart' || notationId === 'sketch')
    ? [...parallel].filter(([, group]) => group.length > 1 && group.some(edge =>
      horizontalGeneratedFeedbackRoute028(edge, request.graph, rects, records, direction)))
      .map(([key]) => key) : []);
  const rollbackProximity = async (reason: string): Promise<ResolvedLayout> => {
    // A reserved label yields before proximity does: the caller lays out again without it.
    if (reservedLabels) throw new SpatialLayoutError([{ code: 'layout.capability.unsupported', severity: 'error',
      message: `A reserved user-symbol label yields to ${reason}`, path: 'nodes' }]);
    // The same trace: a baseline of the unreserved retry stays unreserved.
    const baseline = await resolveSpatialLayoutOnce029({ ...request,
      graph: { ...request.graph, edges: request.graph.edges.map(withoutProximity028) } }, trace);
    return { ...baseline, diagnostics: [...baseline.diagnostics,
      ...request.graph.edges.filter((edge) => edge.source !== edge.target && edgeProximity028(edge) > 1)
        .map((edge): SpatialLayoutDiagnostic => ({ code: 'layout.proximity.rejected', severity: 'warning',
          message: `Edge "${edge.id}" proximity yields to ${reason}`,
          path: `edges.${edge.id}.proximityHint`, subject: { kind: 'edge', id: edge.id } }))] };
  };
  let edges: ResolvedEdgeRoute[];
  try {
    const constrainedPortRoutes = applyGeometryBoundFreePortAttachments(request.graph, rects, records);
    const classSymbols = notationId === 'uml-class'
      ? resolveSymbolIndex(request.graph.nodes, notationId) : undefined;
    edges = request.graph.edges.map((edge) => {
      if (edge.routeIntent || constrainedPortRoutes.has(edge.id)) {
        return routeEdge(edge, rects, records, coincidentSides.get(edge.id) ?? 0);
      }
      const appearance = classSymbols
        ? resolveEdgeAppearance(edge, classSymbols, notationId, '#000') : undefined;
      const classifierHead = appearance?.source.marker?.kind === 'triangle'
        || appearance?.target.marker?.kind === 'triangle';
      const feedback = notationId === 'flowchart' || notationId === 'sketch'
        ? horizontalGeneratedFeedbackRoute028(edge, request.graph, rects, records, direction)
          ?? (notationId === 'flowchart'
            ? feedbackSideRoute(edge, request.graph, rects, records, direction) : undefined)
        : notationId === 'bpmn'
          ? feedbackSideRoute(edge, request.graph, rects, records, direction) : undefined;
      const branch = (notationId === 'flowchart' || notationId === 'bpmn')
        ? clearDownwardBranchRoute(edge, request.graph, candidateEdges.get(edge.id) ?? [],
          candidateEdges, rects, records, direction, notationId) : undefined;
      const freeBpmn = generatedBpmnGraph && !edge.sourcePort && !edge.targetPort;
      const sourceRect = rects.get(edge.source)!; const targetRect = rects.get(edge.target)!;
      const sourceCenter = flowObjectCenter028(sourceRect, records);
      const targetCenter = flowObjectCenter028(targetRect, records);
      const aligned = close(sourceCenter.x, targetCenter.x) || close(sourceCenter.y, targetCenter.y);
      const branching = outgoingCount.get(edge.source)! > 1 || incomingCount.get(edge.target)! > 1;
      // Preserved positions can disagree with ELK's rank axis. A clear aligned
      // shaft needs contacts from the accepted geometry, not obsolete elbows.
      const actualAlignedGeometry = geometryChanged && aligned;
      const isOrthogonalDirect = effectiveOptions['elk.edgeRouting'] !== 'POLYLINE'
        && effectiveOptions['elk.edgeRouting'] !== 'SPLINES';
      const direct = (!parallelIds.has(edge.id) || separatedFeedbackPairs.has([edge.source, edge.target].sort().join('\0'))) && !feedback && (!branching || aligned || rankReversed.has(edge.id))
        && (!request.candidateLayout || rankReversed.has(edge.id) || freeBpmn || aligned)
        && (useGeneratedRoutes || horizontalBpmnAligned || freeBpmn || actualAlignedGeometry)
        && (!classifierHead || (rankReversed.has(edge.id) && direction === 'DOWN'))
        ? directFreeRoute(edge, rects, records, direction, rankReversed.has(edge.id), notationId === 'bpmn', actualAlignedGeometry, isOrthogonalDirect)
        : undefined;
      const lane = notationId === 'uml-class' && !parallelIds.has(edge.id) && !direct && rankReversed.has(edge.id) && useGeneratedRoutes
        ? straightClassRankLane(edge, rects, records, direction) : undefined;
      const horizontalDetour = horizontalBpmnAligned && !direct
        ? (() => { try { return horizontalBpmnCorridor028(edge, rects, records); } catch { return undefined; } })()
        : undefined;
      const alignedFlowSections = visualFlowAlign.aligned && !parallelIds.has(edge.id) && !feedback
        ? buildAlignedFlowRoute0210(
          edge,
          visualFlowAlign,
          rects,
          visualMetrics0210,
          (rect, toward, axis) =>
            laneAxisPoint029(rect as MutableRect, toward, axis, undefined, records)
              ?? boundaryPoint(rect as MutableRect, toward, undefined, records, 0),
          direction,
          request.graph.edges,
        )
        : undefined;
      const alignedFlow = alignedFlowSections ? { id: edge.id, sections: alignedFlowSections, waypointIds: [] } : undefined;
      return feedback ?? alignedFlow ?? direct ?? lane ?? branch ?? horizontalDetour ?? candidateRoute(
        edge,
        !useGeneratedRoutes ? [] : proximityOnlyChanged
          ? proximitySections028(rankReversed.has(edge.id)
            ? reverseSections(candidateEdges.get(edge.id) ?? []) : candidateEdges.get(edge.id) ?? [],
          edge, candidateNodes, rects) : rankReversed.has(edge.id)
          ? reverseSections(candidateEdges.get(edge.id) ?? [])
          : (candidateEdges.get(edge.id) ?? []),
        rects,
        records,
        coincidentSides.get(edge.id) ?? 0,
      );
    });
    if (notationId === 'block') edges = edges.map((route, index) =>
      simplifyBlockFeedback028(request.graph.edges[index]!, route, request.graph,
        rects, records, direction, candidateEdges));
    request.graph.edges.forEach((edge, index) => {
      const sizes = edge.labelPlacement && edge.label ? (['lowfi', 'hifi'] as const).map((style) => {
        const font = resolveSvgNodeFont(undefined, { ...request.proximitySceneOptions, style });
        return measureEdgeLabel028({ text: edge.label!, fontFamily: font?.cssFamily,
          fontSize: font?.size, fontWeight: font?.weight, lineHeight: font?.lineHeight });
      }) : undefined;
      const labelSize = sizes ? {
        width: Math.max(...sizes.map((size) => size.width)), height: Math.max(...sizes.map((size) => size.height)),
      } : undefined;
      try { avoidNodeCaption028(edge, edges[index]!, rects, records, labelSize); }
      catch (error) {
        // A blocked caption detour falls back to the full obstacle router,
        // which treats every caption as an obstacle; authored routes refuse.
        if (!(error instanceof SpatialLayoutError) || edge.routeIntent || !edges[index]!.sections.length ||
          namesLegacyPin029(edge, (id) => records.get(id)?.node.ports)) throw error;
        const route = edges[index]!; const saved = route.sections;
        try {
          repairGeneratedRoute028(edge, route, request.graph, rects, records,
            finalRouteObstacles028(edge, rects, records), undefined, request.proximitySceneOptions);
        } catch (cause) {
          route.sections = saved;
          if (cause instanceof RouteGeometryError || cause instanceof SpatialLayoutError) throw error;
          throw cause;
        }
      }
    });
    spreadClassifierTriangleContacts(request.graph, edges, rects, records);
  } catch (error) {
    if (proximityMoved && error instanceof SpatialLayoutError)
      return rollbackProximity('verified connector geometry');
    throw error;
  }
  // A separable stretch preserves route shape, but an intervening obstacle
  // need not move with either endpoint. Soft spacing yields atomically if the
  // actual final generated path would cross a third-party painted body.
  if (proximityMoved && !generatedRoutesClear028(request.graph, edges, rects, records)) {
    return rollbackProximity('generated connector obstacle clearance');
  }
  // A reserved label also moves the geometry an authored placement is checked against.
  if ((proximityMoved || reservedLabels) && (request.graph.edges.some((edge) => edge.label && edge.labelPlacement) ||
    [...records.values()].some(({ node }) => node.labelPlacement))) {
    const nodes = [...records].map(([id, { node }]) => {
      const rest = { ...node };
      delete rest.children;
      const rect = rects.get(id)!;
      return { ...rest, position: rect.absolutePosition,
        dimensions: { width: rect.width, height: rect.height } };
    });
    const styles = request.proximitySceneOptions?.style
      ? [request.proximitySceneOptions.style] : ['lowfi', 'hifi'] as const;
    try {
      for (const style of styles) prepareSpatialScene028({ ...request.graph, nodes }, {
        ...request.proximitySceneOptions, style, layoutDirection: direction,
        edgeRoutes: new Map(edges.map((edge) => [edge.id, edge.sections])), semanticGraph: request.graph,
      });
    } catch (error) {
      if (error instanceof RenderCapabilityError) return rollbackProximity('authored label placement and scene clearance');
      throw error;
    }
  }
  const is0214Graph = typeof request.graph.metadata?.custom?.coralEdition === 'string' &&
    /^0\.2\.(?:1[4-9]|[2-9]\d)|^[1-9]|^0\.[3-9]/.test(request.graph.metadata.custom.coralEdition);
  const authoredRouting0214 = request.graph.layoutOptions?.edgeRouting
    ?? (request.graph as { layoutOptions028?: { edgeRouting?: string } }).layoutOptions028?.edgeRouting;
  const resolvedRoutingStyle0211: 'orthogonal' | 'polyline' | 'splines' =
    (is0214Graph && !authoredRouting0214 && (notationId === 'block' || notationId === 'architecture' || notationId === 'erd'))
      ? 'orthogonal'
      : effectiveOptions['elk.edgeRouting'] === 'POLYLINE' || notationId === 'block' ? 'polyline'
      : effectiveOptions['elk.edgeRouting'] === 'SPLINES' || notationId === 'sketch' ? 'splines'
      : 'orthogonal';
  const hasReservedUserLabel = [...records.values()].some((r) => Boolean(r.reservedLabel029));
  if (!typed?.length && !request.candidateLayout && !request.execution?.engine
    && !hasReservedUserLabel
    && notationId !== 'uml-class'
    && rects.size <= 80 && edges.length <= 160
    && effectiveOptions['elk.algorithm'] === 'layered') {
    const infoCache = new Map<string, BatchNodeInfo0211>();
    const getNodeInfo = (id: string): BatchNodeInfo0211 | undefined => {
      const cached = infoCache.get(id);
      if (cached) return cached;
      const rect = rects.get(id);
      const rec = records.get(id);
      if (!rect || !rec) return undefined;
      const isContainer = Boolean(rec.node.children?.length || isContainerNode028(rec.node));
      const symbolId = renderSymbolId(rec.node, rec.notationId, rec.catalog);
      const isGateway = isBpmnGatewaySymbol028(symbolId);
      const isEvent = isBpmnEventSymbol028(symbolId);
      const isStateCircle = isStateCircleSymbol0217(symbolId);
      const isStateBar = isStateSyncBarSymbol0217(symbolId);
      const shapeId = isGateway ? 'diamond'
        : (isEvent || isStateCircle) ? 'circle'
        : isStateBar ? 'rectangle'
        : (symbolId ? catalogSymbol029(symbolId, rec.catalog)?.shape : undefined)
        ?? 'rectangle';
      const isCaptionedIcon = isCaptionedIcon029(id, records);
      const sideCaption = isSideCaptionDirection0211(direction);
      const hasBottomCaption = !sideCaption && (isCaptionedIcon
        || (isGateway && Boolean(rec.node.label))
        || (isEvent && Boolean(rec.node.label)));
      const hasRightCaption = sideCaption && (isCaptionedIcon
        || (isGateway && Boolean(rec.node.label))
        || (isEvent && Boolean(rec.node.label)));
      const gf = isGateway
        ? (() => {
          const g = bpmnGatewayFrame028(rect.width, rect.height, direction);
          return { absolutePosition: { x: rect.absolutePosition.x + g.x, y: rect.absolutePosition.y + g.y }, width: g.width, height: g.height };
        })()
        : isEvent
          ? (() => {
            const ev = bpmnEventFrame028(rect.width, rect.height, direction);
            return { absolutePosition: { x: rect.absolutePosition.x + ev.x, y: rect.absolutePosition.y + ev.y }, width: ev.width, height: ev.height };
          })()
          : isStateCircle
            ? (() => {
              const r = stateCircleRadius0217(rect.width, rect.height);
              return { absolutePosition: { x: rect.absolutePosition.x + rect.width / 2 - r, y: rect.absolutePosition.y + rect.height / 2 - r }, width: r * 2, height: r * 2 };
            })()
            : isStateBar
              ? undefined
              : isCaptionedIcon
                ? attachmentFrame029(rect, rec)
                : (!isContainer ? (() => {
                  const shape = catalogShape029(shapeId, rec.catalog);
                  if (!shape || shape.type !== 'path') return undefined;
                  const fit = stencilFit028(shape, rect.width, rect.height);
                  return {
                    absolutePosition: { x: rect.absolutePosition.x + fit.offsetX, y: rect.absolutePosition.y + fit.offsetY },
                    width: fit.fittedWidth,
                    height: fit.fittedHeight,
                  };
                })() : undefined);
      const rawFrame = gf
        ? { x: gf.absolutePosition.x, y: gf.absolutePosition.y, width: gf.width, height: gf.height }
        : { x: rect.absolutePosition.x, y: rect.absolutePosition.y, width: rect.width, height: rect.height };
      const frame = (isContainer || isStateCircle || isStateBar) ? rawFrame : inkBoundsForFrame0211(shapeId, rawFrame);
      const cap = rec.reservedLabel029
        ? reservedLabelBox029(rect, rec.reservedLabel029, 4)
        : nodeCaptionBox028(rect, records);
      const info: BatchNodeInfo0211 = {
        shapeId,
        notationId: rec.notationId,
        symbolId,
        frame,
        hasBottomCaption,
        hasRightCaption,
        ...(cap && cap.width > 0 && cap.height > 0 ? { captionBox: cap } : {}),
        isContainer,
      };
      infoCache.set(id, info);
      return info;
    };
    const contourContact = (nodeId: string, side: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST', along: number): Point | undefined => {
      const rect = rects.get(nodeId);
      const info = getNodeInfo(nodeId);
      if (!rect || !info) return undefined;
      const f = info.frame;
      const toward: Point = side === 'WEST' ? { x: f.x - 100, y: along }
        : side === 'EAST' ? { x: f.x + f.width + 100, y: along }
        : side === 'NORTH' ? { x: along, y: f.y - 100 }
        : { x: along, y: f.y + f.height + 100 };
      const axis = side === 'WEST' || side === 'EAST' ? 'y' : 'x';
      return laneAxisPoint029(rect, toward, axis, undefined, records, 2)
        ?? boundaryPoint(rect, toward, undefined, records, 0);
    };
    coordinateBatchRoutes0211({
      graph: request.graph,
      routes: edges,
      rects,
      nodeInfo: getNodeInfo,
      isFixedPort,
      contourContact,
      direction,
      routingStyle: resolvedRoutingStyle0211,
    });
  }
  validateFinalRoutes028(request.graph, edges, rects, records,
    effectiveOptions['elk.edgeRouting'] === 'ORTHOGONAL' ? 'orthogonal' : effectiveOptions['elk.edgeRouting'] === 'POLYLINE' ? 'polyline' : undefined,
    request.proximitySceneOptions, authoredRoutingStyle);
  let labelBounds028: ResolvedLayout['labelBounds028'];
  if (typed?.length) {
    const extra = resolveTypedGeometry028(typed, request.graph, rects, records, edges,
      request.proximitySceneOptions, constraints, direction, proximityBaseline,
      effectiveOptions['elk.edgeRouting'] === 'ORTHOGONAL' ? 'orthogonal' : effectiveOptions['elk.edgeRouting'] === 'POLYLINE' ? 'polyline' : undefined,
      authoredRoutingStyle);
    edges = extra.edges;
    labelBounds028 = extra.labels;
    resolved = { accepted: extra.accepted, rejected: extra.rejected, diagnostics: extra.diagnostics };
    overlapDiagnostics = [];
  }
  // The ordinary pass and each typed trial already validate their final
  // routes. No geometry changes after the accepted typed state is installed.
  checkCancelled();
  const nodes = publicRects(rects);
  const maxX = Math.max(0, ...nodes.map((node) => node.absolutePosition.x + node.width));
  const maxY = Math.max(0, ...nodes.map((node) => node.absolutePosition.y + node.height));
  return {
    revision: request.revision,
    ...(labelBounds028 ? { labelBounds028 } : {}),
    nodes,
    edges,
    width: Math.max(layout.width, maxX),
    height: Math.max(layout.height, maxY),
    acceptedConstraintIds: resolved.accepted.filter((id) => !id.startsWith('__coral_bpmn_')),
    rejectedConstraintIds: resolved.rejected.filter((id) => !id.startsWith('__coral_bpmn_')),
    diagnostics: [...layout.diagnostics, ...resolved.diagnostics, ...overlapDiagnostics, ...proximityDiagnostics,
      ...(degradedRouteSink029.get(records) ?? [])],
  };
}
