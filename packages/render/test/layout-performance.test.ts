import { benchmarkEnvironment, assertPerformanceBudget, validatePerformanceSamples } from '../../../scripts/performance-policy.mjs';
import ELK from 'elkjs/lib/elk.bundled.js';
import { performance } from 'node:perf_hooks';
import { describe, it } from 'vitest';
import { computeElkLayout, type LayoutEngine, type LayoutRequest } from '../src/layout/index.js';

const benchmark = benchmarkEnvironment();
const budget = (name: string, value: number, limit: number) => assertPerformanceBudget({
  name, samples: [value], expectedSamples: 1, limit, comparison: 'lt' });

function fixture(size: number): LayoutRequest {
  return {
    id: `layout-${size}`,
    defaults: { algorithm: 'layered', direction: 'DOWN' },
    nodes: Array.from({ length: size }, (_, index) => ({ id: `n${index}`, width: 80, height: 40 })),
    edges: Array.from({ length: size - 1 }, (_, index) => ({
      id: `e${index}`, source: `n${index}`, target: `n${index + 1}`,
    })),
  };
}


async function sample(request: LayoutRequest, engine?: LayoutEngine): Promise<number> {
  // Measure the complete public operation, including graph preparation and
  // result decoding. Fresh-engine construction remains outside this boundary.
  const started = performance.now();
  await computeElkLayout(request, engine ? { engine } : {});
  const elapsed = performance.now() - started;
  validatePerformanceSamples('ELK layout', [elapsed], 1);
  return elapsed;
}

describe.skipIf(!benchmark.measure)('shared ELK performance budgets', () => {
  it('meets cold/warm p95 and growth budgets', { timeout: 90_000 }, async () => {
    const warmP95 = new Map<number, number>();
    for (const size of [100, 500, 2000]) {
      const request = fixture(size);
      await sample(request);
      const warm = [];
      const cold = [];
      for (let index = 0; index < 20; index += 1) {
        warm.push(await sample(request));
        const Constructor = ELK as unknown as new () => LayoutEngine;
        cold.push(await sample(request, new Constructor()));
      }
      const limit = size === 100 ? 500 : size === 500 ? 2_000 : 10_000;
      const p95 = assertPerformanceBudget({ name: `ELK ${size} warm p95`, samples: warm,
        expectedSamples: 20, percentile: .95, limit });
      assertPerformanceBudget({ name: `ELK ${size} cold p95`, samples: cold,
        expectedSamples: 20, percentile: .95, limit });
      warmP95.set(size, p95);
    }
    const twoHundred = fixture(200);
    await sample(twoHundred);
    const smallSamples = [];
    for (let index = 0; index < 20; index += 1) {
      smallSamples.push(await sample(twoHundred));
    }
    const small = assertPerformanceBudget({ name: 'ELK 200 warm p95', samples: smallSamples,
      expectedSamples: 20, percentile: .95, limit: Number.MAX_VALUE });
    budget('ELK growth ratio', warmP95.get(2000)! / small, 30);
  });
});
