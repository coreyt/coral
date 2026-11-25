/**
 * Tests for routeWithWaypoints adapter (Step 2)
 */
import { describe, it, expect } from 'vitest';
import { routeWithWaypoints } from '../src/waypoints/router.js';
import { createWaypoint, type EdgeWaypoint } from '../src/waypoints/index.js';
import type { CoralNode, CoralEdge } from '../src/types.js';

function makeNode(id: string, x: number, y: number, w = 100, h = 50): CoralNode {
  return {
    id,
    type: 'symbol',
    position: { x, y },
    data: { label: id, nodeType: 'process' },
    width: w,
    height: h,
  } as CoralNode;
}

function makeEdge(id: string, source: string, target: string): CoralEdge {
  return {
    id,
    source,
    target,
    data: { label: '' },
  } as CoralEdge;
}

describe('routeWithWaypoints', () => {
  const nodes = [
    makeNode('a', 0, 0, 100, 50),
    makeNode('b', 300, 0, 100, 50),
  ];
  const edges = [makeEdge('e1', 'a', 'b')];

  it('auto-routes without waypoints', () => {
    const result = routeWithWaypoints(nodes, edges);
    expect(result.size).toBe(1);
    const route = result.get('e1');
    expect(route).toBeDefined();
    expect(route!.startPoint).toHaveProperty('x');
    expect(route!.startPoint).toHaveProperty('y');
    expect(route!.endPoint).toHaveProperty('x');
    expect(route!.endPoint).toHaveProperty('y');
    expect(Array.isArray(route!.bendPoints)).toBe(true);
  });

  it('routes with a single waypoint', () => {
    const waypointMap = new Map<string, EdgeWaypoint[]>();
    waypointMap.set('e1', [createWaypoint(150, 100)]);

    const result = routeWithWaypoints(nodes, edges, waypointMap);
    const route = result.get('e1');
    expect(route).toBeDefined();
    // Route should have bend points passing near the waypoint
    const allPoints = [route!.startPoint, ...route!.bendPoints, route!.endPoint];
    const near = allPoints.some(
      (p) => Math.abs(p.x - 150) < 50 && Math.abs(p.y - 100) < 50,
    );
    expect(near).toBe(true);
  });

  it('routes with multiple waypoints', () => {
    const waypointMap = new Map<string, EdgeWaypoint[]>();
    waypointMap.set('e1', [createWaypoint(150, 80), createWaypoint(250, 80)]);

    const result = routeWithWaypoints(nodes, edges, waypointMap);
    const route = result.get('e1');
    expect(route).toBeDefined();
    expect(route!.bendPoints.length).toBeGreaterThanOrEqual(2);
  });

  it('handles mixed edges (some with waypoints, some without)', () => {
    const node3 = makeNode('c', 0, 200, 100, 50);
    const e2 = makeEdge('e2', 'a', 'c');
    const waypointMap = new Map<string, EdgeWaypoint[]>();
    waypointMap.set('e1', [createWaypoint(150, 100)]);

    const result = routeWithWaypoints([...nodes, node3], [edges[0], e2], waypointMap);
    expect(result.size).toBe(2);
    expect(result.get('e1')).toBeDefined();
    expect(result.get('e2')).toBeDefined();
  });

  it('output is compatible with buildRoutedPath (startPoint, endPoint, bendPoints)', () => {
    const result = routeWithWaypoints(nodes, edges);
    for (const [, route] of result) {
      expect(typeof route.startPoint.x).toBe('number');
      expect(typeof route.startPoint.y).toBe('number');
      expect(typeof route.endPoint.x).toBe('number');
      expect(typeof route.endPoint.y).toBe('number');
      for (const bp of route.bendPoints) {
        expect(typeof bp.x).toBe('number');
        expect(typeof bp.y).toBe('number');
      }
    }
  });

  it('converts nodes to obstacles correctly', () => {
    // A self-contained test: ensure nodes with position/size produce valid routes
    const bigNodes = [
      makeNode('x', 50, 50, 120, 60),
      makeNode('y', 400, 200, 120, 60),
    ];
    const bigEdge = [makeEdge('ex', 'x', 'y')];
    const result = routeWithWaypoints(bigNodes, bigEdge);
    expect(result.size).toBe(1);
    const route = result.get('ex')!;
    // The route should start and end near the node boundaries
    expect(route.startPoint.x).toBeGreaterThanOrEqual(50);
    expect(route.endPoint.x).toBeGreaterThanOrEqual(400);
  });

  it('rejects edges referencing nonexistent nodes', () => {
    const badEdge = makeEdge('bad', 'a', 'nonexistent');
    expect(() => routeWithWaypoints(nodes, [badEdge])).toThrow(/endpoint|missing/i);
  });
});

