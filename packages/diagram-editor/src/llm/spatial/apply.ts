import type { GraphIR } from '@coral-viz/language';
import type { SpatialApplyInput, SpatialApplyResult, SpatialPlan } from './types';
import { evaluateSpatialPlan } from './evaluate';
import { deepEqual, indexNodes, isSubsequence, updateNodePositions } from './graph';
import { checkSpatialPreservation } from './preserve';
import { computeSpatialPositions } from './transform';

export function applySpatialPlan({ original, candidate, plan }: SpatialApplyInput): SpatialApplyResult {
  const stale = checkFreshness(original, plan);
  if (stale) return failed(original, stale);
  const preservation = checkSpatialPreservation(original, candidate, plan);
  if (!preservation.success) return failed(original, preservation.diagnostics);
  const positions = computeSpatialPositions(plan);
  if (!positions.success) return failed(original, positions.diagnostics);
  const graph = updateNodePositions(candidate, new Map(positions.positions.map((entry) => [entry.id, entry.position])));
  const evaluation = evaluateSpatialPlan(graph, plan);
  if (!evaluation.success) return failed(original, evaluation.diagnostics, evaluation.evidence);
  return { success: true, graph, evidence: evaluation.evidence, diagnostics: [] };
}

export function materializeSpatialSnapshot(graph: GraphIR, plan: SpatialPlan): GraphIR {
  const indexed = indexNodes(graph);
  if (!indexed) return graph;
  const subjects = new Set(plan.operation.subjectIds);
  const snapshot = new Map(plan.snapshot.map((node) => [node.id, node]));
  const positions = new Map<string, { x: number; y: number }>();
  for (const id of plan.positionDependencies) {
    const position = subjects.has(id) ? indexed.get(id)?.node.position : snapshot.get(id)?.canonicalPosition;
    if (position) positions.set(id, position);
  }
  return updateNodePositions(graph, positions);
}

function checkFreshness(original: GraphIR, plan: SpatialPlan): readonly [{ code: 'spatial.plan.stale'; message: string; entityIds?: readonly string[] }] | undefined {
  if (original.id !== plan.graphId || original.version !== plan.graphVersion) return stale('The graph identity or version changed');
  const indexed = indexNodes(original);
  if (!indexed) return stale('The graph contains duplicate node IDs');
  if (plan.classification === 'spatial-only'
    && (indexed.size !== plan.snapshot.length || original.edges.length !== plan.baselineEdges.length)) {
    return stale('The spatial-only graph membership changed');
  }
  const baselineIds = new Set(plan.snapshot.map((node) => node.id));
  const baselineRoots = plan.snapshot.filter((node) => node.parentId === undefined).map((node) => node.id);
  const currentRoots = original.nodes.map((node) => node.id).filter((id) => baselineIds.has(id));
  if (!deepEqual(currentRoots, baselineRoots)) return stale('The top-level node order changed');
  const expected = computeSpatialPositions(plan);
  const expectedPositions = expected.success ? new Map(expected.positions.map((entry) => [entry.id, entry.position])) : new Map();
  const dependencies = new Set(plan.positionDependencies);
  for (const item of plan.snapshot) {
    const current = indexed.get(item.id);
    if (!current || current.parentId !== item.parentId
      || !deepEqual(current.node.dimensions, item.dimensions)
      || Boolean(current.node.pinned) !== item.pinned
      || !isSubsequence(item.childIds, current.childIds.filter((id) => baselineIds.has(id)))) {
      return stale('The planned node structure or geometry changed', [item.id]);
    }
    if (dependencies.has(item.id)) {
      const baselineMatches = deepEqual(current.node.position, item.baselinePosition);
      const expectedPosition = expectedPositions.get(item.id);
      const acceptedResultMatches = expectedPosition !== undefined && deepEqual(current.node.position, expectedPosition);
      if (!baselineMatches && !acceptedResultMatches) return stale('A position dependency changed', [item.id]);
    }
  }
  const edges = new Map(original.edges.map((edge) => [edge.id, edge]));
  for (const baseline of plan.baselineEdges) {
    const current = edges.get(baseline.id);
    if (!current || current.source !== baseline.source || current.target !== baseline.target
      || current.sourcePort !== baseline.sourcePort || current.targetPort !== baseline.targetPort) {
      return stale('A planned edge endpoint changed', [baseline.id]);
    }
  }
  return undefined;
}

function stale(message: string, entityIds?: readonly string[]) {
  return [{ code: 'spatial.plan.stale' as const, message, ...(entityIds ? { entityIds } : {}) }] as const;
}

function failed(
  original: GraphIR,
  diagnostics: SpatialApplyResult['diagnostics'],
  evidence: SpatialApplyResult['evidence'] = [],
): SpatialApplyResult {
  return { success: false, graph: original, evidence, diagnostics };
}
