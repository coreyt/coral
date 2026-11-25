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
  EdgeRoutingData,
} from './schema.js';
import { CURRENT_SCHEMA_VERSION, DEFAULT_DIAGRAM_FONT_SETTINGS } from './schema.js';
import { dimensionsForGraphProjection } from '../editor/dimensions.js';

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
  const font = options.settings?.font === undefined
    ? { default: { ...DEFAULT_DIAGRAM_FONT_SETTINGS.default } }
    : options.settings.font;

  const settings: DocumentSettings = {
    ...options.settings,
    notation: options.settings?.notation ?? DEFAULT_SETTINGS.notation,
    layout: {
      ...DEFAULT_LAYOUT_SETTINGS,
      ...options.settings?.layout,
    },
    font,
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
        version: '3.0.0',
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
  const canonical = node.data.canonical;
  const graphNode: GraphNode = {
    ...canonical,
    id: node.id,
    type: node.data.nodeType || node.type || 'default',
    label: node.data.label,
    description: node.data.description,
    properties: node.data.properties,
    parent: node.parentId,
    position: { x: node.position.x, y: node.position.y },
    ...(node.data.pinned !== undefined ? { pinned: node.data.pinned } : {}),
  };
  const dimensions = dimensionsForGraphProjection(node);
  if (dimensions) graphNode.dimensions = dimensions;
  else delete graphNode.dimensions;
  return graphNode;
}

/**
 * Convert a CoralEdge to a GraphEdge
 */
function edgeToGraphEdge(edge: CoralEdge): GraphEdge {
  // Only use string labels (React nodes can't be serialized)
  const label = edge.data?.label ?? (typeof edge.label === 'string' ? edge.label : undefined);

  const lineStyle = edge.data?.lineStyle
    ?? (edge.style?.strokeDasharray
      ? (String(edge.style.strokeDasharray).includes('2') ? 'dotted' : 'dashed')
      : undefined);

  const { lineStyle: _oldLineStyle, ...canonicalStyle } = edge.data?.canonical?.style ?? {};
  const style = lineStyle || Object.keys(canonicalStyle).length > 0
    ? { ...canonicalStyle, ...(lineStyle ? { lineStyle } : {}) }
    : undefined;

  const graphEdge: GraphEdge = {
    ...edge.data?.canonical,
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourcePort: edge.sourceHandle ?? undefined,
    targetPort: edge.targetHandle ?? undefined,
    type: edge.data?.edgeType,
    label,
    properties: edge.data?.properties,
    ...(style ? { style } : {}),
  };
  if (!style) delete graphEdge.style;
  return graphEdge;
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
 * @param waypointMap - Optional map of edge ID to waypoints (CORAL-REQ-015)
 * @returns CoralDocument
 */
export function serialize(
  nodes: CoralNode[],
  edges: CoralEdge[],
  options: SerializeOptions,
  waypointMap?: Map<string, Array<{ id: string; x: number; y: number; type: string }>>,
): CoralDocument {
  if (options.graphIR && options.graphIR.version !== '3.0.0') {
    throw new Error(
      `Coral serialization requires GraphIR 3.0.0; migrate GraphIR ${String(options.graphIR.version)} ` +
      'through the named migration APIs before saving.',
    );
  }
  const now = new Date().toISOString();

  const flatNodes = nodes.map(nodeToGraphNode);
  const nodeIds = new Set(flatNodes.map((node) => node.id));
  const byParent = new Map<string, GraphNode[]>();
  const topLevel: GraphNode[] = [];
  for (const node of flatNodes) {
    if (node.parent && nodeIds.has(node.parent)) {
      const children = byParent.get(node.parent) ?? [];
      children.push(node);
      byParent.set(node.parent, children);
    } else {
      topLevel.push(node);
    }
  }
  const attachChildren = (node: GraphNode): GraphNode => {
    const children = byParent.get(node.id);
    return children?.length
      ? { ...node, children: children.map(attachChildren) }
      : node;
  };

  const graphIR: GraphIR = {
    ...options.graphIR,
    version: options.graphIR?.version ?? '3.0.0',
    id: options.graphIR?.id ?? options.name.toLowerCase().replace(/\s+/g, '-'),
    name: options.graphIR?.name ?? options.name,
    // A supplied canonical graph owns authored Exact positions. React Flow
    // coordinates are still persisted below as view state, but must not turn
    // a released/computed position back into an authored constraint.
    nodes: options.graphIR?.nodes.length ? options.graphIR.nodes : topLevel.map(attachChildren),
    edges: options.graphIR?.edges.length
      ? options.graphIR.edges.map((edge) => ({
          ...edge,
          ...(edge.routeIntent ? { routeIntent: { waypoints: edge.routeIntent.waypoints.map((waypoint) => ({
            ...waypoint,
            placement: waypoint.placement.kind === 'absolute'
              ? { ...waypoint.placement, position: { ...waypoint.placement.position } }
              : { ...waypoint.placement, anchor: { ...waypoint.placement.anchor }, offset: { ...waypoint.placement.offset } },
          })) } } : {}),
        }))
      : edges.map(edgeToGraphEdge),
  };

  const settings: DocumentSettings = {
    ...options.settings,
    notation: options.settings?.notation ?? DEFAULT_SETTINGS.notation,
    layout: {
      ...DEFAULT_LAYOUT_SETTINGS,
      ...options.settings?.layout,
    },
  };

  // Build edge routing data from waypoints (CORAL-REQ-015)
  let edgeRouting: Record<string, EdgeRoutingData> | undefined;
  if (waypointMap && waypointMap.size > 0) {
    edgeRouting = {};
    for (const [edgeId, waypoints] of waypointMap) {
      if (waypoints.length > 0) {
        const graphEdge = graphIR.edges.find((edge) => edge.id === edgeId);
        if (graphEdge) {
          const absoluteById = new Map(waypoints.map((waypoint) => [waypoint.id, waypoint]));
          const merged = (graphEdge.routeIntent?.waypoints ?? []).flatMap((waypoint) => {
            if (waypoint.placement.kind !== 'absolute') return [waypoint];
            const edited = absoluteById.get(waypoint.id);
            if (!edited) return [];
            absoluteById.delete(waypoint.id);
            return [{
              id: edited.id,
              placement: { kind: 'absolute' as const, position: { x: edited.x, y: edited.y } },
            }];
          });
          for (const waypoint of absoluteById.values()) merged.push({
            id: waypoint.id,
            placement: { kind: 'absolute' as const, position: { x: waypoint.x, y: waypoint.y } },
          });
          graphEdge.routeIntent = {
            waypoints: merged,
          };
        }
        edgeRouting[edgeId] = {
          bendPoints: waypoints.map((wp) => ({ x: wp.x, y: wp.y })),
          isPinned: true,
          waypoints: waypoints.map((wp) => ({
            id: wp.id,
            x: wp.x,
            y: wp.y,
            type: wp.type,
          })),
        };
      }
    }
  }

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
    edgeRouting,
  };
}
