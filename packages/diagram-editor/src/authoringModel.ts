import type { ConnectionValidation, EdgeWaypoint } from '@coral-viz/viz';
import { symbolRegistry } from '@coral-viz/viz';
import {
  catalogShape029, documentCatalog029, resolveNotationNode028, searchSymbols, symbolCatalogEntries, type CatalogSnapshot028,
  type ResolvedUserSymbol029, type ShapeDefinition, type SuccessorUserSymbol029, type SymbolCatalogEntry,
  type SymbolDefinition,
} from '@coral-viz/render';
import type { NotationType } from './hooks/diagramUtils';
import {
  effectiveSymbolId as resolveEffectiveSymbolId,
  semanticTypeForSymbol,
} from './notationSemantics';
import type { GraphIR } from './printer';

type GraphNode = GraphIR['nodes'][number];

export interface AuthoringNodeOption {
  id: string;
  label: string;
}

export interface AuthoringPortOption {
  id: string;
  label: string;
  direction: 'in' | 'out' | 'inout';
}

export interface CreateAuthoringNodeInput {
  symbolId: string;
  label: string;
  parentId?: string;
}

export interface CreateAuthoringEdgeInput {
  id?: string;
  type?: string;
  sourceId: string;
  targetId: string;
  sourcePortId?: string;
  targetPortId?: string;
  label?: string;
}

export type AuthoringMutationResult =
  | { ok: true; id: string; graph: GraphIR }
  | { ok: false; error: string };

export type CheckAuthoringConnection = (
  sourceId: string,
  targetId: string,
  sourcePortId?: string,
  targetPortId?: string,
) => ConnectionValidation;

function walkNodes(nodes: GraphIR['nodes'], visit: (node: GraphNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walkNodes(node.children ?? [], visit);
  }
}

export function flattenAuthoringNodes(graph: GraphIR): GraphNode[] {
  const result: GraphNode[] = [];
  walkNodes(graph.nodes, (node) => result.push(node));
  return result;
}

/** Preserve authored positions without promoting computed canvas coordinates. */
export function preserveAuthoredNodePositions<T extends GraphNode>(
  nodes: T[], authoredGraph: GraphIR, pendingExactIds: ReadonlySet<string>,
): T[] {
  const authoredById = new Map<string, GraphNode>();
  for (const node of flattenAuthoringNodes(authoredGraph)) {
    if (!authoredById.has(node.id)) authoredById.set(node.id, node);
  }
  return nodes.map((node) => {
    const authored = authoredById.get(node.id);
    if (pendingExactIds.has(node.id)) return node;
    if (authored?.position) return { ...node, position: { ...authored.position } };
    const { position: _position, ...withoutComputedPosition } = node;
    return withoutComputedPosition as T;
  });
}

function effectiveSymbolId(node: GraphNode, notation: NotationType): string {
  return resolveEffectiveSymbolId(node, notation) ?? '';
}

function effectivePorts(node: GraphNode, notation: NotationType, catalog?: CatalogSnapshot028): AuthoringPortOption[] {
  // GraphIR 3 authored ports are a complete geometric list. The successor
  // semantic-port field will instead merge additively with catalog ports.
  if (node.ports !== undefined) {
    return node.ports.flatMap((port) => {
      const direction = port.properties?.direction ?? 'inout';
      return direction === 'in' || direction === 'out' || direction === 'inout'
        ? [{ id: port.id, label: port.label ?? port.id, direction }]
        : [];
    });
  }
  const interpretation = resolveNotationNode028(node, notation, catalog);
  if (interpretation.status === 'unknown-symbol' || interpretation.status === 'unknown-variant') return [];
  return interpretation.semanticPorts.map((port) => ({
    id: port.id,
    label: port.label ?? port.id,
    direction: port.direction,
  }));
}

/** A generic node without semantic ports still accepts an automatic attachment. */
export function isAuthoringNodePortless(node: GraphNode, notation: NotationType,
  catalog?: CatalogSnapshot028): boolean {
  if (node.ports !== undefined) return node.ports.length === 0;
  const interpretation = resolveNotationNode028(node, notation, catalog);
  if (interpretation.status === 'unknown-symbol' || interpretation.status === 'unknown-variant') return false;
  return interpretation.semanticPorts.length === 0;
}

export function getAuthoringNodeOptions(notation: NotationType): AuthoringNodeOption[] {
  return symbolRegistry.getByNotation(notation).map((symbol) => ({
    id: symbol.id,
    label: symbol.name,
  }));
}

