/** Compatibility adapters over the shared headless ELK owner. */
import type { ElkExtendedEdge } from 'elkjs';
import {
  computeElkLayout,
  getElkLayoutEngine,
  resolveSpatialLayout,
  type LayoutNode,
  type LayoutOptionInput,
  type LayoutResult,
} from '@coral-viz/render/layout';
import { symbolRegistry, type DocumentCatalog029 } from '@coral-viz/render';
import type {
  CoralEdge, CoralNode, GraphIR, GraphNode, LayoutOptions,
  Position, SizingMode,
} from '../types.js';
import { applyAdaptiveSizing } from './nodeSizing.js';

const elk = getElkLayoutEngine() as unknown as import('elkjs').ELK;
const DEFAULT_NODE_WIDTH = 150;
const DEFAULT_NODE_HEIGHT = 50;
const DEFAULT_GROUP_PADDING = 20;

function graphOptions(options?: LayoutOptions): LayoutOptionInput | undefined {
  if (!options) return undefined;
  return {
    algorithm: options.algorithm,
    direction: options.direction,
    spacing: options.spacing,
    edgeRouting: options.edgeRouting,
    hierarchyHandling: options.hierarchyHandling,
  };
}

function applyGraphPositions(nodes: GraphNode[], result: Pick<LayoutResult, 'nodes'>): GraphNode[] {
  const byId = new Map(result.nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    const laid = byId.get(node.id);
    return {
      ...node,
      position: laid?.absolutePosition ?? node.position,
      ...(laid?.width && laid.height ? { dimensions: { width: laid.width, height: laid.height } } : {}),
      ...(node.children ? { children: applyGraphPositions(node.children, result) } : {}),
    };
  });
}

export async function layoutGraph(graph: GraphIR): Promise<GraphIR> {
  const result = await resolveSpatialLayout({
    revision: `viz:${graph.id}`,
    graph,
    operation: 'load',
    defaults: { algorithm: 'layered', direction: 'DOWN' },
    options: graphOptions(graph.layoutOptions),
  });
  return { ...graph, nodes: applyGraphPositions(graph.nodes, result) };
}

export interface LayoutFlowOptions extends LayoutOptions {
  sizingMode?: SizingMode;
  fontSize?: number;
  fontFamily?: string;
}

/** A user symbol's frame is exactly its definition size; it is never text-sized. */
function userSymbolFrame029(node: CoralNode): { width: number; height: number } | undefined {
  const symbolId = (node.data.canonical?.symbol ?? node.data.symbolId) as string | undefined;
  const user = symbolId ? (node.data.documentCatalog029 as DocumentCatalog029 | undefined)?.userSymbols.get(symbolId)
    : undefined;
  return user ? { width: user.outline.width, height: user.outline.height } : undefined;
}

function getShapeIdFromNode(node: CoralNode): string {
  const symbolId = node.data.symbolId as string | undefined;
  const symbol = symbolId && !symbolId.startsWith('local.') ? symbolRegistry.get(symbolId) : undefined;
  if (symbol) return symbol.shape;
  return {
    service: 'rectangle', database: 'cylinder', external_api: 'cloud', actor: 'actor',
    module: 'rectangle', group: 'rectangle', process: 'rectangle', decision: 'diamond',
    terminal: 'stadium', io: 'parallelogram', document: 'document',
  }[node.data.nodeType] || 'rectangle';
}

function sizeFlowNodes(nodes: CoralNode[], options?: LayoutFlowOptions): CoralNode[] {
  if (!options?.sizingMode) return nodes;
  const sized = new Map(applyAdaptiveSizing(nodes.filter((node) => !userSymbolFrame029(node)), {
    sizingMode: options.sizingMode,
    getShapeId: getShapeIdFromNode,
    fontSize: options.fontSize,
    fontFamily: options.fontFamily,
  }).map((node) => [node.id, node]));
  return nodes.map((node) => {
    const frame = userSymbolFrame029(node);
    return frame ? { ...node, width: frame.width, height: frame.height } : sized.get(node.id)!;
  });
}

