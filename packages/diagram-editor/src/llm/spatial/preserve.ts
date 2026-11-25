import type { GraphIR } from '@coral-viz/language';
import type { SpatialPlan, SpatialPreservationResult } from './types';
import { deepEqual, indexNodes, isSubsequence, omit } from './graph';

const GRAPH_ALLOWED = new Set(['name', 'metadata', 'nodes', 'edges']);
const NODE_ALLOWED = new Set(['type', 'label', 'description', 'symbol', 'variant', 'properties', 'sourceInfo', 'children']);
const EDGE_ALLOWED = new Set(['type', 'label', 'properties', 'style', 'sourceInfo']);

export function checkSpatialPreservation(original: GraphIR, candidate: GraphIR, plan: SpatialPlan): SpatialPreservationResult {
  const movable = movableSubjectIds(plan);
  const preserved = plan.classification === 'spatial-only'
    ? deepEqual(maskPositions(original, movable), maskPositions(candidate, movable))
    : preservesMixed(original, candidate, movable);
  return preserved ? { success: true, diagnostics: [] } : failure();
}

function movableSubjectIds(plan: SpatialPlan): Set<string> {
  const ids = new Set(plan.operation.subjectIds);
  if (plan.operation.kind === 'arrange') {
    const pinned = new Set(plan.snapshot.filter((node) => node.pinned).map((node) => node.id));
    for (const id of pinned) ids.delete(id);
  }
  return ids;
}

function maskPositions(graph: GraphIR, ids: ReadonlySet<string>): GraphIR {
  const visit = (nodes: GraphIR['nodes']): GraphIR['nodes'] => nodes.map((node) => ({
    ...node,
    ...(ids.has(node.id) ? { position: { x: 0, y: 0 } } : {}),
    ...(node.children ? { children: visit(node.children) } : {}),
  }));
  return { ...graph, nodes: visit(graph.nodes) };
}

function preservesMixed(original: GraphIR, candidate: GraphIR, movable: ReadonlySet<string>): boolean {
  if (!deepEqual(omit(original, GRAPH_ALLOWED), omit(candidate, GRAPH_ALLOWED))) return false;
  if (!isSubsequence(original.nodes.map((node) => node.id), candidate.nodes.map((node) => node.id))) return false;
  const originalNodes = indexNodes(original);
  const candidateNodes = indexNodes(candidate);
  if (!originalNodes || !candidateNodes) return false;
  for (const [id, baseline] of originalNodes) {
    const current = candidateNodes.get(id);
    if (!current || current.parentId !== baseline.parentId || !isSubsequence(baseline.childIds, current.childIds)) return false;
    const excluded = new Set(NODE_ALLOWED);
    if (movable.has(id)) excluded.add('position');
    if (!deepEqual(omit(baseline.node, excluded), omit(current.node, excluded))) return false;
  }

  const candidateEdges = new Map<string, GraphIR['edges'][number]>();
  for (const edge of candidate.edges) {
    if (candidateEdges.has(edge.id)) return false;
    candidateEdges.set(edge.id, edge);
  }
  for (const edge of original.edges) {
    const current = candidateEdges.get(edge.id);
    if (!current || !deepEqual(omit(edge, EDGE_ALLOWED), omit(current, EDGE_ALLOWED))) return false;
  }
  return true;
}

function failure(): SpatialPreservationResult {
  return {
    success: false,
    diagnostics: [{ code: 'spatial.preservation', message: 'The candidate changes protected graph structure or geometry' }],
  };
}