/** One choice in the source-owned Create node dialog's Symbol list. */
export interface SymbolPaletteEntry029 {
  key: string;
  kind: 'bundled' | 'document' | 'library';
  /** Accessible name. */
  name: string;
  /** Bundled: the type word the entry writes. */
  typeWord?: string;
  /** Document and library: the `local.` ID the entry writes. */
  symbol?: string;
  /** Library only (C6): the definition placement adds when the document lacks it. */
  definition?: SuccessorUserSymbol029;
  /** Thumbnail: a bundled shape (a plain rectangle for a word without a symbol), or the resolved user symbol. */
  shape?: ShapeDefinition;
  user?: ResolvedUserSymbol029;
  /** Search entries keyed by `key`, built with the bundled name-tag rules. */
  search: readonly SymbolCatalogEntry[];
}

const searchEntries029 = (key: string,
  symbol: Pick<SymbolDefinition, 'id' | 'name' | 'tags' | 'variants'>): SymbolCatalogEntry[] =>
  symbolCatalogEntries([symbol]).map((entry) => ({ ...entry, symbolId: key }));

/** A palette entry for a resolved user symbol; C6 builds My Icons entries with it. */
export function userSymbolPaletteEntry029(user: ResolvedUserSymbol029, kind: 'document' | 'library',
  definition?: SuccessorUserSymbol029): SymbolPaletteEntry029 {
  const key = `${kind}:${user.definition.symbolId}`;
  return { key, kind, name: user.definition.name, symbol: user.definition.symbolId, user,
    ...(definition ? { definition } : {}), search: searchEntries029(key, user.symbol) };
}

/** Document definitions (unused included), then extra entries, then the offered bundled words. */
export function getSourceSymbolPaletteEntries029(
  notation: NotationType,
  words: readonly string[],
  definitions: readonly SuccessorUserSymbol029[],
  extra: readonly SymbolPaletteEntry029[] = [],
): SymbolPaletteEntry029[] {
  const catalog = documentCatalog029(notation, definitions);
  const bundled = words.map((word): SymbolPaletteEntry029 => {
    const key = `type:${word}`;
    const symbolId = catalog.typeSymbols.get(word);
    const symbol = symbolId ? catalog.symbols.get(symbolId) : undefined;
    return symbol
      ? { key, kind: 'bundled', name: symbol.name, typeWord: word, shape: catalogShape029(symbol.shape, catalog),
        search: searchEntries029(key, symbol) }
      : { key, kind: 'bundled', name: word, typeWord: word, shape: catalogShape029('rectangle', catalog),
        search: searchEntries029(key, { id: key, name: word, tags: [] }) };
  });
  return [...[...catalog.userSymbols.values()].map((user) => userSymbolPaletteEntry029(user, 'document')),
    ...extra, ...bundled];
}

/** Whole-tag search with `searchSymbols`; an empty query keeps every entry. */
export function searchSymbolPaletteEntries029(
  entries: readonly SymbolPaletteEntry029[], query: string,
): SymbolPaletteEntry029[] {
  if (!query.trim()) return [...entries];
  const keys = new Set(searchSymbols(query, entries.flatMap((entry) => entry.search)).map((item) => item.symbolId));
  return entries.filter((entry) => keys.has(entry.key));
}

export function getAuthoringParentOptions(
  graph: GraphIR,
  notation: NotationType,
): AuthoringNodeOption[] {
  return flattenAuthoringNodes(graph).flatMap((node) => {
    const symbol = symbolRegistry.get(effectiveSymbolId(node, notation));
    return symbol?.isContainer
      ? [{ id: node.id, label: node.label ?? node.id }]
      : [];
  });
}

export function getAuthoringPortOptions(
  graph: GraphIR,
  notation: NotationType,
  nodeId: string,
  endpoint: 'source' | 'target',
): AuthoringPortOption[] {
  const node = flattenAuthoringNodes(graph).find((candidate) => candidate.id === nodeId);
  if (!node) return [];
  return effectivePorts(node, notation).filter((port) => endpoint === 'source'
    ? port.direction === 'out' || port.direction === 'inout'
    : port.direction === 'in' || port.direction === 'inout');
}

export function resolveAuthoringPortId(
  graph: GraphIR,
  notation: NotationType,
  nodeId: string,
  endpoint: 'source' | 'target',
  rawPortId?: string | null,
): string | undefined {
  if (!rawPortId) return undefined;
  const ports = getAuthoringPortOptions(graph, notation, nodeId, endpoint);
  if (ports.some((port) => port.id === rawPortId)) return rawPortId;
  const suffix = endpoint === 'source' ? '-out' : '-in';
  if (!rawPortId.endsWith(suffix)) return rawPortId;
  const candidate = rawPortId.slice(0, -suffix.length);
  return ports.some((port) => port.id === candidate && port.direction === 'inout')
    ? candidate
    : rawPortId;
}

