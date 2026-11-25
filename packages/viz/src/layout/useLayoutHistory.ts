/**
 * useLayoutHistory - Hook for managing undo/redo stack for node positions
 *
 * This hook tracks node position changes and allows users to undo/redo
 * layout operations, particularly useful after automatic reflow.
 */

import { useState, useCallback, useRef } from 'react';
import type { Node, XYPosition } from '@xyflow/react';
import type { EdgeWaypoint } from '../waypoints/types.js';

/** Snapshot of node positions (and optional waypoints) at a point in time */
export interface PositionSnapshot {
  /** Map of node ID to position */
  positions: Map<string, XYPosition>;
  /** Timestamp when snapshot was taken */
  timestamp: number;
  /** Description of what caused this snapshot (e.g., 'reflow', 'manual') */
  source: string;
  /** Optional waypoint state (CORAL-REQ-015) */
  waypoints?: Map<string, EdgeWaypoint[]>;
  /** Monotonic editor transaction sequence used to merge history owners. */
  sequence?: number;
}

/** Result returned from undo/redo operations */
export interface UndoRedoResult {
  positions: Map<string, XYPosition>;
  waypoints?: Map<string, EdgeWaypoint[]>;
  sequence?: number;
}

/** Options for the useLayoutHistory hook */
export interface UseLayoutHistoryOptions {
  /** Maximum number of history entries to keep (default: 50) */
  maxHistory?: number;
}

/** Return type of the useLayoutHistory hook */
export interface UseLayoutHistoryResult {
  /** Save current node positions (and optional waypoints) to history */
  saveSnapshot: (nodes: Node[], source?: string, waypoints?: Map<string, EdgeWaypoint[]>) => void;
  /** Save a snapshot with the optional cross-owner transaction sequence. */
  saveSnapshotWithSequence?: (
    nodes: Node[],
    source?: string,
    waypoints?: Map<string, EdgeWaypoint[]>,
    sequence?: number,
  ) => void;
  /** Undo to previous position state, returns positions + waypoints or null if can't undo */
  undo: () => UndoRedoResult | null;
  /** Redo to next position state, returns positions + waypoints or null if can't redo */
  redo: () => UndoRedoResult | null;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Number of available undo steps */
  undoCount: number;
  /** Number of available redo steps */
  redoCount: number;
  undoSequence?: number;
  redoSequence?: number;
  /** Clear all history */
  clearHistory: () => void;
  discardRedo?: () => void;
}

/**
 * Hook for managing layout history with undo/redo capability
 */
export function useLayoutHistory(
  options: UseLayoutHistoryOptions = {}
): UseLayoutHistoryResult {
  const { maxHistory = 50 } = options;

  // Ref-backed atomic state lets before/current saves and immediate undo/edit
  // share a transaction even when React batches their render notifications.
  const state = useRef<{ history: PositionSnapshot[]; index: number }>({ history: [], index: -1 });
  const [, render] = useState(0);
  const changed = useCallback(() => render((revision) => revision + 1), []);
  const copyWaypoints = (value?: Map<string, EdgeWaypoint[]>) => value
    ? new Map([...value].map(([id, points]) => [id, points.map((point) => ({ ...point }))]))
    : undefined;
  const copyResult = (snapshot: PositionSnapshot): UndoRedoResult => ({
    positions: new Map([...snapshot.positions].map(([id, position]) => [id, { ...position }])),
    waypoints: copyWaypoints(snapshot.waypoints),
    sequence: snapshot.sequence,
  });
  const sameGeometry = (a: PositionSnapshot, b: PositionSnapshot) => {
    if (a.positions.size !== b.positions.size) return false;
    for (const [id, position] of a.positions) {
      const other = b.positions.get(id);
      if (!other || position.x !== other.x || position.y !== other.y) return false;
    }
    if (a.waypoints === undefined || b.waypoints === undefined) return a.waypoints === b.waypoints;
    if (a.waypoints.size !== b.waypoints.size) return false;
    for (const [id, points] of a.waypoints) {
      const other = b.waypoints.get(id);
      if (!other || points.length !== other.length || points.some((point, index) => {
        const candidate = other[index];
        return point.id !== candidate.id || point.x !== candidate.x
          || point.y !== candidate.y || point.type !== candidate.type;
      })) return false;
    }
    return true;
  };

  const saveSnapshot = useCallback((nodes: Node[], source = 'manual', waypoints?: Map<string, EdgeWaypoint[]>, sequence?: number) => {
    const snapshot: PositionSnapshot = {
      positions: new Map(nodes.map((node) => [node.id, { ...node.position }])),
      timestamp: Date.now(), source, waypoints: copyWaypoints(waypoints), sequence,
    };
    const current = state.current;
    const prior = current.history[current.index];
    if (prior && sameGeometry(prior, snapshot)) return;
    const history = [...current.history.slice(0, current.index + 1), snapshot]
      .slice(-Math.max(1, maxHistory));
    state.current = { history, index: history.length - 1 };
    changed();
  }, [maxHistory, changed]);

  const undo = useCallback((): UndoRedoResult | null => {
    const current = state.current;
    if (current.index <= 0) return null;
    state.current = { ...current, index: current.index - 1 };
    changed();
    return copyResult(current.history[current.index - 1]);
  }, [changed]);

  const redo = useCallback((): UndoRedoResult | null => {
    const current = state.current;
    if (current.index >= current.history.length - 1) return null;
    state.current = { ...current, index: current.index + 1 };
    changed();
    return copyResult(current.history[current.index + 1]);
  }, [changed]);

  const clearHistory = useCallback(() => {
    state.current = { history: [], index: -1 };
    changed();
  }, [changed]);
  const discardRedo = useCallback(() => {
    const current = state.current;
    if (current.index >= current.history.length - 1) return;
    state.current = { history: current.history.slice(0, current.index + 1), index: current.index };
    changed();
  }, [changed]);
  const { history, index } = state.current;
  return {
    saveSnapshot, saveSnapshotWithSequence: saveSnapshot,
    undo, redo, clearHistory, discardRedo,
    canUndo: index > 0,
    canRedo: index >= 0 && index < history.length - 1,
    undoCount: Math.max(0, index),
    redoCount: Math.max(0, history.length - 1 - index),
    undoSequence: index > 0 ? history[index]?.sequence : undefined,
    redoSequence: index >= 0 && index < history.length - 1 ? history[index + 1]?.sequence : undefined,
  };
}
