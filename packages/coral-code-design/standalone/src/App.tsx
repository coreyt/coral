/**
 * Coral Code Design - Standalone Application
 *
 * Software architecture visualization and exploration tool.
 */

import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import {
  WorkspaceProvider,
  ArmadaProvider,
  NavigationProvider,
  WorkspaceLayout,
  DiagramView,
  Navigator,
  Inspector,
  SearchPalette,
  ArmadaConnectionDialog,
  DiagramRenderer,
  CodePreview,
  useDiagramData,
  useWorkspace,
  useArmada,
  useFileTree,
  useSymbolOutline,
  type DiagramReference,
  type InspectorNodeData,
  type SearchResult,
  type GraphMode,
  type ArmadaConnectionConfig,
} from '@coral-code-design/core';
import { Shell } from './Shell';
import { useFileSystem, type UseFileSystemResult } from './providers/useFileSystem';

// Context to share file system state with Shell
export interface FileSystemContextValue extends UseFileSystemResult {}

const FileSystemContext = createContext<FileSystemContextValue | null>(null);

export function useFileSystemContext(): FileSystemContextValue {
  const ctx = useContext(FileSystemContext);
  if (!ctx) {
    throw new Error('useFileSystemContext must be used within App');
  }
  return ctx;
}

// Context to share Armada dialog state with Shell
export interface ArmadaDialogContextValue {
  isOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const ArmadaDialogContext = createContext<ArmadaDialogContextValue | null>(null);

export function useArmadaDialogContext(): ArmadaDialogContextValue {
  const ctx = useContext(ArmadaDialogContext);
  if (!ctx) {
    throw new Error('useArmadaDialogContext must be used within App');
  }
  return ctx;
}

export function App() {
  const fileSystem = useFileSystem();
  const [armadaDialogOpen, setArmadaDialogOpen] = useState(false);

  const armadaDialogValue: ArmadaDialogContextValue = {
    isOpen: armadaDialogOpen,
    openDialog: () => setArmadaDialogOpen(true),
    closeDialog: () => setArmadaDialogOpen(false),
  };

  return (
    <FileSystemContext.Provider value={fileSystem}>
      <ArmadaDialogContext.Provider value={armadaDialogValue}>
        <WorkspaceProvider fileSystemAdapter={fileSystem.adapter}>
          <ArmadaProvider>
            <NavigationProvider>
              <Shell>
                <AppContent />
              </Shell>
            </NavigationProvider>
          </ArmadaProvider>
        </WorkspaceProvider>
      </ArmadaDialogContext.Provider>
    </FileSystemContext.Provider>
  );
}

const DEFAULT_MODES: GraphMode[] = [
  'call-graph',
  'dependency-graph',
  'inheritance-tree',
  'impact-graph',
  'full-graph',
];

function AppContent() {
  const { workspace, openDiagram, closeDiagram, setActiveDiagram } = useWorkspace();
  const { isConnected, isConnecting, connectionError, stats, connect } = useArmada();
  const { isOpen: armadaDialogOpen, closeDialog: closeArmadaDialog, openDialog: openArmadaDialog } = useArmadaDialogContext();
  const { adapter: fileSystemAdapter } = useFileSystemContext();

  // UI state
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<InspectorNodeData | null>(null);
  const [codeContent, setCodeContent] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'properties' | 'code'>('properties');

  // File tree from workspace
  const {
    tree: fileTree,
    expandDirectory,
    collapseDirectory,
  } = useFileTree(fileSystemAdapter);

  // Symbol outline for selected file
  const { symbols } = useSymbolOutline({
    scope: selectedNode?.file,
  });

  // Handle Armada connect
  const handleArmadaConnect = useCallback(async (config: ArmadaConnectionConfig) => {
    await connect(config);
    closeArmadaDialog();
  }, [connect, closeArmadaDialog]);

  // Get open diagrams and active diagram
  const diagrams = workspace?.openDiagrams ?? [];
  const activeDiagramId = diagrams.length > 0 ? diagrams[0].id : null;
  const activeDiagram = diagrams.find(d => d.id === activeDiagramId) ?? null;
  const layoutMode = workspace?.activeLayout.mode ?? 'tabs';

  // Use diagram data hook for the active diagram
  const { graphIR, isLoading: diagramLoading, error: diagramError } = useDiagramData(activeDiagram);

  // Load code when a node is selected
  useEffect(() => {
    if (!selectedNode || !selectedNode.file) {
      setCodeContent(null);
      setCodeError(null);
      return;
    }

    const loadCode = async () => {
      if (!fileSystemAdapter) {
        // If no file system adapter, show the file path as a hint
        setCodeError(`File system not available. Open a workspace to view code.\nFile: ${selectedNode.file}`);
        return;
      }

      setCodeLoading(true);
      setCodeError(null);

      try {
        const content = await fileSystemAdapter.readFile(selectedNode.file);
        setCodeContent(content);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load file';
        setCodeError(message);
        setCodeContent(null);
      } finally {
        setCodeLoading(false);
      }
    };

    loadCode();
  }, [selectedNode, fileSystemAdapter]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Cmd/Ctrl + P - Search palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      e.preventDefault();
      setSearchOpen(true);
    }
  }, []);

  // Set up keyboard listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle search
  const handleSearch = useCallback(async (query: string): Promise<SearchResult[]> => {
    // TODO: Implement actual search via Armada
    return [
      {
        id: '1',
        type: 'symbol',
        title: `${query} (mock)`,
        subtitle: 'src/example.ts',
        symbolId: 'mock:symbol',
      },
    ];
  }, []);

  // Handle search result selection
  const handleSearchSelect = useCallback((result: SearchResult) => {
    console.log('Selected:', result);
    // TODO: Navigate to result
  }, []);

  // Handle node selection from diagram
  const handleNodeSelect = useCallback((nodeData: InspectorNodeData | null) => {
    setSelectedNode(nodeData);
    // Auto-switch to properties tab when selecting a node
    if (nodeData) {
      setInspectorTab('properties');
    }
  }, []);

  // Handle view code action from inspector
  const handleViewCode = useCallback((file: string, line?: number) => {
    setInspectorTab('code');
  }, []);

  // Render diagram content
  const renderDiagram = useCallback((diagram: DiagramReference) => {
    // Only render for the active diagram
    if (diagram.id !== activeDiagramId) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
            <div style={{ fontWeight: 600 }}>{diagram.name}</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>{diagram.type}</div>
          </div>
        </div>
      );
    }

    // Show connection prompt if not connected
    if (!isConnected) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚓</div>
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>Connect to Armada</div>
            <div style={{ fontSize: '12px', marginBottom: '16px' }}>
              Connect to view code diagrams
            </div>
            <button
              onClick={openArmadaDialog}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                border: 'none',
                borderRadius: '4px',
                background: 'var(--button-primary-bg, #2563eb)',
                color: 'var(--button-primary-text, #fff)',
                cursor: 'pointer',
              }}
            >
              Connect
            </button>
          </div>
        </div>
      );
    }

    return (
      <DiagramRenderer
        graphIR={graphIR}
        isLoading={diagramLoading}
        error={diagramError}
        onNodeSelect={handleNodeSelect}
      />
    );
  }, [activeDiagramId, isConnected, graphIR, diagramLoading, diagramError, handleNodeSelect, openArmadaDialog]);

  // Render inspector content based on tab
  const renderInspectorContent = () => {
    if (inspectorTab === 'code') {
      return (
        <CodePreview
          content={codeContent}
          startLine={selectedNode?.startLine}
          endLine={selectedNode?.endLine}
          isLoading={codeLoading}
          error={codeError}
          filename={selectedNode?.file}
        />
      );
    }

    return (
      <Inspector
        node={selectedNode}
        onViewCode={handleViewCode}
      />
    );
  };

  return (
    <>
      <WorkspaceLayout
        navigator={
          <Navigator
            workspacePath={workspace?.rootPath}
            fileTree={fileTree}
            symbols={symbols}
            orphanedCount={workspace?.annotations.orphaned.length ?? 0}
            onFileSelect={(path) => {
              // Load file content for code preview
              setSelectedNode({
                symbolId: path,
                name: path.split('/').pop() || path,
                type: 'file',
                file: path,
              });
              setInspectorTab('code');
            }}
            onSymbolSelect={(symbolId) => {
              // Find symbol in diagram and select
              console.log('Symbol selected:', symbolId);
            }}
          />
        }
        inspector={
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Inspector tabs */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-color, #e0e0e0)',
                padding: '0 8px',
              }}
            >
              <TabButton
                active={inspectorTab === 'properties'}
                onClick={() => setInspectorTab('properties')}
              >
                Properties
              </TabButton>
              <TabButton
                active={inspectorTab === 'code'}
                onClick={() => setInspectorTab('code')}
              >
                Code
              </TabButton>
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {renderInspectorContent()}
            </div>
          </div>
        }
        statusBar={
          <StatusBar
            isConnected={isConnected}
            nodeCount={stats?.nodes}
            edgeCount={stats?.edges}
          />
        }
      >
        <DiagramView
          diagrams={diagrams}
          activeDiagramId={activeDiagramId}
          layoutMode={layoutMode}
          onSelectDiagram={setActiveDiagram}
          onCloseDiagram={closeDiagram}
          onNewDiagram={() => {
            openDiagram({
              id: crypto.randomUUID(),
              name: 'Module Graph',
              type: 'module-graph',
              scope: {},
            });
          }}
          renderDiagram={renderDiagram}
        />
      </WorkspaceLayout>

      <SearchPalette
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSearch={handleSearch}
        onSelect={handleSearchSelect}
      />

      <ArmadaConnectionDialog
        isOpen={armadaDialogOpen}
        onClose={closeArmadaDialog}
        initialServerUrl={workspace?.armadaConnection.serverUrl ?? 'http://localhost:8765'}
        initialMode={workspace?.armadaConnection.mode ?? 'call-graph'}
        onConnect={handleArmadaConnect}
        isConnecting={isConnecting}
        error={connectionError}
        availableModes={DEFAULT_MODES}
      />
    </>
  );
}

