/**
 * ELK Layout Integration
 *
 * Uses elkjs to compute automatic layouts for Graph-IR diagrams.
 */

import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode, ElkExtendedEdge, LayoutOptions as ElkLayoutOptions } from 'elkjs';
import type { GraphIR, GraphNode, GraphEdge, LayoutOptions, CoralNode, CoralEdge, SizingMode } from '../types.js';
import { applyAdaptiveSizing } from './nodeSizing.js';
import { symbolRegistry } from '../symbols/index.js';

const elk = new ELK();

/**
 * Default node dimensions when not specified
 */
const DEFAULT_NODE_WIDTH = 150;
const DEFAULT_NODE_HEIGHT = 50;
const DEFAULT_GROUP_PADDING = 20;

/**
 * Map Graph-IR layout direction to ELK direction
 */
const directionMap: Record<string, string> = {
  DOWN: 'DOWN',
  UP: 'UP',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
};

/**
 * Map Graph-IR algorithm to ELK algorithm
 */
const algorithmMap: Record<string, string> = {
  layered: 'layered',
  force: 'force',
  radial: 'radial',
  tree: 'mrtree',
  fixed: 'fixed',
};

/**
 * Convert Graph-IR layout options to ELK options
 */
function toElkOptions(options?: LayoutOptions): ElkLayoutOptions {
  const elkOptions: ElkLayoutOptions = {
    'elk.algorithm': algorithmMap[options?.algorithm || 'layered'] || 'layered',
    'elk.direction': directionMap[options?.direction || 'DOWN'] || 'DOWN',
  };

  if (options?.spacing) {
    if (options.spacing.nodeNode !== undefined) {
      elkOptions['elk.spacing.nodeNode'] = String(options.spacing.nodeNode);
    }
    if (options.spacing.layerSpacing !== undefined) {
      elkOptions['elk.layered.spacing.nodeNodeBetweenLayers'] = String(options.spacing.layerSpacing);
    }
  }

  return elkOptions;
}

/**
 * Convert a GraphNode to ELK node format
 */
function toElkNode(node: GraphNode): ElkNode {
  const elkNode: ElkNode = {
    id: node.id,
    width: node.dimensions?.width || DEFAULT_NODE_WIDTH,
    height: node.dimensions?.height || DEFAULT_NODE_HEIGHT,
  };

  // Handle children for group nodes
  if (node.children && node.children.length > 0) {
    elkNode.children = node.children.map(toElkNode);
    elkNode.layoutOptions = {
      'elk.padding': `[top=${DEFAULT_GROUP_PADDING},left=${DEFAULT_GROUP_PADDING},bottom=${DEFAULT_GROUP_PADDING},right=${DEFAULT_GROUP_PADDING}]`,
    };
  }

  return elkNode;
}

/**
 * Convert a GraphEdge to ELK edge format
 */
function toElkEdge(edge: GraphEdge): ElkExtendedEdge {
  return {
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
  };
}

/**
 * Apply ELK positions back to GraphNodes
 */
function applyPositions(nodes: GraphNode[], elkNodes: ElkNode[]): GraphNode[] {
  const positionMap = new Map<string, { x: number; y: number; width?: number; height?: number }>();

  // Build position map from ELK results (handles nested nodes)
  function collectPositions(elkNodes: ElkNode[], offsetX = 0, offsetY = 0): void {
    for (const elkNode of elkNodes) {
      const x = (elkNode.x || 0) + offsetX;
      const y = (elkNode.y || 0) + offsetY;
      positionMap.set(elkNode.id, {
        x,
        y,
        width: elkNode.width,
        height: elkNode.height,
      });

      if (elkNode.children) {
        collectPositions(elkNode.children, x, y);
      }
    }
  }

  collectPositions(elkNodes);

  // Apply positions to GraphNodes
  function applyToNodes(nodes: GraphNode[]): GraphNode[] {
    return nodes.map((node) => {
      const pos = positionMap.get(node.id);
      const result: GraphNode = {
        ...node,
        position: pos ? { x: pos.x, y: pos.y } : node.position,
      };

      if (pos?.width && pos?.height) {
        result.dimensions = { width: pos.width, height: pos.height };
      }

      if (node.children) {
        result.children = applyToNodes(node.children);
      }

      return result;
    });
  }

  return applyToNodes(nodes);
}

/**
 * Layout a Graph-IR structure using ELK
 *
 * @param graph - The Graph-IR to layout
 * @returns Graph-IR with positions computed for all nodes
 */
