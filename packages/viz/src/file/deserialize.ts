/**
 * Coral Document Deserialization (CORAL-REQ-008)
 *
 * Converts CoralDocument to React Flow nodes/edges.
 */

import type { CoralNode, CoralEdge, GraphNode, GraphEdge } from '../types.js';
import type { CoralDocument, DeserializeResult, NodePosition } from './schema.js';
import { assertValidDocument } from './validate.js';
import { migrateDocument } from './migrate.js';

/**
 * Default position for nodes without positions
 */
const DEFAULT_POSITION = { x: 0, y: 0 };

/**
 * Convert a GraphNode to a CoralNode
 */
function graphNodeToNode(
  graphNode: GraphNode,
  positions: Record<string, NodePosition>
): CoralNode {
  const position = positions[graphNode.id] ?? graphNode.position ?? DEFAULT_POSITION;

  return {
    id: graphNode.id,
    type: graphNode.type,
    position: { x: position.x, y: position.y },
    parentId: graphNode.parent,
    data: {
      label: graphNode.label ?? graphNode.id,
      nodeType: graphNode.type,
      description: graphNode.description,
      properties: graphNode.properties,
      isGroup: graphNode.children && graphNode.children.length > 0,
      childCount: graphNode.children?.length,
    },
    ...(graphNode.dimensions && {
      width: graphNode.dimensions.width,
      height: graphNode.dimensions.height,
    }),
  };
}

/**
 * Convert a GraphEdge to a CoralEdge
 */
function graphEdgeToEdge(graphEdge: GraphEdge): CoralEdge {
  return {
    id: graphEdge.id,
    source: graphEdge.source,
    target: graphEdge.target,
    sourceHandle: graphEdge.sourcePort ?? null,
    targetHandle: graphEdge.targetPort ?? null,
    type: graphEdge.style?.lineStyle === 'dashed' ? 'dashed' : undefined,
    label: graphEdge.label,
    data: {
      label: graphEdge.label,
      edgeType: graphEdge.type,
      properties: graphEdge.properties,
    },
  };
}

/**
 * Flatten nested nodes (Graph-IR can have children, React Flow uses parentId)
 */
function flattenGraphNodes(nodes: GraphNode[]): GraphNode[] {
  const result: GraphNode[] = [];

  function traverse(node: GraphNode, parentId?: string): void {
    result.push({
      ...node,
      parent: parentId,
    });

    if (node.children) {
      for (const child of node.children) {
        traverse(child, node.id);
      }
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return result;
}

/**
 * Deserialize a CoralDocument to React Flow nodes and edges
 *
 * @param doc - CoralDocument to deserialize
 * @returns Deserialized nodes, edges, settings, and metadata
 * @throws Error if document is invalid
 */
export function deserialize(doc: CoralDocument): DeserializeResult {
  // Migrate to current version if needed
  const migratedDoc = migrateDocument(doc);

  // Validate the document
  assertValidDocument(migratedDoc);

  // Extract positions map
  const positions = migratedDoc.nodePositions ?? {};

  // Get nodes and edges from Graph-IR content
  let nodes: CoralNode[] = [];
  let edges: CoralEdge[] = [];

  if (migratedDoc.content.format === 'graph-ir' && migratedDoc.content.graphIR) {
    const graphIR = migratedDoc.content.graphIR;

    // Flatten nested nodes
    const flatNodes = flattenGraphNodes(graphIR.nodes);

    // Convert to React Flow format
    nodes = flatNodes.map((n) => graphNodeToNode(n, positions));
    edges = graphIR.edges.map(graphEdgeToEdge);
  }

  return {
    nodes,
    edges,
    settings: migratedDoc.settings,
    viewState: migratedDoc.viewState,
    metadata: migratedDoc.metadata,
  };
}
