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
import { CORAL_NODE_VIEW_METADATA } from '../types.js';
import { assertProfileNotationAgreement028, effectiveGraphNotationId028, markerId, resolveEdgeAppearance,
  resolveSymbolIndex, type SymbolIndex } from '@coral-viz/render';
import { dimensionsForGraphProjection } from './dimensions.js';

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

function canonicalNodePayload(node: GraphNode): CoralNodeData['canonical'] {
  const {
    id: _id,
    type: _type,
    label: _label,
    description: _description,
    properties: _properties,
    position: _position,
    pinned: _pinned,
    children: _children,
    ...canonical
  } = node;
  return canonical;
}

function canonicalEdgePayload(edge: GraphEdge): CoralEdgeData['canonical'] {
  const {
    id: _id,
    source: _source,
    target: _target,
    sourcePort: _sourcePort,
    targetPort: _targetPort,
    type: _type,
    label: _label,
    properties: _properties,
    ...canonical
  } = edge;
  return canonical;
}

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
    label: node.label ?? node.id,
    nodeType: node.type,
    description: node.description,
    properties: node.properties,
    pinned: node.pinned,
    symbolId: node.symbol,
    variant: node.variant,
    isGroup: hasChildren || node.type === 'group',
    childCount: node.children?.length,
    canonical: canonicalNodePayload(node),
    ...(node.dimensions !== undefined
      ? { [CORAL_NODE_VIEW_METADATA]: { dimensionSource: 'graph' as const } }
      : {}),
  };

  const flowNode: CoralNode = {
    id: node.id,
    type: mapNodeType(node.type),
    position: node.position || { x: index * 200, y: index * 100 },
    draggable: !node.pinned,
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
 * Convert a Graph-IR edge to React Flow edge, resolving notation appearance
 * through the shared render model.
 */
export function convertEdge(
  edge: GraphEdge,
  scene?: { notation?: string; nodes?: GraphNode[] | SymbolIndex },
): CoralEdge {
  const appearance = resolveEdgeAppearance(edge, scene?.nodes ?? [], scene?.notation, '#666');
  const { stroke, strokeWidth, strokeDasharray } = appearance.style;
  const data: CoralEdgeData = {
    label: edge.label,
    edgeType: edge.type,
    properties: edge.properties,
    lineStyle: edge.style?.lineStyle,
    routingPoints: edge.routeIntent?.waypoints.flatMap((waypoint) =>
      waypoint.placement.kind === 'absolute' ? [waypoint.placement.position] : []),
    canonical: canonicalEdgePayload(edge),
    sourceEndpoint: appearance.source,
    targetEndpoint: appearance.target,
  };

  const flowEdge: CoralEdge = {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    data,
    label: edge.label,
    type: 'compatibility',
    style: { stroke, strokeWidth, ...(strokeDasharray ? { strokeDasharray } : {}) },
    ...(appearance.source.marker && appearance.source.marker.kind !== 'none'
      ? { markerStart: `url(#${markerId(appearance.source.marker, stroke)})` } : {}),
    ...(appearance.target.marker && appearance.target.marker.kind !== 'none'
      ? { markerEnd: `url(#${markerId(appearance.target.marker, stroke)})` } : {}),
  };

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
  const notation = effectiveGraphNotationId028(graph);
  assertProfileNotationAgreement028(notation, graph.profile);
  const nodes = flattenNodes(graph.nodes);
  const scene = { notation, nodes: resolveSymbolIndex(graph.nodes, notation) };
  const edges = graph.edges.map((edge) => convertEdge(edge, scene));

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
    const canonical = flowNode.data.canonical;
    const graphNode: GraphNode = {
      ...original,
      ...canonical,
      id: flowNode.id,
      type: flowNode.data.nodeType,
      label: flowNode.data.label,
      description: flowNode.data.description,
      properties: flowNode.data.properties,
      position: flowNode.position,
      pinned: flowNode.data.pinned ?? original?.pinned,
    };
    // A displayed ID is not evidence that the author wrote a label. Keep
    // omission distinct from an explicit blank or explicit ID-matching label.
    if (original && original.label === undefined && flowNode.data.label === flowNode.id) {
      delete graphNode.label;
    }
    const dimensions = dimensionsForGraphProjection(flowNode);
    if (dimensions) graphNode.dimensions = dimensions;
    else delete graphNode.dimensions;
    // The current flat React Flow topology owns hierarchy. Starting from the
    // original preserves extensions, but stale parent/children links must not
    // resurrect nodes that were detached or deleted in the visual editor.
    delete graphNode.parent;
    delete graphNode.children;

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
export function convertFlowToGraphEdges(
  flowEdges: CoralEdge[],
  originalEdges: GraphEdge[] = [],
): GraphEdge[] {
  const originalMap = new Map(originalEdges.map((edge) => [edge.id, edge]));
  return flowEdges.map(flowEdge => {
    const original = originalMap.get(flowEdge.id);
    const canonical = flowEdge.data?.canonical;
    const graphEdge: GraphEdge = {
      ...original,
      ...canonical,
      id: flowEdge.id,
      source: flowEdge.source,
      target: flowEdge.target,
      label: flowEdge.data?.label,
      type: flowEdge.data?.edgeType,
      properties: flowEdge.data?.properties,
    };
    // Handles are visual-owned. A missing current handle means the port was
    // cleared, not that the original port should be restored.
    delete graphEdge.sourcePort;
    delete graphEdge.targetPort;

    if (flowEdge.sourceHandle) {
      graphEdge.sourcePort = flowEdge.sourceHandle;
    }
    if (flowEdge.targetHandle) {
      graphEdge.targetPort = flowEdge.targetHandle;
    }

    const lineStyle = flowEdge.data?.lineStyle
      ?? (flowEdge.style?.strokeDasharray
        ? (String(flowEdge.style.strokeDasharray).includes('2') ? 'dotted' : 'dashed')
        : undefined);
    const { lineStyle: _oldLineStyle, ...canonicalStyle } = canonical?.style ?? original?.style ?? {};
    if (lineStyle || Object.keys(canonicalStyle).length > 0) {
      graphEdge.style = { ...canonicalStyle, ...(lineStyle ? { lineStyle } : {}) };
    } else {
      delete graphEdge.style;
    }

    return graphEdge;
  });
}