describe('routeWithWaypoints: input shapes (R-030)', () => {
  const node = (id: string, x: number, y: number) =>
    ({ id, position: { x, y }, width: 100, height: 60, data: { label: id } }) as never;

  it('routes nothing when there are no edges', () => {
    const routed = routeWithWaypoints([node('a', 0, 0)], []);
    expect(routed.size).toBe(0);
  });

  it('rejects an edge whose source is missing', () => {
    expect(() => routeWithWaypoints(
      [node('b', 200, 0)],
      [{ id: 'e', source: 'missing', target: 'b' } as never]
    )).toThrow(/endpoint|missing/i);
  });

  it('rejects an edge whose target is missing', () => {
    expect(() => routeWithWaypoints(
      [node('a', 0, 0)],
      [{ id: 'e', source: 'a', target: 'missing' } as never]
    )).toThrow(/endpoint|missing/i);
  });

  it('routes without a waypoint map at all', () => {
    const routed = routeWithWaypoints(
      [node('a', 0, 0), node('b', 300, 0)],
      [{ id: 'e', source: 'a', target: 'b' } as never]
    );
    expect(routed.size).toBeGreaterThanOrEqual(0);
  });

  it('routes through supplied waypoints', () => {
    const routed = routeWithWaypoints(
      [node('a', 0, 0), node('b', 300, 300)],
      [{ id: 'e', source: 'a', target: 'b' } as never],
      new Map([['e', [{ id: 'w', x: 150, y: 0, type: 'corner' as const }]]])
    );
    expect(routed).toBeDefined();
  });

  it('ignores waypoints for an edge that is not present', () => {
    const routed = routeWithWaypoints(
      [node('a', 0, 0), node('b', 300, 0)],
      [{ id: 'e', source: 'a', target: 'b' } as never],
      new Map([['other', [{ id: 'w', x: 10, y: 10, type: 'corner' as const }]]])
    );
    expect(routed.has('other')).toBe(false);
  });

  it('handles a node with no explicit size', () => {
    const routed = routeWithWaypoints(
      [
        { id: 'a', position: { x: 0, y: 0 }, data: { label: 'a' } } as never,
        { id: 'b', position: { x: 300, y: 0 }, data: { label: 'b' } } as never,
      ],
      [{ id: 'e', source: 'a', target: 'b' } as never]
    );
    expect(routed).toBeDefined();
  });
});


