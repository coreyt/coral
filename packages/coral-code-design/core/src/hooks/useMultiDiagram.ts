/**
 * useMultiDiagram Hook
 *
 * Manages state for multi-diagram view with tabs, splits, and linked selection.
 * Issue #22: CCD-REQ-002 Multi-Diagram View
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  DiagramReference,
  LayoutMode,
  PaneConfig,
  NamedLayout,
  DiagramPreset,
} from '../types';

// ============================================================================
// Types
// ============================================================================

export interface UseMultiDiagramResult {
  /** All open diagrams */
  diagrams: DiagramReference[];
  /** Currently active diagram ID */
  activeDiagramId: string | null;
  /** Current layout mode */
  layoutMode: LayoutMode;
  /** Whether selection is linked across diagrams */
  linkedSelection: boolean;
  /** Currently selected node ID (shared across diagrams when linked) */
  selectedNodeId: string | null;
  /** Pane configurations for split views */
  panes: PaneConfig[];
  /** Saved named layouts */
  savedLayouts: NamedLayout[];

  // Diagram operations
  addDiagram: (diagram: DiagramReference) => void;
  removeDiagram: (diagramId: string) => void;
  setActiveDiagram: (diagramId: string) => void;
  updateDiagram: (diagramId: string, updates: Partial<DiagramReference>) => void;

  // Layout operations
  setLayoutMode: (mode: LayoutMode) => void;
  resizePane: (diagramId: string, size: number) => void;

  // Selection
  setLinkedSelection: (linked: boolean) => void;
  setSelectedNode: (nodeId: string | null) => void;

  // Named layouts
  saveLayout: (name: string) => void;
  restoreLayout: (layoutId: string) => void;
  deleteLayout: (layoutId: string) => void;

  // Presets
  applyPreset: (preset: DiagramPreset) => void;
}

// ============================================================================
// Preset Configurations
// ============================================================================

const PRESET_CONFIGS: Record<DiagramPreset, { layout: LayoutMode; diagrams: Partial<DiagramReference>[] }> = {
  'overview-and-detail': {
    layout: 'split-h',
    diagrams: [
      { name: 'Overview', type: 'module-graph' },
      { name: 'Detail', type: 'component-detail' },
    ],
  },
  'code-and-flow': {
    layout: 'split-h',
    diagrams: [
      { name: 'Component', type: 'component-detail' },
      { name: 'Data Flow', type: 'data-flow' },
    ],
  },
  'dependencies-both-ways': {
    layout: 'split-h',
    diagrams: [
      { name: 'Upstream', type: 'dependency-graph' },
      { name: 'Downstream', type: 'dependency-graph' },
    ],
  },
  'before-and-after': {
    layout: 'split-h',
    diagrams: [
      { name: 'Current', type: 'module-graph' },
      { name: 'Impact', type: 'impact-analysis' },
    ],
  },
  'call-trace': {
    layout: 'split-v',
    diagrams: [
      { name: 'Entry Points', type: 'module-graph' },
      { name: 'Call Graph', type: 'call-graph' },
    ],
  },
  custom: {
    layout: 'tabs',
    diagrams: [],
  },
};

// ============================================================================
// Hook
// ============================================================================

