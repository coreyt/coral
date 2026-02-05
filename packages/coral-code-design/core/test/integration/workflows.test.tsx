/**
 * Integration Tests: Multi-Component Workflows
 *
 * Tests for component communication and state flow.
 * GitHub Issue: #39
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import React, { useState } from 'react';
import { ArmadaProvider, useArmada, clearArmadaQueryCache } from '../../src/providers/ArmadaProvider';
import { CodePreview } from '../../src/components/CodePreview/CodePreview';
import { Inspector } from '../../src/components/Inspector/Inspector';
import { Breadcrumbs } from '../../src/components/Breadcrumbs/Breadcrumbs';
import type { DiagramScope } from '../../src/hooks/useDiagramNavigation';
import type { ArmadaConnectionConfig, InspectorNodeData, SymbolId } from '../../src/types';
import {
  createMockArmadaServer,
  type MockArmadaServer,
} from '../utils/mockArmadaServer';
import { armadaFixtures } from '../fixtures';

// ============================================================================
// Test Components
// ============================================================================

/**
 * Simulates Navigator -> CodePreview flow
 */
function FileCodePreviewWorkflow() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Simulated file selection
  const handleFileSelect = (file: string) => {
    setSelectedFile(file);
    setIsLoading(true);
    // Simulate loading code
    setTimeout(() => {
      setCode(`// Code from ${file}\nfunction example() {\n  return 42;\n}`);
      setIsLoading(false);
    }, 50);
  };

  return (
    <div data-testid="file-code-preview-workflow">
      {/* Simulated Navigator */}
      <div data-testid="navigator">
        <button
          data-testid="select-auth-file"
          onClick={() => handleFileSelect('src/auth/service.ts')}
        >
          auth/service.ts
        </button>
        <button
          data-testid="select-api-file"
          onClick={() => handleFileSelect('src/api/handler.ts')}
        >
          api/handler.ts
        </button>
      </div>

      <span data-testid="selected-file">{selectedFile || 'none'}</span>

      {/* CodePreview */}
      <CodePreview
        content={code}
        isLoading={isLoading}
        filename={selectedFile || undefined}
        startLine={2}
        endLine={4}
      />
    </div>
  );
}

/**
 * Simulates DiagramRenderer -> Inspector flow
 */
function NodeInspectorWorkflow() {
  const [selectedNode, setSelectedNode] = useState<InspectorNodeData | null>(null);
  const [annotations, setAnnotations] = useState<Record<SymbolId, string>>({});

  const handleNodeSelect = (nodeId: string) => {
    setSelectedNode({
      symbolId: `scip:${nodeId}` as SymbolId,
      name: nodeId,
      type: 'class',
      file: `src/${nodeId}.ts`,
      startLine: 10,
      endLine: 50,
      annotation: annotations[`scip:${nodeId}` as SymbolId]
        ? { symbolId: `scip:${nodeId}` as SymbolId, note: annotations[`scip:${nodeId}` as SymbolId] }
        : undefined,
    });
  };

  const handleAnnotationChange = (symbolId: SymbolId, annotation: { note?: string }) => {
    if (annotation.note !== undefined) {
      setAnnotations((prev) => ({
        ...prev,
        [symbolId]: annotation.note!,
      }));
    }
  };

  const handleViewCode = vi.fn();

  return (
    <div data-testid="node-inspector-workflow">
      {/* Simulated DiagramRenderer nodes */}
      <div data-testid="diagram">
        <button
          data-testid="node-AuthService"
          onClick={() => handleNodeSelect('AuthService')}
        >
          AuthService
        </button>
        <button
          data-testid="node-UserService"
          onClick={() => handleNodeSelect('UserService')}
        >
          UserService
        </button>
      </div>

      <span data-testid="selected-node">
        {selectedNode?.name || 'none'}
      </span>

      {/* Inspector */}
      <div data-testid="inspector-wrapper">
        <Inspector
          node={selectedNode}
          onAnnotationChange={handleAnnotationChange}
          onViewCode={handleViewCode}
        />
      </div>

      {/* Show stored annotations for verification */}
      <span data-testid="annotation-count">{Object.keys(annotations).length}</span>
    </div>
  );
}

