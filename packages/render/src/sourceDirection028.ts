import type { CandidateEdgeSyntax } from '@coral-viz/language';

export type SourceEdgeDirection028 = 'first-to-second' | 'second-to-first' | 'both' | 'none';

/** The authored operator, not keyed visual end marks, owns traversal. */
export function sourceEdgeDirection028(edge: CandidateEdgeSyntax): SourceEdgeDirection028 {
  const operator = edge.operatorConnector ?? edge.connector;
  const first = operator?.firstEnd.kind === 'arrow';
  const second = operator?.secondEnd.kind === 'arrow';
  if (first && second) return 'both';
  if (first) return 'second-to-first';
  if (second) return 'first-to-second';
  return 'none';
}
