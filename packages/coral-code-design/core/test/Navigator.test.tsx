/**
 * Tests for Navigator component
 *
 * Tests file tree lazy loading callbacks and symbol outline interaction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Navigator, type FileTreeNode, type SymbolOutlineNode } from '../src/components/Navigator';

describe('Navigator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('file tree lazy loading', () => {
    it('should call onDirectoryExpand when expanding a directory', async () => {
      const onDirectoryExpand = vi.fn().mockResolvedValue(undefined);
      const fileTree: FileTreeNode[] = [
        {
          id: 'src',
          name: 'src',
          path: 'src',
          type: 'directory',
          expanded: false,
        },
      ];

      render(
        <Navigator
          fileTree={fileTree}
          onDirectoryExpand={onDirectoryExpand}
        />
      );

      // Click the Files tab to ensure it's active
      fireEvent.click(screen.getByText('Files'));

      // Click the directory to expand
      fireEvent.click(screen.getByText('src'));

      expect(onDirectoryExpand).toHaveBeenCalledWith('src');
    });

    it('should call onDirectoryCollapse when collapsing a directory', () => {
      const onDirectoryCollapse = vi.fn();
      const fileTree: FileTreeNode[] = [
        {
          id: 'src',
          name: 'src',
          path: 'src',
          type: 'directory',
          expanded: true,
          children: [
            {
              id: 'src/index.ts',
              name: 'index.ts',
              path: 'src/index.ts',
              type: 'file',
            },
          ],
        },
      ];

      render(
        <Navigator
          fileTree={fileTree}
          onDirectoryCollapse={onDirectoryCollapse}
        />
      );

      // Click the Files tab to ensure it's active
      fireEvent.click(screen.getByText('Files'));

      // Click the expanded directory to collapse
      fireEvent.click(screen.getByText('src'));

      expect(onDirectoryCollapse).toHaveBeenCalledWith('src');
    });

    it('should show children when directory is expanded', () => {
      const fileTree: FileTreeNode[] = [
        {
          id: 'src',
          name: 'src',
          path: 'src',
          type: 'directory',
          expanded: true,
          children: [
            {
              id: 'src/index.ts',
              name: 'index.ts',
              path: 'src/index.ts',
              type: 'file',
            },
          ],
        },
      ];

      render(<Navigator fileTree={fileTree} />);

      fireEvent.click(screen.getByText('Files'));

      expect(screen.getByText('src')).toBeInTheDocument();
      expect(screen.getByText('index.ts')).toBeInTheDocument();
    });

    it('should not show children when directory is collapsed', () => {
      const fileTree: FileTreeNode[] = [
        {
          id: 'src',
          name: 'src',
          path: 'src',
          type: 'directory',
          expanded: false,
          children: [
            {
              id: 'src/index.ts',
              name: 'index.ts',
              path: 'src/index.ts',
              type: 'file',
            },
          ],
        },
      ];

      render(<Navigator fileTree={fileTree} />);

      fireEvent.click(screen.getByText('Files'));

      expect(screen.getByText('src')).toBeInTheDocument();
      expect(screen.queryByText('index.ts')).not.toBeInTheDocument();
    });

    it('should call onFileSelect when clicking a file', () => {
      const onFileSelect = vi.fn();
      const fileTree: FileTreeNode[] = [
        {
          id: 'file.ts',
          name: 'file.ts',
          path: 'file.ts',
          type: 'file',
        },
      ];

      render(
        <Navigator
          fileTree={fileTree}
          onFileSelect={onFileSelect}
        />
      );

      fireEvent.click(screen.getByText('Files'));
      fireEvent.click(screen.getByText('file.ts'));

      expect(onFileSelect).toHaveBeenCalledWith('file.ts');
    });

    it('should show loading indicator when directory is loading', () => {
      const fileTree: FileTreeNode[] = [
        {
          id: 'src',
          name: 'src',
          path: 'src',
          type: 'directory',
          expanded: false,
          loading: true,
        },
      ];

      render(<Navigator fileTree={fileTree} />);

      fireEvent.click(screen.getByText('Files'));

      // Look for loading indicator (spinner or text)
      expect(screen.getByTestId('directory-loading-src')).toBeInTheDocument();
    });
  });

  describe('symbol outline', () => {
    it('should call onSymbolSelect when clicking a symbol', () => {
      const onSymbolSelect = vi.fn();
      const symbols: SymbolOutlineNode[] = [
        {
          id: 'MyClass',
          name: 'MyClass',
          type: 'class',
          symbolId: 'MyClass',
        },
      ];

      render(
        <Navigator
          symbols={symbols}
          onSymbolSelect={onSymbolSelect}
        />
      );

      // Switch to Outline tab
      fireEvent.click(screen.getByText('Outline'));

      // Click the symbol
      fireEvent.click(screen.getByText('MyClass'));

      expect(onSymbolSelect).toHaveBeenCalledWith('MyClass');
    });
  });

  describe('tabs', () => {
    it('should show Files tab by default', () => {
      const fileTree: FileTreeNode[] = [
        { id: 'file.ts', name: 'file.ts', path: 'file.ts', type: 'file' },
      ];

      render(<Navigator fileTree={fileTree} />);

      // Files tab should be active and file should be visible
      expect(screen.getByText('file.ts')).toBeInTheDocument();
    });

    it('should switch to Outline tab', () => {
      const fileTree: FileTreeNode[] = [
        { id: 'file.ts', name: 'file.ts', path: 'file.ts', type: 'file' },
      ];
      const symbols: SymbolOutlineNode[] = [
        { id: 'func', name: 'myFunction', type: 'function', symbolId: 'func' },
      ];

      render(<Navigator fileTree={fileTree} symbols={symbols} />);

      // Click Outline tab
      fireEvent.click(screen.getByText('Outline'));

      // File should not be visible, symbol should be
      expect(screen.queryByText('file.ts')).not.toBeInTheDocument();
      expect(screen.getByText('myFunction')).toBeInTheDocument();
    });

    it('should show Orphaned tab when orphanedCount > 0', () => {
      render(<Navigator orphanedCount={5} />);

      expect(screen.getByText(/Orphaned \(5\)/)).toBeInTheDocument();
    });
  });
});
