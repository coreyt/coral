/**
 * Armada Connection Tests
 *
 * Tests for useArmadaConnection hook.
 * Requirement: CORAL-REQ-017 (Armada HTTP Datasource)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useArmadaConnection, type ArmadaConnectionConfig, type GraphMode } from '../src/useArmadaConnection';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Sample CoralDocument response from Armada
const sampleCoralDocument = {
  schemaVersion: "1.0.0",
  metadata: {
    name: "Call Graph",
    description: "Armada call-graph visualization",
    created: "2026-02-01T00:00:00Z",
    modified: "2026-02-01T00:00:00Z",
    tags: ["armada", "call-graph"],
  },
  content: {
    format: "graph-ir",
    graphIR: {
      nodes: [
        { id: "main", type: "function", label: "main" },
        { id: "helper", type: "function", label: "helper" },
      ],
      edges: [
        { id: "e1", source: "main", target: "helper", label: "calls" },
      ],
    },
  },
  settings: {
    notation: "code",
    layout: { algorithm: "layered", direction: "DOWN" },
  },
};

describe('useArmadaConnection', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should start disconnected with default config', () => {
      const { result } = renderHook(() => useArmadaConnection());

      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.config.serverUrl).toBe('http://localhost:8765');
      expect(result.current.config.mode).toBe('call-graph');
    });

    it('should restore config from localStorage', () => {
      localStorageMock.setItem('coral-armada-config', JSON.stringify({
        serverUrl: 'http://example.com:9000',
        mode: 'dependency-graph',
      }));

      const { result } = renderHook(() => useArmadaConnection());

      expect(result.current.config.serverUrl).toBe('http://example.com:9000');
      expect(result.current.config.mode).toBe('dependency-graph');
    });
  });

  describe('connect', () => {
    it('should connect successfully and fetch graph', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(sampleCoralDocument),
        });

      const onDocumentLoad = vi.fn();
      const { result } = renderHook(() => useArmadaConnection({ onDocumentLoad }));

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.error).toBeNull();
      expect(onDocumentLoad).toHaveBeenCalledWith(sampleCoralDocument);
    });

    it('should handle connection failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const { result } = renderHook(() => useArmadaConnection());

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.error).toContain('Connection refused');
    });

    it('should handle server error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() => useArmadaConnection());

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.error).toContain('500');
    });

    it('should persist config to localStorage on successful connect', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(sampleCoralDocument),
        });

      const { result } = renderHook(() => useArmadaConnection());

      await act(async () => {
        // Pass config directly to connect to ensure it's used
        await result.current.connect({ serverUrl: 'http://custom:8000', mode: 'full-graph' });
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'coral-armada-config',
        expect.stringContaining('http://custom:8000')
      );
    });
  });

  describe('disconnect', () => {
    it('should disconnect and clear state', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(sampleCoralDocument),
        });

      const { result } = renderHook(() => useArmadaConnection());

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.isConnected).toBe(true);

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.stats).toBeNull();
    });
  });

  describe('refresh', () => {
    it('should re-fetch graph with current mode', async () => {
      // Mock all potential fetch calls in order:
      // 1. health check
      // 2. initial graph
      // 3. stats (background)
      // 4. modes (background)
      // 5. refresh graph
      // 6. stats (background after refresh)
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'ok' }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(sampleCoralDocument) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ nodes: 10, edges: 20 }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(['call-graph']) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            ...sampleCoralDocument,
            metadata: { ...sampleCoralDocument.metadata, name: 'Refreshed Graph' },
          }),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ nodes: 10, edges: 20 }) });

      const onDocumentLoad = vi.fn();
      const { result } = renderHook(() => useArmadaConnection({ onDocumentLoad }));

      await act(async () => {
        await result.current.connect();
      });

      // Wait for isConnected to be true
      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      expect(onDocumentLoad).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.refresh();
      });

      expect(onDocumentLoad).toHaveBeenCalledTimes(2);
      expect(onDocumentLoad).toHaveBeenLastCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ name: 'Refreshed Graph' }),
        })
      );
    });
  });

  describe('mode switching', () => {
    it('should fetch new graph when mode changes while connected', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(sampleCoralDocument),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            ...sampleCoralDocument,
            metadata: { ...sampleCoralDocument.metadata, name: 'Dependency Graph' },
          }),
        });

      const onDocumentLoad = vi.fn();
      const { result } = renderHook(() => useArmadaConnection({ onDocumentLoad }));

      await act(async () => {
        await result.current.connect();
      });

      await act(async () => {
        await result.current.setModeAndFetch('dependency-graph');
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('mode=dependency-graph'),
        expect.any(Object)
      );
    });
  });

  describe('stats', () => {
    it('should fetch and store stats on connect', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(sampleCoralDocument),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ nodes: 42, edges: 100 }),
        });

      const { result } = renderHook(() => useArmadaConnection());

      await act(async () => {
        await result.current.connect();
      });

      await waitFor(() => {
        expect(result.current.stats).toEqual({ nodes: 42, edges: 100 });
      });
    });
  });

  describe('available modes', () => {
    it('should fetch available modes on connect', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(sampleCoralDocument),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ nodes: 10, edges: 20 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(['call-graph', 'dependency-graph', 'inheritance-tree']),
        });

      const { result } = renderHook(() => useArmadaConnection());

      await act(async () => {
        await result.current.connect();
      });

      await waitFor(() => {
        expect(result.current.availableModes).toContain('call-graph');
        expect(result.current.availableModes).toContain('dependency-graph');
      });
    });
  });
});
