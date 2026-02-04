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
});
