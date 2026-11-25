/**
 * Diagram utility functions extracted from App.tsx.
 * Pure functions for symbol mapping, node sizing, ELK layout, and edge conversion.
 */

import type { Node, Edge } from '@xyflow/react';
import type { GraphNode, GraphEdge } from '../parsers';
import type { GraphIR } from '../printer';
import type { DiagramFontSettings, NodeConnectionInfo, SymbolNodeData } from '@coral-viz/viz';
import {
  CORAL_EDGE_VIEW_METADATA,
  CORAL_NODE_VIEW_METADATA,
  normalizeDiagramFontSettings,
  DEFAULT_FONT_SETTINGS,
  resolvePositions,
  incrementalLayout,
  resolveNotationLayout,
  type ElkEdgeRouting,
  type LayoutSettings,
  type DiffableGraph,
  type Position,
} from '@coral-viz/viz';
import {
  containerAutomaticPadding028,
  containerLayoutOptions028,
  computeNodeSize,
  bpmnEventMinimumSize028,
  isBpmnEventSymbol028,
  bpmnGatewayMinimumSize028,
  bpmnGatewayLabelLayout028,
  isBpmnGatewaySymbol028,
  classifierMinimumSize,
  fitClassifierFrame028,
  fitPlainRectangleInk028,
  layoutNodeLabel,
  markerId,
  resolveEdgeAppearance,
  resolveSymbolIndex,
  resolveDiagramFont,
  visualStyle028,
  resolveNotationNode028,
  notationCatalogIdentity028,
  semanticLayoutPorts028,
  catalogForInterpretations029,
  catalogSymbol029,
  escapeOffsets029,
  type DocumentCatalog029,
  type NodeInterpretation028,
  type SemanticPortInput,
  type SpatialSidecar028,
  mergeAuthoredLayoutOptions028,
} from '@coral-viz/render';
import type {
  LayoutNode as SharedLayoutNode,
  LayoutPort,
  LayoutDirection,
  LayoutRequest,
  ResolvedLayoutDiagnostic,
  SpatialLayoutOperation,
} from '@coral-viz/render/layout';
import { attachmentFromBoundaryPoint, constrainFreePortAttachment,
  authoredLabelLayerSpacing028, classGeneralizationRankEdges028, codeBranchRoutingDefaults028, resolveSpatialLayout,
  LayoutExecutionError, normalizeLayoutOptions, SpatialLayoutError,
  userSymbolOutsideLabels029 } from '@coral-viz/render/layout';
import { runEditorLayout } from '../layoutWorkerClient';
import {
  type NotationType,
} from '../notationSemantics';

const INCREMENTAL_LAYOUT_DIRECTION = 'DOWN' as const;
const INCREMENTAL_LAYOUT_SPACING = 50;

export type { NotationType } from '../notationSemantics';

/** Result from layoutNodes including edge routing from ELK */
export interface LayoutResult {
  labelBounds028?: SpatialSidecar028['labelBounds028'];
  nodes: Node<SymbolNodeData>[];
  edgeRouting: Map<string, ElkEdgeRouting>;
  diagnostics: ResolvedLayoutDiagnostic[];
}

/** Reference-editor incremental layout path, paired with layoutNodes above. */
export async function resolveIncrementalEditorPositions(
  previousGraph: DiffableGraph,
  nextGraph: DiffableGraph,
  currentPositions: Map<string, Position>,
  projectedNodes: Node<SymbolNodeData>[],
  edges: GraphEdge[],
  signal?: AbortSignal,
): Promise<Map<string, Position>> {
  const resolution = resolvePositions(previousGraph, nextGraph, currentPositions);
  if (resolution.needsLayout.length === 0) return resolution.positions;
  return incrementalLayout(
    projectedNodes.map((node) => ({
      id: node.id,
      type: node.data.nodeType,
      label: node.data.label,
      width: node.width!,
      height: node.height!,
      ...(node.parentId ? { parentId: node.parentId } : {}),
    })),
    edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    resolution.positions,
    resolution.needsLayout,
    { direction: INCREMENTAL_LAYOUT_DIRECTION, spacing: INCREMENTAL_LAYOUT_SPACING },
    signal,
  );
}

/**
 * Edge-compatibility identity for projected canvas nodes (CORAL-REQ-010).
 * Variant precedence mirrors the shared U1 resolver: a top-level variant
 * wins. Extension `properties.variant` never changes semantic meaning.
 * Canvas appearance uses the same top-level-then-canonical variant precedence.
 */