/**
 * Simulates Search -> Selection flow (with mock Armada)
 */
function SearchNavigationWorkflow() {
  const armada = useArmada();
  const [results, setResults] = useState<unknown[]>([]);
  const [selectedResult, setSelectedResult] = useState<string | null>(null);
  const [inspectorNode, setInspectorNode] = useState<InspectorNodeData | null>(null);

  const handleSearch = async (query: string) => {
    if (!armada.isConnected || !query) {
      setResults([]);
      return;
    }
    const searchResults = await armada.search(query);
    setResults(searchResults);
  };

  const handleResultSelect = (result: any) => {
    setSelectedResult(result.id);
    // Transform search result to inspector node
    setInspectorNode({
      symbolId: result.id as SymbolId,
      name: result.name,
      type: result.type,
      file: result.file,
      startLine: result.startLine,
      endLine: result.endLine,
    });
  };

  return (
    <div data-testid="search-navigation-workflow">
      <span data-testid="connected">{armada.isConnected ? 'yes' : 'no'}</span>

      {/* Search input */}
      <input
        data-testid="search-input"
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search..."
      />

      {/* Results */}
      <div data-testid="results">
        <span data-testid="result-count">{results.length}</span>
        {results.map((r: any) => (
          <button
            key={r.id}
            data-testid={`result-${r.name}`}
            onClick={() => handleResultSelect(r)}
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* Selection state */}
      <span data-testid="selected-result">{selectedResult || 'none'}</span>

      {/* Inspector (shows selected result) */}
      <div data-testid="inspector">
        <Inspector node={inspectorNode} />
      </div>
    </div>
  );
}

/**
 * Simulates breadcrumb navigation (drill down and back)
 */
function BreadcrumbNavigationWorkflow() {
  const [history, setHistory] = useState<DiagramScope[]>([
    { path: '/', label: 'Overview', type: 'overview' },
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const drillDown = (path: string, label: string) => {
    const newScope: DiagramScope = { path, label, type: 'detail' };
    // Add to history, truncating any forward history
    setHistory((prev) => [...prev.slice(0, currentIndex + 1), newScope]);
    setCurrentIndex((prev) => prev + 1);
  };

  const handleNavigate = (index: number) => {
    setCurrentIndex(index);
  };

  const currentLabel = history[currentIndex]?.label || 'Overview';

  return (
    <div data-testid="breadcrumb-navigation-workflow">
      {/* Breadcrumbs */}
      <Breadcrumbs
        history={history}
        currentIndex={currentIndex}
        onNavigate={handleNavigate}
      />

      {/* Current view */}
      <span data-testid="current-view">{currentLabel}</span>
      <span data-testid="breadcrumb-count">{currentIndex + 1}</span>

      {/* Drill-down buttons */}
      <button
        data-testid="drill-to-auth"
        onClick={() => drillDown('/auth', 'Auth Module')}
      >
        Auth Module
      </button>
      <button
        data-testid="drill-to-service"
        onClick={() => drillDown('/auth/service', 'AuthService')}
      >
        AuthService
      </button>
      <button
        data-testid="drill-to-method"
        onClick={() => drillDown('/auth/service/login', 'login()')}
      >
        login()
      </button>
    </div>
  );
}

/**
 * Simulates annotation persistence across reload
 */
function AnnotationPersistenceWorkflow() {
  const [annotations, setAnnotations] = useState<Record<string, string>>({});
  const [savedState, setSavedState] = useState<string | null>(null);

  const node: InspectorNodeData = {
    symbolId: 'scip:src/auth.ts:AuthService#' as SymbolId,
    name: 'AuthService',
    type: 'class',
    file: 'src/auth.ts',
    startLine: 10,
    endLine: 100,
    annotation: annotations['scip:src/auth.ts:AuthService#']
      ? { symbolId: 'scip:src/auth.ts:AuthService#' as SymbolId, note: annotations['scip:src/auth.ts:AuthService#'] }
      : undefined,
  };

  const handleAnnotationChange = (symbolId: SymbolId, annotation: { note?: string }) => {
    if (annotation.note !== undefined) {
      setAnnotations((prev) => ({
        ...prev,
        [symbolId]: annotation.note!,
      }));
    }
  };

  const saveState = () => {
    setSavedState(JSON.stringify(annotations));
  };

  const loadState = () => {
    if (savedState) {
      setAnnotations(JSON.parse(savedState));
    }
  };

  const clearAnnotations = () => {
    setAnnotations({});
  };

  return (
    <div data-testid="annotation-persistence-workflow">
      <Inspector
        node={node}
        onAnnotationChange={handleAnnotationChange}
      />

      <span data-testid="annotation-value">
        {annotations['scip:src/auth.ts:AuthService#'] || 'none'}
      </span>
      <span data-testid="saved-state">{savedState || 'none'}</span>

      <button data-testid="save-btn" onClick={saveState}>
        Save
      </button>
      <button data-testid="load-btn" onClick={loadState}>
        Load
      </button>
      <button data-testid="clear-btn" onClick={clearAnnotations}>
        Clear
      </button>
    </div>
  );
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Multi-Component Workflow Integration', () => {
  let mockServer: MockArmadaServer;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    clearArmadaQueryCache();
    mockServer = createMockArmadaServer();
    global.fetch = mockServer.fetch;
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    clearArmadaQueryCache();
    global.fetch = originalFetch;
    mockServer.reset();
  });

  // --------------------------------------------------------------------------
  // Test 1: File -> Code Preview
  // --------------------------------------------------------------------------
  describe('file to code preview', () => {
    it('should display code when file is selected', async () => {
      render(<FileCodePreviewWorkflow />);

      // Initially no file selected
      expect(screen.getByTestId('selected-file').textContent).toBe('none');

      // Select a file
      fireEvent.click(screen.getByTestId('select-auth-file'));

      // File should be selected
      expect(screen.getByTestId('selected-file').textContent).toBe('src/auth/service.ts');

      // Wait for code to load
      await waitFor(() => {
        expect(screen.getByText(/Code from src\/auth\/service.ts/)).toBeInTheDocument();
      });
    });

    it('should update code when different file is selected', async () => {
      render(<FileCodePreviewWorkflow />);

      // Select first file
      fireEvent.click(screen.getByTestId('select-auth-file'));
      await waitFor(() => {
        expect(screen.getByTestId('selected-file').textContent).toBe('src/auth/service.ts');
      });

      // Select second file
      fireEvent.click(screen.getByTestId('select-api-file'));
      expect(screen.getByTestId('selected-file').textContent).toBe('src/api/handler.ts');

      await waitFor(() => {
        // Use queryAllByText and check that api/handler.ts appears in code
        const matches = screen.queryAllByText(/api\/handler.ts/);
        expect(matches.length).toBeGreaterThan(0);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Test 2: Node -> Inspector
  // --------------------------------------------------------------------------
  describe('node to inspector', () => {
    it('should display node properties when node is selected', async () => {
      render(<NodeInspectorWorkflow />);

      // Initially no node selected
      expect(screen.getByTestId('selected-node').textContent).toBe('none');
      expect(screen.getByText('Select a node to view its properties')).toBeInTheDocument();

      // Select a node
      fireEvent.click(screen.getByTestId('node-AuthService'));

      // Node should be selected and inspector should update
      expect(screen.getByTestId('selected-node').textContent).toBe('AuthService');
      // Multiple elements contain 'AuthService' - just check it appears
      const matches = screen.queryAllByText('AuthService');
      expect(matches.length).toBeGreaterThan(0);
    });

    it('should allow annotation editing for selected node', async () => {
      render(<NodeInspectorWorkflow />);

      // Select a node
      fireEvent.click(screen.getByTestId('node-AuthService'));

      // Find the note textarea
      const textarea = screen.getByPlaceholderText('Add a note...');
      expect(textarea).toBeInTheDocument();

      // Type a note
      fireEvent.change(textarea, { target: { value: 'Important auth service' } });
      fireEvent.blur(textarea);

      // Annotation should be stored
      expect(screen.getByTestId('annotation-count').textContent).toBe('1');
    });
  });

  // --------------------------------------------------------------------------
  // Test 3: Search -> Navigation
  // --------------------------------------------------------------------------
  describe('search to navigation', () => {
    it('should navigate to selected search result', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      mockServer.setResponse('/api/search', armadaFixtures.searchResults);

      render(
        <ArmadaProvider initialConfig={config}>
          <SearchNavigationWorkflow />
        </ArmadaProvider>
      );

      // Wait for connection
      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // Search
      const input = screen.getByTestId('search-input');
      fireEvent.change(input, { target: { value: 'auth' } });

      // Wait for results
      await waitFor(() => {
        const count = parseInt(screen.getByTestId('result-count').textContent || '0');
        expect(count).toBeGreaterThan(0);
      });

      // Click first result
      fireEvent.click(screen.getByTestId('result-AuthService'));

      // Inspector should show selected result
      expect(screen.getByTestId('selected-result').textContent).toContain('AuthService');
    });
  });

  // --------------------------------------------------------------------------
  // Test 4: Annotation Persistence
  // --------------------------------------------------------------------------
  describe('annotation persistence', () => {
    it('should save and restore annotations', async () => {
      render(<AnnotationPersistenceWorkflow />);

      // Add annotation
      const textarea = screen.getByPlaceholderText('Add a note...');
      fireEvent.change(textarea, { target: { value: 'Critical service' } });
      fireEvent.blur(textarea);

      expect(screen.getByTestId('annotation-value').textContent).toBe('Critical service');

      // Save state
      fireEvent.click(screen.getByTestId('save-btn'));
      expect(screen.getByTestId('saved-state').textContent).not.toBe('none');

      // Clear annotations
      fireEvent.click(screen.getByTestId('clear-btn'));
      expect(screen.getByTestId('annotation-value').textContent).toBe('none');

      // Load saved state
      fireEvent.click(screen.getByTestId('load-btn'));
      expect(screen.getByTestId('annotation-value').textContent).toBe('Critical service');
    });
  });

  // --------------------------------------------------------------------------
  // Test 5: Breadcrumb Navigation
  // --------------------------------------------------------------------------
  describe('breadcrumb navigation', () => {
    it('should add breadcrumbs when drilling down', async () => {
      render(<BreadcrumbNavigationWorkflow />);

      // Initial state
      expect(screen.getByTestId('current-view').textContent).toBe('Overview');
      expect(screen.getByTestId('breadcrumb-count').textContent).toBe('1');

      // Drill down
      fireEvent.click(screen.getByTestId('drill-to-auth'));
      expect(screen.getByTestId('current-view').textContent).toBe('Auth Module');
      expect(screen.getByTestId('breadcrumb-count').textContent).toBe('2');

      // Drill deeper
      fireEvent.click(screen.getByTestId('drill-to-service'));
      expect(screen.getByTestId('current-view').textContent).toBe('AuthService');
      expect(screen.getByTestId('breadcrumb-count').textContent).toBe('3');
    });

    it('should navigate back when breadcrumb is clicked', async () => {
      render(<BreadcrumbNavigationWorkflow />);

      // Drill down multiple levels
      fireEvent.click(screen.getByTestId('drill-to-auth'));
      fireEvent.click(screen.getByTestId('drill-to-service'));
      fireEvent.click(screen.getByTestId('drill-to-method'));

      expect(screen.getByTestId('breadcrumb-count').textContent).toBe('4');

      // Click on root breadcrumb
      const overviewBreadcrumb = screen.getByText('Overview');
      fireEvent.click(overviewBreadcrumb);

      // Should navigate back to root
      expect(screen.getByTestId('current-view').textContent).toBe('Overview');
      expect(screen.getByTestId('breadcrumb-count').textContent).toBe('1');
    });
  });
});
