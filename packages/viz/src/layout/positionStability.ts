/**
 * Position Stability Module (CORAL-REQ-013)
 *
 * Provides utilities for maintaining node positions across DSL changes.
 * Separates parse, render, and layout operations to prevent undo/redo
 * positions from being overwritten by automatic layout.
 */

import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode, ElkExtendedEdge } from 'elkjs';
import type { DiffableGraph, DiffableNode, GraphDiff, Position, PositionResolution } from '../types.js';

const elk = new ELK();

/**
 * Compare two graphs and identify added, removed, modified, and unchanged nodes.
 *
 * A node is considered "modified" if its type or label has changed.
 * Edge changes are not considered for node modification status.
 *
 * @param oldGraph - The previous graph state
 * @param newGraph - The new graph state
 * @returns GraphDiff with categorized node IDs
 */
export function diffGraphs(oldGraph: DiffableGraph, newGraph: DiffableGraph): GraphDiff {
  const oldNodeMap = new Map<string, DiffableNode>();
  for (const node of oldGraph.nodes) {
    oldNodeMap.set(node.id, node);
  }

  const newNodeMap = new Map<string, DiffableNode>();
  for (const node of newGraph.nodes) {
    newNodeMap.set(node.id, node);
  }

  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];

  // Check nodes in new graph
  for (const node of newGraph.nodes) {
    const oldNode = oldNodeMap.get(node.id);
    if (!oldNode) {
      // Node doesn't exist in old graph - it's new
      added.push(node.id);
    } else if (oldNode.type !== node.type || oldNode.label !== node.label) {
      // Node exists but has changed type or label
      modified.push(node.id);
    } else {
      // Node is unchanged
      unchanged.push(node.id);
    }
  }

  // Check for nodes removed from old graph
  for (const node of oldGraph.nodes) {
    if (!newNodeMap.has(node.id)) {
      removed.push(node.id);
    }
  }

  return { added, removed, modified, unchanged };
}

/**
 * Resolve positions for nodes in the new graph based on the diff and current positions.
 *
 * - Unchanged and modified nodes keep their current positions
 * - Added nodes are marked as needing layout (placed at 0,0 temporarily)
 * - Removed nodes are not included in the result
 *
 * @param oldGraph - The previous graph state
 * @param newGraph - The new graph state
 * @param currentPositions - Map of node IDs to their current positions
 * @returns PositionResolution with resolved positions and nodes needing layout
 */
export function resolvePositions(
  oldGraph: DiffableGraph,
  newGraph: DiffableGraph,
  currentPositions: Map<string, Position>
): PositionResolution {
  const diff = diffGraphs(oldGraph, newGraph);
  const positions = new Map<string, Position>();
  const needsLayout: string[] = [];

  // Process unchanged and modified nodes - keep their positions
  for (const id of [...diff.unchanged, ...diff.modified]) {
    const pos = currentPositions.get(id);
    if (pos) {
      positions.set(id, pos);
    } else {
      // Node exists in both graphs but has no position - needs layout
      needsLayout.push(id);
      positions.set(id, { x: 0, y: 0 });
    }
  }

  // Process added nodes - need layout
  for (const id of diff.added) {
    needsLayout.push(id);
    positions.set(id, { x: 0, y: 0 }); // Placeholder position
  }

  // Removed nodes are not included in the result

  return { positions, needsLayout };
}

/**
 * Node info for incremental layout
 */
interface LayoutNodeInfo {
  id: string;
  type: string;
  label: string;
  width: number;
  height: number;
}

/**
 * Edge info for incremental layout
 */
interface LayoutEdgeInfo {
  id: string;
  source: string;
  target: string;
}

/**
 * Perform incremental layout with pinned positions for existing nodes.
 *
 * Strategy: Run ELK on all nodes but restore pinned positions afterwards.
 * This ensures edge routing works correctly while preserving user positions.
 *
 * If all nodes need layout (no pins), this performs a full ELK layout.
 * If no nodes need layout (all pinned), this returns the pinned positions unchanged.
 *
 * @param nodes - All nodes to layout (with dimensions)
 * @param edges - All edges in the graph
 * @param pinnedPositions - Positions to preserve (node IDs to positions)
 * @param needsLayout - Node IDs that need ELK positioning
 * @param options - Optional layout options (direction, algorithm, etc.)
 * @returns Map of node IDs to computed positions
 */
export async function incrementalLayout(
  nodes: LayoutNodeInfo[],
  edges: LayoutEdgeInfo[],
  pinnedPositions: Map<string, Position>,
  needsLayout: string[],
  options?: {
    direction?: 'DOWN' | 'UP' | 'LEFT' | 'RIGHT';
    algorithm?: string;
    spacing?: number;
  }
): Promise<Map<string, Position>> {
  // Handle empty case
  if (nodes.length === 0) {
    return new Map();
  }

  // If no nodes need layout, return pinned positions directly
  if (needsLayout.length === 0) {
    const result = new Map<string, Position>();
    for (const node of nodes) {
      const pos = pinnedPositions.get(node.id);
      if (pos) {
        result.set(node.id, pos);
      }
    }
    return result;
  }

  const needsLayoutSet = new Set(needsLayout);

  // Strategy: Run ELK on only the nodes that need layout, plus any nodes
  // they connect to. Then merge results with pinned positions.

  // For simplicity, we'll run ELK on all nodes but restore pinned positions after
  const elkChildren: ElkNode[] = nodes.map((node) => {
    const elkNode: ElkNode = {
      id: node.id,
      width: node.width,
      height: node.height,
    };

    // Set initial position for ELK (helps with layout stability)
    const pinnedPos = pinnedPositions.get(node.id);
    if (pinnedPos) {
      elkNode.x = pinnedPos.x;
      elkNode.y = pinnedPos.y;
    }

    return elkNode;
  });

  const elkEdges: ElkExtendedEdge[] = edges.map((edge) => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
  }));

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': options?.algorithm || 'layered',
      'elk.direction': options?.direction || 'DOWN',
      'elk.spacing.nodeNode': String(options?.spacing || 50),
      'elk.layered.spacing.nodeNodeBetweenLayers': '70',
    },
    children: elkChildren,
    edges: elkEdges,
  };

  try {
    const layoutedGraph = await elk.layout(elkGraph);

    // Collect positions from layout result, but restore pinned positions
    const result = new Map<string, Position>();
    for (const elkNode of layoutedGraph.children || []) {
      // For pinned nodes, use the original position
      const pinnedPos = pinnedPositions.get(elkNode.id);
      if (pinnedPos && !needsLayoutSet.has(elkNode.id)) {
        result.set(elkNode.id, pinnedPos);
      } else {
        // Use ELK-computed position for new nodes
        result.set(elkNode.id, { x: elkNode.x || 0, y: elkNode.y || 0 });
      }
    }

    return result;
  } catch (error) {
    console.error('Incremental layout failed:', error);
    // Fallback: return pinned positions and place new nodes nearby
    const result = new Map<string, Position>();
    let fallbackY = 0;

    // Find the max Y of pinned positions to place new nodes below
    for (const pos of pinnedPositions.values()) {
      fallbackY = Math.max(fallbackY, pos.y + 100);
    }

    for (const node of nodes) {
      const pinnedPos = pinnedPositions.get(node.id);
      if (pinnedPos && !needsLayoutSet.has(node.id)) {
        result.set(node.id, pinnedPos);
      } else {
        // Place new nodes below existing ones
        result.set(node.id, { x: 100, y: fallbackY });
        fallbackY += node.height + 50;
      }
    }

    return result;
  }
}
