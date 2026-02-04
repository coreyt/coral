/**
 * File System Hook
 *
 * Provides file system access via File System Access API.
 * Falls back to limited functionality if API not available.
 */

import { useState, useCallback, useMemo } from 'react';
import type { FileSystemAdapter } from '@coral-code-design/core';

/**
 * Result of useFileSystem hook
 */
export interface UseFileSystemResult {
  /** Whether File System Access API is available */
  isSupported: boolean;

  /** Current directory name (null if no workspace opened) */
  directoryName: string | null;

  /** File system adapter (undefined until a directory is picked) */
  adapter: FileSystemAdapter | undefined;

  /** Open directory picker and return the directory name (or null if cancelled) */
  pickDirectory: () => Promise<string | null>;
}

/**
 * Check if File System Access API is available
 */
function hasFileSystemAccess(): boolean {
  return 'showDirectoryPicker' in window;
}

/**
 * Navigate to a nested path and return the final directory handle
 */
async function navigateToPath(
  rootHandle: FileSystemDirectoryHandle,
  path: string,
  options?: { create?: boolean }
): Promise<FileSystemDirectoryHandle> {
  const parts = path.split('/').filter(p => p && p !== '.');
  let currentHandle = rootHandle;

  for (const part of parts) {
    currentHandle = await currentHandle.getDirectoryHandle(part, options);
  }

  return currentHandle;
}

/**
 * Parse a path into directory parts and filename
 */
function parsePath(path: string): { dirParts: string[]; filename: string } {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(p => p && p !== '.');
  const filename = parts.pop() || '';
  return { dirParts: parts, filename };
}

/**
 * Create a FileSystemAdapter from a directory handle
 */
function createAdapter(rootHandle: FileSystemDirectoryHandle): FileSystemAdapter {
  return {
    async readFile(path: string): Promise<string> {
      const { dirParts, filename } = parsePath(path);

      let dirHandle = rootHandle;
      if (dirParts.length > 0) {
        dirHandle = await navigateToPath(rootHandle, dirParts.join('/'));
      }

      const fileHandle = await dirHandle.getFileHandle(filename);
      const file = await fileHandle.getFile();
      return file.text();
    },

    async writeFile(path: string, content: string): Promise<void> {
      const { dirParts, filename } = parsePath(path);

      let dirHandle = rootHandle;
      if (dirParts.length > 0) {
        // Create directories as needed
        dirHandle = await navigateToPath(rootHandle, dirParts.join('/'), { create: true });
      }

      const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    },

    async exists(path: string): Promise<boolean> {
      try {
        const { dirParts, filename } = parsePath(path);

        let dirHandle = rootHandle;
        if (dirParts.length > 0) {
          dirHandle = await navigateToPath(rootHandle, dirParts.join('/'));
        }

        // Try to get as file first
        try {
          await dirHandle.getFileHandle(filename);
          return true;
        } catch {
          // Try as directory
          try {
            await dirHandle.getDirectoryHandle(filename);
            return true;
          } catch {
            return false;
          }
        }
      } catch {
        return false;
      }
    },

    async mkdir(path: string): Promise<void> {
      await navigateToPath(rootHandle, path, { create: true });
    },

    async readDir(path: string): Promise<string[]> {
      let dirHandle = rootHandle;
      if (path && path !== '.') {
        dirHandle = await navigateToPath(rootHandle, path);
      }

      const entries: string[] = [];
      for await (const [name] of dirHandle.entries()) {
        entries.push(name);
      }
      return entries;
    },
  };
}

/**
 * Hook for file system access using File System Access API
 *
 * @returns UseFileSystemResult with adapter and directory picker
 */
export function useFileSystem(): UseFileSystemResult {
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const isSupported = useMemo(() => hasFileSystemAccess(), []);

  const pickDirectory = useCallback(async (): Promise<string | null> => {
    if (!isSupported) {
      console.warn('File System Access API not available');
      return null;
    }

    try {
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite',
      });
      setDirectoryHandle(handle);
      return handle.name;
    } catch (error) {
      // User cancelled or other error
      if (error instanceof DOMException && error.name === 'AbortError') {
        // User cancelled - not an error
        return null;
      }
      console.error('Failed to open directory:', error);
      return null;
    }
  }, [isSupported]);

  const adapter = useMemo(() => {
    if (!directoryHandle) {
      return undefined;
    }
    return createAdapter(directoryHandle);
  }, [directoryHandle]);

  return {
    isSupported,
    directoryName: directoryHandle?.name ?? null,
    adapter,
    pickDirectory,
  };
}

/**
 * Save content to a file using Save File Picker
 */
export async function saveFile(
  content: string,
  suggestedName: string,
  types?: { description: string; accept: Record<string, string[]> }[]
): Promise<void> {
  if (!('showSaveFilePicker' in window)) {
    // Fallback: download via blob URL
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const handle = await (window as any).showSaveFilePicker({
    suggestedName,
    types: types ?? [
      {
        description: 'Coral Document',
        accept: { 'application/json': ['.coral'] },
      },
    ],
  });

  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Load content from a file using Open File Picker
 */
export async function loadFile(
  types?: { description: string; accept: Record<string, string[]> }[]
): Promise<{ name: string; content: string } | null> {
  if (!('showOpenFilePicker' in window)) {
    // Fallback: use input element
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.coral,.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (file) {
          const content = await file.text();
          resolve({ name: file.name, content });
        } else {
          resolve(null);
        }
      };
      input.click();
    });
  }

  const [handle] = await (window as any).showOpenFilePicker({
    types: types ?? [
      {
        description: 'Coral Document',
        accept: { 'application/json': ['.coral', '.json'] },
      },
    ],
  });

  const file = await handle.getFile();
  const content = await file.text();
  return { name: file.name, content };
}
