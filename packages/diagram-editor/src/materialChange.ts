import type { GraphIR } from './printer';

export const MATERIAL_DISPLACEMENT_OUTLIER_PX = 80;
export const MATERIAL_SMALL_GRAPH_MAX_NODES = 4;
export const MATERIAL_OVERLAP_TOLERANCE_PX = 1;

export interface MaterialChangeEvidence {
  nodes: { added: string[]; removed: string[]; matched: number; smallGraph: boolean };
  renames: Array<{ from: string; to: string }>;
  nodeFields: { changed: number };
  edges: { added: string[]; removed: string[]; redirected: string[]; fieldChanges: number };
  constraints: { positionChanged: number; pinChanged: number; waypointChanged: number; containmentChanged: number };
  displacement: { p50: number; p95: number; max: number; outliers: string[] };
  quality: {
    overlapsBefore: number; overlapsAfter: number; invalidRoutes: string[];
    routeLengthBefore: number; routeLengthAfter: number;
    routeCrossingsBefore: number; routeCrossingsAfter: number;
  };
  inventory: { pinsBefore: number; pinsAfter: number; waypointsBefore: number; waypointsAfter: number };
  observedLatencyMs: number | null;
}

type FlatNode = GraphIR['nodes'][number] & { parentId?: string };

export function evaluateMaterialChange(
  before: GraphIR,
  after: GraphIR,
  options: {
    renameMap?: Readonly<Record<string, string>>;
    observedLatencyMs?: number;
    /** Like-for-like geometry for the quality fields only; see {@link qualityGraphs}. */
    quality?: { before: GraphIR; after: GraphIR };
  } = {},
): MaterialChangeEvidence {
  const oldNodes = new Map(flatten(before.nodes).map((node) => [node.id, node]));
  const newNodes = new Map(flatten(after.nodes).map((node) => [node.id, node]));
  const oldQualityNodes = absoluteQualityNodes(oldNodes);
  const newQualityNodes = absoluteQualityNodes(newNodes);
  const seenRenameTargets = new Set<string>();
  const renames = Object.entries(options.renameMap ?? {})
    .filter(([from, to]) => {
      if (from === to || !oldNodes.has(from) || !newNodes.has(to) || seenRenameTargets.has(to)) return false;
      seenRenameTargets.add(to);
      return true;
    });
  const renamedFrom = new Set(renames.map(([from]) => from));
  const renamedTo = new Set(renames.map(([, to]) => to));
  const added = [...newNodes.keys()].filter((id) => !oldNodes.has(id) && !renamedTo.has(id));
  const removed = [...oldNodes.keys()].filter((id) => !newNodes.has(id) && !renamedFrom.has(id));
  const matchedPairs = [
    ...[...oldNodes.keys()].filter((id) => newNodes.has(id)).map((id) => [id, id] as const),
    ...renames.map(([from, to]) => [from, to] as const),
  ];
  let nodeFields = 0;
  let positionChanged = 0;
  let pinChanged = 0;
  let containmentChanged = 0;
  const distances: Array<{ id: string; value: number }> = [];
  for (const [oldId, newId] of matchedPairs) {
    const oldNode = oldNodes.get(oldId)!;
    const newNode = newNodes.get(newId)!;
    if (!same(pickAuthoredNodeFields(oldNode), pickAuthoredNodeFields(newNode))) nodeFields += 1;
    if (!same(oldNode.position, newNode.position)) positionChanged += 1;
    if (Boolean(oldNode.pinned) !== Boolean(newNode.pinned)) pinChanged += 1;
    if (oldNode.parentId !== newNode.parentId) containmentChanged += 1;
    const oldAbsolute = oldQualityNodes.get(oldId)?.position;
    const newAbsolute = newQualityNodes.get(newId)?.position;
    if (oldAbsolute && newAbsolute) {
      distances.push({ id: newId, value: Math.hypot(newAbsolute.x - oldAbsolute.x, newAbsolute.y - oldAbsolute.y) });
    }
  }

  const oldEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const newEdges = new Map(after.edges.map((edge) => [edge.id, edge]));
  const edgeAdded = [...newEdges.keys()].filter((id) => !oldEdges.has(id));
  const edgeRemoved = [...oldEdges.keys()].filter((id) => !newEdges.has(id));
  const redirected: string[] = [];
  let edgeFieldChanges = 0;
  let waypointChanged = 0;
  for (const [id, oldEdge] of oldEdges) {
    const newEdge = newEdges.get(id);
    if (!newEdge) continue;
    if (oldEdge.source !== newEdge.source || oldEdge.target !== newEdge.target
      || oldEdge.sourcePort !== newEdge.sourcePort || oldEdge.targetPort !== newEdge.targetPort) redirected.push(id);
    if (!same(pickAuthoredEdgeFields(oldEdge), pickAuthoredEdgeFields(newEdge))) edgeFieldChanges += 1;
    if (!same(oldEdge.routingPoints, newEdge.routingPoints)) waypointChanged += 1;
  }
  const sorted = distances.map((item) => item.value).sort((a, b) => a - b);
  return {
    nodes: { added, removed, matched: matchedPairs.length, smallGraph: oldNodes.size <= MATERIAL_SMALL_GRAPH_MAX_NODES },
    renames: renames.map(([from, to]) => ({ from, to })),
    nodeFields: { changed: nodeFields },
    edges: { added: edgeAdded, removed: edgeRemoved, redirected, fieldChanges: edgeFieldChanges },
    constraints: { positionChanged, pinChanged, waypointChanged, containmentChanged },
    displacement: {
      p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95),
      max: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
      outliers: distances.filter((item) => item.value > MATERIAL_DISPLACEMENT_OUTLIER_PX).map((item) => item.id),
    },
    quality: options.quality
      ? layoutQuality(options.quality.before, options.quality.after)
      : layoutQuality(before, after, { oldQualityNodes, newQualityNodes, newNodes }),
    inventory: {
      pinsBefore: [...oldNodes.values()].filter((node) => node.pinned === true).length,
      pinsAfter: [...newNodes.values()].filter((node) => node.pinned === true).length,
      waypointsBefore: before.edges.reduce((count, edge) => count + (edge.routingPoints?.length ?? 0), 0),
      waypointsAfter: after.edges.reduce((count, edge) => count + (edge.routingPoints?.length ?? 0), 0),
    },
    observedLatencyMs: Number.isFinite(options.observedLatencyMs) ? options.observedLatencyMs! : null,
  };
}

