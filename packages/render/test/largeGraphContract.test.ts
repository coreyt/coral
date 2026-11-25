import { describe, it, expect } from 'vitest';
import { renderSvg } from '../src/svg/serialize.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { measureText } from '../src/text/metrics.js';
import type { GraphIR } from '@graph-ir/core';
import type { GraphNode, GraphEdge } from '../src/types.js';

function graphOf(n: number) {
  const nodes: GraphNode[] = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    type: 'service',
    label: `Node ${i}`,
    position: { x: (i % 25) * 180, y: Math.floor(i / 25) * 120 },
  })) as GraphNode[];

  const edges: GraphEdge[] = Array.from({ length: Math.max(0, n - 1) }, (_, i) => ({
    id: `e${i}`,
    source: `n${i}`,
    target: `n${i + 1}`,
    label: `step ${i}`,
  })) as GraphEdge[];

  return { nodes, edges };
}


describe('large rendering input contracts', () => {
  it.each([100, 200, 500, 2000])('renders %i nodes to SVG', (nodes) => {
    expect(renderSvg(graphOf(nodes)).length).toBeGreaterThan(0);
  });
  it('measures short and long labels', () => {
    for (const text of ['Node', 'Node'.repeat(250)]) {
      const metrics = measureText({ text, fontSize: 12 });
      expect(metrics.width).toBeGreaterThan(0);
      expect(Number.isFinite(metrics.width)).toBe(true);
    }
  });
  it('lays out and renders the labeled scene with nested content', async () => {
      const nodes: GraphNode[] = Array.from({ length: 349 }, (_, index) => ({
        id: `n${index}`, type: 'process', symbol: 'flowchart-process',
        label: `Review account provision workflow step ${index}`,
        dimensions: { width: 210, height: 82 },
      }));
      nodes.push({ id: 'nested', type: 'process', symbol: 'flowchart-process',
        label: 'Nested review and long-label content',
        dimensions: { width: 250, height: 165 },
        children: [{ id: 'nested-child', type: 'process', symbol: 'flowchart-process',
          label: 'Nested approval', dimensions: { width: 190, height: 70 } }],
      });
      const edges: GraphEdge[] = Array.from({ length: 350 }, (_, index) => ({
        id: `e${index}`, source: `n${index % 349}`,
        target: `n${(index + 1) % 349}`,
        label: `transition ${index}: approved or review required`,
        targetEnd: { marker: { kind: 'arrow', fill: 'filled' } },
      }));
      const graph = { version: '3.0.0', id: 'scene-350',
        metadata: { notation: 'flowchart' }, nodes, edges } as GraphIR;
    const laid = await layoutGraphForSvg(graph, { svgOptions: { style: 'hifi' } });
    const svg = renderSvg(laid, { style: 'hifi', edgeRoutes: laid.edgeRoutes });
    expect(Buffer.byteLength(svg)).toBeGreaterThan(0);
  }, 30_000);
});
