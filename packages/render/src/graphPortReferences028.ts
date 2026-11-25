import type { GraphIR, GraphNode } from '@graph-ir/core';
import { allGraphNodes028 } from './graphNodes028.js';
import { resolveNotationNode028 } from './notations/index.js';
import type { NodeInterpretation028 } from './interpretation028.js';
import { assertSemanticSidecar028 } from './semanticSidecar028.js';
import { assessPortReferences028, type PortReferenceAssessment028,
  type SourceRange028 } from './portReferences028.js';
import type { SourceEdgeDirection028 } from './sourceDirection028.js';

export type PortReferenceRanges028 = ReadonlyMap<string, {
  sourcePort?: SourceRange028;
  targetPort?: SourceRange028;
}>;

/** GraphIR 3 source/target order alone does not establish direction. */
function portDirectionEvidence028(edge: GraphIR['edges'][number], profileId: string):
  'first-to-second' | 'second-to-first' | 'unverified' {
  if (edge.sourceEnd === undefined && edge.targetEnd === undefined) return 'unverified';
  const first = edge.sourceEnd?.marker?.kind;
  const second = edge.targetEnd?.marker?.kind;
  if (['architecture', 'flowchart', 'uml-sequence'].includes(profileId) &&
    (first === undefined || first === 'none') &&
    (second === 'arrow' || (profileId === 'uml-sequence' && second === 'triangle'))) {
    return 'first-to-second';
  }
  if (['architecture', 'flowchart'].includes(profileId) && first === 'arrow' && second === 'none') {
    return 'second-to-first';
  }
  return 'unverified';
}

/** Catalog-port references supersede GraphIR 3's geometric-port-only result.
 * This helper has no schema/Ajv dependency, so browser and conformance share it. */
export function assessGraphPortReferences028(graph: GraphIR, profileId: string,
  ranges?: PortReferenceRanges028,
  semanticInterpretations?: ReadonlyMap<string, NodeInterpretation028>,
  sourceDirections?: ReadonlyMap<string, SourceEdgeDirection028>): {
    assessments: Array<{ index: number; assessment: PortReferenceAssessment028 }>;
    supersededGraphIrPaths: ReadonlySet<string>;
    supersededRoutePortPaths: ReadonlySet<string>;
  } {
  if (semanticInterpretations) assertSemanticSidecar028(graph, profileId, semanticInterpretations);
  const nodeById = new Map<string, GraphNode>();
  const ambiguousIds = new Set<string>();
  for (const node of allGraphNodes028(graph.nodes)) {
    if (nodeById.has(node.id)) ambiguousIds.add(node.id);
    else nodeById.set(node.id, node);
  }
  const edgeIdCounts = new Map<string, number>();
  for (const edge of graph.edges) edgeIdCounts.set(edge.id, (edgeIdCounts.get(edge.id) ?? 0) + 1);
  const supersededGraphIrPaths = new Set<string>();
  const supersededRoutePortPaths = new Set<string>();
  // Route anchors use a semantic namespace only when the successor sidecar
  // above has passed its exact node/catalog identity check. Plain GraphIR 3
  // validation must continue to require its authored geometric ports.
  if (semanticInterpretations) graph.edges.forEach((edge, index) => {
    edge.routeIntent?.waypoints.forEach((waypoint, waypointIndex) => {
      const anchor = waypoint.placement.kind === 'relative' ? waypoint.placement.anchor : undefined;
      if (anchor?.kind !== 'port') return;
      const owner = nodeById.get(anchor.nodeId);
      const interpreted = semanticInterpretations.get(anchor.nodeId);
      if (!owner || owner.ports !== undefined || ambiguousIds.has(owner.id) ||
        !interpreted || interpreted.portCollisions.includes(anchor.portId) ||
        !interpreted.semanticPorts.some((port) => port.id === anchor.portId)) return;
      supersededRoutePortPaths.add(`/edges/${index}/routeIntent/waypoints/${waypointIndex}/placement/anchor/portId`);
    });
  });
  const assessments = graph.edges.flatMap((edge, index) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target || ambiguousIds.has(source.id) || ambiguousIds.has(target.id)) return [];
    if (source.ports === undefined && edge.sourcePort !== undefined)
      supersededGraphIrPaths.add(`/edges/${index}/sourcePort`);
    if (target.ports === undefined && edge.targetPort !== undefined)
      supersededGraphIrPaths.add(`/edges/${index}/targetPort`);
    const tokenRanges = edgeIdCounts.get(edge.id) === 1 ? ranges?.get(edge.id) : undefined;
    const interpretation = (node: GraphNode): NodeInterpretation028 => {
      if (!semanticInterpretations) return resolveNotationNode028(node, profileId);
      const resolved = semanticInterpretations.get(node.id);
      if (!resolved) throw new Error(`coral.port.interpretation.missing: ${node.id}`);
      return resolved;
    };
    return [{ index, assessment: assessPortReferences028({ edgeId: edge.id,
      source: interpretation(source),
      target: interpretation(target),
      edgeDirection: sourceDirections
        ? edgeIdCounts.get(edge.id) === 1 ? sourceDirections.get(edge.id) ?? 'unverified' : 'unverified'
        : portDirectionEvidence028(edge, profileId),
      ...(source.ports === undefined && edge.sourcePort !== undefined ? { sourcePort: edge.sourcePort } : {}),
      ...(target.ports === undefined && edge.targetPort !== undefined ? { targetPort: edge.targetPort } : {}),
      ...(tokenRanges?.sourcePort ? { sourceRange: tokenRanges.sourcePort } : {}),
      ...(tokenRanges?.targetPort ? { targetRange: tokenRanges.targetPort } : {}),
    }) }];
  });
  return { assessments, supersededGraphIrPaths, supersededRoutePortPaths };
}
