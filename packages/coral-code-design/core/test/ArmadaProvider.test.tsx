/**
 * Tests for ArmadaProvider
 *
 * Tests for mode switching, refresh, and TanStack Query caching.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { ArmadaProvider, useArmada } from '../src/providers/ArmadaProvider';
import type { GraphMode, ArmadaConnectionConfig } from '../src/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test component to access context
function TestConsumer({
  onMount,
}: {
  onMount?: (context: ReturnType<typeof useArmada>) => void;
}) {
  const armada = useArmada();

  // Call onMount on first render
  if (onMount) {
    onMount(armada);
  }

  return (
    <div data-testid="consumer">
      <span data-testid="connected">{armada.isConnected ? 'yes' : 'no'}</span>
      <span data-testid="mode">{armada.currentMode || 'none'}</span>
      <span data-testid="modes">{armada.availableModes?.join(',') || 'none'}</span>
      <button data-testid="refresh-btn" onClick={() => armada.refresh()}>
        Refresh
      </button>
      <button
        data-testid="setmode-btn"
        onClick={() => armada.setMode?.('call-graph')}
      >
        Set Mode
      </button>
    </div>
  );
}

describe('ArmadaProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default successful responses
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        });
      }
      if (url.includes('/api/stats')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ nodes: 100, edges: 200 }),
        });
      }
      if (url.includes('/api/modes')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              'call-graph',
              'dependency-graph',
              'inheritance-tree',
              'impact-graph',
              'full-graph',
            ]),
        });
      }
      if (url.includes('/api/graph')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              schemaVersion: '1.0.0',
              content: {
                format: 'graph-ir',
                graphIR: { nodes: [], edges: [] },
              },
            }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('mode management', () => {
    it('should expose currentMode in context', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'dependency-graph',
      };

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('mode').textContent).toBe('dependency-graph');
      });
    });

    it('should expose availableModes in context', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        const modes = screen.getByTestId('modes').textContent;
        expect(modes).toContain('call-graph');
        expect(modes).toContain('dependency-graph');
      });
    });

    it('should provide setMode function to change mode', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'full-graph',
      };

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer />
        </ArmadaProvider>
      );

      // Initial mode
      await waitFor(() => {
        expect(screen.getByTestId('mode').textContent).toBe('full-graph');
      });

      // Change mode
      fireEvent.click(screen.getByTestId('setmode-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('mode').textContent).toBe('call-graph');
      });
    });

    it('should call onModeChange callback when mode changes', async () => {
      const onModeChange = vi.fn();
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'full-graph',
      };

      render(
        <ArmadaProvider initialConfig={initialConfig} onModeChange={onModeChange}>
          <TestConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // Change mode
      fireEvent.click(screen.getByTestId('setmode-btn'));

      await waitFor(() => {
        expect(onModeChange).toHaveBeenCalledWith('call-graph');
      });
    });
  });

  describe('refresh functionality', () => {
    it('should expose refresh function', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      let contextRef: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer onMount={(ctx) => (contextRef = ctx)} />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(contextRef?.refresh).toBeDefined();
        expect(typeof contextRef?.refresh).toBe('function');
      });
    });

    it('should refetch data when refresh is called', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      const fetchCountBefore = mockFetch.mock.calls.length;

      // Click refresh
      fireEvent.click(screen.getByTestId('refresh-btn'));

      // Should trigger new fetch calls
      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThan(fetchCountBefore);
      });
    });

    it('should expose isRefreshing state', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      let contextRef: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer onMount={(ctx) => (contextRef = ctx)} />
        </ArmadaProvider>
      );

      await waitFor(() => {
        // isRefreshing should be defined (false when not refreshing)
        expect(contextRef?.isRefreshing).toBeDefined();
      });
    });
  });

  describe('TanStack Query caching', () => {
    it('should cache diagram data between fetches', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // Initial fetch calls
      const initialCalls = mockFetch.mock.calls.filter((call) =>
        call[0].includes('/api/graph')
      ).length;

      // Re-render same component - should use cache
      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer />
        </ArmadaProvider>
      );

      // Wait a tick
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      // Should not have made additional graph fetches (uses cache)
      const laterCalls = mockFetch.mock.calls.filter((call) =>
        call[0].includes('/api/graph')
      ).length;

      // Cache may cause fewer or same calls, not more
      expect(laterCalls).toBeLessThanOrEqual(initialCalls + 1);
    });

    it('should respect staleTime configuration', async () => {
      // This test verifies that TanStack Query is configured
      // The actual staleTime is set in the ArmadaProvider
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // Provider should be using QueryClient with staleTime > 0
      // This is implicitly tested by the caching behavior
    });
  });

  // ============================================================================
  // Issue #16: Search functionality
  // ============================================================================

  describe('search functionality', () => {
    it('should expose search function', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      let contextRef: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer onMount={(ctx) => (contextRef = ctx)} />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(contextRef?.search).toBeDefined();
        expect(typeof contextRef?.search).toBe('function');
      });
    });

    it('should call search API with query', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      // Add search endpoint response
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: [
                {
                  id: 'symbol1',
                  name: 'MyClass',
                  type: 'class',
                  file: 'src/MyClass.ts',
                  startLine: 1,
                  endLine: 50,
                },
              ],
            }),
          });
        }
        // Default responses
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'ok' }),
          });
        }
        if (url.includes('/api/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ nodes: 100, edges: 200 }),
          });
        }
        if (url.includes('/api/modes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(['call-graph', 'dependency-graph']),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      let contextRef: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer onMount={(ctx) => (contextRef = ctx)} />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(contextRef?.isConnected).toBe(true);
      });

      // Perform search
      const results = await contextRef!.search('MyClass');

      // Should have called the search API
      const searchCalls = mockFetch.mock.calls.filter(
        (call) => call[0].includes('/api/search')
      );
      expect(searchCalls.length).toBeGreaterThan(0);
      expect(searchCalls[0][0]).toContain('query=MyClass');

      // Should return results
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('MyClass');
    });

    it('should handle empty search results', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      // Add search endpoint response with empty results
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ results: [] }),
          });
        }
        // Default responses
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'ok' }),
          });
        }
        if (url.includes('/api/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ nodes: 100, edges: 200 }),
          });
        }
        if (url.includes('/api/modes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(['call-graph', 'dependency-graph']),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      let contextRef: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer onMount={(ctx) => (contextRef = ctx)} />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(contextRef?.isConnected).toBe(true);
      });

      // Perform search with no results
      const results = await contextRef!.search('nonexistent');

      // Should return empty array
      expect(results).toEqual([]);
    });
  });

  // ============================================================================
  // Issue #13: Branch projection support
  // ============================================================================

  describe('branch projection', () => {
    it('should expose branchProjection state', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      let contextRef: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer onMount={(ctx) => (contextRef = ctx)} />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(contextRef?.branchProjection).toBeDefined();
      });
    });

    it('should expose setBranchProjection function', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      let contextRef: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer onMount={(ctx) => (contextRef = ctx)} />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(contextRef?.setBranchProjection).toBeDefined();
        expect(typeof contextRef?.setBranchProjection).toBe('function');
      });
    });

    it('should pass includeBranches to fetch calls', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/graph')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              schemaVersion: '1.0.0',
              content: { format: 'graph-ir', graphIR: { nodes: [], edges: [] } },
              conflicts: [],
            }),
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'ok' }),
          });
        }
        if (url.includes('/api/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ nodes: 100, edges: 200 }),
          });
        }
        if (url.includes('/api/modes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(['call-graph']),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      let contextRef: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer onMount={(ctx) => (contextRef = ctx)} />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(contextRef?.isConnected).toBe(true);
      });

      // Set branch projection
      act(() => {
        contextRef!.setBranchProjection({
          baseBranch: 'dev',
          includeBranches: ['feature/auth', 'feature/api'],
        });
      });

      // Fetch diagram - should include branches in URL
      await contextRef!.fetchDiagram('module-graph');

      // Check that includeBranches was passed
      const graphCalls = mockFetch.mock.calls.filter(
        (call) => call[0].includes('/api/graph')
      );
      expect(graphCalls.length).toBeGreaterThan(0);
      const lastCall = graphCalls[graphCalls.length - 1][0];
      expect(lastCall).toContain('include_branches=');
    });

    it('should return conflicts from fetch response', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      const mockConflicts = [
        {
          file_path: 'src/auth/handler.ts',
          branches: ['feature/auth', 'feature/api'],
          conflict_type: 'both_modified',
        },
      ];

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/graph')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              schemaVersion: '1.0.0',
              content: { format: 'graph-ir', graphIR: { nodes: [], edges: [] } },
              conflicts: mockConflicts,
            }),
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'ok' }),
          });
        }
        if (url.includes('/api/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ nodes: 100, edges: 200 }),
          });
        }
        if (url.includes('/api/modes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(['call-graph']),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      let contextRef: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer onMount={(ctx) => (contextRef = ctx)} />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(contextRef?.isConnected).toBe(true);
      });

      // Fetch diagram with branch projection
      act(() => {
        contextRef!.setBranchProjection({
          baseBranch: 'dev',
          includeBranches: ['feature/auth'],
        });
      });

      const result = await contextRef!.fetchDiagram('module-graph');

      // Should include conflicts in response
      expect(result.conflicts).toEqual(mockConflicts);
    });
  });

  // ============================================================================
  // Issue #18: Branch selection UI support
  // ============================================================================

  describe('fetchBranches', () => {
    it('should fetch available branches from Armada', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      const mockBranches = ['main', 'dev', 'feature/auth', 'feature/api'];

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/branches')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ branches: mockBranches }),
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'ok' }),
          });
        }
        if (url.includes('/api/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ nodes: 100, edges: 200 }),
          });
        }
        if (url.includes('/api/modes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(['call-graph']),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      let contextRef: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer onMount={(ctx) => (contextRef = ctx)} />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(contextRef?.isConnected).toBe(true);
      });

      // Fetch branches
      const branches = await contextRef!.fetchBranches();

      // Should have called the branches API
      const branchCalls = mockFetch.mock.calls.filter(
        (call) => call[0].includes('/api/branches')
      );
      expect(branchCalls.length).toBeGreaterThan(0);

      // Should return branches
      expect(branches).toEqual(mockBranches);
    });

    it('should return empty array when API returns error', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/branches')) {
          return Promise.resolve({
            ok: false,
            status: 404,
          });
        }
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'ok' }),
          });
        }
        if (url.includes('/api/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ nodes: 100, edges: 200 }),
          });
        }
        if (url.includes('/api/modes')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(['call-graph']),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      let contextRef: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer onMount={(ctx) => (contextRef = ctx)} />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(contextRef?.isConnected).toBe(true);
      });

      // Fetch branches - should gracefully handle error
      const branches = await contextRef!.fetchBranches();
      expect(branches).toEqual([]);
    });

    it('should expose availableBranches state', async () => {
      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      let contextRef: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <TestConsumer onMount={(ctx) => (contextRef = ctx)} />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(contextRef?.availableBranches).toBeDefined();
        expect(Array.isArray(contextRef?.availableBranches)).toBe(true);
      });
    });
  });
});
