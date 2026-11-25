// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@coral-viz/language';
import { recognizeSpatialRequest } from '../../../src/llm/spatial/intent';
import { resolveSpatialPlan } from '../../../src/llm/spatial/resolve';
import type { CapturedNodeGeometry, SpatialPlan } from '../../../src/llm/spatial/types';
import { computeSpatialPositions } from '../../../src/llm/spatial/transform';
import { geometry, graph } from './fixtures';

function planFor(text: string, source: GraphIR = graph, captured: CapturedNodeGeometry[] = geometry, gap = 24): SpatialPlan {
  const result = resolveSpatialPlan(source, captured, recognizeSpatialRequest(text), { gap, tolerance: 0.5 });
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.diagnostics[0]?.message);
  return result.plan;
}

function positions(plan: SpatialPlan): Record<string, { x: number; y: number }> {
  const result = computeSpatialPositions(plan);
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.diagnostics[0]?.message);
  return Object.fromEntries(result.positions.map((entry) => [entry.id, entry.position]));
}

describe('computeSpatialPositions', () => {
  it.each([
    ['above', { x: 110, y: -4 }],
    ['below', { x: 110, y: 184 }],
    ['left of', { x: -24, y: 90 }],
    ['right of', { x: 244, y: 90 }],
  ])('places an unequal pinned subject %s with exact bounds gap and retains canonical coordinates', (relation, expected) => {
    const value = positions(planFor(`move db ${relation} api`));
    expect(value).toEqual({ db: expected });
    expect(graph.nodes[1].position).toEqual({ x: 360, y: 220 });
  });

  it('converts nested absolute movement back to canonical parent-relative top-left', () => {
    const value = positions(planFor('move cache above api'));
    // Absolute cache x=120 and y=36; parent top-left is (500,100).
    expect(value).toEqual({ cache: { x: -380, y: -64 } });
  });

  it('places subjects at diagram and group boundaries without changing the orthogonal axis', () => {
    expect(positions(planFor('put db on the left side of the diagram'))).toEqual({ db: { x: 100, y: 220 } });
    expect(positions(planFor('put db on the right side of the diagram'))).toEqual({ db: { x: 900, y: 220 } });
    expect(positions(planFor('put db on the top side of the diagram'))).toEqual({ db: { x: 360, y: 100 } });
    expect(positions(planFor('put db on the bottom side of the diagram'))).toEqual({ db: { x: 360, y: 420 } });
    expect(positions(planFor('put cache at the top within platform', graph, geometry, 10))).toEqual({ cache: { x: 40, y: 10 } });
    expect(positions(planFor('put cache at the bottom within platform', graph, geometry, 10))).toEqual({ cache: { x: 40, y: 350 } });
    expect(positions(planFor('put cache at the left within platform', graph, geometry, 10))).toEqual({ cache: { x: 10, y: 50 } });
    expect(positions(planFor('put cache at the right within platform', graph, geometry, 10))).toEqual({ cache: { x: 410, y: 50 } });
  });

  it('arranges unpinned members in explicit and reverse order and writes every subject', () => {
    const localGraph: GraphIR = {
      version: '3.0.0', id: 'arrange',
      nodes: [
        { id: 'a', type: 'service' },
        { id: 'b', type: 'service' },
        { id: 'c', type: 'service' },
      ], edges: [],
    };
    const localGeometry: CapturedNodeGeometry[] = [
      { id: 'a', position: { x: -50, y: 20 }, width: 40, height: 20 },
      { id: 'b', position: { x: 80, y: 100 }, width: 60, height: 40 },
      { id: 'c', position: { x: 200, y: 200 }, width: 20, height: 60 },
    ];
    expect(positions(planFor('arrange a, b, c in a row', localGraph, localGeometry, 10))).toEqual({
      a: { x: -50, y: 20 }, b: { x: 0, y: 10 }, c: { x: 70, y: 0 },
    });
    expect(positions(planFor('arrange a, b, c in a row right to left', localGraph, localGeometry, 10))).toEqual({
      a: { x: -50, y: 20 }, b: { x: -120, y: 10 }, c: { x: -150, y: 0 },
    });
    expect(positions(planFor('arrange a, b, c in a column bottom to top', localGraph, localGeometry, 5))).toEqual({
      a: { x: -50, y: 20 }, b: { x: -60, y: -25 }, c: { x: -40, y: -90 },
    });
    expect(positions(planFor('arrange a, b, c in a column top to bottom', localGraph, localGeometry, 5))).toEqual({
      a: { x: -50, y: 20 }, b: { x: -60, y: 45 }, c: { x: -40, y: 90 },
    });
  });

  it('supports one pinned anchor, reverse pinned columns, unequal sizes, and zero-gap touching', () => {
    const source: GraphIR = {
      version: '3.0.0', id: 'pin-matrix',
      nodes: [
        { id: 'a', type: 'service' },
        { id: 'b', type: 'service', pinned: true },
        { id: 'c', type: 'service' },
      ], edges: [],
    };
    const captured: CapturedNodeGeometry[] = [
      { id: 'a', position: { x: 10, y: 200 }, width: 20, height: 20 },
      { id: 'b', position: { x: 100, y: 100 }, width: 40, height: 50 },
      { id: 'c', position: { x: 200, y: 10 }, width: 60, height: 30 },
    ];
    expect(positions(planFor('arrange a, b, c in a column bottom to top', source, captured, 10))).toEqual({
      a: { x: 110, y: 160 }, b: { x: 100, y: 100 }, c: { x: 90, y: 60 },
    });

    const touching: GraphIR = {
      version: '3.0.0', id: 'touching',
      nodes: [{ id: 'a', type: 'service', pinned: true }, { id: 'b', type: 'service', pinned: true }], edges: [],
    };
    const touchingGeometry: CapturedNodeGeometry[] = [
      { id: 'a', position: { x: 0, y: 0 }, width: 50, height: 20 },
      { id: 'b', position: { x: 50, y: 0 }, width: 80, height: 20 },
    ];
    expect(positions(planFor('arrange a and b in a row', touching, touchingGeometry, 0))).toEqual({
      a: { x: 0, y: 0 }, b: { x: 50, y: 0 },
    });
  });

  it('moves a group as one subject without rewriting its pinned descendant and handles nested origin arrangements', () => {
    expect(positions(planFor('move platform below api'))).toEqual({ platform: { x: -90, y: 184 } });
    const before = structuredClone(graph);
    computeSpatialPositions(planFor('move platform below api'));
    expect(graph).toEqual(before);

    const nested = positions(planFor('arrange cache and worker in a row', graph, geometry, 10));
    expect(nested).toEqual({ cache: { x: 40, y: 50 }, worker: { x: 130, y: 45 } });
  });

  it('accepts pinned alignment at tolerance, rejects just outside it, and never mutates the plan', () => {
    const source: GraphIR = {
      version: '3.0.0', id: 'tolerance',
      nodes: [{ id: 'a', type: 'service', pinned: true }, { id: 'b', type: 'service', pinned: true }], edges: [],
    };
    const atBoundary: CapturedNodeGeometry[] = [
      { id: 'a', position: { x: 0, y: 0 }, width: 20, height: 20 },
      { id: 'b', position: { x: 50, y: 0.5 }, width: 20, height: 20 },
    ];
    const plan = planFor('arrange a and b in a row', source, atBoundary, 5);
    const before = JSON.stringify(plan);
    expect(computeSpatialPositions(plan).success).toBe(true);
    expect(computeSpatialPositions(plan)).toEqual(computeSpatialPositions(plan));
    expect(JSON.stringify(plan)).toBe(before);
    const outside = atBoundary.map((item) => item.id === 'b' ? { ...item, position: { x: 50, y: 0.5001 } } : item);
    expect(computeSpatialPositions(planFor('arrange a and b in a row', source, outside, 5)))
      .toMatchObject({ success: false, diagnostics: [{ code: 'spatial.anchor.alignment', entityIds: ['a', 'b'] }] });
  });

  it('rejects arithmetic overflow instead of returning non-JSON geometry', () => {
    const source: GraphIR = { version: '3.0.0', id: 'overflow', nodes: [{ id: 'a', type: 'service' }, { id: 'b', type: 'service' }], edges: [] };
    const captured: CapturedNodeGeometry[] = [
      { id: 'a', position: { x: 1e308, y: 0 }, width: 1e308, height: 10 },
      { id: 'b', position: { x: 1e308, y: 20 }, width: 1e308, height: 10 },
    ];
    expect(computeSpatialPositions(planFor('move a right of b', source, captured)))
      .toMatchObject({ success: false, positions: [], diagnostics: [{ code: 'spatial.geometry.invalid', entityIds: ['a'] }] });
  });

  it('rejects reverse pinned-anchor overflow before order predicates', () => {
    const source: GraphIR = {
      version: '3.0.0', id: 'anchor-overflow',
      nodes: [{ id: 'a', type: 'service', pinned: true }, { id: 'b', type: 'service', pinned: true }], edges: [],
    };
    const captured: CapturedNodeGeometry[] = [
      { id: 'a', position: { x: 1e308, y: 0 }, width: 1e308, height: 10 },
      { id: 'b', position: { x: 1e308, y: 0 }, width: 1e308, height: 10 },
    ];
    expect(computeSpatialPositions(planFor('arrange a and b in a row right to left', source, captured)))
      .toMatchObject({ success: false, positions: [], diagnostics: [{ code: 'spatial.geometry.invalid', entityIds: ['a'] }] });
  });

  it('computes a large diagram boundary iteratively without argument-spread failure', () => {
    const count = 150_000;
    const snapshot = Array.from({ length: count }, (_, index) => ({
      id: `n${index}`, type: 'service', childIds: [], pinned: false,
      canonicalPosition: { x: index, y: 0 }, origin: [0, 0] as const,
      bounds: { x: index, y: 0, width: 1, height: 1 },
    }));
    const largePlan: SpatialPlan = {
      version: 1, graphId: 'large', graphVersion: '2.0.0', classification: 'spatial-only',
      operation: { kind: 'boundary', subjectIds: ['n0'], side: 'right', scope: { kind: 'diagram' } },
      snapshot, gap: 0, tolerance: 0.5,
      pinPolicy: 'direct-move-preserves-pin-arrangement-pins-anchor',
      positionDependencies: snapshot.map((node) => node.id), baselineEdges: [],
    };
    expect(computeSpatialPositions(largePlan)).toMatchObject({
      success: true, positions: [{ id: 'n0', position: { x: count - 1, y: 0 } }],
    });
  }, 10_000);

  it('rejects an overflowing diagram union consistently for either boundary edge', () => {
    const snapshot = [
      {
        id: 'left', type: 'service', childIds: [], pinned: false,
        canonicalPosition: { x: -1e308, y: 0 }, origin: [0, 0] as const,
        bounds: { x: -1e308, y: 0, width: 1, height: 1 },
      },
      {
        id: 'right', type: 'service', childIds: [], pinned: false,
        canonicalPosition: { x: 1e308, y: 0 }, origin: [0, 0] as const,
        bounds: { x: 1e308, y: 0, width: 1, height: 1 },
      },
    ];
    const plan: SpatialPlan = {
      version: 1, graphId: 'wide', graphVersion: '2.0.0', classification: 'spatial-only',
      operation: { kind: 'boundary', subjectIds: ['left'], side: 'left', scope: { kind: 'diagram' } },
      snapshot, gap: 0, tolerance: 0.5,
      pinPolicy: 'direct-move-preserves-pin-arrangement-pins-anchor',
      positionDependencies: ['left', 'right'], baselineEdges: [],
    };
    for (const side of ['left', 'right'] as const) {
      expect(computeSpatialPositions({ ...plan, operation: { ...plan.operation, side } }))
        .toMatchObject({ success: false, positions: [], diagnostics: [{ code: 'spatial.geometry.invalid' }] });
    }
  });

  it('uses pinned members as immutable anchors and distributes surplus deterministically', () => {
    const localGraph: GraphIR = {
      version: '3.0.0', id: 'anchors',
      nodes: [
        { id: 'a', type: 'service', pinned: true, position: { x: 0, y: 0 } },
        { id: 'b', type: 'service' },
        { id: 'c', type: 'service' },
        { id: 'd', type: 'service', pinned: true, position: { x: 300, y: 0 } },
      ], edges: [],
    };
    const localGeometry: CapturedNodeGeometry[] = [
      { id: 'a', position: { x: 0, y: 0 }, width: 50, height: 40 },
      { id: 'b', position: { x: 80, y: 80 }, width: 50, height: 20 },
      { id: 'c', position: { x: 160, y: 90 }, width: 50, height: 60 },
      { id: 'd', position: { x: 300, y: 0.25 }, width: 50, height: 40 },
    ];
    expect(positions(planFor('arrange a, b, c, d in a row', localGraph, localGeometry, 20))).toEqual({
      a: { x: 0, y: 0 }, b: { x: 100, y: 10 }, c: { x: 200, y: -10 }, d: { x: 300, y: 0.25 },
    });
  });

  it.each([
    ['alignment', [
      { id: 'a', position: { x: 0, y: 0 }, width: 50, height: 40 },
      { id: 'b', position: { x: 200, y: 30 }, width: 50, height: 40 },
    ], 'spatial.anchor.alignment'],
    ['order', [
      { id: 'a', position: { x: 200, y: 0 }, width: 50, height: 40 },
      { id: 'b', position: { x: 0, y: 0 }, width: 50, height: 40 },
    ], 'spatial.anchor.order'],
    ['space', [
      { id: 'a', position: { x: 0, y: 0 }, width: 50, height: 40 },
      { id: 'b', position: { x: 60, y: 0 }, width: 50, height: 40 },
    ], 'spatial.anchor.space'],
  ])('fails pinned-anchor %s without positions', (_name, captured, code) => {
    const source: GraphIR = {
      version: '3.0.0', id: 'failure',
      nodes: [{ id: 'a', type: 'service', pinned: true }, { id: 'b', type: 'service', pinned: true }], edges: [],
    };
    const result = computeSpatialPositions(planFor('arrange a and b in a row', source, captured, 20));
    expect(result).toMatchObject({ success: false, positions: [], diagnostics: [{ code, entityIds: ['a', 'b'] }] });
  });

});