// ============================================================================
// Tab Button
// ============================================================================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 12px',
        fontSize: '12px',
        border: 'none',
        borderBottom: active ? '2px solid var(--primary-color, #2563eb)' : '2px solid transparent',
        background: 'transparent',
        color: active ? 'var(--text-color, #333)' : 'var(--text-muted, #666)',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Status Bar
// ============================================================================

interface StatusBarProps {
  isConnected: boolean;
  nodeCount?: number;
  edgeCount?: number;
}

function StatusBar({ isConnected, nodeCount, edgeCount }: StatusBarProps) {
  return (
    <>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ color: isConnected ? 'var(--success-color, #22c55e)' : 'var(--text-muted)' }}>
          ●
        </span>
        {isConnected ? 'Connected to Armada' : 'Not connected'}
      </span>

      {isConnected && nodeCount !== undefined && (
        <>
          <span style={{ margin: '0 8px', color: 'var(--border-color)' }}>│</span>
          <span>{nodeCount.toLocaleString()} nodes</span>
          {edgeCount !== undefined && (
            <span style={{ marginLeft: '8px' }}>{edgeCount.toLocaleString()} edges</span>
          )}
        </>
      )}

      <span style={{ flex: 1 }} />

      <span style={{ color: 'var(--text-muted)' }}>
        Cmd+P to search
      </span>
    </>
  );
}