function layoutQuality(
  before: GraphIR,
  after: GraphIR,
  prepared?: {
    oldQualityNodes: Map<string, FlatNode>;
    newQualityNodes: Map<string, FlatNode>;
    newNodes: Map<string, FlatNode>;
  },
): MaterialChangeEvidence['quality'] {
  const newNodes = prepared?.newNodes ?? new Map(flatten(after.nodes).map((node) => [node.id, node]));
  const oldQualityNodes = prepared?.oldQualityNodes
    ?? absoluteQualityNodes(new Map(flatten(before.nodes).map((node) => [node.id, node])));
  const newQualityNodes = prepared?.newQualityNodes ?? absoluteQualityNodes(newNodes);
  const newEdges = new Map(after.edges.map((edge) => [edge.id, edge]));
  const comparableEdgeIds = new Set(before.edges
    .filter((edge) => {
      const next = newEdges.get(edge.id);
      return next?.source === edge.source && next.target === edge.target
        && next.sourcePort === edge.sourcePort && next.targetPort === edge.targetPort;
    })
    .map((edge) => edge.id));
  const comparableBefore = { ...before, edges: before.edges.filter((edge) => comparableEdgeIds.has(edge.id)) };
  const comparableAfter = { ...after, edges: after.edges.filter((edge) => comparableEdgeIds.has(edge.id)) };
  return {
    overlapsBefore: countOverlaps(oldQualityNodes),
    overlapsAfter: countOverlaps(newQualityNodes),
    invalidRoutes: after.edges.filter((edge) => !newNodes.has(edge.source) || !newNodes.has(edge.target)
      || (edge.routingPoints?.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)) ?? false))
      .map((edge) => edge.id),
    routeLengthBefore: routeLength(comparableBefore, oldQualityNodes),
    routeLengthAfter: routeLength(comparableAfter, newQualityNodes),
    routeCrossingsBefore: routeCrossings(before, oldQualityNodes),
    routeCrossingsAfter: routeCrossings(after, newQualityNodes),
  };
}

type Point = { x: number; y: number };

/** Displayed canvas geometry for one side of a layout-quality comparison. */
export interface QualityScene {
  /** `position` is parent-relative when `parent` is set, as XYFlow stores it. */
  nodes: Array<{ id: string; parent?: string; position?: Point; width?: number; height?: number }>;
  /** `routed` is the rendered polyline; `authored` holds authored waypoints. */
  edges: Array<{ id: string; source: string; target: string; routed?: Point[]; authored?: Point[] }>;
}

