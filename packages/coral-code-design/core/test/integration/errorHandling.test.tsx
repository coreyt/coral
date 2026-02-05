/**
 * Integration Tests: Error Handling
 *
 * Tests for error handling and graceful degradation scenarios.
 * GitHub Issue: #38
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import React from 'react';
import { ArmadaProvider, useArmada, clearArmadaQueryCache } from '../../src/providers/ArmadaProvider';
import type { ArmadaConnectionConfig } from '../../src/types';
import {
  createMockArmadaServer,
  type MockArmadaServer,
} from '../utils/mockArmadaServer';

// ============================================================================
// Test Components
// ============================================================================

/**
 * Test component for diagram fetching with error handling
 */
function DiagramErrorConsumer() {
  const armada = useArmada();
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchDiagram = async () => {
    if (!armada.isConnected) {
      setError('Not connected');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await armada.fetchDiagram('call-graph');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div data-testid="diagram-error-consumer">
      <span data-testid="connected">{armada.isConnected ? 'yes' : 'no'}</span>
      <span data-testid="loading">{isLoading ? 'yes' : 'no'}</span>
      <span data-testid="error">{error || 'none'}</span>
      <button data-testid="fetch-btn" onClick={fetchDiagram}>
        Fetch Diagram
      </button>
    </div>
  );
}

/**
 * Test component for search with error handling
 */
function SearchErrorConsumer() {
  const armada = useArmada();
  const [results, setResults] = React.useState<unknown[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [noResults, setNoResults] = React.useState(false);

  const handleSearch = async (query: string) => {
    if (!armada.isConnected) return;
    setError(null);
    setNoResults(false);
    try {
      const searchResults = await armada.search(query);
      setResults(searchResults);
      setNoResults(searchResults.length === 0);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div data-testid="search-error-consumer">
      <span data-testid="connected">{armada.isConnected ? 'yes' : 'no'}</span>
      <span data-testid="result-count">{results.length}</span>
      <span data-testid="no-results">{noResults ? 'yes' : 'no'}</span>
      <span data-testid="error">{error || 'none'}</span>
      <input
        data-testid="search-input"
        onChange={(e) => handleSearch(e.target.value)}
      />
    </div>
  );
}

/**
 * Test component for branch fetching with error handling
 */
function BranchErrorConsumer() {
  const armada = useArmada();
  const [branches, setBranches] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [fetched, setFetched] = React.useState(false);

  const fetchBranches = async () => {
    setError(null);
    try {
      const result = await armada.fetchBranches();
      setBranches(result);
      setFetched(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div data-testid="branch-error-consumer">
      <span data-testid="connected">{armada.isConnected ? 'yes' : 'no'}</span>
      <span data-testid="branch-count">{branches.length}</span>
      <span data-testid="fetched">{fetched ? 'yes' : 'no'}</span>
      <span data-testid="error">{error || 'none'}</span>
      <span data-testid="available-branches">{armada.availableBranches?.length ?? 0}</span>
      <button data-testid="fetch-branches-btn" onClick={fetchBranches}>
        Fetch Branches
      </button>
    </div>
  );
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Error Handling Integration', () => {
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
  // Test 1: Network Timeout
  // --------------------------------------------------------------------------
  describe('network timeout', () => {
    it('should display error message when fetch times out', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <DiagramErrorConsumer />
        </ArmadaProvider>
      );

      // Wait for connection
      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // Configure timeout for graph endpoint
      mockServer.setTimeout('/api/graph', 50);

      // Trigger fetch
      fireEvent.click(screen.getByTestId('fetch-btn'));

      // Wait for error
      await waitFor(
        () => {
          expect(screen.getByTestId('error').textContent).not.toBe('none');
        },
        { timeout: 3000 }
      );

      // Should display timeout-related error
      const errorText = screen.getByTestId('error').textContent;
      expect(errorText?.toLowerCase()).toContain('timeout');
    });

    it('should stop loading indicator when timeout occurs', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <DiagramErrorConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      mockServer.setTimeout('/api/graph', 50);

      fireEvent.click(screen.getByTestId('fetch-btn'));

      // Wait for error and loading to finish
      await waitFor(
        () => {
          expect(screen.getByTestId('loading').textContent).toBe('no');
          expect(screen.getByTestId('error').textContent).not.toBe('none');
        },
        { timeout: 3000 }
      );
    });
  });

  // --------------------------------------------------------------------------
  // Test 2: Invalid GraphIR
  // --------------------------------------------------------------------------
  describe('invalid GraphIR', () => {
    it('should handle malformed graph data gracefully', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      // Return invalid data structure
      mockServer.setResponse('/api/graph', {
        // Missing required fields
        invalid: true,
        notAGraph: 'this is not valid',
      });

      render(
        <ArmadaProvider initialConfig={config}>
          <DiagramErrorConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // Trigger fetch - should not crash
      fireEvent.click(screen.getByTestId('fetch-btn'));

      // Wait for fetch to complete (might error or succeed with bad data)
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('no');
      });

      // Component should still be rendered (graceful degradation)
      expect(screen.getByTestId('diagram-error-consumer')).toBeInTheDocument();
    });

    it('should handle null response gracefully', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      mockServer.setResponse('/api/graph', null);

      render(
        <ArmadaProvider initialConfig={config}>
          <DiagramErrorConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      fireEvent.click(screen.getByTestId('fetch-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('no');
      });

      // Should not crash
      expect(screen.getByTestId('diagram-error-consumer')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Test 3: Search No Results
  // --------------------------------------------------------------------------
  describe('search no results', () => {
    it('should indicate when search returns no results', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      // Configure empty search results
      mockServer.setResponse('/api/search', { results: [] });

      render(
        <ArmadaProvider initialConfig={config}>
          <SearchErrorConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // Search for something that doesn't exist
      const input = screen.getByTestId('search-input');
      fireEvent.change(input, { target: { value: 'nonexistent' } });

      // Wait for results
      await waitFor(() => {
        expect(screen.getByTestId('no-results').textContent).toBe('yes');
      });

      expect(screen.getByTestId('result-count').textContent).toBe('0');
    });

    it('should handle search API error gracefully', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      // Configure search to fail
      mockServer.setError('/api/search', new Error('Search service unavailable'), 503);

      render(
        <ArmadaProvider initialConfig={config}>
          <SearchErrorConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      const input = screen.getByTestId('search-input');
      fireEvent.change(input, { target: { value: 'test' } });

      // Wait for error
      await waitFor(() => {
        expect(screen.getByTestId('error').textContent).not.toBe('none');
      });

      // Should display error
      const errorText = screen.getByTestId('error').textContent;
      expect(errorText?.toLowerCase()).toContain('search');
    });
  });

  // --------------------------------------------------------------------------
  // Test 4: Branch API Unavailable
  // --------------------------------------------------------------------------
  describe('branch API unavailable', () => {
    it('should return empty array when branch API returns 404', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      // Configure branches endpoint to return 404 (not implemented)
      mockServer.setError('/api/branches', new Error('Not found'), 404);

      render(
        <ArmadaProvider initialConfig={config}>
          <BranchErrorConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // Fetch branches
      fireEvent.click(screen.getByTestId('fetch-branches-btn'));

      // Wait for fetch to complete
      await waitFor(() => {
        expect(screen.getByTestId('fetched').textContent).toBe('yes');
      });

      // Should return empty array gracefully (no error displayed)
      expect(screen.getByTestId('branch-count').textContent).toBe('0');
      expect(screen.getByTestId('error').textContent).toBe('none');
    });

    it('should handle branch API returning invalid data', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      // Configure branches to return invalid data
      mockServer.setResponse('/api/branches', { invalid: 'not-branches' });

      render(
        <ArmadaProvider initialConfig={config}>
          <BranchErrorConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      fireEvent.click(screen.getByTestId('fetch-branches-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('fetched').textContent).toBe('yes');
      });

      // Should handle gracefully - either empty or error, but not crash
      expect(screen.getByTestId('branch-error-consumer')).toBeInTheDocument();
    });
  });
});
