import type { SpatialSidecar028 } from '../layout/typedSpatial028.js';
/**
 * The one layout-for-SVG projection behind `coral_render` and the browser
 * package: a sequence graph keeps its interaction and skips ELK; any other
 * graph is sized, laid out with ELK, and flattened with graph-absolute routes.
 * Callers validate first; this module does not.
 */
import type { GraphIR } from '@graph-ir/core';
import { editionAdmits0214 } from '@coral-viz/language';
import type { GraphEdge, GraphNode } from '../types.js';
import type { LayoutDirection, ResolvedLayoutDiagnostic } from '../layout/types.js';
import { resolveSpatialLayout } from '../layout/spatial.js';
import { resolveNotationNode028 } from '../notations/index.js';
import type { NodeInterpretation028 } from '../interpretation028.js';
import { assertSemanticSidecar028 } from '../semanticSidecar028.js';
import { assertProfileNotationAgreement028, assertRenderableInterpretation028 } from '../scene.js';
import { effectiveGraphNotationId028 } from '../graphNotation028.js';
import { semanticLayoutPorts028 } from '../semanticLayoutPorts028.js';
import { isSequenceRenderGraph, type SequenceDisplayTree028 } from '../sequence.js';
import type { SuccessorSourceInteraction028 } from '../successorSourceProjection028.js';
import { catalogSymbol029 } from '../catalogLookup029.js';
import { catalogForInterpretations029, documentCatalog029, type DocumentCatalog029 } from '../documentCatalog029.js';
import { containerAutomaticPadding028, containerLayoutOptions028, measureSvgNode, usesPortableSvgFonts, type SvgOptions } from './serialize.js';

export interface SvgLayoutOptions {
  /** Default `RIGHT`. */
  direction?: LayoutDirection;
  /** Default 50. */
  nodeSpacing?: number;
  /** Default `nodeSpacing + 30`. */
  layerSpacing?: number;
  /** Decides whether missing dimensions are measured with portable fonts. */
  svgOptions?: SvgOptions;
  /** Source-owned U1 interpretations. Geometry is derived for this layout only. */
  semanticInterpretations?: ReadonlyMap<string, NodeInterpretation028>;
}

export interface SvgLayoutGraph {
  id?: string;
  name?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata?: { notation?: string; custom?: Record<string, unknown> };
  profile?: GraphIR['profile'];
  interaction?: GraphIR['interaction'];
  recursiveFragments028?: SequenceDisplayTree028;
  sourceTimeline028?: SuccessorSourceInteraction028;
  labelBounds028?: SpatialSidecar028['labelBounds028'];
  layoutOptions028?: SpatialSidecar028['layoutOptions028'];
  spatialConstraints028?: SpatialSidecar028['spatialConstraints028'];
  edgeRoutes: NonNullable<SvgOptions['edgeRoutes']>;
  layoutDiagnostics028?: ResolvedLayoutDiagnostic[];
}