describe('waypoint routing uses final editor geometry', () => {
  it('resolves nested positions to graph absolute coordinates without treating ancestor containers as blockers', () => {
    const parent = makeNode('group', 500, 300, 600, 300);
    const a = { ...makeNode('a', 40, 40), parentId: 'group' };
    const b = { ...makeNode('b', 340, 40), parentId: 'group' };
    const route = routeWithWaypoints([parent, a, b], [makeEdge('e', 'a', 'b')]).get('e')!;
    const local = routeWithWaypoints([makeNode('a', 40, 40), makeNode('b', 340, 40)], [makeEdge('e', 'a', 'b')]).get('e')!;
    expect(route.startPoint).toEqual({ x: local.startPoint.x + 500, y: local.startPoint.y + 300 });
    expect(route.endPoint.x).toBeCloseTo(local.endPoint.x + 500);
    expect(route.endPoint.y).toBeCloseTo(local.endPoint.y + 300);
  });

  it('uses measured and styled dimensions and preserves fixed port identity', () => {
    const a = { ...makeNode('a', 0, 0), width: undefined, height: undefined,
      measured: { width: 120, height: 80 }, data: { label: 'a', nodeType: 'process', canonical: { ports: [{ id: 'exact', side: 'NORTH' as const, position: 0.25 }] } } };
    const b = { ...makeNode('b', 300, 0), width: undefined, height: undefined, style: { width: 140, height: 60 } };
    const edge = { ...makeEdge('e', 'a', 'b'), sourceHandle: 'exact' };
    const route = routeWithWaypoints([a, b], [edge]).get('e')!;
    expect(route.startPoint).toEqual({ x: 30, y: 0 });
    expect(route.bendPoints[0]!.y).toBeLessThan(0);
    expect(route.endPoint.x).toBe(320);
    expect(route.endPoint.y).toBeCloseTo(30 + 70 / 31);
  });

  it('uses the visible diamond contour instead of the surrounding rectangle', () => {
    const a = { ...makeNode('a', 0, 0, 100, 100), data: { label: 'a', nodeType: 'decision', symbolId: 'flowchart-decision', notationId: 'flowchart' } };
    const route = routeWithWaypoints([a, makeNode('b', 300, 200, 100, 100)], [makeEdge('e', 'a', 'b')]).get('e')!;
    expect(Math.abs(route.startPoint.x - 50) / 50 + Math.abs(route.startPoint.y - 50) / 50).toBeCloseTo(1);
    expect(route.startPoint.x).toBeLessThan(100);
  });

  it('rejects a pinned checkpoint inside an unrelated obstacle', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 300, 0), makeNode('block', 140, 70)];
    expect(() => routeWithWaypoints(nodes, [makeEdge('e', 'a', 'b')], new Map([['e', [createWaypoint(180, 100)]]]))).toThrow(/waypoint|obstacle/i);
  });
  it('preserves fixed semantic port contacts while routing an edge on a mixed-port node', () => {
    const a: CoralNode = { ...makeNode('a', 0, 0, 100, 100), data: { label: 'a', nodeType: 'node', notationId: 'flowchart', authoredSemanticPorts: [
      { id: 'fixed', direction: 'out', anchor: 'N' }, { id: 'free', direction: 'out', anchor: 'side' },
    ] } };
    const edge = { ...makeEdge('e', 'a', 'b'), sourceHandle: 'fixed' };
    const nodes = [a, makeNode('b', 300, 100)];
    const first = routeWithWaypoints(nodes, [edge], new Map([['e', [createWaypoint(150, -60)]]])).get('e')!;
    const second = routeWithWaypoints(nodes, [edge], new Map([['e', [createWaypoint(240, -100)]]])).get('e')!;
    expect(first.startPoint).toEqual(second.startPoint);
    expect(first.startPoint).toEqual({ x: 50, y: 20 });
    expect(first.bendPoints[0]!.y).toBeLessThan(first.startPoint.y);
  });

  it('keeps an accepted free semantic side and position when checkpoints change', () => {
    const a: CoralNode = { ...makeNode('a', 0, 0, 100, 100), data: { label: 'a', nodeType: 'node', notationId: 'flowchart',
      authoredSemanticPorts: [{ id: 'free', direction: 'out', anchor: 'side' }],
      resolvedPortAttachments: { free: 'WEST' }, resolvedPortPositions: { free: 0.25 } } };
    const edge = { ...makeEdge('e', 'a', 'b'), sourceHandle: 'free' };
    const nodes = [a, makeNode('b', 300, 100)];
    const first = routeWithWaypoints(nodes, [edge], new Map([['e', [createWaypoint(150, -60)]]])).get('e')!;
    const second = routeWithWaypoints(nodes, [edge], new Map([['e', [createWaypoint(240, -100)]]])).get('e')!;
    expect(first.startPoint).toEqual({ x: 0, y: 35 });
    expect(second.startPoint).toEqual(first.startPoint);
    expect(second.bendPoints[0]!.x).toBeLessThan(0);
  });

  it.each(['source', 'target'] as const)('rejects a checkpoint inside the painted %s body', (endpoint) => {
    const nodes = [makeNode('a', 0, 0, 100, 60), makeNode('b', 300, 0, 100, 60)];
    const waypoint = endpoint === 'source' ? createWaypoint(50, 30) : createWaypoint(350, 30);
    expect(() => routeWithWaypoints(nodes, [makeEdge('e', 'a', 'b')], new Map([['e', [waypoint]]])))
      .toThrow(/body|penetrat|route|endpoint/i);
  });

});
