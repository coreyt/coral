/**
 * Waypoint types for manual edge routing (CORAL-REQ-015)
 */

/** A user-placed waypoint on an edge */
export interface EdgeWaypoint {
  /** Unique identifier */
  id: string;
  /** X coordinate */
  x: number;
  /** Y coordinate */
  y: number;
  /** Waypoint type: corner (sharp bend) or smooth (curved) */
  type: 'corner' | 'smooth';
}
