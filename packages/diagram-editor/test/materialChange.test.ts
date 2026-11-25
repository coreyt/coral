import { describe, expect, it } from 'vitest';
import {
  evaluateMaterialChange, hasMaterialQualityRegression, qualityGraphs, selectLayoutStrategy, shouldEscalateBroadLayout,
  type QualityScene,
} from '../src/materialChange';
import type { GraphIR } from '../src/printer';

function graph(nodes: GraphIR['nodes'], edges: GraphIR['edges'] = []): GraphIR {
  return { version: '1.0.0', id: 'g', nodes, edges };
}

describe('Slice 47 material-change evidence', () => {
  it('records small-graph membership, fields, constraints, and displacement separately', () => {
    const before = graph([
      { id: 'a', type: 'service', label: 'A', position: { x: 0, y: 0 }, pinned: true },
      { id: 'b', type: 'service', label: 'B', position: { x: 10, y: 0 } },
    ]);
    const after = graph([
      { id: 'a', type: 'service', label: 'Renamed', position: { x: 100, y: 0 } },
    ]);
    expect(evaluateMaterialChange(before, after)).toMatchObject({
      nodes: { added: [], removed: ['b'], matched: 1, smallGraph: true },
      nodeFields: { changed: 1 },
      constraints: { positionChanged: 1, pinChanged: 1 },
      displacement: { p50: 100, p95: 100, max: 100, outliers: ['a'] },
    });
  });

  it('keeps parallel edges as a multiset and detects redirects with no node loss', () => {
    const nodes = [{ id: 'a', type: 'service' }, { id: 'b', type: 'service' }, { id: 'c', type: 'service' }];
    const before = graph(nodes, [
      { id: 'one', source: 'a', target: 'b' },
      { id: 'two', source: 'a', target: 'b' },
    ]);
    const after = graph(nodes, [
      { id: 'one', source: 'a', target: 'c' },
      { id: 'two', source: 'a', target: 'b' },
    ]);
    const evidence = evaluateMaterialChange(before, after);
    expect(evidence.edges).toEqual({ added: [], removed: [], redirected: ['one'], fieldChanges: 0 });
    expect(selectLayoutStrategy(evidence, 'ai-change')).toBe('preserve-and-reroute');
  });

  it('keeps added-edge cardinality separate from stable-edge route inflation', () => {
    const nodes = [
      { id: 'a', type: 'service', position: { x: 0, y: 0 } },
      { id: 'b', type: 'service', position: { x: 100, y: 0 } },
    ];
    const before = graph(nodes, [{ id: 'stable', source: 'a', target: 'b' }]);
    const after = graph(nodes, [
      { id: 'stable', source: 'a', target: 'b' },
      { id: 'new-1', source: 'a', target: 'b' },
      { id: 'new-2', source: 'a', target: 'b' },
    ]);
    const evidence = evaluateMaterialChange(before, after);
    expect(evidence.quality.routeLengthAfter).toBe(evidence.quality.routeLengthBefore);
    expect(selectLayoutStrategy(evidence, 'ai-change')).toBe('preserve-and-reroute');
  });

  it('does not use a 50 percent threshold to authorize removal or select full layout', () => {
    const before = graph([{ id: 'a', type: 'service' }, { id: 'b', type: 'service' }]);
    const after = graph([{ id: 'a', type: 'service' }]);
    const evidence = evaluateMaterialChange(before, after);
    expect(evidence.nodes.removed).toEqual(['b']);
    expect(selectLayoutStrategy(evidence, 'ai-change')).toBe('preserve');
    expect(selectLayoutStrategy(evidence, 'initial-generation')).toBe('full');
    expect(selectLayoutStrategy(evidence, 'explicit-reflow')).toBe('full');
  });

  it('records explicit renames, overlap/route quality, inventories, and observed latency independently', () => {
    const before = graph([{ id: 'old', type: 'service', pinned: true, position: { x: 0, y: 0 }, dimensions: { width: 20, height: 20 } }]);
    const after = graph([
      { id: 'new', type: 'service', position: { x: 0, y: 0 }, dimensions: { width: 20, height: 20 } },
      { id: 'b', type: 'service', position: { x: 5, y: 5 }, dimensions: { width: 20, height: 20 } },
    ], [{ id: 'bad', source: 'new', target: 'missing', routingPoints: [{ x: Number.NaN, y: 1 }] }]);
    const evidence = evaluateMaterialChange(before, after, { renameMap: { old: 'new' }, observedLatencyMs: 12 });
    expect(evidence).toMatchObject({
      nodes: { added: ['b'], removed: [], matched: 1 },
      renames: [{ from: 'old', to: 'new' }],
      quality: { overlapsBefore: 0, overlapsAfter: 1, invalidRoutes: ['bad'] },
      inventory: { pinsBefore: 1, pinsAfter: 0, waypointsBefore: 0, waypointsAfter: 1 },
      observedLatencyMs: 12,
    });
  });

  it('accepts only a one-to-one rename map and does not count fan-out endpoints as crossings', () => {
    const before = graph([
      { id: 'old-a', type: 'service', position: { x: 0, y: 0 } },
      { id: 'old-b', type: 'service', position: { x: 0, y: 20 } },
    ]);
    const after = graph([
      { id: 'new', type: 'service', position: { x: 0, y: 0 } },
      { id: 'b', type: 'service', position: { x: 100, y: -50 } },
      { id: 'c', type: 'service', position: { x: 100, y: 50 } },
    ], [
      { id: 'ab', source: 'new', target: 'b' },
      { id: 'ac', source: 'new', target: 'c' },
    ]);
    const evidence = evaluateMaterialChange(before, after, {
      renameMap: { 'old-a': 'new', 'old-b': 'new' },
    });
    expect(evidence.renames).toEqual([{ from: 'old-a', to: 'new' }]);
    expect(evidence.quality.routeCrossingsAfter).toBe(0);
    expect(shouldEscalateBroadLayout(evidence)).toBe(false);
  });

  it('routes containment changes incrementally and escalates any geometry regression', () => {
    const before = graph([
      { id: 'group', type: 'group', children: [] },
      { id: 'node', type: 'service', position: { x: 0, y: 0 } },
    ]);
    const after = graph([{
      id: 'group', type: 'group', children: [
        { id: 'node', type: 'service', position: { x: 0, y: 0 } },
      ],
    }]);
    const containment = evaluateMaterialChange(before, after);
    expect(containment.constraints.containmentChanged).toBe(1);
    expect(selectLayoutStrategy(containment, 'ai-change')).toBe('incremental');

    const degraded = evaluateMaterialChange(
      graph([
        { id: 'a', type: 'service', position: { x: 0, y: 0 }, dimensions: { width: 20, height: 20 } },
        { id: 'b', type: 'service', position: { x: 30, y: 0 }, dimensions: { width: 20, height: 20 } },
      ]),
      graph([
        { id: 'a', type: 'service', position: { x: 0, y: 0 }, dimensions: { width: 20, height: 20 } },
        { id: 'b', type: 'service', position: { x: 5, y: 0 }, dimensions: { width: 20, height: 20 } },
      ]),
    );
    expect(shouldEscalateBroadLayout(degraded)).toBe(false);

    const broadDegraded = evaluateMaterialChange(
      graph([
        { id: 'a', type: 'service', position: { x: 0, y: 0 }, dimensions: { width: 20, height: 20 } },
      ]),
      graph([
        { id: 'a', type: 'service', position: { x: 0, y: 0 }, dimensions: { width: 20, height: 20 } },
        { id: 'b', type: 'service', position: { x: 5, y: 0 }, dimensions: { width: 20, height: 20 } },
      ], [{ id: 'ab', source: 'a', target: 'b' }]),
    );
    expect(shouldEscalateBroadLayout(broadDegraded)).toBe(true);
  });

  it('measures nested quality in absolute coordinates without counting containment as overlap', () => {
    const nested = graph([
      {
        id: 'group', type: 'group', position: { x: 100, y: 0 }, dimensions: { width: 200, height: 100 },
        children: [{ id: 'child', type: 'service', position: { x: 10, y: 10 }, dimensions: { width: 20, height: 20 } }],
      },
      { id: 'outside', type: 'service', position: { x: 400, y: 10 }, dimensions: { width: 20, height: 20 } },
    ], [{ id: 'route', source: 'child', target: 'outside' }]);
    const evidence = evaluateMaterialChange(nested, nested);
    expect(evidence.quality.overlapsBefore).toBe(0);
    expect(evidence.quality.routeLengthBefore).toBe(290);
    expect(evidence.quality.routeLengthAfter).toBe(290);
  });

  it('measures descendant displacement absolutely and excludes port redirects from route inflation', () => {
    const before = graph([{
      id: 'group', type: 'group', position: { x: 0, y: 0 },
      children: [{ id: 'child', type: 'service', position: { x: 10, y: 0 } }],
    }, { id: 'target', type: 'service', position: { x: 100, y: 0 } }], [
      { id: 'route', source: 'child', target: 'target', sourcePort: 'out-a' },
    ]);
    const after = graph([{
      id: 'group', type: 'group', position: { x: 100, y: 0 },
      children: [{ id: 'child', type: 'service', position: { x: 10, y: 0 } }],
    }, { id: 'target', type: 'service', position: { x: 100, y: 0 } }], [
      { id: 'route', source: 'child', target: 'target', sourcePort: 'out-b' },
    ]);
    const evidence = evaluateMaterialChange(before, after);
    expect(evidence.displacement.outliers).toContain('child');
    expect(evidence.edges.redirected).toEqual(['route']);
    expect(evidence.quality.routeLengthBefore).toBe(0);
    expect(evidence.quality.routeLengthAfter).toBe(0);
  });
});

