/**
 * useArmadaBreadcrumbs Hook
 *
 * Manages breadcrumb navigation state with Armada integration.
 * Issue #32: CCD-REQ-003 Codebase Overview and Armada Breadcrumbs
 */

import { useState, useCallback, useMemo } from 'react';
import type { C4Level } from './useCodebaseOverview';

// ============================================================================
// Types
// ============================================================================

/** A single breadcrumb entry */
export interface Breadcrumb {
  /** Display label for the breadcrumb */
  label: string;
  /** C4 abstraction level */
  level: C4Level;
  /** Navigation context (node ID, etc.) */
  context?: Record<string, unknown>;
  /** Armada scope for queries at this level (e.g., 'packages/api/') */
  armadaScope?: string;
  /** Armada query to fetch data for this level */
  armadaQuery?: string;
}

/** Options for useArmadaBreadcrumbs hook */
export interface UseArmadaBreadcrumbsOptions {
  /** Project name for root breadcrumb */
  projectName: string;
  /** Initial breadcrumbs (besides root) */
  initialBreadcrumbs?: Breadcrumb[];
  /** Callback when navigating to a breadcrumb */
  onNavigate?: (breadcrumb: Breadcrumb) => void;
  /** Callback when drilling down (pushing new breadcrumb) */
  onDrillDown?: (breadcrumb: Breadcrumb) => void;
}

/** Result from useArmadaBreadcrumbs hook */
export interface UseArmadaBreadcrumbsResult {
  /** All breadcrumbs in the trail */
  breadcrumbs: Breadcrumb[];
  /** Current (last) breadcrumb */
  currentBreadcrumb: Breadcrumb;
  /** Current C4 level */
  currentLevel: C4Level;
  /** Whether data is being loaded */
  isLoading: boolean;
  /** Push a new breadcrumb (drill down) */
  pushBreadcrumb: (breadcrumb: Omit<Breadcrumb, 'id'>) => void;
  /** Navigate to breadcrumb at index (pops items after it) */
  navigateTo: (index: number) => void;
  /** Reset to root breadcrumb */
  reset: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useArmadaBreadcrumbs(
  options: UseArmadaBreadcrumbsOptions
): UseArmadaBreadcrumbsResult {
  const { projectName, initialBreadcrumbs = [], onNavigate, onDrillDown } = options;

  // Root breadcrumb is always present
  const rootBreadcrumb: Breadcrumb = useMemo(
    () => ({
      label: projectName,
      level: 'system' as C4Level,
      context: {},
    }),
    [projectName]
  );

  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([
    rootBreadcrumb,
    ...initialBreadcrumbs,
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const currentBreadcrumb = useMemo(
    () => breadcrumbs[breadcrumbs.length - 1],
    [breadcrumbs]
  );

  const currentLevel = useMemo(
    () => currentBreadcrumb.level,
    [currentBreadcrumb]
  );

  const pushBreadcrumb = useCallback(
    (breadcrumb: Omit<Breadcrumb, 'id'>) => {
      const newBreadcrumb: Breadcrumb = {
        ...breadcrumb,
      };
      setBreadcrumbs((prev) => [...prev, newBreadcrumb]);
      onDrillDown?.(newBreadcrumb);
    },
    [onDrillDown]
  );

  const navigateTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= breadcrumbs.length) {
        return;
      }
      const targetBreadcrumb = breadcrumbs[index];
      setBreadcrumbs((prev) => prev.slice(0, index + 1));
      onNavigate?.(targetBreadcrumb);
    },
    [breadcrumbs, onNavigate]
  );

  const reset = useCallback(() => {
    setBreadcrumbs([rootBreadcrumb]);
    onNavigate?.(rootBreadcrumb);
  }, [rootBreadcrumb, onNavigate]);

  return {
    breadcrumbs,
    currentBreadcrumb,
    currentLevel,
    isLoading,
    pushBreadcrumb,
    navigateTo,
    reset,
  };
}
