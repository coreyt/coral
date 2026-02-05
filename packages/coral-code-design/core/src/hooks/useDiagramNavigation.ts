/**
 * useDiagramNavigation Hook
 *
 * Manages diagram navigation state for drill-down/drill-up between abstraction levels.
 * Issue #28: CCD-REQ-003 Diagram Types (C4-Inspired)
 */

import { useState, useCallback, useMemo } from 'react';

// ============================================================================
// Types
// ============================================================================

export type DiagramType =
  | 'codebase-overview'
  | 'module-graph'
  | 'component-detail'
  | 'call-graph'
  | 'dependency-graph'
  | 'inheritance-tree'
  | 'data-flow'
  | 'impact-analysis'
  | 'custom';

export interface DiagramScope {
  /** Type of diagram at this scope */
  type: DiagramType;
  /** Display label for breadcrumb */
  label: string;
  /** Path or identifier for this scope */
  path: string;
  /** Optional symbol ID for Armada queries */
  symbolId?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface UseDiagramNavigationOptions {
  /** Initial scope to start with */
  initialScope?: DiagramScope;
  /** Maximum history length */
  maxHistory?: number;
}

export interface UseDiagramNavigationResult {
  /** Navigation history */
  history: DiagramScope[];
  /** Current position in history */
  currentIndex: number;
  /** Current scope (null if no history) */
  currentScope: DiagramScope | null;
  /** Current diagram type */
  currentType: DiagramType | null;
  /** Whether back navigation is available */
  canGoBack: boolean;
  /** Whether forward navigation is available */
  canGoForward: boolean;
  /** Suggested type for drill-down based on current type */
  suggestedDrillDownType: DiagramType | null;

  // Navigation actions
  /** Navigate to a new scope (adds to history) */
  navigateTo: (scope: DiagramScope) => void;
  /** Go back one step */
  goBack: () => void;
  /** Go forward one step */
  goForward: () => void;
  /** Navigate to specific history index */
  navigateToIndex: (index: number) => void;
  /** Drill down to a child scope */
  drillDown: (label: string, type: DiagramType, path: string, symbolId?: string) => void;
  /** Drill up to parent scope */
  drillUp: () => void;
  /** Reset navigation state */
  reset: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_HISTORY = 50;

/** Suggested drill-down progression */
const DRILL_DOWN_MAP: Partial<Record<DiagramType, DiagramType>> = {
  'codebase-overview': 'module-graph',
  'module-graph': 'component-detail',
  'component-detail': 'call-graph',
  'call-graph': 'data-flow',
};

// ============================================================================
// Hook
// ============================================================================

export function useDiagramNavigation(
  options: UseDiagramNavigationOptions = {}
): UseDiagramNavigationResult {
  const { initialScope, maxHistory = DEFAULT_MAX_HISTORY } = options;

  const [history, setHistory] = useState<DiagramScope[]>(
    initialScope ? [initialScope] : []
  );
  const [currentIndex, setCurrentIndex] = useState(initialScope ? 0 : -1);

  // Derived state
  const currentScope = useMemo(
    () => (currentIndex >= 0 && currentIndex < history.length ? history[currentIndex] : null),
    [history, currentIndex]
  );

  const currentType = useMemo(
    () => currentScope?.type ?? null,
    [currentScope]
  );

  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < history.length - 1;

  const suggestedDrillDownType = useMemo(
    () => (currentType ? DRILL_DOWN_MAP[currentType] ?? null : null),
    [currentType]
  );

  // Navigate to new scope
  const navigateTo = useCallback(
    (scope: DiagramScope) => {
      setHistory((prev) => {
        // Remove forward history when navigating to new scope
        const newHistory = prev.slice(0, currentIndex + 1);
        newHistory.push(scope);

        // Trim to max history
        if (newHistory.length > maxHistory) {
          return newHistory.slice(-maxHistory);
        }
        return newHistory;
      });
      setCurrentIndex((prev) => Math.min(prev + 1, maxHistory - 1));
    },
    [currentIndex, maxHistory]
  );

  // Go back
  const goBack = useCallback(() => {
    if (canGoBack) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [canGoBack]);

  // Go forward
  const goForward = useCallback(() => {
    if (canGoForward) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [canGoForward]);

  // Navigate to specific index
  const navigateToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < history.length) {
        setCurrentIndex(index);
      }
    },
    [history.length]
  );

  // Drill down helper
  const drillDown = useCallback(
    (label: string, type: DiagramType, path: string, symbolId?: string) => {
      navigateTo({ type, label, path, symbolId });
    },
    [navigateTo]
  );

  // Drill up helper
  const drillUp = useCallback(() => {
    goBack();
  }, [goBack]);

  // Reset
  const reset = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  return useMemo(
    () => ({
      history,
      currentIndex,
      currentScope,
      currentType,
      canGoBack,
      canGoForward,
      suggestedDrillDownType,
      navigateTo,
      goBack,
      goForward,
      navigateToIndex,
      drillDown,
      drillUp,
      reset,
    }),
    [
      history,
      currentIndex,
      currentScope,
      currentType,
      canGoBack,
      canGoForward,
      suggestedDrillDownType,
      navigateTo,
      goBack,
      goForward,
      navigateToIndex,
      drillDown,
      drillUp,
      reset,
    ]
  );
}