export function buildNodeConnectionInfo(
  nodes: Node<SymbolNodeData>[],
  notation: NotationType,
): Map<string, NodeConnectionInfo> {
  const info = new Map<string, NodeConnectionInfo>();
  for (const node of nodes) {
    const { data } = node;
    const variant = data.variant ?? data.canonical?.variant;
    const catalog = data.documentCatalog029 as DocumentCatalog029 | undefined;
    const interpretation = resolveNotationNode028({ id: node.id, type: data.nodeType ?? 'node',
      ...(data.canonical?.symbol !== undefined ? { symbol: data.canonical.symbol } : {}),
      ...(variant !== undefined ? { variant } : {}),
      ...(data.authoredSemanticPorts !== undefined ? { authoredPorts: data.authoredSemanticPorts } : {}),
    }, notation, catalog);
    let resolutionIssue: NodeConnectionInfo['resolutionIssue'];
    if (interpretation.status === 'unknown-symbol' || interpretation.status === 'unknown-variant') {
      resolutionIssue = interpretation.diagnostics[0];
    } else if (interpretation.portCollisions.length) {
      resolutionIssue = interpretation.diagnostics.find((diagnostic) => diagnostic.code === 'coral.port.duplicate');
    } else if (data.authoredSemanticPorts !== undefined && data.canonical?.ports !== undefined) {
      resolutionIssue = { code: 'coral.port.legacy-conflict',
        message: 'Legacy geometric ports cannot replace semantic ports' };
    }
    info.set(node.id, {
      id: node.id,
      symbolId: data.symbolId || 'unknown',
      variant,
      // GraphIR 3 geometry remains separate from the additive U1 view seam.
      ...(data.canonical?.ports !== undefined && data.authoredSemanticPorts === undefined
        ? { ports: data.canonical.ports } : {}),
      semanticPorts: interpretation.semanticPorts.map((port) => ({ id: port.id,
        direction: port.direction, ...(port.label !== undefined ? { label: port.label } : {}),
        ...(port.maxConnections !== undefined ? { maxConnections: port.maxConnections } : {}) })),
      ...(catalog ? { documentCatalog029: catalog } : {}),
      ...(resolutionIssue ? { resolutionIssue } : {}),
    });
  }
  return info;
}

/** Drag feedback must expose exactly the ports used by connection validation. */
export function editorHandlePorts(info: NodeConnectionInfo | undefined):
  { id: string; direction: 'in' | 'out' | 'inout' }[] | undefined {
  if (!info || info.resolutionIssue) return undefined;
  if (info.ports !== undefined) return info.ports.flatMap((port) => {
    const direction = port.properties?.direction ?? 'inout';
    return direction === 'in' || direction === 'out' || direction === 'inout'
      ? [{ id: port.id, direction }] : [];
  });
  return info.semanticPorts?.map((port) => ({ id: port.id, direction: port.direction })) ?? [];
}

/** One port as the editor resolves it for inference, layout, and validation. */
export interface EffectiveNodePort {
  id: string;
  side: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
  position?: number;
  direction: 'in' | 'out' | 'inout';
  /** False for an authored `properties.direction` outside in/out/inout. */
  directionValid: boolean;
  rawDirection?: unknown;
}

/**
 * Effective ports (R-063 AC-3): an explicit `ports` list is complete, even
 * when empty, and reads direction from `properties.direction` (omitted means
 * `inout`); otherwise shared U1 interpretation supplies catalog port IDs and
 * directions. Returns undefined for a generic node with no authored list.
 */
function interpretationForNode(node: GraphNode, notation: NotationType,
  semanticInterpretations?: ReadonlyMap<string, NodeInterpretation028>): NodeInterpretation028 {
  if (!semanticInterpretations) return resolveNotationNode028(node, notation);
  const interpreted = semanticInterpretations.get(node.id);
  const installedCatalog = notationCatalogIdentity028(notation);
  if (!interpreted || interpreted.nodeId !== node.id || interpreted.authoredType !== node.type ||
    interpreted.authoredSymbol !== node.symbol || interpreted.authoredVariant !== node.variant ||
    !installedCatalog || interpreted.catalogIdentity.id !== installedCatalog.id ||
    interpreted.catalogIdentity.version !== installedCatalog.version ||
    interpreted.catalogIdentity.digest !== installedCatalog.digest) {
    throw new Error(`coral.editor.semantic-port-sidecar: ${node.id} has no matching interpretation`);
  }
  if (node.ports !== undefined) {
    throw new Error(`coral.editor.semantic-port-sidecar: ${node.id} mixes geometric and semantic ports`);
  }
  return interpreted;
}

export function effectiveNodePorts(node: GraphNode, notation: NotationType,
  semanticInterpretations?: ReadonlyMap<string, NodeInterpretation028>): EffectiveNodePort[] | undefined {
  if (semanticInterpretations) interpretationForNode(node, notation, semanticInterpretations);
  if (node.ports !== undefined) {
    return node.ports.map((port) => {
      const raw = port.properties?.direction;
      const valid = raw === undefined || raw === 'in' || raw === 'out' || raw === 'inout';
      return {
        id: port.id, side: port.side,
        ...(port.position !== undefined ? { position: port.position } : {}),
        direction: valid && raw !== undefined ? raw as EffectiveNodePort['direction'] : 'inout',
        directionValid: valid,
        ...(raw !== undefined ? { rawDirection: raw } : {}),
      };
    });
  }
  const interpretation = interpretationForNode(node, notation, semanticInterpretations);
  if (interpretation.status === 'generic' && interpretation.semanticPorts.length === 0) return undefined;
  const symbol = interpretation.userSymbol029?.symbol ?? (interpretation.effectiveSymbolId
    ? catalogSymbol029(interpretation.effectiveSymbolId) : undefined);
  const geometry = (node.variant ? symbol?.variants?.[node.variant]?.ports : undefined) ?? symbol?.ports;
  return interpretation.semanticPorts.map((port) => {
    const registered = geometry?.find((item) => item.id === port.id);
    return { id: port.id, side: registered?.anchor ?? 'NORTH',
      ...(registered?.position !== undefined ? { position: registered.position } : {}),
      direction: port.direction, directionValid: true };
  });
}

