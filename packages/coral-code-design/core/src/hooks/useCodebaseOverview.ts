/**
 * useCodebaseOverview Hook
 *
 * Manages C4-style abstraction levels for codebase overview diagrams.
 * Issue #32: CCD-REQ-003 Codebase Overview and Armada Breadcrumbs
 */

import { useState, useCallback, useMemo } from 'react';

// ============================================================================
// Types
// ============================================================================

/** C4 abstraction levels */
export type C4Level = 'system' | 'container' | 'component' | 'code';

/** Suggested diagram types for each abstraction level */
export type DiagramType =
  | 'c4-context'
  | 'c4-container'
  | 'c4-component'
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'erd';

/** Navigation context for a level */
export interface LevelContext {
  id: string;
  name?: string;
  [key: string]: unknown;
}

/** Path entry for navigation history */
export interface PathEntry {
  level: C4Level;
  context: LevelContext;
}

/** Result from useCodebaseOverview hook */
export interface UseCodebaseOverviewResult {
  /** All available C4 levels */
  levels: readonly C4Level[];
  /** Current abstraction level */
  currentLevel: C4Level;
  /** Context for the current level */
  context: LevelContext | null;
  /** Navigation path from system to current */
  path: PathEntry[];
  /** Suggested diagram type for current level */
  suggestedDiagramType: DiagramType;
  /** Drill down to a deeper level */
  drillDown: (level: C4Level, context: LevelContext) => void;
  /** Navigate to a specific level in the path */
  navigateToLevel: (level: C4Level) => void;
  /** Override the suggested diagram type */
  setDiagramType: (type: DiagramType) => void;
  /** Reset to system level */
  reset: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const C4_LEVELS: readonly C4Level[] = ['system', 'container', 'component', 'code'];

const DEFAULT_DIAGRAM_TYPES: Record<C4Level, DiagramType> = {
  system: 'c4-context',
  container: 'c4-container',
  component: 'c4-component',
  code: 'flowchart',
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function useCodebaseOverview(): UseCodebaseOverviewResult {
  const [currentLevel, setCurrentLevel] = useState<C4Level>('system');
  const [context, setContext] = useState<LevelContext | null>(null);
  const [path, setPath] = useState<PathEntry[]>([]);
  const [diagramTypeOverride, setDiagramTypeOverride] = useState<DiagramType | null>(null);

  const suggestedDiagramType = useMemo(() => {
    if (diagramTypeOverride) {
      return diagramTypeOverride;
    }
    return DEFAULT_DIAGRAM_TYPES[currentLevel];
  }, [currentLevel, diagramTypeOverride]);

  const drillDown = useCallback((level: C4Level, newContext: LevelContext) => {
    setPath((prev) => [...prev, { level, context: newContext }]);
    setCurrentLevel(level);
    setContext(newContext);
    // Clear override when navigating to new level
    setDiagramTypeOverride(null);
  }, []);

  const navigateToLevel = useCallback((level: C4Level) => {
    if (level === 'system') {
      setPath([]);
      setCurrentLevel('system');
      setContext(null);
      setDiagramTypeOverride(null);
      return;
    }

    const levelIndex = path.findIndex((entry) => entry.level === level);
    if (levelIndex >= 0) {
      const newPath = path.slice(0, levelIndex + 1);
      setPath(newPath);
      setCurrentLevel(level);
      setContext(newPath[levelIndex].context);
      setDiagramTypeOverride(null);
    }
  }, [path]);

  const setDiagramType = useCallback((type: DiagramType) => {
    setDiagramTypeOverride(type);
  }, []);

  const reset = useCallback(() => {
    setCurrentLevel('system');
    setContext(null);
    setPath([]);
    setDiagramTypeOverride(null);
  }, []);

  return {
    levels: C4_LEVELS,
    currentLevel,
    context,
    path,
    suggestedDiagramType,
    drillDown,
    navigateToLevel,
    setDiagramType,
    reset,
  };
}
