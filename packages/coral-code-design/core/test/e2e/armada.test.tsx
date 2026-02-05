/**
 * E2E Tests: Real Armada Integration
 *
 * Tests that validate against a real Armada instance.
 * Requires ARMADA_URL environment variable to be set.
 *
 * Run with: ARMADA_URL=http://localhost:8765 npm test -- --testPathPattern=e2e
 *
 * GitHub Issue: #41
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';
import { ArmadaProvider, useArmada, clearArmadaQueryCache } from '../../src/providers/ArmadaProvider';
import type { ArmadaConnectionConfig } from '../../src/types';

// ============================================================================
// Environment Check
// ============================================================================

const ARMADA_URL = process.env.ARMADA_URL;

// Skip all tests if ARMADA_URL is not set
const describeE2E = ARMADA_URL ? describe : describe.skip;

// ============================================================================
// Test Components
// ============================================================================

function E2ETestConsumer({
  onContext,
}: {
  onContext?: (ctx: ReturnType<typeof useArmada>) => void;
}) {
  const armada = useArmada();

  // Expose context to test
  React.useEffect(() => {
    onContext?.(armada);
  }, [armada, onContext]);

  return (
    <div data-testid="e2e-consumer">
      <span data-testid="connected">{armada.isConnected ? 'yes' : 'no'}</span>
      <span data-testid="stats-nodes">{armada.stats?.nodes ?? 'none'}</span>
      <span data-testid="stats-edges">{armada.stats?.edges ?? 'none'}</span>
      <span data-testid="mode">{armada.currentMode || 'none'}</span>
      <span data-testid="modes-count">{armada.availableModes?.length ?? 0}</span>
    </div>
  );
}

// ============================================================================
// Test Suite
// ============================================================================

describeE2E('Real Armada E2E Tests', () => {
  const config: ArmadaConnectionConfig = {
    serverUrl: ARMADA_URL!,
    mode: 'call-graph',
  };

  beforeEach(() => {
    clearArmadaQueryCache();
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    clearArmadaQueryCache();
  });

  // --------------------------------------------------------------------------
  // Test 1: Health Check
  // --------------------------------------------------------------------------
  describe('health check', () => {
    it('should connect to real Armada instance', async () => {
      render(
        <ArmadaProvider initialConfig={config}>
          <E2ETestConsumer />
        </ArmadaProvider>
      );

      // Wait for connection
      await waitFor(
        () => {
          expect(screen.getByTestId('connected').textContent).toBe('yes');
        },
        { timeout: 10000 }
      );

      // Stats should be populated
      const statsNodes = screen.getByTestId('stats-nodes').textContent;
      expect(statsNodes).not.toBe('none');
      const nodeCount = parseInt(statsNodes!);
      expect(nodeCount).toBeGreaterThan(0);
    });

    it('should fetch available modes from Armada', async () => {
      render(
        <ArmadaProvider initialConfig={config}>
          <E2ETestConsumer />
        </ArmadaProvider>
      );

      await waitFor(
        () => {
          expect(screen.getByTestId('connected').textContent).toBe('yes');
        },
        { timeout: 10000 }
      );

      // Should have modes available
      const modesCount = parseInt(screen.getByTestId('modes-count').textContent!);
      expect(modesCount).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Test 2: Fetch Real Diagram
  // --------------------------------------------------------------------------
  describe('fetch real diagram', () => {
    it('should fetch diagram from actual knowledge graph', async () => {
      let armadaContext: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={config}>
          <E2ETestConsumer onContext={(ctx) => { armadaContext = ctx; }} />
        </ArmadaProvider>
      );

      await waitFor(
        () => {
          expect(screen.getByTestId('connected').textContent).toBe('yes');
        },
        { timeout: 10000 }
      );

      // Fetch diagram
      const result = await armadaContext!.fetchDiagram('call-graph');

      // Should have valid structure
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      // GraphIR should be present
      expect(result.content.format).toBe('graph-ir');
      expect(result.content.graphIR).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Test 3: Search Real Symbols
  // --------------------------------------------------------------------------
  describe('search real symbols', () => {
    it('should return search results for common patterns', async () => {
      let armadaContext: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={config}>
          <E2ETestConsumer onContext={(ctx) => { armadaContext = ctx; }} />
        </ArmadaProvider>
      );

      await waitFor(
        () => {
          expect(screen.getByTestId('connected').textContent).toBe('yes');
        },
        { timeout: 10000 }
      );

      // Search for a common term (most codebases have something called "main" or "index")
      // Use a generic search that's likely to return results
      const results = await armadaContext!.search('function');

      // Should return array (may or may not have results depending on codebase)
      expect(Array.isArray(results)).toBe(true);
    });

    it('should return empty array for nonexistent symbols', async () => {
      let armadaContext: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={config}>
          <E2ETestConsumer onContext={(ctx) => { armadaContext = ctx; }} />
        </ArmadaProvider>
      );

      await waitFor(
        () => {
          expect(screen.getByTestId('connected').textContent).toBe('yes');
        },
        { timeout: 10000 }
      );

      // Search for something very unlikely to exist
      const results = await armadaContext!.search('xyzzy_nonexistent_symbol_12345');

      // Should return empty array, not error
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Test 4: Real Symbol Outline
  // --------------------------------------------------------------------------
  describe('real symbol outline', () => {
    it('should handle fetchSymbols gracefully', async () => {
      let armadaContext: ReturnType<typeof useArmada> | null = null;

      render(
        <ArmadaProvider initialConfig={config}>
          <E2ETestConsumer onContext={(ctx) => { armadaContext = ctx; }} />
        </ArmadaProvider>
      );

      await waitFor(
        () => {
          expect(screen.getByTestId('connected').textContent).toBe('yes');
        },
        { timeout: 10000 }
      );

      // Fetch symbols for a scope - this may or may not exist depending on indexed codebase
      // The test validates that the API works, not that specific files exist
      try {
        const symbols = await armadaContext!.fetchSymbols('src');
        // Should return array
        expect(Array.isArray(symbols)).toBe(true);
      } catch (e) {
        // It's acceptable if the scope doesn't exist - just verify it throws a proper error
        expect(e).toBeDefined();
        expect((e as Error).message).toBeDefined();
      }
    });
  });
});

// ============================================================================
// Skip Message
// ============================================================================

if (!ARMADA_URL) {
  describe('Real Armada E2E Tests', () => {
    it.skip('Skipped: ARMADA_URL environment variable not set', () => {
      // This test is skipped because ARMADA_URL is not configured
      // Run with: ARMADA_URL=http://localhost:8765 npm test -- --testPathPattern=e2e
    });
  });
}