const acceptsSource = (port: EffectiveNodePort) => port.direction === 'out' || port.direction === 'inout';
const acceptsTarget = (port: EffectiveNodePort) => port.direction === 'in' || port.direction === 'inout';

/** Remove ELK routes whose endpoint geometry changes in a post-layout recovery overlay. */
export function retainRoutesAfterPositionOverlay(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  laidNodes: Node<SymbolNodeData>[],
  routes: Map<string, ElkEdgeRouting>,
  positions: Record<string, Position>,
): Map<string, ElkEdgeRouting> {
  const nodesById = new Map(graphNodes.map((node) => [node.id, node]));
  const laidById = new Map(laidNodes.map((node) => [node.id, node]));
  const moved = new Set(Object.entries(positions)
    .filter(([id, position]) => {
      const laid = laidById.get(id);
      return nodesById.has(id) && laid !== undefined
        && (position.x !== laid.position.x || position.y !== laid.position.y);
    })
    .map(([id]) => id));
  const movedByAncestor = (nodeId: string): boolean => {
    let node = nodesById.get(nodeId);
    while (node) {
      if (moved.has(node.id)) return true;
      node = node.parent ? nodesById.get(node.parent) : undefined;
    }
    return false;
  };
  const retained = new Map<string, ElkEdgeRouting>();
  for (const edge of graphEdges) {
    const route = routes.get(edge.id);
    if (route && !movedByAncestor(edge.source) && !movedByAncestor(edge.target)) {
      retained.set(edge.id, route);
    }
  }
  return retained;
}

function canonicalNodeData(node: GraphNode) {
  const {
    id: _id,
    type: _type,
    label: _label,
    description: _description,
    properties: _properties,
    position: _position,
    pinned: _pinned,
    ...canonical
  } = node;
  return canonical;
}

function canonicalEdgeData(edge: GraphEdge) {
  const {
    id: _id,
    source: _source,
    target: _target,
    sourcePort: _sourcePort,
    targetPort: _targetPort,
    type: _type,
    label: _label,
    properties: _properties,
    routingPoints: _routingPoints,
    lineStyle: _lineStyle,
    ...canonical
  } = edge;
  return canonical;
}

/** Both visual families share one generated node layout. */
function layoutFontVariants028(fontSettings?: DiagramFontSettings) {
  const safeFont = normalizeDiagramFontSettings(fontSettings);
  const requestedDefault = safeFont.default;
  const legacyDefault = requestedDefault.family === DEFAULT_FONT_SETTINGS.family &&
    requestedDefault.size === DEFAULT_FONT_SETTINGS.size &&
    requestedDefault.weight === DEFAULT_FONT_SETTINGS.weight &&
    requestedDefault.lineHeight === DEFAULT_FONT_SETTINGS.lineHeight;
  const visual = visualStyle028('lowfi');
  const lowfi = legacyDefault ? {
    ...safeFont,
    default: { family: visual.fontFamily, size: visual.labelSize, weight: 500, lineHeight: 1.4 },
  } : safeFont;
  const hifi = visualStyle028('hifi');
  const hifiFonts = legacyDefault ? {
    ...safeFont,
    default: { family: hifi.fontFamily, size: hifi.labelSize, weight: 600, lineHeight: 1.4 },
  } : safeFont;
  return { lowfi, hifi: hifiFonts, legacyDefault };
}

