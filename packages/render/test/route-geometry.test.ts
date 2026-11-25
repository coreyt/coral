import { routeFixedGeometry } from '../src/layout/routeFixedGeometry.js';
import { describe, expect, it } from 'vitest';
import { segmentIntersectsBox, validateRouteSections } from '../src/layout/routeGeometry.js';

const section = (points: Array<{ x: number; y: number }>) => ({ startPoint: points[0]!, bendPoints: points.slice(1, -1), endPoint: points.at(-1)! });

describe('final route geometry', () => {
  it('clips diagonal segments against the actual open box interior', () => {
    const box = { x: 10, y: 10, width: 20, height: 20 };
    expect(segmentIntersectsBox({ x: 0, y: 0 }, { x: 40, y: 40 }, box)).toBe(true);
    expect(segmentIntersectsBox({ x: 0, y: 20 }, { x: 20, y: 0 }, box)).toBe(false);
    expect(segmentIntersectsBox({ x: 0, y: 10 }, { x: 40, y: 10 }, box)).toBe(false);
  });

  it('rejects missing, nonfinite, discontinuous, diagonal, and duplicate geometry', () => {
    expect(validateRouteSections([], {}).map((issue) => issue.code)).toContain('route.empty');
    expect(validateRouteSections([section([{ x: NaN, y: 0 }, { x: 20, y: 0 }])], {}).map((issue) => issue.code)).toContain('route.nonfinite');
    expect(validateRouteSections([section([{ x: 0, y: 0 }, { x: 20, y: 0 }]), section([{ x: 21, y: 0 }, { x: 30, y: 0 }])], {}).map((issue) => issue.code)).toContain('route.discontinuous');
    expect(validateRouteSections([section([{ x: 0, y: 0 }, { x: 20, y: 20 }])], { routingStyle: 'orthogonal' }).map((issue) => issue.code)).toContain('route.diagonal');
    expect(validateRouteSections([section([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 0 }])], {}).map((issue) => issue.code)).toContain('route.duplicate');
  });

  it('requires exact contacts, approach directions, and ordered checkpoint fidelity', () => {
    const route = [section([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }])];
    expect(validateRouteSections(route, { sourcePoint: { x: 1, y: 0 } }).map((issue) => issue.code)).toContain('route.source');
    expect(validateRouteSections(route, { sourceDirection: 'left', targetDirection: 'up' }).map((issue) => issue.code)).toEqual(expect.arrayContaining(['route.source-direction', 'route.target-direction']));
    expect(validateRouteSections(route, { waypoints: [{ x: 40, y: 20 }, { x: 20, y: 0 }] }).map((issue) => issue.code)).toContain('route.waypoint');
    expect(validateRouteSections(route, { waypoints: [{ x: 20, y: 0 }, { x: 40, y: 20 }] })).toEqual([]);
  });

  it('routes each exact checkpoint leg around obstacles instead of using pinned bypass', () => {
    const obstacles = [{ id: 'block', x: 80, y: -20, width: 40, height: 40 }];
    const waypoints = [{ x: 180, y: 0 }, { x: 180, y: 80 }];
    const request = { id: 'e', sourceId: 'a', targetId: 'b', sourcePoint: { x: 0, y: 0 }, targetPoint: { x: 240, y: 80 }, waypoints, obstacles };
    const sections = routeFixedGeometry(request);
    expect(validateRouteSections(sections, { ...request, routingStyle: 'orthogonal' })).toEqual([]);
    expect(sections[0]!.endPoint).toEqual(waypoints[0]);
    expect(sections[1]!.endPoint).toEqual(waypoints[1]);
    expect(sections[0]!.bendPoints.length).toBeGreaterThanOrEqual(2);
  });

  it.each(['horizontal', 'vertical'] as const)('keeps preferred clearance when the engine snaps %s terminal joins', axis => {
    const point = (x: number, y: number) => axis === 'horizontal' ? { x, y } : { x: y, y: x };
    const box = (id: string, x: number, y: number, width: number, height: number) => ({
      id, ...point(x, y), width: axis === 'horizontal' ? width : height,
      height: axis === 'horizontal' ? height : width,
    });
    // Exact endpoints are outside the shaft but inside its preferred margin.
    // The engine restores them with diagonal joins to its snapped grid. The
    // nearby body prevents one elbow orientation; the omitted body requires
    // removal of a tiny terminal retrace to retain its full 8px clearance.
    const omitted = box('source-body', -20, -10, 22, 20);
    const request = { id: 'snapped', sourceId: 'a', targetId: 'b',
      sourcePoint: point(10, 40), targetPoint: point(91, 40),
      obstacles: [box('shaft', 10.25, 20, 80.5, 40), box('target-body', 99, 30, 50, 50), omitted] };
    const before = structuredClone(request);
    const route = routeFixedGeometry(request);
    expect(validateRouteSections(route, { ...request, routingStyle: 'orthogonal' })).toEqual([]);
    // Both top (12) and bottom (68) are exact symmetric 28px detours around [20..60] clearing omitted by >= 8px.
    const expectedTop = [section([point(10, 40), point(10, 12), point(91, 12), point(91, 40)])];
    const expectedBottom = [section([point(10, 40), point(10, 68), point(91, 68), point(91, 40)])];
    expect([expectedTop, expectedBottom]).toContainEqual(route);
    expect(validateRouteSections(route, { obstacles: [{ ...omitted,
      x: omitted.x - 8, y: omitted.y - 8, width: omitted.width + 16, height: omitted.height + 16 }] })).toEqual([]);
    expect(request).toEqual(before);
  });

  it.each(['horizontal', 'vertical'] as const)('keeps clear %s checkpoint legs straight and exact', axis => {
    const point = (x: number, y: number) => axis === 'horizontal' ? { x, y } : { x: y, y: x };
    const request = { id: 'clear', sourceId: 'a', targetId: 'b', sourcePoint: point(0, 0),
      targetPoint: point(240, 0), waypoints: [point(80, 0), point(160, 0)],
      sourceDirection: axis === 'horizontal' ? 'right' as const : 'down' as const,
      targetDirection: axis === 'horizontal' ? 'right' as const : 'down' as const,
      obstacles: [{ id: 'nearby', ...point(80, 30), width: 20, height: 20 }] };
    const before = structuredClone(request);
    const sections = routeFixedGeometry(request);
    expect(sections).toEqual([section([point(0, 0), point(80, 0)]),
      section([point(80, 0), point(160, 0)]), section([point(160, 0), point(240, 0)])]);
    expect(validateRouteSections(sections, { ...request, routingStyle: 'orthogonal' })).toEqual([]);
    expect(request).toEqual(before);
  });

  it('retains preferred clearance when a raw-clear straight segment crowds an obstacle', () => {
    const obstacle = { id: 'nearby', x: 80, y: 4, width: 40, height: 20 };
    const request = { id: 'clearance', sourceId: 'a', targetId: 'b', sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 200, y: 0 }, obstacles: [obstacle] };
    const sections = routeFixedGeometry(request);
    expect(sections.some(part => part.bendPoints.length > 0)).toBe(true);
    expect(validateRouteSections(sections, { ...request, routingStyle: 'orthogonal',
      obstacles: [{ ...obstacle, x: 72, y: -4, width: 56, height: 36 }] })).toEqual([]);
  });

  it('checks distant obstacles when a local detour leaves the endpoint corridor', () => {
    const obstacles = [
      { id: 'wall', x: 80, y: -100, width: 40, height: 200 },
      { id: 'upper', x: -20, y: -130, width: 240, height: 30 },
      { id: 'lower', x: -20, y: 100, width: 240, height: 30 },
    ];
    const request = { id: 'detour', sourceId: 'a', targetId: 'b',
      sourcePoint: { x: 0, y: 0 }, targetPoint: { x: 200, y: 0 }, obstacles };
    const sections = routeFixedGeometry(request);
    expect(validateRouteSections(sections, { ...request, routingStyle: 'orthogonal',
      obstacles: obstacles.map(box => ({ ...box, x: box.x - 8, y: box.y - 8,
        width: box.width + 16, height: box.height + 16 })) })).toEqual([]);
    const points = sections.flatMap(part => [part.startPoint, ...part.bendPoints, part.endPoint]);
    expect(points.some(point => Math.abs(point.y) >= 138)).toBe(true);
  });

  it('rejects impossible pinned geometry and direct fallback through an obstacle', () => {
    expect(() => routeFixedGeometry({ id: 'e', sourceId: 'a', targetId: 'b', sourcePoint: { x: 0, y: 0 }, targetPoint: { x: 200, y: 0 }, waypoints: [{ x: 100, y: 0 }], obstacles: [{ id: 'block', x: 80, y: -20, width: 40, height: 40 }] })).toThrow(/waypoint|obstacle/i);
  });

  it('honors outward departure and inward arrival even when those require a detour', () => {
    const request = { id: 'e', sourceId: 'a', targetId: 'b', sourcePoint: { x: 0, y: 0 }, targetPoint: { x: 100, y: 0 }, sourceDirection: 'up' as const, targetDirection: 'up' as const, obstacles: [] };
    const sections = routeFixedGeometry(request);
    expect(validateRouteSections(sections, request)).toEqual([]);
    expect(sections[0]!.bendPoints[0]!.y).toBeLessThan(0);
    expect(sections.at(-1)!.bendPoints.at(-1)!.y).toBeGreaterThan(0);
  });
  it('repairs a feasible route through a narrow checkpoint corridor before declaring failure', () => {
    const request = { id: 'narrow', sourceId: 'a', targetId: 'b', sourcePoint: { x: 0, y: 0 }, targetPoint: { x: 200, y: 100 }, waypoints: [{ x: 79, y: 0 }], obstacles: [{ id: 'block', x: 80, y: -20, width: 40, height: 40 }] };
    const sections = routeFixedGeometry(request);
    expect(validateRouteSections(sections, request)).toEqual([]);
    expect(sections[0]!.endPoint).toEqual({ x: 79, y: 0 });
  });

  it('preserves deliberate coincident authored checkpoint joins while rejecting an entirely degenerate route', () => {
    const join = section([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    const travel = section([{ x: 0, y: 0 }, { x: 20, y: 0 }]);
    expect(validateRouteSections([join, travel], { allowCoincidentCheckpoints: true })).toEqual([]);
    expect(validateRouteSections([join], { allowCoincidentCheckpoints: true }).map((issue) => issue.code)).toContain('route.duplicate');
    expect(validateRouteSections([join, travel], {}).map((issue) => issue.code)).toContain('route.duplicate');
  });

});
