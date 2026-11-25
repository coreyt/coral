import type { CandidateEdgeSyntax } from '@coral-viz/language';
import type { SuccessorSourceGraph028 } from './successorSourceProjection028.js';

export interface SourceLayoutCapabilityNotice028 {
  severity: 'warning';
  code: 'coral.layout.proximity.unapplied';
  message: string;
  subject: { kind: 'edge'; id: string };
  range?: CandidateEdgeSyntax['operator']['range'];
}

/** Source intent is retained in the successor graph; the current layout
 * adapter must say which accepted hints it has not yet executed. */
export function sourceLayoutCapabilityNotices028(
  graph: SuccessorSourceGraph028,
  edgeStatements: readonly CandidateEdgeSyntax[] = [],
): SourceLayoutCapabilityNotice028[] {
  const rangesMatch = edgeStatements.length === graph.edges.length;
  return graph.edges.flatMap((edge, index) => {
    if ((edge.proximityHint ?? 1) <= 1 || edge.first.node !== edge.second.node) return [];
    const operator = rangesMatch ? edgeStatements[index]?.operator : undefined;
    return [{
      severity: 'warning' as const,
      code: 'coral.layout.proximity.unapplied' as const,
      message: `Edge ${edge.id} preserves its ${edge.proximityHint}-position proximity hint, but a self-connection has no distinct endpoint separation to influence.`,
      subject: { kind: 'edge' as const, id: edge.id },
      ...(operator ? { range: operator.range } : {}),
    }];
  });
}
