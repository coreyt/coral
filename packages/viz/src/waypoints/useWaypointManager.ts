/**
 * useWaypointManager - Hook for managing edge waypoints (CORAL-REQ-015)
 *
 * Owns the Map<edgeId, EdgeWaypoint[]> state and exposes operations
 * for adding, moving, removing, and clearing waypoints.
 * Calls routeWithWaypoints internally to compute routed paths.
 */

import { useState, useCallback, useRef } from 'react';
import type { CoralNode, CoralEdge, Position } from '../types.js';
import type { EdgeWaypoint } from './types.js';
import {
  addWaypointToEdge,
  createWaypoint,
  removeWaypointFromEdge,
} from './operations.js';
import { routeWithWaypoints, waypointRoutingKey, type RoutedPath, type WaypointRoutingOptions } from './router.js';

export interface UseWaypointManagerOptions {
  nodes: CoralNode[];
  edges: CoralEdge[];
  initialWaypoints?: Map<string, EdgeWaypoint[]>;
  routingOptions?: WaypointRoutingOptions;
  /** Read late-bound editor settings when routing; equal values reuse cached geometry. */
  getRoutingOptions?: () => WaypointRoutingOptions;
  onChange?: (waypointMap: Map<string, EdgeWaypoint[]>) => void;
}

export interface UseWaypointManagerResult {
  /** Current waypoint map: edgeId → waypoints */
  waypointMap: Map<string, EdgeWaypoint[]>;
  /** Add a waypoint to an edge at a position */
  addWaypoint: (edgeId: string, position: Position) => void;
  /** Move an existing waypoint */
  moveWaypoint: (edgeId: string, waypointId: string, position: Position) => void;
  /** Remove a waypoint by ID */
  removeWaypoint: (edgeId: string, waypointId: string) => void;
  /** Clear all waypoints for a specific edge */
  clearWaypoints: (edgeId: string) => void;
  /** Clear all waypoints for all edges */
  clearAllWaypoints: () => void;
  /** Replace all waypoints, used when DSL, recovery, or a document is loaded. */
  setWaypoints: (waypoints: Map<string, EdgeWaypoint[]>) => void;
  /** Whether an edge has waypoints */
  hasWaypoints: (edgeId: string) => boolean;
  /** Get routed paths computed from current waypoints */
  getRoutedPaths: () => Map<string, RoutedPath>;
}

export function useWaypointManager(
  options: UseWaypointManagerOptions,
): UseWaypointManagerResult {
  const { nodes, edges, initialWaypoints, onChange } = options;
  const copy = (value: Map<string, EdgeWaypoint[]>) => new Map(
    [...value].map(([id, points]) => [id, points.map((point) => ({ ...point }))]),
  );
  const [waypointMap, setWaypointMap] = useState(() => copy(initialWaypoints ?? new Map()));
  const mapRef = useRef(waypointMap);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const routesRef = useRef<{
    key: string;
    paths: Map<string, RoutedPath>;
  } | null>(null);

  const publish = useCallback((next: Map<string, EdgeWaypoint[]>) => {
    if (next === mapRef.current) return;
    mapRef.current = next;
    setWaypointMap(next);
    // Publish outside a React state updater: transactions read the committed
    // current map synchronously, including multiple operations in one batch.
    onChange?.(next);
  }, [onChange]);

  const addWaypoint = useCallback((edgeId: string, position: Position) => {
    const next = new Map(mapRef.current);
    next.set(edgeId, addWaypointToEdge(
      next.get(edgeId) ?? [],
      createWaypoint(position.x, position.y),
    ));
    publish(next);
  }, [publish]);
  const moveWaypoint = useCallback((edgeId: string, waypointId: string, position: Position) => {
    const points = mapRef.current.get(edgeId);
    const point = points?.find((candidate) => candidate.id === waypointId);
    if (!point || (point.x === position.x && point.y === position.y)) return;
    const next = new Map(mapRef.current);
    next.set(edgeId, points!.map((candidate) => candidate.id === waypointId ? { ...candidate, ...position } : candidate));
    publish(next);
  }, [publish]);
  const removeWaypoint = useCallback((edgeId: string, waypointId: string) => {
    const points = mapRef.current.get(edgeId);
    if (!points?.some((point) => point.id === waypointId)) return;
    const next = new Map(mapRef.current);
    const remaining = removeWaypointFromEdge(points, waypointId);
    if (remaining.length) next.set(edgeId, remaining);
    else next.delete(edgeId);
    publish(next);
  }, [publish]);
  const clearWaypoints = useCallback((edgeId: string) => {
    if (!mapRef.current.has(edgeId)) return;
    const next = new Map(mapRef.current);
    next.delete(edgeId);
    publish(next);
  }, [publish]);
  const clearAllWaypoints = useCallback(() => {
    if (mapRef.current.size) publish(new Map());
  }, [publish]);
  const setWaypoints = useCallback((value: Map<string, EdgeWaypoint[]>) => publish(copy(value)), [publish]);
  const hasWaypoints = useCallback((edgeId: string) => (mapRef.current.get(edgeId)?.length ?? 0) > 0, []);
  const getRoutedPaths = useCallback(() => {
    // Only edges with transient checkpoints receive overrides. Adding one
    // checkpoint must not replace the shared layout's routes for every edge.
    const routingOptions = optionsRef.current.getRoutingOptions?.() ?? optionsRef.current.routingOptions;
    const sourceOwned = new Set(routingOptions?.sourceRouteEdgeIds ?? []);
    const routedEdges = edgesRef.current.filter((edge) => (mapRef.current.get(edge.id)?.length ?? 0) > 0
      && !edge.data?.canonical?.routeIntent && !sourceOwned.has(edge.id));
    const key = waypointRoutingKey(nodesRef.current, routedEdges, mapRef.current, routingOptions);
    const cached = routesRef.current;
    if (cached?.key === key) return cached.paths;
    // Invalidate before attempting repair: failed geometry must not leave the
    // previous route eligible for publication as the current scene.
    routesRef.current = null;
    const paths = routedEdges.length
      ? routeWithWaypoints(nodesRef.current, routedEdges, mapRef.current, routingOptions) : new Map<string, RoutedPath>();
    routesRef.current = { key, paths };
    return paths;
  }, []);

  return { waypointMap, addWaypoint, moveWaypoint, removeWaypoint,
    clearWaypoints, clearAllWaypoints, setWaypoints, hasWaypoints, getRoutedPaths };
}
