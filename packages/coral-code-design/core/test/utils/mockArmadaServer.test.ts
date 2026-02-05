/**
 * Unit tests for mockArmadaServer
 *
 * Tests the mock Armada server utility for integration testing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockArmadaServer,
  createEmptyGraphServer,
  createUnhealthyServer,
  createNetworkErrorServer,
} from './mockArmadaServer';

describe('mockArmadaServer', () => {
  describe('createMockArmadaServer', () => {
    it('should create a mock server with default responses', async () => {
      const server = createMockArmadaServer();

      // Health endpoint
      const healthResponse = await server.fetch('http://localhost:8765/health');
      expect(healthResponse.ok).toBe(true);
      const healthData = await healthResponse.json();
      expect(healthData.status).toBe('ok');
    });

    it('should respond to /api/stats endpoint', async () => {
      const server = createMockArmadaServer();

      const response = await server.fetch('http://localhost:8765/api/stats');
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.nodes).toBeDefined();
      expect(data.edges).toBeDefined();
    });

    it('should respond to /api/modes endpoint', async () => {
      const server = createMockArmadaServer();

      const response = await server.fetch('http://localhost:8765/api/modes');
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toContain('call-graph');
      expect(data).toContain('dependency-graph');
    });

    it('should respond to /api/graph endpoint', async () => {
      const server = createMockArmadaServer();

      const response = await server.fetch('http://localhost:8765/api/graph?mode=call-graph');
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.schemaVersion).toBeDefined();
      expect(data.content.graphIR).toBeDefined();
      expect(data.content.graphIR.nodes).toBeDefined();
      expect(data.content.graphIR.edges).toBeDefined();
    });

    it('should respond to /api/symbols endpoint', async () => {
      const server = createMockArmadaServer();

      const response = await server.fetch('http://localhost:8765/api/symbols?scope=src/auth.ts');
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should respond to /api/search endpoint', async () => {
      const server = createMockArmadaServer();

      const response = await server.fetch('http://localhost:8765/api/search?query=auth');
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.results).toBeDefined();
      expect(Array.isArray(data.results)).toBe(true);
    });

    it('should respond to /api/branches endpoint', async () => {
      const server = createMockArmadaServer();

      const response = await server.fetch('http://localhost:8765/api/branches');
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.branches).toBeDefined();
      expect(Array.isArray(data.branches)).toBe(true);
    });

    it('should return 404 for unknown endpoints', async () => {
      const server = createMockArmadaServer();

      const response = await server.fetch('http://localhost:8765/api/unknown');
      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe('setResponse', () => {
    it('should override default response for endpoint', async () => {
      const server = createMockArmadaServer();

      server.setResponse('/api/stats', { nodes: 999, edges: 1000 });

      const response = await server.fetch('http://localhost:8765/api/stats');
      const data = await response.json();
      expect(data.nodes).toBe(999);
      expect(data.edges).toBe(1000);
    });

    it('should match partial endpoint patterns', async () => {
      const server = createMockArmadaServer();

      server.setResponse('/graph', { custom: true });

      const response = await server.fetch('http://localhost:8765/api/graph?mode=call');
      const data = await response.json();
      expect(data.custom).toBe(true);
    });
  });

  describe('setError', () => {
    it('should return error response for endpoint', async () => {
      const server = createMockArmadaServer();

      server.setError('/api/stats', new Error('Service unavailable'), 503);

      await expect(server.fetch('http://localhost:8765/api/stats')).rejects.toThrow(
        'Service unavailable'
      );
    });

    it('should default to 500 status code', async () => {
      const server = createMockArmadaServer();

      server.setError('/health', new Error('Internal error'));

      await expect(server.fetch('http://localhost:8765/health')).rejects.toThrow(
        'Internal error'
      );
    });
  });

  describe('setDelayedResponse', () => {
    it('should delay response by specified milliseconds', async () => {
      const server = createMockArmadaServer();

      server.setDelayedResponse('/health', { status: 'ok' }, 100);

      const start = Date.now();
      const response = await server.fetch('http://localhost:8765/health');
      const elapsed = Date.now() - start;

      expect(response.ok).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some tolerance
    });
  });

  describe('setTimeout', () => {
    it('should throw timeout error after specified delay', async () => {
      const server = createMockArmadaServer();

      server.setTimeout('/api/graph', 50);

      await expect(server.fetch('http://localhost:8765/api/graph')).rejects.toThrow(
        /timeout/i
      );
    });
  });

  describe('call history', () => {
    let server: ReturnType<typeof createMockArmadaServer>;

    beforeEach(() => {
      server = createMockArmadaServer();
    });

    it('should record fetch calls', async () => {
      await server.fetch('http://localhost:8765/health');
      await server.fetch('http://localhost:8765/api/stats');

      const history = server.getCallHistory();
      expect(history).toHaveLength(2);
      expect(history[0].url).toContain('/health');
      expect(history[1].url).toContain('/api/stats');
    });

    it('should record request method', async () => {
      await server.fetch('http://localhost:8765/api/graph', { method: 'POST' });

      const history = server.getCallHistory();
      expect(history[0].method).toBe('POST');
    });

    it('should record request body', async () => {
      await server.fetch('http://localhost:8765/api/graph', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
      });

      const history = server.getCallHistory();
      expect(history[0].body).toEqual({ query: 'test' });
    });

    it('should filter calls by pattern', async () => {
      await server.fetch('http://localhost:8765/health');
      await server.fetch('http://localhost:8765/api/stats');
      await server.fetch('http://localhost:8765/api/graph');

      const apiCalls = server.getCallsMatching('/api/');
      expect(apiCalls).toHaveLength(2);
    });

    it('should clear history', async () => {
      await server.fetch('http://localhost:8765/health');
      server.clearHistory();

      expect(server.getCallHistory()).toHaveLength(0);
    });

    it('should reset responses and history', async () => {
      server.setResponse('/health', { status: 'custom' });
      await server.fetch('http://localhost:8765/health');

      server.reset();

      expect(server.getCallHistory()).toHaveLength(0);

      // Should use default response again
      const response = await server.fetch('http://localhost:8765/health');
      const data = await response.json();
      expect(data.status).toBe('ok');
    });
  });

  describe('waitForCalls', () => {
    it('should resolve when specified number of calls complete', async () => {
      const server = createMockArmadaServer();

      // Start waiting before making calls
      const waitPromise = server.waitForCalls(2);

      // Make calls
      server.fetch('http://localhost:8765/health');
      server.fetch('http://localhost:8765/api/stats');

      // Should resolve
      await expect(waitPromise).resolves.toBeUndefined();
    });

    it('should resolve immediately if calls already made', async () => {
      const server = createMockArmadaServer();

      await server.fetch('http://localhost:8765/health');
      await server.fetch('http://localhost:8765/api/stats');

      await expect(server.waitForCalls(2)).resolves.toBeUndefined();
    });

    it('should timeout if calls not made', async () => {
      const server = createMockArmadaServer();

      await expect(server.waitForCalls(5, 100)).rejects.toThrow(/timeout/i);
    });
  });

  describe('preset factories', () => {
    it('createEmptyGraphServer should return empty graph', async () => {
      const server = createEmptyGraphServer();

      const response = await server.fetch('http://localhost:8765/api/graph');
      const data = await response.json();

      expect(data.content.graphIR.nodes).toHaveLength(0);
      expect(data.content.graphIR.edges).toHaveLength(0);
    });

    it('createUnhealthyServer should return error status', async () => {
      const server = createUnhealthyServer();

      const response = await server.fetch('http://localhost:8765/health');
      const data = await response.json();

      expect(data.status).toBe('error');
    });

    it('createNetworkErrorServer should throw on health check', async () => {
      const server = createNetworkErrorServer();

      await expect(server.fetch('http://localhost:8765/health')).rejects.toThrow(
        /network error/i
      );
    });
  });

  describe('default config', () => {
    it('should accept custom default responses', async () => {
      const server = createMockArmadaServer({
        defaultResponses: {
          stats: { nodes: 500, edges: 1000 },
        },
      });

      const response = await server.fetch('http://localhost:8765/api/stats');
      const data = await response.json();

      expect(data.nodes).toBe(500);
      expect(data.edges).toBe(1000);
    });

    it('should apply default delay to all responses', async () => {
      const server = createMockArmadaServer({ defaultDelay: 50 });

      const start = Date.now();
      await server.fetch('http://localhost:8765/health');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });
});