/** Build font-aware React Flow nodes without performing or depending on layout. */
export function projectDiagramNodes(
  graphNodes: GraphNode[],
  notation: NotationType,
  fontSettings?: DiagramFontSettings,
  sizingMode: 'adaptive' | 'uniform' | 'hybrid' = 'adaptive',
  layoutDirection: LayoutDirection = 'DOWN',
  semanticInterpretations?: ReadonlyMap<string, NodeInterpretation028>,
): Node<SymbolNodeData>[] {
  const { lowfi: layoutFonts, hifi: hifiFonts, legacyDefault } = layoutFontVariants028(fontSettings);
  const catalog = documentCatalogFor029(notation, semanticInterpretations);
  const prepared = graphNodes.map((node) => {
    const interpreted = interpretationForNode(node, notation, semanticInterpretations);
    const symbolId = interpreted.effectiveSymbolId;
    // A user symbol's frame is exactly its definition size; its label never resizes it.
    const frame = interpreted.userSymbol029?.outline;
    const shapeId = frame ? 'rectangle'
      : symbolId ? catalogSymbol029(symbolId, catalog)?.shape ?? 'rectangle' : 'rectangle';
    const font = resolveDiagramFont(layoutFonts, symbolId, node.type);
    const hifiFont = legacyDefault ? resolveDiagramFont(hifiFonts, symbolId, node.type) : font;
    const classifierSize = classifierMinimumSize(node.classifier, {
      fontSize: font.size,
      fontFamily: font.cssFamily,
      fontWeight: font.weight,
      lineHeight: font.lineHeight,
    });
    const hifiClassifierSize = legacyDefault ? classifierMinimumSize(node.classifier, {
      fontSize: hifiFont.size,
      fontFamily: hifiFont.cssFamily,
      fontWeight: hifiFont.weight,
      lineHeight: hifiFont.lineHeight,
    }) : classifierSize;
    const measure = (measuredFont: typeof font, minimum = classifierSize) =>
      isBpmnEventSymbol028(symbolId)
        ? bpmnEventMinimumSize028(node.label ?? node.id, measuredFont, layoutDirection)
        : isBpmnGatewaySymbol028(symbolId)
          ? bpmnGatewayMinimumSize028(node.label ?? node.id, measuredFont,
            layoutDirection)
        : computeNodeSize({
          text: node.label ?? node.id,
          shapeId,
          sizingMode: sizingMode === 'uniform' ? 'adaptive' : sizingMode,
          fontFamily: measuredFont.cssFamily,
          fontSize: measuredFont.size,
          fontWeight: measuredFont.weight,
          lineHeight: measuredFont.lineHeight,
          minWidth: minimum?.width,
          minHeight: minimum?.height,
          notationId: notation,
          symbolId,
          layoutDirection,
        });
    const lowfiSize = measure(font);
    const hifiSize = legacyDefault
      ? measure(hifiFont, hifiClassifierSize)
      : lowfiSize;
    // Style switches repaint the current layout without moving authored nodes.
    // Reserve enough room for either production font before ELK resolves it.
    const derived = node.dimensions ?? (frame ? { width: frame.width, height: frame.height }
      : fitPlainRectangleInk028(node.classifier, shapeId,
        fitClassifierFrame028(node.classifier, shapeId, {
          width: Math.max(lowfiSize.width, hifiSize.width),
          height: Math.max(lowfiSize.height, hifiSize.height),
        })));
    return {
      node,
      symbolId,
      shapeId,
      font,
      authored: node.dimensions !== undefined || frame !== undefined,
      dimensions: { width: derived.width, height: derived.height },
    };
  });

  const uniformByShape = new Map<string, { width: number; height: number }>();
  if (sizingMode === 'uniform') {
    for (const item of prepared) {
      if (item.authored) continue;
      const current = uniformByShape.get(item.shapeId);
      uniformByShape.set(item.shapeId, {
        width: Math.max(current?.width ?? 0, item.dimensions.width),
        height: Math.max(current?.height ?? 0, item.dimensions.height),
      });
    }
  }

  return prepared.map((item) => {
    const { node, symbolId, shapeId, font } = item;
    const interpreted = interpretationForNode(node, notation, semanticInterpretations);
    const authoredSemanticPorts: SemanticPortInput[] = interpreted.semanticPorts
      .filter((port) => port.origin === 'authored')
      .map((port) => ({ id: port.id, direction: port.direction,
        ...(port.label !== undefined ? { label: port.label } : {}),
        ...(port.maxConnections !== undefined ? { maxConnections: port.maxConnections } : {}),
        ...(port.anchorWasExplicit ? { anchor: port.anchor } : {}) }));
    const candidateDimensions = !item.authored && sizingMode === 'uniform'
      ? uniformByShape.get(shapeId) ?? item.dimensions
      : item.dimensions;
    const dimensions = item.authored ? candidateDimensions
      : fitClassifierFrame028(node.classifier, shapeId, candidateDimensions);
    const labelLayout = isBpmnGatewaySymbol028(symbolId)
      ? bpmnGatewayLabelLayout028(node.label ?? node.id, font,
        dimensions.width, dimensions.height, layoutDirection)
      : layoutNodeLabel({
      text: node.label ?? node.id,
      shapeId,
      sizingMode,
      dimensions,
      fontFamily: font.cssFamily,
      fontSize: font.size,
      fontWeight: font.weight,
      lineHeight: font.lineHeight,
    });
    const portPolicy = layoutPortsForNode(node, notation, layoutDirection,
      semanticInterpretations);
    const previewAttachments = portPolicy.ports.map((port) => ({
      id: port.id,
      ...constrainFreePortAttachment(port, { side: port.side, position: port.position }),
    }));
    const previewPositions = Object.fromEntries(previewAttachments.flatMap((port) =>
      port.position === undefined ? [] : [[port.id, port.position]]));
    return {
      id: node.id,
      type: 'symbol' as const,
      position: node.position ?? { x: 0, y: 0 },
      width: dimensions.width,
      height: dimensions.height,
      ...(node.parent ? { parentId: node.parent } : {}),
      draggable: !node.pinned,
      data: {
        label: node.label ?? node.id,
        nodeType: node.type,
        notationId: notation,
        layoutDirection,
        resolvedPortAttachments: Object.fromEntries(previewAttachments.map((port) => [port.id, port.side])),
        ...(Object.keys(previewPositions).length ? { resolvedPortPositions: previewPositions } : {}),
        ...(authoredSemanticPorts.length ? { authoredSemanticPorts } : {}),
        description: node.description,
        properties: node.properties,
        pinned: node.pinned,
        symbolId,
        variant: node.variant,
        width: dimensions.width,
        height: dimensions.height,
        canonical: canonicalNodeData(node),
        ...(catalog ? { documentCatalog029: catalog } : {}),
        [CORAL_NODE_VIEW_METADATA]: {
          dimensionSource: item.authored ? 'graph' : 'editor-font',
          font,
          lines: labelLayout.lines,
          lineHeightPx: labelLayout.lineHeightPx,
        },
      },
    };
  });
}

