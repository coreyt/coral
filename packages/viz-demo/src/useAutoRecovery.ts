/**
 * Auto-Recovery Hook for Coral viz-demo
 *
 * Provides session persistence with localStorage:
 * - Auto-saves diagram state while working (debounced)
 * - Recovers from crashes/refreshes
 * - Warns on page exit with unsaved changes
 * - Preserves explicit save/load workflow
 */

import { useState, useEffect, useCallback, useRef } from 'react';

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
  /** DSL type (coral or mermaid) */
  dslType: 'coral' | 'mermaid';
  /** DSL text content */
  dsl: string;
  /** Current notation */
  notation: string;
  /** Node positions (id -> {x, y}) */
  nodePositions: Record<string, { x: number; y: number }>;
  /** Whether diagram has been explicitly saved since recovery data was created */
  lastExplicitSave?: number;
}

/**
 * State returned by the hook
 */
export interface AutoRecoveryState {
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
  /** Update the recovery data (auto-save) */
  updateRecovery: (data: Omit<RecoveryData, 'timestamp' | 'lastExplicitSave'>) => void;
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
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<number | null>(null);

  // Refs for debouncing
  const saveTimeoutRef = useRef<number | null>(null);
  const pendingDataRef = useRef<Omit<RecoveryData, 'timestamp' | 'lastExplicitSave'> | null>(null);

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
  const performSave = useCallback((data: Omit<RecoveryData, 'timestamp' | 'lastExplicitSave'>) => {
    try {
      const recoveryData: RecoveryData = {
        ...data,
        timestamp: Date.now(),
        lastExplicitSave: lastSaveTime ?? undefined,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recoveryData));
      console.log('Auto-saved to localStorage');
    } catch (error) {
      console.warn('Failed to auto-save:', error);
    }
  }, [lastSaveTime]);

  // Debounced update
  const updateRecovery = useCallback((data: Omit<RecoveryData, 'timestamp' | 'lastExplicitSave'>) => {
    pendingDataRef.current = data;
    setIsDirty(true);

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule save
    saveTimeoutRef.current = window.setTimeout(() => {
      if (pendingDataRef.current) {
        performSave(pendingDataRef.current);
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
    setLastSaveTime(now);
    setIsDirty(false);

    // Update the recovery data with the new save time
    // This helps track if changes were made after the last save
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored) as RecoveryData;
        data.lastExplicitSave = now;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        // Perform final save if there's pending data
        if (pendingDataRef.current) {
          performSave(pendingDataRef.current);
        }
      }
    };
  }, [performSave]);

  const state: AutoRecoveryState = {
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
