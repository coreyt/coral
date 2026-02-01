/**
 * useLayoutHistory - Hook for managing undo/redo stack for node positions
 *
 * This hook tracks node position changes and allows users to undo/redo
 * layout operations, particularly useful after automatic reflow.
 */

import { useState, useCallback, useRef } from 'react';
import type { Node, XYPosition } from '@xyflow/react';

/** Snapshot of node positions at a point in time */
export interface PositionSnapshot {
  /** Map of node ID to position */
  positions: Map<string, XYPosition>;
  /** Timestamp when snapshot was taken */
  timestamp: number;
  /** Description of what caused this snapshot (e.g., 'reflow', 'manual') */
  source: string;
}

/** Options for the useLayoutHistory hook */
export interface UseLayoutHistoryOptions {
  /** Maximum number of history entries to keep (default: 50) */
  maxHistory?: number;
}

/** Return type of the useLayoutHistory hook */
export interface UseLayoutHistoryResult {
  /** Save current node positions to history */
  saveSnapshot: (nodes: Node[], source?: string) => void;
  /** Undo to previous position state, returns new positions or null if can't undo */
  undo: () => Map<string, XYPosition> | null;
  /** Redo to next position state, returns new positions or null if can't redo */
  redo: () => Map<string, XYPosition> | null;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Number of available undo steps */
  undoCount: number;
  /** Number of available redo steps */
  redoCount: number;
  /** Clear all history */
  clearHistory: () => void;
}

/**
 * Hook for managing layout history with undo/redo capability
 */
export function useLayoutHistory(
  options: UseLayoutHistoryOptions = {}
): UseLayoutHistoryResult {
  const { maxHistory = 50 } = options;

  // History stack - array of position snapshots
  const [history, setHistory] = useState<PositionSnapshot[]>([]);
  // Current position in history (-1 means at most recent)
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Track if we're in the middle of an undo/redo to avoid saving
  const isUndoingRef = useRef(false);

  /**
   * Save current node positions to history
   */
  const saveSnapshot = useCallback(
    (nodes: Node[], source = 'manual') => {
      // Don't save during undo/redo operations
      if (isUndoingRef.current) return;

      const positions = new Map<string, XYPosition>();
      for (const node of nodes) {
        positions.set(node.id, { ...node.position });
      }

      const snapshot: PositionSnapshot = {
        positions,
        timestamp: Date.now(),
        source,
      };

      setHistory((prev) => {
        // If we're not at the end of history, truncate future entries
        let newHistory = historyIndex >= 0 ? prev.slice(0, historyIndex + 1) : prev;

        // Add new snapshot
        newHistory = [...newHistory, snapshot];

        // Trim to max history
        if (newHistory.length > maxHistory) {
          newHistory = newHistory.slice(newHistory.length - maxHistory);
        }

        return newHistory;
      });

      // Reset history index to point to end
      setHistoryIndex(-1);
    },
    [historyIndex, maxHistory]
  );

  /**
   * Undo to previous position state
   */
  const undo = useCallback((): Map<string, XYPosition> | null => {
    // Calculate actual index (handle -1 as end of array)
    const currentIndex = historyIndex === -1 ? history.length - 1 : historyIndex;

    // Need at least 2 entries to undo (current + previous)
    if (currentIndex <= 0) {
      return null;
    }

    const targetIndex = currentIndex - 1;
    const snapshot = history[targetIndex];

    if (!snapshot) {
      return null;
    }

    isUndoingRef.current = true;
    setHistoryIndex(targetIndex);

    // Allow next saveSnapshot to work
    setTimeout(() => {
      isUndoingRef.current = false;
    }, 0);

    return snapshot.positions;
  }, [history, historyIndex]);

  /**
   * Redo to next position state
   */
  const redo = useCallback((): Map<string, XYPosition> | null => {
    // Can only redo if we've undone something
    if (historyIndex === -1 || historyIndex >= history.length - 1) {
      return null;
    }

    const targetIndex = historyIndex + 1;
    const snapshot = history[targetIndex];

    if (!snapshot) {
      return null;
    }

    isUndoingRef.current = true;
    setHistoryIndex(targetIndex);

    // Allow next saveSnapshot to work
    setTimeout(() => {
      isUndoingRef.current = false;
    }, 0);

    return snapshot.positions;
  }, [history, historyIndex]);

  /**
   * Clear all history
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  // Calculate derived state
  const currentIndex = historyIndex === -1 ? history.length - 1 : historyIndex;
  const canUndo = currentIndex > 0;
  const canRedo = historyIndex !== -1 && historyIndex < history.length - 1;
  const undoCount = currentIndex;
  const redoCount = historyIndex === -1 ? 0 : history.length - 1 - historyIndex;

  return {
    saveSnapshot,
    undo,
    canUndo,
    redo,
    canRedo,
    undoCount,
    redoCount,
    clearHistory,
  };
}
