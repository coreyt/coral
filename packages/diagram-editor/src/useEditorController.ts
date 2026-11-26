import { useMyIcons029 } from './useMyIcons029';
import { iconRecord029, type MyIcon029 } from './myIcons029';
import { userSymbolPaletteEntry029 } from './authoringModel';
import { AI_FEATURES_AVAILABLE } from './releaseFeatures029.js';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  reconnectEdge,
  applyNodeChanges,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
// ELK layout and utility functions extracted to hooks/diagramUtils.ts
import {
  layoutNodes as layoutNodesUtil,
  convertEdges as convertEdgesUtil,
  buildNodeConnectionInfo,
  editorHandlePorts,
  projectDiagramNodes,
  resolveIncrementalEditorPositions,
  retainRoutesAfterPositionOverlay,
  type NotationType as DiagramNotationType,
} from './hooks/diagramUtils';
import {
  canonicalPortId,
  composeRenderGraph,
  nestCanonicalNodes,
  projectCanonicalGraph,
  projectedMetadata,
  requireSourcePortRoutes028,
} from './editorProjection';
import { EditorRevision, type PublicationEnvelope } from './editorRevision';
import { parse as parseCanonicalCoral } from '@coral-viz/language/parser';
import { validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import {
  createIndexedDbTranscriptStore,
  createTranscriptArchive,
  openTranscriptArchive,
  purgeExpiredTranscriptArchives,
  recalculateTranscriptRetention,
  updateTranscriptArchive,
  type TranscriptArchive,
} from './transcriptArchive';
import {
  readTranscriptPreferences,
  writeTranscriptPreferences,
  type TranscriptPreferences,
} from './transcriptPreferences';
import {
  evaluateMaterialChange, hasMaterialQualityRegression, qualityGraphs, selectLayoutStrategy, shouldEscalateBroadLayout,
  type LayoutStrategy, type QualityScene,
} from './materialChange';
import { sourceComparableFields } from './sourceDisposition';
import type { InspectorPaneProps } from './components/InspectorPane';
import { appendSourceOwnedEdge028, appendSourceOwnedNode028, canAppendSourceOwnedEdge028,
  deleteSourceOwnedEdges028,
  deleteSourceOwnedNodeWithConnections028,
  deleteSourceOwnedSelection028,
  editSourceOwnedEdgeLabel028, editSourceOwnedNodeLabel028, editSourceOwnedNodePositions028,
  editSourceOwnedPortFields029, editSourceOwnedSymbolDefinition029, pinSourceOwnedEdition029,
  editSourceOwnedNodeLabelPlacement028, type SourceOwnedNodeLabelPlacement028,
  removeSourceOwnedEdgeLabel028,
  resolveSourceOwnedEdgePorts028, resolveSourceOwnedHandle028,
  sourceOwnedGraphForExport028, type SourceOwnedNodeDraft028 } from './sourceOwnedEdits028';

// Edge styles are now generated dynamically based on theme - see getEdgeStyles()

import { parseCoralDSL, parseMermaidDSL, editorDiagnostic, type GraphNode, type GraphEdge, type EditorParseError,
  type ParseResult as EditorParseResult } from './parsers';
import {
  canonicalSimpleMermaidSequence028, writeSupplementalMermaidSequence028, detectFormat, isSequenceGraph, OPEN_FILE_ACCEPT,
  parseDot, parseMermaid, parsePlantUml, validateSequenceInteraction,
  type SourceFormat,
  editionAdmitsUserSymbols029,
} from '@coral-viz/language';
import {
  applySequenceOperation, canEnterSequenceNotation, canonicalizeSequenceGraph, sequenceCanonicalGraph, type SequenceOperation, type SequenceOperationResult,
} from './sequenceEditing';
import type { SequenceSelection } from '@coral-viz/viz';
import type { OpenFailure, OpenFileInput } from './openFile';
import { effectiveSymbolId } from './notationSemantics';
import { analyzeEditorSource, type EntityOccurrence } from './editorAnalysis';
import { printCoralDSLWithDiagnostics, type GraphIR } from './printer';
import { useAutoRecovery } from './useAutoRecovery';
import { useThemeColors, getEdgeStyles, lightTheme } from './theme';
import { useLlmChat } from './hooks/useLlmChat';
import type { DslRejection, SubmitContext } from './hooks/useLlmChat';
import { dropUnresolvedEdgePorts, portSafetyDiagnostics } from './portSafety';
import { convertToMermaidDslWithDiagnostics } from './llm/convert';
import type { CommandItem, CommandPaletteTheme } from './CommandPalette';
import type { CanvasUpdateStatus } from './components/CanvasPane';
import type { AuthoringDialogTheme, AuthoringEndpointOption } from './AuthoringDialog';
import {
  createAuthoringEdge,
  createAuthoringNode,
  deleteAuthoringSelection,
  flattenAuthoringNodes,
  preserveAuthoredNodePositions,
  getAuthoringNodeOptions,
  getAuthoringParentOptions,
  getSourceSymbolPaletteEntries029,
  getAuthoringPortOptions,
  isAuthoringNodePortless,
  getAuthoringViewPortId,
  resolveAuthoringPortId,
  type CreateAuthoringEdgeInput,
  type CreateAuthoringNodeInput,
} from './authoringModel';
import { isAuthoringShortcutEligible, isNativeEditingTarget } from './authoringShortcuts';
import type { ActivityEntry, DiagnosticEntry, BottomPanelTab } from './BottomPanel';
import { useWorkspacePreferences } from './workspacePreferences';
import {
  CORAL_EDGE_VIEW_METADATA,
  CORAL_NODE_VIEW_METADATA,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_USER_PREFERENCES,
  resolveNotationLayout,
  type ElkEdgeRouting,
  type SymbolNodeData,
  type EditorDiagnostic,
} from '@coral-viz/viz';
import {
  approvedNotationTypeWords028,
  getAvailableNotations028,
  effectiveGraphNotationId028,
  resolveNotationNode028,
  fontData,
  getPortableFont,
  renderHtml,
  renderSvg,
  prepareSpatialScene028,
  sourceSpatialFailureDiagnostics028,
  type SpatialSidecar028,
  checkInstalledSuccessorSourceConformance028,
  parseInstalledDocument028,
  successorSequenceDisplay028,
  printInstalledSource028,
  successorCoreValidationInput029,
  documentCatalog029,
  catalogSymbol029,
  documentSymbolDefinition029,
  type SuccessorUserSymbol029,
  verifyPortableSuccessorSource028,
  svgFontFaceRequests,
  type ConformanceLevel,
  type ConformanceReport,
  type NotificationLevel,
  type NodeInterpretation028,
  type SuccessorSourceGraph028,
  type SvgOptions,
  baseRenderStyle028,
  normalizeRenderStyle0214,
  type RenderStyle0214,
  type RenderStyle028,
  type RenderStyleInput0214,
  type PreparedSpatialScene028,
  visualStyle028,
  resolveDiagramFont,
} from '@coral-viz/render';
import { SpatialLayoutError } from '@coral-viz/render/layout';
import {
  notationRegistry,
  symbolRegistry,
  useLayoutHistory,
  useAxisConstrain,
  useWaypointManager,
  type EdgeWaypoint,
  type DocumentSettings,
  serialize,
  deserialize,
  migrateDocumentWithDiagnostics,
  materializeReferencedPorts,
  validateDocument,
  type PortResolver,
  convertFlowToGraphNodes,
  convertFlowToGraphEdges,
  // Settings (CORAL-REQ-009)
  useSettings,
  DEFAULT_DIAGRAM_FONT_SETTINGS,
  normalizeDiagramFontSettings,
  normalizeLlmMaxRetries,
  // Compatibility (CORAL-REQ-010)
  useEdgeCompatibility,
  type HandleDragState,
  // Properties Panel and Inline Editing
  type PropertyChange,
  type CoralDocument,
  type CoralNode,
  type CoralEdge,
  type DiffableGraph,
  type Position,
} from '@coral-viz/viz';
import { captureCredentialPersistenceSnapshot } from './llm/credentialPersistence';
import { createBlankDocument } from './blankDocument';
import { bundledSourceExamples028, exampleCatalog } from './exampleSources028';
import { createExampleDocument, resolveExample } from './exampleCatalog.mjs';
import { startupSource } from './startupSource';
import { readDisplayIdentity } from './guidanceContent';
import { readOnDevicePreference, writeOnDevicePreference } from './onDevicePreference';
import { canvasGeometry, canvasRects } from './llm/plan/canvasMeasure';
import { capturePlanSnapshot, discardPlanStage, planCaptureIsCurrent, planStageIsOpen, stagePlan,
  type CaptureResult, type EntityId, type PlanBase, type PlanCapture, type PlanRefusal, type PlanResponse,
  type PlanStage, type PlanStageResult } from './llm/plan';

export type PlanApplyResult = { ok: true } | { ok: false; refusal: PlanRefusal };
const PLAN_BUSY: PlanRefusal = { code: 'coral.plan.busy',
  message: 'AI editing needs accepted, rendered Coral source with no edit or update in progress.' };

// Windows reserves these device stems even with a file extension.
function downloadStem(documentName: string): string {
  const stem = documentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(stem) ? `diagram-${stem}` : stem;
}

function convertCanonicalFlowEdges(
  flowEdges: CoralEdge[],
  originalEdges: GraphEdge[] = [],
  graph: GraphIR,
  notation: NotationType,
): GraphEdge[] {
  const originalById = new Map(originalEdges.map((edge) => [edge.id, edge]));
  return convertFlowToGraphEdges(flowEdges, originalEdges).map((edge, index) => {
    const flowEdge = flowEdges[index];
    const original = originalById.get(edge.id);
    const portFromView = (endpoint: 'source' | 'target') => {
      const raw = endpoint === 'source' ? flowEdge.sourceHandle : flowEdge.targetHandle;
      if (!raw) return undefined;
      const canonical = endpoint === 'source'
        ? original?.sourcePort
        : original?.targetPort;
      if (canonical && (raw === canonical || raw === getAuthoringViewPortId(
        graph, notation, endpoint === 'source' ? edge.source : edge.target, endpoint, canonical,
      ))) return canonical;
      return resolveAuthoringPortId(
        graph, notation, endpoint === 'source' ? edge.source : edge.target, endpoint, raw,
      );
    };
    return {
      ...edge,
      sourcePort: portFromView('source'),
      targetPort: portFromView('target'),
    };
  });
}

function mergeProjectedNodeData(
  current: SymbolNodeData,
  projected: SymbolNodeData,
  label?: string,
): SymbolNodeData {
  const merged: SymbolNodeData = {
    ...current,
    ...(label !== undefined ? { label } : {}),
    symbolId: projected.symbolId,
    width: projected.width,
    height: projected.height,
    resolvedPortAttachments: projected.resolvedPortAttachments,
    ...(projected.authoredSemanticPorts !== undefined
      ? { authoredSemanticPorts: projected.authoredSemanticPorts } : {}),
    canonical: current.canonical ?? projected.canonical,
  };
  (merged as unknown as Record<PropertyKey, unknown>)[CORAL_NODE_VIEW_METADATA]
    = projectedMetadata(projected, CORAL_NODE_VIEW_METADATA);
  return merged;
}

type EditorAnalysisState = {
  source: string;
  language: DSLType;
  diagnostics: EditorDiagnostic[];
  decorations: EntityOccurrence[];
  entityHighlighting: boolean;
};

type ParsedEditorGraph = { nodes: GraphNode[]; edges: GraphEdge[];
  semanticInterpretations?: NonNullable<ReturnType<typeof parseCoralDSL>['semanticInterpretations']>;
  /** Source-owned 0.2.8 meaning retained across editor history and export. */
  sourceMeaning028?: SuccessorSourceGraph028;
  /** Exact authored text that produced the paired 0.2.8 interpretation. */
  sourceText028?: string;
  /** Effective source edition of that text; 0.2.9 refuses connections beyond a port limit. */
  coralVersion?: string };

const digests029 = new WeakMap<SuccessorUserSymbol029, string>();
/** The GraphIR digest of an admitted definition, computed once per parse. */
function digest029(definition: SuccessorUserSymbol029): string {
  let digest = digests029.get(definition);
  if (digest === undefined) digests029.set(definition, digest = documentSymbolDefinition029(definition).digest);
  return digest;
}

/** The inspector's view of one source-owned node: its user symbol with digest, and its ports by owner. */
function inspectorNode029(parsed: ParsedEditorGraph, nodeId: string): Pick<InspectorPaneProps,
  'userSymbol029' | 'ports029'> {
  const interpretation = parsed.semanticInterpretations?.get(nodeId);
  if (!interpretation || !parsed.sourceMeaning028) return {};
  const user = interpretation.userSymbol029;
  const definition = user && parsed.sourceMeaning028.userSymbols029?.find((item) =>
    item.symbolId === user.definition.symbolId);
  const digest = definition && user.artwork029 ? digest029(definition) : undefined;
  const ownerName = user?.definition.name ?? (interpretation.effectiveSymbolId
    ? catalogSymbol029(interpretation.effectiveSymbolId)?.name : undefined);
  return {
    ...(definition && user ? { userSymbol029: { definition, symbol: user,
      ...(digest && digest !== 'sha256:' ? { digest } : {}) } } : {}),
    ports029: interpretation.semanticPorts.map((port) => ({ id: port.id, direction: port.direction,
      ...(port.label !== undefined ? { label: port.label } : {}),
      ...(port.maxConnections !== undefined ? { maxConnections: port.maxConnections } : {}),
      ...(port.origin === 'authored' ? { owner: 'node' as const }
        : { owner: user ? 'symbol' as const : 'catalog' as const, ...(ownerName ? { ownerName } : {}) }) })),
  };
}

type DslHistoryEntry = {
  sequence: number;
  dsl: string;
  dslType: string;
  graphIRPreviewSource?: boolean;
  sourceErrorsLocked?: boolean;
  graph?: GraphIR;
  waypoints?: Map<string, EdgeWaypoint[]>;
  diagnostics?: EditorParseError[];
  publication: PublicationEnvelope;
  parsed: ParsedEditorGraph;
  displayNodes: Node<SymbolNodeData>[];
  displayEdges: Edge[];
  parseErrors: EditorParseError[];
  editorAnalysis: EditorAnalysisState;
  debugInfo: string;
  settings?: DocumentSettings;
};

function cloneDisplayNodes(nodes: Node<SymbolNodeData>[]): Node<SymbolNodeData>[] {
  return nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: { ...node.data },
  }));
}

function cloneDisplayEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({ ...edge, data: edge.data ? { ...edge.data } : edge.data }));
}

function verifiedRoutesFromEdges(edges: Edge[]): Map<string, ElkEdgeRouting> {
  const routes = new Map<string, ElkEdgeRouting>();
  for (const edge of edges) {
    const route = edge.data?.routedPath as {
      startPoint?: Position; bendPoints?: Position[]; endPoint?: Position;
    } | undefined;
    if (!route?.startPoint || !route.endPoint) continue;
    routes.set(edge.id, {
      id: edge.id,
      sourceId: edge.source,
      targetId: edge.target,
      ...(canonicalPortId(edge.sourceHandle) ? { sourcePortId: canonicalPortId(edge.sourceHandle) } : {}),
      ...(canonicalPortId(edge.targetHandle) ? { targetPortId: canonicalPortId(edge.targetHandle) } : {}),
      startPoint: { ...route.startPoint },
      bendPoints: (route.bendPoints ?? []).map((point) => ({ ...point })),
      endPoint: { ...route.endPoint },
    });
  }
  return routes;
}

function requiresSpatialResolution(graph: GraphIR): boolean {
  const hasPlacedLabel = (nodes: GraphIR['nodes']): boolean => nodes.some((node) =>
    node.labelPlacement !== undefined || hasPlacedLabel(node.children ?? []));
  const paired = graph as GraphIR & SpatialSidecar028;
  return Boolean(paired.spatialConstraints028?.length || paired.routeIntents028 || paired.layoutOptions028)
    || (graph.constraints?.length ?? 0) > 0
    || graph.edges.some((edge) => edge.routeIntent !== undefined || edge.labelPlacement !== undefined)
    || hasPlacedLabel(graph.nodes);
}

/** A dash edit changes a soft layout constraint even when edge topology is identical. */
function changedSourceProximity028(previous: SuccessorSourceGraph028 | undefined,
  next: SuccessorSourceGraph028 | undefined): boolean {
  if (!next) return false;
  const before = new Map(previous?.edges.map((edge) => [edge.id, edge.proximityHint ?? 1]) ?? []);
  const after = new Map(next.edges.map((edge) => [edge.id, edge.proximityHint ?? 1]));
  return [...new Set([...before.keys(), ...after.keys()])]
    .some((id) => (before.get(id) ?? 1) !== (after.get(id) ?? 1));
}

function cloneWaypoints(waypoints: Map<string, EdgeWaypoint[]>): Map<string, EdgeWaypoint[]> {
  return new Map([...waypoints].map(([edgeId, points]) => [
    edgeId,
    points.map((point) => ({ ...point })),
  ]));
}

function applyAuthoredWaypoints(edge: GraphEdge, waypoints: EdgeWaypoint[] | undefined): GraphEdge {
  if (waypoints === undefined && edge.routeIntent?.waypoints.some((waypoint) => waypoint.placement.kind !== 'absolute')) {
    return edge;
  }
  const absoluteById = new Map((waypoints ?? []).map((point) => [point.id, point]));
  const merged = (edge.routeIntent?.waypoints ?? []).flatMap((waypoint) => {
    if (waypoint.placement.kind !== 'absolute') return [waypoint];
    const point = absoluteById.get(waypoint.id);
    if (!point) return [];
    absoluteById.delete(waypoint.id);
    return [{
      id: point.id,
      placement: { kind: 'absolute' as const, position: { x: point.x, y: point.y } },
    }];
  });
  for (const point of absoluteById.values()) merged.push({
    id: point.id,
    placement: { kind: 'absolute' as const, position: { x: point.x, y: point.y } },
  });
  const { routeIntent: _previous, routingPoints: _retired, ...rest } = edge;
  return {
    ...rest,
    ...(merged.length ? { routeIntent: { waypoints: merged } } : {}),
  };
}

function updateCanonicalNode(
  nodes: GraphIR['nodes'],
  nodeId: string,
  update: (node: GraphIR['nodes'][number]) => GraphIR['nodes'][number],
): GraphIR['nodes'] {
  return nodes.map((node) => ({
    ...(node.id === nodeId ? update(node) : node),
    ...(node.children ? { children: updateCanonicalNode(node.children, nodeId, update) } : {}),
  }));
}

type DSLType = 'coral' | 'mermaid' | 'dot' | 'plantuml';
type NotationType = DiagramNotationType;

type AuthoringSession = {
  kind: 'node' | 'edge';
  invoker: HTMLElement | null;
  /** A dialog over saved-header Coral may submit only against the source it opened. */
  sourceText028?: string;
  afterMessageId?: string;
};

type CanvasFocusRequest = {
  token: number;
  kind: 'node' | 'edge';
  id: string;
};

const KEYBOARD_MOVE_STEP = 5;
const KEYBOARD_MOVE_FAST_STEP = 20;
const DEFAULT_NODE_SPACING = 50;
const DEFAULT_LAYER_SPACING = 70;
const DIAGRAM_TO_TEXT_DEBOUNCE_MS = 500;
const TEXT_TO_DIAGRAM_DEBOUNCE_MS = 300;
const TEXT_ORIGIN_SETTLE_MS = 100;
const INTERNAL_TEXT_GUARD_MS = 1000;
const DOCUMENT_LOAD_GUARD_MS = 400;
const WELCOME_SEEN_KEY = 'coral-welcome-seen:0.2.15';

// layoutNodes, convertEdges, LayoutResult imported from './hooks/diagramUtils'
const layoutNodes = layoutNodesUtil;
const convertEdges = convertEdgesUtil;

function projectEdgesForCanvas(
  graph: GraphIR,
  notation: NotationType,
  edgeRouting: Parameters<typeof convertEdges>[1],
  font: Parameters<typeof convertEdges>[2],
  semanticInterpretations?: ReadonlyMap<string, NodeInterpretation028>,
): Edge[] {
  const canonicalById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const viewPort = (nodeId: string, endpoint: 'source' | 'target', portId?: string): string | undefined => {
    if (!portId) return undefined;
    if (!semanticInterpretations) return getAuthoringViewPortId(graph, notation, nodeId, endpoint, portId);
    const port = semanticInterpretations.get(nodeId)?.semanticPorts.find((item) => item.id === portId);
    if (!port) throw new Error(`render.capability.semantic-port-handle: ${nodeId}:${portId} has no interpretation`);
    return port.direction === 'inout' ? `${portId}-${endpoint === 'source' ? 'out' : 'in'}` : portId;
  };
  return convertEdges(graph.edges, edgeRouting, font, { notation, nodes: graph.nodes,
    ...(semanticInterpretations ? { semanticInterpretations } : {}) }).map((edge) => {
    const canonical = canonicalById.get(edge.id);
    return {
      ...edge,
      sourceHandle: viewPort(edge.source, 'source', canonical?.sourcePort),
      targetHandle: viewPort(edge.target, 'target', canonical?.targetPort),
    };
  });
}

type PreparedDocumentReplacement = {
  doc: CoralDocument;
  result: ReturnType<typeof deserialize>;
  notation: NotationType;
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  graph: GraphIR;
  nodes: Node<SymbolNodeData>[];
  edges: Edge[];
  waypoints: Map<string, EdgeWaypoint[]>;
  source: string;
  sourceDiagnostics: EditorParseError[];
};

type SourceRange = NonNullable<EditorParseError['range']>;

function skipJsonWhitespace(source: string, index: number): number {
  while (/\s/.test(source[index] ?? '')) index += 1;
  return index;
}

function scanJsonString(source: string, index: number): { value: string; end: number } | undefined {
  if (source[index] !== '"') return undefined;
  let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (source[cursor] === '"') {
      const end = cursor + 1;
      try {
        return { value: JSON.parse(source.slice(index, end)) as string, end };
      } catch {
        return undefined;
      }
    }
    cursor += 1;
  }
  return undefined;
}

function skipJsonValue(source: string, index: number): number | undefined {
  const start = skipJsonWhitespace(source, index);
  const string = scanJsonString(source, start);
  if (string) return string.end;
  if (source[start] === '{' || source[start] === '[') {
    const open = source[start];
    const close = open === '{' ? '}' : ']';
    let cursor = start + 1;
    while (cursor < source.length) {
      const nestedString = scanJsonString(source, cursor);
      if (nestedString) {
        cursor = nestedString.end;
        continue;
      }
      if (source[cursor] === open) {
        const nestedEnd = skipJsonValue(source, cursor);
        if (nestedEnd === undefined) return undefined;
        cursor = nestedEnd;
        continue;
      }
      if (source[cursor] === close) return cursor + 1;
      cursor += 1;
    }
    return undefined;
  }
  const match = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(source.slice(start));
  return match ? start + match[0].length : undefined;
}

function findJsonPathValue(source: string, index: number, path: readonly string[]): { start: number; end: number } | undefined {
  const start = skipJsonWhitespace(source, index);
  if (path.length === 0) {
    const end = skipJsonValue(source, start);
    return end === undefined ? undefined : { start, end };
  }
  if (source[start] !== '{') return undefined;
  let cursor = start + 1;
  while (cursor < source.length) {
    cursor = skipJsonWhitespace(source, cursor);
    if (source[cursor] === '}') return undefined;
    const key = scanJsonString(source, cursor);
    if (!key) return undefined;
    cursor = skipJsonWhitespace(source, key.end);
    if (source[cursor] !== ':') return undefined;
    const valueStart = skipJsonWhitespace(source, cursor + 1);
    if (key.value === path[0]) {
      const found = findJsonPathValue(source, valueStart, path.slice(1));
      if (found) return found;
    }
    const valueEnd = skipJsonValue(source, valueStart);
    if (valueEnd === undefined) return undefined;
    cursor = skipJsonWhitespace(source, valueEnd);
    if (source[cursor] === ',') {
      cursor += 1;
      continue;
    }
    if (source[cursor] === '}') return undefined;
    return undefined;
  }
  return undefined;
}

/** Locate the accepted graph header's metadata.notation JSON token. */
export function findGraphNotationValueRange(source: string): SourceRange | undefined {
  const lines = source.split('\n');
  let lineOffset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const directive = /^\s*@graph(?:\s|$)/.exec(line);
    if (!directive) {
      lineOffset += line.length + 1;
      continue;
    }
    const graphToken = line.indexOf('@graph', directive.index);
    const jsonStart = skipJsonWhitespace(line, graphToken + '@graph'.length);
    const located = findJsonPathValue(line, jsonStart, ['metadata', 'notation']);
    if (!located) return undefined;
    return {
      start: { line: index + 1, column: located.start, offset: lineOffset + located.start },
      end: { line: index + 1, column: located.end, offset: lineOffset + located.end },
    };
  }
  return undefined;
}

function installedHeaderNotation(source: string): NotationType | undefined {
  if (is028HeaderSource(source)) {
    // Resolve the header independently of body projection: a malformed body
    // must not hide an installed diagram type from Save or the editor shell.
    const notation = parseInstalledDocument028(source).header.header?.diagramType;
    return typeof notation === 'string' && notationRegistry.has(notation)
      ? notation as NotationType : undefined;
  }
  const range = findGraphNotationValueRange(source);
  if (!range) return undefined;
  try {
    const value = JSON.parse(source.slice(range.start.offset, range.end.offset)) as unknown;
    return typeof value === 'string' && notationRegistry.has(value) ? value as NotationType : undefined;
  } catch {
    return undefined;
  }
}

function is028HeaderSource(source: string): boolean {
  return /^[ \t]*@diagram\b/m.test(source);
}

function editorVisualFonts028(
  saved: unknown, style: RenderStyle028,
): ReturnType<typeof normalizeDiagramFontSettings> {
  const settings = normalizeDiagramFontSettings(saved);
  const baseline = DEFAULT_DIAGRAM_FONT_SETTINGS.default;
  const requested = settings.default;
  if (requested.family !== baseline.family || requested.size !== baseline.size ||
    requested.weight !== baseline.weight || requested.lineHeight !== baseline.lineHeight) return settings;
  const visual = visualStyle028(style);
  return { ...settings, default: { family: visual.fontFamily, size: visual.labelSize,
    weight: style === 'hifi' ? 600 : 500, lineHeight: 1.4 } };
}

/** Preview a source-owned profile change before it reinterprets authored words. */
function profileSwitchPreview028(source: string, from: string, to: string): string | undefined {
  const parsed = parseInstalledDocument028(source);
  // User symbols resolve through a document catalog built for each notation compared.
  const definitions = parsed.definitions ?? [];
  const fromSymbols029 = definitions.length ? documentCatalog029(from, definitions) : undefined;
  const toSymbols029 = definitions.length && notationRegistry.has(to) ? documentCatalog029(to, definitions) : undefined;
  const nodes = flattenAuthoringNodes(parsed.syntax.graph);
  const edgeCount = parsed.syntax.graph.edges.length;
  if (nodes.length === 0 && edgeCount === 0) return undefined;
  const changes = nodes.flatMap((node) => {
    const before = resolveNotationNode028(node, from, fromSymbols029);
    const after = resolveNotationNode028(node, to, toSymbols029);
    const identity = (value: typeof before) => JSON.stringify({
      status: value.status, symbol: value.effectiveSymbolId,
      variant: value.effectiveVariantId,
      ports: value.semanticPorts.map((port) => ({ id: port.id, direction: port.direction, anchor: port.anchor })),
    });
    if (identity(before) === identity(after)) return [];
    const label = (value: typeof before) => value.effectiveSymbolId
      ? `${value.effectiveSymbolId}${value.effectiveVariantId ? `:${value.effectiveVariantId}` : ''}`
      : value.status;
    return [`${node.id}: ${label(before)} → ${label(after)}`];
  });
  const shown = changes.slice(0, 5);
  const remainder = changes.length > shown.length ? `\n… and ${changes.length - shown.length} more node changes.` : '';
  const nodeSummary = changes.length
    ? `\n\nSymbol/port interpretation changes:\n${shown.join('\n')}${remainder}`
    : '\n\nNo node symbol or port changes were detected.';
  const fromCatalog = notationRegistry.get(from);
  const toCatalog = notationRegistry.get(to);
  const connectorChanges = parsed.syntax.graph.edges.flatMap((edge) => {
    if (edge.type) {
      const recognizedBefore = fromCatalog?.edgeStyles?.[edge.type] !== undefined;
      const recognizedAfter = toCatalog?.edgeStyles?.[edge.type] !== undefined;
      return recognizedBefore === recognizedAfter ? [] : [
        `${edge.id}: [${edge.type}] ${recognizedBefore ? 'cataloged' : 'not cataloged'} → ` +
          `${recognizedAfter ? 'cataloged' : 'not cataloged'}`,
      ];
    }
    return fromCatalog?.defaultEdgeStyle === toCatalog?.defaultEdgeStyle ? [] : [
      `${edge.id}: catalog default ${fromCatalog?.defaultEdgeStyle ?? 'none'} → ` +
        `${toCatalog?.defaultEdgeStyle ?? 'none'}`,
    ];
  });
  const shownConnectors = connectorChanges.slice(0, 5);
  const connectorSummary = connectorChanges.length
    ? `\n\nConnector catalog changes:\n${shownConnectors.join('\n')}` +
      (connectorChanges.length > shownConnectors.length
        ? `\n… and ${connectorChanges.length - shownConnectors.length} more connector changes.` : '')
    : '';
  const sourceWarning = parsed.header.diagnostics.length ||
    parsed.syntax.diagnostics.some((item) => item.severity === 'error')
    ? '\nThe source has errors, so this preview covers only parsed declarations.' : '';
  return `Change this Coral diagram from ${from} to ${to}?${nodeSummary}${connectorSummary}` +
    `\nProfile rules and uncataloged connector meaning may also change; review them after switching.${sourceWarning}`;
}

function supportedCanonicalEquivalent(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'number' && typeof actual === 'number') return Math.abs(expected - actual) <= 0.011;
  if (expected === null || actual === null || typeof expected !== 'object' || typeof actual !== 'object') {
    return expected === actual;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) return false;
    return expected.every((item, index) => supportedCanonicalEquivalent(item, actual[index]));
  }
  const clean = (value: object) => Object.entries(value)
    .filter(([key, item]) => item !== undefined && key !== 'sourceInfo' && key !== 'lineStyle')
    .sort(([left], [right]) => left.localeCompare(right));
  const left = clean(expected as object);
  const right = clean(actual as object);
  return left.length === right.length && left.every(([key, value], index) =>
    key === right[index][0] && supportedCanonicalEquivalent(value, right[index][1]));
}

function firstCanonicalDifference(expected: unknown, actual: unknown, path = 'graph'): string | null {
  if (typeof expected === 'number' && typeof actual === 'number') {
    return Math.abs(expected - actual) <= 0.011 ? null : path;
  }
  if (expected === actual) return null;
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) return path;
    for (let index = 0; index < expected.length; index += 1) {
      const difference = firstCanonicalDifference(expected[index], actual[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (!expected || !actual || typeof expected !== 'object' || typeof actual !== 'object') return path;
  const clean = (value: object) => Object.entries(value)
    .filter(([key, item]) => item !== undefined && key !== 'sourceInfo' && key !== 'lineStyle')
    .sort(([left], [right]) => left.localeCompare(right));
  const left = clean(expected as object);
  const right = clean(actual as object);
  if (left.length !== right.length) {
    const leftKeys = new Set(left.map(([key]) => key));
    const rightKeys = new Set(right.map(([key]) => key));
    const missing = [...leftKeys].filter((key) => !rightKeys.has(key));
    const extra = [...rightKeys].filter((key) => !leftKeys.has(key));
    return `${path} (missing: ${missing.join(',') || 'none'}; extra: ${extra.join(',') || 'none'})`;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index][0] !== right[index][0]) return `${path}.${left[index][0]}`;
    const difference = firstCanonicalDifference(left[index][1], right[index][1], `${path}.${left[index][0]}`);
    if (difference) return difference;
  }
  return null;
}

const SOURCE_GRAPH_FIELDS = sourceComparableFields('graph');
const SOURCE_NODE_FIELDS = sourceComparableFields('node');
const SOURCE_EDGE_FIELDS = sourceComparableFields('edge');

function supportedSourceGraph(value: GraphIR): unknown {
  const pick = (record: Record<string, unknown>, allowed: Set<string>) => Object.fromEntries(
    Object.entries(record).filter(([key, item]) => allowed.has(key) && item !== undefined),
  );
  const nodes = (items: GraphIR['nodes']): unknown[] => items.map((node) => ({
    ...pick(node as unknown as Record<string, unknown>, SOURCE_NODE_FIELDS),
    ...(node.children ? { children: nodes(node.children) } : {}),
  }));
  return {
    ...pick(value as unknown as Record<string, unknown>, SOURCE_GRAPH_FIELDS),
    nodes: nodes(value.nodes),
    edges: value.edges.map((edge) => pick(edge as unknown as Record<string, unknown>, SOURCE_EDGE_FIELDS)),
  };
}

function unsupportedSourceFields(value: GraphIR): string[] {
  const unsupported = (record: Record<string, unknown>, supported: Set<string>, path: string) =>
    Object.entries(record)
      .filter(([key, item]) => item !== undefined && !supported.has(key))
      .map(([key]) => `${path}.${key}`);
  const visitNodes = (nodes: GraphIR['nodes'], path: string): string[] => nodes.flatMap((node, index) => [
    ...unsupported(node as unknown as Record<string, unknown>, SOURCE_NODE_FIELDS, `${path}[${index}]`),
    ...visitNodes(node.children ?? [], `${path}[${index}].children`),
  ]);
  return [
    ...unsupported(value as unknown as Record<string, unknown>, SOURCE_GRAPH_FIELDS, 'graph'),
    ...visitNodes(value.nodes, 'graph.nodes'),
    ...value.edges.flatMap((edge, index) => unsupported(
      edge as unknown as Record<string, unknown>, SOURCE_EDGE_FIELDS, `graph.edges[${index}]`,
    )),
  ];
}

/**
 * The editor keeps a flat edge `lineStyle` for its own projections; GraphIR
 * carries it only as `style.lineStyle`. Every document the editor writes goes
 * through this, so saves, recovery snapshots, and exports stay valid GraphIR.
 */
function withCanonicalEdgeStyles(graph: GraphIR): GraphIR {
  return {
    ...graph,
    edges: graph.edges.map(({ lineStyle, ...edge }) => ({
      ...edge,
      ...((lineStyle || edge.style) ? { style: {
        ...edge.style,
        ...(lineStyle ? { lineStyle } : {}),
      } } : {}),
    })),
  };
}

/** Each GraphIR migration change and loss, attributed to the opened file (R-064 AC-3). */
function migrationNotices(
  evidence: ReturnType<typeof migrateDocumentWithDiagnostics>['graphIR'],
  fileName: string,
): EditorParseError[] {
  if (!evidence) return [];
  const step = evidence.fromVersion === evidence.toVersion
    ? `${fileName}: GraphIR ${evidence.fromVersion} normalized`
    : `${fileName}: GraphIR ${evidence.fromVersion} → ${evidence.toVersion}`;
  return [
    ...evidence.changes.map((change) => ({
      severity: 'info' as const, code: 'coral.open.migration.change',
      message: `${step}: ${change.path || '/'}: ${change.message}`,
    })),
    ...evidence.losses.map((loss) => ({
      severity: 'warning' as const, code: 'coral.open.migration.loss',
      message: `${step}: ${loss.path || '/'}: ${loss.message}`,
    })),
  ];
}

/**
 * Resolve the complete GraphIR port set supplied by a node's notation symbol.
 * Direction is symbol metadata rather than a GraphIR Port field, so preserve
 * it under the portable properties extension.
 */
export function symbolProvidedPorts(doc: Pick<CoralDocument, 'settings'>): PortResolver {
  return (node, graph) => {
    const header = effectiveGraphNotationId028(graph);
    const portableProfile = graph.profile ? `uml-${graph.profile.kind}` : undefined;
    const setting = doc.settings?.notation;
    // A present saved profile is authoritative even when this installation
    // cannot resolve it; never borrow ports from a document setting instead.
    if (header !== undefined && (!notationRegistry.has(header) ||
      portableProfile !== undefined && header !== portableProfile)) return [];
    const notation = header ?? (typeof setting === 'string' && notationRegistry.has(setting)
      ? setting : DEFAULT_USER_PREFERENCES.defaultNotation);
    const interpretation = resolveNotationNode028(node, notation);
    if (interpretation.status === 'unknown-symbol' || interpretation.status === 'unknown-variant') return [];
    const symbol = interpretation.effectiveSymbolId
      ? symbolRegistry.get(interpretation.effectiveSymbolId) : undefined;
    const ports = (node.variant ? symbol?.variants?.[node.variant]?.ports : undefined) ?? symbol?.ports;
    return ports?.map((port) => ({
      id: port.id,
      side: port.anchor,
      ...(port.label !== undefined ? { label: port.label } : {}),
      ...(port.position !== undefined ? { position: port.position } : {}),
      properties: {
        direction: port.direction,
        ...(port.maxConnections !== undefined ? { maxConnections: port.maxConnections } : {}),
      },
    }));
  };
}

/** Complete all fallible document work before the controller mutates live state. */
export function prepareDocumentReplacement(
  doc: CoralDocument,
  projectNodes: typeof projectDiagramNodes = projectDiagramNodes,
  options: { fileName?: string; notices?: EditorParseError[]; sourceOwnedCoral028?: string } = {},
): PreparedDocumentReplacement {
  if (options.sourceOwnedCoral028 !== undefined && !is028HeaderSource(options.sourceOwnedCoral028)) {
    throw new Error('Source-owned Coral staging requires an explicit 0.2.8 diagram header.');
  }
  const resolvePorts = symbolProvidedPorts(doc);
  const migration = migrateDocumentWithDiagnostics(doc, { resolvePorts });
  const migratedDoc = migration.document;
  const result = deserialize(migratedDoc, { resolvePorts });
  const openedGraph: GraphIR = structuredClone(migratedDoc.content.graphIR ?? {
    version: '3.0.0', id: 'diagram', nodes: [], edges: [],
  });
  const headerNotation = typeof openedGraph.metadata?.notation === 'string'
    ? openedGraph.metadata.notation : undefined;
  const portableNotation = openedGraph.profile?.id === 'uml'
    ? `uml-${openedGraph.profile.kind}` : undefined;
  if (portableNotation && headerNotation && portableNotation !== headerNotation) {
    throw new Error(`The opened graph notation ${headerNotation} contradicts its portable ${portableNotation} profile.`);
  }
  if (portableNotation && !notationRegistry.has(portableNotation)) {
    throw new Error(`The opened graph profile ${portableNotation} is not installed.`);
  }
  const settingNotation = result.settings.notation as NotationType | undefined;
  const productDefault = DEFAULT_USER_PREFERENCES.defaultNotation as NotationType;
  const validFallback = settingNotation && notationRegistry.has(settingNotation)
    ? settingNotation
    : notationRegistry.has(productDefault) ? productDefault : 'flowchart';
  const loadedNotation = (portableNotation ?? (headerNotation !== undefined && notationRegistry.has(headerNotation)
    ? headerNotation : validFallback)) as NotationType;
  result.settings = { ...result.settings, notation: loadedNotation };
  const openedNodes = new Map(flattenAuthoringNodes(openedGraph).map((node) => [node.id, node]));
  const openedEdges = new Map(openedGraph.edges.map((edge) => [edge.id, edge]));
  const graphNodes: GraphNode[] = result.nodes.map((node: CoralNode) => {
    const authored = openedNodes.get(node.id);
    return ({
    ...authored,
    ...node.data.canonical,
    id: node.id,
    type: node.data.nodeType || 'service',
    label: node.data.label,
    description: node.data.description,
    properties: node.data.properties,
    ...(authored?.position ? { position: { ...authored.position } } : {}),
    ...(authored?.pinned === true ? { pinned: true } : {}),
    parent: node.parentId,
  });
  });
  const graphEdges: GraphEdge[] = result.edges.map((edge: CoralEdge) => ({
    ...openedEdges.get(edge.id),
    ...edge.data?.canonical,
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.data?.label,
    type: edge.data?.edgeType,
    properties: edge.data?.properties,
    lineStyle: edge.data?.lineStyle,
    style: edge.data?.lineStyle
      ? { ...edge.data?.canonical?.style, lineStyle: edge.data.lineStyle }
      : edge.data?.canonical?.style,
    sourcePort: edge.sourceHandle ?? undefined,
    targetPort: edge.targetHandle ?? undefined,
    ...(openedEdges.get(edge.id)?.routeIntent
      ? { routeIntent: openedEdges.get(edge.id)!.routeIntent }
      : {}),
  }));
  // A graph document with an unsafe port reference is rejected before it
  // replaces anything (R-063 AC-7, R-064 AC-2); it is never partially opened.
  const portErrors = isSequenceGraph(openedGraph)
    ? [] : portSafetyDiagnostics(graphNodes, graphEdges, loadedNotation).filter(isBlocking);
  if (portErrors.length) throw new Error(portErrors.map((error) => error.message).join('\n'));
  const projectedNodes = projectNodes(
    graphNodes, loadedNotation, result.settings.font,
    result.settings.layout.sizingMode ?? 'adaptive',
  );
  const nodes: Node<SymbolNodeData>[] = projectedNodes.map((projected, index) => {
    const loaded = result.nodes[index] as CoralNode;
    return {
      ...loaded,
      ...projected,
      position: loaded.position,
      draggable: loaded.draggable ?? projected.draggable,
      data: {
        ...loaded.data,
        ...projected.data,
        canonical: loaded.data.canonical ?? projected.data.canonical,
      },
    };
  });
  // A sequence graph is its own canonical authority: the canvas projection's
  // positions, styles, and ports are not sequence fields (Slice 70, DR70-D6).
  const sequenceDocument = isSequenceGraph(openedGraph);
  // Validate before reordering: canonicalization re-derives participant and
  // message records, so it must never run over meaning it would rewrite (CR70-12).
  const [sequenceIssue] = sequenceDocument ? validateSequenceInteraction(openedGraph) : [];
  if (sequenceIssue) {
    throw new Error(`The opened sequence is outside the Coral sequence subset: ${sequenceIssue.message} (${sequenceIssue.code}).`);
  }
  // Storage order is never an authority: compare the canonical arrays (CR70-4).
  const graph: GraphIR = sequenceDocument ? canonicalizeSequenceGraph(openedGraph) : {
    ...openedGraph,
    id: openedGraph.id ?? 'diagram',
    nodes: nestCanonicalNodes(graphNodes),
    edges: graphEdges,
  };
  const projectedEdges = projectEdgesForCanvas(graph, loadedNotation, undefined, result.settings.font);
  const edges: Edge[] = projectedEdges.map((projected, index) => {
    const loaded = result.edges[index] as CoralEdge;
    return {
      ...loaded,
      ...projected,
      style: { ...loaded.style, ...projected.style },
      data: {
        ...loaded.data,
        ...projected.data,
        canonical: loaded.data?.canonical ?? projected.data?.canonical,
      },
    };
  });
  const waypoints = new Map<string, EdgeWaypoint[]>(
    [...(result.edgeWaypoints ?? [])].map(([id, points]) => [id, points.map((point) => ({
      ...point, type: point.type as EdgeWaypoint['type'],
    }))]),
  );
  for (const edge of graphEdges) {
    if (waypoints.has(edge.id)) continue;
    const routing = migratedDoc.edgeRouting?.[edge.id];
    if (routing?.isPinned) {
      waypoints.set(edge.id, []);
      continue;
    }
    const authored = edge.routeIntent?.waypoints.flatMap((waypoint) => waypoint.placement.kind === 'absolute'
      ? [{
          id: waypoint.id,
          x: waypoint.placement.position.x,
          y: waypoint.placement.position.y,
          type: 'corner' as const,
        }]
      : []) ?? [];
    if (authored.length) {
      waypoints.set(edge.id, authored);
      continue;
    }
    if (edge.routingPoints?.length) {
      waypoints.set(edge.id, edge.routingPoints.map((point, index) => ({
        id: `${edge.id}-loaded-${index}`, x: point.x, y: point.y, type: 'corner' as const,
      })));
    }
  }
  // GraphIR interchange is not authored Coral. Use the installed writer for
  // every graph it can verify, regardless of profile; retain the distinct
  // GraphIR interchange path for fields outside that writer's subset.
  const preferredInstalledPrint = options.sourceOwnedCoral028 === undefined
    ? printInstalledSource028(graph, loadedNotation) : undefined;
  const installedPrint = preferredInstalledPrint?.text ? preferredInstalledPrint : undefined;
  // A source-open shell is a temporary display input, not a graph-only
  // document that must be printed into Coral. The original 0.2.8 text is
  // authoritative and the canvas stays mutation-locked until it publishes.
  const printed = options.sourceOwnedCoral028 !== undefined
    ? { text: options.sourceOwnedCoral028, diagnostics: [] }
    : installedPrint
      ? { text: installedPrint.text ?? '', diagnostics: installedPrint.diagnostics }
      : printCoralDSLWithDiagnostics(graph);
  const printError = printed.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
  if (printError) {
    throw new Error(`The opened document cannot be represented as editable Coral source: ${printError.code}: ${printError.message}`);
  }
  if (options.sourceOwnedCoral028 === undefined) {
    const reparsedGraph = installedPrint
      ? parseInstalledDocument028(printed.text).graph : parseCanonicalCoral(printed.text).graph;
    if (!reparsedGraph) {
      throw new Error('The opened document could not be represented as editable Coral source.');
    }
    const expectedCanonical = installedPrint
      ? { ...graph, id: reparsedGraph.id, metadata: { ...graph.metadata, notation: loadedNotation } }
      : sequenceDocument ? graph : withCanonicalEdgeStyles(graph);
    const supportedExpected = supportedSourceGraph(expectedCanonical);
    const supportedActual = supportedSourceGraph(reparsedGraph);
    if (!supportedCanonicalEquivalent(supportedExpected, supportedActual)) {
      throw new Error(`The opened document failed the Coral source equivalence check at ${firstCanonicalDifference(supportedExpected, supportedActual) ?? 'an unknown field'}.`);
    }
  }
  return {
    doc: migratedDoc, result, notation: loadedNotation, graphNodes, graphEdges, graph, nodes, edges, waypoints,
    source: printed.text,
    sourceDiagnostics: [
      ...(options.notices ?? []),
      ...migrationNotices(migration.graphIR, options.fileName ?? migratedDoc.metadata.name),
      ...(options.sourceOwnedCoral028 === undefined && !installedPrint ? [{
        severity: 'warning' as const, code: 'coral.graphir.interchange.preview',
        message: 'This GraphIR interchange document cannot be represented as Coral 0.2.8 source. The text view is a preview; the GraphIR document remains authoritative.',
      }] : []),
      ...printed.diagnostics.map(editorDiagnostic),
      ...unsupportedSourceFields(graph).map((field) => ({
        severity: 'warning' as const,
        code: 'coral.source.opaque-field',
        message: `[coral.source.opaque-field] ${field} remains authoritative in the opened document but is not editable in Coral source.`,
      })),
      ...(headerNotation !== undefined && !notationRegistry.has(headerNotation) ? [(() => {
        const range = findGraphNotationValueRange(printed.text);
        return {
        line: range?.start.line ?? 1,
        ...(range ? { column: range.start.column, offset: range.start.offset, range } : {}),
        code: 'coral.source.notation.unknown',
        severity: 'error' as const,
        message: `[coral.source.notation.unknown] Notation "${headerNotation}" is not installed; using "${loadedNotation}" while retaining the source header.`,
      }; })()] : []),
    ],
  };
}

const SOURCE_ERRORS_LOCK_MESSAGE = 'Fix the source errors before editing the diagram. The canvas is view-only while the source has errors.';
const AI_MUTATION_LOCK_MESSAGE = 'Wait for the assistant to finish before editing.';
const AI_OPEN_LOCK_MESSAGE = 'Wait for the assistant to finish before opening another document.';
const REPLACE_WORK_CONFIRMATION = 'Replace your unsaved work?';
const REPLACEMENT_CANCELLED_MESSAGE = 'Document replacement cancelled. Your current work is unchanged.';

/** Compact owner labels (source badge, Inspector chip) that lead their refusal copy. */
const STRUCTURAL_UPDATE_LABEL = 'Updating diagram';
const SOURCE_UPDATE_LABEL = 'Updating source';

/**
 * The one Slice 94 refusal inventory (design §12). An update owner and the
 * refused intent select the copy; the owner lead is announced only by the
 * state that actually owns the document.
 */
const UPDATE_REFUSAL_MESSAGES = {
  structural: `${STRUCTURAL_UPDATE_LABEL}. Editing is temporarily unavailable.`,
  source: `${SOURCE_UPDATE_LABEL}. Canvas editing is temporarily unavailable.`,
  reflow: 'Finish the current diagram update before Reflow.',
  open: 'Finish the current diagram update before opening another document.',
  aiRequest: 'Finish the current diagram update before requesting AI changes.',
  aiApply: 'Finish the current diagram update before applying AI changes.',
  waypoint: 'Finish the current diagram update before moving a waypoint.',
} as const;
type UpdateRefusalIntent = 'edit' | 'source-edit' | 'source-gesture' | 'reflow' | 'open' | 'ai-request' | 'waypoint-drag';
const UPDATE_REFUSAL_COPY = new Set<string>(Object.values(UPDATE_REFUSAL_MESSAGES));
const SOURCE_028_CANVAS_LOCK_MESSAGE =
  'Edit this 0.2.8 diagram in Coral source; inline node labels, selected connector labels, and semantic-port connections preserve its authored notation.';

/** The accepted state a diagram-to-text print-back reads besides the canvas. */
interface PrintBackInputs {
  sourceGraph: GraphIR;
  lastParsed: { nodes: GraphNode[]; edges: GraphEdge[] };
  exactNodeIds: ReadonlySet<string>;
}

/** Displayed canvas geometry for the layout-quality gate (R-054 AC-1). */
function qualitySceneFromCanvas(nodes: Node[], edges: Edge[], authoredEdges: GraphIR['edges']): QualityScene {
  const authored = new Map(authoredEdges.map((edge) => [edge.id, edge.routingPoints]));
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      ...(node.parentId ? { parent: node.parentId } : {}),
      position: { ...node.position },
      ...(typeof (node.width ?? node.measured?.width) === 'number' ? { width: node.width ?? node.measured!.width } : {}),
      ...(typeof (node.height ?? node.measured?.height) === 'number' ? { height: node.height ?? node.measured!.height } : {}),
    })),
    edges: edges.map((edge) => {
      const routed = edge.data?.routedPath as { startPoint?: Position; endPoint?: Position; bendPoints?: Position[] } | undefined;
      const points = authored.get(edge.id);
      return {
        id: edge.id, source: edge.source, target: edge.target,
        ...(routed?.startPoint && routed.endPoint
          ? { routed: [routed.startPoint, ...(routed.bendPoints ?? []), routed.endPoint] } : {}),
        ...(points?.length ? { authored: points } : {}),
      };
    }),
  };
}

const FORMAT_LABELS: Record<SourceFormat, string> = {
  coral: 'Coral source', mermaid: 'Mermaid', dot: 'DOT', plantuml: 'PlantUML',
  'graphir-json': 'GraphIR JSON', 'coral-document': 'Coral document JSON',
};
const OPEN_EXTENSION = /\.(coral\.json|json|coral|mmd|mermaid|dot|gv|puml|plantuml|pu|txt)$/i;

type CanonicalGraphInput = { nodes: GraphNode[]; edges: GraphEdge[] };

/** The part of a DOM or React drag event the shell drop target uses. */
type ShellDragEvent = {
  preventDefault(): void;
  dataTransfer: Pick<DataTransfer, 'files' | 'types' | 'dropEffect'> | null;
};

/** Text the editor holds as source, with the graph its parser recovered. */
export interface TextOpen {
  text: string;
  format: DSLType;
  envelope: Omit<GraphIR, 'nodes' | 'edges'>;
  canonicalInput: CanonicalGraphInput;
  diagnostics: EditorParseError[];
  /** Present when the source has errors: the export-blocked label. */
  blockWith?: string;
  positions?: Record<string, Position>;
}

/** How an open changed the file's source format, for the user-facing notice (R-064 AC-3). */
export type FileOpenOutcome = { kind: 'converted' | 'interchange' | 'restored-source'; formatLabel: string };

export type FileOpenPlan =
  | { kind: 'blocked'; reasons: EditorParseError[] }
  | { kind: 'open'; prepared: PreparedDocumentReplacement; textOpen?: TextOpen; outcome?: FileOpenOutcome };

/**
 * The part of a recovered graph that can be laid out: references to nodes the
 * parser never produced are already reported as errors, so they are left out
 * of layout rather than failing it. The source text keeps them.
 */
function recoveredLayoutInput(nodes: GraphNode[], edges: GraphEdge[]): CanonicalGraphInput {
  const ids = new Set(nodes.map((node) => node.id));
  return {
    nodes: nodes.map((node) => (node.parent && !ids.has(node.parent) ? { ...node, parent: undefined } : node)),
    edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
  };
}

const isBlocking = (item: { severity?: string }) => item.severity === undefined || item.severity === 'error';

/** Keep foreign source as text while deriving only the graph its reader verifies. */
function parseEditorSource(text: string, format: DSLType): EditorParseResult {
  if (format === 'coral') return parseCoralDSL(text);
  if (format === 'mermaid' && !text.trim()) return { nodes: [], edges: [], diagnostics: [], errors: [] };
  const imported = format === 'mermaid' ? parseMermaid(text)
    : format === 'dot' ? parseDot(text) : parsePlantUml(text);
  const importedDiagnostics = imported.diagnostics.map(editorDiagnostic);
  // Even an informational "unparsed" or dropped-directive notice means the
  // foreign text has meaning this projection cannot verify. Keep the text,
  // display recovered nodes if available, and fail semantic export closed.
  const unverified: EditorParseError[] = importedDiagnostics.length || !imported.graph ? [{
    severity: 'error', code: 'coral.foreign.projection.unverified',
    message: 'Foreign source has unverified constructs; semantic export is blocked until importer diagnostics are resolved.',
  }] : [];
  const diagnostics = [...importedDiagnostics, ...unverified];
  const errors = diagnostics.filter(isBlocking);
  if (!imported.graph) return { nodes: [], edges: [], diagnostics, errors };
  const { nodes: _nodes, edges: _edges, ...envelope } = imported.graph;
  void _nodes;
  void _edges;
  const projected = projectCanonicalGraph(imported.graph);
  return { nodes: projected.nodes, edges: projected.edges, diagnostics, errors, envelope };
}

/**
 * Whether restored text would block in the displayed parse: the editor
 * parser's errors plus an uninstalled header notation. Recovery uses this to
 * decide whether the restored text must be parsed and blocked.
 */
function sourceTextBlocksDisplay(text: string, format: DSLType): boolean {
  const parsed = parseEditorSource(text, format);
  if (parsed.errors.some(isBlocking)) return true;
  const notation = format === 'coral' ? parsed.envelope?.metadata?.notation : undefined;
  return typeof notation === 'string' && !notationRegistry.has(notation);
}

function sourceTextHasErrors(text: string, format: DSLType): boolean {
  return parseEditorSource(text, format).errors.some(isBlocking);
}

function restoredHistorySourceState(entry: DslHistoryEntry): {
  locked: boolean;
  parseErrors: EditorParseError[];
  analysis: EditorAnalysisState;
} {
  const format = entry.dslType as DSLType;
  const reparsed = parseEditorSource(entry.dsl, format);
  const key = (item: { code?: string; message: string; line?: number; column?: number }) =>
    `${item.code ?? ''}\u0000${item.message}\u0000${item.line ?? ''}\u0000${item.column ?? ''}`;
  const recordedErrors = structuredClone(entry.parseErrors);
  const errorKeys = new Set(recordedErrors.map(key));
  const missingErrors = reparsed.errors.filter((error) => !errorKeys.has(key(error)));
  const parseErrors = [...recordedErrors, ...missingErrors];
  const analysis = structuredClone(entry.editorAnalysis);
  const analysisKeys = new Set(analysis.diagnostics.map(key));
  analysis.source = entry.dsl;
  analysis.language = format;
  analysis.diagnostics.push(...reparsed.errors.filter((error) => !analysisKeys.has(key(error)))
    .map((error) => ({ ...error, severity: error.severity ?? 'error' as const })));
  return {
    locked: entry.publication.status === 'blocked' || reparsed.errors.some(isBlocking),
    parseErrors,
    analysis,
  };
}

/** Save backstop: a graph document the same build would refuse to reopen is never written. */
function savedGraphHasUnsafePorts(doc: CoralDocument): boolean {
  const graph = doc.content.graphIR;
  if (!graph || isSequenceGraph(graph)) return false;
  const nodes = flattenAuthoringNodes(graph) as GraphNode[];
  const selected = effectiveGraphNotationId028(graph);
  const notation = (selected && notationRegistry.has(selected)
    ? selected : doc.settings.notation) as NotationType;
  return portSafetyDiagnostics(nodes, graph.edges, notation).some(isBlocking);
}

/** Label the count and the first error, pointing to the complete list. */
function recoveredGraphLabel(errors: EditorParseError[]): string {
  const first = errors[0];
  const where = first.line ? `Line ${first.line}: ` : '';
  return `Recovered graph: ${errors.length} ${errors.length === 1 ? 'error' : 'errors'} — first: ${where}${first.message}; use Show all diagnostics for the full list`;
}

function blocked(code: string, messages: string[]): FileOpenPlan {
  return { kind: 'blocked', reasons: messages.filter(Boolean).map((message) => ({ severity: 'error', code, message })) };
}

/**
 * Decide everything about opening a file before any live state changes
 * (R-064). Coral source opens with its recovered graph; an invalid document
 * or GraphIR, unrecognized content, and an import with errors are blocked
 * with every reason.
 */
export function planFileOpen(file: OpenFileInput): FileOpenPlan {
  const baseName = file.name.replace(OPEN_EXTENSION, '') || 'Untitled Diagram';
  const detection = detectFormat(file.text, { fileName: file.name });
  const expected = detection.candidates.map((format) => FORMAT_LABELS[format]).join(', ');
  const notices: EditorParseError[] = detection.basis === 'fallback' ? [{
    severity: 'warning', code: 'coral.open.format.assumed',
    message: `${file.name} has no recognized format signature, so it opened as Coral source. Other candidates: ${expected}.`,
  }] : [];
  const namedDocument = (content: CoralDocument['content'], base?: CoralDocument): CoralDocument => {
    const blank = createBlankDocument();
    return {
      ...(base ?? blank),
      metadata: base?.metadata ?? { ...blank.metadata, name: baseName },
      content,
    };
  };

  const openText = (text: string, format: DSLType, base?: CoralDocument): FileOpenPlan => {
    const parsed = parseEditorSource(text, format);
    const envelope = parsed.envelope ?? { version: '3.0.0' as const, id: 'diagram' };
    const diagnosedSequence = envelope.interaction !== undefined &&
      parsed.errors.some(isBlocking);
    const admittedInteraction = envelope.interaction !== undefined && !diagnosedSequence;
    // A sequence interaction is referential: its participant and message IDs
    // need the matching nodes and edges during document admission. Other
    // profiles retain the empty admission shell and use the parsed layout
    // input below, including drafts with dangling references. A diagnosed
    // foreign sequence is saved as text without admitting its partial model.
    const shell: GraphIR = {
      version: '3.0.0', id: envelope.id ?? 'diagram',
      ...(envelope.name !== undefined ? { name: envelope.name } : {}),
      ...(!diagnosedSequence && envelope.metadata !== undefined ? { metadata: envelope.metadata } : {}),
      ...(!diagnosedSequence && envelope.profile !== undefined ? { profile: envelope.profile } : {}),
      ...(admittedInteraction ? { interaction: envelope.interaction } : {}),
      nodes: admittedInteraction ? parsed.nodes : [],
      edges: admittedInteraction ? parsed.edges.map(({ routingPoints: _retired, ...edge }) => edge) : [],
    };
    const doc = namedDocument({ format: 'graph-ir', graphIR: shell }, base);
    delete doc.nodePositions;
    delete doc.edgeRouting;
    let prepared: PreparedDocumentReplacement;
    try {
      prepared = prepareDocumentReplacement(doc, projectDiagramNodes, { fileName: file.name,
        ...(format === 'coral' && is028HeaderSource(text) ? { sourceOwnedCoral028: text } : {}) });
    } catch (error) {
      return blocked('coral.open.document.invalid', [error instanceof Error ? error.message : String(error)]);
    }
    const headerNotation = format === 'coral' && typeof envelope.metadata?.notation === 'string'
      ? envelope.metadata.notation : undefined;
    // Direct Coral open names every unsafe port reference before layout, so
    // the recovered graph opens visibly blocked (R-063 AC-7, R-064 AC-4).
    const openNotation = (headerNotation !== undefined && notationRegistry.has(headerNotation) ? headerNotation
      : prepared.notation) as NotationType;
    const portDiagnostics = format === 'coral' && !isSequenceGraph(envelope) && !parsed.semanticInterpretations
      ? portSafetyDiagnostics(parsed.nodes, parsed.edges, openNotation) : [];
    const diagnostics = [...notices, ...(parsed.diagnostics ?? parsed.errors), ...portDiagnostics];
    const errors: EditorParseError[] = [
      ...parsed.errors.filter(isBlocking),
      ...portDiagnostics.filter(isBlocking),
      ...(headerNotation !== undefined && !notationRegistry.has(headerNotation) ? [{
        line: findGraphNotationValueRange(text)?.start.line ?? 1,
        severity: 'error' as const, code: 'coral.source.notation.unknown',
        message: `Notation "${headerNotation}" is not installed`,
      }] : []),
    ];
    // A saved foreign draft reopens as its own raw text; nothing is converted.
    const restored: EditorParseError[] = format !== 'coral' && base ? [{
      severity: 'info', code: 'coral.open.restored-source',
      message: `Restored the saved ${FORMAT_LABELS[format]} source from ${file.name}. It was not converted.`,
    }] : [];
    return {
      kind: 'open',
      prepared: { ...prepared, source: text, sourceDiagnostics: [...notices, ...restored] },
      ...(restored.length ? { outcome: { kind: 'restored-source' as const, formatLabel: FORMAT_LABELS[format] } } : {}),
      textOpen: {
        text, format, envelope: { ...envelope, version: '3.0.0' } as Omit<GraphIR, 'nodes' | 'edges'>,
        canonicalInput: recoveredLayoutInput(parsed.nodes, parsed.edges),
        diagnostics: [...diagnostics, ...restored],
        ...(errors.length ? { blockWith: recoveredGraphLabel(errors) } : {}),
        ...(base?.nodePositions ? { positions: base.nodePositions } : {}),
      },
    };
  };

  const openPrepared = (doc: CoralDocument, extra: EditorParseError[] = []): FileOpenPlan => {
    try {
      return {
        kind: 'open',
        prepared: prepareDocumentReplacement(doc, projectDiagramNodes, { fileName: file.name, notices: [...notices, ...extra] }),
      };
    } catch (error) {
      return blocked('coral.open.document.invalid', (error instanceof Error ? error.message : String(error)).split(/\n|; /));
    }
  };

  const openImport = (text: string, format: 'mermaid' | 'dot' | 'plantuml', base?: CoralDocument): FileOpenPlan => {
    if (format !== 'mermaid') return openText(text, format, base);
    const imported = parseMermaid(text);
    const errors = imported.diagnostics.filter(isBlocking);
    if (errors.length || !imported.graph) {
      // Malformed Mermaid remains saveable text with semantic export blocked.
      return openText(text, 'mermaid', base);
    }
    if (imported.graph.metadata?.notation === 'uml-sequence') {
      const canonical = imported.diagnostics.length === 0
        ? canonicalSimpleMermaidSequence028(imported.graph) : undefined;
      const supplemental = imported.diagnostics.length === 0
        ? writeSupplementalMermaidSequence028(imported.graph) : undefined;
      if (!canonical && !supplemental) return blocked('coral.open.import.sequence.unsupported', [
        'This Mermaid sequence is outside the verified message, pre-message note, or flat alt/loop/opt fragment subset; no Coral source was generated.',
      ]);
      const written = canonical ? printInstalledSource028(canonical, 'uml-sequence') :
        { text: supplemental, diagnostics: [] };
      if (!written.text) return blocked('coral.open.import.sequence.unsupported',
        written.diagnostics.map((diagnostic) => diagnostic.message));
      const verified = verifyPortableSuccessorSource028(written.text);
      if (!verified.graph || verified.diagnostics.length) return blocked('coral.open.import.sequence.unverified',
        verified.diagnostics.map((diagnostic) => diagnostic.message));
      const core = successorCoreValidationInput029(verified.graph);
      const model = validateGraphIRSuccessorWithCatalog(core.graph, core.snapshot, core.options);
      if (!model.valid || !model.verification.complete || model.verification.scope !== 'full')
        return blocked('coral.open.import.sequence.unverified',
          [...model.errors, ...model.warnings, ...model.verification.obligations]
            .map(({ code, path }) => `${code} at ${path}`));
      const plan = openText(written.text, 'coral', base);
      if (plan.kind !== 'open') return plan;
      const formatLabel = FORMAT_LABELS[format];
      const converted: EditorParseError = { severity: 'info', code: 'coral.open.converted',
        message: `Imported ${file.name} from ${formatLabel} and converted it to editable Coral source.` };
      return { ...plan,
        prepared: { ...plan.prepared,
          sourceDiagnostics: [converted, ...plan.prepared.sourceDiagnostics] },
        outcome: { kind: 'converted', formatLabel } };
    }
    return openText(text, 'mermaid', base);
  };

  const openDocument = (value: unknown): FileOpenPlan => {
    let migrated: CoralDocument;
    try {
      migrated = migrateDocumentWithDiagnostics(value as CoralDocument, {
        resolvePorts: symbolProvidedPorts(value as CoralDocument),
      }).document;
    } catch (error) {
      return blocked('coral.open.migration.failed', (error instanceof Error ? error.message : String(error)).split(/\n|; /));
    }
    const validation = validateDocument(migrated);
    if (!validation.valid) return blocked('coral.open.document.invalid', validation.errors);
    if (migrated.content.format === 'dsl') {
      const text = migrated.content.text ?? '';
      return openText(text, migrated.content.dslType ?? 'coral', migrated);
    }
    // Preparation migrates again from the original, so it can report each step.
    return openPrepared(value as CoralDocument);
  };

  switch (detection.format) {
    case null: {
      let reason = '';
      if (/^\s*[[{]/.test(file.text) || /\.json$/i.test(file.name)) {
        try { JSON.parse(file.text); } catch (error) { reason = `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`; }
      }
      return blocked('coral.open.format.unrecognized', [
        `${file.name} matches no supported format. Expected one of: ${expected}.`, reason,
      ]);
    }
    case 'coral-document':
      return openDocument(JSON.parse(file.text));
    case 'graphir-json':
      return openDocument(namedDocument({ format: 'graph-ir', graphIR: JSON.parse(file.text) }));
    case 'coral':
      return openText(file.text, 'coral');
    default:
      return openImport(file.text, detection.format);
  }
}

export function useEditorController() {
  const myIconsLibrary029 = useMyIcons029();
  const [myIconsOpen029, setMyIconsOpen029] = useState(false);
  const [dslType, setDslType] = useState<DSLType>(startupSource.format);
  const [notation, setNotation] = useState<NotationType>('flowchart');
  const [dsl, setDsl] = useState(startupSource.text);
  // Raw and saved Mermaid files own their source text.
  const [mermaidFileSource, setMermaidFileSource] = useState(false);
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node<SymbolNodeData>>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const [rasterExportError, setRasterExportError] = useState<string | null>(null);
  const rasterAttemptRef = useRef(0);
  useEffect(() => () => {
    rasterAttemptRef.current += 1;
  }, []);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const applyControlledChangesRef = useRef(onNodesChangeBase);
  const applyControlledChanges = useCallback((changes: Parameters<typeof onNodesChangeBase>[0]) => {
    applyControlledChangesRef.current(changes);
  }, []);
  // Shift+drag constrains movement to horizontal or vertical axis
  const { onNodesChange: onNodesChangeConstrained } = useAxisConstrain(applyControlledChanges, nodes);
  const axisChangesRef = useRef(onNodesChangeConstrained);
  axisChangesRef.current = onNodesChangeConstrained;
  const [loading, setLoadingState] = useState(true);
  // Synchronous mirror: an action may claim work before the next render.
  const loadingRef = useRef(true);
  const setLoading = useCallback((value: boolean) => {
    loadingRef.current = value;
    setLoadingState(value);
  }, []);
  const [parseErrors, setParseErrors] = useState<EditorParseError[]>([]);
  const [conformanceSnapshot, setConformanceSnapshot] = useState<{
    source: string;
    report: ConformanceReport | null;
    error?: string;
    /** A 0.2.9 document that selects a user symbol is not conformance-checked. */
    notChecked?: string;
  } | null>(null);
  const [openFailure, setOpenFailure] = useState<OpenFailure | null>(null);
  // Source with blocking errors makes the canvas view-only: a visual edit
  // would print a graph over text the parser could not read (R-064 AC-4).
  const [sourceErrorsLocked, setSourceErrorsLockedState] = useState(false);
  const sourceErrorsLockedRef = useRef(false);
  // The canvas shows a graph recovered from an opened file, never a last good render.
  const [recoveredGraph, setRecoveredGraph] = useState(false);
  const setSourceErrorsLocked = useCallback((locked: boolean) => {
    sourceErrorsLockedRef.current = locked;
    setSourceErrorsLockedState(locked);
  }, []);
  const [editorAnalysis, setEditorAnalysis] = useState<EditorAnalysisState>(
    { source: '', language: 'mermaid', diagnostics: [], decorations: [], entityHighlighting: false },
  );
  const formatSwitchDiagnosticsRef = useRef<EditorParseError[]>([]);
  // A graph-only interchange document may show a generated text projection,
  // but that projection is never an authored Coral save authority.
  const graphIRPreviewSourceRef = useRef<string | null>(null);
  const isAuthored028Source = (source: string) =>
    is028HeaderSource(source) && graphIRPreviewSourceRef.current !== source;
  const [formatSwitchDiagnostics, setFormatSwitchDiagnostics] = useState<
    EditorParseError[]
  >([]);
  const [debugInfo, setDebugInfo] = useState('');
  // Track if this is a format switch to bypass debounce
  const [formatSwitchPending, setFormatSwitchPending] = useState(false);
  // Track if a reflow operation is in progress
  const [isReflowing, setIsReflowing] = useState(false);
  // Document name for file operations
  const [documentName, setDocumentName] = useState('Untitled Diagram');
  const workspaceStore = useWorkspacePreferences();
  const workspacePreferences = workspaceStore.preferences;
  const inspectorCollapsed = !workspacePreferences.inspectorOpen;
  const setInspectorCollapsed = useCallback((next: boolean | ((previous: boolean) => boolean)) => {
    const collapsed = typeof next === 'function' ? next(!workspacePreferences.inspectorOpen) : next;
    workspaceStore.update({ inspectorOpen: !collapsed });
  }, [workspacePreferences.inspectorOpen, workspaceStore.update]);
  // Selected node for properties panel
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectionSummary, setSelectionSummary] = useState<{
    kind: 'none' | 'node' | 'edge' | 'mixed'; count: number; label?: string;
  }>({ kind: 'none', count: 0 });
  // Command Palette visibility (Ctrl+K)
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [exampleLink] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    if (!query.has('example') && !query.has('catalog')) return null;
    try {
      const entry = resolveExample(exampleCatalog, query.get('catalog'), query.get('example'));
      return { entry, error: null };
    } catch (error) {
      return { entry: null, error: `${error instanceof Error ? error.message : 'Invalid example link.'} Your current work is unchanged.` };
    }
  });
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [guidanceAnnouncement, setGuidanceAnnouncement] = useState('');
  // UML sequence documents (Slice 70): selection and the last refused edit.
  const [sequenceSelection, setSequenceSelection] = useState<SequenceSelection | null>(null);
  const [sequenceError, setSequenceError] = useState<string | null>(null);
  const replacementNeedsConfirmationRef = useRef(false);
  const modalInvokerRef = useRef<HTMLElement | null>(null);
  const focusSourceAfterWelcomeRef = useRef(false);
  const propertiesInvokerRef = useRef<HTMLElement | null>(null);
  const [authoringSession, setAuthoringSession] = useState<AuthoringSession | null>(null);
  const [canvasFocusRequest, setCanvasFocusRequest] = useState<CanvasFocusRequest | null>(null);
  const canvasFocusTokenRef = useRef(0);
  const pendingSourceFocusRef = useRef<{ sourceRevision: number; text: string; kind: 'node' | 'edge'; id: string } | null>(null);
  // Preferences Dialog visibility (Ctrl+,)
  const [showPreferences, setShowPreferences] = useState(false);
  // Overflow menu visibility
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  // Diagnostics panel state
  const [highlightedEdgeId, setHighlightedEdgeId] = useState<string | null>(null);
  const diagnosticsCollapsed = workspacePreferences.bottomCollapsed;
  const setDiagnosticsCollapsed = useCallback((next: boolean | ((previous: boolean) => boolean)) => {
    const collapsed = typeof next === 'function' ? next(workspacePreferences.bottomCollapsed) : next;
    workspaceStore.update({ bottomCollapsed: collapsed });
  }, [workspacePreferences.bottomCollapsed, workspaceStore.update]);
  // Bottom panel state (issue #48)
  const bottomPanelTab = workspacePreferences.bottomTab;
  const setBottomPanelTab = useCallback((tab: BottomPanelTab) => {
    workspaceStore.update({ bottomTab: tab, bottomCollapsed: false });
  }, [workspaceStore.update]);
  // Chat entries and LLM state managed by useLlmChat hook below
  // Resizable editor width (percentage)
  const editorWidthPct = workspacePreferences.sourceWidthPercent;
  const setEditorWidthPct = useCallback((percentage: number) => {
    workspaceStore.update({ sourceWidthPercent: percentage });
  }, [workspaceStore.update]);

  // DSL undo/redo for LLM-generated changes
  const dslUndoStack = useRef<DslHistoryEntry[]>([]);
  const dslRedoStack = useRef<DslHistoryEntry[]>([]);
  const transactionSequenceRef = useRef(0);
  // History entries of applied AI plans. Their Undo and Redo set the inspector from the restored
  // selection; other entries keep it, because inspector-only selections carry no canvas flags.
  const planSequencesRef = useRef(new Set<number>());
  const sourceEditSessionRef = useRef(false);
  const propertyEditSessionRef = useRef<{ key: string; changed: boolean } | null>(null);
  const [dslUndoCount, setDslUndoCount] = useState(0);
  const [dslRedoCount, setDslRedoCount] = useState(0);
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const clearDslHistory = useCallback(() => {
    dslUndoStack.current = [];
    dslRedoStack.current = [];
    setDslUndoCount(0);
    setDslRedoCount(0);
  }, []);

  // Store last parsed graph for reflow (so we can re-layout without re-parsing)
  const lastParsedRef = useRef<ParsedEditorGraph>({ nodes: [], edges: [] });
  const sourceGraphRef = useRef<GraphIR>({
    version: '3.0.0', id: 'diagram', nodes: [], edges: [],
  });
  const pendingGeneratedGraphRef = useRef<GraphIR | null>(null);
  const pendingGeneratedWaypointsRef = useRef<Map<string, EdgeWaypoint[]> | null>(null);
  const sourceDocumentMetadataRef = useRef<CoralDocument['metadata'] | null>(null);
  // Store previous diffable graph for incremental updates (CORAL-REQ-013)
  const previousGraphRef = useRef<DiffableGraph>({ nodes: [], edges: [] });
  // Track if we're doing undo/redo (skip layout during these operations)
  const isUndoRedoRef = useRef(false);
  // Track if this needs a full layout (format switch, initial load, explicit reflow)
  const needsFullLayoutRef = useRef(true);
  // Track if DSL update came from diagram changes (to prevent feedback loop)
  const isInternalDslUpdateRef = useRef(false);
  const textProjectionRef = useRef<{ text: string; format: DSLType; notation: NotationType } | null>(null);
  const pendingExactNodeIdsRef = useRef(new Set<string>());
  const skipNextDiagramSyncRef = useRef(false);
  // Measurement and selection publish nodes without changing the projected source.
  const displayOnlyNodesRef = useRef<Node<SymbolNodeData>[] | null>(null);
  const diagramSyncPendingRef = useRef(false);
  const dslRef = useRef(dsl);
  const sourceTextEditRef = useRef<(nextDsl: string) => boolean>(() => false);
  // User-typed source that no parse has finished with yet; a save keeps it.
  const unparsedUserTextRef = useRef<string | null>(null);
  const dslTypeRef = useRef(dslType);
  dslTypeRef.current = dslType;
  dslRef.current = dsl;
  const handleCheckConformance = useCallback((requestedLevel?: ConformanceLevel,
    notificationLevel: NotificationLevel = 'error') => {
    const source = unparsedUserTextRef.current ?? dslRef.current;
    if (dslTypeRef.current !== 'coral' || !isAuthored028Source(source)) return;
    const checked = checkInstalledSuccessorSourceConformance028(source,
      { ...(requestedLevel ? { requestedLevel } : {}), notificationLevel });
    if (checked.notChecked029) setConformanceSnapshot({ source, report: null, notChecked: checked.notChecked029.message });
    else setConformanceSnapshot({ source, report: checked.report ?? null,
      ...(!checked.report ? { error: 'Fix the Coral source and header before checking conformance.' } : {}) });
    setBottomPanelTab('diagnostics');
  }, [setBottomPanelTab]);
  const [textInputRevision, setTextInputRevision] = useState(0);
  const textInputRevisionRef = useRef(0);
  const textOriginOwnerRef = useRef<number | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const hasMountedDslEffectRef = useRef(false);
  // Track if we're loading a document (to prevent textarea text from triggering parse)
  const isLoadingDocumentRef = useRef(false);
  const cancelLlmRef = useRef<() => void>(() => {});
  const revisionsRef = useRef<EditorRevision | null>(null);
  const revisions = revisionsRef.current ??= new EditorRevision(() => cancelLlmRef.current());
  const activeLayoutAbortRef = useRef<AbortController | null>(null);
  const verifiedEdgeRoutesRef = useRef(new Map<string, ElkEdgeRouting>());
  const pendingVisualSourceRevisionRef = useRef<number | null>(null);
  const visualResolutionInFlightRef = useRef<number | null>(null);
  // These owners are synchronous event-boundary guards. Their matching React
  // status is presentation only; EditorRevision still decides publication.
  const structuralLayoutPendingRef = useRef<number | null>(null);
  const sourceUpdateOwnerRef = useRef<number | null>(null);
  // The source owner an Open claimed for its own text. While that owner is
  // still live, nothing the user authored is pending, so another document
  // replacement may preempt it (TR94-C4-F3).
  const openClaimedOwnerRef = useRef<number | null>(null);
  const [passiveVisualOwner, setPassiveVisualOwner] = useState<number | null>(null);
  const [updateStatus, setUpdateStatus] = useState<
    { kind: 'stable' } | { kind: 'source-pending' | 'structural-layout'; owner: number }
  >({ kind: 'stable' });
  // A refusal names a live owner; once that owner retires the copy is stale,
  // so neither the guidance region (TR94-C4-F2) nor the persistent sequence
  // error (CR94-F12) keeps holding it.
  const clearStaleRefusal = useCallback(() => {
    setGuidanceAnnouncement((current) => UPDATE_REFUSAL_COPY.has(current) ? '' : current);
    setSequenceError((current) => current !== null && UPDATE_REFUSAL_COPY.has(current) ? null : current);
  }, []);
  const beginSourceUpdate = useCallback((owner: number) => {
    sourceUpdateOwnerRef.current = owner;
    setUpdateStatus({ kind: 'source-pending', owner });
  }, []);
  const finishSourceUpdate = useCallback((owner: number) => {
    if (sourceUpdateOwnerRef.current !== owner) return;
    sourceUpdateOwnerRef.current = null;
    setUpdateStatus((current) => current.kind === 'source-pending' && current.owner === owner
      ? { kind: 'stable' }
      : current);
    clearStaleRefusal();
  }, [clearStaleRefusal]);
  const beginStructuralResolution = useCallback((owner: number) => {
    visualResolutionInFlightRef.current = owner;
    structuralLayoutPendingRef.current = owner;
    setUpdateStatus({ kind: 'structural-layout', owner });
  }, []);
  const finishStructuralResolution = useCallback((owner: number) => {
    if (visualResolutionInFlightRef.current === owner) visualResolutionInFlightRef.current = null;
    if (structuralLayoutPendingRef.current !== owner) return;
    structuralLayoutPendingRef.current = null;
    setUpdateStatus((current) => current.kind === 'structural-layout' && current.owner === owner
      ? { kind: 'stable' }
      : current);
    clearStaleRefusal();
  }, [clearStaleRefusal]);
  // The passive visual owner spans a canvas edit's print-back debounce and,
  // when the printed graph needs spatial resolution, that resolution phase.
  // It is retired by its own print-back, by Reflow/font publication of the
  // same revision, or by any newer claim that cancels the print-back.
  const beginPassiveVisual = useCallback((owner: number) => {
    pendingVisualSourceRevisionRef.current = owner;
    setPassiveVisualOwner(owner);
  }, []);
  const finishPassiveVisual = useCallback((owner: number) => {
    if (visualResolutionInFlightRef.current === owner && structuralLayoutPendingRef.current !== owner) {
      visualResolutionInFlightRef.current = null;
    }
    if (pendingVisualSourceRevisionRef.current !== owner) return;
    pendingVisualSourceRevisionRef.current = null;
    setPassiveVisualOwner((current) => current === owner ? null : current);
    clearStaleRefusal();
  }, [clearStaleRefusal]);
  const retirePassiveVisual = useCallback(() => {
    const owner = pendingVisualSourceRevisionRef.current;
    if (owner !== null) finishPassiveVisual(owner);
    // A print-back-cancelling claim also supersedes any passive resolution, so
    // its marker clears even when it names an older owner; only a structural
    // owner keeps its marker. A newer canvas claim never comes here: it relies
    // on invalidateEditIntent aborting the resolution, whose finally clears it.
    if (structuralLayoutPendingRef.current === null) visualResolutionInFlightRef.current = null;
  }, [finishPassiveVisual]);
  /** Passive ownership counts only while it still owns the pending publication. */
  const passiveVisualOwnsPublication = useCallback((owner: number | null) => {
    if (owner === null) return false;
    const publication = revisions.publicationEnvelope();
    return publication.status === 'pending' && publication.sourceRevision === owner;
  }, [revisions]);
  const updateRefusal = useCallback((intent: UpdateRefusalIntent): string | null => {
    if (isAuthored028Source(dslRef.current) &&
        (intent === 'edit' || intent === 'waypoint-drag' || intent === 'ai-request')) {
      return SOURCE_028_CANVAS_LOCK_MESSAGE;
    }
    const structural = structuralLayoutPendingRef.current !== null;
    const source = sourceUpdateOwnerRef.current !== null;
    if (!structural && !source) {
      const passive = passiveVisualOwnsPublication(pendingVisualSourceRevisionRef.current)
        || visualResolutionInFlightRef.current !== null;
      if (passive && intent === 'reflow') return UPDATE_REFUSAL_MESSAGES.reflow;
      // A drag restores its start publication on cancel, so it may begin only
      // from a current one, not a pending or blocked one (CR94-F4).
      if (intent === 'waypoint-drag' && (passive || revisions.publicationEnvelope().status !== 'current')) {
        return UPDATE_REFUSAL_MESSAGES.waypoint;
      }
      return null;
    }
    // Typing can supersede its own pending parse; canvas gestures cannot use
    // an older interpretation while that source owner is still active.
    if (intent === 'source-edit') return structural ? UPDATE_REFUSAL_MESSAGES.structural : null;
    if (intent === 'open' && !structural && sourceUpdateOwnerRef.current === openClaimedOwnerRef.current) return null;
    if (intent === 'reflow') return UPDATE_REFUSAL_MESSAGES.reflow;
    if (intent === 'open') return UPDATE_REFUSAL_MESSAGES.open;
    if (intent === 'ai-request') return UPDATE_REFUSAL_MESSAGES.aiRequest;
    return structural ? UPDATE_REFUSAL_MESSAGES.structural : UPDATE_REFUSAL_MESSAGES.source;
  }, [passiveVisualOwnsPublication, revisions]);
  /** Announce and return the refusal for `intent`, or null when it may proceed. */
  const refuseDuringUpdate = useCallback((intent: UpdateRefusalIntent): string | null => {
    const message = updateRefusal(intent);
    if (message !== null) setGuidanceAnnouncement(message);
    return message;
  }, [updateRefusal]);
  const acceptTextSource = useCallback(() => {
    setCanvasFocusRequest(null);
    textProjectionRef.current = null;
    isInternalDslUpdateRef.current = false;
    textOriginOwnerRef.current = null;
    if (syncTimeoutRef.current !== null) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = null;
    diagramSyncPendingRef.current = false;
    // Cancelling the print-back is the passive owner's supersession: nothing
    // else could retire it, so the newer claim retires it here.
    retirePassiveVisual();
  }, [retirePassiveVisual]);
  useEffect(() => () => {
    activeLayoutAbortRef.current?.abort();
    activeLayoutAbortRef.current = null;
    revisions.invalidateLayouts();
    // No render remains to observe the status on unmount; clear both owners
    // directly rather than scheduling a state update during cleanup.
    structuralLayoutPendingRef.current = null;
    visualResolutionInFlightRef.current = null;
    sourceUpdateOwnerRef.current = null;
    pendingVisualSourceRevisionRef.current = null;
  }, []);

  // Shared interruption point; waypoint ownership joins this in C20.3.
  const gestureEpochRef = useRef(0);
  const keyboardMoveRef = useRef<{ key: string; step: number; event: KeyboardEvent } | null>(null);
  const cancelGestureRef = useRef<() => void>(() => {});
  const cancelActiveGesture = useCallback(() => {
    gestureEpochRef.current += 1;
    cancelGestureRef.current();
    // Cancellation does not receive XYDrag's final event. Retire each hook
    // lock explicitly while preserving the actual keyboard modifier state.
    axisChangesRef.current(nodesRef.current.map((node) => ({
      type: 'position' as const, id: node.id, dragging: false,
    })));
  }, []);

  const handleNodeKeyboardMove = useCallback((key: string, shiftKey: boolean, event: KeyboardEvent) => {
    cancelActiveGesture();
    keyboardMoveRef.current = {
      key,
      step: shiftKey ? KEYBOARD_MOVE_FAST_STEP : KEYBOARD_MOVE_STEP,
      event,
    };
  }, [cancelActiveGesture]);

  const handleNodeKeyboardMoveEnd = useCallback((event: KeyboardEvent) => {
    if (keyboardMoveRef.current?.event === event) keyboardMoveRef.current = null;
  }, []);

  const invalidateEditIntent = useCallback((options?: { abortGeneration?: boolean }) => {
    activeLayoutAbortRef.current?.abort();
    activeLayoutAbortRef.current = null;
    verifiedEdgeRoutesRef.current = new Map();
    const revision = revisions.invalidateEdit(options);
    setLoading(false);
    setIsReflowing(false);
    return revision;
  }, [revisions]);
  const invalidateLlmIntent = useCallback((options?: { abortGeneration?: boolean }) => {
    return revisions.invalidateLlm(options);
  }, [revisions]);
  const claimSpatialEditPublication = useCallback(() => {
    if (dslType !== 'coral' || sourceErrorsLockedRef.current) return;
    // A user spatial claim is a later authored edit, not the text layout's own
    // node publication: it ends text-origin print-back suppression, or an edit
    // inside the settle window would leave its publication pending forever.
    // Before the text layout's node commit lands, its skip flag is still
    // armed; the edit batches into that commit, so the flag must not consume
    // this edit's print-back.
    if (textOriginOwnerRef.current !== null) skipNextDiagramSyncRef.current = false;
    textOriginOwnerRef.current = null;
    const publication = revisions.publicationEnvelope();
    if (publication.status === 'pending'
      && pendingVisualSourceRevisionRef.current === publication.sourceRevision
      && visualResolutionInFlightRef.current !== publication.sourceRevision) return;
    beginPassiveVisual(revisions.beginSource().sourceRevision);
  }, [beginPassiveVisual, dslType, revisions]);

  const onNodesChange = useCallback((changes: Parameters<typeof onNodesChangeConstrained>[0]) => {
    if (isAuthored028Source(dslRef.current) && changes.some((change) =>
      change.type === 'position' || change.type === 'add' || change.type === 'remove' ||
      change.type === 'replace' || (change.type === 'dimensions' && change.resizing === true))) {
      setGuidanceAnnouncement(SOURCE_028_CANVAS_LOCK_MESSAGE);
      return;
    }
    if (structuralLayoutPendingRef.current !== null
      && changes.some((change) => change.type !== 'select')) return;
    changes = changes.filter((change) => change.type !== 'position'
      || change.dragging === undefined || !rejectNodeDragRef.current || (keyboardMoveRef.current?.event.eventPhase ?? 0) !== 0);
    if (changes.some((change) => change.type === 'add' || change.type === 'remove' || change.type === 'replace')) {
      skipNextDiagramSyncRef.current = true;
    }
    for (const change of changes) {
      if (change.type !== 'position' || !change.position) continue;
      const current = nodesRef.current.find((node) => node.id === change.id);
      if (current && (current.position.x !== change.position.x || current.position.y !== change.position.y)) {
        pendingExactNodeIdsRef.current.add(change.id);
      }
    }
    if (changes.some((change) => change.type === 'position'
      || (change.type === 'dimensions' && change.resizing === true))) {
      invalidateEditIntent();
      claimSpatialEditPublication();
    }
    const keyboardMove = keyboardMoveRef.current;
    if (keyboardMove && keyboardMove.event.eventPhase !== 0) {
      // XYFlow's nodeLookup still contains any cancelled pointer preview in
      // this dispatch. Rebase only the nodes its keyboard handler selected.
      applyControlledChangesRef.current(changes.map((change) => {
        if (change.type !== 'position' || !change.position) return change;
        const node = nodesRef.current.find((candidate) => candidate.id === change.id);
        if (!node) return change;
        const { key, step } = keyboardMove;
        return { ...change, position: {
          x: node.position.x + (key === 'ArrowRight' ? step : key === 'ArrowLeft' ? -step : 0),
          y: node.position.y + (key === 'ArrowDown' ? step : key === 'ArrowUp' ? -step : 0),
        } };
      }));
    } else onNodesChangeConstrained(changes);
  }, [claimSpatialEditPublication, invalidateEditIntent, onNodesChangeConstrained]);

  const clearGeometryHistoryRef = useRef<() => void>(() => {});
  const clearEdgeWaypointsRef = useRef<(edgeId: string) => void>(() => {});
  const syncDiagramToTextRef = useRef<() => void>(() => {});
  const onEdgesChange = useCallback((changes: Parameters<typeof onEdgesChangeBase>[0]) => {
    if (isAuthored028Source(dslRef.current) && changes.some((change) => change.type !== 'select')) {
      setGuidanceAnnouncement(SOURCE_028_CANVAS_LOCK_MESSAGE);
      return;
    }
    if (structuralLayoutPendingRef.current !== null
      && changes.some((change) => change.type !== 'select')) return;
    if (changes.some((change) => change.type !== 'select')) {
      cancelActiveGesture();
      invalidateEditIntent();
      claimSpatialEditPublication();
    }
    const obsolete = changes.filter((change) => change.type === 'remove' || change.type === 'replace');
    if (obsolete.length > 0) {
      clearGeometryHistoryRef.current();
      clearDslHistory();
    }
    for (const change of obsolete) {
      if ('id' in change) clearEdgeWaypointsRef.current(change.id);
    }
    const decorated = changes.map((change) => {
      if (change.type !== 'add') return change;
      const edge = change.item;
      const fontEdge = convertEdges([{
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: typeof edge.label === 'string' ? edge.label : undefined,
        sourcePort: edge.sourceHandle ?? undefined,
        targetPort: edge.targetHandle ?? undefined,
      }], undefined, documentSettingsRef.current?.font)[0];
      return {
        ...change,
        item: {
          ...edge,
          labelStyle: fontEdge.labelStyle,
          data: { ...edge.data, ...fontEdge.data },
        },
      };
    });
    onEdgesChangeBase(decorated);
  }, [claimSpatialEditPublication, clearDslHistory, invalidateEditIntent, onEdgesChangeBase]);

  // Layout history for undo/redo
  const {
    undo,
    redo,
    canUndo,
    canRedo,
    undoCount,
    redoCount,
    undoSequence,
    redoSequence,
    clearHistory,
    discardRedo: discardGeometryRedo = () => undefined,
  } = useLayoutHistory();
  clearGeometryHistoryRef.current = clearHistory;

  // App receives synchronous committed maps through the existing manager API.
  const waypointMapRef = useRef(new Map<string, EdgeWaypoint[]>());
  const acceptedDisplayRef = useRef<{
    nodes: Node<SymbolNodeData>[];
    edges: Edge[];
    waypoints: Map<string, EdgeWaypoint[]>;
  } | null>(null);
  // Only routes produced or retained by an accepted layout transaction may
  // cross the export boundary. Canvas waypoint previews are intentionally
  // excluded from this owner.
  const receiveWaypoints = useCallback((next: Map<string, EdgeWaypoint[]>) => { waypointMapRef.current = next; }, []);
  const waypointManager = useWaypointManager({ nodes, edges, onChange: receiveWaypoints,
    getRoutingOptions: () => ({ notation,
      direction: (sourceGraphRef.current as SpatialSidecar028).layoutOptions028?.direction ??
        resolveNotationLayout(notation, documentSettingsRef.current.layout).settings.direction,
      sourceRouteEdgeIds: [...Object.keys((sourceGraphRef.current as SpatialSidecar028).routeIntents028 ?? {}),
        ...sourceGraphRef.current.edges.filter((edge) => edge.routeIntent !== undefined).map((edge) => edge.id)],
    }) });
  clearEdgeWaypointsRef.current = waypointManager.clearWaypoints;
  const captureCanonicalProjection = useCallback(() => {
    const flatten = (values: GraphIR['nodes'], parent?: string): GraphNode[] => values.flatMap((value) => {
      const { children, ...node } = value;
      return [{ ...node, label: node.label ?? node.id, ...(parent ? { parent } : {}) }, ...flatten(children ?? [], node.id)];
    });
    const waypoints = new Map([...waypointMapRef.current].map(([id, points]) => [id, points.map((point) => ({ ...point }))]));
    const currentNodes = preserveAuthoredNodePositions(flatten(convertFlowToGraphNodes(
      nodesRef.current as CoralNode[], lastParsedRef.current.nodes,
    )), sourceGraphRef.current, pendingExactNodeIdsRef.current);
    const portGraph: GraphIR = {
      ...sourceGraphRef.current,
      nodes: nestCanonicalNodes(currentNodes),
      edges: lastParsedRef.current.edges,
    };
    return {
      nodes: currentNodes,
      edges: convertCanonicalFlowEdges(
        edgesRef.current as CoralEdge[], lastParsedRef.current.edges, portGraph, notation,
      ).map((edge) => {
        const authored = sourceGraphRef.current.edges.find((candidate) => candidate.id === edge.id);
        return applyAuthoredWaypoints(
          authored?.routeIntent ? { ...edge, routeIntent: authored.routeIntent } : edge,
          waypoints.get(edge.id),
        );
      }),
      waypoints,
    };
  }, [notation]);
  const captureCurrentGraph = useCallback((): GraphIR => {
    // A sequence document's canonical graph is the authority; its hidden
    // generic projection never rebuilds nodes or edges (DR70-D7.1).
    if (isSequenceGraph(sourceGraphRef.current)) return structuredClone(sourceGraphRef.current);
    const projection = captureCanonicalProjection();
    return {
      ...sourceGraphRef.current,
      nodes: nestCanonicalNodes(projection.nodes),
      edges: projection.edges,
    };
  }, [captureCanonicalProjection]);
  const pushContentHistory = useCallback((
    graph: GraphIR,
    waypoints: Map<string, EdgeWaypoint[]>,
    snapshot?: Partial<Pick<DslHistoryEntry,
      'publication' | 'parsed' | 'displayNodes' | 'displayEdges'
      | 'parseErrors' | 'editorAnalysis' | 'debugInfo' | 'settings'>>,
  ) => {
    const sequence = ++transactionSequenceRef.current;
    dslUndoStack.current.push({
      sequence,
      dsl,
      dslType,
      graphIRPreviewSource: graphIRPreviewSourceRef.current === dslRef.current,
      sourceErrorsLocked: sourceErrorsLockedRef.current,
      graph: structuredClone(graph),
      waypoints: cloneWaypoints(waypoints),
      diagnostics: formatSwitchDiagnostics.map((diagnostic) => ({ ...diagnostic })),
      publication: snapshot?.publication ?? revisions.publicationEnvelope(),
      parsed: snapshot?.parsed ?? structuredClone(lastParsedRef.current),
      displayNodes: snapshot?.displayNodes ?? cloneDisplayNodes(nodesRef.current),
      displayEdges: snapshot?.displayEdges ?? cloneDisplayEdges(edgesRef.current),
      parseErrors: structuredClone(snapshot?.parseErrors ?? parseErrors),
      editorAnalysis: structuredClone(snapshot?.editorAnalysis ?? editorAnalysis),
      debugInfo: snapshot?.debugInfo ?? debugInfo,
      ...(snapshot?.settings ? { settings: structuredClone(snapshot.settings) } : {}),
    });
    dslRedoStack.current = [];
    discardGeometryRedo();
    setDslUndoCount(dslUndoStack.current.length);
    setDslRedoCount(0);
    return sequence;
  }, [debugInfo, discardGeometryRedo, dsl, dslType, editorAnalysis, formatSwitchDiagnostics,
    parseErrors, revisions]);
  type WaypointGestureState = {
    epoch: number; edgeId: string; waypointId: string;
    before: Map<string, EdgeWaypoint[]>; nodes: Node<SymbolNodeData>[];
    publication: PublicationEnvelope;
    verifiedRoutes: Map<string, ElkEdgeRouting>;
    claimedSourceRevision?: number;
  };
  const waypointGestureRef = useRef<WaypointGestureState | null>(null);
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const nodeGestureRef = useRef<{
    epoch: number;
    before: Node<SymbolNodeData>[] | null;
    waypoints: typeof waypointManager.waypointMap;
  } | null>(null);
  // Reject late XYDrag changes after cancellation until a new start boundary.
  const rejectNodeDragRef = useRef(false);
  const restoreWaypointGesture = useCallback((waypointGesture: WaypointGestureState) => {
    waypointManager.setWaypoints(waypointGesture.before);
    const currentPublication = revisions.publicationEnvelope();
    const stillOwnsPublication = waypointGesture.claimedSourceRevision !== undefined
      ? currentPublication.sourceRevision === waypointGesture.claimedSourceRevision
      : currentPublication.sourceRevision === waypointGesture.publication.sourceRevision
        && currentPublication.displayRevision === waypointGesture.publication.displayRevision
        && currentPublication.status === waypointGesture.publication.status;
    if (!stillOwnsPublication) return;
    verifiedEdgeRoutesRef.current = waypointGesture.verifiedRoutes;
    if (waypointGesture.claimedSourceRevision !== undefined) {
      revisions.restorePublication(waypointGesture.publication);
      // A gesture starts only from a current publication, so restoring it
      // leaves no passive owner; retire the one this drag claimed.
      finishPassiveVisual(waypointGesture.claimedSourceRevision);
    }
  }, [finishPassiveVisual, revisions, waypointManager]);
  cancelGestureRef.current = () => {
    const waypointGesture = waypointGestureRef.current;
    waypointGestureRef.current = null;
    if (waypointGesture) restoreWaypointGesture(waypointGesture);
    const gesture = nodeGestureRef.current;
    nodeGestureRef.current = null;
    rejectNodeDragRef.current = true;
    if (gesture?.before) {
      const positions = new Map(gesture.before.map((node) => [node.id, node.position]));
      const restored = nodesRef.current.map((node) => ({
        ...node, position: { ...(positions.get(node.id) ?? node.position) }, dragging: false,
      }));
      nodesRef.current = restored;
      setNodes(restored);
    }
  };
  const handleNodeDragStart = useCallback(() => {
    keyboardMoveRef.current = null;
    cancelActiveGesture();
    rejectNodeDragRef.current = false;
    nodeGestureRef.current = {
      epoch: gestureEpochRef.current,
      before: null,
      waypoints: new Map([...waypointMapRef.current].map(([id, points]) =>
        [id, points.map((point) => ({ ...point }))])),
    };
  }, [cancelActiveGesture, waypointManager.waypointMap]);
  applyControlledChangesRef.current = (changes) => {
    const accepted = changes.filter((change) => change.type !== 'position'
      || change.dragging === undefined || !rejectNodeDragRef.current || (keyboardMoveRef.current?.event.eventPhase ?? 0) !== 0);
    const gesture = nodeGestureRef.current;
    const dragChanges = accepted.filter((change) => change.type === 'position'
      && change.dragging !== undefined);
    if (gesture && dragChanges.length && !gesture.before) {
      gesture.before = nodesRef.current.map((node) => ({ ...node, position: { ...node.position } }));
    }
    const next = applyNodeChanges(accepted, nodesRef.current);
    nodesRef.current = next;
    displayOnlyNodesRef.current = accepted.every((change) => change.type === 'select'
      || (change.type === 'dimensions' && change.resizing !== true)) ? next : null;
    setNodes(next);
    if (gesture && gesture.epoch === gestureEpochRef.current
      && dragChanges.some((change) => change.type === 'position' && change.dragging === false)) {
      nodeGestureRef.current = null;
      rejectNodeDragRef.current = true;
      const before = gesture.before;
      if (before && before.some((node) => {
        const current = next.find((candidate) => candidate.id === node.id);
        return current && (node.position.x !== current.position.x || node.position.y !== current.position.y);
      })) {
        for (const node of before) {
          const current = next.find((candidate) => candidate.id === node.id);
          if (current && (node.position.x !== current.position.x || node.position.y !== current.position.y)) {
            pendingExactNodeIdsRef.current.add(node.id);
          }
        }
        pushContentHistory(structuredClone(sourceGraphRef.current), gesture.waypoints, {
          publication: revisions.publicationEnvelope(),
          parsed: structuredClone(lastParsedRef.current),
          displayNodes: cloneDisplayNodes(before),
          displayEdges: cloneDisplayEdges(edgesRef.current),
        });
        queueMicrotask(() => syncDiagramToTextRef.current());
      }
    }
  };
  useEffect(() => {
    window.addEventListener('blur', cancelActiveGesture);
    return () => window.removeEventListener('blur', cancelActiveGesture);
  }, [cancelActiveGesture]);

  const pendingRecoveryPositionsRef = useRef<Record<string, Position> | null>(null);
  const documentKeyRef = useRef(0);

  // Auto-recovery for session persistence (CORAL-REQ-016)
  const [recoveryState, recoveryActions] = useAutoRecovery({ warnOnExit: true });
  const { isSettled: recoverySettled, hasRecoveryData, recoveryData, isDirty, lastSaveTime } = recoveryState;
  const { applyRecovery, discardRecovery, markSaved, updateRecovery } = recoveryActions;

  // Startup guidance is presented once after recovery discovery. Applying or
  // discarding recovery must not present the original URL selection again.
  const startupGuidancePresentedRef = useRef(false);
  useEffect(() => {
    if (!recoverySettled || startupGuidancePresentedRef.current) return;
    startupGuidancePresentedRef.current = true;
    if (exampleLink || hasRecoveryData || localStorage.getItem(WELCOME_SEEN_KEY) !== 'true') {
      modalInvokerRef.current = document.activeElement as HTMLElement | null;
      setShowWelcome(true);
      setGuidanceAnnouncement(hasRecoveryData ? 'Recovery is available.' : 'Welcome to Coral.');
    }
  }, [exampleLink, hasRecoveryData, recoverySettled]);

  // Settings hook (CORAL-REQ-009)
  const [credentialPersistenceSnapshot] = useState(
    () => captureCredentialPersistenceSnapshot(),
  );
  const {
    userPreferences,
    documentSettings,
    fontDraft,
    selectedPreset,
    updateUserPreferences,
    updateDocumentSettings,
    updateFontDraft,
    applyLayoutPreset,
  } = useSettings({
    initialUserPreferences: credentialPersistenceSnapshot.initialPreferences,
    initialDocumentSettings: {
      notation,
      layout: {
        algorithm: 'layered',
        direction: 'DOWN',
        spacing: { nodeNode: DEFAULT_NODE_SPACING, layerSpacing: DEFAULT_LAYER_SPACING },
        elkOptions: { 'elk.edgeRouting': 'ORTHOGONAL' },
      },
      font: { default: { ...DEFAULT_DIAGRAM_FONT_SETTINGS.default } },
    },
    documentKey: documentKeyRef.current,
    onLayoutChange: () => {
      invalidateEditIntent();
      // Trigger reflow when layout settings change
      needsFullLayoutRef.current = true;
      setFormatSwitchPending(true);
    },
  });
  const documentSettingsRef = useRef(documentSettings);
  documentSettingsRef.current = documentSettings;
  const renderStyle0214: RenderStyle0214 = normalizeRenderStyle0214(
    documentSettings.renderStyle0214 ?? documentSettings.renderStyle028 ?? 'lowfi',
  );
  const renderStyle028: RenderStyle028 = baseRenderStyle028(renderStyle0214);
  const renderInputRevisionRef028 = useRef(0);
  const typedRenderInputsRef028 = useRef<string | null>(null);
  const renewTypedRenderInputsRef028 = useRef(() => {});
  const setRenderStyle028 = useCallback((style: RenderStyleInput0214) => {
    const canonical = normalizeRenderStyle0214(style);
    const current = normalizeRenderStyle0214(
      documentSettingsRef.current.renderStyle0214 ?? documentSettingsRef.current.renderStyle028 ?? 'lowfi',
    );
    if (current === canonical) return;
    const next = {
      ...documentSettingsRef.current,
      renderStyle028: baseRenderStyle028(canonical),
      renderStyle0214: canonical === 'anemone' ? ('anemone' as const) : undefined,
    };
    documentSettingsRef.current = next;
    // A pending layout measured for the previous visual font is stale even
    // when the authored source revision has not changed.
    renderInputRevisionRef028.current += 1;
    updateDocumentSettings(next);
    // Claim the renewal in the same action that changes the style, so no
    // render shows the new style without its update owner.
    renewTypedRenderInputsRef028.current();
  }, [updateDocumentSettings]);
  const editorEntityHighlightingRef = useRef(userPreferences.editorEntityHighlighting === true);
  editorEntityHighlightingRef.current = userPreferences.editorEntityHighlighting === true;
  const handleDocumentSettingsChange = useCallback((settings: typeof documentSettings) => {
    if (structuralLayoutPendingRef.current !== null) return;
    const previous = documentSettingsRef.current;
    if (settings.notation !== previous.notation &&
        !getAvailableNotations028().some((candidate) => candidate.id === settings.notation)) {
      setGuidanceAnnouncement(`Diagram type ${settings.notation} is unavailable in Coral 0.2.8.`);
      return;
    }
    if (settings.notation !== previous.notation && dslTypeRef.current === 'coral' &&
        isAuthored028Source(dslRef.current)) {
      // The source header, not an editor setting or a GraphIR print-back, owns
      // a 0.2.8 document's profile. Apply this through the source transaction.
      const otherSettings = { ...settings, notation: previous.notation };
      if (JSON.stringify(otherSettings) !== JSON.stringify(previous)) {
        setGuidanceAnnouncement('Change the diagram type separately from other settings in a Coral source document.');
        return;
      }
      const typeRange = parseInstalledDocument028(dslRef.current).header.diagramTypeRange;
      if (!typeRange) {
        setGuidanceAnnouncement('Fix the @diagram header before changing its diagram type.');
        return;
      }
      const text = dslRef.current;
      const preview = profileSwitchPreview028(text, previous.notation, settings.notation);
      if (preview && !window.confirm(preview)) {
        setGuidanceAnnouncement('Diagram type change canceled; Coral source is unchanged.');
        return;
      }
      sourceTextEditRef.current(text.slice(0, typeRange.start.offset) + settings.notation +
        text.slice(typeRange.end.offset));
      setGuidanceAnnouncement(`Changed the Coral diagram type to ${settings.notation}; review its symbol meanings.`);
      return;
    }
    // Over source with errors, settings still apply, but nothing prints a
    // graph over the unreadable text (R-064 AC-4, e2e C50).
    if (sourceErrorsLockedRef.current) {
      const notationChanged = settings.notation !== previous.notation;
      const headerRange = notationChanged && dslTypeRef.current === 'coral'
        ? findGraphNotationValueRange(dslRef.current) : undefined;
      if (headerRange) {
        // The header is the notation authority: edit only its value.
        const text = dslRef.current;
        sourceTextEditRef.current(
          text.slice(0, headerRange.start.offset) + JSON.stringify(settings.notation) + text.slice(headerRange.end.offset));
        return;
      }
      replacementNeedsConfirmationRef.current = true;
      if (JSON.stringify(settings) !== JSON.stringify(previous)) {
        pushContentHistory(captureCurrentGraph(), waypointMapRef.current, { settings: previous });
      }
      documentSettingsRef.current = settings;
      updateDocumentSettings(settings);
      if (notationChanged) setNotation(settings.notation as NotationType);
      return;
    }
    let sequenceGraph: GraphIR | undefined;
    if (settings.notation !== previous.notation) {
      const current = captureCurrentGraph();
      if (isSequenceGraph(current) && (current.interaction?.participants.length ?? 0) > 0) {
        setSequenceError('Leave UML sequence notation only after removing every participant; its interaction has no other notation.');
        return;
      }
      if (settings.notation === 'uml-sequence') {
        const entered = canEnterSequenceNotation(current);
        if (!entered.ok) {
          setSequenceError(entered.error);
          setGuidanceAnnouncement(entered.error);
          return;
        }
        sequenceGraph = entered.graph;
      }
      setSequenceError(null);
    }
    replacementNeedsConfirmationRef.current = true;
    if (JSON.stringify(settings) !== JSON.stringify(previous)) {
      sourceEditSessionRef.current = false;
      pushContentHistory(captureCurrentGraph(), waypointMapRef.current, { settings: previous });
    }
    documentSettingsRef.current = settings;
    updateDocumentSettings(settings);
    if (settings.notation !== previous.notation) {
      invalidateEditIntent();
      const nextNotation = settings.notation as NotationType;
      const leaving = captureCurrentGraph();
      // Only leaving uml-sequence retires the interaction; any other opaque
      // interaction stays attributable printer loss (CR70-10).
      if (isSequenceGraph(leaving)) delete leaving.interaction;
      const changedSymbols = flattenAuthoringNodes(leaving).filter((node) =>
        effectiveSymbolId(node, previous.notation) !== effectiveSymbolId(node, nextNotation));
      const retargeted = sequenceGraph ? undefined
        : dropUnresolvedEdgePorts(flattenAuthoringNodes(leaving) as GraphNode[], leaving.edges, nextNotation);
      const interpretationNotice = changedSymbols.length
        ? `Symbol interpretation changed for ${changedSymbols.length} ${changedSymbols.length === 1 ? 'node' : 'nodes'} in ${nextNotation} notation; review their meaning and appearance.`
        : undefined;
      const portNotice = retargeted?.dropped
        ? `Removed ${retargeted.dropped} connector port ${retargeted.dropped === 1 ? 'reference' : 'references'} that ${nextNotation} notation does not define.`
        : undefined;
      if (interpretationNotice || portNotice) {
        setGuidanceAnnouncement([interpretationNotice, portNotice].filter(Boolean).join(' '));
      }
      const nextGraph: GraphIR = sequenceGraph ?? {
        ...leaving,
        edges: retargeted!.edges,
        metadata: { ...sourceGraphRef.current.metadata, notation: nextNotation },
        profile: nextNotation === 'uml-class'
          ? { id: 'uml', kind: 'class', version: '1.0.0' }
          : undefined,
      };
      sourceGraphRef.current = nextGraph;
      setNotation(nextNotation);
      if (dslType === 'coral') {
        const graphIRPreview = graphIRPreviewSourceRef.current === dslRef.current;
        const printed = printCoralDSLWithDiagnostics(nextGraph);
        isInternalDslUpdateRef.current = true;
        if (graphIRPreview) graphIRPreviewSourceRef.current = printed.text;
        textProjectionRef.current = { text: printed.text, format: 'coral', notation: nextNotation };
        setDsl(printed.text);
        formatSwitchDiagnosticsRef.current = [
          ...(graphIRPreview ? [{
            severity: 'warning' as const, code: 'coral.graphir.interchange.preview',
            message: 'The text view is a preview; the GraphIR interchange document remains authoritative.',
          }] : []),
          ...printed.diagnostics.map(editorDiagnostic),
        ];
        setFormatSwitchDiagnostics(formatSwitchDiagnosticsRef.current);
        queueMicrotask(() => { isInternalDslUpdateRef.current = false; });
      }
      // Notation changes redraw symbols and apply only the notation-derived profile.
      needsFullLayoutRef.current = false;
      setFormatSwitchPending(true);
    } else if (settings.layout !== previous.layout) {
      invalidateEditIntent();
    }
  }, [captureCurrentGraph, dslType, invalidateEditIntent, pushContentHistory, updateDocumentSettings]);

  // Theme colors based on user preference
  const theme = useThemeColors(userPreferences.theme);
  const previousRenderTheme028 = useRef(theme);
  useEffect(() => {
    if (previousRenderTheme028.current === theme) return;
    previousRenderTheme028.current = theme;
    // Presentation changes invalidate pending scene/layout publications,
    // including failure results, at the same authored source revision.
    renderInputRevisionRef028.current += 1;
  }, [theme]);
  const edgeStyles = useMemo(() => getEdgeStyles(theme), [theme]);
  const [transcriptPreferences, setTranscriptPreferences] = useState<TranscriptPreferences>(
    () => readTranscriptPreferences(window.localStorage),
  );
  const transcriptArchiveRef = useRef<TranscriptArchive | null>(null);
  const [transcriptArchives, setTranscriptArchives] = useState<TranscriptArchive[]>([]);
  const [associatedTranscriptId, setAssociatedTranscriptId] = useState<string | null>(null);
  const transcriptStoreRef = useRef<ReturnType<typeof createIndexedDbTranscriptStore> | null>(null);
  const transcriptWriteRef = useRef(Promise.resolve());
  const transcriptWriteGenerationRef = useRef(0);
  const restoreConversationRef = useRef<(messages: Array<{ role: 'user' | 'assistant'; content: string }>) => void>(() => {});
  const clearConversationRef = useRef<() => void>(() => {});
  const refreshTranscriptArchives = useCallback(async () => {
    if (!globalThis.indexedDB) return;
    const store = transcriptStoreRef.current ??= createIndexedDbTranscriptStore();
    const live = await purgeExpiredTranscriptArchives(store, Date.now());
    setTranscriptArchives(live.sort((a, b) => b.updatedAt - a.updatedAt));
  }, []);
  useEffect(() => {
    if (!transcriptPreferences.enabled) return;
    void refreshTranscriptArchives().catch((error) => {
      setGuidanceAnnouncement(`Transcripts could not be opened: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [refreshTranscriptArchives, transcriptPreferences.enabled]);
  const updateTranscriptPreferences = useCallback((preferences: TranscriptPreferences) => {
    if (preferences.enabled !== transcriptPreferences.enabled
      || preferences.retentionDays !== transcriptPreferences.retentionDays) {
      transcriptWriteGenerationRef.current += 1;
    }
    const writeGeneration = transcriptWriteGenerationRef.current;
    setTranscriptPreferences(preferences);
    try {
      writeTranscriptPreferences(window.localStorage, preferences);
    } catch (error) {
      setGuidanceAnnouncement(`Transcript preference was not saved: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!preferences.enabled) {
      transcriptArchiveRef.current = null;
      setAssociatedTranscriptId(null);
      return;
    }
    if (preferences.retentionDays === transcriptPreferences.retentionDays || !globalThis.indexedDB) return;
    transcriptWriteRef.current = transcriptWriteRef.current.then(async () => {
      if (writeGeneration !== transcriptWriteGenerationRef.current) return;
      const store = transcriptStoreRef.current ??= createIndexedDbTranscriptStore();
      const records = await store.list();
      if (writeGeneration !== transcriptWriteGenerationRef.current) return;
      const live: TranscriptArchive[] = [];
      for (const record of records) {
        if (writeGeneration !== transcriptWriteGenerationRef.current) return;
        const result = recalculateTranscriptRetention(record, Date.now(), preferences.retentionDays);
        if (result.status === 'expired') {
          await store.delete(record.archiveId);
          if (writeGeneration !== transcriptWriteGenerationRef.current) return;
          if (transcriptArchiveRef.current?.archiveId === record.archiveId) {
            transcriptArchiveRef.current = null;
            setAssociatedTranscriptId(null);
          }
        } else {
          await store.put(result.archive, record.revision);
          if (writeGeneration !== transcriptWriteGenerationRef.current) return;
          live.push(result.archive);
          if (transcriptArchiveRef.current?.archiveId === record.archiveId) transcriptArchiveRef.current = result.archive;
        }
      }
      if (writeGeneration === transcriptWriteGenerationRef.current) {
        setTranscriptArchives(live.sort((a, b) => b.updatedAt - a.updatedAt));
      }
    }).catch((error) => {
      if (writeGeneration === transcriptWriteGenerationRef.current) {
        setGuidanceAnnouncement(`Transcript retention was not updated: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }, [transcriptPreferences.enabled, transcriptPreferences.retentionDays]);
  const archiveConversationMessage = useCallback((message: { role: 'user' | 'assistant'; content: string }) => {
    if (!transcriptPreferences.enabled || !globalThis.indexedDB) return;
    const writeGeneration = transcriptWriteGenerationRef.current;
    transcriptWriteRef.current = transcriptWriteRef.current.then(async () => {
      if (writeGeneration !== transcriptWriteGenerationRef.current) return;
      const store = transcriptStoreRef.current ??= createIndexedDbTranscriptStore();
      const now = Date.now();
      let previous = transcriptArchiveRef.current;
      if (previous) {
        const effectiveNow = Math.max(now, previous.lastObservedWallNow);
        if (previous.expiresAt !== null && previous.expiresAt <= effectiveNow) {
          const expiredId = previous.archiveId;
          await store.delete(expiredId);
          setTranscriptArchives((records) => records.filter((record) => record.archiveId !== expiredId));
          previous = null;
          transcriptArchiveRef.current = null;
          setAssociatedTranscriptId(null);
        } else {
          previous = { ...previous, lastObservedWallNow: effectiveNow };
        }
      }
      const archive = previous ?? createTranscriptArchive(
        globalThis.crypto?.randomUUID?.() ?? `archive-${now}`,
        now,
        transcriptPreferences.retentionDays,
      );
      const updated = updateTranscriptArchive(archive, archive.revision, {
        id: globalThis.crypto?.randomUUID?.() ?? `message-${now}-${archive.messages.length}`,
        ...message,
        createdAt: now,
      });
      await store.put(updated, previous ? archive.revision : null);
      if (writeGeneration !== transcriptWriteGenerationRef.current) {
        if (previous) await store.put({ ...previous, revision: updated.revision + 1 }, updated.revision);
        else await store.delete(updated.archiveId);
        return;
      }
      transcriptArchiveRef.current = updated;
      setAssociatedTranscriptId(updated.archiveId);
      setTranscriptArchives((records) => [updated, ...records.filter((record) => record.archiveId !== updated.archiveId)]);
    }).catch((error) => {
      if (writeGeneration === transcriptWriteGenerationRef.current) {
        setGuidanceAnnouncement(`Transcript was not saved: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }, [transcriptPreferences]);
  const clearTranscriptArchives = useCallback(() => {
    if (!window.confirm('Delete all saved AI transcripts from this device?')) return;
    if (!globalThis.indexedDB) return;
    transcriptWriteGenerationRef.current += 1;
    const writeGeneration = transcriptWriteGenerationRef.current;
    transcriptArchiveRef.current = null;
    setAssociatedTranscriptId(null);
    clearConversationRef.current();
    transcriptWriteRef.current = transcriptWriteRef.current.then(async () => {
      const store = transcriptStoreRef.current ??= createIndexedDbTranscriptStore();
      await store.clear();
      if (writeGeneration !== transcriptWriteGenerationRef.current) return;
      transcriptArchiveRef.current = null;
      setAssociatedTranscriptId(null);
      setTranscriptArchives([]);
    }).catch((error) => {
      setGuidanceAnnouncement(`Transcripts could not be deleted: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, []);
  const associateTranscriptArchive = useCallback((archiveId: string) => {
    transcriptWriteGenerationRef.current += 1;
    const writeGeneration = transcriptWriteGenerationRef.current;
    if (!archiveId || !transcriptPreferences.enabled || !globalThis.indexedDB) {
      transcriptArchiveRef.current = null;
      setAssociatedTranscriptId(null);
      clearConversationRef.current();
      return;
    }
    transcriptWriteRef.current = transcriptWriteRef.current.then(async () => {
      if (writeGeneration !== transcriptWriteGenerationRef.current) return;
      const store = transcriptStoreRef.current ??= createIndexedDbTranscriptStore();
      const record = await store.get(archiveId);
      if (writeGeneration !== transcriptWriteGenerationRef.current) return;
      if (!record) throw new Error('The selected transcript no longer exists');
      const opened = openTranscriptArchive(record, Date.now(), transcriptPreferences.retentionDays);
      if (opened.status === 'expired') {
        await store.delete(record.archiveId);
        throw new Error('The selected transcript expired and was deleted');
      }
      await store.put(opened.archive, record.revision);
      if (writeGeneration !== transcriptWriteGenerationRef.current) {
        await store.put({ ...record, revision: opened.archive.revision + 1 }, opened.archive.revision);
        return;
      }
      transcriptArchiveRef.current = opened.archive;
      setAssociatedTranscriptId(opened.archive.archiveId);
      restoreConversationRef.current(opened.archive.messages.map(({ role, content }) => ({ role, content })));
      await refreshTranscriptArchives();
    }).catch((error) => {
      if (writeGeneration === transcriptWriteGenerationRef.current) {
        transcriptArchiveRef.current = null;
        setAssociatedTranscriptId(null);
        setGuidanceAnnouncement(`Transcript was not associated: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }, [refreshTranscriptArchives, transcriptPreferences.enabled, transcriptPreferences.retentionDays]);
  const clearCurrentTranscript = useCallback(() => {
    transcriptWriteGenerationRef.current += 1;
    transcriptArchiveRef.current = null;
    setAssociatedTranscriptId(null);
    clearConversationRef.current();
  }, []);
  const deleteAssociatedTranscript = useCallback(() => {
    const id = associatedTranscriptId;
    if (!id || !globalThis.indexedDB || !window.confirm('Delete the associated AI transcript from this device?')) return;
    transcriptWriteGenerationRef.current += 1;
    const writeGeneration = transcriptWriteGenerationRef.current;
    transcriptArchiveRef.current = null;
    setAssociatedTranscriptId(null);
    clearConversationRef.current();
    transcriptWriteRef.current = transcriptWriteRef.current.then(async () => {
      const store = transcriptStoreRef.current ??= createIndexedDbTranscriptStore();
      await store.delete(id);
      if (writeGeneration !== transcriptWriteGenerationRef.current) return;
      transcriptArchiveRef.current = null;
      setAssociatedTranscriptId(null);
      setTranscriptArchives((records) => records.filter((record) => record.archiveId !== id));
    }).catch((error) => {
      setGuidanceAnnouncement(`Transcript could not be deleted: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [associatedTranscriptId]);

  const updateDiagramRef = useRef<(
    text: string,
    type: DSLType,
    currentNotation: NotationType,
    diagnostics?: EditorParseError[],
    canonicalInput?: ReturnType<typeof captureCanonicalProjection>,
    requestedStrategy?: LayoutStrategy,
    blockWith?: string,
  ) => Promise<string | undefined>>(async () => undefined);

  // LLM chat hook — single source of truth for conversation state
  const handleDslFromLlm = useCallback(async (
    generatedDsl: string,
    generatedFormat: 'coral' | 'mermaid',
    generatedGraph?: GraphIR,
    expectedRevision?: number,
    signal?: AbortSignal,
    operationKind: 'fix' | 'generation' = 'generation',
  ) => {
    // Stale or aborted work reports false before any owner refusal, as the
    // useLlmChat contract requires; only a current candidate is refused.
    if (signal?.aborted || (expectedRevision !== undefined && expectedRevision !== revisions.currentLlm())) return false;
    if (updateRefusal('edit') !== null) {
      return { applied: false, reason: 'layout-blocked', message: UPDATE_REFUSAL_MESSAGES.aiApply } satisfies DslRejection;
    }
    cancelActiveGesture();
    const currentProjection = captureCanonicalProjection();
    const currentGraph: GraphIR = {
      ...sourceGraphRef.current,
      nodes: nestCanonicalNodes(currentProjection.nodes),
      edges: currentProjection.edges,
    };
    const publicationBefore = revisions.publicationEnvelope();
    const historySnapshot = {
      publication: publicationBefore,
      parsed: structuredClone(lastParsedRef.current),
      displayNodes: cloneDisplayNodes(nodesRef.current),
      displayEdges: cloneDisplayEdges(edgesRef.current),
      parseErrors: structuredClone(parseErrors),
      editorAnalysis: structuredClone(editorAnalysis),
      debugInfo,
      sourceErrorsLocked: sourceErrorsLockedRef.current,
      recoveredGraph,
    };
    const sourceBefore = structuredClone(sourceGraphRef.current);
    const waypointsBefore = cloneWaypoints(currentProjection.waypoints);
    const diagnosticsBefore = formatSwitchDiagnostics.map((diagnostic) => ({ ...diagnostic }));
    const previousGraphBefore = structuredClone(previousGraphRef.current);
    const needsFullLayoutBefore = needsFullLayoutRef.current;
    const recoveryPositionsBefore = pendingRecoveryPositionsRef.current;
    let stagedSourceRevision: number | null = null;
    let stagedRestored = false;
    const restoreStagedPublication = () => {
      if (stagedRestored) return true;
      if (stagedSourceRevision !== null && revisions.currentSourceRevision() !== stagedSourceRevision) return false;
      stagedRestored = true;
      activeLayoutAbortRef.current?.abort();
      activeLayoutAbortRef.current = null;
      sourceGraphRef.current = structuredClone(sourceBefore);
      lastParsedRef.current = structuredClone(historySnapshot.parsed);
      const restoredNodes = cloneDisplayNodes(historySnapshot.displayNodes);
      const restoredEdges = cloneDisplayEdges(historySnapshot.displayEdges);
      nodesRef.current = restoredNodes;
      edgesRef.current = restoredEdges;
      verifiedEdgeRoutesRef.current = verifiedRoutesFromEdges(restoredEdges);
      skipNextDiagramSyncRef.current = true;
      setNodes(restoredNodes);
      setEdges(restoredEdges);
      waypointManager.setWaypoints(cloneWaypoints(waypointsBefore));
      formatSwitchDiagnosticsRef.current = diagnosticsBefore;
      setFormatSwitchDiagnostics(diagnosticsBefore);
      previousGraphRef.current = structuredClone(previousGraphBefore);
      needsFullLayoutRef.current = needsFullLayoutBefore;
      pendingRecoveryPositionsRef.current = recoveryPositionsBefore;
      revisions.restorePublication(publicationBefore);
      setParseErrors(structuredClone(historySnapshot.parseErrors));
      setEditorAnalysis(structuredClone(historySnapshot.editorAnalysis));
      setDebugInfo(historySnapshot.debugInfo);
      setSourceErrorsLocked(historySnapshot.sourceErrorsLocked);
      setRecoveredGraph(historySnapshot.recoveredGraph);
      setLoading(false);
      return true;
    };
    const parsedCandidate = generatedFormat === 'coral'
      ? parseCoralDSL(generatedDsl)
      : parseMermaidDSL(generatedDsl);
    const candidateErrors = parsedCandidate.errors.filter((error) => error.severity === undefined || error.severity === 'error');
    // An unsafe port reference is a source error of the candidate itself (R-063 AC-7).
    if (generatedFormat === 'coral' && !isSequenceGraph(parsedCandidate.envelope ?? {})) {
      candidateErrors.push(...portSafetyDiagnostics(parsedCandidate.nodes, parsedCandidate.edges, notation).filter(isBlocking));
    }
    if (candidateErrors.length) {
      return { applied: false, reason: 'source-errors',
        message: `the generated source has ${candidateErrors.length === 1 ? 'an error' : `${candidateErrors.length} errors`}: ${candidateErrors[0].message}` } satisfies DslRejection;
    }
    const canonical: GraphIR = generatedGraph ? structuredClone(generatedGraph) : {
      version: '3.0.0',
      id: sourceGraphRef.current.id,
      nodes: nestCanonicalNodes(parsedCandidate.nodes),
      edges: parsedCandidate.edges,
    };
    invalidateEditIntent({ abortGeneration: false });
    revisions.beginSource();
    const sourceRevision = revisions.currentSourceRevision();
    stagedSourceRevision = sourceRevision;
    const evidence = evaluateMaterialChange(currentGraph, canonical);
    const strategy = selectLayoutStrategy(
      evidence,
      currentGraph.nodes.length === 0 ? 'initial-generation' : 'ai-change',
    );
    needsFullLayoutRef.current = strategy === 'full';
    if (strategy === 'full') {
      previousGraphRef.current = { nodes: [], edges: [] };
      // A full-layout candidate is a new arrangement, not a repair of a
      // recovered draft, so the draft's positions do not apply (TR94-C6-F2).
      // A rejected candidate restores them.
      pendingRecoveryPositionsRef.current = null;
    }
    const cancelStagedLayout = () => {
      activeLayoutAbortRef.current?.abort();
      restoreStagedPublication();
    };
    signal?.addEventListener('abort', cancelStagedLayout, { once: true });
    let reconciledDsl: string | undefined;
    try {
      reconciledDsl = await updateDiagramRef.current(
        generatedDsl,
        generatedFormat,
        notation,
        [],
        projectCanonicalGraph(canonical),
        strategy,
      );
    } catch (error) {
      restoreStagedPublication();
      if (signal?.aborted) return false;
      return { applied: false, reason: 'layout-blocked',
        message: error instanceof Error ? error.message : String(error) } satisfies DslRejection;
    } finally {
      signal?.removeEventListener('abort', cancelStagedLayout);
    }
    if (signal?.aborted) {
      restoreStagedPublication();
      return false;
    }
    const publication = revisions.publicationEnvelope();
    if (publication.status !== 'current' || publication.displayRevision !== sourceRevision) {
      restoreStagedPublication();
      // Only a blocked publication of this candidate is its own failure;
      // anything else means the document moved on (stale).
      if (publication.status === 'blocked' && publication.sourceRevision === sourceRevision) {
        return { applied: false, reason: 'layout-blocked',
          message: publication.diagnostic ?? 'the diagram could not be laid out' } satisfies DslRejection;
      }
      return false;
    }
    replacementNeedsConfirmationRef.current = true;
    const transactionSequence = pushContentHistory(currentGraph, currentProjection.waypoints, historySnapshot);
    acceptTextSource();
    isInternalDslUpdateRef.current = true;
    const appliedDsl = reconciledDsl ?? generatedDsl;
    textProjectionRef.current = { text: appliedDsl, format: generatedFormat, notation };
    if (dslType !== generatedFormat) setDslType(generatedFormat);
    setDsl(appliedDsl);
    setActivityEntries((entries) => [...entries.slice(-99), {
      id: transactionSequence,
      transactionSequence,
      label: `${operationKind === 'fix' ? 'AI Fix' : 'AI diagram change'} (${strategy} layout)`,
      status: 'applied',
      at: Date.now(),
    }]);

    setTimeout(() => { isInternalDslUpdateRef.current = false; }, INTERNAL_TEXT_GUARD_MS);
    return true;
  }, [acceptTextSource, cancelActiveGesture, captureCanonicalProjection, debugInfo, dslType,
    editorAnalysis, invalidateEditIntent, notation, parseErrors, pushContentHistory, revisions,
    setEdges, setNodes, updateRefusal, waypointManager]);

  const handleCredentialPreferencesCommitted = useCallback((preferences: typeof userPreferences) => {
    updateUserPreferences({
      llmSaveApiKey: preferences.llmSaveApiKey,
      llmSavedApiKey: '',
    });
  }, [updateUserPreferences]);

  // The on-device model locks authored mutation while it works (R-066 AC-5, R-054 AC-1).
  const [onDeviceWorking, setOnDeviceWorking] = useState(false);
  const providerChat = useLlmChat({
    llmProvider: userPreferences.llmProvider,
    llmModel: userPreferences.llmModel,
    llmSaveApiKey: userPreferences.llmSaveApiKey,
    llmSavedApiKey: userPreferences.llmSavedApiKey,
    userPreferences,
    credentialPersistenceSnapshot,
    onCredentialPreferencesCommitted: handleCredentialPreferencesCommitted,
    llmMaxRetries: normalizeLlmMaxRetries(userPreferences.llmMaxRetries),
    onDslGenerated: handleDslFromLlm,
    onConversationMessage: archiveConversationMessage,
  });
  const llmChat = useMemo(() => ({ ...providerChat,
    isMutationPending: providerChat.isMutationPending || onDeviceWorking }), [onDeviceWorking, providerChat]);
  cancelLlmRef.current = llmChat.abortActive;
  restoreConversationRef.current = llmChat.restoreConversation;
  clearConversationRef.current = llmChat.clearChat;

  // Get available notations for UI
  const availableNotations = useMemo(() => getAvailableNotations028(), []);

  // Build node connection info for compatibility checking (CORAL-REQ-010)
  const nodeConnectionInfo = useMemo(
    () => buildNodeConnectionInfo(nodes, notation),
    [nodes, notation],
  );
  const liveCanonicalGraph = captureCurrentGraph();

  // Edge compatibility hook (CORAL-REQ-010)
  // Edition 0.2.9 documents refuse a connection beyond a resolved port limit; 0.2.8 keeps the warning.
  const portLimits029 = editionAdmitsUserSymbols029(lastParsedRef.current.coralVersion ?? '0.2.8')
    ? 'refuse' as const : undefined;
  const { getEdgeStatus, getEdgeValidation, checkConnection } = useEdgeCompatibility({
    notationId: notation,
    nodeInfo: nodeConnectionInfo,
    existingEdges: liveCanonicalGraph.edges,
    ...(portLimits029 ? { portLimits029 } : {}),
  });

  const publishStructuralGraph = useCallback((
    graph: GraphIR,
    waypoints: Map<string, EdgeWaypoint[]>,
    options: {
      announcement: string;
      focus?: { kind: 'node' | 'edge'; id: string };
      closeAuthoring?: boolean;
    },
  ): { ok: true } | { ok: false; error: string } => {
    // The GraphIR 3 canvas is only a display for saved-header Coral. No
    // structural caller may print that display back over authored source.
    if (dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current)) {
      const error = 'Delete or change this 0.2.8 structure in Coral source until a source-owned canvas transaction is available.';
      setGuidanceAnnouncement(error);
      return { ok: false, error };
    }
    const graphIRPreview = graphIRPreviewSourceRef.current === dslRef.current;
    // Every caller, including Pin/Release and connection gestures that discard
    // the result, gets the same announced owner refusal.
    const refusal = refuseDuringUpdate('edit');
    if (refusal !== null) return { ok: false, error: refusal };
    if (sourceErrorsLockedRef.current) return { ok: false, error: SOURCE_ERRORS_LOCK_MESSAGE };
    const canonical = structuredClone(graph);
    const authoritativeWaypoints = cloneWaypoints(waypoints);
    let text: string;
    let diagnostics: EditorParseError[];
    let projected: ReturnType<typeof projectCanonicalGraph>;
    let nextNodes: Node<SymbolNodeData>[];
    let nextEdges: Edge[];

    try {
      projected = projectCanonicalGraph(canonical);
      const currentSettings = documentSettingsRef.current;
      nextNodes = projectDiagramNodes(
        projected.nodes,
        notation,
        currentSettings.font,
        currentSettings.layout.sizingMode ?? 'adaptive',
        resolveNotationLayout(notation, currentSettings.layout).settings.direction,
      ).map((node) => ({
        ...node,
        selected: options.focus?.kind === 'node' && options.focus.id === node.id,
      }));
      nextEdges = projectEdgesForCanvas(canonical, notation, undefined, currentSettings.font)
        .map((edge) => ({
          ...edge,
          selected: options.focus?.kind === 'edge' && options.focus.id === edge.id,
        }));
      if (dslType === 'coral') {
        const converted = printCoralDSLWithDiagnostics(canonical);
        text = converted.text;
        diagnostics = [
          ...(graphIRPreview ? [{
            severity: 'warning' as const, code: 'coral.graphir.interchange.preview',
            message: 'The text view is a preview; the GraphIR interchange document remains authoritative.',
          }] : []),
          ...converted.diagnostics.map(editorDiagnostic),
        ];
      } else {
        const converted = convertToMermaidDslWithDiagnostics(canonical);
        text = converted.text;
        diagnostics = converted.diagnostics.map((message) => ({ severity: 'warning', message }));
      }
    } catch (error) {
      return {
        ok: false,
        error: `Could not create the requested structure: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // The projection succeeded, so the structural edit commits from here.
    replacementNeedsConfirmationRef.current = true;
    const beforeGraph = captureCurrentGraph();
    const beforeWaypoints = cloneWaypoints(waypointMapRef.current);
    pushContentHistory(beforeGraph, beforeWaypoints);
    acceptTextSource();
    cancelActiveGesture();
    invalidateEditIntent();

    sourceGraphRef.current = canonical;
    pendingGeneratedGraphRef.current = null;
    pendingGeneratedWaypointsRef.current = null;
    lastParsedRef.current = { nodes: projected.nodes, edges: projected.edges };
    previousGraphRef.current = {
      nodes: projected.nodes.map((node) => ({ id: node.id, type: node.type, label: node.label,
        ...(node.parent ? { parentId: node.parent } : {}) })),
      edges: projected.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    };
    needsFullLayoutRef.current = false;
    formatSwitchDiagnosticsRef.current = diagnostics;
    setFormatSwitchDiagnostics(diagnostics);
    waypointManager.setWaypoints(authoritativeWaypoints);
    const needsSpatialResolution = requiresSpatialResolution(canonical);
    if (!needsSpatialResolution) {
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      verifiedEdgeRoutesRef.current = verifiedRoutesFromEdges(nextEdges);
      acceptedDisplayRef.current = {
        nodes: cloneDisplayNodes(nextNodes),
        edges: cloneDisplayEdges(nextEdges),
        waypoints: cloneWaypoints(authoritativeWaypoints),
      };
      setNodes(nextNodes);
      setEdges(nextEdges);
    }

    isInternalDslUpdateRef.current = true;
    if (graphIRPreview) graphIRPreviewSourceRef.current = text;
    textProjectionRef.current = { text, format: dslType, notation };
    const parsed = editorEntityHighlightingRef.current
      ? (dslType === 'coral' ? parseCoralDSL(text) : parseMermaidDSL(text))
      : undefined;
    setEditorAnalysis({
      source: text,
      language: dslType,
      diagnostics: [],
      decorations: parsed ? analyzeEditorSource(text, dslType, parsed.nodes, parsed.edges) : [],
      entityHighlighting: editorEntityHighlightingRef.current,
    });
    setParseErrors([]);
    const sourcePublication = revisions.beginSource();
    if (!needsSpatialResolution) revisions.publishSource(sourcePublication.sourceRevision);
    setDsl(text);
    setDebugInfo(`Parsed: ${projected.nodes.length} nodes, ${projected.edges.length} edges (${notation} notation)`);
    setDebugInfo(options.announcement);
    if (options.focus) {
      setSelectedNodeId(options.focus.kind === 'node' ? options.focus.id : null);
      setCanvasFocusRequest({ ...options.focus, token: ++canvasFocusTokenRef.current });
    }
    if (options.closeAuthoring) setAuthoringSession(null);
    if (needsSpatialResolution) {
      needsFullLayoutRef.current = true;
      beginStructuralResolution(sourcePublication.sourceRevision);
      void updateDiagramRef.current(
        text,
        dslType,
        notation,
        diagnostics,
        { ...projected, waypoints: authoritativeWaypoints },
        'full',
      ).catch((error) => {
        revisions.blockSource(
          sourcePublication.sourceRevision,
          `Export blocked: ${error instanceof Error ? error.message : String(error)}`,
        );
      }).finally(() => finishStructuralResolution(sourcePublication.sourceRevision));
    }
    queueMicrotask(() => { isInternalDslUpdateRef.current = false; });
    return { ok: true };
  }, [acceptTextSource, beginStructuralResolution, cancelActiveGesture, captureCurrentGraph, clearHistory, dslType,
    finishStructuralResolution, invalidateEditIntent, notation, pushContentHistory, refuseDuringUpdate, revisions, setEdges,
    setNodes, waypointManager]);

  const handleToggleNodePin = useCallback((nodeId: string) => {
    if (dslType !== 'coral' || llmChat.isMutationPending) return;
    const graph = captureCurrentGraph();
    const current = flattenAuthoringNodes(graph).find((node) => node.id === nodeId);
    if (!current) return;
    // Pinning a layout-managed node captures its displayed coordinate, which
    // XYFlow already holds in the parent frame for a child (R-053 AC-2).
    const displayed = nodesRef.current.find((node) => node.id === nodeId)?.position;
    publishStructuralGraph({
      ...graph,
      nodes: updateCanonicalNode(graph.nodes, nodeId, (node) => ({
        ...node,
        ...(node.pinned !== true && !node.position && displayed ? { position: { x: displayed.x, y: displayed.y } } : {}),
        pinned: node.pinned !== true,
      })),
    }, waypointMapRef.current, {
      announcement: `${current.pinned === true ? 'Unpinned' : 'Pinned'} node ${current.label ?? current.id}.`,
      focus: { kind: 'node', id: nodeId },
    });
  }, [captureCurrentGraph, dslType, llmChat.isMutationPending, publishStructuralGraph]);

  const handleReleaseNodePosition = useCallback((nodeId: string) => {
    if (dslType !== 'coral' || llmChat.isMutationPending) return;
    const graph = captureCurrentGraph();
    const current = flattenAuthoringNodes(graph).find((node) => node.id === nodeId);
    if (!current?.position) return;
    const displayedPositions = new Map(nodesRef.current.map((node) => [node.id, { ...node.position }]));
    const result = publishStructuralGraph({
      ...graph,
      nodes: updateCanonicalNode(graph.nodes, nodeId, (node) => {
        const { position: _position, pinned: _pinned, ...released } = node;
        return released;
      }),
    }, waypointMapRef.current, {
      announcement: `Released the Exact position for node ${current.label ?? current.id}.`,
      focus: { kind: 'node', id: nodeId },
    });
    if (!result.ok) return;
    pendingExactNodeIdsRef.current.delete(nodeId);
    skipNextDiagramSyncRef.current = true;
    setNodes((projected) => {
      const retained = projected.map((node) => ({
        ...node,
        position: displayedPositions.get(node.id) ?? node.position,
      }));
      nodesRef.current = retained;
      return retained;
    });
  }, [captureCurrentGraph, dslType, llmChat.isMutationPending, publishStructuralGraph, setNodes]);

  const commitSourceNodeLabel = useCallback((nodeId: string, label: string): boolean => {
    if (dslTypeRef.current !== 'coral' || !isAuthored028Source(dslRef.current) ||
      llmChat.isMutationPending || refuseDuringUpdate('source-gesture') !== null) return false;
    if (sourceErrorsLockedRef.current || lastParsedRef.current.sourceText028 !== dslRef.current ||
      unparsedUserTextRef.current !== null) {
      setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
      return false;
    }
    try {
      const edited = editSourceOwnedNodeLabel028(dslRef.current, nodeId, label);
      if (edited !== dslRef.current) {
        replacementNeedsConfirmationRef.current = true;
        sourceTextEditRef.current(edited);
        sourceEditSessionRef.current = false;
      }
      setSequenceError(null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSequenceError(message);
      setGuidanceAnnouncement(message);
      return false;
    }
  }, [llmChat.isMutationPending, refuseDuringUpdate]);

  const commitSourceNodeKeyboardMove = useCallback((key: string, shiftKey: boolean,
    event: KeyboardEvent): boolean => {
    if (dslTypeRef.current !== 'coral' || !isAuthored028Source(dslRef.current)) return false;
    if (llmChat.isMutationPending || refuseDuringUpdate('source-gesture') !== null) return true;
    if (sourceErrorsLockedRef.current || lastParsedRef.current.sourceText028 !== dslRef.current ||
      unparsedUserTextRef.current !== null) {
      setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
      return true;
    }
    const focused = (event.target as Element).closest('.react-flow__node')?.getAttribute('data-id');
    const selected = nodesRef.current.filter((node) => node.selected).map((node) => node.id);
    const nodeIds = focused && selected.includes(focused) ? selected : focused ? [focused] : [];
    if (!nodeIds.length) return true;
    const step = shiftKey ? KEYBOARD_MOVE_FAST_STEP : KEYBOARD_MOVE_STEP;
    const delta = { x: key === 'ArrowRight' ? step : key === 'ArrowLeft' ? -step : 0,
      y: key === 'ArrowDown' ? step : key === 'ArrowUp' ? -step : 0 };
    try {
      const edited = editSourceOwnedNodePositions028(dslRef.current, nodeIds, delta,
        new Map(nodesRef.current.map((node) => [node.id, node.position])));
      if (edited !== dslRef.current) {
        replacementNeedsConfirmationRef.current = true;
        sourceTextEditRef.current(edited);
        sourceEditSessionRef.current = false;
      }
    } catch (error) {
      setGuidanceAnnouncement(error instanceof Error ? error.message : String(error));
    }
    return true;
  }, [llmChat.isMutationPending, refuseDuringUpdate]);

  const commitSourceNodePointerMove = useCallback((nodeIds: string[],
    delta: { x: number; y: number }) => {
    if (dslTypeRef.current !== 'coral' || !isAuthored028Source(dslRef.current) ||
      llmChat.isMutationPending || refuseDuringUpdate('source-gesture') !== null) return;
    if (sourceErrorsLockedRef.current || lastParsedRef.current.sourceText028 !== dslRef.current ||
      unparsedUserTextRef.current !== null) {
      setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
      return;
    }
    try {
      const edited = editSourceOwnedNodePositions028(dslRef.current, nodeIds, delta,
        new Map(nodesRef.current.map((node) => [node.id, node.position])));
      if (edited !== dslRef.current) {
        replacementNeedsConfirmationRef.current = true;
        sourceTextEditRef.current(edited);
        sourceEditSessionRef.current = false;
      }
    } catch (error) {
      setGuidanceAnnouncement(error instanceof Error ? error.message : String(error));
    }
  }, [llmChat.isMutationPending, refuseDuringUpdate]);

  const commitSourceEdgeLabel = useCallback((edgeId: string, label: string): boolean => {
    if (dslTypeRef.current !== 'coral' || !isAuthored028Source(dslRef.current) ||
      llmChat.isMutationPending || refuseDuringUpdate('source-gesture') !== null) return false;
    if (sourceErrorsLockedRef.current || lastParsedRef.current.sourceText028 !== dslRef.current) {
      setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
      return false;
    }
    try {
      const edited = editSourceOwnedEdgeLabel028(dslRef.current, edgeId, label);
      if (edited !== dslRef.current) {
        replacementNeedsConfirmationRef.current = true;
        sourceTextEditRef.current(edited);
        sourceEditSessionRef.current = false;
      }
      return true;
    } catch (error) {
      setGuidanceAnnouncement(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [llmChat.isMutationPending, refuseDuringUpdate]);

  /** One source-owned edit as one history entry; a refusal is announced (Slice 60 C5). */
  const commitSourceEdit029 = useCallback((edit: (source: string) => string): boolean => {
    if (dslTypeRef.current !== 'coral' || !isAuthored028Source(dslRef.current) ||
      llmChat.isMutationPending || refuseDuringUpdate('source-gesture') !== null) return false;
    if (sourceErrorsLockedRef.current || lastParsedRef.current.sourceText028 !== dslRef.current ||
      unparsedUserTextRef.current !== null) {
      setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
      return false;
    }
    try {
      const edited = edit(dslRef.current);
      if (edited === dslRef.current) return true;
      replacementNeedsConfirmationRef.current = true;
      const accepted = sourceTextEditRef.current(edited);
      sourceEditSessionRef.current = false;
      return accepted;
    } catch (error) {
      setGuidanceAnnouncement(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [llmChat.isMutationPending, refuseDuringUpdate]);

  const commitSourceEdgeLabelRemove = useCallback((edgeId: string): boolean => {
    if (dslTypeRef.current !== 'coral' || !isAuthored028Source(dslRef.current) ||
      llmChat.isMutationPending || refuseDuringUpdate('source-gesture') !== null) return false;
    if (sourceErrorsLockedRef.current || lastParsedRef.current.sourceText028 !== dslRef.current) {
      setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
      return false;
    }
    try {
      const edited = removeSourceOwnedEdgeLabel028(dslRef.current, edgeId);
      if (edited !== dslRef.current) {
        replacementNeedsConfirmationRef.current = true;
        sourceTextEditRef.current(edited);
        sourceEditSessionRef.current = false;
      }
      return true;
    } catch (error) {
      setGuidanceAnnouncement(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [llmChat.isMutationPending, refuseDuringUpdate]);

  const commitSourceMessageDelete = useCallback((edgeId: string): boolean => {
    if (dslTypeRef.current !== 'coral' || !isAuthored028Source(dslRef.current) ||
      llmChat.isMutationPending || refuseDuringUpdate('source-gesture') !== null) return false;
    if (sourceErrorsLockedRef.current || lastParsedRef.current.sourceText028 !== dslRef.current ||
      unparsedUserTextRef.current !== null) {
      setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
      return false;
    }
    try {
      const edited = deleteSourceOwnedEdges028(dslRef.current, [edgeId]);
      if (edited !== dslRef.current) {
        replacementNeedsConfirmationRef.current = true;
        sourceTextEditRef.current(edited);
        sourceEditSessionRef.current = false;
        setSequenceSelection(null);
        setGuidanceAnnouncement(`Deleted message ${edgeId} through its Coral source.`);
      }
      setSequenceError(null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSequenceError(message);
      setGuidanceAnnouncement(message);
      return false;
    }
  }, [llmChat.isMutationPending, refuseDuringUpdate]);

  const commitSourceParticipantDelete = useCallback((nodeId: string): boolean => {
    if (dslTypeRef.current !== 'coral' || !isAuthored028Source(dslRef.current) ||
      llmChat.isMutationPending || refuseDuringUpdate('source-gesture') !== null) return false;
    if (sourceErrorsLockedRef.current || lastParsedRef.current.sourceText028 !== dslRef.current ||
      unparsedUserTextRef.current !== null) {
      setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
      return false;
    }
    try {
      const edited = deleteSourceOwnedNodeWithConnections028(dslRef.current, nodeId);
      if (edited !== dslRef.current) {
        replacementNeedsConfirmationRef.current = true;
        sourceTextEditRef.current(edited);
        sourceEditSessionRef.current = false;
        setSequenceSelection(null);
        setGuidanceAnnouncement(`Deleted participant ${nodeId} and its messages through Coral source.`);
      }
      setSequenceError(null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSequenceError(message);
      setGuidanceAnnouncement(message);
      return false;
    }
  }, [llmChat.isMutationPending, refuseDuringUpdate]);

  /** One sequence edit: validate the candidate, then commit it as one transaction. */
  const commitSequenceOperation = useCallback((operation: SequenceOperation): SequenceOperationResult => {
    const refuse = (error: string): SequenceOperationResult => {
      setSequenceError(error);
      setGuidanceAnnouncement(error);
      return { ok: false, error };
    };
    if (llmChat.isMutationPending) return refuse(AI_MUTATION_LOCK_MESSAGE);
    if (dslTypeRef.current !== 'coral') return refuse('Switch the source to Coral to edit a sequence diagram.');
    if (isAuthored028Source(dslRef.current)) return refuse(SOURCE_028_CANVAS_LOCK_MESSAGE);
    const result = applySequenceOperation(captureCurrentGraph(), operation);
    if (!result.ok) return refuse(result.error);
    // publishStructuralGraph marks the work changed only once it commits.
    const published = publishStructuralGraph(result.graph, new Map(), {
      announcement: `Applied ${operation.type.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}.`,
    });
    if (!published.ok) return refuse(published.error);
    setSequenceError(null);
    if (result.focus) setSequenceSelection(result.focus);
    else setSequenceSelection(null);
    return result;
  }, [captureCurrentGraph, llmChat.isMutationPending, publishStructuralGraph]);

  const submitAuthoringNode = useCallback((input: CreateAuthoringNodeInput | SourceOwnedNodeDraft028) => {
    const sourceOwnedDialog = authoringSession?.sourceText028 !== undefined;
    const sourceOwnedNow = dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current);
    if (sourceOwnedDialog || sourceOwnedNow || 'id' in input) {
      if (!sourceOwnedDialog || !sourceOwnedNow || !('id' in input)) return { ok: false as const,
        error: 'The Coral source changed while this node dialog was open. Reopen it for the current source.' };
      if (authoringSession.sourceText028 !== dslRef.current) return { ok: false as const,
        error: 'The Coral source changed while this node dialog was open. Reopen it for the current source.' };
      const refusal = refuseDuringUpdate('source-gesture');
      if (refusal) return { ok: false as const, error: refusal };
      if (lastParsedRef.current.sourceText028 !== dslRef.current ||
        sourceErrorsLockedRef.current || unparsedUserTextRef.current !== null ||
        !lastParsedRef.current.sourceMeaning028) return { ok: false as const,
          error: 'The Coral source changed while this node dialog was open. Reopen it for the current source.' };
      try {
        const edited = appendSourceOwnedNode028(dslRef.current, input);
        replacementNeedsConfirmationRef.current = true;
        const beforeRevision = revisions.currentSourceRevision();
        sourceTextEditRef.current(edited);
        if (revisions.currentSourceRevision() !== beforeRevision) {
          pendingSourceFocusRef.current = {
            sourceRevision: revisions.currentSourceRevision(), text: edited, kind: 'node',
            id: input.parentId ? `${input.parentId}.${input.id}` : input.id,
          };
        }
        sourceEditSessionRef.current = false;
        setAuthoringSession(null);
        setGuidanceAnnouncement(`Created node ${input.id}.`);
        return { ok: true as const };
      } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (notation === 'uml-sequence') {
      const result = commitSequenceOperation({
        type: 'addParticipant', kind: input.symbolId === 'uml-actor' ? 'actor' : 'participant', label: input.label,
      });
      if (result.ok) setAuthoringSession(null);
      return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
    }
    const created = createAuthoringNode(captureCurrentGraph(), notation, input);
    if (!created.ok) return created;
    return publishStructuralGraph(created.graph, waypointMapRef.current, {
      announcement: `Created node ${input.label.trim()}.`,
      focus: { kind: 'node', id: created.id },
      closeAuthoring: true,
    });
  }, [authoringSession, captureCurrentGraph, commitSequenceOperation, notation, publishStructuralGraph, refuseDuringUpdate]);

  const evaluateAuthoringEdge = useCallback((input: CreateAuthoringEdgeInput) => {
    return createAuthoringEdge(captureCurrentGraph(), notation, input, checkConnection);
  }, [captureCurrentGraph, checkConnection, notation]);

  const submitAuthoringEdge = useCallback((input: CreateAuthoringEdgeInput) => {
    const sourceOwnedDialog = authoringSession?.sourceText028 !== undefined;
    const sourceOwnedNow = dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current);
    if (sourceOwnedDialog || sourceOwnedNow) {
      if (!sourceOwnedDialog || !sourceOwnedNow) return { ok: false as const,
        error: 'The Coral source changed while this edge dialog was open. Reopen it for the current source.' };
      if (authoringSession.sourceText028 !== dslRef.current) return { ok: false as const,
        error: 'The Coral source changed while this edge dialog was open. Reopen it for the current source.' };
      const refusal = refuseDuringUpdate('source-gesture');
      if (refusal) return { ok: false as const, error: refusal };
      const meaning = lastParsedRef.current.sourceMeaning028;
      const interpretations = lastParsedRef.current.semanticInterpretations;
      if (lastParsedRef.current.sourceText028 !== dslRef.current ||
        sourceErrorsLockedRef.current || unparsedUserTextRef.current !== null ||
        !meaning || !interpretations || !canAppendSourceOwnedEdge028(meaning)) return {
        ok: false as const,
        error: 'The Coral source changed while this edge dialog was open. Reopen it for the current source.',
      };
      try {
        const connection = { sourceId: input.sourceId, targetId: input.targetId,
          sourceHandle: input.sourcePortId, targetHandle: input.targetPortId,
          ...(authoringSession.afterMessageId !== undefined
            ? { afterMessageId: authoringSession.afterMessageId } : {}),
          ...(input.id !== undefined ? { id: input.id } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.label !== undefined ? { label: input.label } : {}),
        };
        resolveSourceOwnedEdgePorts028(meaning, interpretations, connection);
        const edited = appendSourceOwnedEdge028(dslRef.current, connection);
        // The parser owns generated IDs. This action appends a spatial edge;
        // sequence insertion keeps the timeline's separate selection path.
        const edgeId = !meaning.interaction
          ? input.id ?? parseInstalledDocument028(edited).graph?.edges[meaning.edges.length]?.id : undefined;
        replacementNeedsConfirmationRef.current = true;
        const beforeRevision = revisions.currentSourceRevision();
        sourceTextEditRef.current(edited);
        if (edgeId && revisions.currentSourceRevision() !== beforeRevision) {
          pendingSourceFocusRef.current = { sourceRevision: revisions.currentSourceRevision(),
            text: edited, kind: 'edge', id: edgeId };
        }
        sourceEditSessionRef.current = false;
        setAuthoringSession(null);
        setGuidanceAnnouncement(`Created connection from ${input.sourceId} to ${input.targetId}.`);
        return { ok: true as const };
      } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (input.id !== undefined || input.type !== undefined) return { ok: false as const,
      error: 'Named and typed edges require saved-header Coral source.' };
    const created = evaluateAuthoringEdge(input);
    if (!created.ok) return created;
    return publishStructuralGraph(created.graph, waypointMapRef.current, {
      announcement: `Created connection from ${input.sourceId} to ${input.targetId}.`,
      focus: { kind: 'edge', id: created.id },
      closeAuthoring: true,
    });
  }, [authoringSession, evaluateAuthoringEdge, publishStructuralGraph, refuseDuringUpdate]);

  const handleDeleteSelection = useCallback(() => {
    const selectedNodeIds = nodesRef.current.filter((node) => node.selected).map((node) => node.id);
    const selectedEdgeIds = edgesRef.current.filter((edge) => edge.selected).map((edge) => edge.id);
    if (dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current)) {
      if (!selectedNodeIds.length && !selectedEdgeIds.length) return;
      if (llmChat.isMutationPending) {
        setGuidanceAnnouncement(AI_MUTATION_LOCK_MESSAGE);
        return;
      }
      const refusal = refuseDuringUpdate('source-gesture');
      if (refusal !== null) return;
      if (sourceErrorsLockedRef.current || lastParsedRef.current.sourceText028 !== dslRef.current ||
        unparsedUserTextRef.current !== null || !lastParsedRef.current.sourceMeaning028) {
        setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
        return;
      }
      try {
        const edited = deleteSourceOwnedSelection028(dslRef.current,
          selectedNodeIds, selectedEdgeIds);
        if (edited !== dslRef.current) {
          replacementNeedsConfirmationRef.current = true;
          sourceTextEditRef.current(edited);
          sourceEditSessionRef.current = false;
          setGuidanceAnnouncement(selectedNodeIds.length
            ? `Deleted ${selectedNodeIds.length} source-owned node${selectedNodeIds.length === 1 ? '' : 's'} and their connections.`
            : `Deleted ${selectedEdgeIds.length} source-owned connection${selectedEdgeIds.length === 1 ? '' : 's'}.`);
        }
      } catch (error) {
        setGuidanceAnnouncement(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    const current = captureCurrentGraph();
    const deleted = deleteAuthoringSelection(
      current,
      waypointMapRef.current,
      selectedNodeIds,
      selectedEdgeIds,
    );
    if (!deleted.changed) return;
    const removedNodes = flattenAuthoringNodes(current).length - flattenAuthoringNodes(deleted.graph).length;
    const removedEdges = current.edges.length - deleted.graph.edges.length;
    publishStructuralGraph(deleted.graph, deleted.waypoints, {
      announcement: `Deleted ${removedNodes} node${removedNodes === 1 ? '' : 's'} and ${removedEdges} connection${removedEdges === 1 ? '' : 's'}.`,
    });
  }, [captureCurrentGraph, llmChat.isMutationPending, publishStructuralGraph, refuseDuringUpdate]);

  // Compute diagnostic entries from edge compatibility
  const diagnosticEntries = useMemo<DiagnosticEntry[]>(() => {
    const entries: DiagnosticEntry[] = formatSwitchDiagnostics.map((diagnostic, index) => ({
      ...diagnostic,
      edgeId: `format-conversion-${index}`,
      severity: diagnostic.severity ?? 'warning',
      sourceLabel: 'Source format',
      targetLabel: 'Target format',
      message: diagnostic.message,
    }));
    // Saved-header source has its own explicit conformance report. The old
    // GraphIR 3 compatibility rules are neither U1 port authority nor an
    // ordinary-edit gate at any saved conformance level.
    if (dslType === 'coral' && isAuthored028Source(dsl)) return entries;
    for (const edge of edges) {
      const status = getEdgeStatus(edge.id);
      const validation = getEdgeValidation(edge.id);
      if (status === 'incompatible' || status === 'warning') {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);
        entries.push({
          edgeId: edge.id,
          severity: status === 'incompatible' ? 'error' : 'warning',
          sourceLabel: sourceNode?.data.label || edge.source,
          targetLabel: targetNode?.data.label || edge.target,
          message: validation?.message || `Edge is ${status}`,
        });
      }
    }
    return entries;
  }, [edges, nodes, getEdgeStatus, getEdgeValidation, formatSwitchDiagnostics, dslType, dsl]);

  // Waypoint operations and their immutable before/current transaction pairs.
  // Their shared refusal announces the update owner first, then refuses
  // silently under the AI lock, then announces the source-error lock. This
  // differs from visualLocked, which checks the AI lock first, so the order is
  // kept rather than unified with it.
  const waypointMutationRefused = useCallback(() => {
    if (refuseDuringUpdate('edit') !== null) return true;
    if (llmChat.isMutationPending) return true;
    if (!sourceErrorsLockedRef.current) return false;
    setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
    return true;
  }, [llmChat.isMutationPending, refuseDuringUpdate]);
  const handleWaypointAdd = useCallback((edgeId: string, position: Position) => {
    if (waypointMutationRefused()) return;
    cancelActiveGesture();
    if (!edgesRef.current.some((edge) => edge.id === edgeId)) return;
    pushContentHistory(captureCurrentGraph(), waypointMapRef.current);
    invalidateEditIntent();
    claimSpatialEditPublication();
    replacementNeedsConfirmationRef.current = true;
    waypointManager.addWaypoint(edgeId, position);
    queueMicrotask(() => syncDiagramToTextRef.current());
  }, [cancelActiveGesture, captureCurrentGraph, claimSpatialEditPublication, invalidateEditIntent, pushContentHistory,
    waypointManager, waypointMutationRefused]);

  const handleWaypointRemove = useCallback((edgeId: string, waypointId: string) => {
    if (waypointMutationRefused()) return;
    cancelActiveGesture();
    if (!waypointMapRef.current.get(edgeId)?.some((point) => point.id === waypointId)) return;
    pushContentHistory(captureCurrentGraph(), waypointMapRef.current);
    invalidateEditIntent();
    claimSpatialEditPublication();
    replacementNeedsConfirmationRef.current = true;
    waypointManager.removeWaypoint(edgeId, waypointId);
    queueMicrotask(() => syncDiagramToTextRef.current());
  }, [cancelActiveGesture, captureCurrentGraph, claimSpatialEditPublication, invalidateEditIntent, pushContentHistory,
    waypointManager, waypointMutationRefused]);

  const handleWaypointDragStart = useCallback((edgeId: string, waypointId: string) => {
    if (waypointMutationRefused()) return;
    // A gesture restores its start publication on cancel, so it may begin only
    // from a current one: a passive print-back, its resolution, or a pending or
    // blocked publication refuses here.
    if (refuseDuringUpdate('waypoint-drag') !== null) return;
    cancelActiveGesture();
    if (!edgesRef.current.some((edge) => edge.id === edgeId)
      || !waypointMapRef.current.get(edgeId)?.some((point) => point.id === waypointId)) return;
    const epoch = gestureEpochRef.current;
    waypointGestureRef.current = { epoch, edgeId, waypointId,
      before: new Map([...waypointMapRef.current].map(([id, points]) => [id, points.map((point) => ({ ...point }))])),
      nodes: nodesRef.current.map((node) => ({ ...node, position: { ...node.position } })),
      publication: revisions.publicationEnvelope(),
      verifiedRoutes: new Map([...verifiedEdgeRoutesRef.current]
        .map(([id, route]) => [id, structuredClone(route)])),
    };
    return epoch;
  }, [cancelActiveGesture, refuseDuringUpdate, revisions, waypointMutationRefused]);
  const currentWaypointGesture = useCallback((edgeId: string, waypointId: string, epoch?: number) => {
    const gesture = waypointGestureRef.current;
    return gesture && epoch !== undefined && gesture.epoch === epoch && gestureEpochRef.current === epoch
      && gesture.edgeId === edgeId && gesture.waypointId === waypointId ? gesture : null;
  }, []);
  const handleWaypointDrag = useCallback((edgeId: string, waypointId: string, position: Position, epoch?: number) => {
    if (waypointMutationRefused()) return;
    const gesture = currentWaypointGesture(edgeId, waypointId, epoch);
    if (!gesture) return;
    const current = waypointMapRef.current.get(edgeId)?.find((point) => point.id === waypointId);
    if (!current || (current.x === position.x && current.y === position.y)) return;
    invalidateEditIntent();
    claimSpatialEditPublication();
    const publication = revisions.publicationEnvelope();
    if (publication.sourceRevision !== gesture.publication.sourceRevision) {
      gesture.claimedSourceRevision = publication.sourceRevision;
    }
    waypointManager.moveWaypoint(edgeId, waypointId, position);
  }, [claimSpatialEditPublication, currentWaypointGesture, invalidateEditIntent, revisions, waypointManager,
    waypointMutationRefused]);
  const handleWaypointDragEnd = useCallback((edgeId: string, waypointId: string, position: Position, epoch?: number) => {
    const gesture = currentWaypointGesture(edgeId, waypointId, epoch);
    if (!gesture) return;
    handleWaypointDrag(edgeId, waypointId, position, epoch);
    waypointGestureRef.current = null;
    const before = gesture.before.get(edgeId)?.find((point) => point.id === waypointId);
    const after = waypointMapRef.current.get(edgeId)?.find((point) => point.id === waypointId);
    if (before && after && (before.x !== after.x || before.y !== after.y)) {
      replacementNeedsConfirmationRef.current = true;
      pushContentHistory(structuredClone(sourceGraphRef.current), gesture.before, {
        // Undo restores the accepted pre-gesture display, so retain the
        // matching accepted publication rather than the drag's pending one.
        publication: gesture.publication,
        parsed: structuredClone(lastParsedRef.current),
        displayNodes: cloneDisplayNodes(gesture.nodes),
        displayEdges: cloneDisplayEdges(edgesRef.current),
      });
      queueMicrotask(() => syncDiagramToTextRef.current());
    } else restoreWaypointGesture(gesture);
  }, [currentWaypointGesture, handleWaypointDrag, pushContentHistory, restoreWaypointGesture, revisions]);
  const handleWaypointDragCancel = useCallback((edgeId: string, waypointId: string, epoch?: number) => {
    if (currentWaypointGesture(edgeId, waypointId, epoch)) cancelActiveGesture();
  }, [currentWaypointGesture, cancelActiveGesture]);

  // A failed current waypoint route is an explicit scene error. Keep the
  // styling pass safe so the existing canvas failure presentation can explain
  // the conflict; currentRenderOptions also refuses that route for export.
  const waypointRouting = useMemo(() => {
    try { return { paths: waypointManager.getRoutedPaths(), error: undefined }; }
    catch (error) { return { paths: new Map(), error: error instanceof Error ? error.message : String(error) }; }
  }, [nodes, edges, waypointManager]);

  // Apply compatibility styling and waypoint data to edges
  const styledEdges = useMemo(() => {
    const routedPaths = waypointRouting.paths;
    const sourceOwned = dslType === 'coral' && isAuthored028Source(dsl);

    return edges.map((edge) => {
      const status = sourceOwned ? undefined : getEdgeStatus(edge.id);
      const validation = sourceOwned ? undefined : getEdgeValidation(edge.id);

      // Endpoint labels, so the edge can name its connection for a screen
      // reader rather than being an unlabelled path (R-014).
      const sourceLabel = nodes.find((n) => n.id === edge.source)?.data.label ?? edge.source;
      const targetLabel = nodes.find((n) => n.id === edge.target)?.data.label ?? edge.target;

      // Waypoint data for this edge (CORAL-REQ-015)
      const waypoints = waypointManager.waypointMap.get(edge.id);
      const waypointRoutedPath = routedPaths.get(edge.id);
      const waypointData = {
        renderStyle028,
        renderTheme028: theme === lightTheme ? 'light' as const : 'dark' as const,
        renderFont028: resolveDiagramFont(
          editorVisualFonts028(documentSettings.font, renderStyle028),
        ),
        sourceLabel,
        targetLabel,
        waypoints,
        onWaypointAdd: sourceOwned ? undefined : handleWaypointAdd,
        requiresWaypointDragEpoch: true,
        onWaypointRemove: handleWaypointRemove,
        onWaypointDrag: handleWaypointDrag,
        onWaypointDragStart: handleWaypointDragStart,
        onWaypointDragEnd: handleWaypointDragEnd,
        onWaypointDragCancel: handleWaypointDragCancel,
        waypointGestureEpoch: gestureEpochRef.current,
        ...(waypointRoutedPath ? { routedPath: waypointRoutedPath } : {}),
      };

      // If this edge is highlighted from the diagnostics panel, force compatibility rendering
      if (edge.id === highlightedEdgeId && (status === 'incompatible' || status === 'warning')) {
        return {
          ...edge,
          type: 'compatibility',
          data: {
            ...edge.data,
            ...waypointData,
            compatibilityStatus: status,
            validation,
            label: edge.label,
            forceShowTooltip: true,
          },
        };
      }

      // Show incompatible edges unless suppressed
      if (status === 'incompatible' && !documentSettings.suppressErrorAnnotations) {
        return {
          ...edge,
          type: 'compatibility',
          data: {
            ...edge.data,
            ...waypointData,
            compatibilityStatus: status,
            validation,
            label: edge.label,
          },
        };
      }

      // Show warning edges unless suppressed
      if (status === 'warning' && !documentSettings.suppressWarningAnnotations) {
        return {
          ...edge,
          type: 'compatibility',
          data: {
            ...edge.data,
            ...waypointData,
            compatibilityStatus: status,
            validation,
            label: edge.label,
          },
        };
      }

      // Compatible or suppressed edges — still inject waypoint data
      return {
        ...edge,
        type: 'compatibility',
        data: {
          ...edge.data,
          ...waypointData,
        },
      };
    });
  }, [edges, getEdgeStatus, getEdgeValidation, highlightedEdgeId, documentSettings.font, documentSettings.suppressErrorAnnotations, documentSettings.suppressWarningAnnotations, waypointManager.waypointMap, waypointManager, handleWaypointAdd, handleWaypointRemove, handleWaypointDrag, handleWaypointDragStart, handleWaypointDragEnd, handleWaypointDragCancel, dslType, dsl, renderStyle028, theme]);

  // Handle diagnostics panel hover
  const handleDiagnosticHover = useCallback((edgeId: string | null) => {
    setHighlightedEdgeId(edgeId);
  }, []);

  // Get selected node for properties panel
  // The Inspector reads authored geometry from the authoritative graph, which a
  // visual edit republishes with the source text (R-053 AC-2, S93-WI-03).
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node) return null;
    const authored = flattenAuthoringNodes(sourceGraphRef.current).find((candidate) => candidate.id === node.id);
    if (!authored) return node;
    return { ...node, data: {
      ...node.data,
      authoredPosition: authored.position ? { x: authored.position.x, y: authored.position.y } : undefined,
      pinned: authored.pinned === true,
    } };
  // `dsl` marks each republication of the authoritative graph held in a ref.
  }, [nodes, selectedNodeId, dsl]);
  const selectedEdge = selectedEdgeId ? edges.find((edge) => edge.id === selectedEdgeId) ?? null : null;


  // Sync diagram changes to DSL text (diagram → text direction)
  /** The graph a diagram-to-text print-back would print now, without side effects. */
  // The print-back reads the accepted source graph, the last parse, and the
  // exact-position set. A deferred caller passes a snapshot of them taken with
  // its own state, so a later replacement cannot mix into it (CR94-C2-F2).
  const buildPrintBackGraph = useCallback((
    flowEdges: Edge[],
    inputs: PrintBackInputs = {
      sourceGraph: sourceGraphRef.current,
      lastParsed: lastParsedRef.current,
      exactNodeIds: pendingExactNodeIdsRef.current,
    },
  ): GraphIR => {
    const { sourceGraph, lastParsed, exactNodeIds } = inputs;
    const authoredById = new Map(flattenAuthoringNodes(sourceGraph)
      .map((node) => [node.id, node]));
    const flattenConverted = (values: GraphIR['nodes'], parent?: string): GraphNode[] => values.flatMap((value) => {
      const { children, ...node } = value;
      return [{ ...node, label: node.label ?? node.id, ...(parent ? { parent } : {}) },
        ...flattenConverted(children ?? [], node.id)];
    });
    const graphNodes = flattenConverted(
      convertFlowToGraphNodes(nodes as CoralNode[], lastParsed.nodes),
    )
      .map((node) => {
        if (exactNodeIds.has(node.id)) return node;
        const authored = authoredById.get(node.id);
        if (authored?.position) return { ...node, position: { ...authored.position } };
        const { position: _position, ...withoutComputedPosition } = node;
        return withoutComputedPosition as GraphNode;
      });
    const portGraph: GraphIR = {
      ...sourceGraph,
      nodes: nestCanonicalNodes(graphNodes),
      edges: lastParsed.edges,
    };
    const graphEdges = convertCanonicalFlowEdges(
      flowEdges as CoralEdge[],
      lastParsed.edges,
      portGraph,
      notation,
    ).map((edge) => {
      const authored = sourceGraph.edges.find((candidate) => candidate.id === edge.id);
      return applyAuthoredWaypoints(
        authored?.routeIntent ? { ...edge, routeIntent: authored.routeIntent } : edge,
        waypointManager.waypointMap.get(edge.id),
      );
    });

    const graphIR: GraphIR = {
      ...sourceGraph,
      nodes: nestCanonicalNodes(graphNodes),
      edges: graphEdges,
    };
    return graphIR;
  }, [nodes, notation, waypointManager.waypointMap]);
  const syncDiagramToText = useCallback((flowEdges: Edge[] = edges) => {
    // A saved @diagram document owns its exact source. Passive canvas updates
    // (including a timer queued before a document switch) must never print a
    // GraphIR display projection over that source.
    if (isAuthored028Source(dslRef.current)) return;
    const graphIRPreview = graphIRPreviewSourceRef.current === dslRef.current;
    // Never print a graph over source the parser could not read (R-064 AC-4).
    if (sourceErrorsLockedRef.current ||
        (!graphIRPreview && sourceTextHasErrors(dslRef.current, dslType))) return;
    // Only sync when using Coral DSL (Mermaid has different syntax)
    if (dslType !== 'coral') {
      console.log('Skipping diagram→text sync for non-Coral DSL');
      return;
    }

    const graphIR = buildPrintBackGraph(flowEdges);
    sourceGraphRef.current = graphIR;
    pendingExactNodeIdsRef.current.clear();

    // Print through the diagnostic channel so passive visual edits cannot hide
    // a field that the text projection declined to carry.
    const installedPrint = graphIRPreview ? printInstalledSource028(graphIR, notation) : undefined;
    const printed = installedPrint?.text
      ? { text: installedPrint.text, diagnostics: installedPrint.diagnostics }
      : printCoralDSLWithDiagnostics(graphIR);
    const newDsl = printed.text;
    if (graphIRPreview) graphIRPreviewSourceRef.current = newDsl;
    formatSwitchDiagnosticsRef.current = [
      ...(graphIRPreview && !installedPrint?.text ? [{
        severity: 'warning' as const, code: 'coral.graphir.interchange.preview',
        message: 'This GraphIR interchange document cannot be represented as Coral 0.2.8 source. The text view is a preview; the GraphIR document remains authoritative.',
      }] : []),
      ...printed.diagnostics.map(editorDiagnostic),
    ];
    setFormatSwitchDiagnostics(formatSwitchDiagnosticsRef.current);
    // An unchanged projection needs no new source revision or relayout.
    if (newDsl === dslRef.current && revisions.publicationEnvelope().status === 'current') return;

    // Set flag to prevent feedback loop
    isInternalDslUpdateRef.current = true;

    // Provenance survives the passive-effect scheduling boundary.
    textProjectionRef.current = { text: newDsl, format: dslType, notation };
    const highlighting = editorEntityHighlightingRef.current;
    const projected = highlighting ? parseCoralDSL(newDsl) : undefined;
    setEditorAnalysis({
      source: newDsl,
      language: 'coral',
      diagnostics: [],
      decorations: projected
        ? analyzeEditorSource(newDsl, 'coral', projected.nodes, projected.edges)
        : [],
      entityHighlighting: highlighting,
    });
    const currentPublication = revisions.publicationEnvelope();
    const claimedRevision = pendingVisualSourceRevisionRef.current;
    const sourcePublication = currentPublication.status === 'pending'
      && claimedRevision === currentPublication.sourceRevision
      ? currentPublication
      : revisions.beginSource();
    // The passive owner covers the whole print-back, including an unclaimed
    // one such as geometry Undo, so its resolution phase is never ownerless.
    beginPassiveVisual(sourcePublication.sourceRevision);
    const needsSpatialResolution = requiresSpatialResolution(graphIR);
    if (needsSpatialResolution) {
      // Passive resolution phase (DR94-F3): the source stays writable and a
      // later edit may supersede it; Reflow and waypoint drag refuse visibly.
      visualResolutionInFlightRef.current = sourcePublication.sourceRevision;
      const pendingWaypoints = cloneWaypoints(waypointMapRef.current);
      const accepted = acceptedDisplayRef.current;
      if (accepted) {
        const acceptedNodes = cloneDisplayNodes(accepted.nodes);
        const acceptedEdges = cloneDisplayEdges(accepted.edges);
        nodesRef.current = acceptedNodes;
        edgesRef.current = acceptedEdges;
        verifiedEdgeRoutesRef.current = verifiedRoutesFromEdges(acceptedEdges);
        skipNextDiagramSyncRef.current = true;
        setNodes(acceptedNodes);
        setEdges(acceptedEdges);
        waypointManager.setWaypoints(cloneWaypoints(accepted.waypoints));
      }
      needsFullLayoutRef.current = true;
      void updateDiagramRef.current(
        newDsl,
        'coral',
        notation,
        formatSwitchDiagnosticsRef.current,
        { ...projectCanonicalGraph(graphIR), waypoints: pendingWaypoints },
        'full',
      ).catch((error) => {
        revisions.blockSource(
          sourcePublication.sourceRevision,
          `Export blocked: ${error instanceof Error ? error.message : String(error)}`,
        );
      }).finally(() => finishPassiveVisual(sourcePublication.sourceRevision));
    } else {
      revisions.publishSource(sourcePublication.sourceRevision);
      finishPassiveVisual(sourcePublication.sourceRevision);
      acceptedDisplayRef.current = {
        nodes: cloneDisplayNodes(nodesRef.current),
        edges: cloneDisplayEdges(edgesRef.current),
        waypoints: cloneWaypoints(waypointMapRef.current),
      };
    }
    setDsl(newDsl);

    // Reset flag after a microtask (allows state update to complete)
    Promise.resolve().then(() => {
      isInternalDslUpdateRef.current = false;
    });

    console.log('Synced diagram changes to DSL text');
  }, [beginPassiveVisual, buildPrintBackGraph, dslType, finishPassiveVisual, notation, nodes, edges, setDsl, setNodes,
    setEdges, waypointManager, revisions]);
  syncDiagramToTextRef.current = () => syncDiagramToText(edgesRef.current);

  // --- Connection gestures (R-016) -----------------------------------------
  // Before this, no onConnect/isValidConnection existed anywhere in the repo:
  // a user could drag off a handle and nothing was ever created.
  const [connectingFrom, setConnectingFrom] = useState<{
    nodeId: string;
    handleId?: string;
    handleType?: 'source' | 'target';
  } | null>(null);

  const isValidConnection = useCallback(
    (connection: { source?: string | null; target?: string | null; sourceHandle?: string | null; targetHandle?: string | null }) => {
      if (!connection.source || !connection.target) return false;
      if (dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current)) {
        const meaning = lastParsedRef.current.sourceMeaning028;
        const interpretations = lastParsedRef.current.semanticInterpretations;
        if (!meaning || !interpretations || sourceErrorsLockedRef.current ||
          lastParsedRef.current.sourceText028 !== dslRef.current ||
          unparsedUserTextRef.current !== null) return false;
        try {
          resolveSourceOwnedEdgePorts028(meaning, interpretations, {
            sourceId: connection.source, targetId: connection.target,
            sourceHandle: connection.sourceHandle, targetHandle: connection.targetHandle,
          });
          return true;
        } catch { return false; }
      }
      return evaluateAuthoringEdge({
        sourceId: connection.source,
        targetId: connection.target,
        sourcePortId: connection.sourceHandle ?? undefined,
        targetPortId: connection.targetHandle ?? undefined,
      }).ok;
    },
    [evaluateAuthoringEdge]
  );

  const handleConnectStart = useCallback(
    (_event: unknown, params: {
      nodeId?: string | null;
      handleId?: string | null;
      handleType?: 'source' | 'target' | null;
    }) => {
      if (!params.nodeId) return;
      const handleType = params.handleType ?? 'source';
      if (dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current)) {
        if (lastParsedRef.current.sourceText028 !== dslRef.current ||
          unparsedUserTextRef.current !== null) { setConnectingFrom(null); return; }
        const interpretation = lastParsedRef.current.semanticInterpretations?.get(params.nodeId);
        if (!interpretation) return;
        try {
          setConnectingFrom({ nodeId: params.nodeId,
            handleId: resolveSourceOwnedHandle028(interpretation, params.handleId, handleType),
            handleType });
        } catch { setConnectingFrom(null); }
        return;
      }
      setConnectingFrom({
        nodeId: params.nodeId,
        handleId: resolveAuthoringPortId(
          captureCurrentGraph(), notation, params.nodeId, handleType, params.handleId,
        ),
        handleType,
      });
    },
    [captureCurrentGraph, notation]
  );

  const handleConnectEnd = useCallback(() => setConnectingFrom(null), []);

  const handleConnect = useCallback(
    (connection: { source?: string | null; target?: string | null; sourceHandle?: string | null; targetHandle?: string | null }) => {
      setConnectingFrom(null);
      if (!connection.source || !connection.target) return;
      if (dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current)) {
        const meaning = lastParsedRef.current.sourceMeaning028;
        const interpretations = lastParsedRef.current.semanticInterpretations;
        if (!meaning || !interpretations || sourceErrorsLockedRef.current ||
          lastParsedRef.current.sourceText028 !== dslRef.current ||
          unparsedUserTextRef.current !== null) return;
        try {
          const input = { sourceId: connection.source, targetId: connection.target,
            sourceHandle: connection.sourceHandle, targetHandle: connection.targetHandle };
          resolveSourceOwnedEdgePorts028(meaning, interpretations, input);
          const edited = appendSourceOwnedEdge028(dslRef.current, input);
          sourceTextEditRef.current(edited);
          sourceEditSessionRef.current = false;
          setGuidanceAnnouncement(`Created connection from ${connection.source} to ${connection.target}.`);
        } catch (error) {
          setGuidanceAnnouncement(error instanceof Error ? error.message : String(error));
        }
        return;
      }
      const created = evaluateAuthoringEdge({
        sourceId: connection.source,
        targetId: connection.target,
        sourcePortId: connection.sourceHandle ?? undefined,
        targetPortId: connection.targetHandle ?? undefined,
      });
      if (!created.ok) return;
      publishStructuralGraph(created.graph, waypointMapRef.current, {
        announcement: `Created connection from ${connection.source} to ${connection.target}.`,
      });
    },
    [evaluateAuthoringEdge, publishStructuralGraph]
  );

  /**
   * Per-node drag state, so handles can colour themselves live while a
   * connection gesture is in flight. `HandleDragState` was declared and
   * exported by @coral-viz/viz but referenced nowhere until now.
   */
  const handleDragStates = useMemo<Record<string, Record<string, HandleDragState>>>(() => {
    if (!connectingFrom) return {};
    const sourceOwned = dslType === 'coral' && isAuthored028Source(dsl);
    const connectionState = (source: string, target: string,
      sourceHandle?: string, targetHandle?: string): HandleDragState => {
      if (sourceOwned) return isValidConnection({ source, target, sourceHandle, targetHandle })
        ? 'compatible' : 'incompatible';
      const result = checkConnection(source, target, sourceHandle, targetHandle);
      return !result.valid ? 'incompatible' : result.hasWarning ? 'warning' : 'compatible';
    };
    const states: Record<string, Record<string, HandleDragState>> = {};
    for (const node of nodes) {
      if (node.id === connectingFrom.nodeId) continue;
      const ports = sourceOwned
        ? lastParsedRef.current.semanticInterpretations?.get(node.id)?.semanticPorts
        : editorHandlePorts(nodeConnectionInfo.get(node.id));
      if (!ports) {
        states[node.id] = {};
        continue;
      }
      const nodeStates: Record<string, HandleDragState> = {};
      if (ports.length === 0) {
        // A portless node's handles carry no port id; one state covers them.
        const startsAtTarget = connectingFrom.handleType === 'target';
        nodeStates['*'] = startsAtTarget
          ? connectionState(node.id, connectingFrom.nodeId, undefined, connectingFrom.handleId)
          : connectionState(connectingFrom.nodeId, node.id, connectingFrom.handleId, undefined);
      }
      for (const port of ports) {
        const startsAtTarget = connectingFrom.handleType === 'target';
        if (startsAtTarget && port.direction === 'in') continue;
        if (!startsAtTarget && port.direction === 'out') continue;
        const handleId = port.direction === 'inout'
          ? `${port.id}-${startsAtTarget ? 'out' : 'in'}`
          : port.id;
        nodeStates[handleId] = startsAtTarget
          ? connectionState(node.id, connectingFrom.nodeId, port.id, connectingFrom.handleId)
          : connectionState(connectingFrom.nodeId, node.id, connectingFrom.handleId, port.id);
      }
      states[node.id] = nodeStates;
    }
    return states;
  }, [connectingFrom, nodes, nodeConnectionInfo, checkConnection, isValidConnection, dslType, dsl]);

  /** Nodes carrying the live drag state their handles colour themselves with. */
  type StyledNodeCacheEntry028 = {
    source: Node<SymbolNodeData>;
    style: RenderStyle028;
    theme: 'light' | 'dark';
    fontSettings: typeof documentSettings.font;
    dragStates?: typeof handleDragStates[string];
    output: Node<SymbolNodeData>;
  };
  const styledNodeCache028 = useRef(new Map<string, StyledNodeCacheEntry028>());
  const styledNodes = useMemo(() => {
    const mode = theme === lightTheme ? 'light' as const : 'dark' as const;
    const previous = styledNodeCache028.current;
    const next = new Map<string, StyledNodeCacheEntry028>();
    const fontSettings = editorVisualFonts028(documentSettings.font, renderStyle028);
    const projected = nodes.map((node) => {
      const dragStates = handleDragStates[node.id];
      const cached = previous.get(node.id);
      if (cached && cached.source === node && cached.style === renderStyle028 &&
        cached.theme === mode && cached.fontSettings === documentSettings.font &&
        cached.dragStates === dragStates) {
        next.set(node.id, cached);
        return cached.output;
      }
      const output = { ...node, data: { ...node.data, renderStyle028,
        renderTheme028: mode,
        renderFont028: resolveDiagramFont(fontSettings,
          node.data.symbolId, node.data.nodeType),
        ...(dragStates ? { dragStates } : {}) } };
      next.set(node.id, { source: node, style: renderStyle028, theme: mode,
        fontSettings: documentSettings.font, dragStates, output });
      return output;
    });
    styledNodeCache028.current = next;
    return projected;
  }, [nodes, handleDragStates, documentSettings.font, renderStyle028, theme]);



  // Handle property change from properties panel
  const handlePropertyChange = useCallback((change: PropertyChange) => {
    if (structuralLayoutPendingRef.current !== null) return;
    sourceEditSessionRef.current = false;
    const key = `${change.nodeId}:${change.field}${change.propertyKey ? `:${change.propertyKey}` : ''}`;
    const session = propertyEditSessionRef.current;
    if (!session || session.key !== key || !session.changed) {
      pushContentHistory(captureCurrentGraph(), waypointMapRef.current);
      if (session?.key === key) session.changed = true;
    }
    invalidateEditIntent();
    claimSpatialEditPublication();
    let projectedLabelNodes: Map<string, Node<SymbolNodeData>> | undefined;
    if (change.field === 'label' || change.field === 'classifier') {
      const graphNodes = lastParsedRef.current.nodes.map((node) =>
        node.id === change.nodeId ? {
          ...node,
          ...(change.field === 'label' ? {
            label: change.newValue as string,
            ...(node.classifier ? { classifier: { ...node.classifier, name: change.newValue as string } } : {}),
          } : {
            classifier: change.newValue as NonNullable<typeof node.classifier>,
            type: (change.newValue as NonNullable<typeof node.classifier>).kind,
            symbol: `uml-${(change.newValue as NonNullable<typeof node.classifier>).kind}`,
          }),
        } : node
      );
      lastParsedRef.current = { ...lastParsedRef.current, nodes: graphNodes };
      if (graphNodes.some((node) => node.id === change.nodeId)) {
        projectedLabelNodes = new Map(projectDiagramNodes(
          graphNodes,
          notation,
          documentSettingsRef.current.font,
          documentSettingsRef.current.layout.sizingMode ?? 'adaptive',
          resolveNotationLayout(notation, documentSettingsRef.current.layout).settings.direction,
          lastParsedRef.current.semanticInterpretations,
        ).map((node) => [node.id, node]));
      }
    }
    setNodes((currentNodes) => {
      const updated = currentNodes.map((node) => {
        const labelReprojectsUniformPeers = change.field === 'label'
          && documentSettingsRef.current.layout.sizingMode === 'uniform';
        const projectedLabelNode = node.id === change.nodeId || labelReprojectsUniformPeers
          ? projectedLabelNodes?.get(node.id)
          : undefined;
        if (change.field === 'label' && projectedLabelNode) {
          return {
            ...node,
            width: projectedLabelNode.width,
            height: projectedLabelNode.height,
            data: mergeProjectedNodeData(
              node.data,
              projectedLabelNode.data,
              node.id === change.nodeId ? change.newValue as string : undefined,
            ),
          };
        }
        if (node.id !== change.nodeId) return node;

        if (change.field === 'label') {
          return {
            ...node,
            data: {
              ...node.data,
              label: change.newValue as string,
            },
          };
        }
        if (change.field === 'description') {
          return {
            ...node,
            data: { ...node.data, description: change.newValue as string },
          };
        }
        if (change.field === 'classifier') {
          const classifier = change.newValue as NonNullable<typeof node.data.canonical>['classifier'];
          if (!classifier) return node;
          return {
            ...node,
            data: {
              ...node.data,
              nodeType: classifier.kind,
              canonical: {
                ...node.data.canonical,
                classifier,
                symbol: `uml-${classifier.kind}`,
              },
            },
          };
        }
        if (change.field === 'property' && change.propertyKey) {
          return {
            ...node,
            data: {
              ...node.data,
              properties: {
                ...(node.data.properties as Record<string, unknown> || {}),
                [change.propertyKey]: change.newValue,
              },
            },
          };
        }
        return node;
      });
      nodesRef.current = updated;
      return updated;
    });
  }, [captureCurrentGraph, claimSpatialEditPublication, invalidateEditIntent, notation, pushContentHistory, setNodes]);

  // Handle add property from properties panel
  const handleAddProperty = useCallback((nodeId: string, key: string, value: unknown) => {
    if (structuralLayoutPendingRef.current !== null) return;
    sourceEditSessionRef.current = false;
    pushContentHistory(captureCurrentGraph(), waypointMapRef.current);
    invalidateEditIntent();
    claimSpatialEditPublication();
    setNodes((currentNodes) => {
      const updated = currentNodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          data: {
            ...node.data,
            properties: {
              ...(node.data.properties as Record<string, unknown> || {}),
              [key]: value,
            },
          },
        };
      });
      nodesRef.current = updated;
      return updated;
    });
  }, [captureCurrentGraph, claimSpatialEditPublication, invalidateEditIntent, pushContentHistory, setNodes]);

  // Handle remove property from properties panel
  const handleRemoveProperty = useCallback((nodeId: string, key: string) => {
    if (structuralLayoutPendingRef.current !== null) return;
    sourceEditSessionRef.current = false;
    pushContentHistory(captureCurrentGraph(), waypointMapRef.current);
    invalidateEditIntent();
    claimSpatialEditPublication();
    setNodes((currentNodes) => {
      const updated = currentNodes.map((node) => {
        if (node.id !== nodeId) return node;
        const newProps = { ...(node.data.properties as Record<string, unknown> || {}) };
        delete newProps[key];
        return {
          ...node,
          data: {
            ...node.data,
            properties: newProps,
          },
        };
      });
      nodesRef.current = updated;
      return updated;
    });
  }, [captureCurrentGraph, claimSpatialEditPublication, invalidateEditIntent, pushContentHistory, setNodes]);

  // Handle inline label edit from SymbolNode (via EditProvider)
  const handleLabelEdit = useCallback((nodeId: string, newLabel: string) => {
    handlePropertyChange({
      nodeId,
      field: 'label',
      oldValue: nodes.find((n) => n.id === nodeId)?.data.label,
      newValue: newLabel,
    });
  }, [handlePropertyChange, nodes]);

  // Sync to text after node changes (debounced)
  useEffect(() => {
    // Display-only changes neither start nor postpone a sync: a pending real
    // change keeps its original timer.
    const displayOnly = nodes === displayOnlyNodesRef.current;
    if (displayOnly && diagramSyncPendingRef.current) return;
    // Any other publication supersedes the pending sync.
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    diagramSyncPendingRef.current = false;
    // Skip sync on initial load, during undo/redo, or when changes came from text editing;
    // a skip armed for this publication is spent with it rather than left for a later edit.
    if (isUndoRedoRef.current || isInternalDslUpdateRef.current || textOriginOwnerRef.current !== null) {
      skipNextDiagramSyncRef.current = false;
      return;
    }
    if (skipNextDiagramSyncRef.current) {
      skipNextDiagramSyncRef.current = false;
      return;
    }
    if (displayOnly) return;

    // Debounce the sync to avoid rapid updates
    diagramSyncPendingRef.current = true;
    const timeout = window.setTimeout(() => {
      if (syncTimeoutRef.current === timeout) syncTimeoutRef.current = null;
      diagramSyncPendingRef.current = false;
      syncDiagramToTextRef.current();
    }, DIAGRAM_TO_TEXT_DEBOUNCE_MS);
    syncTimeoutRef.current = timeout;
    // Only node publications drive this sync; unrelated re-renders must not re-arm it.
  }, [nodes]);
  useEffect(() => () => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
  }, []);

  // Selection updates Properties content without opening the panel.
  const handleSelectionChange = useCallback(({ nodes: selectedNodes, edges: selectedEdges = [] }: { nodes: Node[]; edges?: Edge[] }) => {
    propertiesInvokerRef.current = null;
    if (selectedNodes.length === 1 && selectedEdges.length === 0) {
      setSelectedNodeId(selectedNodes[0].id);
      setSelectedEdgeId(null);
      setSelectionSummary({ kind: 'node', count: 1, label: String(selectedNodes[0].data?.label ?? selectedNodes[0].id) });
    } else if (selectedNodes.length === 0 && selectedEdges.length === 1) {
      setSelectedNodeId(null);
      setSelectedEdgeId(selectedEdges[0].id);
      setSelectionSummary({ kind: 'edge', count: 1, label: String(selectedEdges[0].label ?? selectedEdges[0].id) });
    } else if (selectedNodes.length + selectedEdges.length > 1) {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSelectionSummary({ kind: 'mixed', count: selectedNodes.length + selectedEdges.length });
    } else {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSelectionSummary({ kind: 'none', count: 0 });
    }
  }, []);

  // Parse DSL and update diagram with position stability (CORAL-REQ-013)
  const updateDiagram = useCallback(async (
    text: string,
    type: DSLType,
    currentNotation: NotationType,
    additionalDiagnostics: EditorParseError[] = [],
    canonicalInput?: ReturnType<typeof captureCanonicalProjection>,
    requestedStrategy?: LayoutStrategy,
    blockWith?: string,
  ) => {
    // Skip if we're in the middle of undo/redo
    if (isUndoRedoRef.current) {
      console.log('Skipping updateDiagram during undo/redo');
      // Defensive only: geometry Undo is unreachable in 0.2.6 (design §14).
      // This return precedes the try and its finally, so retire any source
      // owner of the current revision; the owner match makes it a no-op when
      // the caller claimed none.
      finishSourceUpdate(revisions.currentSourceRevision());
      return;
    }

    const sourceRevision = revisions.currentSourceRevision();
    activeLayoutAbortRef.current?.abort();
    const layoutAbort = new AbortController();
    activeLayoutAbortRef.current = layoutAbort;
    const revision = revisions.beginLayout('loading');
    setLoading(true);
    const isCurrent = () => revisions.isCurrent(revision);
    const finishLoading = () => {
      if (activeLayoutAbortRef.current === layoutAbort) activeLayoutAbortRef.current = null;
      if (revisions.finish('loading', revision)) {
        setLoading(false);
      }
    };
    let failureDiagnostics = [...additionalDiagnostics];
    const finalizeDiagramFailure = (error: unknown, label = 'Diagram update') => {
      if ((error as { name?: string }).name === 'AbortError' || !isCurrent()) return false;
      const detail = error instanceof Error ? error.message : String(error);
      const summary = `${label} failed: ${detail}`;
      revisions.blockSource(sourceRevision, blockWith
        ? `${blockWith}; ${summary}`
        : `Export blocked: ${summary}`);
      setSourceErrorsLocked(true);
      setParseErrors([...failureDiagnostics, ...sourceSpatialFailureDiagnostics028(error, text).map(editorDiagnostic), {
        line: 0,
        message: `${label} failed; existing geometry was retained. ${detail}`,
      }]);
      finishLoading();
      return true;
    };

    try {
    const parsedText = canonicalInput && type === 'coral' && graphIRPreviewSourceRef.current !== text
      ? parseCoralDSL(text) : undefined;
    // Open/import may provide a positioned display graph. The authored 0.2.8
    // source still owns its semantic interpretation and port references.
    const result = canonicalInput
      ? { nodes: canonicalInput.nodes, edges: canonicalInput.edges, errors: [],
          ...(parsedText?.sourceGraph ? { sourceGraph: parsedText.sourceGraph } : {}),
          ...(parsedText?.semanticInterpretations
            ? { semanticInterpretations: parsedText.semanticInterpretations } : {}) }
      : parseEditorSource(text, type);
    const semanticInterpretations = 'semanticInterpretations' in result
      ? result.semanticInterpretations : undefined;
    const currentEnvelope = {
      version: sourceGraphRef.current.version,
      id: sourceGraphRef.current.id,
      ...(sourceGraphRef.current.name !== undefined ? { name: sourceGraphRef.current.name } : {}),
      ...(sourceGraphRef.current.metadata !== undefined ? { metadata: sourceGraphRef.current.metadata } : {}),
      ...(sourceGraphRef.current.layoutOptions !== undefined ? { layoutOptions: sourceGraphRef.current.layoutOptions } : {}),
      ...(sourceGraphRef.current.constraints !== undefined ? { constraints: sourceGraphRef.current.constraints } : {}),
      ...(sourceGraphRef.current.profile !== undefined ? { profile: sourceGraphRef.current.profile } : {}),
      ...(sourceGraphRef.current.interaction !== undefined ? { interaction: sourceGraphRef.current.interaction } : {}),
      ...(('spatialConstraints028' in sourceGraphRef.current) ? { spatialConstraints028: (sourceGraphRef.current as SpatialSidecar028).spatialConstraints028 } : {}),
      ...(('routeIntents028' in sourceGraphRef.current) ? { routeIntents028: (sourceGraphRef.current as SpatialSidecar028).routeIntents028 } : {}),
      ...(('layoutOptions028' in sourceGraphRef.current) ? { layoutOptions028: (sourceGraphRef.current as SpatialSidecar028).layoutOptions028 } : {}),
    };
    const baseEnvelope = 'envelope' in result && result.envelope
      ? result.envelope
      : canonicalInput ? currentEnvelope : { version: '3.0.0' as const, id: 'diagram' };
    // Published Coral text is the envelope authority (notation, name, layout
    // options) even when its graph arrives pre-parsed, as for an accepted AI
    // candidate (R-063 AC-4). Fields the header cannot carry are kept.
    const textEnvelope = parsedText?.envelope;
    const nextEnvelope = textEnvelope ? { ...baseEnvelope, ...textEnvelope } : baseEnvelope;
    // A valid saved header owns notation even when a malformed body cannot
    // produce a graph envelope. The body may stay blocked without reverting
    // the author's diagram type choice.
    const requestedNotation = type === 'coral' && is028HeaderSource(text)
      ? installedHeaderNotation(text)
      : type === 'coral' && typeof nextEnvelope.metadata?.notation === 'string'
        ? nextEnvelope.metadata.notation : undefined;
    const notationError: EditorParseError | undefined = requestedNotation !== undefined && !notationRegistry.has(requestedNotation)
      ? (() => {
          const range = findGraphNotationValueRange(text);
          const position = range?.start ?? { line: 1, column: 0, offset: 0 };
          return {
            ...position,
            code: 'coral.source.notation.unknown', severity: 'error',
            message: `Notation "${requestedNotation}" is not installed`,
            ...(range ? { range } : {}),
          };
        })() : undefined;
    const activeNotation = (requestedNotation !== undefined && notationRegistry.has(requestedNotation)
      ? requestedNotation : currentNotation) as NotationType;
    const commitActiveNotation = () => {
      if (documentSettingsRef.current.notation === activeNotation && currentNotation === activeNotation) return;
      const settings = { ...documentSettingsRef.current, notation: activeNotation };
      documentSettingsRef.current = settings;
      updateDocumentSettings(settings);
      setNotation(activeNotation);
    };
    console.log('Parse result:', result);
    // Unsafe port references block publication like any source error, so a
    // graph the same build would refuse to reopen is never published (R-063 AC-7).
    // A direct open already reports them in its supplied diagnostics.
    const suppliedMessages = new Set(additionalDiagnostics.map((diagnostic) => `${diagnostic.code}\u0000${diagnostic.message}`));
    const portDiagnostics = type === 'coral' && !isSequenceGraph(nextEnvelope) &&
      !('semanticInterpretations' in result && result.semanticInterpretations)
      ? portSafetyDiagnostics(result.nodes, result.edges, activeNotation)
        .filter((diagnostic) => !suppliedMessages.has(`${diagnostic.code}\u0000${diagnostic.message}`))
      : [];
    const nextErrors = [...(result.diagnostics ?? result.errors), ...(notationError ? [notationError] : []),
      ...portDiagnostics, ...additionalDiagnostics];
    failureDiagnostics = nextErrors;
    const nextAnalysisDiagnostics: EditorDiagnostic[] = nextErrors.map((error) => {
      const structured: EditorParseError = error;
      return {
        ...structured,
        severity: structured.severity ?? 'error',
        ...(structured.range ? { range: structured.range } : {}),
        ...((structured.line ?? 0) > 0 && structured.column !== undefined && structured.offset !== undefined ? { position: {
          line: structured.line!,
          column: structured.column,
          offset: structured.offset,
        } } : (structured.line ?? 0) > 0 ? { line: structured.line } : {}),
      };
    });
    const nextAnalysis = {
      source: text,
      language: type,
      diagnostics: nextAnalysisDiagnostics,
      decorations: userPreferences.editorEntityHighlighting === true
        ? analyzeEditorSource(text, type, result.nodes, result.edges)
        : [],
      entityHighlighting: userPreferences.editorEntityHighlighting === true,
    };
    const nextDebugInfo = `Parsed: ${result.nodes.length} nodes, ${result.edges.length} edges (${activeNotation} notation)`;

    const markParsed = () => {
      if (unparsedUserTextRef.current === text) unparsedUserTextRef.current = null;
    };
    const publishOrBlock = () => {
      markParsed();
      if (blockWith) {
        revisions.blockSource(sourceRevision, blockWith);
        setSourceErrorsLocked(true);
      } else if (revisions.publishSource(sourceRevision)) {
        setSourceErrorsLocked(false);
        setRecoveredGraph(false);
      }
    };
    const blockingErrors = [...result.errors, ...(notationError ? [notationError] : []), ...portDiagnostics]
      .filter((error) => error.severity === undefined || error.severity === 'error');
    const blockingError = blockingErrors[0];
    // An opened file with errors lays out its recovered graph before blocking.
    if (blockingError && !blockWith) {
      if (!isCurrent()) return;
      // An installed source header remains authoritative even while another
      // source error keeps publication blocked (R-063 AC-4, e2e C50).
      commitActiveNotation();
      markParsed();
      setSourceErrorsLocked(true);
      if ('sourceGraph' in result && result.sourceGraph && blockingErrors.every((error) =>
        error.code === 'render.capability.sequence-fragment' ||
        error.code === 'render.capability.sequence-semantic-port' ||
        error.code === 'render.capability.edge-rgb' ||
        error.code === 'render.capability.edge-stroke-weight' ||
        error.code === 'render.capability.edge-motion' ||
        error.code === 'render.capability.sequence-note' ||
        error.code === 'render.capability.sequence-activation' ||
        error.code === 'render.capability.sequence-destroy')) {
        // The scene is blocked, but this source revision still has a complete
        // portable model. Keep that exact pair for candidate export only, and
        // clear the older display so it cannot show superseded source meaning.
        const emptyDisplay = { ...nextEnvelope, nodes: [], edges: [] };
        delete emptyDisplay.interaction;
        sourceGraphRef.current = emptyDisplay;
        setNodes([]);
        setEdges([]);
        waypointManager.setWaypoints(new Map());
        previousGraphRef.current = { nodes: [], edges: [] };
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setSequenceSelection(null);
        lastParsedRef.current = { nodes: [], edges: [],
          sourceMeaning028: result.sourceGraph, sourceText028: text };
      }
      // Name the count and point to the complete list, not only the first error.
      const count = `${blockingErrors.length} ${blockingErrors.length === 1 ? 'error' : 'errors'}`;
      const where = blockingError.line ? `Line ${blockingError.line}: ` : '';
      revisions.blockSource(sourceRevision,
        `Export blocked: ${count} — first: ${where}${blockingError.message}; use Show all diagnostics for the full list`);
      setParseErrors(nextErrors);
      setEditorAnalysis(nextAnalysis);
      setDebugInfo(nextDebugInfo);
      finishLoading();
      return;
    }

    if (result.nodes.length === 0) {
      if (!isCurrent()) return;
      sourceGraphRef.current = {
        ...nextEnvelope,
        nodes: [],
        edges: [],
      };
      commitActiveNotation();
      // Clearing source publishes an empty display, not a canvas edit. Its
      // node-change effect must not print an @graph shell over the exact text.
      skipNextDiagramSyncRef.current = true;
      setNodes([]);
      setEdges([]);
      waypointManager.setWaypoints(new Map());
      lastParsedRef.current = { nodes: [], edges: [],
        ...(semanticInterpretations ? { semanticInterpretations } : {}),
        ...('sourceGraph' in result && result.sourceGraph
          ? { sourceMeaning028: result.sourceGraph, sourceText028: text } : {}) };
      previousGraphRef.current = { nodes: [], edges: [] };
      setParseErrors(nextErrors);
      setEditorAnalysis(nextAnalysis);
      setDebugInfo(nextDebugInfo);
      publishOrBlock();
      finishLoading();
      return;
    }

    const newGraph: DiffableGraph = {
      nodes: result.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label,
        ...(n.parent ? { parentId: n.parent } : {}) })),
      edges: result.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    };
    // A verified canonical generation result already owns its coordinates.
    // Project it directly instead of routing it through a full ELK pass.
    const canvasGraph: GraphIR = {
      ...nextEnvelope,
      nodes: nestCanonicalNodes(result.nodes),
      edges: result.edges,
    };
    // Sequence geometry is the specialized scene; generic ELK never runs (R-060 AC-2).
    const sequenceDocument = isSequenceGraph(canvasGraph);
    const sourceMeaning028 = 'sourceGraph' in result ? result.sourceGraph : undefined;
    // A notation change can replace symbol geometry and port interpretation;
    // positions from the previous notation are not a valid incremental base.
    let fullLayout = !sequenceDocument && (activeNotation !== currentNotation
      || requiresSpatialResolution(canvasGraph) || requestedStrategy === 'full'
      || changedSourceProximity028(lastParsedRef.current.sourceMeaning028, sourceMeaning028)
      || needsFullLayoutRef.current || previousGraphRef.current.nodes.length === 0);
    const layoutStartedAt = performance.now();
    const graphBeforeLayout = captureCurrentGraph();
    const displayBeforeLayout = qualitySceneFromCanvas(nodesRef.current, edgesRef.current, graphBeforeLayout.edges);
    let publishedText = text;
    let publishedGraph: GraphIR | null = null;

    for (;;) {
      const renderInputRevision028 = renderInputRevisionRef028.current;
      const currentSettings = documentSettingsRef.current;
      const projectedNodes = projectDiagramNodes(
        result.nodes,
        activeNotation,
        currentSettings.font,
        currentSettings.layout.sizingMode ?? 'adaptive',
        resolveNotationLayout(activeNotation, currentSettings.layout).settings.direction,
        semanticInterpretations,
      );
      let nextNodes: Node<SymbolNodeData>[];
      let nextEdges: Edge[];
      let layoutDiagnostics: EditorParseError[] = [];

      if (fullLayout) {
        console.log('Performing full ELK layout');
        let layoutResult;
        try {
          layoutResult = await layoutNodes(
            result.nodes,
            result.edges,
            activeNotation,
            currentSettings.layout,
            true,
            currentSettings.font,
            layoutAbort.signal,
            canvasGraph.constraints,
            'incremental',
            semanticInterpretations,
            canvasGraph as SpatialSidecar028,
            currentSettings.renderStyle028 ?? 'lowfi',
          );
        } catch (error) {
          if (!isCurrent()) return;
          if (renderInputRevisionRef028.current !== renderInputRevision028) continue;
          finalizeDiagramFailure(error, 'Automatic layout');
          return;
        }
        if (!isCurrent()) return;
        if (renderInputRevisionRef028.current !== renderInputRevision028) continue;
        Object.assign(canvasGraph, { labelBounds028: layoutResult.labelBounds028 });
        layoutDiagnostics = layoutResult.diagnostics.map((diagnostic) => ({ ...diagnostic }));
        const recoveryPositions = pendingRecoveryPositionsRef.current;
        nextNodes = recoveryPositions
          ? layoutResult.nodes.map((node) => ({
              ...node,
              position: recoveryPositions[node.id] ?? node.position,
            }))
          : layoutResult.nodes;
        const recoveryRouting = recoveryPositions
          ? retainRoutesAfterPositionOverlay(
              result.nodes, result.edges, layoutResult.nodes, layoutResult.edgeRouting, recoveryPositions,
            )
          : layoutResult.edgeRouting;
        nextEdges = projectEdgesForCanvas(
          canvasGraph, activeNotation, recoveryRouting, currentSettings.font, semanticInterpretations,
        );
      } else if (sequenceDocument || requestedStrategy === 'preserve' || requestedStrategy === 'preserve-and-reroute') {
        console.log(requestedStrategy === 'preserve'
          ? 'Preserving existing layout'
          : 'Preserving nodes and rerouting changed topology');
        const currentById = new Map(nodesRef.current.map((node) => [node.id, node]));
        nextNodes = projectedNodes.map((projected) => {
          const graphNode = result.nodes.find((node) => node.id === projected.id)!;
          const prior = currentById.get(projected.id);
          return {
            ...projected,
            position: graphNode.position ?? prior?.position ?? { x: 0, y: 0 },
            ...(prior?.selected !== undefined ? { selected: prior.selected } : {}),
          };
        });
        const projectedEdges = projectEdgesForCanvas(canvasGraph, activeNotation, undefined,
          currentSettings.font, semanticInterpretations);
        if (requestedStrategy === 'preserve') {
          const currentEdges = new Map(edgesRef.current.map((edge) => [edge.id, edge]));
          // A prior route fits only endpoints whose frames did not change; a
          // renamed node is resized, so its connectors are routed again below.
          const nextById = new Map(nextNodes.map((node) => [node.id, node]));
          const sameFrame = (id: string) => {
            const before = currentById.get(id), after = nextById.get(id);
            return Boolean(before && after && before.width === after.width && before.height === after.height
              && before.position.x === after.position.x && before.position.y === after.position.y);
          };
          nextEdges = projectedEdges.map((edge) => {
            const prior = currentEdges.get(edge.id);
            return prior && prior.source === edge.source && prior.target === edge.target
              && prior.sourceHandle === edge.sourceHandle && prior.targetHandle === edge.targetHandle
              && sameFrame(edge.source) && sameFrame(edge.target)
              ? { ...edge, data: { ...edge.data, ...(prior.data?.routedPath ? { routedPath: prior.data.routedPath } : {}) } }
              : edge;
          });
        } else {
          nextEdges = projectedEdges;
        }
      } else {
        console.log('Performing incremental layout');
        const currentPositions = new Map<string, Position>();
        for (const node of nodesRef.current) currentPositions.set(node.id, { ...node.position });
        let finalPositions: Map<string, Position>;
        try {
          finalPositions = await resolveIncrementalEditorPositions(
            previousGraphRef.current,
            newGraph,
            currentPositions,
            projectedNodes,
            result.edges,
            layoutAbort.signal,
          );
        } catch (error) {
          if (!isCurrent()) return;
          if (renderInputRevisionRef028.current !== renderInputRevision028) continue;
          finalizeDiagramFailure(error, 'Incremental layout');
          return;
        }
        if (!isCurrent()) return;
        if (renderInputRevisionRef028.current !== renderInputRevision028) continue;
        const currentById = new Map(nodesRef.current.map((node) => [node.id, node]));
        nextNodes = projectedNodes.map((projected) => {
          const graphNode = result.nodes.find((node) => node.id === projected.id)!;
          const prior = currentById.get(projected.id);
          return {
            ...projected,
            position: graphNode.position ?? finalPositions.get(projected.id) ?? { x: 0, y: 0 },
            ...(prior?.selected !== undefined ? { selected: prior.selected } : {}),
          };
        });
        nextEdges = projectEdgesForCanvas(canvasGraph, activeNotation, undefined,
          currentSettings.font, semanticInterpretations);
      }

      // The incremental and reroute paths above keep positions but do not
      // route edges. Route every connector against the current node geometry
      // (captions, resized labels and semantic ports included) with the shared
      // spatial router before publishing, instead of leaving the scene a
      // centre-to-centre line or borrowing a previous route.
      if (!fullLayout && !sequenceDocument && nextEdges.some((edge) => !edge.data?.routedPath)) {
        const positioned = new Map(nextNodes.map((node) => [node.id, node.position]));
        let routed;
        try {
          routed = await layoutNodes(
            result.nodes.map((node) => ({ ...node, position: positioned.get(node.id) ?? node.position })),
            result.edges, activeNotation, currentSettings.layout, true, currentSettings.font,
            layoutAbort.signal, canvasGraph.constraints, 'incremental', semanticInterpretations,
            canvasGraph as SpatialSidecar028, currentSettings.renderStyle028 ?? 'lowfi',
          );
        } catch (error) {
          if (!isCurrent()) return;
          if (renderInputRevisionRef028.current !== renderInputRevision028) continue;
          // Retained canvas positions are view state, not source geometry. When
          // an edit resizes nodes so that geometry cannot be drawn, lay the
          // source out as a load does (authored positions still hold).
          if (error instanceof SpatialLayoutError) { fullLayout = true; continue; }
          finalizeDiagramFailure(error, 'Connector routing');
          return;
        }
        if (!isCurrent()) return;
        if (renderInputRevisionRef028.current !== renderInputRevision028) continue;
        // Only an overlap involving a retained (not authored or pinned) frame
        // can be resolved by laying the source out again.
        const sourceFixed = new Set(result.nodes.filter((node) => node.position || node.pinned).map((node) => node.id));
        if (routed.diagnostics.some((diagnostic) => diagnostic.code === 'layout.constraint.overlap-forced' &&
          [...diagnostic.message.matchAll(/"([^"]+)"/g)].some(([, id]) => !sourceFixed.has(id!)))) {
          fullLayout = true;
          continue;
        }
        Object.assign(canvasGraph, { labelBounds028: routed.labelBounds028 });
        nextNodes = routed.nodes;
        nextEdges = projectEdgesForCanvas(canvasGraph, activeNotation, routed.edgeRouting,
          currentSettings.font, semanticInterpretations);
        layoutDiagnostics.push(...routed.diagnostics.map((diagnostic) => ({ ...diagnostic })));
      }

      if (!fullLayout && requestedStrategy && !sequenceDocument) {
        const renderedById = new Map(nextNodes.map((node) => [node.id, node]));
        const renderedEdgesById = new Map(nextEdges.map((edge) => [edge.id, edge]));
        const renderedGraph: GraphIR = {
          ...canvasGraph,
          nodes: nestCanonicalNodes(result.nodes.map((node) => {
            const rendered = renderedById.get(node.id);
            return rendered ? {
              ...node,
              position: { ...rendered.position },
              ...(typeof rendered.width === 'number' && typeof rendered.height === 'number'
                ? { dimensions: { width: rendered.width, height: rendered.height } } : {}),
            } : node;
          })),
          edges: canvasGraph.edges.map((edge) => {
            const rendered = renderedEdgesById.get(edge.id);
            const routed = rendered?.data?.routedPath as {
              startPoint?: Position; endPoint?: Position; bendPoints?: Position[];
            } | undefined;
            const routingPoints = routed?.startPoint && routed.endPoint
              ? [routed.startPoint, ...(routed.bendPoints ?? []), routed.endPoint]
              : Array.isArray(rendered?.data?.routingPoints)
                ? rendered.data.routingPoints as Position[]
                : edge.routingPoints;
            return { ...edge, ...(routingPoints?.length ? { routingPoints } : {}) };
          }),
        };
        const postEvidence = evaluateMaterialChange(graphBeforeLayout, renderedGraph, {
          observedLatencyMs: performance.now() - layoutStartedAt,
          quality: qualityGraphs(displayBeforeLayout, qualitySceneFromCanvas(nextNodes, nextEdges, canvasGraph.edges)),
        });
        if (hasMaterialQualityRegression(postEvidence) && !shouldEscalateBroadLayout(postEvidence)) {
          throw new Error('Deterministic layout quality failed for a non-broad change');
        }
        if (shouldEscalateBroadLayout(postEvidence)) {
          console.log('Escalating broad restructure after deterministic layout quality failure');
          let fallback;
          try {
            fallback = await layoutNodes(
              result.nodes, result.edges, activeNotation, currentSettings.layout,
              false, currentSettings.font, layoutAbort.signal,
              canvasGraph.constraints,
              'reflow',
              semanticInterpretations,
              canvasGraph as SpatialSidecar028,
              currentSettings.renderStyle028 ?? 'lowfi',
            );
          } catch (error) {
            if ((error as { name?: string }).name === 'AbortError' || !isCurrent()) return;
            if (renderInputRevisionRef028.current !== renderInputRevision028) continue;
            throw error;
          }
          if (!isCurrent()) return;
          if (renderInputRevisionRef028.current !== renderInputRevision028) continue;
          Object.assign(canvasGraph, { labelBounds028: fallback.labelBounds028 });
          nextNodes = fallback.nodes;
          nextEdges = projectEdgesForCanvas(canvasGraph, activeNotation, fallback.edgeRouting,
            currentSettings.font, semanticInterpretations);
          layoutDiagnostics = fallback.diagnostics.map((diagnostic) => ({ ...diagnostic }));
          const fallbackById = new Map(nextNodes.map((node) => [node.id, node]));
          const fallbackGraph: GraphIR = {
            ...canvasGraph,
            nodes: nestCanonicalNodes(result.nodes.map((node) => {
              const rendered = fallbackById.get(node.id);
              return rendered ? {
                ...node,
                position: { ...rendered.position },
                ...(typeof rendered.width === 'number' && typeof rendered.height === 'number'
                  ? { dimensions: { width: rendered.width, height: rendered.height } } : {}),
              } : node;
            })),
            edges: canvasGraph.edges.map((edge) => {
              const routed = fallback.edgeRouting.get(edge.id);
              return routed ? {
                ...edge,
                routingPoints: [routed.startPoint, ...routed.bendPoints, routed.endPoint],
              } : edge;
            }),
          };
          if (hasMaterialQualityRegression(evaluateMaterialChange(graphBeforeLayout, fallbackGraph, {
            quality: qualityGraphs(displayBeforeLayout, qualitySceneFromCanvas(nextNodes, nextEdges, canvasGraph.edges)),
          }))) {
            throw new Error('Full-layout fallback did not restore deterministic layout quality');
          }
          // The text of an opened file with errors is never rewritten.
          if (type === 'coral' && !blockWith && !('sourceGraph' in result && result.sourceGraph)) {
            const authoredFallbackGraph: GraphIR = {
              ...fallbackGraph,
              nodes: nestCanonicalNodes(result.nodes.map((node) => {
                const rendered = fallbackById.get(node.id);
                return rendered ? { ...node, position: { ...rendered.position } } : node;
              })),
              // ELK section endpoints/bends are derived display geometry, not
              // user-authored Coral `via` waypoints. A full quality fallback
              // releases candidate routes and keeps its verified section only
              // in nextEdges; subsequent saves persist no spurious endpoints.
              edges: result.edges.map((edge) => {
                const { routingPoints: _candidateRoute, ...authored } = edge;
                return authored;
              }),
            };
            const printedFallback = printCoralDSLWithDiagnostics(authoredFallbackGraph);
            if (printedFallback.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
              throw new Error('Full-layout fallback could not be represented as Coral source');
            }
            publishedGraph = authoredFallbackGraph;
            publishedText = printedFallback.text;
          }
          // Mermaid cannot author positions. Its verified fallback stays in
          // the accepted display while the provider source remains unchanged.
          fullLayout = true;
        }
      }

      if (!isCurrent()) return;
      if (renderInputRevisionRef028.current !== renderInputRevision028) continue;
      // Geometry work does not own selection. Read the latest UI state at
      // publication, including selections changed while a font pass ran.
      const selectedNodes = new Map(nodesRef.current.map((node) => [node.id, node.selected]));
      nextNodes = nextNodes.map((node) => selectedNodes.has(node.id)
        ? { ...node, selected: selectedNodes.get(node.id) } : node);
      const selectedEdges = new Map(edgesRef.current.map((edge) => [edge.id, edge]));
      nextEdges = nextEdges.map((edge) => {
        const previous = selectedEdges.get(edge.id);
        return previous?.source === edge.source && previous.target === edge.target
          ? { ...edge, selected: previous.selected } : edge;
      });
      const pendingFocus = pendingSourceFocusRef.current;
      if (pendingFocus && pendingFocus.sourceRevision <= sourceRevision) {
        pendingSourceFocusRef.current = null;
        const targets = pendingFocus.kind === 'node' ? nextNodes : nextEdges;
        if (pendingFocus.sourceRevision === sourceRevision && pendingFocus.text === publishedText &&
          targets.some((target) => target.id === pendingFocus.id)) {
          if (pendingFocus.kind === 'edge') {
            nextNodes = nextNodes.map((node) => ({ ...node, selected: false }));
            nextEdges = nextEdges.map((edge) => ({ ...edge, selected: edge.id === pendingFocus.id }));
            handleSelectionChange({ nodes: [], edges: nextEdges.filter((edge) => edge.selected) });
          }
          setCanvasFocusRequest({ kind: pendingFocus.kind, id: pendingFocus.id,
            token: ++canvasFocusTokenRef.current });
        }
      }
      skipNextDiagramSyncRef.current = true;
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      verifiedEdgeRoutesRef.current = verifiedRoutesFromEdges(nextEdges);
      setNodes(nextNodes);
      setEdges(nextEdges);
      const committedProjection = publishedGraph ? projectCanonicalGraph(publishedGraph) : null;
      const committedNodes = committedProjection?.nodes ?? result.nodes;
      const committedEdges = committedProjection?.edges ?? result.edges;
      const nextWaypoints = publishedGraph ? new Map(
        committedEdges
          .filter((edge) => edge.routingPoints?.length)
          .map((edge) => [edge.id, edge.routingPoints!.map((point, index) => ({
            id: `${edge.id}-fallback-${index}`, x: point.x, y: point.y, type: 'corner' as const,
          }))]),
      ) : canonicalInput?.waypoints ?? new Map(
        committedEdges
          .filter((edge) => edge.routingPoints?.length)
          .map((edge) => [edge.id, edge.routingPoints!.map((point, index) => ({
            id: `${edge.id}-dsl-${index}`,
            x: point.x,
            y: point.y,
            type: 'corner' as const,
          }))]),
      );
      waypointManager.setWaypoints(nextWaypoints);
      acceptedDisplayRef.current = {
        nodes: cloneDisplayNodes(nextNodes),
        edges: cloneDisplayEdges(nextEdges),
        waypoints: cloneWaypoints(nextWaypoints),
      };
      if (canonicalInput && textProjectionRef.current?.text === text && textProjectionRef.current.format === type) {
        textProjectionRef.current = { text: publishedText, format: type, notation: activeNotation };
      }
      sourceGraphRef.current = publishedGraph ?? (sequenceDocument
        ? sequenceCanonicalGraph(nextEnvelope, committedNodes, committedEdges)
        : {
            ...nextEnvelope,
            nodes: nestCanonicalNodes(committedNodes),
            edges: committedEdges,
          });
      const resolvedLabelBounds = (canvasGraph as SpatialSidecar028).labelBounds028;
      if (resolvedLabelBounds !== undefined) {
        Object.assign(sourceGraphRef.current, { labelBounds028: resolvedLabelBounds });
      }
      typedRenderInputsRef028.current = JSON.stringify({ style: currentSettings.renderStyle028 ?? 'lowfi',
        font: currentSettings.font, layout: currentSettings.layout });
      commitActiveNotation();
      lastParsedRef.current = { nodes: committedNodes, edges: committedEdges,
        ...(semanticInterpretations ? { semanticInterpretations } : {}),
        ...('coralVersion' in result && result.coralVersion ? { coralVersion: result.coralVersion } : {}),
        ...('sourceGraph' in result && result.sourceGraph
          ? { sourceMeaning028: result.sourceGraph, sourceText028: publishedText } : {}) };
      previousGraphRef.current = {
        nodes: committedNodes.map((node) => ({ id: node.id, type: node.type, label: node.label,
          ...(node.parent ? { parentId: node.parent } : {}) })),
        edges: committedEdges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
      };
      pendingRecoveryPositionsRef.current = null;
      needsFullLayoutRef.current = false;
      if (layoutDiagnostics.length && 'sourceGraph' in result && result.sourceGraph)
        layoutDiagnostics = sourceSpatialFailureDiagnostics028({ diagnostics: layoutDiagnostics }, publishedText).map(editorDiagnostic);
      setParseErrors([...nextErrors, ...layoutDiagnostics]);
      setEditorAnalysis(publishedText === text ? nextAnalysis : {
        ...nextAnalysis,
        source: publishedText,
        decorations: userPreferences.editorEntityHighlighting === true
          ? analyzeEditorSource(publishedText, type, committedNodes, committedEdges) : [],
      });
      setDebugInfo(nextDebugInfo);
      publishOrBlock();
      finishLoading();
      return publishedText === text ? undefined : publishedText;
    }
    } catch (error) {
      finalizeDiagramFailure(error);
      return;
    } finally {
      // Only the source revision that claimed the source-pending owner may
      // retire it. A superseded layout must not unlock a later source edit.
      finishSourceUpdate(sourceRevision);
    }
  }, [captureCurrentGraph, finishSourceUpdate, handleSelectionChange, setNodes, setEdges, waypointManager.setWaypoints,
    userPreferences.editorEntityHighlighting, revisions, updateDocumentSettings, setSourceErrorsLocked]);
  updateDiagramRef.current = updateDiagram;

  // Typed label rectangles are measured in the selected visual style. A font
  // or style change renews their derived publication without changing source/history.
  // The style action claims this synchronously; the effect renews whatever was
  // deferred (loading, a live source owner) or changed elsewhere. Each input set
  // is claimed once, so the two callers never begin twice.
  const renewTypedRenderInputs028 = useCallback(() => {
    const current = documentSettingsRef.current;
    const inputs = JSON.stringify({ style: current.renderStyle028 ?? 'lowfi', font: current.font, layout: current.layout });
    if (inputs === typedRenderInputsRef028.current || loadingRef.current || sourceUpdateOwnerRef.current !== null ||
      structuralLayoutPendingRef.current !== null || unparsedUserTextRef.current !== null ||
      dslTypeRef.current !== 'coral' || lastParsedRef.current.sourceText028 !== dslRef.current ||
      !(sourceGraphRef.current as SpatialSidecar028).spatialConstraints028?.length) return;
    // The exact accepted source can be retried in a changed visual context
    // after a measurement failure. Unaccepted source drafts remain excluded.
    typedRenderInputsRef028.current = inputs;
    const owner = revisions.beginSource().sourceRevision;
    beginPassiveVisual(owner);
    void updateDiagramRef.current(dslRef.current, 'coral', current.notation as NotationType, [], undefined, 'full')
      .finally(() => finishPassiveVisual(owner));
  }, [beginPassiveVisual, finishPassiveVisual, revisions]);
  renewTypedRenderInputsRef028.current = renewTypedRenderInputs028;
  useEffect(() => {
    renewTypedRenderInputs028();
  }, [documentSettings.font, documentSettings.layout, renderStyle028, loading, dsl, renewTypedRenderInputs028]);

  // Switch DSL type - convert existing diagram when possible
  const handleDslTypeChange = useCallback((newType: DSLType) => {
    if (llmChat.isMutationPending) {
      setGuidanceAnnouncement(AI_MUTATION_LOCK_MESSAGE);
      return;
    }
    if (refuseDuringUpdate('edit') !== null) return;
    if (dslType === 'dot' || dslType === 'plantuml' || (dslType === 'mermaid' && mermaidFileSource)) {
      const label = dslType === 'dot' ? 'DOT' : dslType === 'plantuml' ? 'PlantUML' : 'Mermaid';
      setGuidanceAnnouncement(`Preserve the ${label} source; format switching requires an explicit verified conversion.`);
      return;
    }
    // Converting would print the recovered graph over the unreadable text.
    if (sourceErrorsLockedRef.current) {
      setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
      return;
    }
    let newDsl: string;

    const currentProjection = captureCanonicalProjection();
    const graph: GraphIR = {
      ...sourceGraphRef.current,
      nodes: nestCanonicalNodes(currentProjection.nodes),
      edges: currentProjection.edges,
    };

    if (newType === 'coral' && dslType === 'mermaid' && nodes.length > 0) {
      // Mermaid's inferred handles are not authored semantic ports. Keep the
      // edge and its route, but do not print references the U1 interpretation
      // cannot resolve in the active notation.
      const retargeted = dropUnresolvedEdgePorts(currentProjection.nodes, graph.edges, notation);
      const converted = printInstalledSource028({ ...graph, edges: retargeted.edges }, notation);
      if (!converted.text || converted.diagnostics.some((item) => item.severity === 'error')) {
        const reason = converted.diagnostics.find((item) => item.severity === 'error')?.message ??
          'The installed writer could not verify the conversion.';
        setGuidanceAnnouncement(`This diagram cannot be converted to 0.2.8 Coral without losing meaning: ${reason}`);
        return;
      }
      newDsl = converted.text;
      formatSwitchDiagnosticsRef.current = converted.diagnostics.map(editorDiagnostic);
      if (retargeted.dropped) {
        const message = `Removed ${retargeted.dropped} inferred connector port ${retargeted.dropped === 1 ? 'reference' : 'references'} during Coral conversion; connectors and routes remain.`;
        formatSwitchDiagnosticsRef.current.push({ severity: 'warning', code: 'coral.convert.port-reference.dropped', message });
        setGuidanceAnnouncement(message);
      }
    } else if (newType === 'mermaid' && dslType === 'coral' && nodes.length > 0) {
      const converted = convertToMermaidDslWithDiagnostics(graph);
      newDsl = converted.text;
      formatSwitchDiagnosticsRef.current = converted.diagnostics.map((message) => ({ severity: 'warning', message }));
    } else {
      // Preserve unparseable/empty input; a format switch must never inject demo content.
      newDsl = dsl;
      formatSwitchDiagnosticsRef.current = [];
    }
    replacementNeedsConfirmationRef.current = true;
    acceptTextSource();
    cancelActiveGesture();
    invalidateEditIntent();
    revisions.beginSource();
    pushContentHistory(captureCurrentGraph(), waypointMapRef.current);
    setFormatSwitchDiagnostics(formatSwitchDiagnosticsRef.current);

    setNodes([]);
    setEdges([]);
    setMermaidFileSource(false);
    graphIRPreviewSourceRef.current = null;
    setDslType(newType);
    setDsl(newDsl);
    needsFullLayoutRef.current = true;
    previousGraphRef.current = { nodes: [], edges: [] };
    setFormatSwitchPending(true);
  }, [captureCurrentGraph, invalidateEditIntent, llmChat.isMutationPending, pushContentHistory, refuseDuringUpdate, revisions,
    setNodes, setEdges, dsl, dslType, mermaidFileSource, nodes, notation, captureCanonicalProjection]);

  // Switch notation - re-render with new symbols
  const handleNotationChange = useCallback((newNotation: NotationType) => {
    if (refuseDuringUpdate(isAuthored028Source(dslRef.current) ? 'source-edit' : 'edit') !== null) return;
    replacementNeedsConfirmationRef.current = true;
    handleDocumentSettingsChange({
      ...documentSettingsRef.current,
      notation: newNotation,
    });
  }, [handleDocumentSettingsChange, refuseDuringUpdate]);

  // Track edge being reconnected for visual feedback
  const edgeReconnectSuccessful = useRef(true);

  // Handle edge reconnection start - dim the edge
  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  // Handle edge reconnection - update the edge with new connection
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (structuralLayoutPendingRef.current !== null) return;
      edgeReconnectSuccessful.current = true;
      const currentEdge = edgesRef.current.find((edge) => edge.id === oldEdge.id);
      if (!currentEdge) return;
      if (currentEdge.source === newConnection.source && currentEdge.target === newConnection.target
        && (currentEdge.sourceHandle ?? null) === (newConnection.sourceHandle ?? null)
        && (currentEdge.targetHandle ?? null) === (newConnection.targetHandle ?? null)) return;
      cancelActiveGesture();
      pushContentHistory(captureCurrentGraph(), waypointMapRef.current);
      invalidateEditIntent();
      waypointManager.clearWaypoints(currentEdge.id);
      // Reconnect from canonical state, never the callback's enhanced route preview.
      const { routedPath: _route, waypoints: _waypoints, routingPoints: _points, ...data } = currentEdge.data ?? {};
      const nextEdges = reconnectEdge({ ...currentEdge, data }, newConnection, edgesRef.current);
      setEdges(nextEdges);
      syncDiagramToText(nextEdges);
    },
    [captureCurrentGraph, invalidateEditIntent, pushContentHistory, setEdges, syncDiagramToText, waypointManager]
  );

  // Handle edge reconnection end - remove edge if dropped in empty space
  const onReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) {
        // Edge was dropped in empty space - optionally remove it
        // For now, we'll keep it (user can press Delete to remove)
        console.log('Edge reconnection cancelled for edge:', edge.id);
      }
      edgeReconnectSuccessful.current = true;
    },
    []
  );

  // Reflow: re-run ELK layout on current nodes
  const handleReflow = useCallback(async () => {
    // Availability follows the owner that actually holds the pending
    // publication; a retired passive revision no longer refuses Reflow.
    if (refuseDuringUpdate('reflow') !== null) return;
    if (isSequenceGraph(sourceGraphRef.current)) {
      setDebugInfo('A sequence diagram is laid out by participant and message order; there is nothing to reflow.');
      return;
    }
    if (sourceErrorsLockedRef.current) {
      setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
      return;
    }
    if (dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current)) {
      const source = dslRef.current;
      if (unparsedUserTextRef.current !== null ||
        lastParsedRef.current.sourceText028 !== source ||
        !lastParsedRef.current.sourceMeaning028) {
        setGuidanceAnnouncement('Finish the current Coral source update before Reflow.');
        return;
      }
      if (lastParsedRef.current.nodes.length === 0) return;
      cancelActiveGesture();
      setIsReflowing(true);
      try {
        // Re-run the accepted source through the normal revision-checked full
        // layout path. Reflow changes only derived display geometry: the
        // authored text, source revision, and source Undo stack stay intact.
        await updateDiagramRef.current(source, 'coral', notation, [], undefined, 'full');
      } finally {
        setIsReflowing(false);
      }
      return;
    }
    cancelActiveGesture();
    // A Reflow with nothing to lay out does not run, so it dirties nothing.
    if (lastParsedRef.current.nodes.length === 0) return;
    replacementNeedsConfirmationRef.current = true;
    invalidateEditIntent();
    const layoutAbort = new AbortController();
    activeLayoutAbortRef.current = layoutAbort;
    const revision = revisions.beginLayout('reflow');
    setIsReflowing(true);
    const parsed = lastParsedRef.current;
    const beforeNodes = nodesRef.current;
    const beforeWaypoints = new Map(waypointMapRef.current);
    const authoredRouteEdgeIds = new Set(sourceGraphRef.current.edges
      .filter((edge) => edge.routeIntent !== undefined)
      .map((edge) => edge.id));
    const reflowWaypoints = new Map([...beforeWaypoints]
      .filter(([edgeId]) => authoredRouteEdgeIds.has(edgeId)));
    for (;;) {
      const renderInputRevision028 = renderInputRevisionRef028.current;
      const currentSettings = documentSettingsRef.current;
      let layoutResult;
      try {
        layoutResult = await layoutNodes(
          parsed.nodes,
          parsed.edges,
          notation,
          currentSettings.layout,
          false,
          currentSettings.font,
          layoutAbort.signal,
          sourceGraphRef.current.constraints,
          'reflow',
          parsed.semanticInterpretations,
          sourceGraphRef.current as SpatialSidecar028,
          currentSettings.renderStyle028 ?? 'lowfi',
        );
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError' || !revisions.isCurrent(revision)) return;
        if (renderInputRevisionRef028.current !== renderInputRevision028) continue;
        setParseErrors((current) => [...current, { line: 0, message: 'Reflow failed; existing geometry was retained.' }]);
        if (activeLayoutAbortRef.current === layoutAbort) activeLayoutAbortRef.current = null;
        if (revisions.finish('reflow', revision)) setIsReflowing(false);
        return;
      }
      if (!revisions.isCurrent(revision)) return;
      if (renderInputRevisionRef028.current !== renderInputRevision028) continue;

      if (layoutResult.diagnostics.length) {
        setParseErrors((current) => [...current, ...layoutResult.diagnostics.map((diagnostic) => ({ ...diagnostic }))]);
      }

      if (beforeNodes.length > 0) {
        pushContentHistory(structuredClone(sourceGraphRef.current), beforeWaypoints, {
          publication: revisions.publicationEnvelope(),
          parsed: structuredClone(lastParsedRef.current),
          displayNodes: cloneDisplayNodes(beforeNodes),
          displayEdges: cloneDisplayEdges(edgesRef.current),
          settings: structuredClone(documentSettingsRef.current),
        });
        waypointManager.setWaypoints(cloneWaypoints(reflowWaypoints));
        nodesRef.current = layoutResult.nodes;
        const reflowEdges = projectEdgesForCanvas({
          ...sourceGraphRef.current,
          nodes: nestCanonicalNodes(parsed.nodes),
          edges: parsed.edges,
        }, notation, layoutResult.edgeRouting, currentSettings.font, parsed.semanticInterpretations);
        edgesRef.current = reflowEdges;
        verifiedEdgeRoutesRef.current = verifiedRoutesFromEdges(reflowEdges);
        acceptedDisplayRef.current = {
          nodes: cloneDisplayNodes(layoutResult.nodes),
          edges: cloneDisplayEdges(reflowEdges),
          waypoints: cloneWaypoints(reflowWaypoints),
        };
        setNodes(layoutResult.nodes);
        setEdges(reflowEdges);
      } else {
        waypointManager.setWaypoints(cloneWaypoints(reflowWaypoints));
        const reflowEdges = projectEdgesForCanvas({
          ...sourceGraphRef.current,
          nodes: nestCanonicalNodes(parsed.nodes),
          edges: parsed.edges,
        }, notation, layoutResult.edgeRouting, currentSettings.font, parsed.semanticInterpretations);
        nodesRef.current = layoutResult.nodes;
        edgesRef.current = reflowEdges;
        verifiedEdgeRoutesRef.current = verifiedRoutesFromEdges(reflowEdges);
        acceptedDisplayRef.current = {
          nodes: cloneDisplayNodes(layoutResult.nodes),
          edges: cloneDisplayEdges(reflowEdges),
          waypoints: cloneWaypoints(reflowWaypoints),
        };
        setNodes(layoutResult.nodes);
        setEdges(reflowEdges);
      }
      // A candidate generated from pre-Reflow geometry is now stale (R-054 AC-1).
      invalidateLlmIntent({ abortGeneration: false });
      if (revisions.finish('reflow', revision)) {
        const publication = revisions.publicationEnvelope();
        if (publication.status === 'pending') {
          revisions.publishSource(publication.sourceRevision);
          retirePassiveVisual();
        }
        setIsReflowing(false);
      }
      if (activeLayoutAbortRef.current === layoutAbort) activeLayoutAbortRef.current = null;
      return;
    }
  }, [invalidateEditIntent, invalidateLlmIntent, notation, pushContentHistory, refuseDuringUpdate, retirePassiveVisual, setNodes,
    setEdges, waypointManager, revisions]);

  const handleApplyFont = useCallback((settings: typeof fontDraft) => {
    if (llmChat.isMutationPending || refuseDuringUpdate('source-gesture') !== null) return;
    if ((dslTypeRef.current === 'mermaid' && mermaidFileSource) || dslTypeRef.current === 'dot' ||
        dslTypeRef.current === 'plantuml') {
      setGuidanceAnnouncement('Edit the imported source text to change this diagram.');
      return;
    }
    if (sourceErrorsLockedRef.current) {
      setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
      return;
    }
    replacementNeedsConfirmationRef.current = true;
    invalidateLlmIntent();
    verifiedEdgeRoutesRef.current = new Map();
    claimSpatialEditPublication();
    const previousSettings = documentSettingsRef.current;
    pushContentHistory(captureCurrentGraph(), waypointMapRef.current, { settings: previousSettings });
    documentSettingsRef.current = { ...previousSettings, font: settings };
    updateDocumentSettings(documentSettingsRef.current);
    renderInputRevisionRef028.current += 1;

    const projected = projectDiagramNodes(
      lastParsedRef.current.nodes,
      notation,
      settings,
      documentSettingsRef.current.layout.sizingMode ?? 'adaptive',
      (sourceGraphRef.current as SpatialSidecar028).layoutOptions028?.direction ??
        resolveNotationLayout(notation, documentSettingsRef.current.layout).settings.direction,
      lastParsedRef.current.semanticInterpretations,
    );
    const projectedById = new Map(projected.map((node) => [node.id, node]));
    const updatedNodes = nodesRef.current.map((node) => {
      const next = projectedById.get(node.id);
      return next ? { ...node, width: next.width, height: next.height,
        data: mergeProjectedNodeData(node.data, next.data) } : node;
    });
    nodesRef.current = updatedNodes;
    setNodes(updatedNodes);

    const currentEdges = edgesRef.current;
    const graphById = new Map(lastParsedRef.current.edges.map((edge) => [edge.id, edge]));
    const graphEdges = currentEdges.map((edge): GraphEdge => graphById.get(edge.id) ?? ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: typeof edge.label === 'string' ? edge.label : undefined,
      sourcePort: edge.sourceHandle ?? undefined,
      targetPort: edge.targetHandle ?? undefined,
    }));
    const fontEdges = new Map(convertEdges(graphEdges, undefined, settings)
      .map((edge) => [edge.id, edge]));
    const updated = currentEdges.map((edge) => {
      const fontEdge = fontEdges.get(edge.id);
      if (!fontEdge) return edge;
      const data = {
        ...edge.data,
        canonical: edge.data?.canonical ?? fontEdge.data?.canonical,
      };
      (data as Record<PropertyKey, unknown>)[CORAL_EDGE_VIEW_METADATA]
        = projectedMetadata(fontEdge.data, CORAL_EDGE_VIEW_METADATA);
      return { ...edge, labelStyle: fontEdge.labelStyle, data };
    });
    edgesRef.current = updated;
    setEdges(updated);
    // Fonts change measured bodies, labels, contacts, and obstacle envelopes.
    // Keep this revision pending until the shared layout pipeline verifies
    // current geometry, including relative and coincident authored waypoints.
    let publication = revisions.publicationEnvelope();
    if (publication.status !== 'pending') {
      publication = revisions.beginSource();
      beginPassiveVisual(publication.sourceRevision);
    }
    const owner = publication.sourceRevision;
    visualResolutionInFlightRef.current = owner;
    const sourceOwned = dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current);
    const canonicalInput = sourceOwned ? undefined : (() => {
      const captured = captureCurrentGraph();
      const durable = new Set(sourceGraphRef.current.edges.filter((edge) => edge.routeIntent)
        .map((edge) => edge.id));
      for (const id of Object.keys((sourceGraphRef.current as SpatialSidecar028).routeIntents028 ?? {})) {
        durable.add(id);
      }
      // Persistence can promote transient handles into portable route intent.
      // Font resolution keeps their editor routing policy and exact map apart
      // from source-owned joins, which the shared resolver must retain.
      const edges = captured.edges.map((edge) => {
        if (durable.has(edge.id) || !waypointMapRef.current.has(edge.id)) return edge;
        const generated = { ...edge };
        delete generated.routeIntent;
        return generated;
      });
      return { ...projectCanonicalGraph({ ...captured, edges }),
        waypoints: cloneWaypoints(waypointMapRef.current) };
    })();
    void updateDiagramRef.current(dslRef.current, dslTypeRef.current, notation, [], canonicalInput, 'full')
      .finally(() => finishPassiveVisual(owner));
  }, [captureCurrentGraph, claimSpatialEditPublication, finishPassiveVisual, beginPassiveVisual, invalidateLlmIntent,
    llmChat.isMutationPending, mermaidFileSource, notation, pushContentHistory, refuseDuringUpdate,
    revisions, setNodes, setEdges, updateDocumentSettings]);

  const restartPendingHistorySource = useCallback((entry: DslHistoryEntry) => {
    if (entry.graphIRPreviewSource || entry.publication.status !== 'pending') return;
    // A pending snapshot has text but no published display for that text.
    // History cancels its old layout, so reparsing under a new revision is the
    // only way to make the restored document current without accepting a late
    // completion from the canceled request.
    unparsedUserTextRef.current = entry.dsl;
    const sourceRevision = revisions.beginSource().sourceRevision;
    beginSourceUpdate(sourceRevision);
    Promise.resolve().then(() => {
      if (revisions.currentSourceRevision() !== sourceRevision) return;
      void updateDiagramRef.current(entry.dsl, entry.dslType as DSLType,
        documentSettingsRef.current.notation as NotationType);
    });
  }, [beginSourceUpdate, revisions]);

  // Undo: DSL changes first (LLM), then layout positions (CORAL-REQ-013)
  const handleUndo = useCallback(() => {
    if (isAuthored028Source(dslRef.current)) {
      if (dslUndoStack.current.length === 0) {
        setGuidanceAnnouncement(SOURCE_028_CANVAS_LOCK_MESSAGE);
        return;
      }
      if (refuseDuringUpdate('source-edit') !== null) return;
    } else if (refuseDuringUpdate('edit') !== null) return;
    sourceEditSessionRef.current = false;
    cancelActiveGesture();
    invalidateEditIntent();
    const contentSequence = dslUndoStack.current[dslUndoStack.current.length - 1]?.sequence ?? -1;
    const geometrySequence = undoSequence ?? -1;
    if (dslUndoStack.current.length > 0 && contentSequence >= geometrySequence) {
      // Only an Undo that restores something changes the work (TR94-C6-F3).
      replacementNeedsConfirmationRef.current = true;
      if (sourceUpdateOwnerRef.current !== null) finishSourceUpdate(sourceUpdateOwnerRef.current);
      acceptTextSource();
      const prev = dslUndoStack.current.pop()!;
      setActivityEntries((entries) => entries.map((entry) => entry.transactionSequence === prev.sequence
        ? { ...entry, status: 'reverted' as const } : entry));
      dslRedoStack.current.push({
        sequence: prev.sequence,
        dsl,
        dslType,
        graphIRPreviewSource: graphIRPreviewSourceRef.current === dslRef.current,
        sourceErrorsLocked: sourceErrorsLockedRef.current,
        graph: structuredClone(sourceGraphRef.current),
        waypoints: cloneWaypoints(waypointMapRef.current),
        diagnostics: formatSwitchDiagnostics.map((diagnostic) => ({ ...diagnostic })),
        publication: revisions.publicationEnvelope(),
        parsed: structuredClone(lastParsedRef.current),
        displayNodes: cloneDisplayNodes(nodesRef.current),
        displayEdges: cloneDisplayEdges(edgesRef.current),
        parseErrors: structuredClone(parseErrors),
        editorAnalysis: structuredClone(editorAnalysis),
        debugInfo,
        settings: structuredClone(documentSettingsRef.current),
      });
      setDslUndoCount(dslUndoStack.current.length);
      setDslRedoCount(dslRedoStack.current.length);

      isInternalDslUpdateRef.current = true;
      if (prev.graph) {
        sourceGraphRef.current = structuredClone(prev.graph);
      }
      lastParsedRef.current = structuredClone(prev.parsed);
      const restoredNodes = cloneDisplayNodes(prev.displayNodes);
      const restoredEdges = cloneDisplayEdges(prev.displayEdges);
      nodesRef.current = restoredNodes;
      edgesRef.current = restoredEdges;
      verifiedEdgeRoutesRef.current = verifiedRoutesFromEdges(restoredEdges);
      acceptedDisplayRef.current = {
        nodes: cloneDisplayNodes(restoredNodes),
        edges: cloneDisplayEdges(restoredEdges),
        waypoints: cloneWaypoints(prev.waypoints ?? new Map()),
      };
      setNodes(restoredNodes);
      setEdges(restoredEdges);
      if (prev.waypoints) waypointManager.setWaypoints(cloneWaypoints(prev.waypoints));
      const restoredDiagnostics = (prev.diagnostics ?? []).map((diagnostic) => ({ ...diagnostic }));
      formatSwitchDiagnosticsRef.current = restoredDiagnostics;
      setFormatSwitchDiagnostics(restoredDiagnostics);
      setDslType(prev.dslType as DSLType);
      revisions.restorePublication(prev.publication);
      graphIRPreviewSourceRef.current = prev.graphIRPreviewSource ? prev.dsl : null;
      const restoredSource = prev.graphIRPreviewSource
        ? { locked: prev.sourceErrorsLocked ?? false,
          parseErrors: structuredClone(prev.parseErrors),
          analysis: structuredClone(prev.editorAnalysis) }
        : restoredHistorySourceState(prev);
      setSourceErrorsLocked(restoredSource.locked);
      setParseErrors(restoredSource.parseErrors);
      setEditorAnalysis(restoredSource.analysis);
      setDebugInfo(prev.debugInfo);
      if (prev.settings) {
        documentSettingsRef.current = structuredClone(prev.settings);
        updateDocumentSettings(documentSettingsRef.current);
        setNotation(documentSettingsRef.current.notation as NotationType);
      }
      setDsl(prev.dsl);
      setFormatSwitchPending(false);
      restartPendingHistorySource(prev);
      // The inspector follows the restored selection, whose IDs may differ (renumbered connectors).
      if (planSequencesRef.current.has(prev.sequence)) {
        handleSelectionChange({ nodes: restoredNodes.filter((node) => node.selected), edges: restoredEdges.filter((edge) => edge.selected) });
      }

      setTimeout(() => {
        isInternalDslUpdateRef.current = false;
      }, INTERNAL_TEXT_GUARD_MS);
      return;
    }

    // Fall through to position undo
    const result = undo();
    if (result) {
      replacementNeedsConfirmationRef.current = true;
      isUndoRedoRef.current = true;
      setNodes((currentNodes) => {
        const restored = currentNodes.map((node) => {
          const pos = result.positions.get(node.id);
          return pos ? { ...node, position: pos } : node;
        });
        nodesRef.current = restored;
        return restored;
      });
      // Restore waypoint state (CORAL-REQ-015)
      if (result.waypoints) {
        waypointManager.setWaypoints(result.waypoints);
      }
      Promise.resolve().then(() => {
        isUndoRedoRef.current = false;
        syncDiagramToText();
      });
    }
  }, [debugInfo, editorAnalysis, finishSourceUpdate, invalidateEditIntent, parseErrors, refuseDuringUpdate, restartPendingHistorySource, revisions, syncDiagramToText,
    undo, undoSequence, setNodes, dsl, dslType, formatSwitchDiagnostics, updateDocumentSettings,
    waypointManager]);

  // Redo: DSL changes first (LLM), then layout positions (CORAL-REQ-013)
  const handleRedo = useCallback(() => {
    if (isAuthored028Source(dslRef.current)) {
      if (dslRedoStack.current.length === 0) {
        setGuidanceAnnouncement(SOURCE_028_CANVAS_LOCK_MESSAGE);
        return;
      }
      if (refuseDuringUpdate('source-edit') !== null) return;
    } else if (refuseDuringUpdate('edit') !== null) return;
    sourceEditSessionRef.current = false;
    cancelActiveGesture();
    invalidateEditIntent();
    const contentSequence = dslRedoStack.current[dslRedoStack.current.length - 1]?.sequence ?? -1;
    const geometrySequence = redoSequence ?? Number.POSITIVE_INFINITY;
    if (dslRedoStack.current.length > 0 && contentSequence <= geometrySequence) {
      replacementNeedsConfirmationRef.current = true;
      if (sourceUpdateOwnerRef.current !== null) finishSourceUpdate(sourceUpdateOwnerRef.current);
      acceptTextSource();
      const next = dslRedoStack.current.pop()!;
      setActivityEntries((entries) => entries.map((entry) => entry.transactionSequence === next.sequence
        ? { ...entry, status: 'reapplied' as const } : entry));
      dslUndoStack.current.push({
        sequence: next.sequence,
        dsl,
        dslType,
        graphIRPreviewSource: graphIRPreviewSourceRef.current === dslRef.current,
        sourceErrorsLocked: sourceErrorsLockedRef.current,
        graph: structuredClone(sourceGraphRef.current),
        waypoints: cloneWaypoints(waypointMapRef.current),
        diagnostics: formatSwitchDiagnostics.map((diagnostic) => ({ ...diagnostic })),
        publication: revisions.publicationEnvelope(),
        parsed: structuredClone(lastParsedRef.current),
        displayNodes: cloneDisplayNodes(nodesRef.current),
        displayEdges: cloneDisplayEdges(edgesRef.current),
        parseErrors: structuredClone(parseErrors),
        editorAnalysis: structuredClone(editorAnalysis),
        debugInfo,
        settings: structuredClone(documentSettingsRef.current),
      });
      setDslUndoCount(dslUndoStack.current.length);
      setDslRedoCount(dslRedoStack.current.length);

      isInternalDslUpdateRef.current = true;
      if (next.graph) {
        sourceGraphRef.current = structuredClone(next.graph);
      }
      lastParsedRef.current = structuredClone(next.parsed);
      const restoredNodes = cloneDisplayNodes(next.displayNodes);
      const restoredEdges = cloneDisplayEdges(next.displayEdges);
      nodesRef.current = restoredNodes;
      edgesRef.current = restoredEdges;
      verifiedEdgeRoutesRef.current = verifiedRoutesFromEdges(restoredEdges);
      acceptedDisplayRef.current = {
        nodes: cloneDisplayNodes(restoredNodes),
        edges: cloneDisplayEdges(restoredEdges),
        waypoints: cloneWaypoints(next.waypoints ?? new Map()),
      };
      setNodes(restoredNodes);
      setEdges(restoredEdges);
      if (next.waypoints) waypointManager.setWaypoints(cloneWaypoints(next.waypoints));
      const restoredDiagnostics = (next.diagnostics ?? []).map((diagnostic) => ({ ...diagnostic }));
      formatSwitchDiagnosticsRef.current = restoredDiagnostics;
      setFormatSwitchDiagnostics(restoredDiagnostics);
      setDslType(next.dslType as DSLType);
      revisions.restorePublication(next.publication);
      graphIRPreviewSourceRef.current = next.graphIRPreviewSource ? next.dsl : null;
      const restoredSource = next.graphIRPreviewSource
        ? { locked: next.sourceErrorsLocked ?? false,
          parseErrors: structuredClone(next.parseErrors),
          analysis: structuredClone(next.editorAnalysis) }
        : restoredHistorySourceState(next);
      setSourceErrorsLocked(restoredSource.locked);
      setParseErrors(restoredSource.parseErrors);
      setEditorAnalysis(restoredSource.analysis);
      setDebugInfo(next.debugInfo);
      if (next.settings) {
        documentSettingsRef.current = structuredClone(next.settings);
        updateDocumentSettings(documentSettingsRef.current);
        setNotation(documentSettingsRef.current.notation as NotationType);
      }
      setDsl(next.dsl);
      setFormatSwitchPending(false);
      restartPendingHistorySource(next);
      if (planSequencesRef.current.has(next.sequence)) {
        handleSelectionChange({ nodes: restoredNodes.filter((node) => node.selected), edges: restoredEdges.filter((edge) => edge.selected) });
      }

      setTimeout(() => {
        isInternalDslUpdateRef.current = false;
      }, INTERNAL_TEXT_GUARD_MS);
      return;
    }

    // Fall through to position redo
    const result = redo();
    if (result) {
      replacementNeedsConfirmationRef.current = true;
      isUndoRedoRef.current = true;
      setNodes((currentNodes) => {
        const restored = currentNodes.map((node) => {
          const pos = result.positions.get(node.id);
          return pos ? { ...node, position: pos } : node;
        });
        nodesRef.current = restored;
        return restored;
      });
      // Restore waypoint state (CORAL-REQ-015)
      if (result.waypoints) {
        waypointManager.setWaypoints(result.waypoints);
      }
      Promise.resolve().then(() => {
        isUndoRedoRef.current = false;
        syncDiagramToText();
      });
    }
  }, [debugInfo, editorAnalysis, finishSourceUpdate, invalidateEditIntent, parseErrors, refuseDuringUpdate, restartPendingHistorySource, revisions, syncDiagramToText,
    redo, redoSequence, setNodes, dsl, dslType, formatSwitchDiagnostics, updateDocumentSettings,
    waypointManager]);

  // Get current document for saving
  const handleGetDocument = useCallback((): CoralDocument => {
    // Convert React Flow nodes/edges to Coral format
    const coralNodes = nodes as CoralNode[];
    const sequenceDocument = isSequenceGraph(sourceGraphRef.current);
    const canonicalGraph = sequenceDocument ? captureCurrentGraph() : withCanonicalEdgeStyles(captureCurrentGraph());
    // A sequence graph carries only closed-list fields: no derived styles or ports.
    const currentGraph = sequenceDocument ? canonicalGraph : materializeReferencedPorts(canonicalGraph, symbolProvidedPorts({ settings: {
      ...documentSettings,
      notation,
    } })).graph;
    const canonicalEdges = new Map(currentGraph.edges.map((edge) => [edge.id, edge]));
    const coralEdges = edges.map((edge) => ({
      ...edge,
      sourceHandle: canonicalEdges.get(edge.id)?.sourcePort,
      targetHandle: canonicalEdges.get(edge.id)?.targetPort,
      data: { ...edge.data,
        routingPoints: waypointMapRef.current.get(edge.id)?.map(({ x, y }) => ({ x, y })),
      },
    })) as CoralEdge[];

    return serialize(coralNodes, coralEdges, {
      name: documentName,
      description: sourceDocumentMetadataRef.current?.description,
      tags: sourceDocumentMetadataRef.current?.tags,
      version: sourceDocumentMetadataRef.current?.version,
      created: sourceDocumentMetadataRef.current?.created,
      graphIR: currentGraph,
      settings: {
        ...documentSettings,
        notation,
      },
    }, waypointMapRef.current);
  }, [nodes, edges, documentName, notation, documentSettings, captureCurrentGraph]);

  const commitPreparedDocument = useCallback((prepared: PreparedDocumentReplacement, textOpen?: TextOpen) => {
    cancelActiveGesture();
    invalidateEditIntent();
    // Only an open-claimed owner can be live here (updateRefusal admits no
    // other); the replacement supersedes it, and its aborted layout's late
    // finally is an owner-matched no-op.
    if (sourceUpdateOwnerRef.current !== null) finishSourceUpdate(sourceUpdateOwnerRef.current);
    openClaimedOwnerRef.current = null;
    isLoadingDocumentRef.current = true;
    acceptTextSource();
    clearHistory();
    clearDslHistory();
    transcriptWriteGenerationRef.current += 1;
    transcriptArchiveRef.current = null;
    setAssociatedTranscriptId(null);
    clearConversationRef.current();
    documentKeyRef.current += 1;
    sourceGraphRef.current = prepared.graph;
    sourceDocumentMetadataRef.current = prepared.doc.metadata;
    setDocumentName(prepared.doc.metadata.name);
    setNotation(prepared.notation);
    documentSettingsRef.current = prepared.result.settings;
    renderInputRevisionRef028.current += 1;
    updateDocumentSettings(prepared.result.settings);
    setNodes(prepared.nodes);
    setEdges(prepared.edges);
    nodesRef.current = prepared.nodes;
    edgesRef.current = prepared.edges;
    verifiedEdgeRoutesRef.current = new Map();
    lastParsedRef.current = { nodes: prepared.graphNodes, edges: prepared.graphEdges };
    previousGraphRef.current = {
      nodes: prepared.graphNodes.map((node) => ({ id: node.id, type: node.type, label: node.label,
        ...(node.parent ? { parentId: node.parent } : {}) })),
      edges: prepared.graphEdges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    };
    needsFullLayoutRef.current = true;
    const sourceFormat: DSLType = textOpen?.format ?? 'coral';
    const source = textOpen?.text ?? prepared.source;
    graphIRPreviewSourceRef.current = !textOpen && prepared.doc.content.format === 'graph-ir'
      ? source : null;
    revisions.beginSource();
    // Export is never current for an opened file with errors, even while its
    // recovered graph is still being laid out.
    setRecoveredGraph(Boolean(textOpen?.blockWith));
    if (textOpen?.blockWith) {
      revisions.blockSource(revisions.currentSourceRevision(), textOpen.blockWith);
      setSourceErrorsLocked(true);
    } else if (textOpen) {
      // Opened text is only source until its parse publishes (TR94-C3-F1): the
      // shell display cannot stand for it. The publication stays pending, so
      // export is blocked; Save and autosave write the exact draft; and the
      // source owner refuses canvas mutation until updateDiagram retires it.
      setSourceErrorsLocked(false);
      beginSourceUpdate(revisions.currentSourceRevision());
      openClaimedOwnerRef.current = revisions.currentSourceRevision();
    } else {
      revisions.publishSource(revisions.currentSourceRevision());
      setSourceErrorsLocked(false);
    }
    unparsedUserTextRef.current = textOpen && !textOpen.blockWith ? source : null;
    // Every replacement owns the recovery positions: a preempted or failed
    // draft layout must not move the next document's nodes (TR94-C5-F1).
    pendingRecoveryPositionsRef.current = textOpen?.positions ?? null;
    // Nor may the replaced document's drags make the next one's nodes exact
    // (CR94-C3-F2). Besides the print-back that consumes them, only a
    // replacement clears them; a text edit keeps them.
    pendingExactNodeIdsRef.current.clear();
    // Nor may its accepted display return during the next document's passive
    // resolution (CR94-C4-F1). A GraphIR open is displayed at once, so that
    // display is accepted; a text open's shell is not, so none is until its
    // layout commits, and the resolution keeps the current canvas.
    acceptedDisplayRef.current = textOpen ? null : {
      nodes: cloneDisplayNodes(prepared.nodes),
      edges: cloneDisplayEdges(prepared.edges),
      waypoints: cloneWaypoints(prepared.waypoints),
    };
    // Edit sessions belong to the replaced document; the next edit starts a
    // new one with its own history entry (CR94-C4-F2).
    sourceEditSessionRef.current = false;
    propertyEditSessionRef.current = null;
    if (textOpen) {
      sourceGraphRef.current = { ...textOpen.envelope, nodes: [], edges: [] } as GraphIR;
    }
    textProjectionRef.current = { text: source, format: sourceFormat, notation: prepared.notation };
    setMermaidFileSource(sourceFormat === 'mermaid' && Boolean(textOpen));
    setDslType(sourceFormat);
    setDsl(source);
    formatSwitchDiagnosticsRef.current = prepared.sourceDiagnostics;
    setFormatSwitchDiagnostics(prepared.sourceDiagnostics);
    waypointManager.setWaypoints(prepared.waypoints);
    setDebugInfo(`Loaded: ${prepared.result.nodes.length} nodes, ${prepared.result.edges.length} edges`);
    void updateDiagramRef.current(
      source,
      sourceFormat,
      prepared.notation,
      textOpen ? textOpen.diagnostics : prepared.sourceDiagnostics,
      textOpen ? { ...textOpen.canonicalInput, waypoints: new Map() } : {
        ...projectCanonicalGraph(prepared.graph),
        waypoints: cloneWaypoints(prepared.waypoints),
      },
      'full',
      textOpen?.blockWith,
    ).catch((error) => {
      setParseErrors((current) => [...current, {
        line: 0,
        message: `Loaded document layout failed: ${error instanceof Error ? error.message : String(error)}`,
      }]);
    });
    setTimeout(() => { isLoadingDocumentRef.current = false; }, DOCUMENT_LOAD_GUARD_MS);
  }, [acceptTextSource, beginSourceUpdate, cancelActiveGesture, clearDslHistory, clearHistory, finishSourceUpdate,
    invalidateEditIntent, revisions, setEdges, setNodes, updateDocumentSettings, waypointManager, setSourceErrorsLocked]);

  /** Ask before replacing confirm-protected work; a refusal announces the cancellation. */
  const confirmReplacement = useCallback(() => {
    if (!replacementNeedsConfirmationRef.current || window.confirm(REPLACE_WORK_CONFIRMATION)) return true;
    setGuidanceAnnouncement(REPLACEMENT_CANCELLED_MESSAGE);
    return false;
  }, []);

  const replaceDocument = useCallback((doc: CoralDocument): boolean => {
    if (refuseDuringUpdate('open') !== null) return false;
    let prepared: PreparedDocumentReplacement;
    try {
      // Schema validation and projection are fallible, so finish them before
      // asking permission or mutating any live owner.
      prepared = prepareDocumentReplacement(doc);
    } catch (error) {
      console.error('Failed to prepare document replacement:', error);
      setOpenFailure({
        fileName: typeof doc?.metadata?.name === 'string' ? doc.metadata.name : 'the document',
        reasons: (error instanceof Error ? error.message : String(error)).split(/\n|; /).filter(Boolean)
          .map((message) => ({ severity: 'error' as const, code: 'coral.open.document.invalid', message })),
      });
      setGuidanceAnnouncement(
        'The selected document is invalid and was not opened. Your current work is unchanged.',
      );
      return false;
    }
    if (!confirmReplacement()) return false;
    commitPreparedDocument(prepared);
    setOpenFailure(null);
    replacementNeedsConfirmationRef.current = false;
    return true;
  }, [commitPreparedDocument, confirmReplacement, notation, refuseDuringUpdate]);

  /**
   * Plan and commit an open, shared by the open pipeline and draft recovery:
   * a plan that throws or is blocked reports its reasons, dirty work asks
   * first, and a committed open clears the failure panel. Returns the
   * committed plan, or null; the caller owns the dirty flag afterwards.
   */
  const commitPlannedOpen = useCallback((
    file: OpenFileInput,
    blocked: { fileName: string; announcement: string },
  ): Extract<FileOpenPlan, { kind: 'open' }> | null => {
    let plan: FileOpenPlan;
    try {
      plan = planFileOpen(file);
    } catch (error) {
      plan = { kind: 'blocked', reasons: [{ severity: 'error', code: 'coral.open.failed',
        message: error instanceof Error ? error.message : String(error) }] };
    }
    if (plan.kind === 'blocked') {
      setOpenFailure({ fileName: blocked.fileName, reasons: plan.reasons });
      setGuidanceAnnouncement(blocked.announcement);
      return null;
    }
    if (!confirmReplacement()) return null;
    commitPreparedDocument(plan.prepared, plan.textOpen);
    setOpenFailure(null);
    return plan;
  }, [commitPreparedDocument, confirmReplacement]);

  /** The one open pipeline behind Load, Welcome, Ctrl+O, and drop (R-064). */
  const openFile = useCallback((file: OpenFileInput): boolean => {
    if (llmChat.isMutationPending) return false;
    if (refuseDuringUpdate('open') !== null) return false;
    const plan = commitPlannedOpen(file, {
      fileName: file.name, announcement: `Could not open ${file.name}. Your current work is unchanged.`,
    });
    if (!plan) return false;
    replacementNeedsConfirmationRef.current = false;
    const outcome = plan.outcome?.kind === 'converted'
      ? ` Imported from ${plan.outcome.formatLabel} and converted to editable Coral source.`
      : plan.outcome?.kind === 'interchange'
        ? ` Imported from ${plan.outcome.formatLabel} as GraphIR interchange; no Coral source was generated.`
      : plan.outcome?.kind === 'restored-source'
        ? ` Restored the saved ${plan.outcome.formatLabel} source without conversion.`
        : '';
    setGuidanceAnnouncement(plan.textOpen?.blockWith
      ? `Opened ${file.name} with errors.${outcome} Every error is listed in the diagnostics panel.`
      : `Opened ${file.name}.${outcome}`);
    return true;
  }, [commitPlannedOpen, llmChat.isMutationPending, refuseDuringUpdate]);

  const reportOpenFileReadFailure = useCallback((failure: { name: string; error: unknown }) => {
    const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
    setOpenFailure({ fileName: failure.name, reasons: [{
      severity: 'error', code: 'coral.open.read.failed', message,
    }] });
    setGuidanceAnnouncement(`Could not read ${failure.name}. Your current work is unchanged.`);
  }, []);

  /** Read a chosen or dropped file as text, then open it. */
  const openFileObject = useCallback(async (file: File) => {
    let text: string;
    try {
      text = await file.text();
    } catch (error) {
      reportOpenFileReadFailure({ name: file.name, error });
      return false;
    }
    return openFile({ name: file.name, text });
  }, [openFile, reportOpenFileReadFailure]);

  const chooseFileToOpen = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = OPEN_FILE_ACCEPT;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void openFileObject(file);
    }, { once: true });
    input.click();
  }, [openFileObject]);

  const handleShellDragOver = useCallback((event: ShellDragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = [...(event.dataTransfer.types ?? [])].includes('Files') ? 'copy' : 'none';
  }, []);

  const handleShellDrop = useCallback((event: ShellDragEvent) => {
    // A dropped file must never navigate away from the current work.
    event.preventDefault();
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) return;
    if (files.length > 1) {
      setOpenFailure({ fileName: `${files.length} files`, reasons: [{ severity: 'error', code: 'coral.open.drop.multiple',
        message: 'Drop one file at a time.' }] });
      setGuidanceAnnouncement(`Could not open ${files.length} files. Your current work is unchanged.`);
      return;
    }
    void openFileObject(files[0]);
  }, [openFileObject]);


  // Handle LLM prompt submission — delegates to useLlmChat hook. Its only
  // caller, the composer's onPromptSubmit, refuses and reports an update owner.
  const handleLlmPromptSubmit = useCallback(async (prompt: string) => {
    setBottomPanelTab('ai');
    setDiagnosticsCollapsed(false);
    const contextEdges = edges.map((edge) => {
      const waypoints = waypointManager.waypointMap.get(edge.id);
      return waypoints?.length
        ? { ...edge, data: { ...edge.data, routingPoints: waypoints.map(({ x, y }) => ({ x, y })) } }
        : edge;
    });
    // Starting a request is not a document mutation: it neither advances the
    // AI revision nor cancels layout (R-054 AC-1). Single-flight lives in the hook.
    const revision = revisions.currentLlm();
    const context: SubmitContext = {
      nodes,
      edges: contextEdges,
      dsl,
      dslType,
      diagnostics: diagnosticEntries,
      notation,
      graph: handleGetDocument().content.graphIR,
      revision,
    };
    await llmChat.submit(prompt, context);
  }, [nodes, edges, dsl, dslType, diagnosticEntries, notation, llmChat, waypointManager.waypointMap, handleGetDocument,
    revisions]);

  const handleSourceFix = useCallback(async () => {
    if (refuseDuringUpdate('ai-request') !== null) return;
    if (editorAnalysis.source !== dsl || editorAnalysis.language !== dslType) return;
    const sourceDiagnostics: DiagnosticEntry[] = editorAnalysis.diagnostics
      .filter((diagnostic) => diagnostic.severity !== 'warning' && diagnostic.severity !== 'info')
      .map((diagnostic, index) => ({
        ...diagnostic,
        edgeId: `source-error-${index}`,
        severity: 'error',
        sourceLabel: diagnostic.position?.line
          ? `Source line ${diagnostic.position.line}`
          : diagnostic.line ? `Source line ${diagnostic.line}` : 'Source',
        targetLabel: dslType === 'coral' ? 'Coral DSL' : 'Mermaid DSL',
        message: diagnostic.message,
      }));
    if (sourceDiagnostics.length === 0 || llmChat.isGenerating) return;
    setBottomPanelTab('ai');
    setDiagnosticsCollapsed(false);
    const contextEdges = edges.map((edge) => {
      const waypoints = waypointManager.waypointMap.get(edge.id);
      return waypoints?.length
        ? { ...edge, data: { ...edge.data, routingPoints: waypoints.map(({ x, y }) => ({ x, y })) } }
        : edge;
    });
    await llmChat.submit('Fix the current source error.', {
      nodes,
      edges: contextEdges,
      dsl,
      dslType,
      diagnostics: sourceDiagnostics,
      notation,
      graph: handleGetDocument().content.graphIR,
      revision: revisions.currentLlm(),
    });
  }, [dsl, dslType, edges, editorAnalysis, handleGetDocument,
    llmChat, nodes, notation, refuseDuringUpdate, revisions, waypointManager.waypointMap]);

  // Handle asking about a diagnostic entry (issue #48)
  const handleAskAboutDiagnostic = useCallback((entry: DiagnosticEntry) => {
    // Single-flight (R-054 AC-1): a busy start changes nothing, not even the tab.
    if (llmChat.isGenerating) return;
    setBottomPanelTab('ai');
    setDiagnosticsCollapsed(false);
    const contextEdges = edges.map((edge) => {
      const waypoints = waypointManager.waypointMap.get(edge.id);
      return waypoints?.length
        ? { ...edge, data: { ...edge.data, routingPoints: waypoints.map(({ x, y }) => ({ x, y })) } }
        : edge;
    });
    const context: SubmitContext = {
      nodes, edges: contextEdges, dsl, dslType, diagnostics: diagnosticEntries, notation,
      revision: revisions.currentLlm(),
    };
    llmChat.askAboutDiagnostic(entry, context);
  }, [nodes, edges, dsl, dslType, diagnosticEntries, notation, llmChat, waypointManager.waypointMap, revisions]);

  // Handle format switch immediately (no debounce)
  useEffect(() => {
    if (formatSwitchPending) {
      setFormatSwitchPending(false);
      const diagnostics = formatSwitchDiagnosticsRef.current;
      formatSwitchDiagnosticsRef.current = [];
      const generatedGraph = pendingGeneratedGraphRef.current;
      pendingGeneratedGraphRef.current = null;
      const generatedWaypoints = pendingGeneratedWaypointsRef.current;
      pendingGeneratedWaypointsRef.current = null;
      const projection = textProjectionRef.current;
      const canonicalInput = generatedGraph
        ? {
            ...projectCanonicalGraph(generatedGraph),
            ...(generatedWaypoints ? { waypoints: generatedWaypoints } : {}),
          }
        : projection?.text === dsl && projection.format === dslType
          ? (() => {
              // Canvas handles still name the previous notation's ports.
              const captured = captureCanonicalProjection();
              return { ...captured, edges: dropUnresolvedEdgePorts(captured.nodes, captured.edges, notation).edges };
            })()
          : undefined;
      updateDiagram(dsl, dslType, notation, diagnostics, canonicalInput);
    }
  }, [formatSwitchPending, dsl, dslType, notation, updateDiagram]);

  // Initial load. Like a text open, the startup text is only source until its
  // first layout publishes: Save drafts it exactly and export stays blocked
  // rather than writing the empty startup display (TR94-C4-F6).
  useEffect(() => {
    unparsedUserTextRef.current = dsl;
    revisions.beginSource();
    updateDiagram(dsl, dslType, notation);
  }, []);

  // Debounced update on DSL text change (not format switch or internal update)
  useEffect(() => {
    if (!hasMountedDslEffectRef.current) {
      hasMountedDslEffectRef.current = true;
      return;
    }
    // Skip debounced update if this was triggered by a format switch
    if (formatSwitchPending) return;

    // A displayed projection is not an editable source until an explicit
    // editor event makes it one. Notation/layout changes use the canonical
    // source in the explicit projection path above.
    const projection = textProjectionRef.current;
    if (projection?.text === dsl && projection.format === dslType) return;
    // Skip if this update came from diagram → text sync (prevents feedback loop)
    if (isInternalDslUpdateRef.current) {
      console.log('Skipping re-parse: DSL update was from diagram sync');
      return;
    }

    // Skip if we're loading a document (prevents textarea from overwriting loaded data)
    if (isLoadingDocumentRef.current) {
      return;
    }

    // Only an unparsed editor intent owns a debounce. Its accepted parse can
    // change notation (and this effect's dependencies) without another edit.
    // Re-parsing that accepted text would create work with no source owner.
    const sourceRevision = revisions.currentSourceRevision();
    if (unparsedUserTextRef.current !== dsl || sourceUpdateOwnerRef.current !== sourceRevision) return;
    const originRevision = textInputRevision;
    const timeout = setTimeout(() => {
      // A replacement starts its parse synchronously, before React cleans up
      // the previous effect. A due timer must not borrow that newer revision.
      if (revisions.currentSourceRevision() !== sourceRevision ||
        sourceUpdateOwnerRef.current !== sourceRevision || unparsedUserTextRef.current !== dsl ||
        textInputRevisionRef.current !== originRevision) return;
      // Mark that this diagram update originated from user text editing
      // so the diagram→text sync effect skips the print-back
      updateDiagram(dsl, dslType, notation).finally(() => {
        // Reset after a short delay to let React state updates propagate
        setTimeout(() => {
          if (textOriginOwnerRef.current === originRevision) {
            textOriginOwnerRef.current = null;
          }
        }, TEXT_ORIGIN_SETTLE_MS);
      });
    }, TEXT_TO_DIAGRAM_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [dsl, dslType, notation, updateDiagram, formatSwitchPending, textInputRevision, revisions]);

  /**
   * The document to persist, computed without side effects. Save and recovery
   * write the exact source as a DSL draft whenever the display cannot stand
   * for it (R-064 AC-4, R-053 AC-1): typed text no parse has finished, a held
   * structural resolution, or a blocked publication. Recovery keeps the
   * display snapshot only for source text with errors, which it reparses and
   * blocks like typed text; Save also drafts that text and unsafe ports.
   */
  const documentForPersistence = useCallback((purpose: 'save' | 'recovery'): {
    doc: CoralDocument; dsl: () => string; draft: 'source' | 'structural' | 'graph-structural' | null;
  } => {
    const saved = handleGetDocument();
    const text = dslRef.current;
    const format = dslTypeRef.current;
    if (format === 'coral' && graphIRPreviewSourceRef.current === text) {
      if (structuralLayoutPendingRef.current !== null || sourceErrorsLockedRef.current) {
        // During or after a failed layout, canvas nodes still show the older
        // graph. The accepted structural input is the recoverable document.
        return { doc: { ...saved, content: { format: 'graph-ir', graphIR: structuredClone(sourceGraphRef.current) } },
          dsl: () => text, draft: 'graph-structural' };
      }
      return { doc: saved, dsl: () => text, draft: null };
    }
    const hasUnparsedText = unparsedUserTextRef.current === text;
    const publication = revisions.publicationEnvelope();
    const structural = structuralLayoutPendingRef.current !== null;
    const staleDisplay = hasUnparsedText || structural || publication.status === 'blocked';
    const sourceOwned028 = format === 'coral' && isAuthored028Source(text);
    const headerNotation = sourceOwned028 ? installedHeaderNotation(text) : undefined;
    const asDraft = purpose === 'recovery'
      ? staleDisplay && !sourceTextBlocksDisplay(text, format)
      : staleDisplay
        || sourceErrorsLockedRef.current
        || sourceTextHasErrors(text, format)
        || (format === 'coral' && !sourceOwned028 && savedGraphHasUnsafePorts(saved));
    if (sourceOwned028 || format !== 'coral' || text === '') {
      // Coral 0.2.8 and foreign formats retain authored spelling that the
      // derived GraphIR display cannot reconstruct. A successfully rendered
      // document still saves its source; pending or invalid text remains a draft.
      // A cleared editor is also exact authored text: an empty GraphIR display
      // cannot stand in for it or retain its selected source language.
      return {
        doc: { ...saved,
          ...(headerNotation ? { settings: { ...saved.settings, notation: headerNotation } } : {}),
          content: { format: 'dsl', dslType: format, text } },
        dsl: () => text,
        draft: asDraft ? structural ? 'structural' : 'source' : null,
      };
    }
    if (!asDraft) {
      // Inside a passive print-back debounce the display is the newer truth and
      // the source text is stale (TR94-C3-F3): recovery pairs the display
      // document with its own projection, which the print-back would write.
      // The projection is built exactly as the print-back builds it, so the
      // recovered source is the text the print-back would have written. It is
      // costly, so it is built only when the coalesced recovery write fires,
      // not on every drag frame (CR94-F5).
      const printBackPending = purpose === 'recovery' && format === 'coral'
        && passiveVisualOwnsPublication(pendingVisualSourceRevisionRef.current);
      // Every input the projection reads is captured now, with the snapshot's
      // document; a replacement before the write cannot mix into it.
      const flowEdges = edgesRef.current;
      const inputs: PrintBackInputs = {
        sourceGraph: sourceGraphRef.current,
        lastParsed: lastParsedRef.current,
        exactNodeIds: new Set(pendingExactNodeIdsRef.current),
      };
      return {
        doc: saved,
        dsl: printBackPending ? () => printCoralDSLWithDiagnostics(buildPrintBackGraph(flowEdges, inputs)).text : () => text,
        draft: null,
      };
    }
    const draftNotation = hasUnparsedText && publication.status === 'pending' && format === 'coral'
      ? installedHeaderNotation(text)
      : undefined;
    return {
      doc: {
        ...saved,
        content: { format: 'dsl', dslType: format, text },
        ...(draftNotation ? { settings: {
          ...saved.settings,
          notation: draftNotation,
        } } : {}),
      },
      dsl: () => text,
      draft: structural ? 'structural' : 'source',
    };
  }, [buildPrintBackGraph, handleGetDocument, passiveVisualOwnsPublication, revisions]);

  // Auto-save to localStorage for recovery (CORAL-REQ-016)
  useEffect(() => {
    // Don't auto-save during initial load or before an edit makes the work dirty.
    if (!replacementNeedsConfirmationRef.current) return;
    const persisted = documentForPersistence('recovery');
    // While a layout is in flight the display is transitional, so only an
    // exact source draft is safe to snapshot. That draft is what Save writes
    // then, so a reload during a hung layout still recovers the edit.
    if (loading && persisted.draft === null) return;

    // Build node positions map
    const nodePositions: Record<string, { x: number; y: number }> = {};
    for (const node of nodes) {
      nodePositions[node.id] = { x: node.position.x, y: node.position.y };
    }

    updateRecovery(() => ({
      documentName,
      dslType,
      dsl: persisted.dsl(),
      notation,
      nodePositions,
      // A display that cannot stand for the source is never recovered as the
      // document: the exact source draft is, as Save writes it.
      document: persisted.doc,
    }));
  }, [dsl, dslType, notation, documentName, nodes, documentSettings, waypointManager.waypointMap, loading,
    updateRecovery, documentForPersistence]);

  // Handle recovery application
  const handleApplyRecovery = useCallback(() => {
    cancelActiveGesture();
    const data = recoveryData;
    if (data) {
      if (data.document?.content?.format === 'dsl') {
        // A recovered source draft reopens exactly as a saved draft does: its
        // text is parsed and laid out, or blocks with its errors.
        if (refuseDuringUpdate('open') !== null) return;
        if (!commitPlannedOpen({ name: `${data.documentName}.coral.json`, text: JSON.stringify(data.document) }, {
          fileName: data.documentName,
          announcement: 'The recovery data is invalid and was not opened. Your current work is unchanged.',
        })) return;
        replacementNeedsConfirmationRef.current = true;
        applyRecovery();
        setShowWelcome(false);
        localStorage.setItem(WELCOME_SEEN_KEY, 'true');
        setGuidanceAnnouncement('Recovered your unsaved work.');
        return;
      }
      if (data.document) {
        if (!replaceDocument(data.document)) return;
        const graphIRPreview = data.document.content.format === 'graph-ir'
          && data.dslType === 'coral';
        if (!graphIRPreview) {
          // A GraphIR recovery's Coral text is a generated preview. The
          // replacement has already printed its current graph; an older
          // snapshot of that preview cannot overwrite it.
          graphIRPreviewSourceRef.current = null;
          textProjectionRef.current = { text: data.dsl, format: data.dslType, notation: (data.document.settings.notation ?? data.notation) as NotationType };
          setMermaidFileSource(data.dslType === 'mermaid');
          setDslType(data.dslType);
          setDsl(data.dsl);
          // Recovered text with errors blocks like typed text, keeping the
          // recovered document's canvas and a lossless save (R-064 AC-4).
          if (sourceTextBlocksDisplay(data.dsl, data.dslType)) {
            void updateDiagramRef.current(data.dsl, data.dslType, (data.document.settings.notation ?? data.notation) as NotationType);
          }
        }
        replacementNeedsConfirmationRef.current = true;
        applyRecovery();
        setShowWelcome(false);
        localStorage.setItem(WELCOME_SEEN_KEY, 'true');
        setGuidanceAnnouncement('Recovered your unsaved work.');
        return;
      }
      const legacyDocumentSettings = {
        ...documentSettings,
        notation: data.notation,
      };
      delete legacyDocumentSettings.font;
      const now = new Date().toISOString();
      const legacyDocument: CoralDocument = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        metadata: { name: data.documentName, created: now, modified: now },
        // Old text-only snapshots have no verified graph. Recover their exact
        // text through the same source-owned path as a saved draft, including
        // syntax errors and retired spellings.
        content: { format: 'dsl', dslType: data.dslType, text: data.dsl },
        settings: legacyDocumentSettings,
        nodePositions: data.nodePositions,
      };
      if (refuseDuringUpdate('open') !== null) return;
      if (!commitPlannedOpen({ name: `${data.documentName}.coral.json`, text: JSON.stringify(legacyDocument) }, {
        fileName: data.documentName,
        announcement: 'The recovery data is invalid and was not opened. Your current work is unchanged.',
      })) return;
      replacementNeedsConfirmationRef.current = true;
      applyRecovery();
      setShowWelcome(false);
      localStorage.setItem(WELCOME_SEEN_KEY, 'true');
      setGuidanceAnnouncement('Recovered your unsaved work.');
    }
  }, [applyRecovery, cancelActiveGesture, commitPlannedOpen, documentSettings, recoveryData, refuseDuringUpdate,
    replaceDocument]);

  // Wrap handleGetDocument to mark as saved after explicit save
  const handleSaveDocument = useCallback(() => {
    const { doc, draft } = documentForPersistence('save');
    if (draft === 'structural') {
      setGuidanceAnnouncement('Saved your source text exactly as written; the diagram is still updating to match it.');
    } else if (draft === 'source') {
      setGuidanceAnnouncement('Saved your source text exactly as written; it does not render yet.');
    }
    markSaved();
    replacementNeedsConfirmationRef.current = false;
    return doc;
  }, [captureCurrentGraph, documentForPersistence, markSaved, notation, pushContentHistory,
    revisions, userPreferences.editorEntityHighlighting, waypointManager.waypointMap]);

  const downloadJson = useCallback((value: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, []);

  const handleSaveDownload = useCallback(() => {
    const doc = handleSaveDocument();
    const name = downloadStem(documentName);
    downloadJson(doc, `${name}.coral.json`);
    clearCurrentTranscript();
  }, [clearCurrentTranscript, documentName, downloadJson, handleSaveDocument]);

  const handleHeaderSaveDocument = useCallback(() => {
    const doc = handleSaveDocument();
    clearCurrentTranscript();
    return doc;
  }, [clearCurrentTranscript, handleSaveDocument]);

  const handleExportGraphIR = useCallback(() => {
    if (dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current)) {
      // Model export is source-owned. A missing display publication (for
      // example a recursive fragment) cannot veto exact accepted meaning;
      // the exporter independently checks source bytes and the projection.
      try {
        const graph = sourceOwnedGraphForExport028(dslRef.current,
          lastParsedRef.current.sourceText028, lastParsedRef.current.sourceMeaning028);
        const name = downloadStem(documentName);
        downloadJson(graph, `${name}-graph-ir-4-candidate.json`);
        setRasterExportError(null);
      } catch (error) {
        setRasterExportError(error instanceof Error ? error.message : 'Source-owned GraphIR export failed');
      }
      return;
    }
    const blocked = revisions.currentExportDiagnostic();
    if (blocked) {
      setRasterExportError(blocked);
      return;
    }
    const doc = handleGetDocument();
    if (!doc.content.graphIR) return;
    const name = downloadStem(documentName);
    downloadJson(doc.content.graphIR, `${name}-graph-ir.json`);
  }, [documentName, downloadJson, handleGetDocument, revisions]);

  /** Download a blob under a slugified document name. */
  const downloadBlob = useCallback((blob: Blob, extension: string) => {
    const name = downloadStem(documentName);
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `${name}.${extension}`;
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [documentName]);

  /** The positioned graph shared by vector, raster, and HTML exports. */
  const currentRenderGraph = useCallback(() => {
    if (isSequenceGraph(sourceGraphRef.current)) {
      const accepted = lastParsedRef.current;
      if (accepted.sourceMeaning028?.interaction && accepted.sourceText028 === dslRef.current &&
        !sourceErrorsLockedRef.current) {
        return successorSequenceDisplay028(accepted.sourceMeaning028);
      }
      const graph = captureCurrentGraph();
      const [issue] = validateSequenceInteraction(graph);
      if (issue) throw new Error(`Export blocked: ${issue.message} (${issue.code})`);
      return graph;
    }
    const doc = handleGetDocument();
    const serializedCurrent = doc.content.graphIR as GraphIR | undefined;
    if (!serializedCurrent?.nodes) return null;
    const canonical = sourceGraphRef.current.nodes.length > 0
      ? sourceGraphRef.current
      : serializedCurrent;
    return composeRenderGraph(canonical, serializedCurrent, nodes);
  }, [captureCurrentGraph, handleGetDocument, nodes]);

  const currentRenderOptions = useCallback((): SvgOptions => {
    const acceptedSource = dslTypeRef.current === 'coral' &&
      isAuthored028Source(dslRef.current) &&
      lastParsedRef.current.sourceText028 === dslRef.current &&
      !sourceErrorsLockedRef.current &&
      revisions.currentExportDiagnostic() === null
      ? lastParsedRef.current.sourceMeaning028 : undefined;
    const edgeRoutes = new Map<string, Array<{
      startPoint: Position; bendPoints: Position[]; endPoint: Position;
    }>>();
    for (const [edgeId, route] of verifiedEdgeRoutesRef.current) {
      edgeRoutes.set(edgeId, [{
        startPoint: { ...route.startPoint },
        bendPoints: route.bendPoints.map((point) => ({ ...point })),
        endPoint: { ...route.endPoint },
      }]);
    }
    // Transient editor handles use the shared fixed-geometry adapter against
    // current bounds. Durable source joins keep their verified layout routes.
    for (const [edgeId, route] of waypointManager.getRoutedPaths()) {
      edgeRoutes.set(edgeId, [{
        startPoint: { ...route.startPoint },
        bendPoints: route.bendPoints.map((point) => ({ ...point })),
        endPoint: { ...route.endPoint },
      }]);
    }
    return {
      theme: theme === lightTheme ? 'light' : 'dark',
      style: renderStyle028,
      renderStyle: renderStyle0214,
      title: documentName,
      fontSettings: editorVisualFonts028(documentSettingsRef.current.font, renderStyle028),
      edgeRoutes,
      layoutDirection: (sourceGraphRef.current as SpatialSidecar028).layoutOptions028?.direction ??
        resolveNotationLayout(notation, documentSettingsRef.current.layout).settings.direction,
      notation,
      revision: JSON.stringify({
        source: revisions.publicationEnvelope().sourceRevision,
        display: revisions.publicationEnvelope().displayRevision,
        style: renderStyle0214,
        theme: theme === lightTheme ? 'light' : 'dark',
        font: editorVisualFonts028(documentSettingsRef.current.font, renderStyle028),
        layout: documentSettingsRef.current.layout,
        notation,
      }),
      ...(acceptedSource ? { successorSource: acceptedSource } : {}),
      ...(sourceGraphRef.current.nodes.length > 0
        ? { semanticGraph: sourceGraphRef.current } : {}),
    };
  }, [documentName, notation, theme, waypointManager, renderStyle028, renderStyle0214, revisions]);

  const requireCurrentSourcePortRoutes = useCallback((options: SvgOptions) => {
    if (dslTypeRef.current !== 'coral' || !isAuthored028Source(dslRef.current)) return;
    const source = lastParsedRef.current.sourceMeaning028;
    if (!source) throw new Error(
      'render.capability.source-meaning-unavailable: no accepted 0.2.8 source meaning is available for export',
    );
    requireSourcePortRoutes028(source, verifiedEdgeRoutesRef.current);
    if (source.edges.some((edge) =>
      (edge.first.port !== undefined || edge.second.port !== undefined) &&
      !options.edgeRoutes?.has(edge.id))) throw new Error(
      'render.capability.semantic-port-route: a verified source port route is missing from export options',
    );
  }, []);

  const nodeLabelPlacementBasis = useCallback(() => JSON.stringify({
    source: dslRef.current,
    nodes: nodesRef.current.map((node) => [node.id, node.position, node.width, node.height]),
    routes: [...verifiedEdgeRoutesRef.current],
    render: renderInputRevisionRef028.current,
  }), []);

  const commitSourceNodeLabelPlacement = useCallback((nodeId: string,
    placement: SourceOwnedNodeLabelPlacement028, basis: string): boolean => {
    if (dslTypeRef.current !== 'coral' || !isAuthored028Source(dslRef.current) ||
      llmChat.isMutationPending || refuseDuringUpdate('source-gesture') !== null) return false;
    try {
      if (basis !== nodeLabelPlacementBasis()) throw new Error('coral.editor.source-placement.stale');
      const selected = nodesRef.current.filter((node) => node.selected);
      if (selected.length !== 1 || selected[0].id !== nodeId || edgesRef.current.some((edge) => edge.selected))
        throw new Error('coral.editor.source-placement.selection');
      if (sourceErrorsLockedRef.current || unparsedUserTextRef.current !== null ||
        lastParsedRef.current.sourceText028 !== dslRef.current || revisions.currentExportDiagnostic())
        throw new Error(SOURCE_ERRORS_LOCK_MESSAGE);
      const text = editSourceOwnedNodeLabelPlacement028(dslRef.current, nodeId, placement);
      if (text === dslRef.current) return true;
      const parsed = parseCoralDSL(text);
      if (parsed.errors.some((error) => error.severity === undefined || error.severity === 'error') || !parsed.sourceGraph)
        throw new Error('coral.editor.source-placement.invalid');
      const nextPlacement = { side: placement.side as 'above' | 'below' | 'left' | 'right' | 'center', offset: placement.offset };
      const canonical = { ...sourceGraphRef.current,
        nodes: updateCanonicalNode(sourceGraphRef.current.nodes, nodeId,
          (node) => ({ ...node, labelPlacement: nextPlacement })) };
      const retainedLabels = { ...(canonical as SpatialSidecar028).labelBounds028 };
      delete retainedLabels[`node-label:${nodeId}`];
      Object.assign(canonical, { labelBounds028: retainedLabels });
      const positioned = currentRenderGraph();
      if (!positioned) throw new Error('coral.editor.source-placement.geometry-unavailable');
      const prospective = { ...positioned, nodes: updateCanonicalNode(positioned.nodes, nodeId,
        (node) => ({ ...node, labelPlacement: nextPlacement })) };
      Object.assign(prospective, { labelBounds028: retainedLabels });
      const options = currentRenderOptions();
      requireCurrentSourcePortRoutes(options);
      // No state changes precede full shared-scene collision/capability admission.
      prepareSpatialScene028(prospective, { ...options, semanticGraph: canonical, successorSource: parsed.sourceGraph });
      if (basis !== nodeLabelPlacementBasis()) throw new Error('coral.editor.source-placement.stale');
      const nextNodes = nodesRef.current.map((node) => node.id === nodeId
        ? { ...node, data: { ...node.data, canonical: { ...node.data.canonical!, labelPlacement: nextPlacement } } } : node);
      const acceptedRoutes = verifiedEdgeRoutesRef.current;
      pushContentHistory(captureCurrentGraph(), waypointMapRef.current);
      acceptTextSource();
      cancelActiveGesture();
      invalidateEditIntent();
      verifiedEdgeRoutesRef.current = acceptedRoutes;
      sourceEditSessionRef.current = false;
      sourceGraphRef.current = canonical;
      lastParsedRef.current = { ...lastParsedRef.current, nodes: parsed.nodes, edges: parsed.edges,
        sourceMeaning028: parsed.sourceGraph, sourceText028: text,
        ...(parsed.coralVersion ? { coralVersion: parsed.coralVersion } : {}),
        ...(parsed.semanticInterpretations ? { semanticInterpretations: parsed.semanticInterpretations } : {}) };
      nodesRef.current = nextNodes;
      acceptedDisplayRef.current = { nodes: cloneDisplayNodes(nextNodes), edges: cloneDisplayEdges(edgesRef.current),
        waypoints: cloneWaypoints(waypointMapRef.current) };
      skipNextDiagramSyncRef.current = true;
      isInternalDslUpdateRef.current = true;
      textProjectionRef.current = { text, format: 'coral', notation };
      setNodes(nextNodes);
      setParseErrors(parsed.diagnostics ?? parsed.errors);
      setEditorAnalysis({ source: text, language: 'coral', diagnostics: [],
        decorations: editorEntityHighlightingRef.current ? analyzeEditorSource(text, 'coral', parsed.nodes, parsed.edges) : [],
        entityHighlighting: editorEntityHighlightingRef.current });
      const publication = revisions.beginSource();
      revisions.publishSource(publication.sourceRevision);
      replacementNeedsConfirmationRef.current = true;
      dslRef.current = text;
      setDsl(text);
      setGuidanceAnnouncement(`Moved label for ${nodeId}.`);
      queueMicrotask(() => { isInternalDslUpdateRef.current = false; });
      return true;
    } catch (error) {
      setGuidanceAnnouncement(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [acceptTextSource, cancelActiveGesture, captureCurrentGraph, currentRenderGraph, currentRenderOptions,
    invalidateEditIntent, llmChat.isMutationPending, nodeLabelPlacementBasis, notation, pushContentHistory,
    refuseDuringUpdate, requireCurrentSourcePortRoutes, revisions, setNodes]);

  /** The current graph rendered to SVG through the shared serializer (R-023). */
  const currentSvg = useCallback((): string | null => {
    const graph = currentRenderGraph();
    if (!graph) return null;
    const options = currentRenderOptions();
    requireCurrentSourcePortRoutes(options);
    return renderSvg(graph, options);
  }, [currentRenderGraph, currentRenderOptions, requireCurrentSourcePortRoutes]);

  /**
   * The live base an AI plan may edit (0.2.10 slice 40): accepted, rendered
   * Coral source with no edit in progress, or null. The edit revision stands
   * for geometry: every drag, waypoint, reflow, Undo and Redo bumps it.
   */
  const planBase = useCallback((): PlanBase | null => {
    // The on-device panel sequences its own lock: it captures before locking and stages after unlocking.
    if (dslTypeRef.current !== 'coral' || !isAuthored028Source(dslRef.current) || providerChat.isMutationPending ||
      updateRefusal('source-gesture') !== null || sourceErrorsLockedRef.current || unparsedUserTextRef.current !== null ||
      lastParsedRef.current.sourceText028 !== dslRef.current || revisions.currentExportDiagnostic() !== null) return null;
    return { source: dslRef.current, sourceRevision: revisions.currentSourceRevision(), geometryRevision: revisions.currentEdit() };
  }, [providerChat.isMutationPending, revisions, updateRefusal]);

  // An applied plan's source revision, until the canvas publishes or blocks it.
  const planCommitRef = useRef<{ revision: number; sequence: number; source: string;
    resolve: (result: PlanApplyResult) => void } | null>(null);
  useEffect(() => {
    const pending = planCommitRef.current;
    if (!pending || loading || updateStatus.kind !== 'stable') return;
    const publication = revisions.publicationEnvelope();
    // A later edit, Undo or Redo owns the document now; the commit stands.
    if (publication.sourceRevision !== pending.revision) {
      planCommitRef.current = null;
      pending.resolve({ ok: true });
    } else if (publication.status === 'current' && publication.displayRevision === pending.revision) {
      planCommitRef.current = null;
      pending.resolve({ ok: true });
    } else if (publication.status === 'blocked') {
      // Source and display must not diverge: return to the base and forget the commit.
      planCommitRef.current = null;
      if (dslUndoStack.current[dslUndoStack.current.length - 1]?.sequence === pending.sequence) {
        handleUndo();
        // The failed layout never marked the candidate parsed; Save must not keep it.
        if (unparsedUserTextRef.current === pending.source) unparsedUserTextRef.current = null;
        if (dslRedoStack.current[dslRedoStack.current.length - 1]?.sequence === pending.sequence) {
          dslRedoStack.current.pop();
          setDslRedoCount(dslRedoStack.current.length);
        }
      }
      pending.resolve({ ok: false, refusal: { code: 'coral.plan.apply-failed',
        message: `The proposal could not be drawn on the canvas and was undone. ${publication.diagnostic ?? ''}`.trim() } });
    }
  });

  /** Direction and spacing as the canvas lays out (diagramUtils.layoutNodes): notation profile, then authored options. */
  const canvasLayout = useCallback(() => {
    const configured = resolveNotationLayout(notation, documentSettingsRef.current.layout).settings;
    const authored = (sourceGraphRef.current as SpatialSidecar028).layoutOptions028;
    const spacing = { ...configured.spacing, ...authored?.spacing };
    return { direction: authored?.direction ?? configured.direction,
      spacing: { ...(spacing.nodeNode !== undefined ? { nodeNode: spacing.nodeNode } : {}),
        ...(spacing.layerSpacing !== undefined ? { layerSpacing: spacing.layerSpacing } : {}) } };
  }, [notation]);

  /**
   * A plan that removes or renumbers unnamed connectors changes what derived
   * edge IDs mean. After the commit, which already recorded the prior state
   * for Undo, edge-keyed state follows its connector: a renumbered edge keeps
   * its selection and waypoints under its new ID; a removed one loses them.
   */
  const followRenumberedEdges = useCallback((stage: PlanStage) => {
    const removed = new Set(stage.removed.relations);
    const renamed = stage.renumbered;
    if (!removed.size && !Object.keys(renamed).length) return;
    const follow = (id: string) => (removed.has(id) ? null : renamed[id] ?? id);
    setSelectedEdgeId((id) => (id === null ? null : follow(id)));
    // The next publication carries selection by ID and endpoints, so the display edges take their new IDs now.
    const edgesNow = edgesRef.current.flatMap((edge) => {
      const id = follow(edge.id);
      return id === null ? [] : [id === edge.id ? edge : { ...edge, id }];
    });
    edgesRef.current = edgesNow;
    setEdges(edgesNow);
    const waypoints = waypointMapRef.current;
    if ([...waypoints.keys()].some((id) => follow(id) !== id)) {
      waypointManager.setWaypoints(new Map([...waypoints].flatMap(([id, points]): [string, EdgeWaypoint[]][] => {
        const to = follow(id);
        return to === null ? [] : [[to, points]];
      })));
    }
  }, [setEdges, waypointManager]);

  const planSurface = useMemo(() => ({
    /** Capture the live document for one request; the canvas selection is the default. */
    capture: (requestId: string, selection?: readonly EntityId[]): CaptureResult => {
      const base = planBase();
      if (!base) return { ok: false, refusal: PLAN_BUSY };
      return capturePlanSnapshot({ ...base, requestId, selection: selection ?? [
        ...nodesRef.current.filter((node) => node.selected).map((node) => ({ kind: 'node' as const, id: node.id })),
        ...edgesRef.current.filter((edge) => edge.selected).map((edge) => ({ kind: 'relation' as const, id: edge.id })),
      ] });
    },
    /** Execute and render a response detached; the live document is untouched. */
    stage: (capture: PlanCapture, response: PlanResponse, signal?: AbortSignal): Promise<PlanStageResult> => stagePlan(
      capture, response, planBase, {
        svgOptions: { theme: theme === lightTheme ? 'light' : 'dark', style: renderStyle028,
          fontSettings: editorVisualFonts028(documentSettingsRef.current.font, renderStyle028) },
        ...canvasLayout(),
        // Spatial edits are measured with the canvas's own full layout, which must reproduce the canvas.
        measure: canvasGeometry(() => ({ notation, layout: documentSettingsRef.current.layout, font: documentSettingsRef.current.font,
          renderStyle028: documentSettingsRef.current.renderStyle028 ?? 'lowfi' }), signal),
        canvas: () => canvasRects(nodesRef.current.map((node) => ({ id: node.id, position: node.position,
          ...(node.parentId ? { parentId: node.parentId } : {}), width: node.width, height: node.height }))),
        ...(signal ? { signal } : {}) }),
    /** Whether a capture still describes the live document, for a clarification answer; `busy` while the editor is updating. */
    isCurrent: (capture: PlanCapture): 'current' | 'changed' | 'busy' => {
      const base = planBase();
      if (base === null) return capture.source === dslRef.current ? 'busy' : 'changed';
      return planCaptureIsCurrent(capture, base) ? 'current' : 'changed';
    },
    /**
     * Commit a staged plan as one accepted transaction: one history entry
     * holding the exact prior source, meaning, display and publication,
     * resolved once the canvas has published the new source. If the canvas
     * cannot publish it, the commit is undone (`apply-failed`). A busy editor
     * keeps the stage open; a stale stage is discarded.
     */
    apply: async (stage: PlanStage): Promise<PlanApplyResult> => {
      const base = planBase();
      if (!base || planCommitRef.current) return { ok: false, refusal: PLAN_BUSY };
      if (!planStageIsOpen(stage)) {
        return { ok: false, refusal: { code: 'coral.plan.closed', message: 'This proposal was already applied or discarded.' } };
      }
      if (!planCaptureIsCurrent(stage.capture, base)) {
        discardPlanStage(stage);
        return { ok: false, refusal: { code: 'coral.plan.stale', message: 'The diagram changed after this proposal; ask again.' } };
      }
      // A plan is its own Undo entry, never part of an open typing session.
      sourceEditSessionRef.current = false;
      if (!commitSourceEdit029(() => stage.source)) {
        return { ok: false, refusal: { code: 'coral.plan.apply-refused', message: 'The editor did not accept the proposal.' } };
      }
      discardPlanStage(stage);
      planSequencesRef.current.add(transactionSequenceRef.current);
      followRenumberedEdges(stage);
      const revision = revisions.currentSourceRevision();
      return new Promise<PlanApplyResult>((resolve) => {
        planCommitRef.current = { revision, sequence: transactionSequenceRef.current, source: stage.source, resolve };
      });
    },
    discard: discardPlanStage,
  }), [canvasLayout, commitSourceEdit029, followRenumberedEdges, notation, planBase, renderStyle028, revisions, theme]);

  const [onDeviceEnabled, setOnDeviceEnabled] = useState(readOnDevicePreference);
  const changeOnDeviceEnabled = useCallback((enabled: boolean) => {
    writeOnDevicePreference(enabled);
    setOnDeviceEnabled(enabled);
  }, []);
  const onDeviceHost = useMemo(() => ({ plan: planSurface, setWorking: setOnDeviceWorking }), [planSurface]);

  const handleExportHtml = useCallback(() => {
    const blocked = revisions.currentExportDiagnostic();
    if (blocked) { setRasterExportError(blocked); return; }
    try {
      const graph = currentRenderGraph();
      if (!graph) return;
      const options = currentRenderOptions();
      requireCurrentSourcePortRoutes(options);
      const html = renderHtml(graph, options);
      downloadBlob(new Blob([html], { type: 'text/html' }), 'html');
      setRasterExportError(null);
    } catch (error) {
      setRasterExportError(error instanceof Error ? error.message : 'HTML export failed');
    }
  }, [currentRenderGraph, currentRenderOptions, downloadBlob, requireCurrentSourcePortRoutes, revisions]);

  const handleExportSvg = useCallback(() => {
    const blocked = revisions.currentExportDiagnostic();
    if (blocked) { setRasterExportError(blocked); return; }
    try {
      const svg = currentSvg();
      if (!svg) return;
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'svg');
      setRasterExportError(null);
    } catch (error) {
      setRasterExportError(error instanceof Error ? error.message : 'SVG export failed');
    }
  }, [currentSvg, downloadBlob, revisions]);

  /**
   * Raster export (R-024): the SVG is drawn to a canvas at a scale factor, so
   * PNG and JPEG derive from the same geometry as the vector output.
   */
  const exportRaster = useCallback(
    async (mimeType: 'image/png' | 'image/jpeg', extension: string, scale = 2) => {
      const attempt = ++rasterAttemptRef.current;
      setRasterExportError(null);
      const ownedUrls: string[] = [];
      const requireCurrentAttempt = () => {
        if (attempt !== rasterAttemptRef.current) throw new Error('a newer raster export superseded this attempt');
      };
      try {
        const blocked = revisions.currentExportDiagnostic();
        if (blocked) throw new Error(blocked);
        const graph = currentRenderGraph();
        if (!graph) throw new Error('no diagram is available');
        const options = currentRenderOptions();
        requireCurrentSourcePortRoutes(options);
        const svg = renderSvg(graph, options);
        const match = svg.match(/width="(\d+)" height="(\d+)"/);
        if (!match) throw new Error('the SVG dimensions are invalid');
        const width = Number(match[1]);
        const height = Number(match[2]);

        await Promise.all(svgFontFaceRequests(graph, options).map(async ({ id, weight }) => {
          const portable = getPortableFont(id);
          const face = new FontFace(
            portable.cssFamily,
            `url(${fontData(id, weight)})`,
            { style: 'normal', weight: String(weight) },
          );
          const loaded = await face.load();
          requireCurrentAttempt();
          if (loaded.status !== 'loaded') {
            throw new Error(`${portable.name} ${weight} did not finish loading`);
          }
          window.document.fonts.add(loaded);
        }));
        requireCurrentAttempt();

        const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        ownedUrls.push(svgUrl);
        const image = new Image();
        if (typeof image.decode === 'function') {
          image.src = svgUrl;
          await image.decode();
        } else {
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('the SVG image could not be decoded'));
            image.src = svgUrl;
          });
        }
        requireCurrentAttempt();

        const canvas = window.document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas drawing is unavailable');
        if (mimeType === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.drawImage(image, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((value) => {
            if (value) resolve(value);
            else reject(new Error('canvas encoding returned no image'));
          }, mimeType);
        });
        requireCurrentAttempt();
        downloadBlob(blob, extension);
      } catch (error) {
        if (attempt === rasterAttemptRef.current) {
          const detail = error instanceof Error ? error.message : String(error);
          setRasterExportError(`Raster export failed: ${detail}`);
        }
      } finally {
        ownedUrls.forEach((url) => URL.revokeObjectURL(url));
      }
    },
    [currentRenderGraph, currentRenderOptions, downloadBlob, requireCurrentSourcePortRoutes, revisions]
  );

  const handleExportPng = useCallback(() => exportRaster('image/png', 'png'), [exportRaster]);
  const handleExportJpg = useCallback(() => exportRaster('image/jpeg', 'jpg'), [exportRaster]);


  const openAuthoring = useCallback((kind: 'node' | 'edge', invoker: HTMLElement | null,
    afterMessageId?: string) => {
    if (dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current)) {
      if (refuseDuringUpdate('source-gesture') !== null) return;
      if (sourceErrorsLockedRef.current || unparsedUserTextRef.current !== null ||
        lastParsedRef.current.sourceText028 !== dslRef.current ||
        !lastParsedRef.current.sourceMeaning028 ||
        (kind === 'edge' && (!lastParsedRef.current.semanticInterpretations ||
          !canAppendSourceOwnedEdge028(lastParsedRef.current.sourceMeaning028)))) {
        setGuidanceAnnouncement(kind === 'node'
          ? 'Create Node needs accepted, valid Coral source.'
          : 'Create Edge needs accepted, valid Coral source with an addressable timeline.');
        return;
      }
      if (afterMessageId !== undefined && (kind !== 'edge' ||
        !lastParsedRef.current.sourceMeaning028.interaction?.messages.some((message) =>
          message.id === afterMessageId))) {
        setGuidanceAnnouncement('The selected sequence message has no current source position.');
        return;
      }
    } else if (afterMessageId !== undefined) {
      setGuidanceAnnouncement('Positioned sequence insertion needs accepted Coral source.');
      return;
    }
    setShowWelcome(false);
    setShowHelp(false);
    setShowAbout(false);
    setShowCommandPalette(false);
    setShowPreferences(false);
    setAuthoringSession({ kind, invoker,
      ...(afterMessageId !== undefined ? { afterMessageId } : {}),
      ...(dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current)
        ? { sourceText028: dslRef.current } : {}),
    });
  }, [refuseDuringUpdate]);

  const closeWelcome = useCallback(() => {
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    setShowWelcome(false);
  }, []);
  const captureModalInvoker = useCallback((invoker?: HTMLElement | null) => {
    const modalAlreadyOpen = showWelcome || showHelp || showAbout || showPreferences;
    if (!modalAlreadyOpen || !modalInvokerRef.current?.isConnected) {
      modalInvokerRef.current = invoker ?? document.activeElement as HTMLElement | null;
    }
  }, [showAbout, showHelp, showPreferences, showWelcome]);
  const openGuidance = useCallback((dialog: 'welcome' | 'help' | 'about', invoker?: HTMLElement | null) => {
    captureModalInvoker(invoker);
    setShowWelcome(dialog === 'welcome');
    setShowHelp(dialog === 'help');
    setShowAbout(dialog === 'about');
    setShowCommandPalette(false);
    setShowPreferences(false);
    setAuthoringSession(null);
  }, [captureModalInvoker]);
  const openPreferences = useCallback((invoker?: HTMLElement | null) => {
    captureModalInvoker(invoker);
    setShowWelcome(false);
    setShowHelp(false);
    setShowAbout(false);
    setShowCommandPalette(false);
    setAuthoringSession(null);
    setShowPreferences(true);
  }, [captureModalInvoker]);
  const handleWelcomeBlank = useCallback((_invoker: HTMLElement | null) => {
    if (llmChat.isMutationPending) return;
    if (!openFile({ name: 'Untitled Diagram.coral', text: '@diagram flowchart\n' })) return;
    focusSourceAfterWelcomeRef.current = true;
    closeWelcome();
    setGuidanceAnnouncement('Blank diagram created. Coral source is ready.');
  }, [closeWelcome, llmChat.isMutationPending, openFile]);

  useEffect(() => {
    if (showWelcome || !focusSourceAfterWelcomeRef.current) return;
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>('[aria-label="DSL editor"]')?.focus();
      focusSourceAfterWelcomeRef.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [showWelcome]);
  const handleWelcomeExample = useCallback((id: string) => {
    if (llmChat.isMutationPending) return;
    const example = bundledSourceExamples028.find((candidate) => candidate.id === id);
    if (!example) {
      setGuidanceAnnouncement('The selected example is unavailable or invalid. Your current work is unchanged.');
      return;
    }
    const document = createExampleDocument(exampleCatalog, example.id, example.source);
    if (!openFile({ name: `${example.name}.coral.json`, text: JSON.stringify(document) })) return;
    closeWelcome();
    setGuidanceAnnouncement(`Opened ${example.name} as a new local document.`);
  }, [closeWelcome, llmChat.isMutationPending, openFile]);
  const handleWelcomeOpenFile = useCallback((file: OpenFileInput): boolean => {
    if (llmChat.isMutationPending) return false;
    const accepted = openFile(file);
    if (accepted) closeWelcome();
    return accepted;
  }, [closeWelcome, llmChat.isMutationPending, openFile]);
  const handleDiscardRecoveryFromWelcome = useCallback(() => {
    if (llmChat.isMutationPending) return;
    discardRecovery();
    closeWelcome();
    setGuidanceAnnouncement('Discarded recovery data.');
  }, [closeWelcome, discardRecovery, llmChat.isMutationPending]);

  // Command Palette: Ctrl+K; Preferences: Ctrl+,; authoring: Ctrl/Cmd+Alt+N/E.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Windows AltGr reports Ctrl+Alt. Do not consume text input or IME.
      if (e.getModifierState('AltGraph') || e.isComposing) return;
      const authoringKey = (e.metaKey || e.ctrlKey) && e.altKey
        ? e.key.toLowerCase()
        : '';
      if ((authoringKey === 'n' || authoringKey === 'e')
        && !llmChat.isMutationPending
        && isAuthoringShortcutEligible(
          e,
          showCommandPalette || showPreferences || authoringSession !== null,
        )) {
        e.preventDefault();
        // An eligible shortcut is consumed and names its refusal rather than
        // silently doing nothing while an update owner is live.
        if (refuseDuringUpdate(dslTypeRef.current === 'coral' &&
          isAuthored028Source(dslRef.current) ? 'source-edit' : 'edit') !== null) return;
        openAuthoring(authoringKey === 'n' ? 'node' : 'edge', document.activeElement as HTMLElement | null);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowWelcome(false);
        setShowHelp(false);
        setShowAbout(false);
        setShowPreferences(false);
        setAuthoringSession(null);
        setShowCommandPalette((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        if (showPreferences) setShowPreferences(false);
        else openPreferences(document.activeElement as HTMLElement | null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveDownload();
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        if (llmChat.isMutationPending) setGuidanceAnnouncement(AI_OPEN_LOCK_MESSAGE);
        else if (refuseDuringUpdate('open') === null) chooseFileToOpen();
        return;
      }
      // Reflow, undo and redo were advertised in the command palette but had
      // no listener mounted, so the shortcuts did nothing (R-013).
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (!llmChat.isMutationPending) handleReflow();
        return;
      }
      const windowsRedo = e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'y';
      if (((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'z') || windowsRedo) {
        // Typing in the DSL textarea keeps the browser's own text undo.
        if (isNativeEditingTarget(e.target)) return;
        e.preventDefault();
        if (llmChat.isMutationPending) return;
        if (e.shiftKey || windowsRedo) handleRedo();
        else handleUndo();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [authoringSession, handleSaveDownload, handleReflow, handleUndo, handleRedo, chooseFileToOpen,
    llmChat.isMutationPending, openAuthoring, openPreferences, refuseDuringUpdate, showCommandPalette, showPreferences]);

  // Close overflow menu on outside click
  useEffect(() => {
    if (!showOverflowMenu) return;
    const handleClick = () => setShowOverflowMenu(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showOverflowMenu]);

  const authoringGraph = liveCanonicalGraph;
  const sourceOwned028 = dslType === 'coral' && isAuthored028Source(dsl);
  const sourceEdgeInterpretations = lastParsedRef.current.semanticInterpretations;
  const sourceNodeCreationReady = sourceOwned028 &&
    !sourceErrorsLockedRef.current && unparsedUserTextRef.current === null &&
    lastParsedRef.current.sourceText028 === dsl &&
    Boolean(lastParsedRef.current.sourceMeaning028);
  const sourceEdgeCreationReady = sourceOwned028 &&
    !sourceErrorsLockedRef.current && unparsedUserTextRef.current === null &&
    lastParsedRef.current.sourceText028 === dsl &&
    Boolean(lastParsedRef.current.sourceMeaning028 &&
      canAppendSourceOwnedEdge028(lastParsedRef.current.sourceMeaning028) &&
      sourceEdgeInterpretations);
  const authoringEndpoints: AuthoringEndpointOption[] = sourceOwned028
    ? sourceEdgeCreationReady
      ? flattenAuthoringNodes(authoringGraph).flatMap((node) => {
        const interpretation = sourceEdgeInterpretations?.get(node.id);
        if (!interpretation || interpretation.diagnostics.some((diagnostic) =>
          diagnostic.code.startsWith('coral.port.') || diagnostic.code === 'coral.symbol.unknown' ||
          diagnostic.code === 'coral.variant.unknown')) return [];
        const ports = interpretation.semanticPorts.map((port) => ({
          id: port.id, label: port.label ?? port.id, direction: port.direction,
        }));
        return [{ id: node.id, label: node.label ?? node.id,
          sourcePorts: ports.filter((port) => port.direction !== 'in'),
          targetPorts: ports.filter((port) => port.direction !== 'out'),
          portless: ports.length === 0, allowAutomaticAttachment: true }];
      })
      : []
    : flattenAuthoringNodes(authoringGraph).map((node) => ({
      id: node.id,
      label: node.label ?? node.id,
      sourcePorts: getAuthoringPortOptions(authoringGraph, notation, node.id, 'source'),
      targetPorts: getAuthoringPortOptions(authoringGraph, notation, node.id, 'target'),
      portless: isAuthoringNodePortless(node, notation),
    }));
  const authoringEdgeAvailable = authoringEndpoints.some((source) => (source.portless || source.sourcePorts.length > 0)
    && authoringEndpoints.some((target) => target.id !== source.id && (target.portless || target.targetPorts.length > 0)));
  const historyMutationLocked = llmChat.isMutationPending
    || structuralLayoutPendingRef.current !== null
    || sourceUpdateOwnerRef.current !== null;
  // Source history handlers can supersede their own pending parse; gestures cannot.
  const historyControlsLocked = llmChat.isMutationPending || structuralLayoutPendingRef.current !== null ||
    (!sourceOwned028 && sourceUpdateOwnerRef.current !== null);
  const sourceInspectorEditable = dslType === 'coral' && isAuthored028Source(dsl) && !llmChat.isMutationPending &&
    !sourceErrorsLockedRef.current && Boolean(lastParsedRef.current.sourceMeaning028) &&
    !lastParsedRef.current.sourceMeaning028?.interaction;
  const authoredMutationLocked = historyMutationLocked
    || sourceOwned028 || (dslType === 'mermaid' && mermaidFileSource) || dslType === 'dot' || dslType === 'plantuml';
  const foreignSource = (dslType === 'mermaid' && mermaidFileSource)
    || dslType === 'dot' || dslType === 'plantuml';
  const fontSettingsDisabled = llmChat.isMutationPending || updateRefusal('source-gesture') !== null
    || sourceErrorsLockedRef.current || foreignSource;
  const nodeCreationLocked = historyMutationLocked || foreignSource || (sourceOwned028 && !sourceNodeCreationReady);
  const edgeCreationLocked = historyMutationLocked || foreignSource || (sourceOwned028 && !sourceEdgeCreationReady);
  const sourceEdgeLabelEditable = dslType === 'coral' && isAuthored028Source(dsl) &&
    !historyMutationLocked && !sourceErrorsLockedRef.current &&
    unparsedUserTextRef.current === null && lastParsedRef.current.sourceText028 === dsl &&
    Boolean(lastParsedRef.current.sourceMeaning028);
  const sourceReflowReady = sourceOwned028 && !historyMutationLocked &&
    !isSequenceGraph(sourceGraphRef.current) &&
    !sourceErrorsLockedRef.current && unparsedUserTextRef.current === null &&
    lastParsedRef.current.sourceText028 === dsl &&
    Boolean(lastParsedRef.current.sourceMeaning028) &&
    lastParsedRef.current.nodes.length > 0;
  const sourceNodeDragEnabled = sourceOwned028 && !historyMutationLocked &&
    !sourceErrorsLockedRef.current && unparsedUserTextRef.current === null &&
    lastParsedRef.current.sourceText028 === dsl && Boolean(lastParsedRef.current.sourceMeaning028);
  // Rendered Reflow availability is derived from the passive owner that still
  // holds the pending publication, never from a bare leftover owner value.
  const passiveVisualPending = passiveVisualOwnsPublication(passiveVisualOwner);
  const openRefused = llmChat.isMutationPending || updateRefusal('open') !== null;
  const graphExportLabel = dslType === 'coral' && isAuthored028Source(dsl)
    ? 'Export GraphIR 4 candidate' : 'Export Graph-IR';

  // Command Palette commands
  const commands = useMemo<CommandItem[]>(() => [
    { id: 'create-node', label: 'Create Node', shortcut: 'Ctrl+Alt+N', category: 'Edit', transfersFocus: true, action: (context) => openAuthoring('node', context?.invoker ?? null), disabled: nodeCreationLocked },
    { id: 'create-edge', label: 'Create Edge', shortcut: 'Ctrl+Alt+E', category: 'Edit', transfersFocus: true, action: (context) => openAuthoring('edge', context?.invoker ?? null), disabled: edgeCreationLocked || !authoringEdgeAvailable },
    { id: 'reflow', label: 'Reflow Layout', shortcut: 'Ctrl+Shift+L', category: 'Layout', action: handleReflow,
      disabled: historyMutationLocked || passiveVisualPending || (sourceOwned028 && !sourceReflowReady) },
    { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', category: 'Layout', action: handleUndo, disabled: historyControlsLocked || !(dslType === 'coral' && isAuthored028Source(dsl) ? dslUndoCount > 0 : canUndo || dslUndoCount > 0) },
    { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', category: 'Layout', action: handleRedo, disabled: historyControlsLocked || !(dslType === 'coral' && isAuthored028Source(dsl) ? dslRedoCount > 0 : canRedo || dslRedoCount > 0) },
    { id: 'open', label: 'Open File', shortcut: 'Ctrl+O', category: 'File', action: chooseFileToOpen, disabled: openRefused },
    { id: 'check-conformance', label: 'Check Conformance', category: 'Editor',
      action: () => handleCheckConformance(), disabled: dslType !== 'coral' || !isAuthored028Source(dsl) },
    { id: 'save', label: 'Save Document', shortcut: 'Ctrl+S', category: 'File', action: handleSaveDownload },
    { id: 'export', label: graphExportLabel, category: 'File', action: handleExportGraphIR },
    { id: 'export-svg', label: 'Export SVG', category: 'File', action: handleExportSvg },
    { id: 'export-html', label: 'Export HTML', category: 'File', action: handleExportHtml },
    { id: 'export-png', label: 'Export PNG', category: 'File', action: handleExportPng },
    { id: 'export-jpg', label: 'Export JPEG', category: 'File', action: handleExportJpg },
    { id: 'format-mermaid', label: 'Switch to Mermaid', category: 'Editor', action: () => handleDslTypeChange('mermaid'), disabled: authoredMutationLocked || dslType === 'mermaid' },
    { id: 'format-coral', label: 'Switch to Coral DSL', category: 'Editor', action: () => handleDslTypeChange('coral'), disabled: authoredMutationLocked || dslType === 'coral' },
    { id: 'notation-flowchart', label: 'Notation: Flowchart', category: 'View', action: () => handleNotationChange('flowchart'), disabled: historyMutationLocked || notation === 'flowchart' },
    { id: 'notation-arch', label: 'Notation: Architecture', category: 'View', action: () => handleNotationChange('architecture'), disabled: historyMutationLocked || notation === 'architecture' },
    { id: 'notation-bpmn', label: 'Notation: BPMN', category: 'View', action: () => handleNotationChange('bpmn'), disabled: historyMutationLocked || notation === 'bpmn' },
    { id: 'notation-code', label: 'Notation: Code', category: 'View', action: () => handleNotationChange('code'), disabled: historyMutationLocked || notation === 'code' },
    { id: 'notation-block', label: 'Notation: Block', category: 'View', action: () => handleNotationChange('block'), disabled: historyMutationLocked || notation === 'block' },
    {
      id: 'toggle-inspector',
      label: inspectorCollapsed ? 'Show Inspector' : 'Hide Inspector',
      category: 'View',
      action: (context) => {
        propertiesInvokerRef.current = inspectorCollapsed ? context?.invoker ?? null : null;
        setInspectorCollapsed(!inspectorCollapsed);
      },
    },
    { id: 'preferences', label: 'Preferences', shortcut: 'Ctrl+,', category: 'View', transfersFocus: true, action: (context) => openPreferences(context?.invoker) },
    { id: 'welcome', label: 'Welcome and Examples', category: 'Help', transfersFocus: true, action: (context) => openGuidance('welcome', context?.invoker) },
    { id: 'help', label: 'Help', category: 'Help', transfersFocus: true, action: (context) => openGuidance('help', context?.invoker) },
    { id: 'about', label: 'About Coral', category: 'Help', transfersFocus: true, action: (context) => openGuidance('about', context?.invoker) },
  ], [authoredMutationLocked, nodeCreationLocked, edgeCreationLocked, historyMutationLocked, historyControlsLocked, dsl, openRefused, handleReflow, handleUndo, handleRedo, handleCheckConformance, handleSaveDownload, chooseFileToOpen, handleExportGraphIR, handleExportSvg, handleExportHtml, handleExportPng, handleExportJpg, canUndo, canRedo, dslUndoCount, dslRedoCount, dslType, notation, inspectorCollapsed, handleDslTypeChange, handleNotationChange, authoringEdgeAvailable, passiveVisualPending, sourceOwned028, sourceReflowReady, openAuthoring, openGuidance, openPreferences, graphExportLabel]);

  // Command Palette theme
  const commandPaletteTheme = useMemo<CommandPaletteTheme>(() => ({
    overlayBg: 'var(--coral-overlay)',
    bg: theme.inspectorBg,
    border: theme.inspectorBorder,
    text: theme.inspectorText,
    mutedText: theme.controlTextMuted,
    inputBg: theme.editorBg,
    inputText: theme.editorText,
    hoverBg: theme.controlBgHover,
    shortcutBg: theme.controlBg,
    shortcutText: theme.controlTextMuted,
  }), [theme]);

  const authoringTheme = useMemo<AuthoringDialogTheme>(() => ({
    overlayBg: 'var(--coral-overlay)',
    bg: theme.inspectorBg,
    border: theme.inspectorBorder,
    text: theme.inspectorText,
    mutedText: theme.controlTextMuted,
    inputBg: theme.editorBg,
    inputText: theme.editorText,
    buttonBg: theme.controlBgActive,
    buttonText: theme.controlText,
  }), [theme]);

  const viewTheme = theme as unknown as Record<string, string>;
  const visualLocked = () => {
    if (llmChat.isMutationPending) return true;
    if (refuseDuringUpdate('edit') !== null) return true;
    if ((dslType === 'mermaid' && mermaidFileSource) || dslType === 'dot' || dslType === 'plantuml') {
      setGuidanceAnnouncement('Edit the imported source text to change this diagram.');
      return true;
    }
    if (!sourceErrorsLockedRef.current) return false;
    setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
    return true;
  };
  const mutationLockMessage = updateRefusal('edit') ?? undefined;
  const mutationLockLabel = structuralLayoutPendingRef.current !== null ? STRUCTURAL_UPDATE_LABEL
    : sourceUpdateOwnerRef.current !== null ? SOURCE_UPDATE_LABEL : undefined;
  // Displayed update status (overlay) versus announced status (live region):
  // structural resolution does both; source ownership is displayed only, since
  // the user is typing; passive visual work shows only Reflow's disabled
  // reason. Refused attempts announce through guidanceAnnouncement.
  const canvasUpdateStatus: CanvasUpdateStatus | null = updateStatus.kind === 'structural-layout'
    ? { kind: 'structural-layout', message: UPDATE_REFUSAL_MESSAGES.structural }
    : updateStatus.kind === 'source-pending'
      ? { kind: 'source-pending', message: UPDATE_REFUSAL_MESSAGES.source }
      : null;
  const canvasStatusText = canvasUpdateStatus?.kind === 'structural-layout'
    ? canvasUpdateStatus.message
    : isReflowing ? 'Laying out the diagram' : debugInfo;
  const settledCanvasScene028 = useRef<{ scene?: PreparedSpatialScene028; error?: string;
    key?: string }>({});
  const canvasTransient028 = nodes.some((node) => node.dragging === true);
  const canvasSceneKey028 = JSON.stringify({ graph: sourceGraphRef.current.id,
    source: dsl, style: renderStyle0214, theme: theme === lightTheme ? 'light' : 'dark',
    font: documentSettings.font, layout: documentSettings.layout,
    fontRevision: renderInputRevisionRef028.current });
  const canvasScene028 = useMemo<{ scene?: PreparedSpatialScene028; error?: string }>(() => {
    if (waypointRouting.error) return { error: waypointRouting.error };
    if (canvasTransient028 && settledCanvasScene028.current.scene &&
      settledCanvasScene028.current.key === canvasSceneKey028) {
      // React Flow translates the owned node ink with its node container.
      // A live connector overlay follows the handles until pointer release;
      // then the settled graph gets one authoritative scene rebuild.
      return settledCanvasScene028.current;
    }
    if (isSequenceGraph(sourceGraphRef.current) || nodes.length === 0) return {};
    try {
      const graph = currentRenderGraph();
      if (!graph) return { error: 'render.capability.scene-unavailable: current graph has no resolved render scene' };
      const options = currentRenderOptions();
      requireCurrentSourcePortRoutes(options);
      return { scene: prepareSpatialScene028(graph, options) };
    } catch (error) {
      // A failed current scene must not leave the prior revision visible or
      // silently revive the 0.2.6 drawing bodies.
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [currentRenderGraph, currentRenderOptions, requireCurrentSourcePortRoutes,
    nodes, edges, dsl, documentSettings.font, renderStyle028, theme,
    canvasTransient028, canvasSceneKey028, waypointRouting.error]);
  useEffect(() => {
    if (!canvasTransient028) settledCanvasScene028.current = {
      ...canvasScene028, key: canvasSceneKey028,
    };
  }, [canvasScene028, canvasSceneKey028, canvasTransient028]);
  const sourceNodeWords028 = useMemo(() => [...approvedNotationTypeWords028(notation),
    ...(notation === 'uml-sequence' ? [] : ['group']), ...(notation === 'bpmn' ? ['event'] : [])], [notation]);
  // A flat sequence accepts only participants and actors: no Symbol list there.
  const symbolListOpen029 = authoringSession?.kind === 'node' && authoringSession.sourceText028 !== undefined &&
    notation !== 'uml-sequence';
  const userSymbols029 = lastParsedRef.current.sourceMeaning028?.userSymbols029;
  const symbolEntries029 = useMemo(() => {
    if (!symbolListOpen029) return undefined;
    const definitions = myIconsLibrary029.icons.map((icon) => icon.definition);
    const libraryCatalog = documentCatalog029(notation, definitions);
    const extra = definitions.flatMap((definition) => {
      const user = libraryCatalog.userSymbols.get(definition.symbolId);
      return user ? [userSymbolPaletteEntry029(user, 'library', definition)] : [];
    });
    return getSourceSymbolPaletteEntries029(notation, sourceNodeWords028, userSymbols029 ?? [], extra);
  }, [symbolListOpen029, notation, sourceNodeWords028, userSymbols029, myIconsLibrary029.icons]);
  return {
    /** Detached AI plan staging and commit (0.2.10 slice 40); P4 owns the request UI. */
    plan: planSurface,
    /** The opt-in on-device model (R-066); its code loads only by dynamic import behind the build constant. */
    onDevice: {
      enabled: onDeviceEnabled,
      onEnabledChange: changeOnDeviceEnabled,
      host: onDeviceHost,
    },
    myIcons: {
      open: myIconsOpen029, onClose: () => setMyIconsOpen029(false),
      themeName: theme === lightTheme ? 'light' as const : 'dark' as const,
      library: myIconsLibrary029, documentDefinitions: userSymbols029 ?? [],
      onPlace: (icon: MyIcon029, update = false) => commitSourceEdit029((source) => {
        let next = source;
        const old = lastParsedRef.current.sourceMeaning028?.userSymbols029?.find((item) => item.id === icon.definition.id);
        if (old && iconRecord029(old).digest !== icon.digest) {
          if (!update) throw new Error('Choose whether to keep or update the document icon revision.');
          next = editSourceOwnedSymbolDefinition029(next, old.symbolId, icon.definition);
        }
        const ids = new Set(flattenAuthoringNodes(authoringGraph).map((node) => node.id));
        let n = 1; while (ids.has(`icon${n}`)) n++;
        return appendSourceOwnedNode028(next, { id: `icon${n}`, type: sourceNodeWords028.find((word) => word !== 'group') ?? 'service',
          label: icon.definition.name, symbol: icon.definition.symbolId, definition: icon.definition });
      }),
    },
    edgeStyles,
    fontSettings: editorVisualFonts028(documentSettings.font, renderStyle028),
    rasterExportError,
    guidanceAnnouncement,
    openFailure,
    onDismissOpenFailure: () => setOpenFailure(null),
    sourceErrorsLocked,
    shell: { onDragOver: handleShellDragOver, onDrop: handleShellDrop },
    recovery: {
      hasData: hasRecoveryData,
      data: recoveryData,
      onRecover: () => { if (!llmChat.isMutationPending) handleApplyRecovery(); },
      onDiscard: () => { if (!llmChat.isMutationPending) discardRecovery(); },
    },
    header: {
      documentName,
      onDocumentNameChange: (name: string) => {
        if (llmChat.isMutationPending) return;
        replacementNeedsConfirmationRef.current = true;
        setDocumentName(name);
      },
      isDirty,
      lastSaveTime,
      inspectorCollapsed,
      onToggleInspector: () => {
        propertiesInvokerRef.current = null;
        setInspectorCollapsed((previous) => !previous);
      },
      onToggleCommandPalette: () => {
        setShowWelcome(false); setShowHelp(false); setShowAbout(false);
        setShowPreferences(false); setAuthoringSession(null);
        setShowCommandPalette((previous) => !previous);
      },
      onTogglePreferences: () => {
        if (showPreferences) setShowPreferences(false);
        else openPreferences(document.activeElement as HTMLElement | null);
      },
      onHelp: () => openGuidance('help'),
      onAbout: () => openGuidance('about'),
      onSave: handleHeaderSaveDocument,
      onLoad: (document: CoralDocument) => llmChat.isMutationPending ? false : replaceDocument(document),
      onOpenFile: openFile,
      onOpenFileError: reportOpenFileReadFailure,
      openAccept: OPEN_FILE_ACCEPT,
      overflowMenuOpen: showOverflowMenu,
      onToggleOverflowMenu: () => setShowOverflowMenu((previous) => !previous),
      overflowItems: [
        { label: 'My Icons', action: () => setMyIconsOpen029(true) },
        { label: graphExportLabel, action: handleExportGraphIR },
        { label: 'Export SVG', action: handleExportSvg },
        { label: 'Export HTML', action: handleExportHtml },
        { label: 'Export PNG', action: handleExportPng },
        { label: 'Export JPEG', action: handleExportJpg },
      ],
      theme: viewTheme,
    },
    themeName: theme === lightTheme ? 'light' as const : 'dark' as const,
    workspace: {
      preferences: workspacePreferences,
      onSourceWidthChange: setEditorWidthPct,
      onPropertiesWidthChange: (propertiesWidthPx: number) => workspaceStore.update({ propertiesWidthPx }),
      onBottomHeightChange: (bottomHeightPx: number) => workspaceStore.update({ bottomHeightPx }),
      onPropertiesTabChange: (propertiesTab: 'selection' | 'diagram') => workspaceStore.update({ propertiesTab }),
      onReset: workspaceStore.reset,
    },
    editorWidthPct,
    editor: {
      recoveredGraph,
      dsl,
      dslType,
      sourceOwnedImport: dslType === 'mermaid' && mermaidFileSource,
      isDslReadOnly: formatSwitchPending || llmChat.isMutationPending || structuralLayoutPendingRef.current !== null
        || graphIRPreviewSourceRef.current === dsl,
      isDslReadOnlyReason: graphIRPreviewSourceRef.current === dsl
        ? 'GraphIR interchange preview'
        : structuralLayoutPendingRef.current !== null ? STRUCTURAL_UPDATE_LABEL : undefined,
      parseErrors,
      editorAnalysis,
      entityHighlightingEnabled: userPreferences.editorEntityHighlighting === true,
      debugInfo,
      onDslChange: sourceTextEditRef.current = (nextDsl: string) => {
        if (llmChat.isMutationPending) return false;
        if (graphIRPreviewSourceRef.current === dslRef.current) {
          setGuidanceAnnouncement('GraphIR interchange preview is read-only; the GraphIR document remains authoritative.');
          return false;
        }
        // Source input coalesces during its own ownership; only structural
        // resolution refuses it.
        if (refuseDuringUpdate('source-edit') !== null) return false;
        const opaqueDiagnostics = formatSwitchDiagnosticsRef.current.filter((diagnostic) =>
          diagnostic.message.includes('[coral.source.opaque-field]'));
        if (opaqueDiagnostics.length > 0 && !window.confirm(
          `Editing Coral source will discard ${opaqueDiagnostics.length} unsupported opened field${opaqueDiagnostics.length === 1 ? '' : 's'}. Continue?`,
        )) return false;
        if (!sourceEditSessionRef.current) {
          pushContentHistory(captureCurrentGraph(), waypointMapRef.current);
          sourceEditSessionRef.current = true;
        }
        replacementNeedsConfirmationRef.current = true;
        acceptTextSource();
        // Positioned sequence insertion is bound to an exact timeline anchor.
        // A source edit invalidates its position; ordinary source dialogs
        // retain their explicit stale-snapshot refusal on submit.
        setAuthoringSession((current) => current?.afterMessageId !== undefined ? null : current);
        isLoadingDocumentRef.current = false;
        // Claim text provenance synchronously. A format/layout commit can
        // publish nodes before the debounced parse starts; its nodes effect
        // must not schedule a diagram-to-text print over this user input.
        const originRevision = ++textInputRevisionRef.current;
        textOriginOwnerRef.current = originRevision;
        setTextInputRevision(originRevision);
        cancelActiveGesture();
        invalidateEditIntent();
        const sourcePublication = revisions.beginSource();
        beginSourceUpdate(sourcePublication.sourceRevision);
        formatSwitchDiagnosticsRef.current = [];
        setFormatSwitchDiagnostics([]);
        unparsedUserTextRef.current = nextDsl;
        setDsl(nextDsl);
        return true;
      },
      onEditSessionStart: () => {
        // Focusing the editor is not a transaction. The first actual change
        // captures the before-state; blur/paste/cut/composition boundaries end it.
        if (llmChat.isMutationPending) sourceEditSessionRef.current = false;
      },
      onEditSessionEnd: () => { sourceEditSessionRef.current = false; },
      // handleDslTypeChange announces the AI, owner, and source-error refusals.
      onDslTypeChange: (type: DSLType) => handleDslTypeChange(type),
      bottomPanelTab,
      onBottomPanelTabChange: setBottomPanelTab,
      diagnosticsCollapsed,
      onToggleDiagnostics: () => setDiagnosticsCollapsed((previous) => !previous),
      diagnosticEntries,
      canCheckConformance: dslType === 'coral' && isAuthored028Source(dsl),
      onCheckConformance: handleCheckConformance,
      notificationLevel: userPreferences.notificationLevel,
      onNotificationLevelChange: (level: NotificationLevel) => updateUserPreferences({ notificationLevel: level }),
      conformanceReport: conformanceSnapshot?.source === dsl ? conformanceSnapshot.report : null,
      conformanceCheckError: conformanceSnapshot?.source === dsl ? conformanceSnapshot.error : undefined,
      conformanceNotChecked: conformanceSnapshot?.source === dsl ? conformanceSnapshot.notChecked : undefined,
      onDiagnosticHover: handleDiagnosticHover,
      onAskAboutDiagnostic: handleAskAboutDiagnostic,
      chatEntries: llmChat.chatEntries,
      turnCount: llmChat.turnCount,
      activityEntries,
      isGenerating: llmChat.isGenerating,
      hasApiKey: llmChat.hasApiKey,
      // A refused prompt reports false so the composer keeps the typed text;
      // the reason is also shown beside Send (TR94-C4-F1).
      onPromptSubmit: (prompt: string): boolean => {
        if (refuseDuringUpdate('ai-request') !== null) return false;
        void handleLlmPromptSubmit(prompt);
        return true;
      },
      promptDisabledReason: updateRefusal('ai-request') ?? undefined,
      onFixSourceError: () => { void handleSourceFix(); },
      onPinEdition029: () => {
        if (dslTypeRef.current !== 'coral' || !isAuthored028Source(dslRef.current) || llmChat.isMutationPending ||
          refuseDuringUpdate('source-gesture') !== null) return;
        try {
          sourceTextEditRef.current(pinSourceOwnedEdition029(dslRef.current));
          sourceEditSessionRef.current = false;
          setGuidanceAnnouncement('Pinned @coralVersion "0.2.9".');
        } catch (error) {
          setGuidanceAnnouncement(error instanceof Error ? error.message : String(error));
        }
      },
      onCancelGeneration: () => llmChat.abortActive('user'),
      onConfirmChatAction: (entryId: number) => {
        // Confirmation may mutate, so it follows the AI admission rule.
        // Source-owned drafts keep their exact text; source repair uses Fix.
        if (llmChat.isMutationPending || refuseDuringUpdate('ai-request') !== null) return;
        const currentEdges = edges.map((edge) => {
          const waypoints = waypointManager.waypointMap.get(edge.id);
          return waypoints?.length
            ? { ...edge, data: { ...edge.data, routingPoints: waypoints.map(({ x, y }) => ({ x, y })) } }
            : edge;
        });
        void llmChat.confirmAction(entryId, {
          nodes,
          edges: currentEdges,
          dsl,
          dslType,
          diagnostics: diagnosticEntries,
          notation,
          graph: handleGetDocument().content.graphIR,
          revision: revisions.currentLlm(),
        });
      },
      onCancelChatAction: llmChat.cancelAction,
      theme: viewTheme,
      themeName: theme === lightTheme ? 'light' as const : 'dark' as const,
    },
    gutter: {
      color: theme.inspectorBorder,
      activeColor: theme.controlBgActive,
    },
    canvas: {
      scene028: canvasScene028.scene,
      sceneError028: canvasScene028.error,
      sceneTransient028: canvasTransient028,
      renderStyle028: renderStyle0214,
      onRenderStyle028Change: setRenderStyle028,
      nodes: styledNodes,
      edges: styledEdges,
      onNodesChange: (changes: Parameters<typeof onNodesChange>[0]) => {
        const hasAuthoredChange = changes.some((change) => change.type !== 'select'
          && (change.type !== 'dimensions' || change.resizing === true));
        if (hasAuthoredChange && visualLocked()) {
          // XYFlow may batch selection/measurement with a refused gesture.
          // Preserve those view-only changes rather than making selection look
          // like it was accepted then silently lost.
          onNodesChange(changes.filter((change) => change.type === 'select'
            || (change.type === 'dimensions' && change.resizing !== true)));
          return;
        }
        if (changes.some((change) => change.type !== 'select' && change.type !== 'dimensions')) {
          replacementNeedsConfirmationRef.current = true;
        }
        onNodesChange(changes);
      },
      onNodeDragStart: () => { if (!visualLocked()) handleNodeDragStart(); },
      sourceNodeDragEnabled,
      onSourceNodeDrag: commitSourceNodePointerMove,
      onNodeKeyboardMove: (...args: Parameters<typeof handleNodeKeyboardMove>) => {
        if (commitSourceNodeKeyboardMove(...args)) return true;
        if (!visualLocked()) handleNodeKeyboardMove(...args);
        return false;
      },
      onNodeKeyboardMoveEnd: handleNodeKeyboardMoveEnd,
      onEdgesChange: (changes: Parameters<typeof onEdgesChange>[0]) => {
        if (changes.some((change) => change.type !== 'select') && visualLocked()) {
          onEdgesChange(changes.filter((change) => change.type === 'select'));
          return;
        }
        if (changes.some((change) => change.type !== 'select')) replacementNeedsConfirmationRef.current = true;
        onEdgesChange(changes);
      },
      onSelectionChange: handleSelectionChange,
      onLabelEdit: (nodeId: string, label: string) => {
        if (dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current)) {
          commitSourceNodeLabel(nodeId, label);
          return;
        }
        if (visualLocked()) return;
        replacementNeedsConfirmationRef.current = true;
        handleLabelEdit(nodeId, label);
      },
      edgeLabelEditable: sourceEdgeLabelEditable &&
        !lastParsedRef.current.sourceMeaning028?.interaction,
      edgeLabelSourceRevision: dsl,
      nodeLabelPlacementRevision: nodeLabelPlacementBasis(),
      onNodeLabelPlacementEdit: commitSourceNodeLabelPlacement,
      nodeLabelPlacementEditable: sourceEdgeLabelEditable && !lastParsedRef.current.sourceMeaning028?.interaction,
      onEdgeLabelEdit: commitSourceEdgeLabel,
      onEdgeLabelRemove: commitSourceEdgeLabelRemove,
      onReflow: () => { if (!llmChat.isMutationPending) handleReflow(); },
      onUndo: () => { if (!llmChat.isMutationPending) handleUndo(); },
      onRedo: () => { if (!llmChat.isMutationPending) handleRedo(); },
      canUndo: sourceOwned028 ? dslUndoCount > 0 : canUndo || dslUndoCount > 0,
      canRedo: sourceOwned028 ? dslRedoCount > 0 : canRedo || dslRedoCount > 0,
      undoCount: sourceOwned028 ? dslUndoCount : dslUndoCount + undoCount,
      redoCount: sourceOwned028 ? dslRedoCount : dslRedoCount + redoCount,
      isReflowing,
      isLoading: loading,
      mutationsDisabled: authoredMutationLocked,
      sourceReflowEnabled: sourceReflowReady,
      historyDisabled: historyControlsLocked,
      sourceConnectionsEnabled: dslType === 'coral' && isAuthored028Source(dsl) &&
        !historyMutationLocked && !sourceErrorsLockedRef.current &&
        unparsedUserTextRef.current === null && lastParsedRef.current.sourceText028 === dsl &&
        Boolean(lastParsedRef.current.sourceMeaning028 &&
          canAppendSourceOwnedEdge028(lastParsedRef.current.sourceMeaning028)),
      mutationDisabledReason: mutationLockMessage,
      reflowDisabled: passiveVisualPending || (sourceOwned028 && !sourceReflowReady),
      reflowDisabledReason: updateRefusal('reflow') ?? undefined,
      showMinimap: userPreferences.showMinimap,
      showControls: userPreferences.showControls,
      notation,
      onConnect: (...args: Parameters<typeof handleConnect>) => {
        if (dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current)) {
          if (llmChat.isMutationPending || refuseDuringUpdate('source-gesture') !== null) return;
          if (sourceErrorsLockedRef.current) {
            setGuidanceAnnouncement(SOURCE_ERRORS_LOCK_MESSAGE);
            return;
          }
          replacementNeedsConfirmationRef.current = true;
          return handleConnect(...args);
        }
        if (visualLocked()) return;
        replacementNeedsConfirmationRef.current = true;
        return handleConnect(...args);
      },
      onConnectStart: handleConnectStart,
      onConnectEnd: handleConnectEnd,
      isValidConnection,
      onReconnectStart,
      onReconnect: (...args: Parameters<typeof onReconnect>) => {
        if (visualLocked()) return;
        replacementNeedsConfirmationRef.current = true;
        return onReconnect(...args);
      },
      onReconnectEnd,
      onDeleteSelection: () => {
        if (dslTypeRef.current === 'coral' && isAuthored028Source(dslRef.current)) {
          handleDeleteSelection();
          return;
        }
        if (visualLocked()) return;
        replacementNeedsConfirmationRef.current = true;
        handleDeleteSelection();
      },
      focusRequest: canvasFocusRequest,
      statusText: canvasStatusText,
      updateStatus: canvasUpdateStatus,
      edgeStyles,
      theme: viewTheme,
    },
    sequence: isSequenceGraph(sourceGraphRef.current) ? {
      renderStyle028: renderStyle0214,
      onRenderStyle028Change: setRenderStyle028,
      graph: (() => {
        const accepted = lastParsedRef.current;
        if (accepted.sourceMeaning028?.interaction && accepted.sourceText028 === dsl &&
          !sourceErrorsLockedRef.current) return successorSequenceDisplay028(accepted.sourceMeaning028);
        return sourceGraphRef.current;
      })(),
      selected: sequenceSelection,
      error: sequenceError,
      mutationsDisabled: authoredMutationLocked || dslType !== 'coral',
      sourceMessageLabelEditable: sourceEdgeLabelEditable &&
        Boolean(lastParsedRef.current.sourceMeaning028?.interaction),
      onSourceMessageLabelEdit: commitSourceEdgeLabel,
      sourceMessageDeleteEditable: sourceEdgeLabelEditable &&
        Boolean(lastParsedRef.current.sourceMeaning028?.interaction),
      onSourceMessageDelete: commitSourceMessageDelete,
      sourceMessageInsertEditable: sourceEdgeCreationReady && authoringEdgeAvailable &&
        Boolean(lastParsedRef.current.sourceMeaning028?.interaction),
      onSourceAddMessageAfter: (messageId: string) => openAuthoring('edge',
        document.activeElement as HTMLElement | null, messageId),
      sourceParticipantLabelEditable: sourceEdgeLabelEditable &&
        Boolean(lastParsedRef.current.sourceMeaning028?.interaction),
      onSourceParticipantLabelEdit: commitSourceNodeLabel,
      sourceParticipantDeleteEditable: sourceEdgeLabelEditable &&
        Boolean(lastParsedRef.current.sourceMeaning028?.interaction),
      onSourceParticipantDelete: commitSourceParticipantDelete,
      onSelect: (selection: SequenceSelection | null) => {
        setSequenceSelection(selection);
      },
      onOperation: (operation: SequenceOperation) => commitSequenceOperation(operation),
      onDismissError: () => setSequenceError(null),
    } : null,
    inspector: inspectorCollapsed ? null : {
      restoreFocusTo: propertiesInvokerRef.current,
      selectedNode,
      selectedEdge,
      nodeLabelPlacementRevision: nodeLabelPlacementBasis(),
      onNodeLabelPlacementEdit: commitSourceNodeLabelPlacement,
      nodeLabelPlacementEditable: sourceEdgeLabelEditable && !lastParsedRef.current.sourceMeaning028?.interaction &&
        Boolean(selectedNode && parseInstalledDocument028(dsl).syntax.statements.some((item) =>
          item.kind === 'node' && item.qualifiedId === selectedNode.id && item.label?.value &&
          !lastParsedRef.current.nodes.find((node) => node.id === selectedNode.id)?.classifier)),
      nodeLabelPlacement: selectedNode ? lastParsedRef.current.nodes.find((node) => node.id === selectedNode.id)?.labelPlacement : undefined,
      sourceOwnedEdgeLabels: dslType === 'coral' && isAuthored028Source(dsl),
      edgeLabelEditable: sourceInspectorEditable,
      onEdgeLabelEdit: commitSourceEdgeLabel,
      onEdgeLabelRemove: commitSourceEdgeLabelRemove,
      // The last parse's view stays while committed text awaits its debounced
      // parse, so the field keeps focus while its next commit waits for readiness.
      ...(selectedNode && dslType === 'coral' && isAuthored028Source(dsl)
        ? inspectorNode029(lastParsedRef.current, selectedNode.id) : {}),
      onPortFieldsEdit029: (nodeId: string, portId: string, fields: { label?: string; maxConnections?: number }) =>
        commitSourceEdit029((source) => editSourceOwnedPortFields029(source, nodeId, portId, fields)),
      onSymbolDefinitionEdit029: (symbolId: string, next: SuccessorUserSymbol029) =>
        commitSourceEdit029((source) => editSourceOwnedSymbolDefinition029(source, symbolId, next)),
      // Not the transient update and pending parse after each commit: disabling
      // would blur the committed control; fields defer a same-revision request.
      sourceEditable029: sourceInspectorEditable,
      sourceCommitState029: { revision: revisions.currentSourceRevision(),
        readRevision: () => revisions.currentSourceRevision(), pending: sourceUpdateOwnerRef.current !== null ||
        unparsedUserTextRef.current !== null || lastParsedRef.current.sourceText028 !== dsl },
      selectionSummary,
      onDeselectNode: () => {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setSelectionSummary({ kind: 'none', count: 0 });
        onNodesChange(nodesRef.current.filter((node) => node.selected)
          .map((node) => ({ id: node.id, type: 'select' as const, selected: false })));
        onEdgesChange(edgesRef.current.filter((edge) => edge.selected)
          .map((edge) => ({ id: edge.id, type: 'select' as const, selected: false })));
      },
      documentSettings,
      selectedPreset,
      fontDraft,
      onFontDraftChange: updateFontDraft,
      documentKey: documentKeyRef.current,
      availableNotations,
      onDocumentSettingsChange: (...args: Parameters<typeof handleDocumentSettingsChange>) => {
        if (llmChat.isMutationPending) {
          setGuidanceAnnouncement(AI_MUTATION_LOCK_MESSAGE);
          return;
        }
        const sourceNotationChange = isAuthored028Source(dslRef.current) &&
          args[0].notation !== documentSettingsRef.current.notation;
        if (refuseDuringUpdate(sourceNotationChange ? 'source-edit' : 'edit') !== null) return;
        handleDocumentSettingsChange(...args);
      },
      onPresetChange: (...args: Parameters<typeof applyLayoutPreset>) => {
        if (visualLocked()) return;
        replacementNeedsConfirmationRef.current = true;
        return applyLayoutPreset(...args);
      },
      onApplyLayout: () => { if (!llmChat.isMutationPending) handleReflow(); },
      onApplyFont: (...args: Parameters<typeof handleApplyFont>) => handleApplyFont(...args),
      onPropertyChange: (...args: Parameters<typeof handlePropertyChange>) => {
        if (visualLocked()) return;
        replacementNeedsConfirmationRef.current = true;
        return handlePropertyChange(...args);
      },
      onAddProperty: (...args: Parameters<typeof handleAddProperty>) => {
        if (visualLocked()) return;
        replacementNeedsConfirmationRef.current = true;
        return handleAddProperty(...args);
      },
      onRemoveProperty: (...args: Parameters<typeof handleRemoveProperty>) => {
        if (visualLocked()) return;
        replacementNeedsConfirmationRef.current = true;
        return handleRemoveProperty(...args);
      },
      onPropertyEditSessionStart: (field: string) => {
        if (llmChat.isMutationPending || !selectedNodeId) return;
        const key = `${selectedNodeId}:${field}`;
        if (propertyEditSessionRef.current?.key !== key) {
          propertyEditSessionRef.current = { key, changed: false };
        }
      },
      onPropertyEditSessionEnd: (field: string) => {
        if (propertyEditSessionRef.current?.key === `${selectedNodeId}:${field}`) {
          propertyEditSessionRef.current = null;
        }
      },
      onPropertyEditSessionCancel: (field: string) => {
        const session = propertyEditSessionRef.current;
        if (session?.key !== `${selectedNodeId}:${field}`) return;
        propertyEditSessionRef.current = null;
        if (session.changed) handleUndo();
      },
      sourceFormat: dslType,
      sourceOwnedImport: dslType === 'mermaid' && mermaidFileSource,
      mutationsDisabled: authoredMutationLocked,
      fontSettingsDisabled,
      mutationDisabledReason: mutationLockMessage,
      mutationDisabledLabel: mutationLockLabel,
      onToggleNodePin: handleToggleNodePin,
      onReleaseNodePosition: handleReleaseNodePosition,
      onConvertToCoral: () => handleDslTypeChange('coral'),
      theme: viewTheme,
    },
    commandPalette: {
      isOpen: showCommandPalette,
      onClose: () => setShowCommandPalette(false),
      commands,
      theme: commandPaletteTheme,
    },
    welcome: {
      isOpen: showWelcome,
      linkedExample: exampleLink?.entry ?? null,
      exampleLinkError: exampleLink?.error ?? null,
      hasRecovery: hasRecoveryData,
      announcement: guidanceAnnouncement,
      onRecover: () => { if (!llmChat.isMutationPending) handleApplyRecovery(); },
      onDiscardRecovery: () => { if (!llmChat.isMutationPending) handleDiscardRecoveryFromWelcome(); },
      onBlank: (invoker: HTMLElement | null) => { if (!llmChat.isMutationPending) handleWelcomeBlank(invoker); },
      onExample: (example: string) => { if (!llmChat.isMutationPending) handleWelcomeExample(example); },
      // Every refusal names its reason here, so the dialog adds none (TR94-C4-F4).
      onOpenFile: (file: OpenFileInput) => {
        if (!llmChat.isMutationPending) return handleWelcomeOpenFile(file);
        setGuidanceAnnouncement(AI_OPEN_LOCK_MESSAGE);
        return false;
      },
      openFailure,
      onAnnouncement: setGuidanceAnnouncement,
      onClose: closeWelcome,
      restoreFocusTo: modalInvokerRef.current,
      shouldRestoreFocus: () => !focusSourceAfterWelcomeRef.current,
      theme: viewTheme,
    },
    help: {
      isOpen: showHelp,
      onClose: () => setShowHelp(false),
      onOpenWelcome: () => openGuidance('welcome'),
      restoreFocusTo: modalInvokerRef.current,
      theme: viewTheme,
    },
    about: {
      isOpen: showAbout,
      identity: readDisplayIdentity(),
      onClose: () => setShowAbout(false),
      restoreFocusTo: modalInvokerRef.current,
      theme: viewTheme,
    },
    authoring: authoringSession ? {
      kind: authoringSession.kind,
      invoker: authoringSession.invoker,
      sourceOwnedNode028: authoringSession.kind === 'node' && authoringSession.sourceText028 !== undefined,
      sourceOwnedEdge028: authoringSession.kind === 'edge' && authoringSession.sourceText028 !== undefined,
      positionedSequenceEdge028: authoringSession.afterMessageId !== undefined,
      nodeOptions: authoringSession.sourceText028 !== undefined
        ? sourceNodeWords028.map((id) => ({ id, label: id }))
        : getAuthoringNodeOptions(notation),
      ...(symbolEntries029 ? { symbolEntries029 } : {}),
      parentOptions: authoringSession.sourceText028 !== undefined
        ? flattenAuthoringNodes(authoringGraph).filter((node) => node.type === 'group')
          .map((node) => ({ id: node.id, label: node.label ?? node.id }))
        : getAuthoringParentOptions(authoringGraph, notation),
      endpoints: authoringEndpoints,
      // Only a submit that changed the document makes it confirm-protected
      // work; a refused or failed submit changed nothing (TR94-C5-F5).
      onSubmitNode: (...args: Parameters<typeof submitAuthoringNode>) => {
        if (llmChat.isMutationPending) return { ok: false as const, error: 'AI change is still being applied.' };
        const result = submitAuthoringNode(...args);
        if (result.ok) replacementNeedsConfirmationRef.current = true;
        return result;
      },
      onSubmitEdge: (...args: Parameters<typeof submitAuthoringEdge>) => {
        if (llmChat.isMutationPending) return { ok: false as const, error: 'AI change is still being applied.' };
        const result = submitAuthoringEdge(...args);
        if (result.ok) replacementNeedsConfirmationRef.current = true;
        return result;
      },
      onCancel: () => setAuthoringSession(null),
      theme: authoringTheme,
    } : null,
    preferences: {
      isOpen: showPreferences,
      onClose: () => setShowPreferences(false),
      restoreFocusTo: modalInvokerRef.current,
      userPreferences,
      onUserPreferencesChange: updateUserPreferences,
      transcriptPreferences: AI_FEATURES_AVAILABLE ? transcriptPreferences : undefined,
      onTranscriptPreferencesChange: updateTranscriptPreferences,
      onClearTranscripts: clearTranscriptArchives,
      transcriptArchives: transcriptArchives.map((archive) => ({
        id: archive.archiveId,
        updatedAt: archive.updatedAt,
        messageCount: archive.messages.length,
      })),
      associatedTranscriptId,
      onAssociateTranscript: associateTranscriptArchive,
      onClearCurrentTranscript: clearCurrentTranscript,
      onDeleteAssociatedTranscript: deleteAssociatedTranscript,
      notations: availableNotations.map((item) => ({ id: item.id, name: item.name })),
      llmProviders: AI_FEATURES_AVAILABLE ? llmChat.providers : [],
      llmApiKey: llmChat.apiKey,
      onLlmApiKeyChange: llmChat.setApiKey,
      onLlmApiKeyPersistenceChange: llmChat.setApiKeyPersistence,
      llmApiKeyPersistenceError: llmChat.apiKeyPersistenceError,
      onResetWorkspace: workspaceStore.reset,
      theme: viewTheme,
    },
  };
}
