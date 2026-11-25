import { assessPortReferences028, type PortReferenceAssessment028,
  type SourceRange028 } from './portReferences028.js';
import { resolveSuccessorGraphNodes028 } from './successorInterpretation028.js';
import type { NodeInterpretation028 } from './interpretation028.js';
import type { SuccessorSourceGraph028 } from './successorSourceProjection028.js';

export type SuccessorWrittenPortRanges028 = ReadonlyMap<string, {
  firstPort?: SourceRange028;
  secondPort?: SourceRange028;
}>;

/** Validate source-owned endpoint identity and direction without inferring them
 * from a temporary GraphIR 3 display or a diagram-specific arrow convention. */
export function assessSuccessorSourcePortReferences028(
  source: SuccessorSourceGraph028,
  ranges?: SuccessorWrittenPortRanges028,
  interpretations: ReadonlyMap<string, NodeInterpretation028> = resolveSuccessorGraphNodes028(source),
): {
  assessments: Array<{ index: number; assessment: PortReferenceAssessment028 }>;
  supersededGraphIrPaths: ReadonlySet<string>;
} {
  const edgeIdCounts = new Map<string, number>();
  for (const edge of source.edges) edgeIdCounts.set(edge.id, (edgeIdCounts.get(edge.id) ?? 0) + 1);
  const supersededGraphIrPaths = new Set<string>();
  const assessments = source.edges.flatMap((edge, index) => {
    const first = interpretations.get(edge.first.node);
    const second = interpretations.get(edge.second.node);
    // Missing nodes are diagnosed by graph integrity; no false port finding
    // can be derived from an endpoint whose identity is unresolved.
    if (!first || !second) return [];
    const reverseSequence = !!source.interaction && edge.direction === 'second-to-first';
    if (edge.first.port !== undefined) {
      supersededGraphIrPaths.add(`/edges/${index}/${reverseSequence ? 'targetPort' : 'sourcePort'}`);
    }
    if (edge.second.port !== undefined) {
      supersededGraphIrPaths.add(`/edges/${index}/${reverseSequence ? 'sourcePort' : 'targetPort'}`);
    }
    const located = edgeIdCounts.get(edge.id) === 1 ? ranges?.get(edge.id) : undefined;
    return [{ index, assessment: assessPortReferences028({ edgeId: edge.id,
      source: first, target: second, edgeDirection: edge.direction,
      ...(edge.first.port !== undefined ? { sourcePort: edge.first.port } : {}),
      ...(edge.second.port !== undefined ? { targetPort: edge.second.port } : {}),
      ...(located?.firstPort ? { sourceRange: located.firstPort } : {}),
      ...(located?.secondPort ? { targetRange: located.secondPort } : {}),
    }) }];
  });
  return { assessments, supersededGraphIrPaths };
}

export interface PortLimitDiagnostic029 {
  code: 'coral.port.connections.exceeded';
  nodeId: string;
  portId: string;
  count: number;
  limit: number;
  message: string;
  /** The first endpoint beyond the limit, in edge order. */
  range?: SourceRange028;
  /** Every later endpoint beyond the limit. */
  related?: Array<{ message: string; range: SourceRange028 }>;
}

/** A port's count is the number of connector endpoints that name it; an edge
 * naming one port at both ends counts twice, and a port-less endpoint never
 * counts. Ports whose identity is not certified are skipped. */
export function assessSuccessorSourcePortLimits029(
  source: SuccessorSourceGraph028,
  interpretations: ReadonlyMap<string, NodeInterpretation028> = resolveSuccessorGraphNodes028(source),
  ranges?: SuccessorWrittenPortRanges028,
): PortLimitDiagnostic029[] {
  const edgeIdCounts = new Map<string, number>();
  for (const edge of source.edges) edgeIdCounts.set(edge.id, (edgeIdCounts.get(edge.id) ?? 0) + 1);
  const endpoints = new Map<string, { nodeId: string; portId: string; ranges: Array<SourceRange028 | undefined> }>();
  for (const edge of source.edges) {
    const located = edgeIdCounts.get(edge.id) === 1 ? ranges?.get(edge.id) : undefined;
    for (const [end, range] of [[edge.first, located?.firstPort], [edge.second, located?.secondPort]] as const) {
      if (end.port === undefined) continue;
      const key = JSON.stringify([end.node, end.port]);
      const entry = endpoints.get(key) ?? { nodeId: end.node, portId: end.port, ranges: [] };
      entry.ranges.push(range);
      endpoints.set(key, entry);
    }
  }
  const diagnostics: PortLimitDiagnostic029[] = [];
  for (const { nodeId, portId, ranges: named } of endpoints.values()) {
    const interpretation = interpretations.get(nodeId);
    if (!interpretation || interpretation.status === 'unknown-symbol' || interpretation.status === 'unknown-variant' ||
      interpretation.portCollisions.includes(portId) || interpretation.invalidAnchorPortIds.includes(portId)) continue;
    const limit = interpretation.semanticPorts.find((port) => port.id === portId)?.maxConnections;
    if (limit === undefined || named.length <= limit) continue;
    const [first, ...later] = named.slice(limit);
    const related = later.flatMap((range) => range ? [{ message: 'Further connection beyond the limit', range }] : []);
    diagnostics.push({ code: 'coral.port.connections.exceeded', nodeId, portId, count: named.length, limit,
      message: `Port ${portId} on ${nodeId} has ${named.length} connections; its limit is ${limit}.`,
      ...(first ? { range: first } : {}), ...(related.length ? { related } : {}) });
  }
  return diagnostics;
}
