/**
 * Waypoint module (CORAL-REQ-015)
 */

export type { EdgeWaypoint } from './types.js';
export {
  createWaypoint,
  addWaypointToEdge,
  removeWaypointFromEdge,
  moveWaypoint,
  insertWaypointAtPosition,
} from './operations.js';
export { routeWithWaypoints, type RoutedPath, type WaypointRoutingOptions } from './router.js';
export {
  useWaypointManager,
  type UseWaypointManagerOptions,
  type UseWaypointManagerResult,
} from './useWaypointManager.js';