/**
 * Build the two quality graphs from the same kind of displayed geometry
 * (R-054 AC-1). A node present on both sides is scored only when both sides
 * know its position and size; a one-sided node is scored when its side does.
 * An edge is dropped with any endpoint left out for missing geometry, while
 * an endpoint absent from the scene stays an invalid route. A routed polyline
 * is used only when both sides have one; otherwise authored waypoints are.
 */
export function qualityGraphs(before: QualityScene, after: QualityScene): { before: GraphIR; after: GraphIR } {
  const measured = (node: QualityScene['nodes'][number]) => Boolean(node.position
    && Number.isFinite(node.position.x) && Number.isFinite(node.position.y)
    && Number.isFinite(node.width) && Number.isFinite(node.height));
  const beforeById = new Map(before.nodes.map((node) => [node.id, node]));
  const afterById = new Map(after.nodes.map((node) => [node.id, node]));
  const unmeasured = new Set([...beforeById.keys(), ...afterById.keys()].filter((id) => {
    const a = beforeById.get(id);
    const b = afterById.get(id);
    return (a !== undefined && !measured(a)) || (b !== undefined && !measured(b));
  }));
  const excluded = (id: string, byId: Map<string, QualityScene['nodes'][number]>) => {
    const seen = new Set<string>();
    for (let current: string | undefined = id; current && !seen.has(current); current = byId.get(current)?.parent) {
      if (unmeasured.has(current)) return true;
      seen.add(current);
    }
    return false;
  };
  const routedOnBoth = new Set(before.edges.filter((edge) => edge.routed?.length
    && after.edges.find((candidate) => candidate.id === edge.id)?.routed?.length).map((edge) => edge.id));
  const build = (scene: QualityScene, byId: Map<string, QualityScene['nodes'][number]>): GraphIR => {
    const kept = scene.nodes.filter((node) => !excluded(node.id, byId));
    const nest = (parent?: string): GraphIR['nodes'] => kept
      .filter((node) => node.parent === parent)
      .map((node) => {
        const children = nest(node.id);
        return {
          id: node.id, type: 'node', position: { ...node.position! },
          dimensions: { width: node.width!, height: node.height! },
          ...(children.length ? { children } : {}),
        };
      });
    const edges = scene.edges
      .filter((edge) => !(byId.has(edge.source) && excluded(edge.source, byId))
        && !(byId.has(edge.target) && excluded(edge.target, byId)))
      .map((edge) => {
        const points = routedOnBoth.has(edge.id) ? edge.routed : edge.authored;
        return {
          id: edge.id, source: edge.source, target: edge.target,
          ...(points?.length ? { routingPoints: points.map((point) => ({ ...point })) } : {}),
        };
      });
    return { version: '3.0.0', id: 'quality', nodes: nest(undefined), edges };
  };
  return { before: build(before, beforeById), after: build(after, afterById) };
}

export type LayoutOperation = 'initial-generation' | 'explicit-reflow' | 'ai-change';
export type LayoutStrategy = 'preserve' | 'preserve-and-reroute' | 'incremental' | 'full';

export function selectLayoutStrategy(evidence: MaterialChangeEvidence, operation: LayoutOperation): LayoutStrategy {
  if (operation === 'initial-generation' || operation === 'explicit-reflow') return 'full';
  if (evidence.edges.added.length || evidence.edges.removed.length || evidence.edges.redirected.length) {
    return 'preserve-and-reroute';
  }
  if (hasMaterialQualityRegression(evidence) || evidence.constraints.containmentChanged > 0) return 'incremental';
  if (evidence.nodes.added.length > 0) return 'incremental';
  return 'preserve';
}

/** Full layout is a quality-gated retry, never a membership-percentage shortcut. */
export function shouldEscalateBroadLayout(evidence: MaterialChangeEvidence): boolean {
  const structuralAxes = Number(evidence.nodes.added.length + evidence.nodes.removed.length > 0)
    + Number(evidence.edges.added.length + evidence.edges.removed.length + evidence.edges.redirected.length > 0)
    + Number(evidence.constraints.positionChanged + evidence.constraints.pinChanged
      + evidence.constraints.waypointChanged + evidence.constraints.containmentChanged > 0);
  return structuralAxes >= 2 && hasMaterialQualityRegression(evidence);
}

export function hasMaterialQualityRegression(evidence: MaterialChangeEvidence): boolean {
  const routeInflated = evidence.quality.routeLengthBefore > 0
    && evidence.quality.routeLengthAfter > evidence.quality.routeLengthBefore * 2;
  return evidence.quality.overlapsAfter > evidence.quality.overlapsBefore
    || evidence.quality.invalidRoutes.length > 0
    || evidence.quality.routeCrossingsAfter > evidence.quality.routeCrossingsBefore
    || routeInflated;
}