export function useMultiDiagram(): UseMultiDiagramResult {
  const [diagrams, setDiagrams] = useState<DiagramReference[]>([]);
  const [activeDiagramId, setActiveDiagramId] = useState<string | null>(null);
  const [layoutMode, setLayoutModeState] = useState<LayoutMode>('tabs');
  const [linkedSelection, setLinkedSelectionState] = useState(true);
  const [selectedNodeId, setSelectedNodeState] = useState<string | null>(null);
  const [panes, setPanes] = useState<PaneConfig[]>([]);
  const [savedLayouts, setSavedLayouts] = useState<NamedLayout[]>([]);

  // Generate unique ID
  const generateId = useCallback(() => {
    return `diagram-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // ============================================================================
  // Diagram Operations
  // ============================================================================

  const addDiagram = useCallback((diagram: DiagramReference) => {
    const id = diagram.id || generateId();
    const newDiagram = { ...diagram, id };

    setDiagrams((prev) => [...prev, newDiagram]);
    setActiveDiagramId(id);

    // Add pane for this diagram
    setPanes((prev) => [
      ...prev,
      {
        id: `pane-${id}`,
        diagramId: id,
        position: prev.length,
        size: 100 / (prev.length + 1),
      },
    ]);

    // Recalculate pane sizes
    setPanes((prev) => {
      const size = 100 / prev.length;
      return prev.map((p) => ({ ...p, size }));
    });
  }, [generateId]);

  const removeDiagram = useCallback((diagramId: string) => {
    setDiagrams((prev) => prev.filter((d) => d.id !== diagramId));
    setPanes((prev) => {
      const filtered = prev.filter((p) => p.diagramId !== diagramId);
      // Recalculate sizes
      if (filtered.length === 0) return [];
      const size = 100 / filtered.length;
      return filtered.map((p, i) => ({ ...p, position: i, size }));
    });

    // Update active diagram if needed
    setActiveDiagramId((prev) => {
      if (prev === diagramId) {
        const remaining = diagrams.filter((d) => d.id !== diagramId);
        return remaining[0]?.id ?? null;
      }
      return prev;
    });
  }, [diagrams]);

  const setActiveDiagram = useCallback((diagramId: string) => {
    setActiveDiagramId(diagramId);
  }, []);

  const updateDiagram = useCallback((diagramId: string, updates: Partial<DiagramReference>) => {
    setDiagrams((prev) =>
      prev.map((d) => (d.id === diagramId ? { ...d, ...updates } : d))
    );
  }, []);

  // ============================================================================
  // Layout Operations
  // ============================================================================

  const setLayoutMode = useCallback((mode: LayoutMode) => {
    setLayoutModeState(mode);
  }, []);

  const resizePane = useCallback((diagramId: string, size: number) => {
    setPanes((prev) => {
      const index = prev.findIndex((p) => p.diagramId === diagramId);
      if (index === -1 || prev.length < 2) return prev;

      const newPanes = [...prev];
      const oldSize = newPanes[index].size;
      const diff = size - oldSize;

      // Adjust the target pane
      newPanes[index] = { ...newPanes[index], size };

      // Adjust the next pane (or previous if last)
      const adjIndex = index < prev.length - 1 ? index + 1 : index - 1;
      newPanes[adjIndex] = {
        ...newPanes[adjIndex],
        size: newPanes[adjIndex].size - diff,
      };

      return newPanes;
    });
  }, []);

  // ============================================================================
  // Selection
  // ============================================================================

  const setLinkedSelection = useCallback((linked: boolean) => {
    setLinkedSelectionState(linked);
  }, []);

  const setSelectedNode = useCallback((nodeId: string | null) => {
    setSelectedNodeState(nodeId);
  }, []);

  // ============================================================================
  // Named Layouts
  // ============================================================================

  const saveLayout = useCallback((name: string) => {
    const layout: NamedLayout = {
      id: generateId(),
      name,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      config: {
        mode: layoutMode,
        panes: [...panes],
        linkedSelection,
        linkedNavigation: false,
        scopeLinking: { enabled: false, mode: 'manual', primaryPane: '', linkedPanes: [] },
      },
      diagrams: diagrams.map((d) => ({
        paneId: panes.find((p) => p.diagramId === d.id)?.id ?? '',
        diagramType: d.type,
        scope: d.scope ?? {},
        filters: {},
      })),
    };

    setSavedLayouts((prev) => [...prev, layout]);
  }, [generateId, layoutMode, panes, linkedSelection, diagrams]);

  const restoreLayout = useCallback((layoutId: string) => {
    const layout = savedLayouts.find((l) => l.id === layoutId);
    if (!layout) return;

    setLayoutModeState(layout.config.mode);
    setLinkedSelectionState(layout.config.linkedSelection);
    setPanes(layout.config.panes);

    // Restore diagrams from saved state
    const restoredDiagrams: DiagramReference[] = layout.diagrams.map((d, i) => ({
      id: generateId(),
      name: `Diagram ${i + 1}`,
      type: d.diagramType,
      scope: d.scope,
    }));
    setDiagrams(restoredDiagrams);
    if (restoredDiagrams.length > 0) {
      setActiveDiagramId(restoredDiagrams[0].id);
    }
  }, [savedLayouts, generateId]);

  const deleteLayout = useCallback((layoutId: string) => {
    setSavedLayouts((prev) => prev.filter((l) => l.id !== layoutId));
  }, []);

  // ============================================================================
  // Presets
  // ============================================================================

  const applyPreset = useCallback((preset: DiagramPreset) => {
    const config = PRESET_CONFIGS[preset];
    if (!config) return;

    // Clear existing diagrams
    setDiagrams([]);
    setPanes([]);

    // Set layout mode
    setLayoutModeState(config.layout);

    // Add diagrams from preset
    const newDiagrams: DiagramReference[] = config.diagrams.map((d, i) => ({
      id: generateId(),
      name: d.name ?? `Diagram ${i + 1}`,
      type: d.type ?? 'module-graph',
      scope: {},
    }));

    setDiagrams(newDiagrams);

    // Create panes
    const size = 100 / newDiagrams.length;
    const newPanes: PaneConfig[] = newDiagrams.map((d, i) => ({
      id: `pane-${d.id}`,
      diagramId: d.id,
      position: i,
      size,
    }));
    setPanes(newPanes);

    if (newDiagrams.length > 0) {
      setActiveDiagramId(newDiagrams[0].id);
    }
  }, [generateId]);

  // ============================================================================
  // Return
  // ============================================================================

  return useMemo(
    () => ({
      diagrams,
      activeDiagramId,
      layoutMode,
      linkedSelection,
      selectedNodeId,
      panes,
      savedLayouts,
      addDiagram,
      removeDiagram,
      setActiveDiagram,
      updateDiagram,
      setLayoutMode,
      resizePane,
      setLinkedSelection,
      setSelectedNode,
      saveLayout,
      restoreLayout,
      deleteLayout,
      applyPreset,
    }),
    [
      diagrams,
      activeDiagramId,
      layoutMode,
      linkedSelection,
      selectedNodeId,
      panes,
      savedLayouts,
      addDiagram,
      removeDiagram,
      setActiveDiagram,
      updateDiagram,
      setLayoutMode,
      resizePane,
      setLinkedSelection,
      setSelectedNode,
      saveLayout,
      restoreLayout,
      deleteLayout,
      applyPreset,
    ]
  );
}
