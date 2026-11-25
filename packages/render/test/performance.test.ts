import { benchmarkEnvironment, assertPerformanceBudget, validatePerformanceSamples } from '../../../scripts/performance-policy.mjs';
import { describe, it, expect } from 'vitest';
import { renderSvg } from '../src/svg/serialize.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { measureText } from '../src/text/metrics.js';
import type { GraphIR } from '@graph-ir/core';
import type { GraphNode, GraphEdge } from '../src/types.js';

const benchmark = benchmarkEnvironment();
const budget = (name: string, value: number, limit: number) => assertPerformanceBudget({
  name, samples: [value], expectedSamples: 1, limit, comparison: 'lt' });

/**
 * Large-graph budgets for rendering - R-026.
 *
 * Export is not in the keystroke path, so these budgets are looser than the
 * language ones; they exist to catch a regression in the serializer's shape,
 * not to police milliseconds. Recorded numbers are in
 * docs/contribute/reference/performance-budgets.md.
 */

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

function millis(run: () => void): number {
  const start = performance.now();
  run();
  const elapsed = performance.now() - start;
  validatePerformanceSamples('operation', [elapsed], 1);
  return elapsed;
}

describe.skipIf(!benchmark.measure)('R-026: rendering performance budgets', () => {
  it.each([
    { nodes: 100, limit: 200 },
    { nodes: 500, limit: 600 },
    { nodes: 2000, limit: 3000 },
  ])('renders $nodes nodes to SVG within $limit ms', ({ nodes, limit }) => {
    const graph = graphOf(nodes);
    renderSvg(graph);

    const elapsed = millis(() => {
      const svg = renderSvg(graph);
      expect(svg.length).toBeGreaterThan(0);
    });

    budget('operation duration', elapsed, limit);
  });

  it('measures text in constant time per character', () => {
    const short = 'Node';
    const long = 'Node'.repeat(250);
    measureText({ text: short, fontSize: 12 });
    measureText({ text: long, fontSize: 12 });

    const shortMs = Math.max(millis(() => {
      for (let i = 0; i < 1000; i++) measureText({ text: short, fontSize: 12 });
    }), 0.5);
    const longMs = millis(() => {
      for (let i = 0; i < 1000; i++) measureText({ text: long, fontSize: 12 });
    });

    // 250x the characters must not cost more than ~1000x the time.
    budget('text measurement growth ratio', longMs / shortMs, 1000);
  });

  it('scales sub-quadratically in node count', () => {
    const small = graphOf(200);
    const large = graphOf(2000);
    renderSvg(small);
    renderSvg(large);

    const smallMs = Math.max(millis(() => renderSvg(small)), 0.5);
    const largeMs = millis(() => renderSvg(large));

    budget('SVG growth ratio', largeMs / smallMs, 40);
  });

  it('keeps the 350-node labeled scene within the 500-node layout and SVG ceilings',
    async () => {
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
      const layoutSamples: number[] = [];
      const svgSamples: number[] = [];
      let bytes = 0;
      for (let sample = 0; sample < 21; sample += 1) {
        const startLayout = performance.now();
        const laid = await layoutGraphForSvg(graph, { svgOptions: { style: 'hifi' } });
        const layoutMs = performance.now() - startLayout;
        const startSvg = performance.now();
        const svg = renderSvg(laid, { style: 'hifi', edgeRoutes: laid.edgeRoutes });
        const svgMs = performance.now() - startSvg;
        validatePerformanceSamples('scene layout and SVG', [layoutMs, svgMs], 2);
        bytes = Buffer.byteLength(svg);
        if (sample > 0) {
          layoutSamples.push(layoutMs);
          svgSamples.push(svgMs);
        }
      }
      expect(bytes).toBeGreaterThan(0);
      assertPerformanceBudget({ name: '350-node scene layout p95', samples: layoutSamples, expectedSamples: 20, percentile: .95, limit: 2000 });
      assertPerformanceBudget({ name: '350-node scene SVG p95', samples: svgSamples, expectedSamples: 20, percentile: .95, limit: 600 });
    }, 180_000);
});
