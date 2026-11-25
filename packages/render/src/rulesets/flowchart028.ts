import type { GraphEdge, GraphIR } from '@graph-ir/core';
import type { RulesetDefinition } from '../conformance028.js';
import { resolveNotationNode028 } from '../notations/index.js';
import { allGraphNodes028 } from '../graphNodes028.js';
import type { SourceEdgeDirection028 } from '../sourceDirection028.js';

type SourceDirections028 = ReadonlyMap<string, SourceEdgeDirection028>;

const isFlow = (type: string | undefined): boolean => type === undefined || type === 'flow';
const hasMarker = (edgeEnd: GraphEdge['sourceEnd']): boolean =>
  edgeEnd?.marker !== undefined && edgeEnd.marker.kind !== 'none';
const twoEndedFlow = (edge: GraphEdge): boolean =>
  isFlow(edge.type) && hasMarker(edge.sourceEnd) && hasMarker(edge.targetEnd);
const explicitlyNeutralFlow = (edge: GraphEdge): boolean =>
  isFlow(edge.type) && edge.sourceEnd?.marker?.kind === 'none' &&
  edge.targetEnd?.marker?.kind === 'none';
function uncertainKind(edge: GraphEdge, sourceDirections?: SourceDirections028): 'two-ended' | 'neutral' | undefined {
  if (!isFlow(edge.type)) return undefined;
  const authored = sourceDirections?.get(edge.id);
  if (authored !== undefined) return authored === 'both' ? 'two-ended'
    : authored === 'none' ? 'neutral' : undefined;
  return twoEndedFlow(edge) ? 'two-ended'
    : explicitlyNeutralFlow(edge) ? 'neutral' : undefined;
}
/** A source operator without one-way traversal, or an ambiguous legacy edge,
 * cannot prove a decision flow's entry/exit role. */
export function uncertainDecisionFlows028(graph: GraphIR, sourceDirections?: SourceDirections028): readonly {
  decisionId: string; edgeId: string; kind: 'two-ended' | 'neutral';
}[] {
  const decisions = new Set(allGraphNodes028(graph.nodes)
    .filter((node) => resolveNotationNode028(node, 'flowchart').effectiveSymbolId === 'flowchart-decision')
    .map((node) => node.id));
  return graph.edges.flatMap((edge) => {
    const kind = uncertainKind(edge, sourceDirections);
    if (!kind) return [];
    return [...new Set([edge.source, edge.target])].filter((id) => decisions.has(id))
      .map((decisionId) => ({ decisionId, edgeId: edge.id, kind }));
  });
}
/** A lone first-end arrow reverses flow, but not authored endpoint identity. */
function reverseFlow(edge: GraphEdge, sourceDirections?: SourceDirections028): boolean {
  const authored = sourceDirections?.get(edge.id);
  if (authored !== undefined) return authored === 'second-to-first';
  const farEnd = edge.targetEnd?.marker?.kind;
  return edge.sourceEnd?.marker?.kind === 'arrow' &&
    (farEnd === undefined || farEnd === 'none');
}
const flowFrom = (edge: GraphEdge, sourceDirections?: SourceDirections028): string =>
  reverseFlow(edge, sourceDirections) ? edge.target : edge.source;
const flowTo = (edge: GraphEdge, sourceDirections?: SourceDirections028): string =>
  reverseFlow(edge, sourceDirections) ? edge.source : edge.target;

function decisionFlowBounds(graph: GraphIR, sourceDirections?: SourceDirections028): Map<string, {
  entries: number; exits: number; uncertain: number }> {
  const bounds = new Map<string, { entries: number; exits: number; uncertain: number }>(allGraphNodes028(graph.nodes)
    .filter((node) => resolveNotationNode028(node, 'flowchart').effectiveSymbolId === 'flowchart-decision')
    .map((node) => [node.id, { entries: 0, exits: 0, uncertain: 0 }]));
  for (const edge of graph.edges) {
    if (!isFlow(edge.type)) continue;
    if (uncertainKind(edge, sourceDirections)) {
      for (const id of new Set([edge.source, edge.target])) {
        const count = bounds.get(id);
        if (count) count.uncertain++;
      }
    } else {
      const entry = bounds.get(flowTo(edge, sourceDirections));
      if (entry) entry.entries++;
      const exit = bounds.get(flowFrom(edge, sourceDirections));
      if (exit) exit.exits++;
    }
  }
  return bounds;
}

/** Bounded Coral strict interpretation of ISO 5807 decision alternatives. */
export function flowchartRulesetWithSourceDirections028(
  sourceDirections?: SourceDirections028,
): RulesetDefinition<GraphIR> {
  return {
  id: 'coral-flowchart', profileId: 'flowchart', version: '0.2.8-bounded.1',
  scope: 'coral-bounded-profile', coverage: 'complete', obligations: [],
  rules: [{
    id: 'CORAL.FLOWCHART.DECISION.SINGLE_ENTRY', minimumLevel: 'strict', severity: 'error',
    provenance: { kind: 'coral', reference: 'Coral interpretation of ISO 5807:1985 §9.2.2.4' },
    evidenceScope: 'node',
    remediation: 'Give this decision exactly one incoming flow, or use a non-decision symbol.',
    check: (graph) => [...decisionFlowBounds(graph, sourceDirections)].flatMap(([id, { entries, uncertain }]) =>
      entries > 1 || entries + uncertain < 1
        ? [{ message: `Decision ${id} has ${entries} certain entr${entries === 1 ? 'y' : 'ies'}; Coral strict requires one`,
          subject: { kind: 'node' as const, id } }] : []),
  }, {
    id: 'CORAL.FLOWCHART.DECISION.ALTERNATIVES', minimumLevel: 'strict', severity: 'error',
    provenance: { kind: 'coral', reference: 'Coral interpretation of ISO 5807:1985 §9.2.2.4' },
    evidenceScope: 'node',
    remediation: 'Add another mutually exclusive exit or use a non-decision symbol.',
    check: (graph) => [...decisionFlowBounds(graph, sourceDirections)].flatMap(([id, { exits, uncertain }]) =>
      exits + uncertain < 2 ? [{ message: `Decision ${id} has at most ${exits + uncertain} exit${exits + uncertain === 1 ? '' : 's'}; Coral strict requires alternatives`,
        subject: { kind: 'node' as const, id } }] : []),
  }],
  };
}

export const flowchartRuleset028 = flowchartRulesetWithSourceDirections028();
