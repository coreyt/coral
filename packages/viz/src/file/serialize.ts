/**
 * Coral Document Serialization (CORAL-REQ-008)
 *
 * Converts React Flow nodes/edges to CoralDocument format.
 */

import type { CoralNode, CoralEdge, GraphIR, GraphNode, GraphEdge } from '../types.js';
import type {
  CoralDocument,
  CreateDocumentOptions,
  SerializeOptions,
  DocumentSettings,
  LayoutSettings,
  NodePosition,
} from './schema.js';
import { CURRENT_SCHEMA_VERSION } from './schema.js';

/**
 * Default layout settings
 */
const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  algorithm: 'layered',
  direction: 'DOWN',
  spacing: {
    nodeNode: 50,
    layerSpacing: 70,
  },
};

/**
 * Default document settings
 */
const DEFAULT_SETTINGS: DocumentSettings = {
  notation: 'flowchart',
  layout: DEFAULT_LAYOUT_SETTINGS,
};

/**
 * Create a new CoralDocument with default values
 *
 * @param options - Document creation options
 * @returns New CoralDocument
 */
export function createDocument(options: CreateDocumentOptions): CoralDocument {
  const now = new Date().toISOString();

  const settings: DocumentSettings = {
    notation: options.settings?.notation ?? DEFAULT_SETTINGS.notation,
    layout: {
      ...DEFAULT_LAYOUT_SETTINGS,
      ...options.settings?.layout,
    },
  };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: {
      name: options.name,
      description: options.description,
      tags: options.tags,
      version: options.version,
      created: now,
      modified: now,
    },
    content: {
      format: options.content?.format ?? 'graph-ir',
      dslType: options.content?.dslType,
      text: options.content?.text,
      graphIR: options.content?.graphIR ?? {
        version: '1.0.0',
        id: 'untitled',
        nodes: [],
        edges: [],
      },
    },
    settings,
    viewState: options.viewState,
    nodePositions: options.nodePositions,
  };
}

/**
 * Convert a CoralNode to a GraphNode
 */
function nodeToGraphNode(node: CoralNode): GraphNode {
  return {
    id: node.id,
    type: node.data.nodeType || node.type || 'default',
    label: node.data.label,
    description: node.data.description,
    properties: node.data.properties,
    parent: node.parentId,
  };
}

/**
 * Convert a CoralEdge to a GraphEdge
 */
function edgeToGraphEdge(edge: CoralEdge): GraphEdge {
  // Only use string labels (React nodes can't be serialized)
  const label = edge.data?.label ?? (typeof edge.label === 'string' ? edge.label : undefined);

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourcePort: edge.sourceHandle ?? undefined,
    targetPort: edge.targetHandle ?? undefined,
    type: edge.data?.edgeType,
    label,
    properties: edge.data?.properties,
  };
}

/**
 * Extract node positions from CoralNodes
 */
function extractNodePositions(nodes: CoralNode[]): Record<string, NodePosition> {
  const positions: Record<string, NodePosition> = {};
  for (const node of nodes) {
    if (node.position) {
      positions[node.id] = {
        x: node.position.x,
        y: node.position.y,
      };
    }
  }
  return positions;
}

/**
 * Serialize React Flow nodes and edges to a CoralDocument
 *
 * @param nodes - React Flow nodes
 * @param edges - React Flow edges
 * @param options - Serialization options
 * @returns CoralDocument
 */
export function serialize(
  nodes: CoralNode[],
  edges: CoralEdge[],
  options: SerializeOptions
): CoralDocument {
  const now = new Date().toISOString();

  const graphIR: GraphIR = {
    version: '1.0.0',
    id: options.name.toLowerCase().replace(/\s+/g, '-'),
    name: options.name,
    nodes: nodes.map(nodeToGraphNode),
    edges: edges.map(edgeToGraphEdge),
  };

  const settings: DocumentSettings = {
    notation: options.settings?.notation ?? DEFAULT_SETTINGS.notation,
    layout: {
      ...DEFAULT_LAYOUT_SETTINGS,
      ...options.settings?.layout,
    },
  };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: {
      name: options.name,
      description: options.description,
      tags: options.tags,
      version: options.version,
      created: options.created ?? now,
      modified: now,
    },
    content: {
      format: 'graph-ir',
      graphIR,
    },
    settings,
    viewState: options.viewState,
    nodePositions: extractNodePositions(nodes),
  };
}
