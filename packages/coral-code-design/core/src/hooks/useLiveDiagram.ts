/**
 * useLiveDiagram Hook
 *
 * Manages live updates for diagrams with auto-refresh, stale detection, and diff tracking.
 * Issue #27: CCD-REQ-005 Live Diagram Updates
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { GraphIR } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface DiagramDiff {
  /** Node IDs that were added */
  added: string[];
  /** Node IDs that were removed */
  removed: string[];
  /** Node IDs that were modified */
  modified: string[];
}

export interface UseLiveDiagramOptions {
  /** Function to fetch diagram data */
  fetchData: () => Promise<GraphIR>;
  /** Auto-refresh interval in milliseconds (default: 30000) */
  autoRefreshInterval?: number;
  /** Time before data is considered stale in milliseconds (default: 60000) */
  staleThreshold?: number;
}

export interface UseLiveDiagramResult {
  /** Current graph IR data */
  graphIR: GraphIR | null;
  /** Whether a refresh is in progress */
  isRefreshing: boolean;
  /** Whether auto-refresh is enabled */
  autoRefreshEnabled: boolean;
  /** Current auto-refresh interval in ms */
  autoRefreshInterval: number;
  /** When data was last refreshed */
  lastRefreshedAt: Date | null;
  /** Whether data is stale */
  isStale: boolean;
  /** Diff from previous refresh */
  diff: DiagramDiff;
  /** User-defined node positions */
  userPositions: Record<string, { x: number; y: number }>;

  // Actions
  /** Manually refresh the diagram */
  refresh: () => Promise<void>;
  /** Enable/disable auto-refresh */
  setAutoRefresh: (enabled: boolean) => void;
  /** Set auto-refresh interval */
  setAutoRefreshInterval: (interval: number) => void;
  /** Clear the diff (acknowledge changes) */
  clearDiff: () => void;
  /** Set user-defined positions */
  setUserPositions: (positions: Record<string, { x: number; y: number }>) => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_AUTO_REFRESH_INTERVAL = 30000; // 30 seconds
const DEFAULT_STALE_THRESHOLD = 60000; // 1 minute

// ============================================================================
// Hook
// ============================================================================

export function useLiveDiagram(options: UseLiveDiagramOptions): UseLiveDiagramResult {
  const { fetchData, autoRefreshInterval: initialInterval, staleThreshold } = options;

  const [graphIR, setGraphIR] = useState<GraphIR | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshInterval, setAutoRefreshIntervalState] = useState(
    initialInterval ?? DEFAULT_AUTO_REFRESH_INTERVAL
  );
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [diff, setDiff] = useState<DiagramDiff>({ added: [], removed: [], modified: [] });
  const [userPositions, setUserPositions] = useState<Record<string, { x: number; y: number }>>({});

  const previousGraphRef = useRef<GraphIR | null>(null);
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleCheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compute diff between two graphs
  const computeDiff = useCallback((oldGraph: GraphIR | null, newGraph: GraphIR): DiagramDiff => {
    if (!oldGraph) {
      return { added: [], removed: [], modified: [] };
    }

    const oldNodeIds = new Set(oldGraph.nodes.map((n) => n.id));
    const newNodeIds = new Set(newGraph.nodes.map((n) => n.id));
    const oldNodesMap = new Map(oldGraph.nodes.map((n) => [n.id, n]));
    const newNodesMap = new Map(newGraph.nodes.map((n) => [n.id, n]));

    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];

    // Find added nodes
    for (const id of newNodeIds) {
      if (!oldNodeIds.has(id)) {
        added.push(id);
      }
    }

    // Find removed nodes
    for (const id of oldNodeIds) {
      if (!newNodeIds.has(id)) {
        removed.push(id);
      }
    }

    // Find modified nodes
    for (const id of newNodeIds) {
      if (oldNodeIds.has(id)) {
        const oldNode = oldNodesMap.get(id);
        const newNode = newNodesMap.get(id);
        if (JSON.stringify(oldNode) !== JSON.stringify(newNode)) {
          modified.push(id);
        }
      }
    }

    return { added, removed, modified };
  }, []);

  // Refresh function
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const newData = await fetchData();
      const newDiff = computeDiff(previousGraphRef.current, newData);
      previousGraphRef.current = newData;
      setGraphIR(newData);
      setDiff(newDiff);
      setLastRefreshedAt(new Date());
      setIsStale(false);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchData, computeDiff]);

  // Toggle auto-refresh
  const setAutoRefresh = useCallback((enabled: boolean) => {
    setAutoRefreshEnabled(enabled);
  }, []);

  // Set auto-refresh interval
  const setAutoRefreshInterval = useCallback((interval: number) => {
    setAutoRefreshIntervalState(interval);
  }, []);

  // Clear diff
  const clearDiff = useCallback(() => {
    setDiff({ added: [], removed: [], modified: [] });
  }, []);

  // Setup auto-refresh timer
  useEffect(() => {
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    if (autoRefreshEnabled) {
      autoRefreshTimerRef.current = setInterval(() => {
        refresh();
      }, autoRefreshInterval);
    }

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [autoRefreshEnabled, autoRefreshInterval, refresh]);

  // Setup stale check timer
  useEffect(() => {
    if (staleCheckTimerRef.current) {
      clearInterval(staleCheckTimerRef.current);
      staleCheckTimerRef.current = null;
    }

    const threshold = staleThreshold ?? DEFAULT_STALE_THRESHOLD;

    staleCheckTimerRef.current = setInterval(() => {
      if (lastRefreshedAt) {
        const elapsed = Date.now() - lastRefreshedAt.getTime();
        setIsStale(elapsed > threshold);
      }
    }, 1000);

    return () => {
      if (staleCheckTimerRef.current) {
        clearInterval(staleCheckTimerRef.current);
      }
    };
  }, [lastRefreshedAt, staleThreshold]);

  return useMemo(
    () => ({
      graphIR,
      isRefreshing,
      autoRefreshEnabled,
      autoRefreshInterval,
      lastRefreshedAt,
      isStale,
      diff,
      userPositions,
      refresh,
      setAutoRefresh,
      setAutoRefreshInterval,
      clearDiff,
      setUserPositions,
    }),
    [
      graphIR,
      isRefreshing,
      autoRefreshEnabled,
      autoRefreshInterval,
      lastRefreshedAt,
      isStale,
      diff,
      userPositions,
      refresh,
      setAutoRefresh,
      setAutoRefreshInterval,
      clearDiff,
    ]
  );
}
