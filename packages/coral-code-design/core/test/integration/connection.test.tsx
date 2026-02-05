/**
 * Integration Tests: Connection Lifecycle
 *
 * Tests for Armada connection flow, disconnection, and reconnection.
 * GitHub Issue: #36
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { ArmadaProvider, useArmada, clearArmadaQueryCache } from '../../src/providers/ArmadaProvider';
import type { ArmadaConnectionConfig } from '../../src/types';
import {
  createMockArmadaServer,
  createNetworkErrorServer,
  type MockArmadaServer,
} from '../utils/mockArmadaServer';

// ============================================================================
// Test Components
// ============================================================================

/**
 * Test consumer that exposes Armada context for assertions
 */
function ConnectionTestConsumer({
  onContext,
}: {
  onContext?: (ctx: ReturnType<typeof useArmada>) => void;
}) {
  const armada = useArmada();

  // Call callback on every render
  if (onContext) {
    onContext(armada);
  }

  return (
    <div data-testid="connection-consumer">
      <span data-testid="connected">{armada.isConnected ? 'yes' : 'no'}</span>
      <span data-testid="connecting">{armada.isConnecting ? 'yes' : 'no'}</span>
      <span data-testid="error">{armada.connectionError || 'none'}</span>
      <span data-testid="mode">{armada.currentMode || 'none'}</span>
      <span data-testid="stats-nodes">{armada.stats?.nodes ?? 'none'}</span>
      <span data-testid="modes-count">{armada.availableModes?.length ?? 0}</span>
      <button
        data-testid="disconnect-btn"
        onClick={() => armada.disconnect()}
      >
        Disconnect
      </button>
    </div>
  );
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Connection Lifecycle Integration', () => {
  let mockServer: MockArmadaServer;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    // Store original fetch
    originalFetch = global.fetch;
    // Clear TanStack Query cache to ensure fresh state
    clearArmadaQueryCache();
    // Create fresh mock server for each test
    mockServer = createMockArmadaServer();
    // Install mock fetch before any rendering
    global.fetch = mockServer.fetch;
  });

  afterEach(async () => {
    // Cleanup rendered components
    cleanup();
    // Wait for any pending queries to settle
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    // Clear cache after test
    clearArmadaQueryCache();
    // Restore original fetch
    global.fetch = originalFetch;
    // Reset mock server
    mockServer.reset();
  });

  // --------------------------------------------------------------------------
  // Test 1: Connect Flow
  // --------------------------------------------------------------------------
  describe('connect flow', () => {
    it('should complete connection sequence: health -> stats -> modes -> connected', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <ConnectionTestConsumer />
        </ArmadaProvider>
      );

      // Wait for connection to complete
      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // Verify API call sequence
      const calls = mockServer.getCallHistory();
      const healthCalls = calls.filter(c => c.url.includes('/health'));
      const statsCalls = calls.filter(c => c.url.includes('/api/stats'));
      const modesCalls = calls.filter(c => c.url.includes('/api/modes'));

      expect(healthCalls.length).toBeGreaterThan(0);
      expect(statsCalls.length).toBeGreaterThan(0);
      expect(modesCalls.length).toBeGreaterThan(0);

      // Health should be called first
      const healthTime = healthCalls[0].timestamp;
      expect(statsCalls[0].timestamp).toBeGreaterThanOrEqual(healthTime);

      // Verify state is populated
      expect(screen.getByTestId('stats-nodes').textContent).not.toBe('none');
      expect(Number(screen.getByTestId('modes-count').textContent)).toBeGreaterThan(0);
    });

    it('should set currentMode from initial config', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'dependency-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <ConnectionTestConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('mode').textContent).toBe('dependency-graph');
      });
    });

    it('should populate availableModes from API', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <ConnectionTestConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        const modesCount = Number(screen.getByTestId('modes-count').textContent);
        expect(modesCount).toBe(5); // Default mock returns 5 modes
      });
    });
  });

  // --------------------------------------------------------------------------
  // Test 2: Connection Failure
  // --------------------------------------------------------------------------
  describe('connection failure', () => {
    it('should attempt health check when server is unreachable', async () => {
      // Create a new error server and install it
      const errorServer = createNetworkErrorServer();
      global.fetch = errorServer.fetch;

      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <ConnectionTestConsumer />
        </ArmadaProvider>
      );

      // Wait for render cycle - health check should be attempted
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      // Verify health check was attempted (even though it fails)
      const calls = errorServer.getCallHistory();
      expect(calls.some(c => c.url.includes('/health'))).toBe(true);
    });

    it('should attempt health check with unhealthy response', async () => {
      // Create fresh server with unhealthy response
      const unhealthyServer = createMockArmadaServer();
      unhealthyServer.setResponse('/health', { status: 'error', message: 'Database unavailable' });
      global.fetch = unhealthyServer.fetch;

      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <ConnectionTestConsumer />
        </ArmadaProvider>
      );

      // Wait for render cycle
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      // Verify health check was made
      const calls = unhealthyServer.getCallHistory();
      expect(calls.some(c => c.url.includes('/health'))).toBe(true);
    });

    it('should not fetch stats when health endpoint returns unhealthy', async () => {
      // Create fresh server with unhealthy response
      const unhealthyServer = createMockArmadaServer();
      unhealthyServer.setResponse('/health', { status: 'error' });
      global.fetch = unhealthyServer.fetch;

      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <ConnectionTestConsumer />
        </ArmadaProvider>
      );

      // Wait for health check to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      // When health returns status !== 'ok', the provider should not attempt stats
      // (Note: TanStack Query may have cached data from prior tests, but new fetch shouldn't happen)
      const calls = unhealthyServer.getCallHistory();
      const statsCalls = calls.filter(c => c.url.includes('/api/stats'));
      expect(statsCalls.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Test 3: Disconnect Flow
  // --------------------------------------------------------------------------
  describe('disconnect flow', () => {
    it('should reset connection state when disconnect is called', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <ConnectionTestConsumer />
        </ArmadaProvider>
      );

      // Wait for connection
      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('yes');
      });

      // Disconnect
      fireEvent.click(screen.getByTestId('disconnect-btn'));

      // Should be disconnected
      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('no');
      });
    });

    it('should clear mode when disconnected', async () => {
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <ConnectionTestConsumer />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('mode').textContent).toBe('call-graph');
      });

      fireEvent.click(screen.getByTestId('disconnect-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('mode').textContent).toBe('none');
      });
    });
  });

  // --------------------------------------------------------------------------
  // Test 4: Reconnection
  // --------------------------------------------------------------------------
  describe('reconnection', () => {
    it('should make health check call when connect() is invoked', async () => {
      let contextRef: ReturnType<typeof useArmada> | null = null;

      // Start without initial config (not connected)
      render(
        <ArmadaProvider>
          <ConnectionTestConsumer onContext={(ctx) => { contextRef = ctx; }} />
        </ArmadaProvider>
      );

      // Wait for initial render
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Now connect
      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      // Clear history to track only connection calls
      mockServer.clearHistory();

      // Connect
      await act(async () => {
        await contextRef!.connect(config);
      });

      // Should have made health check call
      const calls = mockServer.getCallHistory();
      expect(calls.some(c => c.url.includes('/health'))).toBe(true);
    });

    it('should invalidate queries when disconnect is called and then reconnect', async () => {
      let contextRef: ReturnType<typeof useArmada> | null = null;

      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <ConnectionTestConsumer onContext={(ctx) => { contextRef = ctx; }} />
        </ArmadaProvider>
      );

      // Wait for initial connection
      await waitFor(
        () => {
          expect(screen.getByTestId('connected').textContent).toBe('yes');
        },
        { timeout: 3000 }
      );

      // Disconnect
      fireEvent.click(screen.getByTestId('disconnect-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('no');
      });

      // Clear history to track reconnection calls
      mockServer.clearHistory();

      // Reconnect
      await act(async () => {
        await contextRef!.connect(config);
      });

      // Should have made fresh health check call
      const calls = mockServer.getCallHistory();
      expect(calls.some(c => c.url.includes('/health'))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Test 5: Mode Persistence
  // --------------------------------------------------------------------------
  describe('mode persistence', () => {
    it('should restore mode when reconnecting with same config', async () => {
      let contextRef: ReturnType<typeof useArmada> | null = null;

      const config: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'dependency-graph',
      };

      render(
        <ArmadaProvider initialConfig={config}>
          <ConnectionTestConsumer onContext={(ctx) => { contextRef = ctx; }} />
        </ArmadaProvider>
      );

      // Wait for initial connection with dependency-graph mode
      await waitFor(() => {
        expect(screen.getByTestId('mode').textContent).toBe('dependency-graph');
      });

      // Disconnect
      fireEvent.click(screen.getByTestId('disconnect-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('no');
      });

      // Reconnect with same config
      await act(async () => {
        await contextRef!.connect(config);
      });

      // Mode should be restored
      await waitFor(() => {
        expect(screen.getByTestId('mode').textContent).toBe('dependency-graph');
      });
    });

    it('should use new mode when reconnecting with different config', async () => {
      let contextRef: ReturnType<typeof useArmada> | null = null;

      const initialConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'call-graph',
      };

      render(
        <ArmadaProvider initialConfig={initialConfig}>
          <ConnectionTestConsumer onContext={(ctx) => { contextRef = ctx; }} />
        </ArmadaProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('mode').textContent).toBe('call-graph');
      });

      // Disconnect
      fireEvent.click(screen.getByTestId('disconnect-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('connected').textContent).toBe('no');
      });

      // Reconnect with different mode
      const newConfig: ArmadaConnectionConfig = {
        serverUrl: 'http://localhost:8765',
        mode: 'inheritance-tree',
      };

      await act(async () => {
        await contextRef!.connect(newConfig);
      });

      // Should have new mode
      await waitFor(() => {
        expect(screen.getByTestId('mode').textContent).toBe('inheritance-tree');
      });
    });
  });
});
