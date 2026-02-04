/**
 * Coral Code Design - Standalone Application
 *
 * Software architecture visualization and exploration tool.
 */

import { useState, useCallback } from 'react';
import {
  WorkspaceProvider,
  ArmadaProvider,
  NavigationProvider,
  WorkspaceLayout,
  DiagramView,
  Navigator,
  Inspector,
  SearchPalette,
  useWorkspace,
  useArmada,
  type DiagramReference,
  type InspectorNodeData,
  type SearchResult,
  type FileSystemAdapter,
} from '@coral-code-design/core';
import { Shell } from './Shell';
import { useFileSystem } from './providers/useFileSystem';

export function App() {
  const fileSystemAdapter = useFileSystem();

  return (
    <WorkspaceProvider fileSystemAdapter={fileSystemAdapter}>
      <ArmadaProvider>
        <NavigationProvider>
          <Shell>
            <AppContent />
          </Shell>
        </NavigationProvider>
      </ArmadaProvider>
    </WorkspaceProvider>
  );
}

function AppContent() {
  const { workspace, openDiagram, closeDiagram, setActiveDiagram } = useWorkspace();
  const { isConnected, stats } = useArmada();

  // UI state
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<InspectorNodeData | null>(null);

  // Get open diagrams
  const diagrams = workspace?.openDiagrams ?? [];
  const activeDiagramId = diagrams[0]?.id ?? null;
  const layoutMode = workspace?.activeLayout.mode ?? 'tabs';

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Cmd/Ctrl + P - Search palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      e.preventDefault();
      setSearchOpen(true);
    }
  }, []);

  // Set up keyboard listener
  useState(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

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

  // Render diagram content
  const renderDiagram = useCallback((diagram: DiagramReference) => {
    // TODO: Render actual diagram using @coral/viz
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
  }, []);

  return (
    <>
      <WorkspaceLayout
        navigator={
          <Navigator
            workspacePath={workspace?.rootPath}
            fileTree={[]}
            symbols={[]}
            orphanedCount={workspace?.annotations.orphaned.length ?? 0}
          />
        }
        inspector={
          <Inspector
            node={selectedNode}
            onViewCode={(file, line) => console.log('View code:', file, line)}
          />
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
              name: 'New Diagram',
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
    </>
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
        <span style={{ color: isConnected ? 'var(--success-color)' : 'var(--text-muted)' }}>
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
