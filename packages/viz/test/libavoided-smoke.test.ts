/**
 * Smoke tests for libavoided-js
 *
 * Validates the dependency resolves, API works,
 * and output shape is compatible with CompatibilityEdge's routedPath.
 */
import { describe, it, expect } from 'vitest';
import { routeEdges } from 'libavoided-js';
import type { RouterInput, Obstacle, EdgeRequest, RouterOutput } from 'libavoided-js';

describe('libavoided-js smoke test', () => {
  it('module resolves and routeEdges is a function', () => {
    expect(typeof routeEdges).toBe('function');
  });

  it('routes a 2-node graph with sections containing startPoint, endPoint, bendPoints', () => {
    const obstacles: Obstacle[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 50 },
      { id: 'b', x: 300, y: 0, width: 100, height: 50 },
    ];
    const edges: EdgeRequest[] = [
      { id: 'e1', sourceId: 'a', targetId: 'b', sourcePoint: { x: 100, y: 25 }, targetPoint: { x: 300, y: 25 } },
    ];
    const input: RouterInput = { obstacles, edges };
    const output: RouterOutput = routeEdges(input);

    expect(output.edges).toHaveLength(1);
    const routed = output.edges[0];
    expect(routed.id).toBe('e1');
    expect(routed.sections).toBeDefined();
    expect(routed.sections.length).toBeGreaterThanOrEqual(1);

    const section = routed.sections[0];
    expect(section.startPoint).toHaveProperty('x');
    expect(section.startPoint).toHaveProperty('y');
    expect(section.endPoint).toHaveProperty('x');
    expect(section.endPoint).toHaveProperty('y');
    expect(Array.isArray(section.bendPoints)).toBe(true);
  });

  it('output points are {x: number, y: number} — compatible with CoralEdgeData.routedPath', () => {
    const obstacles: Obstacle[] = [
      { id: 'a', x: 0, y: 0, width: 80, height: 40 },
      { id: 'b', x: 200, y: 200, width: 80, height: 40 },
    ];
    const edges: EdgeRequest[] = [
      { id: 'e1', sourceId: 'a', targetId: 'b', sourcePoint: { x: 80, y: 20 }, targetPoint: { x: 200, y: 220 } },
    ];
    const output = routeEdges({ obstacles, edges });
    const section = output.edges[0].sections[0];

    // All points must be plain {x, y} numbers
    for (const pt of [section.startPoint, section.endPoint, ...section.bendPoints]) {
      expect(typeof pt.x).toBe('number');
      expect(typeof pt.y).toBe('number');
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    }
  });

  it('pinnedWaypoints on an edge forces routing near the pinned point', () => {
    const obstacles: Obstacle[] = [
      { id: 'a', x: 0, y: 0, width: 80, height: 40 },
      { id: 'b', x: 400, y: 0, width: 80, height: 40 },
    ];
    const waypoint = { x: 200, y: 150 };
    const edges: EdgeRequest[] = [
      {
        id: 'e1',
        sourceId: 'a',
        targetId: 'b',
        sourcePoint: { x: 80, y: 20 },
        targetPoint: { x: 400, y: 20 },
        pinnedWaypoints: [waypoint],
      },
    ];
    const output = routeEdges({ obstacles, edges });
    const section = output.edges[0].sections[0];

    // At least one bend point should be near the pinned waypoint
    const allPoints = [section.startPoint, ...section.bendPoints, section.endPoint];
    const nearWaypoint = allPoints.some(
      (pt) => Math.abs(pt.x - waypoint.x) < 50 && Math.abs(pt.y - waypoint.y) < 50,
    );
    expect(nearWaypoint).toBe(true);
  });

  it('multiple pinned waypoints produce bendPoints.length >= 2', () => {
    const obstacles: Obstacle[] = [
      { id: 'a', x: 0, y: 0, width: 80, height: 40 },
      { id: 'b', x: 600, y: 0, width: 80, height: 40 },
    ];
    const edges: EdgeRequest[] = [
      {
        id: 'e1',
        sourceId: 'a',
        targetId: 'b',
        sourcePoint: { x: 80, y: 20 },
        targetPoint: { x: 600, y: 20 },
        pinnedWaypoints: [
          { x: 200, y: 100 },
          { x: 400, y: 100 },
        ],
      },
    ];
    const output = routeEdges({ obstacles, edges });
    const section = output.edges[0].sections[0];
    expect(section.bendPoints.length).toBeGreaterThanOrEqual(2);
  });
});
