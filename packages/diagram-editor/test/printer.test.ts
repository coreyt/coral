import { describe, expect, it } from 'vitest';
import { parse } from '@coral-viz/language/parser';
import { printCoralDSLWithDiagnostics, type GraphIR } from '../src/printer';

describe('diagram editor shared Coral printer adapter', () => {
  it('does not relabel legacy GraphIR before calling the canonical printer', () => {
    const legacy = {
      version: '2.0.0', id: 'legacy', nodes: [], edges: [],
    } as unknown as GraphIR;

    expect(() => printCoralDSLWithDiagnostics(legacy))
      .toThrow(/requires GraphIR 3\.0\.0.*named migration/i);
  });

  it('preserves extended fields, legacy lineStyle, and quoted/control labels', () => {
    const graph: GraphIR = {
      version: '3.0.0', id: 'editor graph', name: 'Editor', metadata: { custom: { values: [1, null] } },
      nodes: [{ id: 'api', type: 'custom/type', label: 'Say "hi"\nnext', dimensions: { width: 100, height: 60 }, properties: { nested: { ok: true } } }],
      edges: [{
        id: 'self edge', source: 'api', target: 'api', lineStyle: 'dotted', sourcePort: 'out',
        targetEnd: { marker: { kind: 'diamond', fill: 'unspecified' } },
      }],
    };

    const result = printCoralDSLWithDiagnostics(graph);
    const reparsed = parse(result.text);

    expect(result.diagnostics).toEqual([]);
    expect(reparsed.success).toBe(true);
    expect(reparsed.graph).toEqual({
      ...graph,
      edges: graph.edges.map(({ lineStyle, ...edge }) => ({ ...edge, style: { ...edge.style, lineStyle } })),
    });
  });
});
