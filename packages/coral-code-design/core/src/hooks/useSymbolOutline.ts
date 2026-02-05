/**
 * useSymbolOutline Hook
 *
 * Fetches symbols from Armada and builds a hierarchical outline.
 * Features:
 * - Queries Armada for symbols in a given scope
 * - Builds parent-child hierarchy (classes → methods)
 * - Provides symbol metadata for selection/navigation
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useArmada, type ArmadaSymbol } from '../providers/ArmadaProvider';
import { useWorkspace } from '../providers/WorkspaceProvider';
import { normalizePath } from '../utils/pathUtils';
import type { SymbolOutlineNode } from '../components/Navigator';

export interface UseSymbolOutlineOptions {
  /** File or directory scope to query symbols for */
  scope?: string;

  /** Filter by symbol types (e.g., ['class', 'function']) */
  types?: string[];
}

export interface UseSymbolOutlineResult {
  /** The symbol outline tree */
  symbols: SymbolOutlineNode[];

  /** Whether symbols are being loaded */
  isLoading: boolean;

  /** Error if loading failed */
  error: string | null;

  /** Refresh the symbol outline */
  refresh: () => Promise<void>;
}

/**
 * Build a hierarchical symbol tree from flat Armada nodes
 */
function buildSymbolTree(nodes: ArmadaSymbol[]): SymbolOutlineNode[] {
  // Create a map of nodes by ID for quick lookup
  const nodeMap = new Map<string, ArmadaSymbol>();
  nodes.forEach(node => nodeMap.set(node.id, node));

  // Create outline nodes
  const outlineMap = new Map<string, SymbolOutlineNode>();
  const rootNodes: SymbolOutlineNode[] = [];

  // First pass: create all outline nodes
  nodes.forEach(node => {
    const outlineNode: SymbolOutlineNode = {
      id: node.id,
      name: node.name,
      type: node.type,
      symbolId: node.id,
      children: [],
    };
    outlineMap.set(node.id, outlineNode);
  });

  // Second pass: build parent-child relationships
  nodes.forEach(node => {
    const outlineNode = outlineMap.get(node.id);
    if (!outlineNode) return;

    if (node.parent && outlineMap.has(node.parent)) {
      // Add as child of parent
      const parentNode = outlineMap.get(node.parent)!;
      parentNode.children = parentNode.children || [];
      parentNode.children.push(outlineNode);
    } else {
      // No parent or parent not in scope - add to root
      rootNodes.push(outlineNode);
    }
  });

  // Sort nodes: classes/interfaces first, then functions, then alphabetically
  const sortNodes = (nodes: SymbolOutlineNode[]): SymbolOutlineNode[] => {
    return nodes.sort((a, b) => {
      const typeOrder: Record<string, number> = {
        class: 0,
        interface: 1,
        function: 2,
        method: 3,
        variable: 4,
        constant: 5,
      };
      const aOrder = typeOrder[a.type] ?? 10;
      const bOrder = typeOrder[b.type] ?? 10;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    });
  };

  // Sort root nodes and their children recursively
  const sortRecursive = (nodes: SymbolOutlineNode[]): SymbolOutlineNode[] => {
    return sortNodes(nodes).map(node => ({
      ...node,
      children: node.children ? sortRecursive(node.children) : undefined,
    }));
  };

  return sortRecursive(rootNodes);
}

/**
 * Hook to fetch and manage symbol outline from Armada
 */
export function useSymbolOutline(
  options: UseSymbolOutlineOptions = {}
): UseSymbolOutlineResult {
  const { scope, types } = options;

  const armada = useArmada();
  const workspace = useWorkspace();
  const [symbols, setSymbols] = useState<SymbolOutlineNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load symbols
  const loadSymbols = useCallback(async () => {
    if (!armada.isConnected || !scope) {
      setSymbols([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Normalize path to absolute before calling Armada API
      // Requirement: CORAL-REQ-019 - Path Normalization for Armada Integration
      const workspaceRoot = workspace.workspace?.rootPath;
      const normalizedScope = normalizePath(scope, workspaceRoot);

      let nodes = await armada.fetchSymbols(normalizedScope);

      // Filter by types if specified
      if (types && types.length > 0) {
        nodes = nodes.filter(node => types.includes(node.type));
      }

      const tree = buildSymbolTree(nodes);
      setSymbols(tree);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load symbols';
      setError(message);
      setSymbols([]);
    } finally {
      setIsLoading(false);
    }
  }, [armada, workspace.workspace?.rootPath, scope, types]);

  // Load symbols when scope changes
  useEffect(() => {
    loadSymbols();
  }, [loadSymbols]);

  // Refresh function
  const refresh = useCallback(async () => {
    await loadSymbols();
  }, [loadSymbols]);

  return {
    symbols,
    isLoading,
    error,
    refresh,
  };
}
