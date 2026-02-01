/**
 * useDiagramState Hook (CORAL-REQ-013)
 *
 * Manages diagram state with separated parse, render, and layout operations.
 * Preserves node positions across DSL changes and supports undo/redo.
 */

import { useState, useCallback, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { Position, PositionSource, DiffableGraph } from '../types.js';
import { diffGraphs, resolvePositions, incrementalLayout } from './positionStability.js';

/**
 * Parsed graph from DSL - minimal structure for diffing
 */
export interface ParsedGraph {
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    width?: number;
    height?: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
  }>;
}

/**
 * Node data for React Flow
 */
export interface DiagramNodeData {
  label: string;
  nodeType: string;
  [key: string]: unknown;
}

/**
 * React Flow node with diagram data
 */
export type DiagramNode = Node<DiagramNodeData>;

/**
 * React Flow edge
 */
export type DiagramEdge = Edge;

/**
 * Position history entry for undo/redo
 */
interface PositionHistoryEntry {
  positions: Map<string, Position>;
  timestamp: number;
}

/**
 * Default node dimensions
 */
const DEFAULT_NODE_WIDTH = 150;
const DEFAULT_NODE_HEIGHT = 50;

/**
 * useDiagramState options
 */
export interface UseDiagramStateOptions {
  /** Maximum history entries to keep */
  maxHistory?: number;
  /** Layout direction */
  direction?: 'DOWN' | 'UP' | 'LEFT' | 'RIGHT';
  /** Node spacing */
  spacing?: number;
}

/**
 * useDiagramState return type
 */
export interface UseDiagramStateResult {
  /** Current React Flow nodes */
  nodes: DiagramNode[];
  /** Current React Flow edges */
  edges: DiagramEdge[];
  /** Loading state during layout operations */
  isLoading: boolean;

  /** Update the graph from parsed DSL */
  setGraph: (graph: ParsedGraph) => Promise<void>;
  /** Handle node drag - updates position */
  onNodeDrag: (nodeId: string, position: Position) => void;
  /** Handle drag end - saves snapshot for undo */
  onDragEnd: () => void;
  /** Run full ELK layout */
  reflow: () => Promise<void>;
  /** Set node positions directly (e.g., from loaded document) */
  setNodePositions: (positions: Map<string, Position>, source: PositionSource) => void;

  /** Get position source for a node */
  getPositionSource: (nodeId: string) => PositionSource | undefined;

  /** Undo last position change */
  undo: () => void;
  /** Redo last undone change */
  redo: () => void;
  /** Can undo? */
  canUndo: boolean;
  /** Can redo? */
  canRedo: boolean;
}

/**
 * Hook for managing diagram state with position stability.
 *
 * Separates parse, render, and layout operations to prevent undo/redo
 * positions from being overwritten by automatic layout.
 */
