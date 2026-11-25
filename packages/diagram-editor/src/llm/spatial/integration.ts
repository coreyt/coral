import type { Node } from '@xyflow/react';
import type { Diagnostic, GraphIR } from '@coral-viz/language';
import { parse } from '@coral-viz/language/parser';
import { printCoralDSLWithDiagnostics } from '../../printer';
import { applySpatialPlan, materializeSpatialSnapshot } from './apply';
import { evaluateSpatialPlan } from './evaluate';
import { indexNodes } from './graph';
import type {
  CapturedNodeGeometry,
  SpatialDiagnostic,
  SpatialEvidence,
  SpatialPlan,
} from './types';

type SpatialNode = Node<Record<string, unknown>>;

function dimensions(width: unknown, height: unknown) {
  return typeof width === 'number' && Number.isFinite(width) && width > 0
    && typeof height === 'number' && Number.isFinite(height) && height > 0
    ? { width, height }
    : undefined;
}

function printableScalar(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

function hydrateProperties(
  baseline: Record<string, unknown> | undefined,
  candidate: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!baseline) return candidate;
  const result = { ...candidate };
  for (const [key, value] of Object.entries(baseline)) {
    if (!(key in result) && !printableScalar(value)) result[key] = value;
  }
  return Object.keys(result).length ? result : undefined;
}

const NODE_SURFACE_FIELDS = new Set([
  'id', 'type', 'label', 'properties', 'position', 'pinned', 'children', 'parent',
]);
const EDGE_SURFACE_FIELDS = new Set([
  'id', 'source', 'target', 'type', 'label', 'properties', 'style',
]);

function hydrateMissingFields<T extends object>(
  baseline: T,
  candidate: T,
  surfaceFields: ReadonlySet<string>,
): T {
  const hydrated = { ...candidate } as T;
  const record = hydrated as Record<string, unknown>;
  for (const [key, value] of Object.entries(baseline)) {
    if (!surfaceFields.has(key) && !(key in record)) record[key] = value;
  }
  return hydrated;
}

/** Capture the React Flow coordinate boundary once, without viewport state. */
export function captureSpatialGeometry(nodes: readonly SpatialNode[]): CapturedNodeGeometry[] {
  return nodes.map((node) => {
    const size = dimensions(node.measured?.width, node.measured?.height)
      ?? dimensions(node.width, node.height)
      ?? dimensions(node.data?.width, node.data?.height);
    if (!size) throw new Error(`Spatial geometry for "${node.id}" has no finite dimensions`);
    if (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) {
      throw new Error(`Spatial geometry for "${node.id}" has no finite position`);
    }
    const origin = node.origin ?? [0, 0];
    if (!Number.isFinite(origin[0]) || !Number.isFinite(origin[1])) {
      throw new Error(`Spatial geometry for "${node.id}" has no finite origin`);
    }
    return {
      id: node.id,
      position: { x: node.position.x, y: node.position.y },
      width: size.width,
      height: size.height,
      origin: [origin[0], origin[1]] as const,
      ...(node.parentId ? { parentId: node.parentId } : {}),
    };
  });
}

/**
 * Reattach only canonical data omitted by the Coral surface. Candidate
 * membership, hierarchy, order, endpoints, and spellable changes remain
 * visible to C30's preservation policy.
 */
