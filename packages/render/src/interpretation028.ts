import type { SymbolDefinition } from './types.js';
import type { SemanticPortInput, ResolvedSemanticPort } from './semanticPorts028.js';
import { mergeSemanticPorts028 } from './semanticPorts028.js';
import { namedSymbolAnchors028, SymbolAnchorDefinitionError } from './symbolAnchors028.js';
import type { ResolvedUserSymbol029 } from './documentCatalog029.js';
import { projectPortAnchor028 } from './portAnchorProjection028.js';
import type { AnchorConstraint } from './semanticPorts028.js';

export interface CatalogSnapshot028 {
  identity: { id: string; version: string; digest: string };
  profileId: string;
  symbols: ReadonlyMap<string, SymbolDefinition>;
  allowedSymbolIds: ReadonlySet<string>;
  /** Approved profile vocabulary; missing types remain generic. */
  typeSymbols: ReadonlyMap<string, string>;
  /** Edition 0.2.9 document overlay, keyed `local.<id>`; see `documentCatalog029`. */
  userSymbols?: ReadonlyMap<string, ResolvedUserSymbol029>;
}

export interface NodeInterpretationInput028 {
  id: string;
  type: string;
  symbol?: string;
  variant?: string;
  /** Typed staging input until the GraphIR successor can persist it. */
  authoredPorts?: readonly SemanticPortInput[];
}

export interface NodeInterpretation028 {
  nodeId: string;
  authoredType: string;
  authoredSymbol?: string;
  authoredVariant?: string;
  effectiveSymbolId?: string;
  effectiveVariantId?: string;
  effectiveShapeId?: string;
  semanticPorts: readonly ResolvedSemanticPort[];
  /** Conflicting IDs are retained as integrity evidence, never projected. */
  portCollisions: readonly string[];
  /** Ports whose named catalog anchor could not be certified. */
  invalidAnchorPortIds: readonly string[];
  status: 'resolved' | 'generic' | 'unknown-symbol' | 'unknown-variant' | 'foreign-profile';
  diagnostics: readonly { code: string; message: string; portId?: string }[];
  provenance: readonly { field: 'symbol' | 'variant'; origin: 'authored' | 'profile'; value: string }[];
  catalogIdentity: CatalogSnapshot028['identity'];
  /** Resolved frame geometry when the effective symbol is a document user symbol. */
  userSymbol029?: ResolvedUserSymbol029;
}

function anchorConstraint029(value: string): AnchorConstraint {
  const projected = projectPortAnchor028(value);
  return projected.kind === 'exact' ? projected.position
    : projected.kind === 'symbol' ? { kind: 'symbol', id: projected.id } : projected.kind;
}

