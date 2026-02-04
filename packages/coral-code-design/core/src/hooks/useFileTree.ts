/**
 * useFileTree Hook
 *
 * Builds and manages a file tree from FileSystemAdapter.
 * Features:
 * - Lazy loading (load children on expand)
 * - Filtering (exclude node_modules, .git, etc.)
 * - Highlighting (mark files in current diagram)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { FileSystemAdapter } from '../providers/WorkspaceProvider';
import type { FileTreeNode } from '../components/Navigator';

// Default patterns to exclude
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.next',
  '.cache',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  '.DS_Store',
];

// Stable empty arrays for default values to prevent infinite loops
const EMPTY_EXCLUDE_PATTERNS: string[] = [];
const EMPTY_HIGHLIGHTED_PATHS: string[] = [];

export interface UseFileTreeOptions {
  /** Patterns to exclude (added to defaults) */
  excludePatterns?: string[];

  /** Patterns to include (if specified, only these are shown) */
  includePatterns?: string[];

  /** Paths to highlight (files in current diagram) */
  highlightedPaths?: string[];

  /** Root path to start from (default: '.') */
  rootPath?: string;
}

export interface UseFileTreeResult {
  /** The file tree */
  tree: FileTreeNode[];

  /** Whether tree is currently loading */
  isLoading: boolean;

  /** Error if loading failed */
  error: string | null;

  /** Expand a directory (loads children if needed) */
  expandDirectory: (path: string) => Promise<void>;

  /** Collapse a directory */
  collapseDirectory: (path: string) => void;

  /** Refresh the tree */
  refresh: () => Promise<void>;
}

// Extended FileTreeNode with highlighting
export interface ExtendedFileTreeNode extends FileTreeNode {
  highlighted?: boolean;
}

/**
 * Check if a name matches any pattern in the list
 */
function matchesPattern(name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Simple glob matching: * matches anything
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (regex.test(name)) return true;
    } else {
      if (name === pattern) return true;
    }
  }
  return false;
}

/**
 * Filter entries based on include/exclude patterns
 */
function filterEntries(
  entries: string[],
  excludePatterns: string[],
  includePatterns?: string[]
): string[] {
  return entries.filter(entry => {
    const name = entry.replace(/\/$/, ''); // Remove trailing slash

    // Check exclude patterns
    if (matchesPattern(name, excludePatterns)) {
      return false;
    }

    // If include patterns specified, check them
    if (includePatterns && includePatterns.length > 0) {
      // Always include directories for navigation
      if (entry.endsWith('/')) return true;
      return matchesPattern(name, includePatterns);
    }

    return true;
  });
}

/**
 * Convert directory entries to FileTreeNode array
 */
function entriesToNodes(
  entries: string[],
  basePath: string,
  highlightedPaths: Set<string>
): ExtendedFileTreeNode[] {
  return entries.map(entry => {
    const isDirectory = entry.endsWith('/');
    const name = entry.replace(/\/$/, '');
    const path = basePath ? `${basePath}/${name}` : name;

    return {
      id: path,
      name,
      path,
      type: (isDirectory ? 'directory' : 'file') as 'directory' | 'file',
      expanded: false,
      highlighted: highlightedPaths.has(path),
      children: undefined,
    };
  }).sort((a, b) => {
    // Directories first, then alphabetical
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Update a node in the tree by path
 */
function updateNodeInTree(
  tree: ExtendedFileTreeNode[],
  path: string,
  updater: (node: ExtendedFileTreeNode) => ExtendedFileTreeNode
): ExtendedFileTreeNode[] {
  return tree.map(node => {
    if (node.path === path) {
      return updater(node);
    }
    if (node.children && path.startsWith(node.path + '/')) {
      return {
        ...node,
        children: updateNodeInTree(node.children as ExtendedFileTreeNode[], path, updater),
      };
    }
    return node;
  });
}

/**
 * Apply highlighting to all nodes in the tree
 */
function applyHighlighting(
  tree: ExtendedFileTreeNode[],
  highlightedPaths: Set<string>
): ExtendedFileTreeNode[] {
  return tree.map(node => ({
    ...node,
    highlighted: highlightedPaths.has(node.path),
    children: node.children
      ? applyHighlighting(node.children as ExtendedFileTreeNode[], highlightedPaths)
      : undefined,
  }));
}

/**
 * Hook to build and manage file tree from FileSystemAdapter
 */
export function useFileTree(
  adapter: FileSystemAdapter | undefined,
  options: UseFileTreeOptions = {}
): UseFileTreeResult {
  const {
    excludePatterns = EMPTY_EXCLUDE_PATTERNS,
    includePatterns,
    highlightedPaths = EMPTY_HIGHLIGHTED_PATHS,
    rootPath = '.',
  } = options;

  const [tree, setTree] = useState<ExtendedFileTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Combine default and custom exclude patterns
  const allExcludePatterns = useMemo(
    () => [...DEFAULT_EXCLUDE_PATTERNS, ...excludePatterns],
    [excludePatterns]
  );

  // Convert highlighted paths to Set for O(1) lookup
  const highlightedPathsSet = useMemo(
    () => new Set(highlightedPaths),
    [highlightedPaths]
  );

  // Load root directory
  const loadRoot = useCallback(async () => {
    if (!adapter) {
      setTree([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const entries = await adapter.readDir(rootPath);
      const filtered = filterEntries(entries, allExcludePatterns, includePatterns);
      const nodes = entriesToNodes(filtered, '', highlightedPathsSet);
      setTree(nodes);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load directory';
      setError(message);
      setTree([]);
    } finally {
      setIsLoading(false);
    }
  }, [adapter, rootPath, allExcludePatterns, includePatterns, highlightedPathsSet]);

  // Load initial tree
  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  // Update highlighting when paths change
  useEffect(() => {
    setTree(prevTree => applyHighlighting(prevTree, highlightedPathsSet));
  }, [highlightedPathsSet]);

  // Expand a directory
  const expandDirectory = useCallback(async (path: string) => {
    if (!adapter) return;

    // Find the node
    const findNode = (nodes: ExtendedFileTreeNode[]): ExtendedFileTreeNode | undefined => {
      for (const node of nodes) {
        if (node.path === path) return node;
        if (node.children) {
          const found = findNode(node.children as ExtendedFileTreeNode[]);
          if (found) return found;
        }
      }
      return undefined;
    };

    const node = findNode(tree);
    if (!node || node.type !== 'directory') return;

    // If already loaded, just expand
    if (node.children !== undefined) {
      setTree(prevTree =>
        updateNodeInTree(prevTree, path, n => ({ ...n, expanded: true }))
      );
      return;
    }

    // Load children
    try {
      const entries = await adapter.readDir(path);
      const filtered = filterEntries(entries, allExcludePatterns, includePatterns);
      const children = entriesToNodes(filtered, path, highlightedPathsSet);

      setTree(prevTree =>
        updateNodeInTree(prevTree, path, n => ({
          ...n,
          expanded: true,
          children,
        }))
      );
    } catch (err) {
      console.error('Failed to expand directory:', err);
    }
  }, [adapter, tree, allExcludePatterns, includePatterns, highlightedPathsSet]);

  // Collapse a directory
  const collapseDirectory = useCallback((path: string) => {
    setTree(prevTree =>
      updateNodeInTree(prevTree, path, n => ({ ...n, expanded: false }))
    );
  }, []);

  // Refresh the tree
  const refresh = useCallback(async () => {
    await loadRoot();
  }, [loadRoot]);

  return {
    tree,
    isLoading,
    error,
    expandDirectory,
    collapseDirectory,
    refresh,
  };
}
