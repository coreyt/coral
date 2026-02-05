/**
 * Tests for useSymbolOutline hook
 *
 * Tests symbol outline building from Armada data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSymbolOutline, type UseSymbolOutlineOptions } from '../src/hooks/useSymbolOutline';
import type { ArmadaContextValue } from '../src/providers/ArmadaProvider';
import type { SymbolOutlineNode } from '../src/components/Navigator';
import * as ArmadaModule from '../src/providers/ArmadaProvider';
import * as WorkspaceModule from '../src/providers/WorkspaceProvider';

// Mock useArmada
vi.mock('../src/providers/ArmadaProvider', async () => {
  const actual = await vi.importActual('../src/providers/ArmadaProvider');
  return {
    ...actual,
    useArmada: vi.fn(),
  };
});

// Mock useWorkspace
vi.mock('../src/providers/WorkspaceProvider', async () => {
  const actual = await vi.importActual('../src/providers/WorkspaceProvider');
  return {
    ...actual,
    useWorkspace: vi.fn(),
  };
});

const mockUseArmada = vi.mocked(ArmadaModule.useArmada);
const mockUseWorkspace = vi.mocked(WorkspaceModule.useWorkspace);

// Mock Armada node data (using absolute paths as Armada returns)
// IMPORTANT: Mock nodes MUST use absolute paths that match the workspace root + relative path
// because useSymbolOutline normalizes paths before calling fetchSymbols.
// Example: workspace root '/home/user/project' + 'src/user.ts' = '/home/user/project/src/user.ts'
// If mock data doesn't match, filters like `mockArmadaNodes.filter(n => n.file === scope)` will fail.
const mockArmadaNodes = [
  { id: 'class:User', name: 'User', type: 'class', file: '/home/user/project/src/user.ts', startLine: 1, endLine: 50 },
  { id: 'method:User.getName', name: 'getName', type: 'method', file: '/home/user/project/src/user.ts', startLine: 10, endLine: 15, parent: 'class:User' },
  { id: 'method:User.setName', name: 'setName', type: 'method', file: '/home/user/project/src/user.ts', startLine: 17, endLine: 22, parent: 'class:User' },
  { id: 'function:validate', name: 'validate', type: 'function', file: '/home/user/project/src/utils.ts', startLine: 1, endLine: 10 },
  { id: 'interface:IUser', name: 'IUser', type: 'interface', file: '/home/user/project/src/types.ts', startLine: 1, endLine: 5 },
];

describe('useSymbolOutline', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default workspace mock
    mockUseWorkspace.mockReturnValue({
      workspace: {
        id: 'test-workspace',
        name: 'Test Workspace',
        rootPath: '/home/user/project',
        armadaConnection: { serverUrl: 'http://localhost:8765', mode: 'call-graph' },
        openDiagrams: [],
        activeLayout: { type: 'single', primary: null },
        annotations: { nodes: {}, edges: {} },
        settings: {
          defaultNotation: 'flowchart',
          defaultDiagramType: 'call-graph',
          autoRefresh: false,
          refreshInterval: 30000,
        },
      },
      isLoading: false,
      error: null,
      openWorkspace: vi.fn(),
      closeWorkspace: vi.fn(),
      updateSettings: vi.fn(),
      openDiagram: vi.fn(),
      closeDiagram: vi.fn(),
      setActiveDiagram: vi.fn(),
      saveLayout: vi.fn(),
      loadLayout: vi.fn(),
      getSavedLayouts: vi.fn(),
      deleteLayout: vi.fn(),
      getAnnotations: vi.fn(),
      saveAnnotations: vi.fn(),
    });
  });

  it('should return empty outline when not connected', () => {
    mockUseArmada.mockReturnValue({
      isConnected: false,
      isConnecting: false,
      connectionError: null,
      stats: null,
      currentMode: null,
      availableModes: [],
      setMode: vi.fn(),
      isRefreshing: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      fetchDiagram: vi.fn(),
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useSymbolOutline());

    expect(result.current.symbols).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should return loading state while fetching', async () => {
    let resolvePromise: (value: unknown) => void;
    const fetchPromise = new Promise(resolve => {
      resolvePromise = resolve;
    });

    const mockFetchSymbols = vi.fn().mockReturnValue(fetchPromise);

    mockUseArmada.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      connectionError: null,
      stats: { nodes: 100, edges: 200 },
      currentMode: 'call-graph',
      availableModes: ['call-graph'],
      setMode: vi.fn(),
      isRefreshing: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      fetchDiagram: vi.fn(),
      fetchSymbols: mockFetchSymbols,
      refresh: vi.fn(),
    } as unknown as ArmadaContextValue);

    const { result } = renderHook(() => useSymbolOutline({ scope: 'src/user.ts' }));

    // Should be loading initially
    expect(result.current.isLoading).toBe(true);

    // Resolve the promise
    resolvePromise!(mockArmadaNodes);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should build hierarchy from flat Armada nodes', async () => {
    const mockFetchSymbols = vi.fn().mockImplementation(async (scope: string) => {
      return mockArmadaNodes.filter(n => n.file === scope);
    });

    mockUseArmada.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      connectionError: null,
      stats: { nodes: 100, edges: 200 },
      currentMode: 'call-graph',
      availableModes: ['call-graph'],
      setMode: vi.fn(),
      isRefreshing: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      fetchDiagram: vi.fn(),
      fetchSymbols: mockFetchSymbols,
      refresh: vi.fn(),
    } as unknown as ArmadaContextValue);

    const { result } = renderHook(() => useSymbolOutline({ scope: 'src/user.ts' }));

    await waitFor(() => {
      expect(result.current.symbols.length).toBeGreaterThan(0);
    });

    // Should have User class at top level
    const userClass = result.current.symbols.find(s => s.name === 'User');
    expect(userClass).toBeDefined();
    expect(userClass?.type).toBe('class');

    // User class should have methods as children
    expect(userClass?.children).toHaveLength(2);
    expect(userClass?.children?.map(c => c.name)).toContain('getName');
    expect(userClass?.children?.map(c => c.name)).toContain('setName');
  });

  it('should filter symbols by file scope', async () => {
    const mockFetchSymbols = vi.fn().mockImplementation(async (scope: string) => {
      return mockArmadaNodes.filter(n => n.file === scope);
    });

    mockUseArmada.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      connectionError: null,
      stats: { nodes: 100, edges: 200 },
      currentMode: 'call-graph',
      availableModes: ['call-graph'],
      setMode: vi.fn(),
      isRefreshing: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      fetchDiagram: vi.fn(),
      fetchSymbols: mockFetchSymbols,
      refresh: vi.fn(),
    } as unknown as ArmadaContextValue);

    const { result } = renderHook(() => useSymbolOutline({ scope: 'src/utils.ts' }));

    await waitFor(() => {
      expect(result.current.symbols.length).toBeGreaterThan(0);
    });

    // Should only have validate function from utils.ts
    expect(result.current.symbols).toHaveLength(1);
    expect(result.current.symbols[0].name).toBe('validate');
    expect(result.current.symbols[0].type).toBe('function');
  });

  it('should handle error from Armada', async () => {
    const mockFetchSymbols = vi.fn().mockRejectedValue(new Error('Failed to fetch symbols'));

    mockUseArmada.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      connectionError: null,
      stats: { nodes: 100, edges: 200 },
      currentMode: 'call-graph',
      availableModes: ['call-graph'],
      setMode: vi.fn(),
      isRefreshing: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      fetchDiagram: vi.fn(),
      fetchSymbols: mockFetchSymbols,
      refresh: vi.fn(),
    } as unknown as ArmadaContextValue);

    const { result } = renderHook(() => useSymbolOutline({ scope: 'src/user.ts' }));

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to fetch symbols');
    });

    expect(result.current.symbols).toEqual([]);
  });

  it('should refresh symbols when scope changes', async () => {
    const mockFetchSymbols = vi.fn().mockImplementation(async (scope: string) => {
      // Mock returns all nodes for the requested file
      // scope will be normalized to absolute path by useSymbolOutline
      return mockArmadaNodes.filter(n => n.file === scope);
    });

    mockUseArmada.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      connectionError: null,
      stats: { nodes: 100, edges: 200 },
      currentMode: 'call-graph',
      availableModes: ['call-graph'],
      setMode: vi.fn(),
      isRefreshing: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      fetchDiagram: vi.fn(),
      fetchSymbols: mockFetchSymbols,
      refresh: vi.fn(),
    } as unknown as ArmadaContextValue);

    const { result, rerender } = renderHook(
      ({ scope }: { scope: string }) => useSymbolOutline({ scope }),
      { initialProps: { scope: 'src/user.ts' } }
    );

    await waitFor(() => {
      expect(result.current.symbols.length).toBeGreaterThan(0);
    });

    expect(result.current.symbols[0].name).toBe('User');

    // Change scope
    rerender({ scope: 'src/utils.ts' });

    await waitFor(() => {
      expect(result.current.symbols[0].name).toBe('validate');
    });
  });

  it('should provide symbol metadata for selection', async () => {
    const mockFetchSymbols = vi.fn().mockImplementation(async (scope: string) => {
      return mockArmadaNodes.filter(n => n.file === scope);
    });

    mockUseArmada.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      connectionError: null,
      stats: { nodes: 100, edges: 200 },
      currentMode: 'call-graph',
      availableModes: ['call-graph'],
      setMode: vi.fn(),
      isRefreshing: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      fetchDiagram: vi.fn(),
      fetchSymbols: mockFetchSymbols,
      refresh: vi.fn(),
    } as unknown as ArmadaContextValue);

    const { result } = renderHook(() => useSymbolOutline({ scope: 'src/user.ts' }));

    await waitFor(() => {
      expect(result.current.symbols.length).toBeGreaterThan(0);
    });

    const userClass = result.current.symbols[0];

    // Symbol should have ID for selection
    expect(userClass.symbolId).toBe('class:User');
    expect(userClass.id).toBeDefined();
  });
});
