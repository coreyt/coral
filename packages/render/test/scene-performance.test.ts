import { benchmarkEnvironment, assertPerformanceBudget } from '../../../scripts/performance-policy.mjs';
const benchmark = benchmarkEnvironment();
const budget = (name: string, value: number, limit: number) => assertPerformanceBudget({
  name, samples: [value], expectedSamples: 1, limit, comparison: 'lt' });
import { describe, it, expect } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { prepareSpatialScene028 } from '../src/svg/serialize.js';

const authored: GraphIR = {
  version: '3.0.0', id: 'slice', metadata: { notation: 'flowchart' },
  nodes: [
    { id: 'start', type: 'terminal', symbol: 'flowchart-terminal', label: 'Start' },
    { id: 'check', type: 'decision', symbol: 'flowchart-decision', label: 'Ready?' },
  ],
  edges: [{ id: 'next', source: 'start', target: 'check', label: 'yes',
    targetEnd: { marker: { kind: 'arrow', fill: 'open' } } }],
};
const drawing = { ...authored, nodes: [
  { ...authored.nodes[0]!, position: { x: 20, y: 20 }, dimensions: { width: 130, height: 64 } },
  { ...authored.nodes[1]!, position: { x: 240, y: 20 }, dimensions: { width: 150, height: 100 } },
] };

describe.skipIf(!benchmark.measure)('long route scene performance', () => {
  it('keeps a sparse label check bounded on a very long diagonal route', () => {
    const route = new Map([['next', [{ startPoint: { x: 80, y: 52 },
      bendPoints: [{ x: 100_000, y: 100_000 }], endPoint: { x: 240, y: 70 } }]]]);
    const started = performance.now();
    const scene = prepareSpatialScene028(drawing, { style: 'hifi', edgeRoutes: route });
    expect(scene.parts.find((part) => part.id === 'next:label')).toBeDefined();
    budget('long route scene preparation', performance.now() - started, 250);
  });

  it('handles route bounds beyond precise grid-cell coordinates', () => {
    const route = new Map([['next', [{ startPoint: { x: 80, y: 52 },
      bendPoints: [{ x: 1e20, y: 1e20 }], endPoint: { x: 240, y: 70 } }]]]);
    const started = performance.now();
    const scene = prepareSpatialScene028(drawing, { style: 'hifi', edgeRoutes: route });
    expect(scene.parts.find((part) => part.id === 'next:label')).toBeDefined();
    budget('long route scene preparation', performance.now() - started, 250);
  });

});