function flatten(nodes: GraphIR['nodes'], parentId?: string): FlatNode[] {
  return nodes.flatMap((node) => {
    const { children, ...rest } = node;
    const flat = { ...rest, ...(parentId ? { parentId } : {}) } as FlatNode;
    return [flat, ...flatten(children ?? [], node.id)];
  });
}

function pickAuthoredNodeFields(node: FlatNode) {
  const { position: _position, pinned: _pinned, dimensions: _dimensions, ...fields } = node;
  return fields;
}

function pickAuthoredEdgeFields(edge: GraphIR['edges'][number]) {
  const { routingPoints: _routing, source: _source, target: _target,
    sourcePort: _sourcePort, targetPort: _targetPort, ...fields } = edge;
  return fields;
}

function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function absoluteQualityNodes(nodes: Map<string, FlatNode>): Map<string, FlatNode> {
  const absolute = new Map<string, FlatNode>();
  const resolve = (id: string, visiting = new Set<string>()): FlatNode | undefined => {
    const cached = absolute.get(id);
    if (cached) return cached;
    const node = nodes.get(id);
    if (!node || visiting.has(id)) return node;
    visiting.add(id);
    const parent = node.parentId ? resolve(node.parentId, visiting) : undefined;
    const position = node.position && parent?.position
      ? { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y }
      : node.position;
    const resolved = { ...node, ...(position ? { position } : {}) };
    absolute.set(id, resolved);
    return resolved;
  };
  for (const id of nodes.keys()) resolve(id);
  return absolute;
}

function isAncestor(ancestorId: string, nodeId: string, nodes: Map<string, FlatNode>): boolean {
  const seen = new Set<string>();
  let parent = nodes.get(nodeId)?.parentId;
  while (parent && !seen.has(parent)) {
    if (parent === ancestorId) return true;
    seen.add(parent);
    parent = nodes.get(parent)?.parentId;
  }
  return false;
}

function countOverlaps(nodes: Map<string, FlatNode>): number {
  const values = [...nodes.values()];
  let count = 0;
  for (let left = 0; left < values.length; left += 1) {
    const a = values[left];
    if (!a.position || !a.dimensions) continue;
    for (let right = left + 1; right < values.length; right += 1) {
      const b = values[right];
      if (!b.position || !b.dimensions) continue;
      if (isAncestor(a.id, b.id, nodes) || isAncestor(b.id, a.id, nodes)) continue;
      const width = Math.min(a.position.x + a.dimensions.width, b.position.x + b.dimensions.width)
        - Math.max(a.position.x, b.position.x);
      const height = Math.min(a.position.y + a.dimensions.height, b.position.y + b.dimensions.height)
        - Math.max(a.position.y, b.position.y);
      if (width > MATERIAL_OVERLAP_TOLERANCE_PX && height > MATERIAL_OVERLAP_TOLERANCE_PX) count += 1;
    }
  }
  return count;
}
function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)];
}

function routeSegments(graph: GraphIR, nodes: Map<string, FlatNode>) {
  return graph.edges.flatMap((edge) => {
    const source = nodes.get(edge.source)?.position;
    const target = nodes.get(edge.target)?.position;
    if (!source || !target) return [];
    const points = [source, ...(edge.routingPoints ?? []), target];
    return points.slice(1).map((point, index) => ({ edgeId: edge.id, a: points[index], b: point }));
  });
}

function routeLength(graph: GraphIR, nodes: Map<string, FlatNode>): number {
  return routeSegments(graph, nodes).reduce(
    (sum, segment) => sum + Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y), 0,
  );
}

function routeCrossings(graph: GraphIR, nodes: Map<string, FlatNode>): number {
  const segments = routeSegments(graph, nodes);
  let crossings = 0;
  const orientation = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
    Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  for (let left = 0; left < segments.length; left += 1) {
    for (let right = left + 1; right < segments.length; right += 1) {
      const a = segments[left]; const b = segments[right];
      if (a.edgeId === b.edgeId) continue;
      const sharedEndpoint = [a.a, a.b].some((point) => [b.a, b.b]
        .some((other) => point.x === other.x && point.y === other.y));
      if (sharedEndpoint) continue;
      if (orientation(a.a, a.b, b.a) * orientation(a.a, a.b, b.b) < 0
        && orientation(b.a, b.b, a.a) * orientation(b.a, b.b, a.b) < 0) crossings += 1;
    }
  }
  return crossings;
}
