/**
 * Graph-IR to React Flow Converter
 *
 * Transforms Graph-IR nodes and edges to React Flow format.
 */

import type {
  GraphIR,
  GraphNode,
  GraphEdge,
  CoralNode,
  CoralEdge,
  CoralNodeData,
  CoralEdgeData,
} from '../types.js';

/**
 * Default node dimensions by type
 */
const DEFAULT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  service: { width: 150, height: 50 },
  database: { width: 120, height: 60 },
  external_api: { width: 140, height: 50 },
  actor: { width: 100, height: 100 },
  module: { width: 120, height: 40 },
  group: { width: 200, height: 150 },
};

/**
 * Map Graph-IR node type to React Flow node type
 */
function mapNodeType(graphType: string): string {
  switch (graphType) {
    case 'service':
      return 'coralService';
    case 'database':
      return 'coralDatabase';
    case 'external_api':
      return 'coralExternalApi';
    case 'actor':
      return 'coralActor';
    case 'module':
      return 'coralModule';
    case 'group':
      return 'coralGroup';
    default:
      return 'coralService';
  }
}

/**
 * Convert a Graph-IR node to React Flow node
 */
export function convertNode(
  node: GraphNode,
  index: number,
  parentId?: string
): CoralNode {
  const dimensions = node.dimensions || DEFAULT_DIMENSIONS[node.type] || DEFAULT_DIMENSIONS.service;
  const hasChildren = node.children && node.children.length > 0;

  const data: CoralNodeData = {
    label: node.label || node.id,
    nodeType: node.type,
    description: node.description,
    properties: node.properties,
    isGroup: hasChildren || node.type === 'group',
    childCount: node.children?.length,
  };

  const flowNode: CoralNode = {
    id: node.id,
    type: mapNodeType(node.type),
    position: node.position || { x: index * 200, y: index * 100 },
    data,
    style: {
      width: dimensions.width,
      height: dimensions.height,
    },
  };

  // If this node has a parent, set it
  if (parentId) {
    flowNode.parentId = parentId;
    flowNode.extent = 'parent';
  }

  // For group nodes, mark as expandable
  if (hasChildren) {
    flowNode.style = {
      ...flowNode.style,
      width: Math.max(dimensions.width, 250),
      height: Math.max(dimensions.height, 200),
    };
  }

  return flowNode;
}

/**
 * Flatten nested nodes for React Flow
 * React Flow doesn't support deeply nested nodes well, so we flatten
 * and use parentId for grouping
 */
export function flattenNodes(nodes: GraphNode[]): CoralNode[] {
  const result: CoralNode[] = [];
  let index = 0;

  function processNode(node: GraphNode, parentId?: string): void {
    result.push(convertNode(node, index++, parentId));

    if (node.children) {
      for (const child of node.children) {
        processNode(child, node.id);
      }
    }
  }

  for (const node of nodes) {
    processNode(node);
  }

  return result;
}

/**
 * Convert a Graph-IR edge to React Flow edge
 */
export function convertEdge(edge: GraphEdge): CoralEdge {
  const data: CoralEdgeData = {
    label: edge.label,
    edgeType: edge.type,
    properties: edge.properties,
  };

  const flowEdge: CoralEdge = {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    data,
    label: edge.label,
    type: 'smoothstep', // Default edge type
  };

  // Apply edge style
  if (edge.style) {
    flowEdge.style = {};

    if (edge.style.lineStyle === 'dashed') {
      flowEdge.style.strokeDasharray = '5,5';
    } else if (edge.style.lineStyle === 'dotted') {
      flowEdge.style.strokeDasharray = '2,2';
    }

    if (edge.style.targetArrow === 'none') {
      flowEdge.markerEnd = undefined;
    }
  }

  // Handle source/target ports
  if (edge.sourcePort) {
    flowEdge.sourceHandle = edge.sourcePort;
  }
  if (edge.targetPort) {
    flowEdge.targetHandle = edge.targetPort;
  }

  return flowEdge;
}

/**
 * Convert entire Graph-IR to React Flow format
 */
export function convertGraphToFlow(graph: GraphIR): {
  nodes: CoralNode[];
  edges: CoralEdge[];
} {
  const nodes = flattenNodes(graph.nodes);
  const edges = graph.edges.map(convertEdge);

  return { nodes, edges };
}

/**
 * Convert React Flow nodes back to Graph-IR nodes
 * Used for bidirectional sync
 */
export function convertFlowToGraphNodes(
  flowNodes: CoralNode[],
  originalNodes: GraphNode[]
): GraphNode[] {
  // Build a map of original nodes for reference
  const originalMap = new Map<string, GraphNode>();

  function mapOriginal(nodes: GraphNode[]): void {
    for (const node of nodes) {
      originalMap.set(node.id, node);
      if (node.children) {
        mapOriginal(node.children);
      }
    }
  }
  mapOriginal(originalNodes);

  // Build result maintaining hierarchy
  const result: GraphNode[] = [];
  const childMap = new Map<string, GraphNode[]>();

  // First pass: convert all nodes
  for (const flowNode of flowNodes) {
    const original = originalMap.get(flowNode.id);
    const graphNode: GraphNode = {
      id: flowNode.id,
      type: flowNode.data.nodeType,
      label: flowNode.data.label,
      description: flowNode.data.description,
      properties: flowNode.data.properties,
      position: flowNode.position,
      dimensions: flowNode.style ? {
        width: typeof flowNode.style.width === 'number' ? flowNode.style.width : 150,
        height: typeof flowNode.style.height === 'number' ? flowNode.style.height : 50,
      } : undefined,
    };

    if (flowNode.parentId) {
      graphNode.parent = flowNode.parentId;
      if (!childMap.has(flowNode.parentId)) {
        childMap.set(flowNode.parentId, []);
      }
      childMap.get(flowNode.parentId)!.push(graphNode);
    } else {
      result.push(graphNode);
    }
  }

  // Second pass: attach children
  function attachChildren(nodes: GraphNode[]): void {
    for (const node of nodes) {
      const children = childMap.get(node.id);
      if (children) {
        node.children = children;
        attachChildren(children);
      }
    }
  }
  attachChildren(result);

  return result;
}

/**
 * Convert React Flow edges back to Graph-IR edges
 */
export function convertFlowToGraphEdges(flowEdges: CoralEdge[]): GraphEdge[] {
  return flowEdges.map(flowEdge => {
    const graphEdge: GraphEdge = {
      id: flowEdge.id,
      source: flowEdge.source,
      target: flowEdge.target,
      label: flowEdge.data?.label,
      type: flowEdge.data?.edgeType,
      properties: flowEdge.data?.properties,
    };

    if (flowEdge.sourceHandle) {
      graphEdge.sourcePort = flowEdge.sourceHandle;
    }
    if (flowEdge.targetHandle) {
      graphEdge.targetPort = flowEdge.targetHandle;
    }

    return graphEdge;
  });
}