export function getAuthoringViewPortId(
  graph: GraphIR,
  notation: NotationType,
  nodeId: string,
  endpoint: 'source' | 'target',
  canonicalPortId?: string,
): string | undefined {
  if (!canonicalPortId) return undefined;
  const port = getAuthoringPortOptions(graph, notation, nodeId, endpoint)
    .find((candidate) => candidate.id === canonicalPortId);
  return port?.direction === 'inout'
    ? `${canonicalPortId}-${endpoint === 'source' ? 'out' : 'in'}`
    : canonicalPortId;
}

function slugId(label: string): string {
  const normalized = label.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'node';
}

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function suggestedTopLevelPosition(graph: GraphIR): { x: number; y: number } {
  if (graph.nodes.length === 0) return { x: 0, y: 0 };
  let right = 0;
  let top = Number.POSITIVE_INFINITY;
  for (const [index, node] of graph.nodes.entries()) {
    const x = node.position?.x ?? index * 200;
    const y = node.position?.y ?? index * 100;
    right = Math.max(right, x + (node.dimensions?.width ?? 150));
    top = Math.min(top, y);
  }
  return { x: right + 50, y: Number.isFinite(top) ? top : 0 };
}

function suggestedChildPosition(parent: GraphNode): { x: number; y: number } {
  const count = parent.children?.length ?? 0;
  return { x: 24 + (count % 2) * 140, y: 48 + Math.floor(count / 2) * 90 };
}

function appendChild(
  nodes: GraphIR['nodes'],
  parentId: string,
  child: GraphNode,
): GraphIR['nodes'] {
  return nodes.map((node) => node.id === parentId
    ? { ...node, children: [...(node.children ?? []), child] }
    : node.children
      ? { ...node, children: appendChild(node.children, parentId, child) }
      : node);
}

export function createAuthoringNode(
  graph: GraphIR,
  notation: NotationType,
  input: CreateAuthoringNodeInput,
): AuthoringMutationResult {
  const label = input.label.trim();
  if (!label) return { ok: false, error: 'Enter a node label.' };

  if (!getAuthoringNodeOptions(notation).some((option) => option.id === input.symbolId)) {
    return { ok: false, error: 'The selected symbol is no longer available in this notation.' };
  }
  const semanticType = semanticTypeForSymbol(input.symbolId, notation);
  if (!semanticType) {
    return { ok: false, error: 'The selected symbol has no semantic node type.' };
  }

  const currentNodes = flattenAuthoringNodes(graph);
  const parent = input.parentId
    ? currentNodes.find((node) => node.id === input.parentId)
    : undefined;
  if (input.parentId && !parent) {
    return { ok: false, error: 'The selected parent is no longer available.' };
  }
  if (parent && !symbolRegistry.get(effectiveSymbolId(parent, notation))?.isContainer) {
    return { ok: false, error: 'The selected parent is no longer a container.' };
  }

  const id = uniqueId(slugId(label), new Set(currentNodes.map((node) => node.id)));
  const node: GraphNode = {
    id,
    type: semanticType,
    symbol: input.symbolId,
    label,
    position: parent ? suggestedChildPosition(parent) : suggestedTopLevelPosition(graph),
    ...(parent ? { parent: parent.id } : {}),
    ...(notation === 'uml-class' ? { classifier: {
      kind: semanticType as 'class' | 'interface' | 'enum', name: label,
      compartments: [
        { id: 'name', kind: 'name' as const },
        ...(semanticType === 'enum'
          ? [{ id: 'literals', kind: 'literals' as const, items: [] }]
          : [{ id: 'attributes', kind: 'attributes' as const, items: [] }]),
      ],
    } } : {}),
  };
  return {
    ok: true,
    id,
    graph: {
      ...graph,
      ...(notation === 'uml-class' ? {
        profile: { id: 'uml' as const, kind: 'class' as const, version: '1.0.0' as const },
        metadata: { ...graph.metadata, notation: 'uml-class' },
      } : {}),
      nodes: parent ? appendChild(graph.nodes, parent.id, node) : [...graph.nodes, node],
      edges: [...graph.edges],
    },
  };
}

function invalidPortMessage(endpoint: 'source' | 'target'): string {
  return `The selected ${endpoint} port is no longer available for this connection.`;
}