function layoutPortsForNode(node: GraphNode, notation: NotationType, direction: LayoutDirection,
  semanticInterpretations?: ReadonlyMap<string, NodeInterpretation028>): {
  ports: LayoutPort[];
  sourceDefault?: string;
  targetDefault?: string;
} {
  if (semanticInterpretations) interpretationForNode(node, notation, semanticInterpretations);
  if (node.ports !== undefined) {
    const effective = effectiveNodePorts(node, notation) ?? [];
    return {
      ports: effective.map((port) => ({ id: port.id, side: port.side, position: port.position })),
      sourceDefault: effective.find((port) => port.id === 'out' && acceptsSource(port))?.id,
      targetDefault: effective.find((port) => port.id === 'in' && acceptsTarget(port))?.id,
    };
  }
  const interpretation = interpretationForNode(node, notation, semanticInterpretations);
  if (interpretation.status === 'unknown-symbol' || interpretation.status === 'unknown-variant') {
    // Draft canvas projection is recoverable: expose no attachable ports while
    // the connection checker retains the resolver's capability diagnostic.
    return { ports: [] };
  }
  const symbol = interpretation.effectiveSymbolId
    ? catalogSymbol029(interpretation.effectiveSymbolId) : undefined;
  return semanticLayoutPorts028(interpretation, symbol, node.variant, direction);
}

/** The document catalog carried by one parse's interpretations, when it has user symbols. */
function documentCatalogFor029(notation: NotationType,
  semanticInterpretations?: ReadonlyMap<string, NodeInterpretation028>): DocumentCatalog029 | undefined {
  if (!semanticInterpretations) return undefined;
  const catalog = catalogForInterpretations029(notation, semanticInterpretations);
  return catalog.userSymbols.size ? catalog : undefined;
}

/**
 * Run ELK layout on parsed graph nodes and edges
 */
