/**
 * Tests for useFileTree hook
 *
 * Tests file tree building, filtering, and lazy loading.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFileTree, type UseFileTreeOptions } from '../src/hooks/useFileTree';
import type { FileSystemAdapter } from '../src/providers/WorkspaceProvider';

// Mock adapter
function createMockAdapter(structure: Record<string, string[]>): FileSystemAdapter {
  return {
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readDir: vi.fn().mockImplementation(async (path: string) => {
      const normalizedPath = path === '.' ? '' : path.replace(/^\.\//, '').replace(/\/$/, '');
      return structure[normalizedPath] || [];
    }),
  };
}

describe('useFileTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty tree when no adapter provided', () => {
    const { result } = renderHook(() => useFileTree(undefined));
    expect(result.current.tree).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should build root level tree from adapter', async () => {
    const adapter = createMockAdapter({
      '': ['src/', 'package.json'],
    });

    const { result } = renderHook(() => useFileTree(adapter));

    await waitFor(() => {
      expect(result.current.tree.length).toBeGreaterThan(0);
    });

    expect(result.current.tree).toHaveLength(2);
    expect(result.current.tree[0].type).toBe('directory');
    expect(result.current.tree[0].name).toBe('src');
    expect(result.current.tree[1].type).toBe('file');
    expect(result.current.tree[1].name).toBe('package.json');
  });

  it('should not load children until expanded', async () => {
    const adapter = createMockAdapter({
      '': ['src/'],
      'src': ['index.ts'],
    });

    const { result } = renderHook(() => useFileTree(adapter));

    await waitFor(() => {
      expect(result.current.tree).toHaveLength(1);
    });

    expect(result.current.tree[0].children).toBeUndefined();
  });

  it('should load children when expanded', async () => {
    const adapter = createMockAdapter({
      '': ['src/'],
      'src': ['index.ts'],
    });

    const { result } = renderHook(() => useFileTree(adapter));

    await waitFor(() => {
      expect(result.current.tree).toHaveLength(1);
    });

    await act(async () => {
      await result.current.expandDirectory('src');
    });

    expect(result.current.tree[0].children).toHaveLength(1);
    expect(result.current.tree[0].expanded).toBe(true);
  });

  it('should collapse directory', async () => {
    const adapter = createMockAdapter({
      '': ['src/'],
      'src': ['index.ts'],
    });

    const { result } = renderHook(() => useFileTree(adapter));

    await waitFor(() => {
      expect(result.current.tree).toHaveLength(1);
    });

    await act(async () => {
      await result.current.expandDirectory('src');
    });

    act(() => {
      result.current.collapseDirectory('src');
    });

    expect(result.current.tree[0].expanded).toBe(false);
  });

  it('should exclude node_modules by default', async () => {
    const adapter = createMockAdapter({
      '': ['src/', 'node_modules/'],
    });

    const { result } = renderHook(() => useFileTree(adapter));

    await waitFor(() => {
      expect(result.current.tree.length).toBeGreaterThan(0);
    });

    const names = result.current.tree.map(n => n.name);
    expect(names).toContain('src');
    expect(names).not.toContain('node_modules');
  });

  it('should exclude .git by default', async () => {
    const adapter = createMockAdapter({
      '': ['src/', '.git/'],
    });

    const { result } = renderHook(() => useFileTree(adapter));

    await waitFor(() => {
      expect(result.current.tree.length).toBeGreaterThan(0);
    });

    const names = result.current.tree.map(n => n.name);
    expect(names).not.toContain('.git');
  });

  it('should highlight specified files', async () => {
    const adapter = createMockAdapter({
      '': ['file1.ts', 'file2.ts'],
    });

    const { result } = renderHook(() =>
      useFileTree(adapter, { highlightedPaths: ['file1.ts'] })
    );

    await waitFor(() => {
      expect(result.current.tree).toHaveLength(2);
    });

    const file1 = result.current.tree.find(n => n.name === 'file1.ts');
    const file2 = result.current.tree.find(n => n.name === 'file2.ts');

    expect(file1?.highlighted).toBe(true);
    expect(file2?.highlighted).toBeFalsy();
  });

  it('should reload tree on refresh', async () => {
    let callCount = 0;
    const adapter: FileSystemAdapter = {
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(undefined),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true),
      mkdir: vi.fn().mockResolvedValue(undefined),
      readDir: vi.fn().mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? ['file1.ts'] : ['file1.ts', 'file2.ts'];
      }),
    };

    const { result } = renderHook(() => useFileTree(adapter));

    await waitFor(() => {
      expect(result.current.tree).toHaveLength(1);
    });

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.tree).toHaveLength(2);
    });
  });
});