export function useDiagramState(options: UseDiagramStateOptions = {}): UseDiagramStateResult {
  const { maxHistory = 50, direction = 'DOWN', spacing = 50 } = options;

  // React Flow state
  const [nodes, setNodes] = useState<DiagramNode[]>([]);
  const [edges, setEdges] = useState<DiagramEdge[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Position source tracking
  const positionSourcesRef = useRef<Map<string, PositionSource>>(new Map());

  // Previous graph for diffing
  const previousGraphRef = useRef<DiffableGraph>({ nodes: [], edges: [] });

  // Current positions (for diffing and incremental layout)
  const currentPositionsRef = useRef<Map<string, Position>>(new Map());

  // Undo/redo history
  const undoStackRef = useRef<PositionHistoryEntry[]>([]);
  const redoStackRef = useRef<PositionHistoryEntry[]>([]);

  // Track if we're in the middle of a drag
  const isDraggingRef = useRef(false);
  const dragStartPositionsRef = useRef<Map<string, Position>>(new Map());

  // Get current positions from nodes
  const getCurrentPositions = useCallback((): Map<string, Position> => {
    const positions = new Map<string, Position>();
    for (const node of nodes) {
      positions.set(node.id, { ...node.position });
    }
    return positions;
  }, [nodes]);

  // Save snapshot to undo stack
  const saveSnapshot = useCallback((positions: Map<string, Position>) => {
    undoStackRef.current.push({
      positions: new Map(positions),
      timestamp: Date.now(),
    });

    // Trim history if too long
    if (undoStackRef.current.length > maxHistory) {
      undoStackRef.current.shift();
    }

    // Clear redo stack on new action
    redoStackRef.current = [];
  }, [maxHistory]);

  // Update nodes with new positions (without triggering layout)
  const applyPositions = useCallback((positions: Map<string, Position>) => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const pos = positions.get(node.id);
        return pos ? { ...node, position: pos } : node;
      })
    );

    // Update current positions ref
    for (const [id, pos] of positions) {
      currentPositionsRef.current.set(id, pos);
    }
  }, []);

  // Set graph from parsed DSL
  const setGraph = useCallback(async (graph: ParsedGraph) => {
    setIsLoading(true);

    try {
      const newDiffableGraph: DiffableGraph = {
        nodes: graph.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          label: n.label,
        })),
        edges: graph.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
        })),
      };

      // Resolve positions based on diff
      const resolution = resolvePositions(
        previousGraphRef.current,
        newDiffableGraph,
        currentPositionsRef.current
      );

      // If there are nodes that need layout, run incremental layout
      let finalPositions: Map<string, Position>;

      if (resolution.needsLayout.length > 0) {
        const nodeInfos = graph.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          label: n.label,
          width: n.width || DEFAULT_NODE_WIDTH,
          height: n.height || DEFAULT_NODE_HEIGHT,
        }));

        finalPositions = await incrementalLayout(
          nodeInfos,
          graph.edges,
          resolution.positions,
          resolution.needsLayout,
          { direction, spacing }
        );

        // Mark new nodes as elk-computed
        for (const id of resolution.needsLayout) {
          positionSourcesRef.current.set(id, 'elk-computed');
        }
      } else {
        finalPositions = resolution.positions;
      }

      // Build React Flow nodes
      const newNodes: DiagramNode[] = graph.nodes.map((n) => {
        const pos = finalPositions.get(n.id) || { x: 0, y: 0 };
        return {
          id: n.id,
          type: 'default',
          position: pos,
          data: {
            label: n.label,
            nodeType: n.type,
          },
        };
      });

      // Build React Flow edges
      const newEdges: DiagramEdge[] = graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
      }));

      // Update state
      setNodes(newNodes);
      setEdges(newEdges);

      // Update refs
      previousGraphRef.current = newDiffableGraph;
      currentPositionsRef.current = finalPositions;

      // Clean up position sources for removed nodes
      const currentNodeIds = new Set(graph.nodes.map((n) => n.id));
      for (const id of positionSourcesRef.current.keys()) {
        if (!currentNodeIds.has(id)) {
          positionSourcesRef.current.delete(id);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [direction, spacing]);

  // Handle node drag
  const onNodeDrag = useCallback((nodeId: string, position: Position) => {
    // Save start positions on first drag event
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      dragStartPositionsRef.current = getCurrentPositions();
    }

    // Update position in state
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === nodeId ? { ...node, position } : node
      )
    );

    // Update position source
    positionSourcesRef.current.set(nodeId, 'user-dragged');
    currentPositionsRef.current.set(nodeId, position);
  }, [getCurrentPositions]);

  // Handle drag end
  const onDragEnd = useCallback(() => {
    if (isDraggingRef.current) {
      // Save snapshot of positions before drag for undo
      saveSnapshot(dragStartPositionsRef.current);
      isDraggingRef.current = false;
      dragStartPositionsRef.current = new Map();
    }
  }, [saveSnapshot]);

  // Run full ELK layout
  const reflow = useCallback(async () => {
    if (nodes.length === 0) return;

    setIsLoading(true);

    try {
      // Save current positions for undo
      saveSnapshot(getCurrentPositions());

      // Run full layout (all nodes need layout)
      const nodeInfos = nodes.map((n) => ({
        id: n.id,
        type: n.data.nodeType,
        label: n.data.label,
        width: (n.measured?.width || n.width || DEFAULT_NODE_WIDTH) as number,
        height: (n.measured?.height || n.height || DEFAULT_NODE_HEIGHT) as number,
      }));

      const edgeInfos = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      }));

      const allNodeIds = nodes.map((n) => n.id);

      const newPositions = await incrementalLayout(
        nodeInfos,
        edgeInfos,
        new Map(), // No pinned positions - full layout
        allNodeIds, // All nodes need layout
        { direction, spacing }
      );

      // Update nodes with new positions
      applyPositions(newPositions);

      // Mark all as elk-computed
      for (const id of allNodeIds) {
        positionSourcesRef.current.set(id, 'elk-computed');
      }
    } finally {
      setIsLoading(false);
    }
  }, [nodes, edges, direction, spacing, saveSnapshot, getCurrentPositions, applyPositions]);

  // Set node positions directly (e.g., from loaded document)
  const setNodePositions = useCallback((positions: Map<string, Position>, source: PositionSource) => {
    applyPositions(positions);

    for (const id of positions.keys()) {
      positionSourcesRef.current.set(id, source);
    }
  }, [applyPositions]);

  // Get position source
  const getPositionSource = useCallback((nodeId: string): PositionSource | undefined => {
    return positionSourcesRef.current.get(nodeId);
  }, []);

  // Undo
  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;

    // Save current positions to redo stack
    redoStackRef.current.push({
      positions: getCurrentPositions(),
      timestamp: Date.now(),
    });

    // Apply undo positions (without triggering layout)
    applyPositions(entry.positions);
  }, [getCurrentPositions, applyPositions]);

  // Redo
  const redo = useCallback(() => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;

    // Save current positions to undo stack
    undoStackRef.current.push({
      positions: getCurrentPositions(),
      timestamp: Date.now(),
    });

    // Apply redo positions (without triggering layout)
    applyPositions(entry.positions);
  }, [getCurrentPositions, applyPositions]);

  return {
    nodes,
    edges,
    isLoading,
    setGraph,
    onNodeDrag,
    onDragEnd,
    reflow,
    setNodePositions,
    getPositionSource,
    undo,
    redo,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
  };
}
