/**
 * Tests for useWaypointManager hook (Step 3)
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWaypointManager } from '../src/waypoints/useWaypointManager.js';
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
  return { id, source, target, data: { label: '' } } as CoralEdge;
}

const defaultNodes = [
  makeNode('a', 0, 0),
  makeNode('b', 300, 0),
];
const defaultEdges = [makeEdge('e1', 'a', 'b')];

describe('useWaypointManager', () => {
  it('initializes with empty waypoint map', () => {
    const { result } = renderHook(() =>
      useWaypointManager({ nodes: defaultNodes, edges: defaultEdges }),
    );
    expect(result.current.waypointMap.size).toBe(0);
  });

  it('addWaypoint adds a waypoint and triggers routing', () => {
    const { result } = renderHook(() =>
      useWaypointManager({ nodes: defaultNodes, edges: defaultEdges }),
    );

    act(() => {
      result.current.addWaypoint('e1', { x: 150, y: 100 });
    });

    expect(result.current.waypointMap.size).toBe(1);
    const wps = result.current.waypointMap.get('e1');
    expect(wps).toHaveLength(1);
    expect(wps![0].x).toBe(150);
    expect(wps![0].y).toBe(100);
  });

  it('moveWaypoint updates the position', () => {
    const { result } = renderHook(() =>
      useWaypointManager({ nodes: defaultNodes, edges: defaultEdges }),
    );

    act(() => {
      result.current.addWaypoint('e1', { x: 150, y: 100 });
    });
    const wpId = result.current.waypointMap.get('e1')![0].id;

    act(() => {
      result.current.moveWaypoint('e1', wpId, { x: 200, y: 150 });
    });

    const wps = result.current.waypointMap.get('e1');
    expect(wps![0].x).toBe(200);
    expect(wps![0].y).toBe(150);
  });

  it('removeWaypoint removes by ID', () => {
    const { result } = renderHook(() =>
      useWaypointManager({ nodes: defaultNodes, edges: defaultEdges }),
    );

    act(() => {
      result.current.addWaypoint('e1', { x: 150, y: 100 });
    });
    const wpId = result.current.waypointMap.get('e1')![0].id;

    act(() => {
      result.current.removeWaypoint('e1', wpId);
    });

    // Edge key removed when empty
    expect(result.current.waypointMap.has('e1')).toBe(false);
  });

  it('clearWaypoints clears one edge', () => {
    const { result } = renderHook(() =>
      useWaypointManager({ nodes: defaultNodes, edges: defaultEdges }),
    );

    act(() => {
      result.current.addWaypoint('e1', { x: 150, y: 100 });
    });

    act(() => {
      result.current.clearWaypoints('e1');
    });

    expect(result.current.waypointMap.has('e1')).toBe(false);
  });

  it('clearAllWaypoints clears everything', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 300, 0), makeNode('c', 0, 300)];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'a', 'c')];

    const { result } = renderHook(() =>
      useWaypointManager({ nodes, edges }),
    );

    act(() => {
      result.current.addWaypoint('e1', { x: 150, y: 100 });
      result.current.addWaypoint('e2', { x: 50, y: 150 });
    });

    act(() => {
      result.current.clearAllWaypoints();
    });

    expect(result.current.waypointMap.size).toBe(0);
  });

  it('getRoutedPaths returns Map with RoutedPath entries', () => {
    const { result } = renderHook(() =>
      useWaypointManager({ nodes: defaultNodes, edges: defaultEdges }),
    );

    act(() => {
      result.current.addWaypoint('e1', { x: 150, y: 100 });
    });

    const paths = result.current.getRoutedPaths();
    expect(paths.size).toBe(1);
    const path = paths.get('e1');
    expect(path).toBeDefined();
    expect(path!.startPoint).toHaveProperty('x');
    expect(path!.endPoint).toHaveProperty('x');
    expect(Array.isArray(path!.bendPoints)).toBe(true);
  });

  it('hasWaypoints returns true only for edges with waypoints', () => {
    const { result } = renderHook(() =>
      useWaypointManager({ nodes: defaultNodes, edges: defaultEdges }),
    );

    expect(result.current.hasWaypoints('e1')).toBe(false);

    act(() => {
      result.current.addWaypoint('e1', { x: 150, y: 100 });
    });

    expect(result.current.hasWaypoints('e1')).toBe(true);
    expect(result.current.hasWaypoints('e2')).toBe(false);
  });

  it('restores from initial waypoint map', () => {
    const initial = new Map<string, Array<{ id: string; x: number; y: number; type: 'corner' | 'smooth' }>>();
    initial.set('e1', [{ id: 'wp-1', x: 150, y: 100, type: 'corner' }]);

    const { result } = renderHook(() =>
      useWaypointManager({ nodes: defaultNodes, edges: defaultEdges, initialWaypoints: initial }),
    );

    expect(result.current.waypointMap.size).toBe(1);
    expect(result.current.waypointMap.get('e1')).toHaveLength(1);
  });

  it('replaces all waypoints when document or DSL geometry is loaded', () => {
    const { result } = renderHook(() =>
      useWaypointManager({ nodes: defaultNodes, edges: defaultEdges }),
    );
    const replacement = new Map([
      ['e1', [{ id: 'loaded-1', x: 90, y: 75, type: 'corner' as const }]],
    ]);

    act(() => result.current.setWaypoints(replacement));

    expect(result.current.waypointMap).not.toBe(replacement);
    expect(result.current.waypointMap.get('e1')).toEqual(replacement.get('e1'));
  });

  it('multiple adds to same edge accumulate', () => {
    const { result } = renderHook(() =>
      useWaypointManager({ nodes: defaultNodes, edges: defaultEdges }),
    );

    act(() => {
      result.current.addWaypoint('e1', { x: 100, y: 50 });
    });
    act(() => {
      result.current.addWaypoint('e1', { x: 200, y: 50 });
    });

    const wps = result.current.waypointMap.get('e1');
    expect(wps).toHaveLength(2);
  });

  it('calls onChange callback when waypoints change', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWaypointManager({ nodes: defaultNodes, edges: defaultEdges, onChange }),
    );

    act(() => {
      result.current.addWaypoint('e1', { x: 150, y: 100 });
    });

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

it('refreshes routed endpoints when node geometry changes without changing waypoint anchors', () => {
  const { result, rerender } = renderHook(({ nodes }) => useWaypointManager({ nodes, edges: defaultEdges }), {
    initialProps: { nodes: defaultNodes },
  });
  act(() => result.current.addWaypoint('e1', { x: 150, y: 100 }));
  const before = result.current.getRoutedPaths().get('e1')!;
  const anchor = result.current.waypointMap.get('e1');
  rerender({ nodes: [makeNode('a', 50, 0, 120), defaultNodes[1]] });
  const after = result.current.getRoutedPaths().get('e1')!;
  expect(after.startPoint).not.toEqual(before.startPoint);
  expect(result.current.waypointMap.get('e1')).toEqual(anchor);
});

it('publishes complete waypoint changes synchronously once per operation in one batch', () => {
  const onChange = vi.fn();
  const { result } = renderHook(() => useWaypointManager({ nodes: defaultNodes, edges: defaultEdges, onChange }));
  act(() => {
    result.current.addWaypoint('e1', { x: 150, y: 100 });
    const id = onChange.mock.lastCall![0].get('e1')[0].id;
    result.current.moveWaypoint('e1', id, { x: 175, y: 110 });
    expect(onChange.mock.lastCall![0].get('e1')[0]).toMatchObject({ id, x: 175, y: 110 });
    result.current.removeWaypoint('e1', id);
    expect(onChange.mock.lastCall![0].size).toBe(0);
  });
  expect(onChange).toHaveBeenCalledTimes(3);
});


it('deep-copies initial and restored waypoint maps including identity and type', () => {
  const initial = new Map([['e1', [{ id: 'stable', x: 150, y: 100, type: 'smooth' as const }]]]);
  const { result } = renderHook(() => useWaypointManager({ nodes: defaultNodes, edges: defaultEdges, initialWaypoints: initial }));
  initial.get('e1')![0].x = 999;
  expect(result.current.waypointMap.get('e1')![0]).toEqual({ id: 'stable', x: 150, y: 100, type: 'smooth' });
  const restored = new Map([['e1', [{ id: 'restored', x: 175, y: 110, type: 'corner' as const }]]]);
  act(() => result.current.setWaypoints(restored));
  restored.get('e1')![0].y = 999;
  expect(result.current.waypointMap.get('e1')![0]).toEqual({ id: 'restored', x: 175, y: 110, type: 'corner' });
});


it('does not override unrelated routes when one edge gains a waypoint', () => {
  const nodes = [...defaultNodes, makeNode('c', 0, 300)];
  const edges = [...defaultEdges, makeEdge('unrelated', 'a', 'c')];
  const { result } = renderHook(() => useWaypointManager({ nodes, edges }));
  act(() => result.current.addWaypoint('e1', { x: 150, y: 100 }));
  expect([...result.current.getRoutedPaths().keys()]).toEqual(['e1']);
});

it('invalidates cached routes after an obstacle moves even when the input arrays are reused', () => {
  const obstacle = makeNode('block', 600, 400);
  const nodes = [...defaultNodes, obstacle];
  const { result, rerender } = renderHook(() => useWaypointManager({ nodes, edges: defaultEdges }));
  act(() => result.current.addWaypoint('e1', { x: 150, y: 100 }));
  const before = result.current.getRoutedPaths();
  expect(result.current.getRoutedPaths()).toBe(before);
  obstacle.position = { x: 125, y: 75 };
  rerender();
  expect(() => result.current.getRoutedPaths()).toThrow(/waypoint|obstacle/i);
  obstacle.position = { x: 600, y: 400 };
  rerender();
  expect(result.current.getRoutedPaths().get('e1')).toEqual(before.get('e1'));
});


it('invalidates routes when effective routing options change and reuses equal inputs', () => {
  const node = { ...makeNode('a', 0, 0), data: { label: 'a', nodeType: 'node', canonical: { ports: [{ id: 'top', side: 'NORTH' as const, position: 0.5 }] } } };
  const edges = [{ ...defaultEdges[0], sourceHandle: 'top' }];
  const { result, rerender } = renderHook(({ direction }) => useWaypointManager({ nodes: [node, defaultNodes[1]], edges, routingOptions: { direction } }), { initialProps: { direction: 'RIGHT' as 'RIGHT' | 'DOWN' } });
  act(() => result.current.addWaypoint('e1', { x: 150, y: -100 }));
  const before = result.current.getRoutedPaths();
  expect(result.current.getRoutedPaths()).toBe(before);
  rerender({ direction: 'DOWN' });
  expect(result.current.getRoutedPaths()).not.toBe(before);
  expect(result.current.getRoutedPaths().get('e1')!.startPoint).toEqual(before.get('e1')!.startPoint);
});


it('keeps durable source route sections out of transient overrides, including coincident authored checkpoints', () => {
  const edges = [{ ...defaultEdges[0], data: { canonical: { routeIntent: { waypoints: [
    { id: 'at-contact', placement: { kind: 'absolute' as const, position: { x: 100, y: 25 } } },
    { id: 'guided', placement: { kind: 'absolute' as const, position: { x: 200, y: 25 } } },
  ] } } } }];
  const { result } = renderHook(() => useWaypointManager({ nodes: defaultNodes, edges,
    initialWaypoints: new Map([['e1', [{ id: 'at-contact', x: 100, y: 25, type: 'corner' }]]]),
  }));
  expect(result.current.hasWaypoints('e1')).toBe(true);
  expect(result.current.getRoutedPaths().size).toBe(0);
  expect(edges[0]!.data.canonical.routeIntent.waypoints).toHaveLength(2);
});

it('respects source-owned typed route identities supplied by the editor adapter', () => {
  const { result } = renderHook(() => useWaypointManager({ nodes: defaultNodes, edges: defaultEdges,
    routingOptions: { sourceRouteEdgeIds: ['e1'] },
    initialWaypoints: new Map([['e1', [{ id: 'source', x: 150, y: 100, type: 'corner' }]]]),
  }));
  expect(result.current.getRoutedPaths().size).toBe(0);
});
