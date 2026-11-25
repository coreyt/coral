import { benchmarkEnvironment } from '../../../scripts/performance-policy.mjs';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { completeSpatialSource029 } from './helpers/spatialQuality029.js';

function connectorHeavySource029() {
  const layers = 5, width = 5;
  const lines = ['@diagram block'];
  for (let layer = 0; layer < layers; layer++) for (let branch = 0; branch < width; branch++)
    lines.push(`n${layer}_${branch} block as "Stage ${layer} branch ${branch}"`);
  for (let layer = 1; layer < layers; layer++) for (let branch = 0; branch < width; branch++) {
    lines.push(`n${layer - 1}_${branch} -> n${layer}_${branch}`);
    if (branch < width - 1) lines.push(`n${layer - 1}_${branch} -> n${layer}_${branch + 1}`);
  }
  return lines.join('\n');
}
function nestedLongLabelSource029() {
  const lines = ['@diagram architecture'];
  for (let group = 0; group < 4; group++) {
    lines.push(`group${group} group as "Service group ${group}" {`);
    for (let item = 0; item < 5; item++) lines.push(`  service${item} service as "Validate and reconcile customer transaction ${group}/${item}"`);
    lines.push('}');
    for (let item = 1; item < 5; item++) lines.push(`group${group}.service${item - 1} -> group${group}.service${item}`);
    if (group) lines.push(`group${group - 1}.service4 -> group${group}.service0`);
  }
  return lines.join('\n');
}
function p95(values: number[]) { return [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!; }

describe.skipIf(!benchmarkEnvironment().measure)('complete spatial operation performance', () => {
  it('keeps connector-heavy and nested long-label source-to-valid-scene operations responsive', { timeout: 15_000 }, async () => {
    const workloads = [{ id: 'connectors-25-nodes-36-edges', source: connectorHeavySource029() },
      { id: 'nested-24-nodes-long-labels', source: nestedLongLabelSource029() }];
    const observations = [];
    for (const workload of workloads) {
      const firstStart = performance.now();
      await completeSpatialSource029(workload.source, 'lowfi', 'RIGHT');
      const firstMs = performance.now() - firstStart;
      const warm = [];
      for (let sample = 0; sample < 8; sample++) {
        const start = performance.now();
        await completeSpatialSource029(workload.source, sample % 2 ? 'hifi' : 'lowfi', 'RIGHT');
        warm.push(performance.now() - start);
      }
      observations.push({ workload: workload.id, firstMs, warmP95Ms: p95(warm) });
      // Existing <=100-node shared layout budget, now including source parse,
      // semantic projection, text measurement, final validation, and scene prep.
      expect(firstMs, workload.id).toBeLessThanOrEqual(500);
      expect(p95(warm), workload.id).toBeLessThanOrEqual(500);
    }
    console.info('SPATIAL_COMPLETE_OPERATIONS', JSON.stringify({
      scope: 'source parse through complete validated prepared scene; first operation includes lazy engine initialization', observations,
    }));
  });
});
