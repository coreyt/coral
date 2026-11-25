import type { Edge, Node } from '@xyflow/react';
import type { SuccessorSourceGraph028 } from '@coral-viz/render';
import {
  CORAL_NODE_VIEW_METADATA,
  type SymbolNodeData,
} from '@coral-viz/viz';
import type { GraphNode } from './parsers';
import type { GraphIR } from './printer';

export function canonicalPortId(handleId?: string | null): string | undefined {
  return handleId?.replace(/-(?:in|out)$/, '') || undefined;
}

/** A source-owned port reference must have a verified route before export. */
export function requireSourcePortRoutes028(
  source: Pick<SuccessorSourceGraph028, 'edges'>,
  routes: ReadonlyMap<string, { sourceId: string; targetId: string;
    sourcePortId?: string; targetPortId?: string }>,
): void {
  for (const edge of source.edges) {
    if (edge.first.port === undefined && edge.second.port === undefined) continue;
    const route = routes.get(edge.id);
    if (!route) throw new Error(
      `render.capability.semantic-port-route: edge ${edge.id} has no verified export route`,
    );
    if (route.sourceId !== edge.first.node || route.targetId !== edge.second.node) {
      throw new Error(
        `render.capability.semantic-port-route-identity: edge ${edge.id} route endpoints do not match Coral source`,
      );
    }
    if (edge.first.port !== undefined && route.sourcePortId !== edge.first.port ||
      edge.second.port !== undefined && route.targetPortId !== edge.second.port) {
      throw new Error(
        `render.capability.semantic-port-route-identity: edge ${edge.id} route ports do not match Coral source`,
      );
    }
  }
}

export function edgeForCompatibility(edge: Edge) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourcePort: canonicalPortId(edge.sourceHandle),
    targetPort: canonicalPortId(edge.targetHandle),
  };
}

function projectedMetadata(data: unknown, key: symbol): unknown {
  return data && typeof data === 'object'
    ? (data as Record<PropertyKey, unknown>)[key]
    : undefined;
}

function finiteDimensions(
  width: unknown,
  height: unknown,
): { width: number; height: number } | undefined {
  return typeof width === 'number' && Number.isFinite(width) && width > 0
    && typeof height === 'number' && Number.isFinite(height) && height > 0
    ? { width, height }
    : undefined;
}

/** Overlay live editor geometry onto canonical GraphIR without changing its structure. */
export function materializeRenderGraph<T extends Pick<GraphIR, 'nodes' | 'edges'>>(
  graph: T,
  currentNodes: Node<SymbolNodeData>[],
): T {
  const byId = new Map(currentNodes.map((node) => [node.id, node]));
  const overlay = (canonicalNodes: GraphIR['nodes']): GraphIR['nodes'] => canonicalNodes.map((canonical) => {
    const current = byId.get(canonical.id);
    if (!current) return canonical;
    const metadata = projectedMetadata(current.data, CORAL_NODE_VIEW_METADATA) as
      | { dimensionSource?: unknown }
      | undefined;
    const explicit = finiteDimensions(current.width, current.height);
    const measured = finiteDimensions(current.measured?.width, current.measured?.height);
    const dataDimensions = finiteDimensions(current.data.width, current.data.height);
    const dimensions = metadata?.dimensionSource === 'graph'
      ? explicit ?? measured ?? dataDimensions
      : metadata?.dimensionSource === 'editor-font'
        ? dataDimensions ?? explicit ?? measured
        : measured ?? explicit ?? dataDimensions;
    return {
      ...canonical,
      position: { ...current.position },
      ...(dimensions ? { dimensions } : {}),
      ...(current.data.symbolId ? { symbol: current.data.symbolId } : {}),
      ...(canonical.children ? { children: overlay(canonical.children) } : {}),
    };
  });
  return { ...graph, nodes: overlay(graph.nodes), edges: [...graph.edges] };
}

export function nestCanonicalNodes(nodes: GraphNode[]): GraphIR['nodes'] {
  const clones = nodes.map((node) => ({ ...node })) as GraphIR['nodes'];
  const knownIds = new Set(clones.map((node) => node.id));
  const byParent = new Map<string, GraphIR['nodes']>();
  const topLevel: GraphIR['nodes'] = [];
  for (const node of clones) {
    if (node.parent && knownIds.has(node.parent)) {
      const siblings = byParent.get(node.parent) ?? [];
      siblings.push(node);
      byParent.set(node.parent, siblings);
    } else {
      topLevel.push(node);
    }
  }
  const attach = (node: GraphIR['nodes'][number]): GraphIR['nodes'][number] => {
    const children = byParent.get(node.id);
    return children?.length ? { ...node, children: children.map(attach) } : node;
  };
  return topLevel.map(attach);
}

/** Adapt a canonical generation result to the existing editor projection path. */
export function projectCanonicalGraph(graph: GraphIR) {
  const flatten = (values: GraphIR['nodes'], parent?: string): GraphNode[] => values.flatMap((value) => {
    const { children, ...node } = value;
    return [{ ...node, label: node.label ?? node.id, ...(parent ? { parent } : {}) }, ...flatten(children ?? [], node.id)];
  });
  const absoluteRoutePoints = (edge: GraphIR['edges'][number]) =>
    edge.routeIntent?.waypoints.flatMap((waypoint) =>
      waypoint.placement.kind === 'absolute'
        ? [{ id: waypoint.id, ...waypoint.placement.position }]
        : []) ?? [];
  const waypoints = new Map(graph.edges
    .filter((edge) => absoluteRoutePoints(edge).length)
    .map((edge) => [edge.id, absoluteRoutePoints(edge).map((point) => ({
      id: point.id,
      x: point.x,
      y: point.y,
      type: 'corner' as const,
    }))]));
  return {
    nodes: flatten(graph.nodes),
    edges: graph.edges.map((edge) => ({
      ...edge,
      routingPoints: absoluteRoutePoints(edge).map(({ x, y }) => ({ x, y })),
    })),
    waypoints,
  };
}

/** Retain canonical membership/order/nesting while refreshing editable fields. */
export function composeRenderGraph(
  canonical: GraphIR,
  serializedCurrent: GraphIR,
  currentNodes: Node<SymbolNodeData>[],
): GraphIR {
  const serializedById = new Map<string, GraphIR['nodes'][number]>();
  const index = (nodes: GraphIR['nodes']) => nodes.forEach((node) => {
    serializedById.set(node.id, node);
    index(node.children ?? []);
  });
  index(serializedCurrent.nodes);
  const refresh = (nodes: GraphIR['nodes']): GraphIR['nodes'] => nodes.map((node) => {
    const current = serializedById.get(node.id);
    if (!current) return node;
    const { children: _currentChildren, ...currentFields } = current;
    return {
      ...node,
      ...currentFields,
      ...(node.children ? { children: refresh(node.children) } : {}),
    };
  });
  return materializeRenderGraph({
    ...canonical,
    nodes: refresh(canonical.nodes),
    edges: serializedCurrent.edges,
  }, currentNodes);
}

export { projectedMetadata };
