/**
 * File System Hook
 *
 * Provides file system access via File System Access API.
 * Falls back to limited functionality if API not available.
 */

import { useMemo } from 'react';
import type { FileSystemAdapter } from '@coral-code-design/core';

/**
 * Check if File System Access API is available
 */
function hasFileSystemAccess(): boolean {
  return 'showDirectoryPicker' in window;
}

/**
 * Create a file system adapter using File System Access API
 */
export function useFileSystem(): FileSystemAdapter | undefined {
  return useMemo(() => {
    if (!hasFileSystemAccess()) {
      console.warn('File System Access API not available. File operations will be limited.');
      return undefined;
    }

    // Note: This is a simplified implementation.
    // A full implementation would need to store directory handles
    // and provide proper file/directory access.

    const adapter: FileSystemAdapter = {
      async readFile(path: string): Promise<string> {
        // In a real implementation, we'd use stored directory handles
        // For now, throw an error indicating the limitation
        throw new Error(
          `Direct file reading not implemented. ` +
          `Use file picker to access files. Path: ${path}`
        );
      },

      async writeFile(path: string, content: string): Promise<void> {
        // Would need directory handle to write
        throw new Error(
          `Direct file writing not implemented. ` +
          `Use save dialog to write files. Path: ${path}`
        );
      },

      async exists(path: string): Promise<boolean> {
        // Can't check existence without directory handle
        return false;
      },

      async mkdir(path: string): Promise<void> {
        // Would need directory handle
        console.warn(`mkdir not implemented: ${path}`);
      },

      async readDir(path: string): Promise<string[]> {
        // Would need directory handle
        return [];
      },
    };

    return adapter;
  }, []);
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
