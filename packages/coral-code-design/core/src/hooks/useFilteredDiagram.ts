/**
 * useFilteredDiagram Hook
 *
 * Manages filtering and focus mode for diagram nodes.
 * Issue #26: CCD-REQ-007 Filter and Focus
 */

import { useState, useCallback, useMemo } from 'react';
import type { GraphIR } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface FilterConfig {
  /** Include paths matching these globs */
  pathPatterns?: string[];
  /** Exclude paths matching these */
  excludePatterns?: string[];
  /** Only these node types */
  nodeTypes?: string[];
  /** Only nodes with these tags */
  tags?: string[];
  /** Only nodes connected to this */
  connectedTo?: string;
  /** Limit relationship depth */
  maxDepth?: number;
}

export interface FilterPreset {
  id: string;
  name: string;
  filter: FilterConfig;
}

export interface UseFilteredDiagramResult {
  /** Filtered nodes */
  filteredNodes: GraphIR['nodes'];
  /** Filtered edges (only between filtered nodes) */
  filteredEdges: GraphIR['edges'];
  /** Current filter configuration */
  filter: FilterConfig;
  /** Whether focus mode is active */
  isFocusMode: boolean;
  /** Focus node ID (if in focus mode) */
  focusNodeId: string | null;
  /** Focus depth (if in focus mode) */
  focusDepth: number;
  /** Saved filter presets */
  presets: FilterPreset[];

  // Filter operations
  setFilter: (filter: FilterConfig) => void;
  clearFilter: () => void;

  // Focus mode
  setFocusMode: (nodeId: string, depth: number) => void;
  exitFocusMode: () => void;

  // Presets
  savePreset: (name: string) => void;
  applyPreset: (presetId: string) => void;
  deletePreset: (presetId: string) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function matchGlob(pattern: string, path: string): boolean {
  // Simple glob matching - convert glob to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

function getConnectedNodeIds(
  graphIR: GraphIR,
  nodeId: string,
  depth: number
): Set<string> {
  const connected = new Set<string>([nodeId]);

  for (let d = 0; d < depth; d++) {
    const currentNodes = [...connected];
    for (const id of currentNodes) {
      for (const edge of graphIR.edges) {
        if (edge.source === id && !connected.has(edge.target)) {
          connected.add(edge.target);
        }
        if (edge.target === id && !connected.has(edge.source)) {
          connected.add(edge.source);
        }
      }
    }
  }

  return connected;
}

// ============================================================================
// Hook
// ============================================================================

export function useFilteredDiagram(graphIR: GraphIR): UseFilteredDiagramResult {
  const [filter, setFilterState] = useState<FilterConfig>({});
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusDepth, setFocusDepth] = useState(1);
  const [presets, setPresets] = useState<FilterPreset[]>([]);

  // Generate unique ID
  const generateId = useCallback(() => {
    return `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Filter nodes
  const filteredNodes = useMemo(() => {
    let nodes = [...graphIR.nodes];

    // Apply focus mode first
    if (isFocusMode && focusNodeId) {
      const connectedIds = getConnectedNodeIds(graphIR, focusNodeId, focusDepth);
      nodes = nodes.filter(node => connectedIds.has(node.id));
    }

    // Filter by node types
    if (filter.nodeTypes && filter.nodeTypes.length > 0) {
      nodes = nodes.filter(node => filter.nodeTypes!.includes(node.type || ''));
    }

    // Filter by path patterns
    if (filter.pathPatterns && filter.pathPatterns.length > 0) {
      nodes = nodes.filter(node => {
        const nodePath = (node.metadata as any)?.file || '';
        return filter.pathPatterns!.some(pattern => matchGlob(pattern, nodePath));
      });
    }

    // Filter by exclude patterns
    if (filter.excludePatterns && filter.excludePatterns.length > 0) {
      nodes = nodes.filter(node => {
        const nodePath = (node.metadata as any)?.file || '';
        return !filter.excludePatterns!.some(pattern => matchGlob(pattern, nodePath));
      });
    }

    // Filter by tags
    if (filter.tags && filter.tags.length > 0) {
      nodes = nodes.filter(node => {
        const nodeTags = (node.metadata as any)?.tags || [];
        return filter.tags!.some(tag => nodeTags.includes(tag));
      });
    }

    // Filter by connected to
    if (filter.connectedTo) {
      const depth = filter.maxDepth || 1;
      const connectedIds = getConnectedNodeIds(graphIR, filter.connectedTo, depth);
      nodes = nodes.filter(node => connectedIds.has(node.id));
    }

    return nodes;
  }, [graphIR, filter, isFocusMode, focusNodeId, focusDepth]);

  // Filter edges to only include those between filtered nodes
  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    return graphIR.edges.filter(
      edge => nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );
  }, [graphIR.edges, filteredNodes]);

  // Set filter
  const setFilter = useCallback((newFilter: FilterConfig) => {
    setFilterState(newFilter);
  }, []);

  // Clear filter
  const clearFilter = useCallback(() => {
    setFilterState({});
  }, []);

  // Focus mode
  const setFocusMode = useCallback((nodeId: string, depth: number) => {
    setIsFocusMode(true);
    setFocusNodeId(nodeId);
    setFocusDepth(depth);
  }, []);

  const exitFocusMode = useCallback(() => {
    setIsFocusMode(false);
    setFocusNodeId(null);
    setFocusDepth(1);
  }, []);

  // Presets
  const savePreset = useCallback((name: string) => {
    const preset: FilterPreset = {
      id: generateId(),
      name,
      filter: { ...filter },
    };
    setPresets(prev => [...prev, preset]);
  }, [filter, generateId]);

  const applyPreset = useCallback((presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setFilterState(preset.filter);
    }
  }, [presets]);

  const deletePreset = useCallback((presetId: string) => {
    setPresets(prev => prev.filter(p => p.id !== presetId));
  }, []);

  return useMemo(
    () => ({
      filteredNodes,
      filteredEdges,
      filter,
      isFocusMode,
      focusNodeId,
      focusDepth,
      presets,
      setFilter,
      clearFilter,
      setFocusMode,
      exitFocusMode,
      savePreset,
      applyPreset,
      deletePreset,
    }),
    [
      filteredNodes,
      filteredEdges,
      filter,
      isFocusMode,
      focusNodeId,
      focusDepth,
      presets,
      setFilter,
      clearFilter,
      setFocusMode,
      exitFocusMode,
      savePreset,
      applyPreset,
      deletePreset,
    ]
  );
}