export async function layoutNodes(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  notation: NotationType,
  layoutSettings?: LayoutSettings,
  preserveExplicitPositions = true,
  fontSettings?: DiagramFontSettings,
  signal?: AbortSignal,
  constraints: GraphIR['constraints'] = [],
  operation: SpatialLayoutOperation = preserveExplicitPositions ? 'incremental' : 'reflow',
  semanticInterpretations?: ReadonlyMap<string, NodeInterpretation028>,
  spatialSidecar028?: SpatialSidecar028,
  spatialStyle028: 'lowfi' | 'hifi' = 'lowfi',
): Promise<LayoutResult> {
  if (graphNodes.length === 0) {
    return { nodes: [], edgeRouting: new Map(), diagnostics: [] };
  }

  const legacy = layoutSettings ?? {
    algorithm: 'layered', direction: 'DOWN' as const,
    spacing: { nodeNode: 50, edgeNode: 15, layerSpacing: 70 },
  };
  const authored = spatialSidecar028?.layoutOptions028;
  const configured = resolveNotationLayout(notation, legacy).settings;
  const effective = { ...configured, ...authored, spacing: { ...configured.spacing, ...authored?.spacing } };
  const projectedNodes = projectDiagramNodes(
    graphNodes,
    notation,
    fontSettings,
    layoutSettings?.sizingMode ?? 'adaptive',
    effective.direction,
    semanticInterpretations,
  );
  const graphNodeById = new Map(graphNodes.map((node) => [node.id, node]));
  const portPolicy = new Map<string, ReturnType<typeof layoutPortsForNode>>();
  const containerOwners = new Set(graphNodes.map(node => node.parent).filter(Boolean));
  const containerFonts = layoutFontVariants028(fontSettings);
  // A group with its nested descendants, so header sizing sees inner frames.
  const withDescendants = (node: GraphNode): Parameters<typeof containerLayoutOptions028>[0] => ({ ...node,
    children: graphNodes.filter(child => child.parent === node.id).map(withDescendants) });
  // D6: a mixed group's automatic children keep its header and side insets.
  const automaticPadding = (node: GraphNode) => {
    const padding = containerAutomaticPadding028(withDescendants(node),
      { style: 'lowfi', fontSettings: containerFonts.lowfi }, containerOwners.has(node.id));
    return padding ? { automaticPadding028: padding } : {};
  };
  const flatRequestNodes: SharedLayoutNode[] = projectedNodes.map((projected) => {
    const node = graphNodeById.get(projected.id)!;
    const policy = layoutPortsForNode(node, notation, effective.direction, semanticInterpretations);
    portPolicy.set(node.id, policy);
    const referenced = new Set(graphEdges.flatMap((edge) => [
      ...(edge.source === node.id ? [edge.sourcePort ??
        (semanticInterpretations ? undefined : policy.sourceDefault)] : []),
      ...(edge.target === node.id ? [edge.targetPort ??
        (semanticInterpretations ? undefined : policy.targetDefault)] : []),
      ...(edge.routeIntent?.waypoints ?? []).flatMap(({ placement }) =>
        placement.kind === 'relative' && placement.anchor.kind === 'port' && placement.anchor.nodeId === node.id
          ? [placement.anchor.portId] : []),
    ].filter((id): id is string => id !== undefined)));
    const authored = node.ports ? new Set(policy.ports.map((port) => port.id))
      : new Set(interpretationForNode(node, notation, semanticInterpretations).semanticPorts
        .filter((port) => port.origin === 'authored').map((port) => port.id));
    // Idle catalog ports may bias layered placement even though no connector
    // uses them. Waypoint anchors also count as port references.
    // Keep authored and referenced ports in the ELK-only graph;
    // portPolicy above still retains every handle for the editor UI.
    const layoutPorts = policy.ports.filter((port) =>
      referenced.has(port.id) || authored.has(port.id));
    return {
      id: node.id,
      width: projected.width!,
      height: projected.height!,
      ...(node.position ? { position: node.position } : {}),
      ...(node.pinned !== undefined ? { pinned: node.pinned } : {}),
      ports: layoutPorts,
      layoutOptions: containerLayoutOptions028(withDescendants(node), { style: 'lowfi', fontSettings: containerFonts.lowfi }, containerOwners.has(node.id)),
      ...automaticPadding(node),
    };
  });
  const requestNodeById = new Map(flatRequestNodes.map((node) => [node.id, node]));
  const canonicalNodes = graphNodes.map((node) => {
    const request = requestNodeById.get(node.id)!;
    return {
      ...node,
      ports: request.ports,
      layoutOptions: request.layoutOptions,
      children: undefined,
    };
  });
  const children = new Map<string, typeof canonicalNodes>();
  const roots: typeof canonicalNodes = [];
  for (const node of canonicalNodes) {
    if (node.parent && requestNodeById.has(node.parent)) {
      const values = children.get(node.parent) ?? [];
      values.push(node);
      children.set(node.parent, values);
    } else roots.push(node);
  }
  const attach = (node: typeof canonicalNodes[number]): GraphIR['nodes'][number] => {
    const nested = children.get(node.id);
    return { ...node, ...(nested?.length ? { children: nested.map(attach) } : {}) };
  };
  const layoutEdges: GraphIR['edges'] = graphEdges.map(({ lineStyle, routingPoints: _resolved, ...edge }) => ({
    ...edge,
    ...(lineStyle ? { style: { ...edge.style, lineStyle } } : {}),
    // A source-owned edge without an explicit semantic port remains unported.
    // GraphIR 3's historical display fallback is layout-only and does not
    // apply when an exact successor interpretation owns these references.
    ...(semanticInterpretations ? {} : {
      sourcePort: edge.sourcePort ?? portPolicy.get(edge.source)?.sourceDefault,
      targetPort: edge.targetPort ?? portPolicy.get(edge.target)?.targetDefault,
    }),
  }));
  const requestChildren = new Map<string, SharedLayoutNode[]>();
  const requestRoots: SharedLayoutNode[] = [];
  for (const node of flatRequestNodes) {
    const parentId = graphNodeById.get(node.id)?.parent;
    if (parentId && requestNodeById.has(parentId)) {
      const values = requestChildren.get(parentId) ?? [];
      values.push(node);
      requestChildren.set(parentId, values);
    } else requestRoots.push(node);
  }
  const attachRequest = (node: SharedLayoutNode): SharedLayoutNode => {
    const nested = requestChildren.get(node.id);
    return { ...node, ...(nested?.length ? { children: nested.map(attachRequest) } : {}) };
  };
  // A connector into or out of a group must be part of the layered graph:
  // otherwise ELK places each level as if it did not exist and returns no
  // route for it. Only then, because ELK then stops separating unconnected
  // components, which keeps a flat diagram's chains aligned.
  const crossesGroup = graphEdges.some((edge) =>
    graphNodeById.get(edge.source)?.parent !== graphNodeById.get(edge.target)?.parent);
  const defaults = {
    algorithm: 'layered', direction: 'DOWN',
    spacing: { nodeNode: 50, edgeNode: 15, layerSpacing: 70 },
    ...(crossesGroup ? { hierarchyHandling: 'INCLUDE_CHILDREN' } : {}),
  } as const;
  const fonts = layoutFontVariants028(fontSettings);
  const labelSpacing = Math.max(...(['lowfi', 'hifi'] as const).map((style) =>
    authoredLabelLayerSpacing028({ edges: layoutEdges, nodes: canonicalNodes }, effective.direction,
      { style, fontSettings: fonts[style] })));
  const configuredOptions = {
    algorithm: effective.algorithm,
    direction: effective.direction,
    ...(authored?.edgeRouting ? { edgeRouting: authored.edgeRouting } : {}),
    spacing: effective.spacing,
    elkOptions: { ...codeBranchRoutingDefaults028(notation, effective.elkOptions),
      ...effective.elkOptions, ...(labelSpacing > 0 ? {
      'elk.layered.spacing.nodeNodeBetweenLayers': Math.max(labelSpacing,
        Number(effective.elkOptions?.['elk.layered.spacing.nodeNodeBetweenLayers'] ?? effective.spacing?.layerSpacing ?? 0)),
    } : {}) },
  };
  const options = authored ? mergeAuthoredLayoutOptions028(configuredOptions, authored) : configuredOptions;
  const ranked = classGeneralizationRankEdges028({ version: '3.0.0', id: 'root',
    nodes: roots.map(attach), edges: layoutEdges, metadata: { notation } }, notation);
  const elkNodes = requestRoots.map(attachRequest);
  const elkEdges = layoutEdges.map((edge) => ({
      id: edge.id,
      source: ranked.has(edge.id) ? edge.target : edge.source,
      target: ranked.has(edge.id) ? edge.source : edge.target,
      ...((ranked.has(edge.id) ? edge.targetPort : edge.sourcePort)
        ? { sourcePort: ranked.has(edge.id) ? edge.targetPort : edge.sourcePort } : {}),
      ...((ranked.has(edge.id) ? edge.sourcePort : edge.targetPort)
        ? { targetPort: ranked.has(edge.id) ? edge.sourcePort : edge.targetPort } : {}),
    }));
  const documentCatalog029 = documentCatalogFor029(notation, semanticInterpretations);
  const proximitySceneOptions = {
    style: spatialStyle028,
    fontSettings: fonts[spatialStyle028],
    layoutDirection: effective.direction,
    notation,
  };
  // The same rule as the SVG path reserves each user symbol's label side in
  // ELK's input (c4-design.md "Reservation in layout").
  const reservedNodes = userSymbolOutsideLabels029({ nodes: elkNodes, edges: elkEdges, sourceNodes: graphNodes,
    notationId: notation, catalog: documentCatalog029, direction: effective.direction,
    layered: normalizeLayoutOptions(options, defaults).effectiveOptions['elk.algorithm'] === 'layered',
    sceneOptions: proximitySceneOptions });
  const runLayout = (reserve: boolean, run: Pick<LayoutRequest, 'defaults' | 'options'>) => runEditorLayout({ id: 'root',
    nodes: [...(reserve ? reservedNodes : elkNodes)], edges: elkEdges, ...run }, { signal });
  const layoutOnce = async (reserve: boolean) => resolveSpatialLayout({
    revision: 'editor-layout',
    operation,
    ...(documentCatalog029 ? { documentCatalog029 } : {}),
    graph: { ...spatialSidecar028, version: '3.0.0', id: 'root', nodes: roots.map(attach), edges: layoutEdges, constraints,
      metadata: { notation } },
    defaults,
    options,
    candidateLayout: await runLayout(reserve, { defaults, options }),
    // Generated-route retries re-run the worker, as the SVG path re-runs ELK.
    relayoutCandidate: (retry) => runLayout(reserve, retry),
    candidateRankReversedEdgeIds: [...ranked],
    proximitySceneOptions,
    execution: { signal },
  });
  // A reserved layout that fails is laid out again without reservations.
  const layouted = reservedNodes === elkNodes ? await layoutOnce(false) : await layoutOnce(true).catch((error: unknown) => {
    if (!signal?.aborted && (error instanceof SpatialLayoutError || error instanceof LayoutExecutionError))
      return layoutOnce(false);
    throw error;
  });

  const layoutNodeById = new Map(layouted.nodes.map((node) => [node.id, node]));
  const layoutEdgeById = new Map(layoutEdges.map((edge) => [edge.id, edge]));
  const freeAttachmentChoices = new Map<string, Record<string,
    Pick<LayoutPort, 'side' | 'position'>>>();
  for (const laidEdge of layouted.edges) {
    const edge = layoutEdgeById.get(laidEdge.id);
    if (!edge || !laidEdge.sections.length) continue;
    for (const [nodeId, portId, point] of [
      [edge.source, edge.sourcePort, laidEdge.sections[0]?.startPoint],
      [edge.target, edge.targetPort, laidEdge.sections[laidEdge.sections.length - 1]?.endPoint],
    ] as const) {
      if (!portId || !point) continue;
      const policy = portPolicy.get(nodeId)?.ports.find((port) => port.id === portId);
      const rect = layoutNodeById.get(nodeId);
      if (policy?.attachment !== 'free' || !rect) continue;
      const choices = freeAttachmentChoices.get(nodeId) ?? {};
      choices[portId] ??= constrainFreePortAttachment(policy,
        attachmentFromBoundaryPoint(rect, point));
      freeAttachmentChoices.set(nodeId, choices);
    }
  }
  const nodes = projectedNodes.map((projected) => {
    const node = graphNodeById.get(projected.id)!;
    const elkNode = layoutNodeById.get(node.id);
    const position = elkNode?.position ?? node.position ?? { x: 0, y: 0 };
    // React Flow internals and scene projection must share the final frame,
    // including containers expanded around their measured children.
    const data = { ...projected.data,
      ...(elkNode ? { width: elkNode.width, height: elkNode.height } : {}) };
    return {
      ...projected,
      position,
      ...(elkNode ? { width: elkNode.width, height: elkNode.height } : {}),
      data,
      ...(freeAttachmentChoices.has(node.id) ? { data: { ...data,
        resolvedPortAttachments: { ...projected.data.resolvedPortAttachments,
          ...Object.fromEntries(Object.entries(freeAttachmentChoices.get(node.id)!)
            .map(([id, choice]) => [id, choice.side])) },
        resolvedPortPositions: { ...projected.data.resolvedPortPositions,
          ...Object.fromEntries(Object.entries(freeAttachmentChoices.get(node.id)!)
            .flatMap(([id, choice]) => choice.position === undefined ? [] : [[id, choice.position]])) },
      } } : {}),
    };
  });
  const graphEdgeById = new Map(graphEdges.map((edge) => [edge.id, edge]));
  const edgeRouting = new Map<string, ElkEdgeRouting>();
  for (const laidEdge of layouted.edges) {
    const edge = graphEdgeById.get(laidEdge.id);
    const section = laidEdge.sections[0];
    const lastSection = laidEdge.sections[laidEdge.sections.length - 1];
    if (!edge || !section || !lastSection) continue;
    edgeRouting.set(edge.id, {
      id: edge.id, sourceId: edge.source, targetId: edge.target,
      startPoint: section.startPoint, endPoint: lastSection.endPoint,
      bendPoints: laidEdge.sections.flatMap((current, index) => [
        ...current.bendPoints,
        ...(index < laidEdge.sections.length - 1 ? [current.endPoint] : []),
      ]),
    });
  }
  return { nodes, edgeRouting, diagnostics: layouted.diagnostics,
    ...(layouted.labelBounds028 ? { labelBounds028: layouted.labelBounds028 } : {}) };
}