export function createAuthoringEdge(
  graph: GraphIR,
  notation: NotationType,
  input: CreateAuthoringEdgeInput,
  checkConnection: CheckAuthoringConnection,
): AuthoringMutationResult {
  const source = flattenAuthoringNodes(graph).find((node) => node.id === input.sourceId);
  const target = flattenAuthoringNodes(graph).find((node) => node.id === input.targetId);
  if (!source) return { ok: false, error: 'The selected source node is no longer available.' };
  if (!target) return { ok: false, error: 'The selected target node is no longer available.' };
  if (source.id === target.id) return { ok: false, error: 'A node cannot connect to itself.' };

  const availableSourcePorts = getAuthoringPortOptions(graph, notation, source.id, 'source');
  const availableTargetPorts = getAuthoringPortOptions(graph, notation, target.id, 'target');
  const sourcePort = resolveAuthoringPortId(
    graph, notation, source.id, 'source', input.sourcePortId,
  );
  const targetPort = resolveAuthoringPortId(
    graph, notation, target.id, 'target', input.targetPortId,
  );
  // A portless node takes a port-less end; a node with ports needs a port of
  // the right direction (R-063 AC-3).
  const endOk = (node: GraphNode, port: string | undefined, available: AuthoringPortOption[]) =>
    isAuthoringNodePortless(node, notation)
      ? port === undefined
      : port !== undefined && available.some((option) => option.id === port);
  if (!endOk(source, sourcePort, availableSourcePorts)) {
    return { ok: false, error: invalidPortMessage('source') };
  }
  if (!endOk(target, targetPort, availableTargetPorts)) {
    return { ok: false, error: invalidPortMessage('target') };
  }
  if (graph.edges.some((edge) => edge.source === source.id && edge.target === target.id)) {
    return { ok: false, error: 'This connection already exists.' };
  }

  const validation = checkConnection(source.id, target.id, sourcePort, targetPort);
  if (!validation.valid || validation.reason === 'max-connections-exceeded') {
    return { ok: false, error: validation.message ?? 'This connection is not allowed.' };
  }

  const id = uniqueId(`${source.id}_to_${target.id}`, new Set(graph.edges.map((edge) => edge.id)));
  return {
    ok: true,
    id,
    graph: {
      ...graph,
      nodes: graph.nodes,
      edges: [...graph.edges, {
        id,
        source: source.id,
        target: target.id,
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(sourcePort !== undefined ? { sourcePort } : {}),
        ...(targetPort !== undefined ? { targetPort } : {}),
      }],
    },
  };
}

function cloneWaypointMap(
  waypoints: Map<string, EdgeWaypoint[]>,
): Map<string, EdgeWaypoint[]> {
  return new Map([...waypoints].map(([edgeId, points]) => [
    edgeId,
    points.map((point) => ({ ...point })),
  ]));
}

function collectRemovedNodeIds(nodes: GraphIR['nodes'], selected: Set<string>, removed: Set<string>): void {
  for (const node of nodes) {
    if (selected.has(node.id)) {
      walkNodes([node], (descendant) => removed.add(descendant.id));
    } else {
      collectRemovedNodeIds(node.children ?? [], selected, removed);
    }
  }
}

function withoutRemovedNodes(nodes: GraphIR['nodes'], removed: Set<string>): GraphIR['nodes'] {
  return nodes.flatMap((node) => removed.has(node.id)
    ? []
    : [{
        ...node,
        ...(node.children
          ? { children: withoutRemovedNodes(node.children, removed) }
          : {}),
      }]);
}

export function deleteAuthoringSelection(
  graph: GraphIR,
  waypoints: Map<string, EdgeWaypoint[]>,
  selectedNodeIds: string[],
  selectedEdgeIds: string[],
): { changed: boolean; graph: GraphIR; waypoints: Map<string, EdgeWaypoint[]> } {
  const removedNodes = new Set<string>();
  collectRemovedNodeIds(graph.nodes, new Set(selectedNodeIds), removedNodes);
  const selectedEdges = new Set(selectedEdgeIds);
  const removedEdges = new Set(graph.edges.filter((edge) => selectedEdges.has(edge.id)
    || removedNodes.has(edge.source) || removedNodes.has(edge.target)).map((edge) => edge.id));
  if (removedNodes.size === 0 && removedEdges.size === 0) {
    return { changed: false, graph, waypoints: cloneWaypointMap(waypoints) };
  }

  const nextWaypoints = new Map([...waypoints]
    .filter(([edgeId]) => !removedEdges.has(edgeId))
    .map(([edgeId, points]) => [edgeId, points.map((point) => ({ ...point }))]));
  return {
    changed: true,
    graph: {
      ...graph,
      nodes: withoutRemovedNodes(graph.nodes, removedNodes),
      edges: graph.edges.filter((edge) => !removedEdges.has(edge.id)),
    },
    waypoints: nextWaypoints,
  };
}
