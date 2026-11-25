import { routeEdges } from 'libavoided-js';
import type { LayoutSection, Point } from './types.js';
import { RouteGeometryError, validateRouteSections, segmentIntersectsBox, type FixedGeometryRouteRequest, type RouteGeometryIssue } from './routeGeometry.js';
const equal = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= 1e-6;
const finite = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);
/** The engine can restore exact endpoints after snapping its terminal grid
 * vertices, leaving diagonal terminal joins in an orthogonal result. Complete
 * only those joins with elbows; keep its interior corridor and exact ends. */
export function terminalElbowCandidates(sections: readonly LayoutSection[]): LayoutSection[][] {
  if (sections.length !== 1 || !sections[0]!.bendPoints.length) return [];
  const section = sections[0]!;
  const points = [section.startPoint, ...section.bendPoints, section.endPoint];
  const diagonal = (a: Point, b: Point) => Math.abs(a.x - b.x) > 1e-6 && Math.abs(a.y - b.y) > 1e-6;
  if (points.slice(2, -1).some((point, i) => diagonal(points[i + 1]!, point))) return [];
  const first = diagonal(points[0]!, points[1]!);
  const last = diagonal(points.at(-2)!, points.at(-1)!);
  if (!first && !last) return [];
  const candidates: LayoutSection[][] = [];
  for (const sourceHorizontal of first ? [false, true] : [false]) {
    for (const targetHorizontal of last ? [false, true] : [false]) {
      const completed: Point[] = [points[0]!];
      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1]!, b = points[index]!;
        if (diagonal(a, b)) {
          const horizontal = index === 1 ? sourceHorizontal : targetHorizontal;
          completed.push(horizontal ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
        }
        completed.push(b);
      }
      // A restored endpoint can lie just beyond a snapped terminal vertex.
      // Drop the resulting collinear excursion before full obstacle checks.
      const compact: Point[] = [];
      for (const point of completed) {
        while (compact.length > 1) {
          const a = compact.at(-2)!, b = compact.at(-1)!;
          const vertical = Math.abs(a.x - b.x) <= 1e-6 && Math.abs(b.x - point.x) <= 1e-6;
          const horizontal = Math.abs(a.y - b.y) <= 1e-6 && Math.abs(b.y - point.y) <= 1e-6;
          if (!vertical && !horizontal) break;
          compact.pop();
        }
        if (!compact.length || !equal(point, compact.at(-1)!)) compact.push(point);
      }
      candidates.push([{ ...section, bendPoints: compact.slice(1, -1) }]);
    }
  }
  return candidates;
}

/** Route independently between exact checkpoints. libavoided's pinned-waypoint
 * path bypasses obstacle routing, so never pass pinnedWaypoints to the engine. */
