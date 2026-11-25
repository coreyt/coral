/** Graph-absolute waypoint adapter over the shared render geometry owner. */
import { catalogSymbol029, resolveNotationNode028, semanticLayoutPorts028, RenderCapabilityError,
  type DocumentCatalog029 } from '@coral-viz/render';
import { resolveRouteContacts, routeFixedGeometry, RouteGeometryError, constrainFreePortAttachment, validateRouteGeometryAtNodes,
  type LayoutDirection, type LayoutPort, type ResolvedNodeRect } from '@coral-viz/render/layout';
import { convertFlowToGraphEdges, convertFlowToGraphNodes } from '../editor/converter.js';
import type { CoralNode, CoralEdge, Position, GraphIR, GraphNode } from '../types.js';
import type { EdgeWaypoint } from './types.js';

export interface RoutedPath {
  startPoint: Position;
  endPoint: Position;
  bendPoints: Position[];
}
export interface WaypointRoutingOptions {
  direction?: LayoutDirection;
  notation?: string;
  routingStyle?: 'orthogonal' | 'polyline';
  /** Durable routes are resolved by the shared source layout, not transient overrides. */
  sourceRouteEdgeIds?: readonly string[];
}

/** Convert parent-local React Flow rectangles exactly once at this boundary. */
function absoluteRectangles(nodes: CoralNode[]): ResolvedNodeRect[] {
  const index = new Map(nodes.map((node) => [node.id, node]));
  if (index.size !== nodes.length) throw new Error('Waypoint routing requires unique node identities');
  const solved = new Map<string, ResolvedNodeRect>();
  const resolving = new Set<string>();
  const solve = (node: CoralNode): ResolvedNodeRect => {
    const known = solved.get(node.id);
    if (known) return known;
    if (resolving.has(node.id)) throw new Error(`Node "${node.id}" has cyclic parent geometry`);
    resolving.add(node.id);
    const parent = node.parentId ? index.get(node.parentId) : undefined;
    if (node.parentId && !parent) throw new Error(`Node "${node.id}" has a missing parent`);
    const offset = parent ? solve(parent).absolutePosition : { x: 0, y: 0 };
    const width = node.measured?.width ?? node.width ??
      (typeof node.style?.width === 'number' ? node.style.width : undefined) ?? node.data.canonical?.dimensions?.width ?? 100;
    const height = node.measured?.height ?? node.height ??
      (typeof node.style?.height === 'number' ? node.style.height : undefined) ?? node.data.canonical?.dimensions?.height ?? 50;
    if (![node.position.x, node.position.y, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
      throw new Error(`Node "${node.id}" has invalid geometry`);
    const rect: ResolvedNodeRect = { id: node.id, ...(node.parentId ? { parentId: node.parentId } : {}),
      position: { ...node.position }, absolutePosition: { x: offset.x + node.position.x, y: offset.y + node.position.y }, width, height };
    resolving.delete(node.id);
    solved.set(node.id, rect);
    return rect;
  };
  return nodes.map(solve);
}

/** Route exact transient editor checkpoints without modifying durable source intent. */
export function routeWithWaypoints(
  nodes: CoralNode[], edges: CoralEdge[], waypointMap?: Map<string, EdgeWaypoint[]>,
  options: WaypointRoutingOptions = {},
): Map<string, RoutedPath> {
  const sourceOwned = new Set(options.sourceRouteEdgeIds ?? []);
  edges = edges.filter((edge) => !edge.data?.canonical?.routeIntent && !sourceOwned.has(edge.id));
  if (!edges.length) return new Map();
  if (new Set(edges.map((edge) => edge.id)).size !== edges.length) throw new Error('Waypoint routing requires unique edge identities');
  const rects = absoluteRectangles(nodes);
  const flowIndex = new Map(nodes.map((node) => [node.id, node]));
  const inferredDirection = nodes.find((node) => node.data.layoutDirection)?.data.layoutDirection as LayoutDirection | undefined;
  const direction = options.direction ?? inferredDirection ?? 'DOWN';
  const notation = options.notation ?? nodes.find((node) => node.data.notationId)?.data.notationId;
  const graphNodes = convertFlowToGraphNodes(nodes, []);
  // One parse shares one document catalog across its nodes; user symbols resolve only through it.
  const catalog = nodes.map((node) => node.data.documentCatalog029 as DocumentCatalog029 | undefined)
    .find((item) => item !== undefined);
  const prepareNode = (node: GraphNode): GraphNode => {
    const flow = flowIndex.get(node.id)!;
    const symbol = Object.prototype.hasOwnProperty.call(flow.data.canonical ?? {}, 'symbol') ? flow.data.canonical?.symbol : flow.data.symbolId as string | undefined;
    const variant = flow.data.variant as string | undefined ?? flow.data.canonical?.variant;
    let ports = node.ports;
    if (ports === undefined && notation) {
      const interpretation = resolveNotationNode028({ id: node.id, type: node.type ?? 'node',
        ...(symbol !== undefined ? { symbol } : {}), ...(variant !== undefined ? { variant } : {}),
        ...(flow.data.authoredSemanticPorts !== undefined ? { authoredPorts: flow.data.authoredSemanticPorts } : {}) },
      notation, catalog);
      ports = semanticLayoutPorts028(interpretation,
        interpretation.effectiveSymbolId ? catalogSymbol029(interpretation.effectiveSymbolId, catalog) : undefined,
        interpretation.effectiveVariantId, direction).ports;
    }
    // Connected semantic free ports already carry an accepted layout choice
    // in the editor projection. A checkpoint edit must preserve that contact.
    const sides = flow.data.resolvedPortAttachments as Readonly<Record<string, LayoutPort['side']>> | undefined;
    const positions = flow.data.resolvedPortPositions as Readonly<Record<string, number>> | undefined;
    if (ports) ports = (ports as LayoutPort[]).map((port) => port.attachment === 'free' && sides?.[port.id]
      ? { ...port, ...constrainFreePortAttachment(port, { side: sides[port.id]!, position: positions?.[port.id] ?? port.position }) }
      : port);
    return { ...node, ...(symbol !== undefined ? { symbol } : {}), ...(variant !== undefined ? { variant } : {}),
      ...(ports !== undefined ? { ports } : {}), ...(node.children ? { children: node.children.map(prepareNode) } : {}) };
  };
  const graph: GraphIR = { version: '3.0.0', id: 'waypoint-routing', nodes: graphNodes.map(prepareNode),
    edges: convertFlowToGraphEdges(edges), ...(notation ? { metadata: { notation } } : {}) };
  const contacts = resolveRouteContacts(graph, rects, { direction, waypoints: waypointMap,
    ...(catalog ? { documentCatalog029: catalog } : {}) });
  const rectIndex = new Map(rects.map((rect) => [rect.id, rect]));
  const result = new Map<string, RoutedPath>();
  for (const edge of edges) {
    const contact = contacts.get(edge.id);
    if (!contact) throw new RouteGeometryError(edge.id, [{ code: 'route.endpoint', message: 'Route endpoint is unavailable' }]);
    const related = new Set([edge.source, edge.target]);
    for (const id of [edge.source, edge.target]) {
      let parent = rectIndex.get(id)?.parentId;
      while (parent) { related.add(parent); parent = rectIndex.get(parent)?.parentId; }
    }
    const obstacles = rects.filter((rect) => !related.has(rect.id)).map((rect) => ({
      id: rect.id, x: rect.absolutePosition.x, y: rect.absolutePosition.y, width: rect.width, height: rect.height,
    }));
    const request = { id: edge.id, sourceId: edge.source, targetId: edge.target,
      ...contact, obstacles, waypoints: waypointMap?.get(edge.id), routingStyle: options.routingStyle };
    let sections = routeFixedGeometry(request);
    try { validateRouteGeometryAtNodes(graph, rects, new Map([[edge.id, sections]]), direction, catalog); }
    catch (error) {
      if (!(error instanceof RenderCapabilityError) || !error.diagnostics.some((issue) => issue.code === 'render.capability.route')) throw error;
      // A legal terminal leg can still be followed by a later excursion
      // through an endpoint. Repair with explicit outside-frame escapes and
      // occupied endpoint envelopes, then check the real painted contours.
      const frame = (id: string) => {
        const rect = rectIndex.get(id)!;
        return { id, x: rect.absolutePosition.x, y: rect.absolutePosition.y, width: rect.width, height: rect.height };
      };
      sections = routeFixedGeometry({ ...request, sourceBounds: frame(edge.source), targetBounds: frame(edge.target) });
      validateRouteGeometryAtNodes(graph, rects, new Map([[edge.id, sections]]), direction, catalog);
    }
    const points = sections.flatMap((section, index) => [
      ...(index ? [] : [section.startPoint]), ...section.bendPoints, section.endPoint,
    ]);
    result.set(edge.id, { startPoint: { ...points[0]! }, endPoint: { ...points[points.length - 1]! },
      bendPoints: points.slice(1, -1).map((point) => ({ ...point })) });
  }
  return result;
}

/** A serializable view of the user-symbol definition a node selects; a catalog prints as `{}`. */
function userSymbolRoutingValue029(node: CoralNode): unknown {
  const catalog = node.data.documentCatalog029 as DocumentCatalog029 | undefined;
  const symbolId = node.data.canonical?.symbol ?? node.data.symbolId;
  const user = typeof symbolId === 'string' ? catalog?.userSymbols.get(symbolId) : undefined;
  if (!user) return undefined;
  const { outline, definition } = user;
  return [outline.symbolId, outline.outline, outline.width, outline.height,
    definition.anchors.map((anchor) => anchor.kind === 'boundary'
      ? [anchor.id, anchor.kind, anchor.side, anchor.at] : [anchor.id, anchor.kind, anchor.x, anchor.y, anchor.exit]),
    definition.ports.map((port) => [port.id, port.anchor, port.maxConnections])];
}

/** Content-based invalidation also catches in-place geometry updates from adapters.
 * View callbacks and selection state are intentionally excluded. */
export function waypointRoutingKey(nodes: CoralNode[], edges: CoralEdge[], waypoints: Map<string, EdgeWaypoint[]>, options?: WaypointRoutingOptions): string {
  return JSON.stringify({ nodes: nodes.map((node) => [node.id, node.parentId, node.position,
    node.width, node.height, node.measured, node.style?.width, node.style?.height,
    node.data.nodeType, node.data.symbolId, node.data.variant, node.data.notationId,
    node.data.layoutDirection, node.data.canonical, node.data.authoredSemanticPorts,
    node.data.resolvedPortAttachments, node.data.resolvedPortPositions, userSymbolRoutingValue029(node)]),
  edges: edges.map((edge) => [edge.id, edge.source, edge.target, edge.sourceHandle, edge.targetHandle, edge.data?.canonical]),
  waypoints: [...waypoints], options });
}
