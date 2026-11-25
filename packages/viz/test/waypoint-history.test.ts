/**
 * Tests for waypoint undo/redo (Step 7)
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayoutHistory, type PositionSnapshot } from '../src/layout/useLayoutHistory.js';
import type { Node, XYPosition } from '@xyflow/react';
import type { EdgeWaypoint } from '../src/waypoints/types.js';

function makeNodes(...positions: [string, number, number][]): Node[] {
  return positions.map(([id, x, y]) => ({
    id,
    type: 'default',
    position: { x, y },
    data: {},
  }));
}

function makeWaypointMap(entries: [string, Array<{ id: string; x: number; y: number }>][]): Map<string, EdgeWaypoint[]> {
  return new Map(entries.map(([edgeId, wps]) => [
    edgeId,
    wps.map((wp) => ({ ...wp, type: 'corner' as const })),
  ]));
}

describe('waypoint undo/redo', () => {
  it('exposes monotonic sequence heads for a unified chronological owner', () => {
    const { result } = renderHook(() => useLayoutHistory());
    act(() => {
      result.current.saveSnapshotWithSequence!(makeNodes(['a', 0, 0]), 'before', new Map(), 17);
      result.current.saveSnapshotWithSequence!(makeNodes(['a', 20, 0]), 'after', new Map(), 17);
    });
    expect(result.current.undoSequence).toBe(17);
    act(() => { result.current.undo(); });
    expect(result.current.redoSequence).toBe(17);
  });

  it('undo restores previous waypoint state', () => {
    const { result } = renderHook(() => useLayoutHistory());

    const nodes1 = makeNodes(['a', 0, 0]);
    const wp1 = new Map<string, EdgeWaypoint[]>();

    const nodes2 = makeNodes(['a', 0, 0]);
    const wp2 = makeWaypointMap([['e1', [{ id: 'wp1', x: 100, y: 50 }]]]);

    act(() => { result.current.saveSnapshot(nodes1, 'initial', wp1); });
    act(() => { result.current.saveSnapshot(nodes2, 'add-waypoint', wp2); });

    let undoResult: { positions: Map<string, XYPosition>; waypoints?: Map<string, EdgeWaypoint[]> } | null = null;
    act(() => { undoResult = result.current.undo(); });

    expect(undoResult).not.toBeNull();
    expect(undoResult!.waypoints).toBeDefined();
    expect(undoResult!.waypoints!.size).toBe(0);
  });

  it('undo restores waypoints after move', () => {
    const { result } = renderHook(() => useLayoutHistory());

    const nodes = makeNodes(['a', 0, 0]);
    const wpBefore = makeWaypointMap([['e1', [{ id: 'wp1', x: 100, y: 50 }]]]);
    const wpAfter = makeWaypointMap([['e1', [{ id: 'wp1', x: 200, y: 80 }]]]);

    act(() => { result.current.saveSnapshot(nodes, 'before-move', wpBefore); });
    act(() => { result.current.saveSnapshot(nodes, 'after-move', wpAfter); });

    let undoResult: any = null;
    act(() => { undoResult = result.current.undo(); });

    const wp = undoResult!.waypoints!.get('e1')!;
    expect(wp[0].x).toBe(100);
    expect(wp[0].y).toBe(50);
  });

  it('undo restores waypoints after remove', () => {
    const { result } = renderHook(() => useLayoutHistory());

    const nodes = makeNodes(['a', 0, 0]);
    const wpBefore = makeWaypointMap([['e1', [{ id: 'wp1', x: 100, y: 50 }]]]);
    const wpAfter = new Map<string, EdgeWaypoint[]>();

    act(() => { result.current.saveSnapshot(nodes, 'before-remove', wpBefore); });
    act(() => { result.current.saveSnapshot(nodes, 'after-remove', wpAfter); });

    let undoResult: any = null;
    act(() => { undoResult = result.current.undo(); });

    expect(undoResult!.waypoints!.get('e1')).toHaveLength(1);
  });

  it('redo after undo', () => {
    const { result } = renderHook(() => useLayoutHistory());

    const nodes = makeNodes(['a', 0, 0]);
    const wp1 = new Map<string, EdgeWaypoint[]>();
    const wp2 = makeWaypointMap([['e1', [{ id: 'wp1', x: 100, y: 50 }]]]);

    act(() => { result.current.saveSnapshot(nodes, 'initial', wp1); });
    act(() => { result.current.saveSnapshot(nodes, 'add-waypoint', wp2); });

    act(() => { result.current.undo(); });

    let redoResult: any = null;
    act(() => { redoResult = result.current.redo(); });

    expect(redoResult).not.toBeNull();
    expect(redoResult!.waypoints!.get('e1')).toHaveLength(1);
  });

  it('multiple operations stack correctly', () => {
    const { result } = renderHook(() => useLayoutHistory());

    const nodes = makeNodes(['a', 0, 0]);
    const wp0 = new Map<string, EdgeWaypoint[]>();
    const wp1 = makeWaypointMap([['e1', [{ id: 'wp1', x: 100, y: 50 }]]]);
    const wp2 = makeWaypointMap([
      ['e1', [{ id: 'wp1', x: 100, y: 50 }, { id: 'wp2', x: 200, y: 80 }]],
    ]);

    act(() => { result.current.saveSnapshot(nodes, 's0', wp0); });
    act(() => { result.current.saveSnapshot(nodes, 's1', wp1); });
    act(() => { result.current.saveSnapshot(nodes, 's2', wp2); });

    // Undo twice to get back to wp0
    let r: any = null;
    act(() => { r = result.current.undo(); }); // → wp1
    expect(r!.waypoints!.get('e1')).toHaveLength(1);

    act(() => { r = result.current.undo(); }); // → wp0
    expect(r!.waypoints!.size).toBe(0);
  });

  it('undo clearAll restores all waypoints', () => {
    const { result } = renderHook(() => useLayoutHistory());

    const nodes = makeNodes(['a', 0, 0]);
    const wpFull = makeWaypointMap([
      ['e1', [{ id: 'wp1', x: 100, y: 50 }]],
      ['e2', [{ id: 'wp2', x: 200, y: 80 }]],
    ]);
    const wpEmpty = new Map<string, EdgeWaypoint[]>();

    act(() => { result.current.saveSnapshot(nodes, 'before-clear', wpFull); });
    act(() => { result.current.saveSnapshot(nodes, 'after-clear', wpEmpty); });

    let undoResult: any = null;
    act(() => { undoResult = result.current.undo(); });

    expect(undoResult!.waypoints!.size).toBe(2);
    expect(undoResult!.waypoints!.get('e1')).toHaveLength(1);
    expect(undoResult!.waypoints!.get('e2')).toHaveLength(1);
  });
});

describe('atomic precision history', () => {
  it('coalesces duplicate boundaries in a batch and branches immediately after undo', () => {
    const { result } = renderHook(() => useLayoutHistory());
    const at = (x: number) => makeNodes(['a', x, 0]);
    act(() => {
      result.current.saveSnapshot(at(0));
      result.current.saveSnapshot(at(10));
      result.current.saveSnapshot(at(10));
      result.current.saveSnapshot(at(20));
    });
    expect(result.current.undoCount).toBe(2);
    act(() => {
      expect(result.current.undo()?.positions.get('a')?.x).toBe(10);
      result.current.saveSnapshot(at(10));
    });
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.saveSnapshot(at(30)));
    expect(result.current.canRedo).toBe(false);
    act(() => expect(result.current.undo()?.positions.get('a')?.x).toBe(10));
  });

  it('isolates stored geometry from input and returned-state mutation', () => {
    const { result } = renderHook(() => useLayoutHistory());
    const before = makeWaypointMap([['e', [{ id: 'w', x: 10, y: 20 }]]]);
    act(() => result.current.saveSnapshot(makeNodes(['a', 0, 0]), 'before', before));
    before.get('e')![0].x = 999;
    act(() => result.current.saveSnapshot(makeNodes(['a', 20, 0]), 'after', new Map()));
    act(() => {
      const restored = result.current.undo()!;
      expect(restored.waypoints!.get('e')![0].x).toBe(10);
      restored.waypoints!.get('e')![0].x = 888;
      restored.positions.get('a')!.x = 888;
      result.current.redo();
      const again = result.current.undo()!;
      expect(again.positions.get('a')!.x).toBe(0);
      expect(again.waypoints!.get('e')![0].x).toBe(10);
    });
  });
});
