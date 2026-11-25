import { describe, expect, it } from 'vitest';
import { evaluateSuccessorConformanceInputs028 } from '../src/successorConformance028.js';
import type { RuleFinding } from '../src/conformance028.js';
import { notationCatalogIdentity028 } from '../src/notations/index.js';
import type { SuccessorGraphView028 } from '../src/successorInterpretation028.js';

const catalog = notationCatalogIdentity028('architecture')!;
const graph: SuccessorGraphView028 = {
  version: '4.0.0', profile: { id: 'architecture', version: '1.0.0' }, catalog,
  conformanceLevel: 'strict',
  conformanceExceptions: [{ kind: 'explicit-symbol', nodeId: 'choice', symbol: 'flowchart-decision' }],
  nodes: [{ id: 'choice', type: 'decision', symbol: 'flowchart-decision' }],
};
const foreignSymbol: RuleFinding = {
  id: 'CORAL.SYMBOL.OUT_OF_PROFILE', category: 'notation', minimumLevel: 'strict',
  severity: 'error', message: 'Known symbol is outside architecture',
  causes: [{ kind: 'explicit-symbol', nodeId: 'choice', symbol: 'flowchart-decision' }],
};
const unrelated: RuleFinding = {
  id: 'ARCH.EDGE.DIRECTION', category: 'notation', minimumLevel: 'strict',
  severity: 'error', message: 'Unrelated edge rule failed', causes: [{ kind: 'other', key: 'edge-1' }],
};
const mixedCause: RuleFinding = {
  id: 'ARCH.MIXED_CAUSE', category: 'notation', minimumLevel: 'strict',
  severity: 'error', message: 'Foreign symbol and unrelated edge both matter',
  causes: [
    { kind: 'explicit-symbol', nodeId: 'choice', symbol: 'flowchart-decision' },
    { kind: 'other', key: 'edge-2' },
  ],
};

describe('local successor U2 settings bridge', () => {
  it('uses saved strict level and downgrades only the scoped causal finding', () => {
    const report = evaluateSuccessorConformanceInputs028(graph, [foreignSymbol, unrelated],
      { operation: 'check', notificationLevel: 'warning' });
    expect(report.evaluatedLevel).toBe('strict');
    expect(report.findings.map((finding) => [finding.id, finding.severity])).toEqual([
      ['CORAL.SYMBOL.OUT_OF_PROFILE', 'warning'], ['ARCH.EDGE.DIRECTION', 'error'],
    ]);
    expect(report.exceptions).toEqual([{ nodeId: 'choice', symbol: 'flowchart-decision',
      affectedRuleIds: ['CORAL.SYMBOL.OUT_OF_PROFILE'] }]);
    expect(report.claimStatus).toBe('failed');
    expect(report.catalog).toEqual(catalog);
  });

  it('honors a one-off level without changing the saved level or authored graph', () => {
    const report = evaluateSuccessorConformanceInputs028(graph, [foreignSymbol, unrelated],
      { requestedLevel: 'typical', operation: 'check' });
    expect(report.evaluatedLevel).toBe('typical');
    expect(report.findings).toEqual([]);
    expect(graph.conformanceLevel).toBe('strict');
    expect(graph.nodes[0]?.symbol).toBe('flowchart-decision');
  });

  it('does not downgrade a finding with any independent cause', () => {
    const report = evaluateSuccessorConformanceInputs028(graph, [mixedCause],
      { operation: 'check' });
    expect(report.findings[0]?.severity).toBe('error');
    expect(report.exceptions[0]?.affectedRuleIds).toEqual([]);
  });

  it('reports stale or duplicate exceptions as independent integrity errors', () => {
    const report = evaluateSuccessorConformanceInputs028({ ...graph,
      conformanceExceptions: [
        { kind: 'explicit-symbol', nodeId: 'choice', symbol: 'flowchart-decision' },
        { kind: 'explicit-symbol', nodeId: 'choice', symbol: 'flowchart-decision' },
        { kind: 'explicit-symbol', nodeId: 'missing', symbol: 'flowchart-decision' },
      ] }, [], { requestedLevel: 'none', operation: 'check' });
    expect(report.findings.filter((finding) => finding.id === 'CORAL.CONFORMANCE.EXCEPTION.INVALID'))
      .toHaveLength(2);
    expect(report.claimStatus).toBe('not-claimed');
  });

  it('keeps ordinary save quiet for notation findings', () => {
    const report = evaluateSuccessorConformanceInputs028(graph, [foreignSymbol, unrelated],
      { operation: 'save', notificationLevel: 'debug' });
    expect(report.findings).toHaveLength(2);
    expect(report.notices).toEqual([]);
  });
});
