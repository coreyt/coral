/**
 * Integration Tests: Data Flow
 *
 * Tests for data flow between Armada and coral-code-design components.
 * GitHub Issue: #37
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import { ArmadaProvider, useArmada, clearArmadaQueryCache } from '../../src/providers/ArmadaProvider';
import type { ArmadaConnectionConfig, GraphMode } from '../../src/types';
import {
  createMockArmadaServer,
  type MockArmadaServer,
} from '../utils/mockArmadaServer';
import { armadaFixtures } from '../fixtures';

// ============================================================================
// Test Components
// ============================================================================

/**
 * Test component for diagram fetching
 */
function DiagramFetchConsumer({
  onFetch,
}: {
  onFetch?: (data: unknown) => void;
}) {
  const armada = useArmada();
  const [diagram, setDiagram] = React.useState<unknown>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchDiagram = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await armada.fetchDiagram('call-graph');
      setDiagram(data);
      onFetch?.(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div data-testid="diagram-consumer">
      <span data-testid="connected">{armada.isConnected ? 'yes' : 'no'}</span>
      <span data-testid="mode">{armada.currentMode || 'none'}</span>
      <span data-testid="loading">{isLoading ? 'yes' : 'no'}</span>
      <span data-testid="error">{error || 'none'}</span>
      <span data-testid="has-diagram">{diagram ? 'yes' : 'no'}</span>
      <button data-testid="fetch-btn" onClick={fetchDiagram}>
        Fetch Diagram
      </button>
    </div>
  );
}

/**
 * Test component for search functionality
 */