// S93-WI-11: the incremental-layout gate must score the current display and
// the candidate from the same kind of geometry. A layout-managed baseline has
// no positions, so before this fix it always scored zero and any candidate
// with an inherent crossing (the BPMN correction loop) was rejected.
describe('Slice 93 like-for-like layout-quality scenes', () => {
  const box = (id: string, x: number, y: number, extra: Partial<QualityScene['nodes'][number]> = {}) =>
    ({ id, position: { x, y }, width: 20, height: 20, ...extra });
  // Two edges whose straight node-to-node segments cross once.
  const crossing: QualityScene = {
    nodes: [box('a', 0, 0), box('b', 100, 100), box('c', 100, 0), box('d', 0, 100)],
    edges: [{ id: 'ab', source: 'a', target: 'b' }, { id: 'cd', source: 'c', target: 'd' }],
  };
  const authored = graph(['a', 'b', 'c', 'd'].map((id) => ({ id, type: 'service', label: id })),
    [{ id: 'ab', source: 'a', target: 'b' }, { id: 'cd', source: 'c', target: 'd' }]);
  const rendered = graph(crossing.nodes.map((node) => ({ id: node.id, type: 'service', label: node.id,
    position: node.position, dimensions: { width: 20, height: 20 } })), authored.edges);

  it('reproduces the false regression from a geometry-less baseline', () => {
    expect(hasMaterialQualityRegression(evaluateMaterialChange(authored, rendered))).toBe(true);
  });

  it('accepts an unchanged inherent crossing when both sides use displayed geometry', () => {
    const evidence = evaluateMaterialChange(authored, rendered, { quality: qualityGraphs(crossing, crossing) });
    expect(evidence.quality).toMatchObject({ routeCrossingsBefore: 1, routeCrossingsAfter: 1, overlapsAfter: 0 });
    expect(hasMaterialQualityRegression(evidence)).toBe(false);
    // The escalation inputs stay authored-versus-rendered, exactly as before.
    expect(evidence.constraints.positionChanged).toBe(4);
  });

  it('still rejects a genuine new overlap or crossing', () => {
    const overlapping: QualityScene = { ...crossing, nodes: [...crossing.nodes.slice(0, 3), box('d', 5, 5)] };
    expect(hasMaterialQualityRegression(evaluateMaterialChange(authored, rendered, {
      quality: qualityGraphs(crossing, overlapping),
    }))).toBe(true);
    const clean: QualityScene = { ...crossing, nodes: [box('a', 0, 0), box('b', 0, 100), box('c', 100, 0), box('d', 100, 100)] };
    expect(hasMaterialQualityRegression(evaluateMaterialChange(authored, rendered, {
      quality: qualityGraphs(clean, crossing),
    }))).toBe(true);
  });

  it('uses routed polylines only when both sides have one', () => {
    const detour = [{ x: 10, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 110 }, { x: 110, y: 110 }];
    const routedBefore: QualityScene = { ...crossing, edges: [{ ...crossing.edges[0], routed: detour }, crossing.edges[1]] };
    const graphs = qualityGraphs(routedBefore, crossing);
    expect(graphs.before.edges.find((edge) => edge.id === 'ab')?.routingPoints).toBeUndefined();
    const both = qualityGraphs(routedBefore, routedBefore);
    expect(both.after.edges.find((edge) => edge.id === 'ab')?.routingPoints).toEqual(detour);
  });

  it('leaves a node without geometry, and its edges, out of both sides', () => {
    const unmeasured: QualityScene = { ...crossing, nodes: [...crossing.nodes.slice(0, 3), { id: 'd', position: { x: 0, y: 100 } }] };
    const graphs = qualityGraphs(crossing, unmeasured);
    for (const side of [graphs.before, graphs.after]) {
      expect(side.nodes.map((node) => node.id).sort()).toEqual(['a', 'b', 'c']);
      expect(side.edges.map((edge) => edge.id)).toEqual(['ab']);
    }
  });

  it('keeps a one-sided added node with geometry and flags a dangling edge', () => {
    const added: QualityScene = {
      nodes: [...crossing.nodes, box('e', 5, 5)],
      edges: [...crossing.edges, { id: 'ex', source: 'e', target: 'missing' }],
    };
    const evidence = evaluateMaterialChange(authored, rendered, { quality: qualityGraphs(crossing, added) });
    expect(evidence.quality.overlapsAfter).toBe(1);
    expect(evidence.quality.invalidRoutes).toEqual(['ex']);
  });

  it('nests children under their parent so absolute geometry matches on both sides', () => {
    const nested: QualityScene = {
      nodes: [box('g', 100, 100, { width: 200, height: 200 }), box('c1', 10, 10, { parent: 'g' }), box('c2', 60, 10, { parent: 'g' })],
      edges: [],
    };
    const graphs = qualityGraphs(nested, nested);
    expect(graphs.after.nodes).toEqual([expect.objectContaining({ id: 'g', children: [
      expect.objectContaining({ id: 'c1' }), expect.objectContaining({ id: 'c2' }),
    ] })]);
    const evidence = evaluateMaterialChange(graph([]), graph([]), { quality: graphs });
    expect(evidence.quality.overlapsAfter).toBe(0);
  });
});
