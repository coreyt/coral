/**
 * Tests for waypoint types and pure operations (Steps 1 + 6)
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  createWaypoint,
  addWaypointToEdge,
  removeWaypointFromEdge,
  moveWaypoint,
  insertWaypointAtPosition,
  useWaypointManager,
  type EdgeWaypoint,
} from '../src/waypoints/index.js';
import type { CoralNode, CoralEdge } from '../src/types.js';

describe('createWaypoint', () => {
  it('creates a waypoint with unique id, position, and type', () => {
    const wp = createWaypoint(100, 200);
    expect(wp.id).toBeDefined();
    expect(typeof wp.id).toBe('string');
    expect(wp.id.length).toBeGreaterThan(0);
    expect(wp.x).toBe(100);
    expect(wp.y).toBe(200);
    expect(wp.type).toBe('corner');
  });

  it('creates waypoints with unique IDs', () => {
    const wp1 = createWaypoint(0, 0);
    const wp2 = createWaypoint(0, 0);
    expect(wp1.id).not.toBe(wp2.id);
  });

  it('allows specifying smooth type', () => {
    const wp = createWaypoint(50, 75, 'smooth');
    expect(wp.type).toBe('smooth');
  });
});

describe('addWaypointToEdge', () => {
  it('adds to empty array', () => {
    const wp = createWaypoint(10, 20);
    const result = addWaypointToEdge([], wp);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(wp);
  });

  it('appends to existing array', () => {
    const existing: EdgeWaypoint[] = [createWaypoint(0, 0)];
    const wp = createWaypoint(10, 20);
    const result = addWaypointToEdge(existing, wp);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(wp);
  });

  it('does not mutate the original array', () => {
    const existing: EdgeWaypoint[] = [createWaypoint(0, 0)];
    const wp = createWaypoint(10, 20);
    addWaypointToEdge(existing, wp);
    expect(existing).toHaveLength(1);
  });
});

describe('removeWaypointFromEdge', () => {
  it('removes waypoint by id', () => {
    const wp1 = createWaypoint(10, 10);
    const wp2 = createWaypoint(20, 20);
    const result = removeWaypointFromEdge([wp1, wp2], wp1.id);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(wp2);
  });

  it('returns empty array when removing last waypoint', () => {
    const wp = createWaypoint(10, 10);
    const result = removeWaypointFromEdge([wp], wp.id);
    expect(result).toHaveLength(0);
  });

  it('returns unchanged array when id not found', () => {
    const wp = createWaypoint(10, 10);
    const result = removeWaypointFromEdge([wp], 'nonexistent');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(wp);
  });
});

describe('moveWaypoint', () => {
  it('moves waypoint by id to new position', () => {
    const wp1 = createWaypoint(10, 10);
    const wp2 = createWaypoint(20, 20);
    const result = moveWaypoint([wp1, wp2], wp1.id, 50, 60);
    expect(result[0].x).toBe(50);
    expect(result[0].y).toBe(60);
    expect(result[0].id).toBe(wp1.id);
    expect(result[1]).toEqual(wp2);
  });

  it('does not mutate original', () => {
    const wp = createWaypoint(10, 10);
    moveWaypoint([wp], wp.id, 50, 60);
    expect(wp.x).toBe(10);
    expect(wp.y).toBe(10);
  });
});

describe('insertWaypointAtPosition', () => {
  it('inserts waypoint in correct segment of a polyline path', () => {
    // Path goes from (0,0) → (100,0) → (100,100) → (200,100)
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ];
    // Click at (100, 50) — closest to segment (100,0)→(100,100)
    const result = insertWaypointAtPosition([], path, { x: 100, y: 50 });
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(100);
    expect(result[0].y).toBe(50);
  });

  it('inserts at correct position among existing waypoints', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
      { x: 300, y: 0 },
    ];
    const wp1 = createWaypoint(50, 0); // between seg 0-1
    // Insert at (250, 0) — between seg 2-3
    const result = insertWaypointAtPosition([wp1], path, { x: 250, y: 0 });
    expect(result).toHaveLength(2);
    // wp1 should come first, new one second
    expect(result[0]).toEqual(wp1);
    expect(result[1].x).toBe(250);
    expect(result[1].y).toBe(0);
  });

  it('handles single-segment path', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const result = insertWaypointAtPosition([], path, { x: 50, y: 0 });
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(50);
    expect(result[0].y).toBe(0);
  });
});

// Step 6: clearAllWaypoints + reflow behavior
describe('clearAllWaypoints for reflow (Step 6)', () => {
  function makeNode(id: string, x: number, y: number): CoralNode {
    return { id, type: 'symbol', position: { x, y }, data: { label: id, nodeType: 'process' }, width: 100, height: 50 } as CoralNode;
  }
  function makeEdge(id: string, source: string, target: string): CoralEdge {
    return { id, source, target, data: { label: '' } } as CoralEdge;
  }

  it('clearAllWaypoints empties the map', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 300, 0)];
    const edges = [makeEdge('e1', 'a', 'b')];
    const { result } = renderHook(() => useWaypointManager({ nodes, edges }));

    act(() => { result.current.addWaypoint('e1', { x: 150, y: 100 }); });
    expect(result.current.waypointMap.size).toBe(1);

    act(() => { result.current.clearAllWaypoints(); });
    expect(result.current.waypointMap.size).toBe(0);
  });

  it('after clearing, routing has no pinned waypoints', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 300, 0)];
    const edges = [makeEdge('e1', 'a', 'b')];
    const { result } = renderHook(() => useWaypointManager({ nodes, edges }));

    act(() => { result.current.addWaypoint('e1', { x: 150, y: 100 }); });
    act(() => { result.current.clearAllWaypoints(); });

    // After clearing, getRoutedPaths should have no entries (empty map = no waypoint-routed paths)
    expect(result.current.getRoutedPaths().size).toBe(0);
  });
});