/** Layout-only GraphIR 3 projection; semantic ports do not become authored geometric ports. */
function projectCatalogPortsForSvg(graph: GraphIR, direction: LayoutDirection, notation?: string,
  interpretations?: ReadonlyMap<string, NodeInterpretation028>, catalog?: DocumentCatalog029,
  preserveOmittedPorts = false): GraphIR {
  if (interpretations) assertSemanticSidecar028(graph, notation, interpretations);
  if (!notation) return graph;
  assertRenderableInterpretation028(graph.nodes, notation, graph.profile, catalog);
  const defaults = new Map<string, { source?: string; target?: string }>();
  const projectedPortNodes = new Set<string>();
  const authoredSemanticPorts = new Map<string, Set<string>>();
  const visit = (nodes: GraphNode[]): GraphNode[] => nodes.map((node) => {
    const children = node.children ? visit(node.children) : undefined;
    if (node.ports !== undefined) return { ...node, ...(children ? { children } : {}) };
    const interpreted = interpretations?.get(node.id) ?? resolveNotationNode028(node, notation, catalog);
    const symbol = interpreted.effectiveSymbolId
      ? catalogSymbol029(interpreted.effectiveSymbolId, catalog) : undefined;
    const projection = semanticLayoutPorts028(interpreted, symbol, node.variant, direction);
    projectedPortNodes.add(node.id);
    authoredSemanticPorts.set(node.id, new Set(interpreted.semanticPorts
      .filter((port) => port.origin === 'authored').map((port) => port.id)));
    defaults.set(node.id, { source: projection.sourceDefault, target: projection.targetDefault });
    return { ...node, ...(projection.ports.length ? { ports: projection.ports } : {}),
      ...(children ? { children } : {}) };
  });
  const nodes = visit(graph.nodes);
  // The successor sidecar is source-owned: an omitted semantic-port reference
  // must remain omitted even in the temporary layout graph. ELK may choose a
  // node-boundary attachment; it must not turn the first named port into intent.
  const edges = (interpretations || preserveOmittedPorts) ? graph.edges : graph.edges.map((edge) => ({ ...edge,
    sourcePort: edge.sourcePort ?? defaults.get(edge.source)?.source,
    targetPort: edge.targetPort ?? defaults.get(edge.target)?.target,
  }));
  // Idle catalog ports still occupy ELK slots. On a class with no named-port
  // edges, those unused slots displace ordinary connector contacts and create
  // bends on an otherwise straight spine. Keep ports used by this layout and
  // authored semantic ports, while leaving geometric ports and source untouched.
  // A waypoint anchor uses its catalog port even without an endpoint reference.
  const referenced = new Map<string, Set<string>>();
  const retain = (nodeId: string, portId: string | undefined): void => {
    if (!portId) return;
    const ids = referenced.get(nodeId) ?? new Set<string>();
    ids.add(portId);
    referenced.set(nodeId, ids);
  };
  for (const edge of edges) {
    retain(edge.source, edge.sourcePort);
    retain(edge.target, edge.targetPort);
    for (const waypoint of edge.routeIntent?.waypoints ?? []) {
      if (waypoint.placement.kind !== 'relative') continue;
      const { anchor } = waypoint.placement;
      if (anchor.kind === 'port') retain(anchor.nodeId, anchor.portId);
    }
  }
  const prune = (items: GraphNode[]): GraphNode[] => items.map((node) => {
    const children = node.children ? prune(node.children) : undefined;
    if (!projectedPortNodes.has(node.id) || !node.ports) {
      return children ? { ...node, children } : node;
    }
    const ports = node.ports.filter((port) => referenced.get(node.id)?.has(port.id)
      || authoredSemanticPorts.get(node.id)?.has(port.id));
    const { ports: _projected, ...rest } = node;
    return { ...rest, ...(ports.length ? { ports } : {}), ...(children ? { children } : {}) };
  });
  return { ...graph, nodes: prune(nodes), edges };
}

