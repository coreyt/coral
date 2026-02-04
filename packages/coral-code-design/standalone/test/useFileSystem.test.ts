/**
 * Tests for useFileSystem hook
 *
 * Tests the File System Access API integration for workspace management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFileSystem, type UseFileSystemResult } from '../src/providers/useFileSystem';

// Mock FileSystemDirectoryHandle
function createMockDirectoryHandle(name: string, files: Record<string, string> = {}): FileSystemDirectoryHandle {
  const entries = new Map<string, FileSystemFileHandle | FileSystemDirectoryHandle>();

  // Add mock files
  for (const [filename, content] of Object.entries(files)) {
    entries.set(filename, createMockFileHandle(filename, content));
  }

  const handle: FileSystemDirectoryHandle = {
    kind: 'directory',
    name,
    isSameEntry: vi.fn().mockResolvedValue(false),
    queryPermission: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    getFileHandle: vi.fn().mockImplementation(async (name: string, options?: { create?: boolean }) => {
      if (entries.has(name)) {
        return entries.get(name) as FileSystemFileHandle;
      }
      if (options?.create) {
        const newHandle = createMockFileHandle(name, '');
        entries.set(name, newHandle);
        return newHandle;
      }
      throw new DOMException('File not found', 'NotFoundError');
    }),
    getDirectoryHandle: vi.fn().mockImplementation(async (name: string, options?: { create?: boolean }) => {
      if (entries.has(name)) {
        return entries.get(name) as FileSystemDirectoryHandle;
      }
      if (options?.create) {
        const newHandle = createMockDirectoryHandle(name);
        entries.set(name, newHandle);
        return newHandle;
      }
      throw new DOMException('Directory not found', 'NotFoundError');
    }),
    removeEntry: vi.fn(),
    resolve: vi.fn().mockResolvedValue(null),
    keys: vi.fn().mockImplementation(async function* () {
      for (const key of entries.keys()) {
        yield key;
      }
    }),
    values: vi.fn().mockImplementation(async function* () {
      for (const value of entries.values()) {
        yield value;
      }
    }),
    entries: vi.fn().mockImplementation(async function* () {
      for (const entry of entries.entries()) {
        yield entry;
      }
    }),
    [Symbol.asyncIterator]: async function* () {
      for (const entry of entries.entries()) {
        yield entry;
      }
    },
  } as unknown as FileSystemDirectoryHandle;

  return handle;
}

// Mock FileSystemFileHandle
function createMockFileHandle(name: string, content: string): FileSystemFileHandle {
  let currentContent = content;

  const writable = {
    write: vi.fn().mockImplementation(async (data: string) => {
      currentContent = data;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };

  // Create a mock File-like object with text() method
  const createMockFile = () => ({
    name,
    type: 'text/plain',
    size: currentContent.length,
    lastModified: Date.now(),
    text: vi.fn().mockResolvedValue(currentContent),
    arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode(currentContent).buffer),
    stream: vi.fn(),
    slice: vi.fn(),
  });

  return {
    kind: 'file',
    name,
    isSameEntry: vi.fn().mockResolvedValue(false),
    queryPermission: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    getFile: vi.fn().mockImplementation(async () => createMockFile()),
    createWritable: vi.fn().mockResolvedValue(writable),
  } as unknown as FileSystemFileHandle;
}

describe('useFileSystem', () => {
  let originalShowDirectoryPicker: typeof window.showDirectoryPicker | undefined;

  beforeEach(() => {
    originalShowDirectoryPicker = window.showDirectoryPicker;
  });

  afterEach(() => {
    if (originalShowDirectoryPicker) {
      window.showDirectoryPicker = originalShowDirectoryPicker;
    } else {
      delete (window as any).showDirectoryPicker;
    }
    vi.clearAllMocks();
  });

  describe('when File System Access API is unavailable', () => {
    beforeEach(() => {
      delete (window as any).showDirectoryPicker;
    });

    it('should return isSupported as false', () => {
      const { result } = renderHook(() => useFileSystem());
      expect(result.current.isSupported).toBe(false);
    });

    it('should return undefined adapter', () => {
      const { result } = renderHook(() => useFileSystem());
      expect(result.current.adapter).toBeUndefined();
    });

    it('should have null directoryName when no workspace opened', () => {
      const { result } = renderHook(() => useFileSystem());
      expect(result.current.directoryName).toBeNull();
    });
  });

  describe('when File System Access API is available', () => {
    let mockDirectoryHandle: FileSystemDirectoryHandle;

    beforeEach(() => {
      mockDirectoryHandle = createMockDirectoryHandle('test-workspace', {
        'test.txt': 'Hello, World!',
      });

      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockDirectoryHandle);
    });

    it('should return isSupported as true', () => {
      const { result } = renderHook(() => useFileSystem());
      expect(result.current.isSupported).toBe(true);
    });

    it('should open directory picker and store handle', async () => {
      const { result } = renderHook(() => useFileSystem());

      await act(async () => {
        const name = await result.current.pickDirectory();
        expect(name).toBe('test-workspace');
      });

      expect(result.current.directoryName).toBe('test-workspace');
      expect(window.showDirectoryPicker).toHaveBeenCalled();
    });

    it('should provide a working adapter after picking directory', async () => {
      const { result } = renderHook(() => useFileSystem());

      await act(async () => {
        await result.current.pickDirectory();
      });

      expect(result.current.adapter).toBeDefined();
    });

    it('should read files from opened directory', async () => {
      const { result } = renderHook(() => useFileSystem());

      await act(async () => {
        await result.current.pickDirectory();
      });

      const content = await result.current.adapter!.readFile('test.txt');
      expect(content).toBe('Hello, World!');
    });

    it('should write files to opened directory', async () => {
      const { result } = renderHook(() => useFileSystem());

      await act(async () => {
        await result.current.pickDirectory();
      });

      await result.current.adapter!.writeFile('new-file.txt', 'New content');

      // Verify the file was created by reading it back
      const content = await result.current.adapter!.readFile('new-file.txt');
      expect(content).toBe('New content');
    });

    it('should check if files exist', async () => {
      const { result } = renderHook(() => useFileSystem());

      await act(async () => {
        await result.current.pickDirectory();
      });

      const exists = await result.current.adapter!.exists('test.txt');
      expect(exists).toBe(true);

      const notExists = await result.current.adapter!.exists('nonexistent.txt');
      expect(notExists).toBe(false);
    });

    it('should list directory contents', async () => {
      const { result } = renderHook(() => useFileSystem());

      await act(async () => {
        await result.current.pickDirectory();
      });

      const entries = await result.current.adapter!.readDir('.');
      expect(entries).toContain('test.txt');
    });

    it('should create directories', async () => {
      const { result } = renderHook(() => useFileSystem());

      await act(async () => {
        await result.current.pickDirectory();
      });

      // Should not throw
      await result.current.adapter!.mkdir('.coral-code-design');

      // The directory should now exist
      const exists = await result.current.adapter!.exists('.coral-code-design');
      expect(exists).toBe(true);
    });

    it('should handle user cancellation gracefully', async () => {
      window.showDirectoryPicker = vi.fn().mockRejectedValue(new DOMException('User cancelled', 'AbortError'));

      const { result } = renderHook(() => useFileSystem());

      await act(async () => {
        const name = await result.current.pickDirectory();
        expect(name).toBeNull();
      });

      expect(result.current.directoryName).toBeNull();
      expect(result.current.adapter).toBeUndefined();
    });
  });

  describe('nested path handling', () => {
    let mockDirectoryHandle: FileSystemDirectoryHandle;

    beforeEach(() => {
      // Create a nested directory structure
      const subDir = createMockDirectoryHandle('subdir', {
        'nested.txt': 'Nested content',
      });

      mockDirectoryHandle = createMockDirectoryHandle('test-workspace', {
        'root.txt': 'Root content',
      });

      // Add subdir to root
      (mockDirectoryHandle.getDirectoryHandle as any).mockImplementation(async (name: string, options?: { create?: boolean }) => {
        if (name === 'subdir') return subDir;
        if (options?.create) return createMockDirectoryHandle(name);
        throw new DOMException('Directory not found', 'NotFoundError');
      });

      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockDirectoryHandle);
    });

    it('should read files from nested paths', async () => {
      const { result } = renderHook(() => useFileSystem());

      await act(async () => {
        await result.current.pickDirectory();
      });

      const content = await result.current.adapter!.readFile('subdir/nested.txt');
      expect(content).toBe('Nested content');
    });

    it('should write files to nested paths', async () => {
      const { result } = renderHook(() => useFileSystem());

      await act(async () => {
        await result.current.pickDirectory();
      });

      await result.current.adapter!.writeFile('subdir/new-nested.txt', 'New nested content');

      const content = await result.current.adapter!.readFile('subdir/new-nested.txt');
      expect(content).toBe('New nested content');
    });

    it('should create nested directories', async () => {
      const { result } = renderHook(() => useFileSystem());

      await act(async () => {
        await result.current.pickDirectory();
      });

      await result.current.adapter!.mkdir('.coral-code-design/layouts');

      // Should have called getDirectoryHandle with create: true for each level
      expect(mockDirectoryHandle.getDirectoryHandle).toHaveBeenCalledWith('.coral-code-design', { create: true });
    });
  });
});
