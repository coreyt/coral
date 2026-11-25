/**
 * Pure waypoint operations (CORAL-REQ-015)
 *
 * All functions are immutable — they return new arrays.
 */

import type { EdgeWaypoint } from './types.js';

let counter = 0;

/** Create a new waypoint with a unique ID */
export function createWaypoint(
  x: number,
  y: number,
  type: 'corner' | 'smooth' = 'corner',
): EdgeWaypoint {
  return { id: `wp-${Date.now()}-${++counter}`, x, y, type };
}

/** Add a waypoint to the end of an edge's waypoint list */
export function addWaypointToEdge(
  waypoints: EdgeWaypoint[],
  waypoint: EdgeWaypoint,
): EdgeWaypoint[] {
  return [...waypoints, waypoint];
}

/** Remove a waypoint by ID */
export function removeWaypointFromEdge(
  waypoints: EdgeWaypoint[],
  waypointId: string,
): EdgeWaypoint[] {
  return waypoints.filter((wp) => wp.id !== waypointId);
}

/** Move a waypoint to a new position */
export function moveWaypoint(
  waypoints: EdgeWaypoint[],
  waypointId: string,
  x: number,
  y: number,
): EdgeWaypoint[] {
  return waypoints.map((wp) =>
    wp.id === waypointId ? { ...wp, x, y } : wp,
  );
}

/** Distance from a point to a line segment */
function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Insert a waypoint at the closest segment of a polyline path.
 *
 * The path is an array of points representing the full edge path
 * (startPoint + bendPoints + endPoint). The new waypoint is inserted
 * at the position along the path where it is closest.
 */
export function insertWaypointAtPosition(
  existing: EdgeWaypoint[],
  path: Array<{ x: number; y: number }>,
  position: { x: number; y: number },
): EdgeWaypoint[] {
  if (path.length < 2) {
    return addWaypointToEdge(existing, createWaypoint(position.x, position.y));
  }

  // Find the closest segment
  let closestSegIdx = 0;
  let closestDist = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = pointToSegmentDistance(
      position.x, position.y,
      path[i].x, path[i].y,
      path[i + 1].x, path[i + 1].y,
    );
    if (d < closestDist) {
      closestDist = d;
      closestSegIdx = i;
    }
  }

  const newWp = createWaypoint(position.x, position.y);

  if (existing.length === 0) {
    return [newWp];
  }

  // Find where each existing waypoint falls along the path to determine insertion index
  const wpSegments = existing.map((wp) => {
    let bestSeg = 0;
    let bestDist = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const d = pointToSegmentDistance(wp.x, wp.y, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
      if (d < bestDist) {
        bestDist = d;
        bestSeg = i;
      }
    }
    return bestSeg;
  });

  // Find insertion index: insert after last waypoint whose segment is <= closestSegIdx
  let insertIdx = 0;
  for (let i = 0; i < wpSegments.length; i++) {
    if (wpSegments[i] <= closestSegIdx) {
      insertIdx = i + 1;
    }
  }

  const result = [...existing];
  result.splice(insertIdx, 0, newWp);
  return result;
}