export function resolveNodeInterpretation028(
  node: NodeInterpretationInput028,
  catalog: CatalogSnapshot028,
): NodeInterpretation028 {
  const diagnostics: { code: string; message: string; portId?: string }[] = [];
  const provenance: NodeInterpretation028['provenance'][number][] = [];
  const explicit = node.symbol !== undefined;
  const symbolId = explicit ? node.symbol! : catalog.typeSymbols.get(node.type);
  if (symbolId !== undefined) provenance.push({ field: 'symbol', origin: explicit ? 'authored' : 'profile', value: symbolId });
  const symbol = symbolId === undefined ? undefined : catalog.symbols.get(symbolId);
  const user = symbol && symbolId !== undefined ? catalog.userSymbols?.get(symbolId) : undefined;
  if (symbolId !== undefined && !symbol) diagnostics.push({
    code: 'coral.symbol.unknown', message: `Unknown symbol ${symbolId}`,
  });
  if (symbol && !catalog.allowedSymbolIds.has(symbolId!)) diagnostics.push({
    code: 'coral.symbol.foreign-profile',
    message: `Symbol ${symbolId} is outside notation ${catalog.profileId}`,
  });
  const variant = node.variant === undefined ? undefined : symbol?.variants?.[node.variant];
  if (node.variant !== undefined) {
    provenance.push({ field: 'variant', origin: 'authored', value: node.variant });
    if (!variant) diagnostics.push({ code: 'coral.variant.unknown',
      message: `Unknown variant ${node.variant} for ${symbolId ?? node.type}` });
  }
  // Existing symbol-catalog anchor coordinates describe stencil geometry,
  // not authored semantic-port pins. A catalog port remains layout-dependent.
  // A user symbol's port anchors are authored pins and are kept.
  const inheritedPorts = node.variant !== undefined && !variant ? [] : (variant?.ports ?? symbol?.ports ?? []);
  const catalogPorts: SemanticPortInput[] = user && node.variant === undefined
    ? user.definition.ports.map((port) => ({ id: port.id, direction: port.direction,
      ...(port.label !== undefined ? { label: port.label } : {}),
      ...(port.maxConnections !== undefined ? { maxConnections: port.maxConnections } : {}),
      ...(port.anchor !== undefined ? { anchor: anchorConstraint029(port.anchor) } : {}) }))
    : inheritedPorts.map((port) => ({
      id: port.id, direction: port.direction,
      ...(port.label !== undefined ? { label: port.label } : {}),
      ...(port.maxConnections !== undefined ? { maxConnections: port.maxConnections } : {}),
    }));
  const merged = mergeSemanticPorts028(catalogPorts, node.authoredPorts ?? []);
  const invalidAnchorPortIds: string[] = [];
  if (symbol && (node.variant === undefined || variant)) {
    try {
      const names = new Set(user ? user.definition.anchors.map((anchor) => anchor.id)
        : namedSymbolAnchors028(symbol, node.variant).map((anchor) => anchor.id));
      for (const port of merged.ports) {
        if (typeof port.anchor !== 'object' || port.anchor.kind !== 'symbol') continue;
        if (names.has(port.anchor.id)) continue;
        invalidAnchorPortIds.push(port.id);
        diagnostics.push({ code: 'coral.port.anchor.symbol-unknown',
          message: `Symbol ${symbol.id} has no named anchor ${port.anchor.id} for port ${port.id}`,
          portId: port.id });
      }
    } catch (cause) {
      if (!(cause instanceof SymbolAnchorDefinitionError)) throw cause;
      diagnostics.push({ code: cause.code, message: cause.message });
      invalidAnchorPortIds.push(...merged.ports.filter((port) =>
        typeof port.anchor === 'object' && port.anchor.kind === 'symbol').map((port) => port.id));
    }
  } else if (symbolId === undefined) {
    for (const port of merged.ports) {
      if (typeof port.anchor !== 'object' || port.anchor.kind !== 'symbol') continue;
      invalidAnchorPortIds.push(port.id);
      diagnostics.push({ code: 'coral.port.anchor.symbol-unavailable',
        message: `Port ${port.id} on ${node.id} cannot use named anchor ${port.anchor.id} without an effective symbol`,
        portId: port.id });
    }
  }
  for (const id of merged.collisions) diagnostics.push({
    code: 'coral.port.duplicate', message: `Authored port ${id} collides with a catalog or earlier authored port`,
    portId: id,
  });
  const status: NodeInterpretation028['status'] = symbolId === undefined
    ? node.variant === undefined ? 'generic' : 'unknown-variant'
    : !symbol ? 'unknown-symbol'
      : node.variant !== undefined && !variant ? 'unknown-variant'
        : !catalog.allowedSymbolIds.has(symbolId) ? 'foreign-profile' : 'resolved';
  return {
    nodeId: node.id, authoredType: node.type,
    ...(explicit ? { authoredSymbol: node.symbol } : {}),
    ...(node.variant !== undefined ? { authoredVariant: node.variant } : {}),
    ...(symbol ? { effectiveSymbolId: symbol.id, effectiveShapeId: symbol.shape } : {}),
    ...(variant ? { effectiveVariantId: node.variant } : {}),
    // An unresolved catalog choice cannot supply inherited ports. Authored
    // semantic declarations remain known, but collision with an unavailable
    // catalog variant cannot be certified until that variant resolves.
    semanticPorts: status === 'unknown-symbol' || status === 'unknown-variant'
      ? merged.ports.filter((port) => port.origin === 'authored') : merged.ports,
    portCollisions: merged.collisions, invalidAnchorPortIds, status, diagnostics, provenance,
    catalogIdentity: { ...catalog.identity },
    ...(user && status === 'resolved' ? { userSymbol029: user } : {}),
  };
}
