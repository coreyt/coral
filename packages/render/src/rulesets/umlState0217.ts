import type { GraphEdge, GraphIR } from '@graph-ir/core';
import type { RulesetDefinition } from '../conformance028.js';
import { installedCatalogSnapshot0217, resolveNotationNode028 } from '../notations/index.js';
import { allGraphNodes028 } from '../graphNodes028.js';
import type { SourceEdgeDirection028 } from '../sourceDirection028.js';

type SourceDirections028 = ReadonlyMap<string, SourceEdgeDirection028>;

const isTransition = (edge: GraphEdge): boolean => edge.type === undefined || edge.type === 'transition';
function reverseFlow(edge: GraphEdge, sourceDirections?: SourceDirections028): boolean {
  const authored = sourceDirections?.get(edge.id);
  if (authored !== undefined) return authored === 'second-to-first';
  const farEnd = edge.targetEnd?.marker?.kind;
  return edge.sourceEnd?.marker?.kind === 'arrow' && (farEnd === undefined || farEnd === 'none');
}

function transitionDegrees(graph: GraphIR, sourceDirections?: SourceDirections028): {
  symbols: Map<string, string | undefined>;
  incoming: Map<string, number>;
  outgoing: Map<string, number>;
} {
  const catalog = installedCatalogSnapshot0217('uml-state');
  const symbols = new Map<string, string | undefined>();
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const node of allGraphNodes028(graph.nodes)) {
    symbols.set(node.id, resolveNotationNode028(node, 'uml-state', catalog).effectiveSymbolId);
    incoming.set(node.id, 0);
    outgoing.set(node.id, 0);
  }
  for (const edge of graph.edges) {
    if (!isTransition(edge)) continue;
    const rev = reverseFlow(edge, sourceDirections);
    const from = rev ? edge.target : edge.source;
    const to = rev ? edge.source : edge.target;
    if (outgoing.has(from)) outgoing.set(from, outgoing.get(from)! + 1);
    if (incoming.has(to)) incoming.set(to, incoming.get(to)! + 1);
  }
  return { symbols, incoming, outgoing };
}

/** Bounded Coral edition 0.2.17 UML 2.5 state machine structural ruleset. */
export function umlStateRulesetWithSourceDirections0217(
  sourceDirections?: SourceDirections028,
): RulesetDefinition<GraphIR> {
  return {
    id: 'coral-uml-state',
    profileId: 'uml-state',
    version: '0.2.17-bounded.1',
    scope: 'coral-bounded-profile',
    coverage: 'complete',
    obligations: [],
    rules: [
      {
        id: 'CORAL.UML.STATE.INITIAL.NO_INCOMING',
        minimumLevel: 'strict',
        severity: 'error',
        provenance: { kind: 'coral', reference: 'OMG UML 2.5.1 §14.2.3.8 (initial pseudostate)' },
        evidenceScope: 'node',
        remediation: 'Remove incoming transitions targeting the initial pseudostate.',
        check: (graph) => {
          const { symbols, incoming } = transitionDegrees(graph, sourceDirections);
          return [...symbols].flatMap(([id, sym]) =>
            sym === 'uml-state-initial' && (incoming.get(id) ?? 0) > 0
              ? [{ message: `Initial pseudostate ${id} cannot have incoming transitions`, subject: { kind: 'node' as const, id } }]
              : []);
        },
      },
      {
        id: 'CORAL.UML.STATE.INITIAL.OUTGOING_REQUIRED',
        minimumLevel: 'strict',
        severity: 'error',
        provenance: { kind: 'coral', reference: 'OMG UML 2.5.1 §14.2.3.8 (initial pseudostate)' },
        evidenceScope: 'node',
        remediation: 'Give the initial pseudostate exactly one outgoing transition.',
        check: (graph) => {
          const { symbols, outgoing } = transitionDegrees(graph, sourceDirections);
          return [...symbols].flatMap(([id, sym]) =>
            sym === 'uml-state-initial' && (outgoing.get(id) ?? 0) !== 1
              ? [{ message: `Initial pseudostate ${id} has ${outgoing.get(id) ?? 0} outgoing transitions; expected 1`, subject: { kind: 'node' as const, id } }]
              : []);
        },
      },
      {
        id: 'CORAL.UML.STATE.FINAL.NO_OUTGOING',
        minimumLevel: 'strict',
        severity: 'error',
        provenance: { kind: 'coral', reference: 'OMG UML 2.5.1 §14.2.3.6 (FinalState)' },
        evidenceScope: 'node',
        remediation: 'Remove outgoing transitions leaving the final state.',
        check: (graph) => {
          const { symbols, outgoing } = transitionDegrees(graph, sourceDirections);
          return [...symbols].flatMap(([id, sym]) =>
            sym === 'uml-state-final' && (outgoing.get(id) ?? 0) > 0
              ? [{ message: `Final state ${id} cannot have outgoing transitions`, subject: { kind: 'node' as const, id } }]
              : []);
        },
      },
      {
        id: 'CORAL.UML.STATE.CHOICE.BRANCHES',
        minimumLevel: 'strict',
        severity: 'error',
        provenance: { kind: 'coral', reference: 'OMG UML 2.5.1 §14.2.3.8 (choice pseudostate)' },
        evidenceScope: 'node',
        remediation: 'Give the choice pseudostate at least one incoming and two outgoing transitions.',
        check: (graph) => {
          const { symbols, incoming, outgoing } = transitionDegrees(graph, sourceDirections);
          return [...symbols].flatMap(([id, sym]) =>
            sym === 'uml-state-choice' && ((incoming.get(id) ?? 0) < 1 || (outgoing.get(id) ?? 0) < 2)
              ? [{ message: `Choice pseudostate ${id} requires >= 1 incoming and >= 2 outgoing transitions`, subject: { kind: 'node' as const, id } }]
              : []);
        },
      },
      {
        id: 'CORAL.UML.STATE.FORK_JOIN.DEGREE',
        minimumLevel: 'strict',
        severity: 'error',
        provenance: { kind: 'coral', reference: 'OMG UML 2.5.1 §14.2.3.8 (fork/join pseudostate)' },
        evidenceScope: 'node',
        remediation: 'A fork requires >= 1 incoming and >= 2 outgoing transitions; a join requires >= 2 incoming and >= 1 outgoing transitions.',
        check: (graph) => {
          const { symbols, incoming, outgoing } = transitionDegrees(graph, sourceDirections);
          return [...symbols].flatMap(([id, sym]) => {
            const inc = incoming.get(id) ?? 0;
            const out = outgoing.get(id) ?? 0;
            if (sym === 'uml-state-fork' && (inc < 1 || out < 2)) {
              return [{ message: `Fork pseudostate ${id} requires >= 1 incoming and >= 2 outgoing transitions`, subject: { kind: 'node' as const, id } }];
            }
            if (sym === 'uml-state-join' && (inc < 2 || out < 1)) {
              return [{ message: `Join pseudostate ${id} requires >= 2 incoming and >= 1 outgoing transitions`, subject: { kind: 'node' as const, id } }];
            }
            return [];
          });
        },
      },
    ],
  };
}

export const umlStateRuleset0217 = umlStateRulesetWithSourceDirections0217();
