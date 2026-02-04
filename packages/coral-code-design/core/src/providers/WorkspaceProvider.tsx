/**
 * WorkspaceProvider
 *
 * Manages workspace state and provides context to all child components.
 * Designed for VS Code compatibility - no direct filesystem access.
 */

import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useWorkspaceStore } from '../state/workspaceStore';
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
      // Load workspace config from .coral-code-design/workspace.json
      const configPath = `${rootPath}/.coral-code-design/workspace.json`;

      let workspace: Workspace;

      if (fileSystemAdapter && await fileSystemAdapter.exists(configPath)) {
        const content = await fileSystemAdapter.readFile(configPath);
        workspace = JSON.parse(content);
      } else {
        // Create new workspace
        workspace = createDefaultWorkspace(rootPath);

        // Save it
        if (fileSystemAdapter) {
          await fileSystemAdapter.mkdir(`${rootPath}/.coral-code-design`);
          await fileSystemAdapter.writeFile(
            configPath,
            JSON.stringify(workspace, null, 2)
          );
        }
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
    // TODO: Persist to filesystem
    return layout;
  }, [store]);

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
    // TODO: Persist to filesystem
  }, []);

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
