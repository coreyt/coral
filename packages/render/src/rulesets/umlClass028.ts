import type { GraphIR } from '@graph-ir/core';
import type { RulesetDefinition } from '../conformance028.js';

/** One source-evidenced generalization check, the approved bounded UML class inventory. */
export const umlClassRuleset028: RulesetDefinition<GraphIR> = {
  id: 'coral-uml-class', profileId: 'uml-class', version: '0.2.8-bounded.1',
  scope: 'coral-bounded-profile', coverage: 'complete', obligations: [],
  rules: [{
    id: 'CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE', minimumLevel: 'strict', severity: 'error',
    provenance: { kind: 'standard', reference: 'OMG UML 2.5.1 §9.2.4.2 Generalization notation' },
    evidenceScope: 'edge',
    remediation: 'Use an open triangle at the general classifier, for example Child --|> Base [inheritance].',
    check: (graph) => graph.edges.flatMap((edge) => {
      if (edge.type !== 'inheritance') return [];
      // An absent GraphIR end is a catalog default, not an explicit authored
      // mark. A source operator always supplies its literal end separately.
      const marker = edge.targetEnd?.marker;
      if (!marker || marker.kind === 'triangle' && marker.fill === 'open') return [];
      const mark = marker.kind === 'triangle' ? `${marker.fill} triangle` : marker.kind;
      return [{ message: `Inheritance ${edge.id} has an explicit ${mark} end rather than an open triangle`,
        subject: { kind: 'edge' as const, id: edge.id } }];
    }),
  }],
};
