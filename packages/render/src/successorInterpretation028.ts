import { approvedNotationTypeWords028, approvedNotationTypeWords0214,
  notationCatalogIdentity028, notationCatalogIdentity0214, notationRegistry,
  resolveNotationNode028 } from './notations/index.js';
import { HEADER_MANIFEST_028 } from '@coral-viz/language';
import type { NodeInterpretation028, NodeInterpretationInput028 } from './interpretation028.js';
import type { AnchorConstraint, SemanticPortInput } from './semanticPorts028.js';
import { namedSymbolAnchors028 } from './symbolAnchors028.js';
import { symbolRegistry } from './symbols/index.js';
import { documentCatalog029, type UserSymbolDefinitionView029 } from './documentCatalog029.js';
import type { ArtworkAdmissionCheck, DocumentSymbolDefinition } from '@graph-ir/core';
import { documentSymbolDefinition029, svgArtworkAdmissionCheck029 } from './graphIrDocumentSymbols029.js';
import type { SuccessorUserSymbol029 } from './successorSourceProjection028.js';
import type { SymbolPort } from './types.js';

/** Structural view of the reviewed GraphIR successor; no package release is required. */
export interface SuccessorNodeView028 {
  id: string;
  type: string;
  symbol?: string;
  variant?: string;
  semanticPorts?: readonly {
    id: string;
    direction: 'in' | 'out' | 'inout';
    label?: string;
    /** Edition 0.2.9 connection limit. */
    maxConnections?: number;
    anchor?:
      | { kind: 'auto' | 'side' | 'corner' }
      | { kind: 'exact'; position: 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' }
      | { kind: 'symbol'; id: string };
  }[];
  children?: readonly SuccessorNodeView028[];
}

export interface SuccessorGraphView028 {
  version: '4.0.0';
  profile?: { id: string; kind?: string; version: string };
  catalog?: { id: string; version: string; digest: string };
  conformanceLevel?: 'none' | 'typical' | 'strict';
  conformanceExceptions?: readonly {
    kind: 'explicit-symbol'; nodeId: string; symbol: string;
  }[];
  nodes: readonly SuccessorNodeView028[];
  /** Edition 0.2.9 document symbols in Coral form; GraphIR carries them as `documentCatalog`. */
  userSymbols029?: readonly UserSymbolDefinitionView029[];
}

function projectAnchor028(anchor: NonNullable<NonNullable<SuccessorNodeView028['semanticPorts']>[number]['anchor']>): AnchorConstraint {
  if (anchor.kind === 'exact') return anchor.position;
  if (anchor.kind === 'symbol') return { kind: 'symbol', id: anchor.id };
  return anchor.kind;
}

/** Preserve explicit `auto` and omitted anchors distinctly for source round trips. */
export function projectSuccessorNodeInput028(node: SuccessorNodeView028): NodeInterpretationInput028 {
  const authoredPorts: SemanticPortInput[] | undefined = node.semanticPorts?.map((port) => ({
    id: port.id,
    direction: port.direction,
    ...(port.label !== undefined ? { label: port.label } : {}),
    ...(port.maxConnections !== undefined ? { maxConnections: port.maxConnections } : {}),
    ...(port.anchor !== undefined ? { anchor: projectAnchor028(port.anchor) } : {}),
  }));
  return {
    id: node.id, type: node.type,
    ...(node.symbol !== undefined ? { symbol: node.symbol } : {}),
    ...(node.variant !== undefined ? { variant: node.variant } : {}),
    ...(authoredPorts !== undefined ? { authoredPorts } : {}),
  };
}

function profileId028(profile: NonNullable<SuccessorGraphView028['profile']>): string {
  if (profile.id !== 'uml') return profile.id;
  if (profile.kind === 'class' || profile.kind === 'sequence') return `uml-${profile.kind}`;
  throw new Error('Coral successor UML profile requires class or sequence kind');
}

type SnapshotPortView028 = { id: string; direction: 'in' | 'out' | 'inout'; maxConnections?: number };

export interface SuccessorCatalogSnapshotView028 {
  profile: { id: string; kind?: string; version: string };
  catalog: { id: string; version: string; digest: string };
  typeSymbols: Record<string, string>;
  allowedSymbolIds: string[];
  symbols: Record<string, {
    ports?: SnapshotPortView028[];
    anchors?: string[];
    variants?: Record<string, {
      ports?: SnapshotPortView028[];
      anchors?: string[];
    }>;
  }>;
}

const snapshotPorts028 = (ports: readonly SymbolPort[]): SnapshotPortView028[] =>
  ports.map(({ id, direction, maxConnections }) => ({ id, direction,
    ...(maxConnections !== undefined ? { maxConnections } : {}) }));

/** Exact installed interpretation snapshot for the local successor validator:
 * bundled symbols only, with their base and variant port limits. Document
 * symbols travel in the graph's `documentCatalog`, never in a snapshot. */
export function successorCatalogSnapshot028(graph: SuccessorGraphView028): SuccessorCatalogSnapshotView028 {
  // Reuse the same fail-closed profile and catalog identity check as the bridge.
  resolveSuccessorGraphNodes028({ ...graph, nodes: [] });
  const profile = graph.profile!;
  const id = profileId028(profile);
  const notation = notationRegistry.get(id)!;
  const expected0214 = notationCatalogIdentity0214(id);
  const use0214 = Boolean(expected0214 && graph.catalog?.version === expected0214.version &&
    graph.catalog?.digest === expected0214.digest &&
    (id === 'infrastructure' || id === 'erd' || expected0214.version !== notationCatalogIdentity028(id)?.version));
  const catalog0214 = use0214 ? documentCatalog029(id, [], '0.2.14') : undefined;
  const allAllowedSymbols = use0214 ? [...notation.symbols, ...(notation.symbols0214 ?? [])] : [...notation.symbols];
  const typeSymbols: Record<string, string> = {};
  for (const symbolId of allAllowedSymbols) typeSymbols[symbolId] = symbolId;
  for (const word of use0214 ? approvedNotationTypeWords0214(id) : approvedNotationTypeWords028(id)) {
    const symbolId = resolveNotationNode028({ id: 'catalog-probe', type: word }, id, catalog0214).effectiveSymbolId;
    if (!symbolId) throw new Error(`Installed type word ${word} has no symbol`);
    typeSymbols[word] = symbolId;
  }
  const symbols: SuccessorCatalogSnapshotView028['symbols'] = {};
  for (const symbol of symbolRegistry.getAll()) {
    const variants: NonNullable<SuccessorCatalogSnapshotView028['symbols'][string]['variants']> = {};
    for (const [variantId, variant] of Object.entries(symbol.variants ?? {})) {
      variants[variantId] = {
        ...(variant.ports ? { ports: snapshotPorts028(variant.ports) } : {}),
        anchors: namedSymbolAnchors028(symbol, variantId).map((anchor) => anchor.id),
      };
    }
    symbols[symbol.id] = {
      ...(symbol.ports ? { ports: snapshotPorts028(symbol.ports) } : {}),
      anchors: namedSymbolAnchors028(symbol, undefined).map((anchor) => anchor.id),
      ...(Object.keys(variants).length ? { variants } : {}),
    };
  }
  return { profile: { ...profile }, catalog: { ...graph.catalog! }, typeSymbols,
    allowedSymbolIds: allAllowedSymbols, symbols };
}

type CoreValidationNode029 = { semanticPorts?: readonly { maxConnections?: number }[];
  children?: readonly CoreValidationNode029[] };

/** The GraphIR 4 form of a source projection and its core validation input:
 * definitions become `documentCatalog`, the snapshot holds bundled symbols, and
 * Coral's artwork check discharges admission. Read paths (`limits: false`)
 * leave node-port and bundled limits to Coral's edition-scoped reader; export
 * passes `limits: true`. Never used for user-supplied GraphIR JSON. */
export function successorCoreValidationInput029<G extends SuccessorGraphView028 & {
  userSymbols029?: readonly SuccessorUserSymbol029[] }>(graph: G, { limits = false }: { limits?: boolean } = {}): {
  graph: Omit<G, 'userSymbols029'> & { documentCatalog?: DocumentSymbolDefinition[] };
  snapshot: SuccessorCatalogSnapshotView028;
  options: { artworkAdmission: readonly ArtworkAdmissionCheck[] };
} {
  const snapshot = successorCatalogSnapshot028(graph);
  const { userSymbols029: symbols, ...rest } = graph;
  const strip = <N extends CoreValidationNode029>(nodes: readonly N[]): N[] => nodes.map((node) => ({
    ...node,
    ...(node.semanticPorts ? { semanticPorts: node.semanticPorts.map(({ maxConnections: _limit, ...port }) => {
      void _limit;
      return port;
    }) } : {}),
    ...(node.children ? { children: strip(node.children) } : {}),
  }));
  if (!limits) for (const entry of Object.values(snapshot.symbols)) {
    for (const holder of [entry, ...Object.values(entry.variants ?? {})]) {
      if (holder.ports) holder.ports = holder.ports.map(({ id, direction }) => ({ id, direction }));
    }
  }
  return { graph: { ...rest, ...(limits ? {} : { nodes: strip(graph.nodes) }),
    ...(symbols?.length ? { documentCatalog: symbols.map(documentSymbolDefinition029) } : {}) } as
    Omit<G, 'userSymbols029'> & { documentCatalog?: DocumentSymbolDefinition[] },
  snapshot, options: { artworkAdmission: [svgArtworkAdmissionCheck029] } };
}

/**
 * Use a validated local successor graph with Coral's installed U1 resolver.
 * Exact catalog pinning prevents a local candidate from silently changing meaning.
 * This is a read-only interpretation bridge, not GraphIR 3 conversion or persistence.
 */
export function resolveSuccessorGraphNodes028(graph: SuccessorGraphView028): ReadonlyMap<string, NodeInterpretation028> {
  if (graph.version !== '4.0.0') throw new Error(`Unsupported GraphIR successor version ${graph.version}`);
  if (!graph.profile || !graph.catalog) throw new Error('Coral successor graph requires profile and catalog');
  const id = profileId028(graph.profile);
  const expected028 = notationCatalogIdentity028(id);
  const expected0214 = notationCatalogIdentity0214(id);
  const matches0214 = Boolean(expected0214 &&
    graph.catalog.id === expected0214.id &&
    graph.catalog.version === expected0214.version &&
    graph.catalog.digest === expected0214.digest &&
    HEADER_MANIFEST_028['0.2.14']?.[id]?.enabled !== false);
  const edition = matches0214 ? HEADER_MANIFEST_028['0.2.14']?.[id] : HEADER_MANIFEST_028['0.2.8']?.[id];
  if (edition?.enabled === false) throw new Error(`Coral notation ${id} is disabled in 0.2.8`);
  if (!edition?.profiles.some((profile) => profile.id === graph.profile!.id &&
    profile.kind === graph.profile!.kind && profile.version === graph.profile!.version)) {
    throw new Error(`Coral profile pin mismatch for ${id}`);
  }
  if (!edition.compatible.some(([profileVersion, catalogVersion]) =>
    profileVersion === graph.profile!.version && catalogVersion === graph.catalog!.version)) {
    throw new Error(`Coral profile/catalog pair mismatch for ${id}`);
  }
  const expected = matches0214 ? expected0214 : expected028;
  if (!expected || !notationRegistry.has(id)) throw new Error(`Coral notation ${id} is not installed`);
  if (graph.catalog.id !== expected.id || graph.catalog.version !== expected.version ||
    graph.catalog.digest !== expected.digest) {
    throw new Error(`Coral catalog pin mismatch for ${id}`);
  }
  const results = new Map<string, NodeInterpretation028>();
  const catalog = documentCatalog029(id, graph.userSymbols029 ?? [], matches0214 ? '0.2.14' : undefined);
  const visit = (nodes: readonly SuccessorNodeView028[]): void => {
    for (const node of nodes) {
      if (results.has(node.id)) throw new Error(`Duplicate successor node ${node.id}`);
      results.set(node.id, resolveNotationNode028(projectSuccessorNodeInput028(node), id, catalog));
      visit(node.children ?? []);
    }
  };
  visit(graph.nodes);
  return results;
}