export function hydrateSpatialCandidate(
  original: GraphIR,
  candidate: GraphIR,
  _plan: SpatialPlan,
): GraphIR {
  const originals = indexNodes(original);
  if (!originals) return candidate;

  const hydrateNodes = (nodes: GraphIR['nodes']): GraphIR['nodes'] => nodes.map((node) => {
    const baseline = originals.get(node.id)?.node;
    if (!baseline) {
      return node.children ? { ...node, children: hydrateNodes(node.children) } : node;
    }
    const children = node.children ? hydrateNodes(node.children) : undefined;
    const hydrated = hydrateMissingFields(baseline, node, NODE_SURFACE_FIELDS);
    hydrated.properties = hydrateProperties(baseline.properties, node.properties);
    if (!hydrated.properties) delete hydrated.properties;
    if (Object.prototype.hasOwnProperty.call(baseline, 'sourceInfo')) {
      hydrated.sourceInfo = baseline.sourceInfo;
    } else delete hydrated.sourceInfo;
    if (children) hydrated.children = children;
    else delete hydrated.children;
    // Nesting/order are candidate-owned; preserve only the original legacy flat
    // parent marker so the parser's redundant marker cannot become a new field.
    if (Object.prototype.hasOwnProperty.call(baseline, 'parent')) hydrated.parent = baseline.parent;
    else delete hydrated.parent;
    return hydrated;
  });

  const unused = new Set(original.edges.map((edge) => edge.id));
  const byPair = new Map<string, GraphIR['edges']>();
  for (const edge of original.edges) {
    const key = `${edge.source}\u0000${edge.target}`;
    const values = byPair.get(key) ?? [];
    values.push(edge);
    byPair.set(key, values);
  }
  const pairOffsets = new Map<string, number>();
  const hydrateEdges = candidate.edges.map((edge) => {
    let baseline = original.edges.find((item) => item.id === edge.id && unused.has(item.id));
    if (!baseline) {
      const key = `${edge.source}\u0000${edge.target}`;
      const offset = pairOffsets.get(key) ?? 0;
      baseline = byPair.get(key)?.slice(offset).find((item) => unused.has(item.id));
      pairOffsets.set(key, offset + 1);
    }
    if (!baseline) return edge;
    unused.delete(baseline.id);
    const hydrated = hydrateMissingFields(baseline, edge, EDGE_SURFACE_FIELDS);
    hydrated.id = baseline.id;
    if (Object.prototype.hasOwnProperty.call(baseline, 'sourceInfo')) {
      hydrated.sourceInfo = baseline.sourceInfo;
    } else delete hydrated.sourceInfo;
    const baselineUnspellableStyle = { ...(baseline.style ?? {}) };
    delete baselineUnspellableStyle.lineStyle;
    const style = { ...baselineUnspellableStyle, ...edge.style };
    if (Object.keys(style).length) hydrated.style = style;
    else delete hydrated.style;
    hydrated.properties = hydrateProperties(baseline.properties, edge.properties);
    if (!hydrated.properties) delete hydrated.properties;
    return hydrated;
  });

  return {
    ...original,
    nodes: hydrateNodes(candidate.nodes),
    edges: hydrateEdges,
  };
}

export type SpatialFinalizeResult =
  | {
      success: true;
      graph: GraphIR;
      dsl: string;
      evidence: readonly SpatialEvidence[];
      diagnostics: readonly [];
      printDiagnostics: readonly Diagnostic[];
    }
  | {
      success: false;
      graph: GraphIR;
      evidence: readonly SpatialEvidence[];
      diagnostics: readonly SpatialDiagnostic[];
    };

/** Apply, print, and independently audit the projection without committing it. */
export function finalizeSpatialCandidate(
  original: GraphIR,
  candidate: GraphIR,
  plan: SpatialPlan,
): SpatialFinalizeResult {
  const applied = applySpatialPlan({ original, candidate, plan });
  if (!applied.success) return applied;
  const printed = printCoralDSLWithDiagnostics(applied.graph);
  const replay = parse(printed.text, { graphId: applied.graph.id });
  if (!replay.success || !replay.graph) {
    return {
      success: false,
      graph: original,
      evidence: [],
      diagnostics: [{ code: 'spatial.outcome.unsatisfied', message: 'The printed spatial result cannot be parsed' }],
    };
  }
  const hydratedReplay = hydrateSpatialCandidate(applied.graph, {
    ...replay.graph, id: applied.graph.id, version: applied.graph.version,
  }, plan);
  // Dependencies absent from authored GraphIR are injected only into this
  // discarded audit graph. The returned graph/text stay transient.
  const evaluation = evaluateSpatialPlan(materializeSpatialSnapshot(hydratedReplay, plan), plan);
  if (!evaluation.success) return {
    success: false,
    graph: original,
    evidence: evaluation.evidence,
    diagnostics: evaluation.diagnostics,
  };
  return {
    success: true,
    graph: applied.graph,
    dsl: printed.text,
    evidence: evaluation.evidence,
    diagnostics: [],
    printDiagnostics: printed.diagnostics,
  };
}