export function routeFixedGeometry(request: FixedGeometryRouteRequest): LayoutSection[] {
  if (request.sourceBounds && request.targetBounds && request.sourceDirection && request.targetDirection) {
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
    const escape = (point: Point, box: NonNullable<FixedGeometryRouteRequest['sourceBounds']>, direction: NonNullable<FixedGeometryRouteRequest['sourceDirection']>): Point =>
      direction === 'up' ? { x: point.x, y: Math.min(point.y - 8, box.y - 8) }
        : direction === 'down' ? { x: point.x, y: Math.max(point.y + 8, box.y + box.height + 8) }
          : direction === 'left' ? { x: Math.min(point.x - 8, box.x - 8), y: point.y }
            : { x: Math.max(point.x + 8, box.x + box.width + 8), y: point.y };
    const exit = escape(request.sourcePoint, request.sourceBounds, request.sourceDirection);
    const arrival = escape(request.targetPoint, request.targetBounds, opposite[request.targetDirection]);
    const middle = routeFixedGeometry({ id: request.id, sourceId: '__exit', targetId: '__arrival',
      sourcePoint: exit, targetPoint: arrival, waypoints: request.waypoints,
      routingStyle: request.routingStyle, allowCoincidentCheckpoints: request.allowCoincidentCheckpoints,
      obstacles: [...request.obstacles, { ...request.sourceBounds, id: '__source_body' }, { ...request.targetBounds, id: '__target_body' }] });
    const sections = [{ startPoint: request.sourcePoint, bendPoints: [], endPoint: exit }, ...middle,
      { startPoint: arrival, bendPoints: [], endPoint: request.targetPoint }];
    const issues = validateRouteSections(sections, { ...request, routingStyle: request.routingStyle ?? 'orthogonal' });
    if (issues.length) throw new RouteGeometryError(request.id, issues);
    return sections;
  }
  const points = [request.sourcePoint, ...(request.waypoints ?? []), request.targetPoint];
  if (points.some((point) => !finite(point)) || request.obstacles.some((box) =>
    ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0))
    throw new RouteGeometryError(request.id, [{ code: 'route.nonfinite', message: 'Route inputs must have finite coordinates and positive obstacle dimensions' }]);
  for (const point of request.waypoints ?? []) for (const box of request.obstacles)
    if (segmentIntersectsBox(point, point, box)) throw new RouteGeometryError(request.id,
      [{ code: 'route.waypoint', message: `Exact waypoint lies inside obstacle "${box.id}"` }]);
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  for (const box of request.obstacles) { xs.push(box.x, box.x + box.width); ys.push(box.y, box.y + box.height); }
  // Supply exterior grid coordinates even when no obstacle establishes a lane
  // in the requested exit/arrival direction. These are seeds, never exact pins.
  const seeds = [{ x: Math.min(...xs) - 24, y: Math.min(...ys) - 24 },
    { x: Math.max(...xs) + 24, y: Math.max(...ys) + 24 }];
  const clearance = request.obstacles.map(box => ({ ...box, x: box.x - 8, y: box.y - 8,
    width: box.width + 16, height: box.height + 16 }));
  const sections: LayoutSection[] = [];
  for (let index = 1; index < points.length; index++) {
    if (request.allowCoincidentCheckpoints && equal(points[index - 1]!, points[index]!)) {
      sections.push({ startPoint: { ...points[index - 1]! }, bendPoints: [], endPoint: { ...points[index]! } });
      continue;
    }
    const sourceDirection = points.slice(0, index).every((point) => equal(point, request.sourcePoint)) ? request.sourceDirection : undefined;
    const targetDirection = points.slice(index).every((point) => equal(point, request.targetPoint)) ? request.targetDirection : undefined;
    let accepted: LayoutSection[] | undefined;
    let lastIssues: RouteGeometryIssue[] = [];
    // Clear axis-aligned checkpoint legs need no global visibility grid.
    // Keep the router's preferred 8px clearance, exact contacts and directions;
    // a close obstacle or conflicting direction still uses the normal search.
    if ((request.routingStyle ?? 'orthogonal') === 'orthogonal') {
      const direct = [{ startPoint: { ...points[index - 1]! }, bendPoints: [], endPoint: { ...points[index]! } }];
      if (!validateRouteSections(direct, { sourcePoint: points[index - 1]!, targetPoint: points[index]!,
        sourceDirection, targetDirection, obstacles: clearance, routingStyle: 'orthogonal' }).length) accepted = direct;
    }
    const routeLeg = (obstacles: FixedGeometryRouteRequest['obstacles'], previousPath: Point[], obstacleMargin: number) =>
      routeEdges({ obstacles: [...obstacles], edges: [{ id: request.id,
        sourceId: request.sourceId, targetId: request.targetId,
        sourcePoint: points[index - 1]!, targetPoint: points[index]!, previousPath,
        ...(sourceDirection ? { sourceDirection } : {}), ...(targetDirection ? { targetDirection } : {}),
      }] }, { routingStyle: request.routingStyle ?? 'orthogonal', obstacleMargin, edgeSpacing: 0 })
        .edges.find(edge => edge.id === request.id)?.sections;
    const requirements = { sourcePoint: points[index - 1]!, targetPoint: points[index]!,
      sourceDirection, targetDirection, obstacles: request.obstacles, routingStyle: request.routingStyle ?? 'orthogonal' as const };
    const acceptCandidate = (candidate: LayoutSection[] | undefined, obstacles = request.obstacles): LayoutSection[] | undefined => {
      if (!candidate) return undefined;
      const checks = { ...requirements, obstacles };
      if (!validateRouteSections(candidate, checks).length) return candidate;
      if (requirements.routingStyle === 'orthogonal') {
        for (const completed of terminalElbowCandidates(candidate))
          if (!validateRouteSections(completed, checks).length) return completed;
      }
      return undefined;
    };
    // Local grids are speculative engine inputs. Selected obstacles retain the
    // engine's margin/anchor behavior; omitted obstacles also need explicit
    // preferred-clearance checks if a local detour travels outside its window.
    let nearby: FixedGeometryRouteRequest['obstacles'] | undefined;
    let localSeeds: Point[] | undefined;
    if (!accepted && (request.routingStyle ?? 'orthogonal') === 'orthogonal') {
      const a = points[index - 1]!, b = points[index]!;
      const left = Math.min(a.x, b.x) - 24, right = Math.max(a.x, b.x) + 24;
      const top = Math.min(a.y, b.y) - 24, bottom = Math.max(a.y, b.y) + 24;
      const selected = request.obstacles.filter(box => box.x <= right && box.x + box.width >= left &&
        box.y <= bottom && box.y + box.height >= top);
      if (selected.length < request.obstacles.length) {
        nearby = selected;
        localSeeds = [{ x: Math.min(a.x, b.x, ...selected.map(box => box.x)) - 24,
          y: Math.min(a.y, b.y, ...selected.map(box => box.y)) - 24 },
        { x: Math.max(a.x, b.x, ...selected.map(box => box.x + box.width)) + 24,
          y: Math.max(a.y, b.y, ...selected.map(box => box.y + box.height)) + 24 }];
        const candidate = routeLeg(nearby, localSeeds, 8);
        const localSet = new Set(selected);
        const guarded = request.obstacles.map((box, index) => localSet.has(box) ? box : clearance[index]!);
        accepted = acceptCandidate(candidate, guarded);
      }
    }
    // Try the global preferred margin before any zero-margin candidate. Exact
    // checkpoints can require the existing narrow-corridor fallback.
    for (const obstacleMargin of [8, 0]) {
      if (accepted) break;
      if (obstacleMargin === 0 && nearby && localSeeds) {
        const candidate = routeLeg(nearby, localSeeds, 0);
        accepted = acceptCandidate(candidate);
        if (accepted) break;
      }
      const candidate = routeLeg(request.obstacles, seeds, obstacleMargin);
      lastIssues = validateRouteSections(candidate ?? [], requirements);
      accepted = acceptCandidate(candidate);
      if (accepted) break;
    }
    if (!accepted) throw new RouteGeometryError(request.id, lastIssues);
    sections.push(...accepted.map((section) => ({ startPoint: { ...section.startPoint },
      bendPoints: section.bendPoints.map((point) => ({ ...point })), endPoint: { ...section.endPoint } })));
  }
  const issues = validateRouteSections(sections, { ...request, routingStyle: request.routingStyle ?? 'orthogonal' });
  if (issues.length) throw new RouteGeometryError(request.id, issues);
  return sections;
}
