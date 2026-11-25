// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@coral-viz/language';
import { applySpatialPlan } from '../../../src/llm/spatial/apply';
import { evaluateSpatialPlan } from '../../../src/llm/spatial/evaluate';
import { recognizeSpatialRequest } from '../../../src/llm/spatial/intent';
import { resolveSpatialPlan } from '../../../src/llm/spatial/resolve';
import type { SpatialPlan } from '../../../src/llm/spatial/types';
import { geometry, graph } from './fixtures';

function planFor(text: string, source: GraphIR = graph): SpatialPlan {
  const result = resolveSpatialPlan(source, geometry, recognizeSpatialRequest(text));
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.diagnostics[0]?.message);
  return result.plan;
}

describe('spatial evaluation', () => {
  it.each([
    'move db above api',
    'move db below api',
    'move db left of api',
    'move db right of api',
    'put db on the top side of the diagram',
    'put db on the bottom side of the diagram',
    'put db on the left side of the diagram',
    'put db on the right side of the diagram',
    'put cache at the top within platform',
    'put cache at the bottom within platform',
    'put cache at the left within platform',
    'put cache at the right within platform',
    'arrange api and db in a row',
    'arrange api and db in a row right to left',
    'arrange api and db in a column',
    'arrange api and db in a column bottom to top',
    'move cache above api',
  ])('independently proves the applied geometry for %s', (text) => {
    const plan = planFor(text);
    const result = applySpatialPlan({ original: graph, candidate: graph, plan });
    expect(result.success).toBe(true);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence.every((item) => item.satisfied)).toBe(true);
    expect(evaluateSpatialPlan(result.graph, plan)).toEqual({
      success: true, evidence: result.evidence, diagnostics: [],
    });
  });

  it('evaluates boundary containment and tolerance at and just outside the threshold', () => {
    const plan = planFor('put cache at the top within platform');
    const applied = applySpatialPlan({ original: graph, candidate: graph, plan });
    expect(applied.success).toBe(true);
    const atBoundary = structuredClone(applied.graph);
    atBoundary.nodes[2].children![0].position!.x = 23.5;
    expect(evaluateSpatialPlan(atBoundary, plan).success).toBe(true);
    const outside = structuredClone(atBoundary);
    outside.nodes[2].children![0].position!.x = 23.499;
    const result = evaluateSpatialPlan(outside, plan);
    expect(result).toMatchObject({ success: false, diagnostics: [{ code: 'spatial.outcome.unsatisfied' }] });
    expect(result.evidence.map((item) => item.predicate)).toEqual(['boundary.edge', 'boundary.minimum', 'boundary.maximum']);
  });

  it('independently rejects arrangement overlap and misalignment', () => {
    const plan = planFor('arrange api and db in a row');
    const applied = applySpatialPlan({ original: graph, candidate: graph, plan });
    expect(applied.success).toBe(true);
    for (const position of [{ x: 300, y: 230 }, { x: 216, y: 231 }]) {
      const altered = structuredClone(applied.graph);
      altered.nodes[0].position = position;
      const result = evaluateSpatialPlan(altered, plan);
      expect(result.success).toBe(false);
      expect(result.evidence.map((item) => item.predicate)).toEqual(['arrangement.minimum-gap', 'arrangement.alignment']);
    }
  });

  it('rejects an independently altered outcome with ordered numeric evidence', () => {
    const plan = planFor('move db above api');
    const applied = applySpatialPlan({ original: graph, candidate: graph, plan });
    expect(applied.success).toBe(true);
    const altered = structuredClone(applied.graph);
    altered.nodes[1].position = { x: 999, y: 999 };
    const before = structuredClone(altered);
    const result = evaluateSpatialPlan(altered, plan);
    expect(result.success).toBe(false);
    expect(result.diagnostics).toMatchObject([{ code: 'spatial.outcome.unsatisfied', entityIds: ['db', 'api'] }]);
    expect(result.evidence.map((item) => item.predicate)).toEqual(['relative.gap', 'relative.alignment']);
    expect(result.evidence.every((item) => Number.isFinite(item.actual) && Number.isFinite(item.expected))).toBe(true);
    expect(altered).toEqual(before);
  });

  it('returns deterministic failure for absent or non-finite subject positions', () => {
    const plan = planFor('move db above api');
    for (const position of [undefined, { x: Number.NaN, y: 1 }]) {
      const value = structuredClone(graph);
      value.nodes[1].position = position;
      expect(evaluateSpatialPlan(value, plan)).toMatchObject({
        success: false, evidence: [], diagnostics: [{ code: 'spatial.outcome.unsatisfied', entityIds: ['db'] }],
      });
    }
  });

  it('never emits non-JSON evidence when a finite snapshot has an overflowing aggregate extent', () => {
    const source: GraphIR = {
      version: '3.0.0', id: 'wide',
      nodes: [{ id: 'left', type: 'service', position: { x: -1e308, y: 0 } }, { id: 'right', type: 'service', position: { x: 1e308, y: 0 } }],
      edges: [],
    };
    const resolved = resolveSpatialPlan(source, [
      { id: 'left', position: { x: -1e308, y: 0 }, width: 1, height: 1 },
      { id: 'right', position: { x: 1e308, y: 0 }, width: 1, height: 1 },
    ], recognizeSpatialRequest('put left on the left side of the diagram'));
    expect(resolved.success).toBe(true);
    if (!resolved.success) throw new Error(resolved.diagnostics[0]?.message);
    expect(evaluateSpatialPlan(source, resolved.plan)).toMatchObject({
      success: false, evidence: [], diagnostics: [{ code: 'spatial.outcome.unsatisfied', entityIds: ['left'] }],
    });
  });
});
