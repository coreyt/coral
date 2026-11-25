/** Compatibility adapter over the canonical @coral-viz/language printer. */
import { print, printWithDiagnostics, type Diagnostic, type GraphIR as CanonicalGraphIR,
  type GraphEdge as CanonicalGraphEdge, type Position } from '@coral-viz/language';

export type GraphEdge = CanonicalGraphEdge & {
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  /** Transient resolved route projection; never emitted as authored GraphIR. */
  routingPoints?: Position[];
};
export type GraphIR = Omit<CanonicalGraphIR, 'edges'> & { edges: GraphEdge[] };

function toCanonical(graph: GraphIR): CanonicalGraphIR {
  return {
    ...graph,
    edges: graph.edges.map(({ lineStyle, routingPoints: _resolvedRoute, ...edge }) => ({
      ...edge,
      ...((lineStyle || edge.style)
        ? { style: { ...edge.style, ...(lineStyle ? { lineStyle } : {}) } }
        : {}),
    })),
  };
}

export function printCoralDSL(graph: GraphIR): string {
  return print(toCanonical(graph));
}

/**
 * Print, and report everything the Coral surface could not carry (R-011 AC-6).
 *
 * The shell surfaces these alongside parse errors once it is decomposed; until
 * then callers that want the losses can ask for them here.
 */
export function printCoralDSLWithDiagnostics(graph: GraphIR): { text: string; diagnostics: Diagnostic[] } {
  return printWithDiagnostics(toCanonical(graph));
}
