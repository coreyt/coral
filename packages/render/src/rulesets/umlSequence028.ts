import type { GraphIR, InteractionMessage } from '@graph-ir/core';
import type { RulesetDefinition } from '../conformance028.js';

const authoredKinds: Readonly<Record<string, InteractionMessage['kind']>> = {
  sync: 'synchronous', async: 'asynchronous', return: 'return', create: 'create', destroy: 'destroy',
};

/** Bounded profile check; operator and explicit type are both retained. */
export const umlSequenceRuleset028: RulesetDefinition<GraphIR> = {
  id: 'coral-uml-sequence', profileId: 'uml-sequence', version: '0.2.8-bounded.1',
  scope: 'coral-bounded-profile', coverage: 'complete', obligations: [],
  rules: [{
    id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT', minimumLevel: 'typical',
    severity: 'warning', strictSeverity: 'error',
    provenance: { kind: 'coral', reference: 'Coral 0.2.8 UML sequence operator/type agreement' },
    evidenceScope: 'edge',
    remediation: 'Make the explicit message type and connector operator agree.',
    check: (graph) => {
      const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
      return (graph.interaction?.messages ?? []).flatMap((message) => {
        const edge = edges.get(message.edgeId);
        const authored = edge?.type === undefined ? undefined : authoredKinds[edge.type];
        if (!edge || !authored || authored === message.kind) return [];
        return [{ message: `Explicit sequence type ${edge.type} conflicts with operator-derived ${message.kind}`,
          subject: { kind: 'edge' as const, id: edge.id } }];
      });
    },
  }, {
    id: 'CORAL.UML.SEQUENCE.TYPE_UNRECOGNIZED', minimumLevel: 'typical',
    severity: 'error',
    provenance: { kind: 'coral', reference: 'Coral 0.2.8 UML sequence message-kind vocabulary' },
    evidenceScope: 'edge',
    remediation: 'Use sync, async, return, create, or destroy, or omit the bracketed type and let the operator supply it.',
    check: (graph) => {
      const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
      return (graph.interaction?.messages ?? []).flatMap((message) => {
        const edge = edges.get(message.edgeId);
        if (!edge?.type || authoredKinds[edge.type]) return [];
        return [{ message: `Explicit sequence type ${edge.type} is not a supported message kind`,
          subject: { kind: 'edge' as const, id: edge.id } }];
      });
    },
  }],
};
