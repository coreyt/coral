/**
 * WorkspaceProvider
 *
 * Manages workspace state and provides context to all child components.
 * Designed for VS Code compatibility - no direct filesystem access.
 */

import { createContext, useContext, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useWorkspaceStore } from '../state/workspaceStore';
import {
  saveWorkspaceConfig,
  loadWorkspaceConfig,
  saveLayout as persistLayout,
  loadLayouts,
  saveAnnotations as persistAnnotations,
  loadAnnotations,
} from '../persistence/workspacePersistence';
import type {
  Workspace,
  WorkspaceSettings,
  DiagramReference,
  NamedLayout,
  AnnotationStore,
} from '../types';

// ============================================================================
// Workspace Context
// ============================================================================

export interface WorkspaceContextValue {
  // Current workspace
  workspace: Workspace | null;
  isLoading: boolean;
  error: string | null;

  // Workspace operations
  openWorkspace: (rootPath: string) => Promise<void>;
  closeWorkspace: () => void;
  updateSettings: (settings: Partial<WorkspaceSettings>) => void;

  // Diagram management
  openDiagram: (diagram: DiagramReference) => void;
  closeDiagram: (diagramId: string) => void;
  setActiveDiagram: (diagramId: string) => void;

  // Layout management
  saveLayout: (name: string, description?: string) => Promise<NamedLayout>;
  loadLayout: (layoutId: string) => void;
  getSavedLayouts: () => NamedLayout[];
  deleteLayout: (layoutId: string) => void;

  // Annotations
  getAnnotations: () => AnnotationStore;
  saveAnnotations: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// ============================================================================
// Hook
// ============================================================================

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}

// ============================================================================
// Provider Props
// ============================================================================

export interface WorkspaceProviderProps {
  children: ReactNode;

  /**
   * File system adapter for reading/writing workspace data.
   * In standalone: uses File System Access API
   * In VS Code: uses extension messaging
   */
  fileSystemAdapter?: FileSystemAdapter;

  /**
   * Initial workspace to open (optional)
   */
  initialWorkspace?: string;
}

/**
 * Abstraction for file system operations.
 * Allows different implementations for standalone vs VS Code.
 */
export interface FileSystemAdapter {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readDir(path: string): Promise<string[]>;
}

// ============================================================================
// Provider Component
// ============================================================================

export function WorkspaceProvider({
  children,
  fileSystemAdapter,
  initialWorkspace,
}: WorkspaceProviderProps) {
  const store = useWorkspaceStore();

  // Workspace operations
  const openWorkspace = useCallback(async (rootPath: string) => {
    store.setLoading(true);
    store.setError(null);

    try {
      let workspace: Workspace;

      if (fileSystemAdapter) {
        // Try to load existing workspace config
        const loadedWorkspace = await loadWorkspaceConfig(fileSystemAdapter, rootPath);

        if (loadedWorkspace) {
          workspace = loadedWorkspace;

          // Load saved layouts
          const layouts = await loadLayouts(fileSystemAdapter, rootPath);
          store.setSavedLayouts(layouts);

          // Load annotations (merge with workspace's annotations)
          const loadedAnnotations = await loadAnnotations(fileSystemAdapter, rootPath);
          if (loadedAnnotations) {
            workspace = { ...workspace, annotations: loadedAnnotations };
          }
        } else {
          // Create new workspace
          workspace = createDefaultWorkspace(rootPath);

          // Save it
          await saveWorkspaceConfig(fileSystemAdapter, workspace);
        }
      } else {
        // No file system adapter, create in-memory workspace
        workspace = createDefaultWorkspace(rootPath);
      }

      store.setWorkspace(workspace);
    } catch (error) {
      store.setError(error instanceof Error ? error.message : 'Failed to open workspace');
    } finally {
      store.setLoading(false);
    }
  }, [store, fileSystemAdapter]);

  const closeWorkspace = useCallback(() => {
    store.setWorkspace(null);
  }, [store]);

  const updateSettings = useCallback((settings: Partial<WorkspaceSettings>) => {
    store.updateSettings(settings);
  }, [store]);

  // Diagram operations
  const openDiagram = useCallback((diagram: DiagramReference) => {
    store.openDiagram(diagram);
  }, [store]);

  const closeDiagram = useCallback((diagramId: string) => {
    store.closeDiagram(diagramId);
  }, [store]);

  const setActiveDiagram = useCallback((diagramId: string) => {
    store.setActiveDiagram(diagramId);
  }, [store]);

  // Layout operations
  const saveLayout = useCallback(async (name: string, description?: string): Promise<NamedLayout> => {
    const layout = store.createNamedLayout(name, description);

    // Persist to filesystem
    if (fileSystemAdapter && store.workspace) {
      await persistLayout(fileSystemAdapter, store.workspace.rootPath, layout);
    }

    return layout;
  }, [store, fileSystemAdapter]);

  const loadLayout = useCallback((layoutId: string) => {
    store.loadNamedLayout(layoutId);
  }, [store]);

  const getSavedLayouts = useCallback((): NamedLayout[] => {
    return store.savedLayouts;
  }, [store]);

  const deleteLayout = useCallback((layoutId: string) => {
    store.deleteNamedLayout(layoutId);
  }, [store]);

  // Annotation operations
  const getAnnotations = useCallback((): AnnotationStore => {
    return store.workspace?.annotations ?? createDefaultAnnotationStore();
  }, [store]);

  const saveAnnotations = useCallback(async () => {
    if (!fileSystemAdapter || !store.workspace) return;

    await persistAnnotations(
      fileSystemAdapter,
      store.workspace.rootPath,
      store.workspace.annotations
    );
  }, [store, fileSystemAdapter]);

  // Auto-save workspace changes (debounced)
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!fileSystemAdapter || !store.workspace) return;

    // Clear any pending auto-save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Schedule auto-save after 1 second of inactivity
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveWorkspaceConfig(fileSystemAdapter, store.workspace!);
      } catch (error) {
        console.error('Failed to auto-save workspace:', error);
      }
    }, 1000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [
    fileSystemAdapter,
    store.workspace?.openDiagrams,
    store.workspace?.activeLayout,
    store.workspace?.settings,
  ]);

  const value: WorkspaceContextValue = {
    workspace: store.workspace,
    isLoading: store.isLoading,
    error: store.error,
    openWorkspace,
    closeWorkspace,
    updateSettings,
    openDiagram,
    closeDiagram,
    setActiveDiagram,
    saveLayout,
    loadLayout,
    getSavedLayouts,
    deleteLayout,
    getAnnotations,
    saveAnnotations,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function createDefaultWorkspace(rootPath: string): Workspace {
  const name = rootPath.split('/').pop() || 'Workspace';

  return {
    id: crypto.randomUUID(),
    name,
    rootPath,
    armadaConnection: {
      serverUrl: 'http://localhost:8765',
      mode: 'call-graph',
    },
    openDiagrams: [],
    activeLayout: {
      mode: 'tabs',
      panes: [],
      linkedSelection: true,
      linkedNavigation: false,
      scopeLinking: {
        enabled: false,
        mode: 'manual',
        primaryPane: '',
        linkedPanes: [],
      },
    },
    annotations: createDefaultAnnotationStore(),
    settings: {
      defaultNotation: 'code',
      defaultDiagramType: 'module-graph',
      autoRefresh: false,
      refreshInterval: 30000,
    },
  };
}

function createDefaultAnnotationStore(): AnnotationStore {
  return {
    version: '1.0.0',
    nodes: {},
    edges: {},
    groups: [],
    tags: [],
    orphaned: [],
  };
}