export async function layoutGraphForSvg(graph: GraphIR, options: SvgLayoutOptions = {}): Promise<SvgLayoutGraph> {
  assertProfileNotationAgreement028(effectiveGraphNotationId028(graph), graph.profile);
  if (options.semanticInterpretations) {
    assertSemanticSidecar028(graph, options.svgOptions?.notation ?? effectiveGraphNotationId028(graph),
      options.semanticInterpretations);
  }
  if (isSequenceRenderGraph(graph)) {
    if (options.semanticInterpretations) {
      throw new Error('render.capability.semantic-port-sidecar: sequence display does not consume semantic interpretations');
    }
    const sequence: SvgLayoutGraph = {
      id: graph.id, ...(graph.name !== undefined ? { name: graph.name } : {}),
      nodes: graph.nodes, edges: graph.edges,
      ...(graph.metadata?.notation ? { metadata: { notation: graph.metadata.notation } } : {}),
      ...(graph.profile ? { profile: graph.profile } : {}),
      interaction: graph.interaction, edgeRoutes: new Map(),
      ...((graph as GraphIR & { recursiveFragments028?: SequenceDisplayTree028 }).recursiveFragments028
        ? { recursiveFragments028: (graph as GraphIR & { recursiveFragments028: SequenceDisplayTree028 }).recursiveFragments028 }
        : {}),
    };
    const timeline = (graph as GraphIR & { sourceTimeline028?: SuccessorSourceInteraction028 }).sourceTimeline028;
    if (timeline) Object.defineProperty(sequence, 'sourceTimeline028', { value: timeline, enumerable: false });
    return sequence;
  }
  const authoredDirection = (graph as SpatialSidecar028).layoutOptions028?.direction;
  if (authoredDirection) options = { ...options, direction: authoredDirection };
  const svgOptions = { ...options.svgOptions,
    layoutDirection: options.direction ?? 'RIGHT',
    notation: options.svgOptions?.notation ?? effectiveGraphNotationId028(graph) };
  // A user symbol's frame is exactly its definition size; labels never resize it.
  const graphEdition = typeof graph.metadata?.custom?.coralEdition === 'string'
    ? graph.metadata.custom.coralEdition : undefined;
  const is0214 = graphEdition !== undefined && editionAdmits0214(graphEdition);
  const documentCatalog = svgOptions.notation
    ? options.semanticInterpretations
      ? catalogForInterpretations029(svgOptions.notation, options.semanticInterpretations, graphEdition)
      : is0214 ? documentCatalog029(svgOptions.notation, [], graphEdition) : undefined
    : undefined;
  const catalog = documentCatalog && (documentCatalog.userSymbols.size > 0 || is0214) ? documentCatalog : undefined;
  const catalogSvgOptions = catalog ? { ...svgOptions, documentCatalog029: catalog } : svgOptions;
  const metadata = graph.metadata?.notation || graph.metadata?.custom
    ? { metadata: {
      ...(graph.metadata?.notation ? { notation: graph.metadata.notation } : {}),
      ...(graph.metadata?.custom ? { custom: graph.metadata.custom } : {}),
    } }
    : {};
  const profile = graph.profile ? { profile: graph.profile } : {};
  if (graph.nodes.length === 0) {
    const empty: SvgLayoutGraph = { nodes: [], edges: graph.edges, ...metadata, ...profile, edgeRoutes: new Map() };
    if (catalog) {
      Object.defineProperty(empty, 'documentCatalog029', { value: catalog, enumerable: false });
      Object.defineProperty(empty, 'semanticInterpretations029',
        { value: options.semanticInterpretations, enumerable: false });
    }
    return empty;
  }

  const hifiDefaults = svgOptions.style === 'hifi' && svgOptions.notation !== 'uml-class';
  const nodeSpacing = options.nodeSpacing ?? (hifiDefaults ? 36 : 50);
  const layerSpacing = options.layerSpacing ?? (hifiDefaults ? 54 : nodeSpacing + 30);
  const frameOf = (node: GraphNode) => options.semanticInterpretations?.get(node.id)?.userSymbol029?.outline;
  const automaticPadding028 = new Map<string, NonNullable<NonNullable<GraphNode['layoutOptions']>['padding']>>();
  const addMissingDimensions = (nodes: GraphNode[]): GraphNode[] => nodes.map((node) => {
    const automatic = containerAutomaticPadding028(node, catalogSvgOptions);
    if (automatic) automaticPadding028.set(node.id, automatic);
    return {
    ...node,
    layoutOptions: containerLayoutOptions028(node, catalogSvgOptions),
    ...(!node.dimensions && !node.children?.length && usesPortableSvgFonts(catalogSvgOptions)
      ? { dimensions: measureSvgNode(node, catalogSvgOptions) } : {}),
    ...(frameOf(node) ? { dimensions: { width: frameOf(node)!.width, height: frameOf(node)!.height } } : {}),
    ...(node.children ? { children: addMissingDimensions(node.children) } : {}),
  };
  });
  const sizedGraph = { ...graph, nodes: addMissingDimensions(graph.nodes) };

  const layoutGraph = projectCatalogPortsForSvg(
    sizedGraph, options.direction ?? 'RIGHT', svgOptions.notation, options.semanticInterpretations, catalog, is0214,
  );
  const result = await resolveSpatialLayout({
    revision: `svg:${graph.id}`,
    graph: layoutGraph,
    operation: 'load',
    proximitySceneOptions: catalogSvgOptions,
    ...(automaticPadding028.size ? { automaticPadding028 } : {}),
    ...(catalog ? { documentCatalog029: catalog } : {}),
    defaults: {
      algorithm: 'layered',
      direction: options.direction ?? 'RIGHT',
      spacing: { nodeNode: nodeSpacing, layerSpacing },
      hierarchyHandling: 'INCLUDE_CHILDREN',
    },
  });
  const layoutNodes = new Map(result.nodes.map((node) => [node.id, node]));
  const materialize = (nodes: GraphNode[]): GraphNode[] => nodes.flatMap((node) => {
    const laid = layoutNodes.get(node.id);
    const position = { x: laid?.absolutePosition.x ?? 0, y: laid?.absolutePosition.y ?? 0 };
    const { children, ...rest } = node;
    const current = {
      ...rest,
      ...(laid?.parentId ? { parent: laid.parentId } : {}),
      position,
      dimensions: node.dimensions ?? (laid ? { width: laid.width, height: laid.height } : undefined),
    } as GraphNode;
    return [current, ...materialize(children ?? [])];
  });
  const laidOut: SvgLayoutGraph = {
    nodes: materialize(sizedGraph.nodes),
    ...(result.labelBounds028 ? { labelBounds028: result.labelBounds028 } : {}),
    ...((graph as SpatialSidecar028).layoutOptions028 ? { layoutOptions028: (graph as SpatialSidecar028).layoutOptions028 } : {}),
    ...((graph as SpatialSidecar028).spatialConstraints028 ? { spatialConstraints028: (graph as SpatialSidecar028).spatialConstraints028 } : {}),
    edges: sizedGraph.edges,
    ...metadata,
    ...profile,
    edgeRoutes: new Map(result.edges.map((edge) => [edge.id, edge.sections])),
    ...(result.diagnostics.length ? { layoutDiagnostics028: result.diagnostics } : {}),
  };
  // The scene resolves user symbols through the same catalog and draws escapes
  // from the parse interpretations; neither is serialized.
  if (catalog) {
    Object.defineProperty(laidOut, 'documentCatalog029', { value: catalog, enumerable: false });
    Object.defineProperty(laidOut, 'semanticInterpretations029',
      { value: options.semanticInterpretations, enumerable: false });
  }
  return laidOut;
}