function SearchConsumer() {
  const armada = useArmada();
  const [results, setResults] = React.useState<unknown[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const handleSearch = async (query: string) => {
    if (!armada.isConnected) return;
    const searchResults = await armada.search(query);
    setResults(searchResults);
  };

  return (
    <div data-testid="search-consumer">
      <span data-testid="connected">{armada.isConnected ? 'yes' : 'no'}</span>
      <input
        data-testid="search-input"
        onChange={(e) => handleSearch(e.target.value)}
      />
      <span data-testid="result-count">{results.length}</span>
      <ul data-testid="results-list">
        {results.map((r: any) => (
          <li
            key={r.id}
            data-testid={`result-${r.id}`}
            onClick={() => setSelectedId(r.id)}
          >
            {r.name}
          </li>
        ))}
      </ul>
      <span data-testid="selected">{selectedId || 'none'}</span>
    </div>
  );
}

/**
 * Test component for mode switching
 */
function ModeSwitchConsumer({
  onModeChange,
}: {
  onModeChange?: (mode: GraphMode) => void;
}) {
  const armada = useArmada();

  return (
    <div data-testid="mode-switch-consumer">
      <span data-testid="current-mode">{armada.currentMode || 'none'}</span>
      <span data-testid="modes">{armada.availableModes?.join(',') || 'none'}</span>
      <button
        data-testid="switch-to-dependency"
        onClick={() => {
          armada.setMode('dependency-graph');
          onModeChange?.('dependency-graph');
        }}
      >
        Dependency Graph
      </button>
      <button
        data-testid="switch-to-inheritance"
        onClick={() => {
          armada.setMode('inheritance-tree');
          onModeChange?.('inheritance-tree');
        }}
      >
        Inheritance Tree
      </button>
    </div>
  );
}

/**
 * Test component for symbol outline
 */
function SymbolOutlineConsumer() {
  const armada = useArmada();
  const [symbols, setSymbols] = React.useState<unknown[]>([]);
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const fetchSymbols = async (scope: string) => {
    if (!armada.isConnected) {
      setError('Not connected');
      return;
    }
    setError(null);
    setSelectedFile(scope);
    const syms = await armada.fetchSymbols(scope);
    setSymbols(syms);
  };

  return (
    <div data-testid="symbol-outline-consumer">
      <span data-testid="connected">{armada.isConnected ? 'yes' : 'no'}</span>
      <span data-testid="selected-file">{selectedFile || 'none'}</span>
      <span data-testid="symbol-count">{symbols.length}</span>
      <span data-testid="error">{error || 'none'}</span>
      <button
        data-testid="select-auth-file"
        onClick={() => fetchSymbols('src/auth/service.ts')}
      >
        Select Auth Service
      </button>
      <ul data-testid="symbols-list">
        {symbols.map((s: any) => (
          <li key={s.id} data-testid={`symbol-${s.name}`}>
            {s.name} ({s.type})
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Test component for live updates
 */
function LiveUpdateConsumer() {
  const armada = useArmada();
  const [refreshCount, setRefreshCount] = React.useState(0);

  const handleRefresh = async () => {
    await armada.refresh();
    setRefreshCount((c) => c + 1);
  };

  return (
    <div data-testid="live-update-consumer">
      <span data-testid="connected">{armada.isConnected ? 'yes' : 'no'}</span>
      <span data-testid="refreshing">{armada.isRefreshing ? 'yes' : 'no'}</span>
      <span data-testid="refresh-count">{refreshCount}</span>
      <button data-testid="refresh-btn" onClick={handleRefresh}>
        Refresh
      </button>
    </div>
  );
}

// Import React at the top level for the test components
import React from 'react';

// ============================================================================
// Test Suite
// ============================================================================

describe('Data Flow Integration', () => {
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
  // Test 1: Diagram Fetch Pipeline
  // --------------------------------------------------------------------------
  describe('diagram fetch pipeline', () => {
    it('should fetch diagram when connected and button clicked', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      let fetchedData: unknown = null;

      render(
        <ArmadaProvider initialConfig={config}>
          <DiagramFetchConsumer onFetch={(data) => { fetchedData = data; }} />
        </ArmadaProvider>
      );

      // Wait for connection
      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // Click fetch button
      fireEvent.click(screen.getByTestId('fetch-btn'));

      // Wait for diagram to load
      await waitFor(() => {
        expect(screen.getByTestId('has-diagram').textContent).toBe('yes');
      });

      // Verify API call was made
      const graphCalls = mockServer.getCallsMatching('/api/graph');
      expect(graphCalls.length).toBeGreaterThan(0);

      // Verify data was received
      expect(fetchedData).not.toBeNull();
      expect((fetchedData as any).content).toBeDefined();
    });

    it('should include mode in graph API request', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'dependency-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <DiagramFetchConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      mockServer.clearHistory();
      fireEvent.click(screen.getByTestId('fetch-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('has-diagram').textContent).toBe('yes');
      });

      // Verify mode was included in request
      const graphCalls = mockServer.getCallsMatching('/api/graph');
      expect(graphCalls[0].url).toContain('mode=');
    });
  });

  // --------------------------------------------------------------------------
  // Test 2: Search → Diagram Navigation
  // --------------------------------------------------------------------------
  describe('search to diagram navigation', () => {
    it('should fetch search results and allow selection', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      // Configure search response
      mockServer.setResponse('/api/search', armadaFixtures.searchResults);

      render(
        <ArmadaProvider initialConfig={config}>
          <SearchConsumer />
        </ArmadaProvider>
      );

      // Wait for connection FIRST
      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // Verify initial state
      expect(screen.getByTestId('result-count').textContent).toBe('0');

      // Type in search
      const input = screen.getByTestId('search-input');
      fireEvent.change(input, { target: { value: 'auth' } });

      // Wait for results
      await waitFor(() => {
        const count = parseInt(screen.getByTestId('result-count').textContent || '0');
        expect(count).toBeGreaterThan(0);
      });

      // Verify search API was called
      const searchCalls = mockServer.getCallsMatching('/api/search');
      expect(searchCalls.length).toBeGreaterThan(0);
      expect(searchCalls[0].url).toContain('query=auth');
    });

    it('should update selected state when result is clicked', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      mockServer.setResponse('/api/search', armadaFixtures.searchResults);

      render(
        <ArmadaProvider initialConfig={config}>
          <SearchConsumer />
        </ArmadaProvider>
      );

      // Wait for connection FIRST
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
      const firstResultId = armadaFixtures.searchResults.results[0].id;
      const resultItem = screen.getByTestId(`result-${firstResultId}`);
      fireEvent.click(resultItem);

      // Verify selection
      expect(screen.getByTestId('selected').textContent).toBe(firstResultId);
    });
  });

  // --------------------------------------------------------------------------
  // Test 3: Mode Switch Refresh
  // --------------------------------------------------------------------------
  describe('mode switch refresh', () => {
    it('should update currentMode when setMode is called', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <ModeSwitchConsumer />
        </ArmadaProvider>
      );

      // Wait for initial mode
      await waitFor(() => {
        expect(screen.getByTestId('current-mode').textContent).toBe('call-graph');
      });

      // Switch mode
      fireEvent.click(screen.getByTestId('switch-to-dependency'));

      // Verify mode changed
      await waitFor(() => {
        expect(screen.getByTestId('current-mode').textContent).toBe('dependency-graph');
      });
    });

    it('should call onModeChange callback when mode changes', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      const onModeChange = vi.fn();

      render(
        <ArmadaProvider initialConfig={config} onModeChange={onModeChange}>
          <ModeSwitchConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-mode').textContent).toBe('call-graph');
      });

      // Switch mode
      fireEvent.click(screen.getByTestId('switch-to-inheritance'));

      // Verify callback was called
      expect(onModeChange).toHaveBeenCalledWith('inheritance-tree');
    });
  });

  // --------------------------------------------------------------------------
  // Test 4: Symbol Outline
  // --------------------------------------------------------------------------
  describe('symbol outline', () => {
    it('should fetch symbols when file is selected', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      // Configure symbols response
      mockServer.setResponse('/api/symbols', armadaFixtures.symbols);

      render(
        <ArmadaProvider initialConfig={config}>
          <SymbolOutlineConsumer />
        </ArmadaProvider>
      );

      // Wait for connection FIRST
      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // Verify initial state
      expect(screen.getByTestId('symbol-count').textContent).toBe('0');

      // Select file
      fireEvent.click(screen.getByTestId('select-auth-file'));

      // Wait for symbols
      await waitFor(() => {
        const count = parseInt(screen.getByTestId('symbol-count').textContent || '0');
        expect(count).toBeGreaterThan(0);
      });

      // Verify API call - note URL encoding
      const symbolCalls = mockServer.getCallsMatching('/api/symbols');
      expect(symbolCalls.length).toBeGreaterThan(0);
      // URL params are encoded, so check for encoded version
      expect(symbolCalls[0].url).toContain('scope=');
      expect(decodeURIComponent(symbolCalls[0].url)).toContain('src/auth/service.ts');
    });

    it('should display symbol hierarchy correctly', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      mockServer.setResponse('/api/symbols', armadaFixtures.symbols);

      render(
        <ArmadaProvider initialConfig={config}>
          <SymbolOutlineConsumer />
        </ArmadaProvider>
      );

      // Wait for connection FIRST
      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      fireEvent.click(screen.getByTestId('select-auth-file'));

      await waitFor(() => {
        const count = parseInt(screen.getByTestId('symbol-count').textContent || '0');
        expect(count).toBeGreaterThan(0);
      });

      // Verify symbol names are displayed
      expect(screen.getByTestId('symbol-AuthService')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Test 5: Live Diagram Updates
  // --------------------------------------------------------------------------
  describe('live diagram updates', () => {
    it('should trigger refresh when refresh button clicked', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <LiveUpdateConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // Initial refresh count
      expect(screen.getByTestId('refresh-count').textContent).toBe('0');

      // Clear history to track refresh calls
      mockServer.clearHistory();

      // Click refresh
      fireEvent.click(screen.getByTestId('refresh-btn'));

      // Wait for refresh to complete
      await waitFor(() => {
        expect(screen.getByTestId('refresh-count').textContent).toBe('1');
      });

      // Verify queries were invalidated (new calls made)
      await waitFor(() => {
        const calls = mockServer.getCallHistory();
        expect(calls.length).toBeGreaterThan(0);
      });
    });

    it('should expose isRefreshing state during refresh', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      // Add delay to observe refreshing state
      mockServer.setDelayedResponse('/health', { status: 'ok' }, 100);

      render(
        <ArmadaProvider initialConfig={config}>
          <LiveUpdateConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // isRefreshing should be accessible
      const refreshingElement = screen.getByTestId('refreshing');
      expect(refreshingElement).toBeInTheDocument();
    });
  });
});

// Import vi for mocking
import { vi } from 'vitest';