export async function layoutGraph(graph: GraphIR): Promise<GraphIR> {
  const elkGraph: ElkNode = {
    id: graph.id || 'root',
    layoutOptions: toElkOptions(graph.layoutOptions),
    children: graph.nodes.map(toElkNode),
    edges: graph.edges.map(toElkEdge),
  };

  const layoutedGraph = await elk.layout(elkGraph);

  return {
    ...graph,
    nodes: applyPositions(graph.nodes, layoutedGraph.children || []),
  };
}

/**
 * Extended layout options including sizing (CORAL-REQ-011)
 */
export interface LayoutFlowOptions extends LayoutOptions {
  /** Node sizing mode */
  sizingMode?: SizingMode;
  /** Font size for text measurement */
  fontSize?: number;
  /** Font family for text measurement */
  fontFamily?: string;
}

/**
 * Get shape ID from node data
 */
function getShapeIdFromNode(node: CoralNode): string {
  // Check symbolId first
  const symbolId = node.data.symbolId as string | undefined;
  if (symbolId) {
    const symbol = symbolRegistry.get(symbolId);
    if (symbol) {
      return symbol.shape;
    }
  }

  // Fallback mapping from node types to shapes
  const typeToShape: Record<string, string> = {
    service: 'rectangle',
    database: 'cylinder',
    external_api: 'cloud',
    actor: 'actor',
    module: 'rectangle',
    group: 'rectangle',
    process: 'rectangle',
    decision: 'diamond',
    terminal: 'stadium',
    io: 'parallelogram',
    document: 'document',
  };

  return typeToShape[node.data.nodeType] || 'rectangle';
}

/**
 * Layout React Flow nodes using ELK
 *
 * This is a convenience function for use directly with React Flow state.
 *
 * @param nodes - React Flow nodes
 * @param edges - React Flow edges
 * @param options - Layout options (including sizing mode)
 * @returns Nodes with positions updated
 */
export async function layoutFlowNodes(
  nodes: CoralNode[],
  edges: CoralEdge[],
  options?: LayoutFlowOptions
): Promise<CoralNode[]> {
  // Apply adaptive sizing if enabled (CORAL-REQ-011)
  let sizedNodes = nodes;
  if (options?.sizingMode) {
    sizedNodes = applyAdaptiveSizing(nodes, {
      sizingMode: options.sizingMode,
      getShapeId: getShapeIdFromNode,
      fontSize: options.fontSize,
      fontFamily: options.fontFamily,
    });
  }

  // Build ELK graph from React Flow nodes
  const nodeMap = new Map(sizedNodes.map((n) => [n.id, n]));
  const rootNodes: ElkNode[] = [];
  const childMap = new Map<string, ElkNode[]>();

  // First pass: create ELK nodes and group children
  for (const node of sizedNodes) {
    const elkNode: ElkNode = {
      id: node.id,
      width: node.measured?.width || node.width || DEFAULT_NODE_WIDTH,
      height: node.measured?.height || node.height || DEFAULT_NODE_HEIGHT,
    };

    if (node.parentId) {
      const siblings = childMap.get(node.parentId) || [];
      siblings.push(elkNode);
      childMap.set(node.parentId, siblings);
    } else {
      rootNodes.push(elkNode);
    }
  }

  // Second pass: attach children to parents
  for (const elkNode of rootNodes) {
    const children = childMap.get(elkNode.id);
    if (children) {
      elkNode.children = children;
      elkNode.layoutOptions = {
        'elk.padding': `[top=${DEFAULT_GROUP_PADDING},left=${DEFAULT_GROUP_PADDING},bottom=${DEFAULT_GROUP_PADDING},right=${DEFAULT_GROUP_PADDING}]`,
      };
    }
  }

  // Convert edges
  const elkEdges: ElkExtendedEdge[] = edges.map((e) => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
  }));

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: toElkOptions(options),
    children: rootNodes,
    edges: elkEdges,
  };

  const layoutedGraph = await elk.layout(elkGraph);

  // Build position map
  const positionMap = new Map<string, { x: number; y: number }>();

  function collectPositions(elkNodes: ElkNode[], offsetX = 0, offsetY = 0): void {
    for (const elkNode of elkNodes) {
      const x = (elkNode.x || 0) + offsetX;
      const y = (elkNode.y || 0) + offsetY;
      positionMap.set(elkNode.id, { x, y });

      if (elkNode.children) {
        // For children, we need relative positions within the parent
        collectPositions(elkNode.children, 0, 0);
      }
    }
  }

  collectPositions(layoutedGraph.children || []);

  // Apply positions to React Flow nodes (use sizedNodes to preserve computed dimensions)
  return sizedNodes.map((node) => {
    const pos = positionMap.get(node.id);
    if (pos) {
      return {
        ...node,
        position: { x: pos.x, y: pos.y },
      };
    }
    return node;
  });
}

/**
 * Get ELK instance for advanced usage
 */
export function getElk(): typeof elk {
  return elk;
}
