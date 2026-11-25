import { evaluateConformance028, type ConformanceReport, type ConformanceRequest,
  type RuleFinding, type SymbolException } from './conformance028.js';
import { resolveSuccessorGraphNodes028, type SuccessorGraphView028 } from './successorInterpretation028.js';

/**
 * Bind a validated local successor's saved U2 settings to Coral's report policy.
 * Rule findings remain caller-supplied: this does not certify a complete
 * diagram-type rule card or replace the successor's own model validation.
 */
export function evaluateSuccessorConformanceInputs028(
  graph: SuccessorGraphView028,
  findings: readonly RuleFinding[],
  request: Omit<ConformanceRequest, 'savedLevel'> = {},
): ConformanceReport {
  const interpreted = resolveSuccessorGraphNodes028(graph);
  const exceptions: SymbolException[] = [];
  const invalid: RuleFinding[] = [];
  const seen = new Set<string>();
  for (const exception of graph.conformanceExceptions ?? []) {
    const key = `${exception.nodeId}\u0000${exception.symbol}`;
    const duplicate = seen.has(key);
    seen.add(key);
    const node = interpreted.get(exception.nodeId);
    const eligible = node?.status === 'foreign-profile' &&
      node.authoredSymbol === exception.symbol;
    if (!duplicate && eligible) exceptions.push({ nodeId: exception.nodeId, symbol: exception.symbol });
    else invalid.push({ id: 'CORAL.CONFORMANCE.EXCEPTION.INVALID', category: 'integrity', severity: 'error',
      message: duplicate ? `Duplicate conformance exception for ${exception.nodeId}`
        : `Conformance exception is not a known explicit out-of-profile symbol on ${exception.nodeId}`,
      subject: { kind: 'node', id: exception.nodeId } });
  }
  const report = evaluateConformance028({ ...request,
    savedLevel: graph.conformanceLevel ?? 'typical' }, [...findings, ...invalid], exceptions);
  return { ...report, catalog: { ...graph.catalog! } };
}
