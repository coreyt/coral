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

// Mock useArmada
vi.mock('../src/providers/ArmadaProvider', async () => {
  const actual = await vi.importActual('../src/providers/ArmadaProvider');
  return {
    ...actual,
    useArmada: vi.fn(),
  };
});

const mockUseArmada = vi.mocked(ArmadaModule.useArmada);

// Mock Armada node data
const mockArmadaNodes = [
  { id: 'class:User', name: 'User', type: 'class', file: 'src/user.ts', startLine: 1, endLine: 50 },
  { id: 'method:User.getName', name: 'getName', type: 'method', file: 'src/user.ts', startLine: 10, endLine: 15, parent: 'class:User' },
  { id: 'method:User.setName', name: 'setName', type: 'method', file: 'src/user.ts', startLine: 17, endLine: 22, parent: 'class:User' },
  { id: 'function:validate', name: 'validate', type: 'function', file: 'src/utils.ts', startLine: 1, endLine: 10 },
  { id: 'interface:IUser', name: 'IUser', type: 'interface', file: 'src/types.ts', startLine: 1, endLine: 5 },
];

describe('useSymbolOutline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const mockFetchSymbols = vi.fn().mockResolvedValue(mockArmadaNodes.filter(n => n.file === 'src/user.ts'));

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
    const mockFetchSymbols = vi.fn().mockResolvedValue(mockArmadaNodes.filter(n => n.file === 'src/user.ts'));

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