/**
 * Convert graph edges to React Flow format, applying ELK edge routing when available
 */
export function convertEdges(
  graphEdges: GraphEdge[],
  edgeRouting?: Map<string, ElkEdgeRouting>,
  fontSettings?: DiagramFontSettings,
  scene?: { notation?: string; nodes?: Parameters<typeof resolveEdgeAppearance>[1];
    semanticInterpretations?: ReadonlyMap<string, NodeInterpretation028> },
): Edge[] {
  const font = resolveDiagramFont(normalizeDiagramFontSettings(fontSettings));
  const sceneNodes = scene?.nodes ?? [];
  const interpretations = scene?.semanticInterpretations;
  const catalog = scene?.notation ? documentCatalogFor029(scene.notation as NotationType, interpretations) : undefined;
  const symbols = Array.isArray(sceneNodes)
    ? resolveSymbolIndex(sceneNodes, scene?.notation, catalog) : sceneNodes;
  return graphEdges.map((e) => {
    const canonicalEdge = e.lineStyle
      ? { ...e, style: { ...e.style, lineStyle: e.lineStyle } }
      : e;
    const appearance = resolveEdgeAppearance(canonicalEdge, symbols, scene?.notation, '#666');

    const routing = edgeRouting?.get(e.id);
    const routedPath = routing
      ? {
          startPoint: routing.startPoint,
          endPoint: routing.endPoint,
          bendPoints: routing.bendPoints,
        }
      : undefined;

    const edge: Edge = {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'compatibility',
      animated: false,
      reconnectable: true,
      ...(appearance.source.marker && appearance.source.marker.kind !== 'none'
        ? { markerStart: `url(#${markerId(appearance.source.marker, appearance.style.stroke)})` } : {}),
      ...(appearance.target.marker && appearance.target.marker.kind !== 'none'
        ? { markerEnd: `url(#${markerId(appearance.target.marker, appearance.style.stroke)})` } : {}),
      style: { stroke: appearance.style.stroke, strokeWidth: appearance.style.strokeWidth, strokeDasharray: appearance.style.strokeDasharray },
      labelStyle: {
        fontFamily: JSON.stringify(font.cssFamily),
        fontSize: font.size,
        fontWeight: font.weight,
        lineHeight: font.lineHeight,
        fontKerning: 'none',
        fontOpticalSizing: 'none',
        fontVariantLigatures: 'none',
        fontFeatureSettings: '"kern" 0, "liga" 0, "clig" 0, "calt" 0',
        fill: '#666',
      },
      focusable: true,
      interactionWidth: 20,
      data: {
        [CORAL_EDGE_VIEW_METADATA]: { font },
        ...(routedPath ? { routedPath } : {}),
        // An interior anchor's escape is part of the connector; the canvas draws it from the handle.
        ...(() => {
          const escape029 = escapeOffsets029(e, interpretations?.get(e.source), interpretations?.get(e.target));
          return escape029.source || escape029.target ? { escape029 } : {};
        })(),
        label: e.label,
        edgeType: e.type,
        properties: e.properties,
        lineStyle: e.lineStyle ?? e.style?.lineStyle,
        routingPoints: e.routingPoints,
        canonical: canonicalEdgeData(e),
        sourceEndpoint: appearance.source,
        targetEndpoint: appearance.target,
      },
    };

    // Map sourcePort/targetPort to React Flow handle IDs
    if (e.sourcePort) edge.sourceHandle = e.sourcePort;
    if (e.targetPort) edge.targetHandle = e.targetPort;

    return edge;
  });
}
