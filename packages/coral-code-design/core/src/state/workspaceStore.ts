/**
 * Workspace State Store (Zustand)
 *
 * Central state management for workspace, diagrams, and layouts.
 */

import { create } from 'zustand';
import type {
  Workspace,
  WorkspaceSettings,
  DiagramReference,
  LayoutConfig,
  NamedLayout,
  AnnotationStore,
} from '../types';

// ============================================================================
// Store State
// ============================================================================

export interface WorkspaceState {
  // Workspace
  workspace: Workspace | null;
  isLoading: boolean;
  error: string | null;

  // Active diagram
  activeDiagramId: string | null;

  // Saved layouts
  savedLayouts: NamedLayout[];

  // Actions
  setWorkspace: (workspace: Workspace | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Settings
  updateSettings: (settings: Partial<WorkspaceSettings>) => void;

  // Diagrams
  openDiagram: (diagram: DiagramReference) => void;
  closeDiagram: (diagramId: string) => void;
  setActiveDiagram: (diagramId: string) => void;

  // Layout
  updateLayout: (layout: Partial<LayoutConfig>) => void;
  createNamedLayout: (name: string, description?: string) => NamedLayout;
  loadNamedLayout: (layoutId: string) => void;
  deleteNamedLayout: (layoutId: string) => void;
  setSavedLayouts: (layouts: NamedLayout[]) => void;

  // Annotations
  updateAnnotations: (annotations: Partial<AnnotationStore>) => void;
}

// ============================================================================
// Store
// ============================================================================

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  // Initial state
  workspace: null,
  isLoading: false,
  error: null,
  activeDiagramId: null,
  savedLayouts: [],

  // Workspace actions
  setWorkspace: (workspace) => set({ workspace, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  // Settings
  updateSettings: (settings) => set((state) => {
    if (!state.workspace) return state;
    return {
      workspace: {
        ...state.workspace,
        settings: { ...state.workspace.settings, ...settings },
      },
    };
  }),

  // Diagram actions
  openDiagram: (diagram) => set((state) => {
    if (!state.workspace) return state;

    // Check if already open
    const existing = state.workspace.openDiagrams.find(d => d.id === diagram.id);
    if (existing) {
      return { activeDiagramId: diagram.id };
    }

    return {
      workspace: {
        ...state.workspace,
        openDiagrams: [...state.workspace.openDiagrams, diagram],
      },
      activeDiagramId: diagram.id,
    };
  }),

  closeDiagram: (diagramId) => set((state) => {
    if (!state.workspace) return state;

    const openDiagrams = state.workspace.openDiagrams.filter(d => d.id !== diagramId);
    const activeDiagramId = state.activeDiagramId === diagramId
      ? openDiagrams[0]?.id ?? null
      : state.activeDiagramId;

    return {
      workspace: {
        ...state.workspace,
        openDiagrams,
      },
      activeDiagramId,
    };
  }),

  setActiveDiagram: (diagramId) => set({ activeDiagramId: diagramId }),

  // Layout actions
  updateLayout: (layout) => set((state) => {
    if (!state.workspace) return state;
    return {
      workspace: {
        ...state.workspace,
        activeLayout: { ...state.workspace.activeLayout, ...layout },
      },
    };
  }),

  createNamedLayout: (name, description) => {
    const state = get();
    if (!state.workspace) throw new Error('No workspace open');

    const layout: NamedLayout = {
      id: crypto.randomUUID(),
      name,
      description,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      config: state.workspace.activeLayout,
      diagrams: state.workspace.openDiagrams.map(d => ({
        paneId: d.id,
        diagramType: d.type,
        scope: d.scope,
        filters: {},
      })),
    };

    set({ savedLayouts: [...state.savedLayouts, layout] });
    return layout;
  },

  loadNamedLayout: (layoutId) => set((state) => {
    const layout = state.savedLayouts.find(l => l.id === layoutId);
    if (!layout || !state.workspace) return state;

    // Restore diagrams from layout
    const openDiagrams: DiagramReference[] = layout.diagrams.map(d => ({
      id: d.paneId,
      name: `${d.diagramType}`, // TODO: Better naming
      type: d.diagramType,
      scope: d.scope,
    }));

    return {
      workspace: {
        ...state.workspace,
        activeLayout: layout.config,
        openDiagrams,
      },
      activeDiagramId: openDiagrams[0]?.id ?? null,
    };
  }),

  deleteNamedLayout: (layoutId) => set((state) => ({
    savedLayouts: state.savedLayouts.filter(l => l.id !== layoutId),
  })),

  setSavedLayouts: (layouts) => set({ savedLayouts: layouts }),

  // Annotation actions
  updateAnnotations: (annotations) => set((state) => {
    if (!state.workspace) return state;
    return {
      workspace: {
        ...state.workspace,
        annotations: { ...state.workspace.annotations, ...annotations },
      },
    };
  }),
}));
