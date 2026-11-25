/** Shared checks and obstacle routing for graph-absolute connector geometry. */
import type { CardinalDirection, Obstacle } from 'libavoided-js';
import type { LayoutSection, Point } from './types.js';

const EPSILON = 1e-6;
export type RouteObstacle = Obstacle;
export interface RouteGeometryIssue { code: string; message: string }
export interface RouteGeometryRequirements {
  sourcePoint?: Point;
  targetPoint?: Point;
  /** Direction of travel away from the source and into the target. */
  sourceDirection?: CardinalDirection;
  targetDirection?: CardinalDirection;
  waypoints?: readonly Point[];
  /** Unrelated occupied envelopes, with ancestor containers already excluded. */
  obstacles?: readonly RouteObstacle[];
  routingStyle?: 'orthogonal' | 'polyline';
  /** Preserve authored zero-length checkpoint joins only within a nondegenerate route. */
  allowCoincidentCheckpoints?: boolean;
}
export interface FixedGeometryRouteRequest extends RouteGeometryRequirements {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePoint: Point;
  targetPoint: Point;
  obstacles: readonly RouteObstacle[];
  /** Optional endpoint frames for a validated escape-and-rejoin repair. */
  sourceBounds?: RouteObstacle;
  targetBounds?: RouteObstacle;
}
export class RouteGeometryError extends Error {
  constructor(readonly edgeId: string, readonly issues: RouteGeometryIssue[]) {
    super(`Edge "${edgeId}": ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'RouteGeometryError';
  }
}
const finite = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);
const equal = (a: Point, b: Point) => Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON;

/** True for penetration of the open interior; touching the frame is allowed. */
export function segmentIntersectsBox(a: Point, b: Point,
  box: { x: number; y: number; width: number; height: number }): boolean {
  const inset = 1e-5;
  const left = box.x + inset, right = box.x + box.width - inset;
  const top = box.y + inset, bottom = box.y + box.height - inset;
  if (left >= right || top >= bottom) return false;
  let enter = 0, leave = 1;
  for (const [p, q] of [
    [-(b.x - a.x), a.x - left], [b.x - a.x, right - a.x],
    [-(b.y - a.y), a.y - top], [b.y - a.y, bottom - a.y],
  ]) {
    if (Math.abs(p) < EPSILON) { if (q < 0) return false; }
    else if (p < 0) enter = Math.max(enter, q / p);
    else leave = Math.min(leave, q / p);
  }
  return enter <= leave && leave >= 0 && enter <= 1;
}
function direction(a: Point, b: Point): CardinalDirection | undefined {
  if (Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) > EPSILON) return b.y > a.y ? 'down' : 'up';
  if (Math.abs(a.y - b.y) <= EPSILON && Math.abs(a.x - b.x) > EPSILON) return b.x > a.x ? 'right' : 'left';
  return undefined;
}
function pointProgress(p: Point, a: Point, b: Point): number | undefined {
  const dx = b.x - a.x, dy = b.y - a.y;
  const squared = dx * dx + dy * dy;
  if (squared <= EPSILON * EPSILON) return equal(p, a) ? 0 : undefined;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / squared;
  return t >= -EPSILON && t <= 1 + EPSILON &&
    Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) <= EPSILON ? Math.max(0, Math.min(1, t)) : undefined;
}

/** Validate final sections, including the engine's successful-looking fallback. */
export function validateRouteSections(sections: readonly LayoutSection[], requirements: RouteGeometryRequirements): RouteGeometryIssue[] {
  const issues: RouteGeometryIssue[] = [];
  const add = (code: string, message: string) => { if (!issues.some((issue) => issue.code === code)) issues.push({ code, message }); };
  if (!sections.length) return [{ code: 'route.empty', message: 'Route has no sections' }];
  const points: Point[] = [];
  const hasTravel = sections.some((section) => [section.startPoint, ...section.bendPoints, section.endPoint]
    .some((point) => !equal(point, section.startPoint)));
  for (const section of sections) {
    const local = [section.startPoint, ...section.bendPoints, section.endPoint];
    if (points.length && !equal(points.at(-1)!, local[0]!)) add('route.discontinuous', 'Route sections are disconnected');
    points.push(...(points.length ? local.slice(1) : local));
    if (local.some((point) => !finite(point))) add('route.nonfinite', 'Route coordinates must be finite');
    for (let index = 1; index < local.length; index++) {
      const a = local[index - 1]!, b = local[index]!;
      if (equal(a, b) && !(requirements.allowCoincidentCheckpoints && hasTravel && section.bendPoints.length === 0))
        add('route.duplicate', 'Route contains a zero-length segment');
      if (requirements.routingStyle === 'orthogonal' && !equal(a, b) && !direction(a, b)) add('route.diagonal', 'Orthogonal route contains a diagonal segment');
      for (const obstacle of requirements.obstacles ?? []) if (segmentIntersectsBox(a, b, obstacle))
        add('route.obstacle', `Route penetrates obstacle "${obstacle.id}"`);
    }
  }
  if (requirements.sourcePoint && !equal(points[0]!, requirements.sourcePoint)) add('route.source', 'Route does not preserve its source contact');
  if (requirements.targetPoint && !equal(points.at(-1)!, requirements.targetPoint)) add('route.target', 'Route does not preserve its target contact');
  const firstTravel = points.find((point) => !equal(point, points[0]!));
  const lastTravel = [...points].reverse().find((point) => !equal(point, points.at(-1)!));
  if (requirements.sourceDirection && (!firstTravel || direction(points[0]!, firstTravel) !== requirements.sourceDirection)) add('route.source-direction', 'Route leaves its source in the wrong direction');
  if (requirements.targetDirection && (!lastTravel || direction(lastTravel, points.at(-1)!) !== requirements.targetDirection)) add('route.target-direction', 'Route arrives at its target in the wrong direction');
  let previous = -EPSILON;
  for (const waypoint of requirements.waypoints ?? []) {
    let found: number | undefined;
    for (let index = 1; index < points.length; index++) {
      const progress = pointProgress(waypoint, points[index - 1]!, points[index]!);
      const position = progress === undefined ? undefined : index - 1 + progress;
      if (position !== undefined && position + EPSILON >= previous) { found = position; break; }
    }
    if (found === undefined || !finite(waypoint)) add('route.waypoint', 'Route does not preserve exact waypoint order and position');
    else previous = found;
  }
  return issues;
}