function flowHierarchy(nodes: CoralNode[]): LayoutNode[] {
  const children = new Map<string, CoralNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  }
  const convert = (node: CoralNode): LayoutNode => {
    const nested = children.get(node.id);
    return {
      id: node.id,
      width: node.measured?.width || node.width || DEFAULT_NODE_WIDTH,
      height: node.measured?.height || node.height || DEFAULT_NODE_HEIGHT,
      ...(nested?.length ? {
        layoutOptions: { padding: {
          top: DEFAULT_GROUP_PADDING, right: DEFAULT_GROUP_PADDING,
          bottom: DEFAULT_GROUP_PADDING, left: DEFAULT_GROUP_PADDING,
        } },
        children: nested.map(convert),
      } : {}),
    };
  };
  return nodes.filter((node) => !node.parentId).map(convert);
}

async function layoutFlow(
  nodes: CoralNode[], edges: CoralEdge[], options?: LayoutFlowOptions,
): Promise<{ sizedNodes: CoralNode[]; result: LayoutResult }> {
  const sizedNodes = sizeFlowNodes(nodes, options);
  const result = await computeElkLayout({
    id: 'root',
    defaults: { algorithm: 'layered', direction: 'DOWN' },
    options: graphOptions(options),
    nodes: flowHierarchy(sizedNodes),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
  });
  return { sizedNodes, result };
}

export async function layoutFlowNodes(
  nodes: CoralNode[], edges: CoralEdge[], options?: LayoutFlowOptions,
): Promise<CoralNode[]> {
  const { sizedNodes, result } = await layoutFlow(nodes, edges, options);
  const byId = new Map(result.nodes.map((node) => [node.id, node.position]));
  return sizedNodes.map((node) => ({ ...node, position: byId.get(node.id) ?? node.position }));
}

export interface ElkEdgeRouting {
  id: string;
  startPoint: Position;
  endPoint: Position;
  bendPoints: Position[];
  sourceId: string;
  targetId: string;
  /** Editor route provenance, when authored semantic ports select handles. */
  sourcePortId?: string;
  targetPortId?: string;
}

export interface LayoutFlowResult {
  nodes: CoralNode[];
  edgeRouting: Map<string, ElkEdgeRouting>;
}

export function extractEdgeSections(
  elkEdges: ElkExtendedEdge[] | undefined,
): Map<string, ElkEdgeRouting> {
  const routing = new Map<string, ElkEdgeRouting>();
  for (const edge of elkEdges ?? []) {
    const section = edge.sections?.[0];
    if (!section) continue;
    routing.set(edge.id, {
      id: edge.id,
      startPoint: { ...section.startPoint },
      endPoint: { ...section.endPoint },
      bendPoints: (section.bendPoints ?? []).map((point) => ({ ...point })),
      sourceId: edge.sources[0],
      targetId: edge.targets[0],
    });
  }
  return routing;
}

function routingMap(result: LayoutResult, edges: CoralEdge[]): Map<string, ElkEdgeRouting> {
  const input = new Map(edges.map((edge) => [edge.id, edge]));
  const routing = new Map<string, ElkEdgeRouting>();
  for (const edge of result.edges) {
    const section = edge.sections[0];
    const original = input.get(edge.id);
    if (!section || !original) continue;
    routing.set(edge.id, {
      id: edge.id,
      startPoint: section.startPoint,
      endPoint: section.endPoint,
      bendPoints: section.bendPoints,
      sourceId: original.source,
      targetId: original.target,
    });
  }
  return routing;
}

export async function layoutFlowNodesWithEdges(
  nodes: CoralNode[], edges: CoralEdge[], options?: LayoutFlowOptions,
): Promise<LayoutFlowResult> {
  const { sizedNodes, result } = await layoutFlow(nodes, edges, options);
  const byId = new Map(result.nodes.map((node) => [node.id, node.position]));
  return {
    nodes: sizedNodes.map((node) => ({ ...node, position: byId.get(node.id) ?? node.position })),
    edgeRouting: routingMap(result, edges),
  };
}

export function getElk(): typeof elk {
  return elk;
}
