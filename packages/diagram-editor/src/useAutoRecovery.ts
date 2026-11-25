/**
 * Auto-Recovery Hook for Coral Diagram Editor
 *
 * Provides session persistence with localStorage:
 * - Auto-saves diagram state while working (debounced)
 * - Recovers from crashes/refreshes
 * - Warns on page exit with unsaved changes
 * - Preserves explicit save/load workflow
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoralDocument } from '@coral-viz/viz';

const STORAGE_KEY = 'coral-diagram-recovery';
const AUTO_SAVE_DELAY = 1000; // 1 second debounce

/**
 * Recovery data stored in localStorage
 */
export interface RecoveryData {
  /** Timestamp when data was saved */
  timestamp: number;
  /** Document name */
  documentName: string;
  /** Exact source language selected when the draft was saved. */
  dslType: 'coral' | 'mermaid' | 'dot' | 'plantuml';
  /** DSL text content */
  dsl: string;
  /** Current notation */
  notation: string;
  /** Node positions (id -> {x, y}) */
  nodePositions: Record<string, { x: number; y: number }>;
  /** Lossless document snapshot used by current releases. Legacy entries may omit it. */
  document?: CoralDocument;
  /** Whether diagram has been explicitly saved since recovery data was created */
  lastExplicitSave?: number;
}

/** One recovery snapshot, or a thunk that builds it only when it is written. */
export type RecoveryUpdate =
  | Omit<RecoveryData, 'timestamp' | 'lastExplicitSave'>
  | (() => Omit<RecoveryData, 'timestamp' | 'lastExplicitSave'>);

/**
 * State returned by the hook
 */
export interface AutoRecoveryState {
  /** Whether the initial storage check has completed. */
  isSettled: boolean;
  /** Whether there's recovery data available */
  hasRecoveryData: boolean;
  /** The recovery data, if available */
  recoveryData: RecoveryData | null;
  /** Whether the current session has unsaved changes */
  isDirty: boolean;
  /** Timestamp of last explicit save */
  lastSaveTime: number | null;
}

/**
 * Actions provided by the hook
 */
export interface AutoRecoveryActions {
  /** Apply recovery data to restore diagram */
  applyRecovery: () => RecoveryData | null;
  /** Discard recovery data */
  discardRecovery: () => void;
  /** Mark the current state as explicitly saved */
  markSaved: () => void;
  /** Update the recovery data (auto-save); a thunk is evaluated only at the write */
  updateRecovery: (data: RecoveryUpdate) => void;
  /** Clear all recovery data */
  clearRecovery: () => void;
}

export interface UseAutoRecoveryOptions {
  /** Whether to enable the beforeunload warning */
  warnOnExit?: boolean;
}

/**
 * Hook for managing auto-recovery and session persistence
 */
export function useAutoRecovery(
  options: UseAutoRecoveryOptions = {}
): [AutoRecoveryState, AutoRecoveryActions] {
  const { warnOnExit = true } = options;

  // State
  const [hasRecoveryData, setHasRecoveryData] = useState(false);
  const [recoveryData, setRecoveryData] = useState<RecoveryData | null>(null);
  const [isSettled, setIsSettled] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<number | null>(null);
  // Timers and the unmount flush read the latest explicit save, not a render closure.
  const lastSaveTimeRef = useRef(lastSaveTime);
  lastSaveTimeRef.current = lastSaveTime;

  // Refs for bounded recovery coalescing
  const saveTimeoutRef = useRef<number | null>(null);
  const pendingDataRef = useRef<RecoveryUpdate | null>(null);
  const dirtyRef = useRef(false);

  // Check for recovery data on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored) as RecoveryData;
        // Only offer recovery if data is recent (within 7 days)
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        if (data.timestamp > sevenDaysAgo) {
          setRecoveryData(data);
          setHasRecoveryData(true);
          // Restore last save time if available
          if (data.lastExplicitSave) {
            setLastSaveTime(data.lastExplicitSave);
          }
        } else {
          // Clear stale recovery data
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.warn('Failed to read recovery data:', error);
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsSettled(true);
    }
  }, []);

  // Handle beforeunload warning
  useEffect(() => {
    if (!warnOnExit) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        // Modern browsers ignore custom messages, but we need to set returnValue
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, warnOnExit]);

  // Perform the actual save to localStorage
  const performSave = useCallback((data: RecoveryUpdate) => {
    try {
      const recoveryData: RecoveryData = {
        ...(typeof data === 'function' ? data() : data),
        timestamp: Date.now(),
        lastExplicitSave: lastSaveTimeRef.current ?? undefined,
      };
      const serialized = JSON.stringify(recoveryData);
      localStorage.setItem(STORAGE_KEY, serialized);
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== serialized || JSON.stringify(JSON.parse(stored)) !== serialized) {
        throw new Error('Recovery verification failed');
      }
      console.log('Auto-saved to localStorage');
      return true;
    } catch (error) {
      console.warn('Failed to auto-save:', error);
      return false;
    }
  }, []);

  // Debounced update
  const updateRecovery = useCallback((data: RecoveryUpdate) => {
    pendingDataRef.current = data;
    dirtyRef.current = true;
    setIsDirty(true);

    // Keep one bounded write deadline while coalescing to the newest snapshot.
    // Continuous passive canvas measurements must not postpone recovery
    // forever by restarting the timer on every render.
    if (saveTimeoutRef.current) return;
    saveTimeoutRef.current = window.setTimeout(() => {
      if (pendingDataRef.current && performSave(pendingDataRef.current)) {
        pendingDataRef.current = null;
      }
      saveTimeoutRef.current = null;
    }, AUTO_SAVE_DELAY);
  }, [performSave]);

  // Apply recovery data
  const applyRecovery = useCallback(() => {
    if (recoveryData) {
      setHasRecoveryData(false);
      // Don't clear recovery data yet - keep it until user makes changes
      // This way if they refresh again, they can still recover
      return recoveryData;
    }
    return null;
  }, [recoveryData]);

  // Discard recovery data
  const discardRecovery = useCallback(() => {
    setHasRecoveryData(false);
    setRecoveryData(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Mark as explicitly saved
  const markSaved = useCallback(() => {
    const now = Date.now();
    lastSaveTimeRef.current = now;
    setLastSaveTime(now);
    setIsDirty(false);
    dirtyRef.current = false;

    // Update the recovery data with the new save time
    // This helps track if changes were made after the last save
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored) as RecoveryData;
        data.lastExplicitSave = now;
        const serialized = JSON.stringify(data);
        localStorage.setItem(STORAGE_KEY, serialized);
      }
    } catch (error) {
      console.warn('Failed to update save time:', error);
    }
  }, []);

  // Clear all recovery data
  const clearRecovery = useCallback(() => {
    setHasRecoveryData(false);
    setRecoveryData(null);
    setIsDirty(false);
    dirtyRef.current = false;
    pendingDataRef.current = null;
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        // Perform final save if there's pending data
        if (pendingDataRef.current && performSave(pendingDataRef.current)) {
          pendingDataRef.current = null;
        }
      }
    };
    // performSave is stable; this cleanup is the unmount flush only.
  }, [performSave]);

  const state: AutoRecoveryState = {
    isSettled,
    hasRecoveryData,
    recoveryData,
    isDirty,
    lastSaveTime,
  };

  const actions: AutoRecoveryActions = {
    applyRecovery,
    discardRecovery,
    markSaved,
    updateRecovery,
    clearRecovery,
  };

  return [state, actions];
}

/**
 * Format a timestamp for display
 */
export function formatRecoveryTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else {
    return date.toLocaleDateString();
  }
}
