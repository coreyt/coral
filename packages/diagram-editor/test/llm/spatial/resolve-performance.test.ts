// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@coral-viz/language';
import { assertPerformanceBudget, benchmarkEnvironment } from '../../../../../scripts/performance-policy.mjs';
import { recognizeSpatialRequest } from '../../../src/llm/spatial/intent';
import { resolveSpatialPlan } from '../../../src/llm/spatial/resolve';

// Strict local or explicitly controlled measurement only; an unprofiled GitHub
// environment skips with the NOT MEASURED warning and reports no timing.
const benchmark = benchmarkEnvironment();

describe.skipIf(!benchmark.measure)('spatial resolver performance', () => {
  it('resolves a 400-member arrangement within 500 ms', () => {
    const count = 400;
    const many: GraphIR = {
      version: '3.0.0', id: 'many',
      nodes: Array.from({ length: count }, (_, index) => ({ id: `n${index}`, type: 'service', label: `Node ${index}` })),
      edges: [],
    };
    const manyGeometry = many.nodes.map((node, index) => ({ id: node.id, position: { x: index * 20, y: 0 }, width: 10, height: 10 }));
    const prompt = `arrange ${many.nodes.map((node) => node.id).join(', ')} in a row`;
    const started = performance.now();
    const result = resolveSpatialPlan(many, manyGeometry, recognizeSpatialRequest(prompt));
    const elapsed = performance.now() - started;
    expect(result.success).toBe(true);
    assertPerformanceBudget({
      name: 'spatial resolver 400-member arrangement', samples: [elapsed], expectedSamples: 1,
      limit: 500, comparison: 'lt',
    });
  });
});
