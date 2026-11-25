/** Per-document catalog: the frozen installed snapshot plus an overlay of
 * edition 0.2.9 user symbols keyed `local.<id>`. The installed registries and
 * their pinned digests are never written. */
import type { UserSymbolDefinition } from '@coral-viz/language';
import { admitSvgArtwork029 } from './artwork/svgArtworkAdmission029.js';
import type { AdmittedSvgArtwork029 } from './artwork/svgArtworkModel029.js';
import type { CatalogSnapshot028 } from './interpretation028.js';
import { installedCatalogSnapshot028 } from './notations/index.js';
import { projectPortAnchor028 } from './portAnchorProjection028.js';
import type { ShapeDefinition, SymbolDefinition, SymbolPort } from './types.js';
import { resolveUserAnchor029, userOutlineShape029, type ResolvedUserAnchor029,
  type UserOutline029 } from './userSymbolGeometry029.js';

/** A parsed definition without source positions. Artwork text is optional for
 * resolution; drawing needs it. */
export type UserSymbolDefinitionView029 = Omit<UserSymbolDefinition, 'range' | 'artwork'> & {
  artwork?: { format: 'svg'; text: string };
};

export interface ResolvedUserSymbol029 {
  definition: UserSymbolDefinitionView029;
  outline: UserOutline029;
  /** Frozen synthetic outline; also the overlay shape. */
  shape: ShapeDefinition;
  /** Bundled-shaped view for shared consumers; no variants, defaults, marker or container. */
  symbol: SymbolDefinition;
  anchors: ReadonlyMap<string, ResolvedUserAnchor029>;
  /** Admitted artwork, when the definition carries its text; renderers refuse without it. */
  artwork029?: AdmittedSvgArtwork029;
}

export interface DocumentCatalog029 extends CatalogSnapshot028 {
  userSymbols: ReadonlyMap<string, ResolvedUserSymbol029>;
  /** Overlay shapes only, keyed `local.<id>`. */
  shapes: ReadonlyMap<string, ShapeDefinition>;
}

const sideNames = { N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST' } as const;

function resolveUserSymbol029(definition: UserSymbolDefinitionView029): ResolvedUserSymbol029 {
  const outline: UserOutline029 = Object.freeze({ symbolId: definition.symbolId, outline: definition.outline,
    width: definition.size.width, height: definition.size.height });
  const anchors = new Map<string, ResolvedUserAnchor029>();
  for (const anchor of definition.anchors) {
    const resolved = resolveUserAnchor029(outline, anchor);
    if (resolved.ok) anchors.set(anchor.id, Object.freeze(resolved.anchor));
  }
  // The stencil side hint of a port: its pinned side, or north when layout chooses.
  const side = (value: string | undefined): SymbolPort['anchor'] => {
    if (value === undefined) return 'NORTH';
    const projected = projectPortAnchor028(value);
    if (projected.kind === 'exact') return sideNames[projected.position[0] as 'N' | 'S' | 'E' | 'W'];
    if (projected.kind === 'symbol') return sideNames[anchors.get(projected.id)?.side ?? 'N'];
    return 'NORTH';
  };
  const symbol: SymbolDefinition = Object.freeze({
    id: definition.symbolId, name: definition.name,
    ...(definition.description !== undefined ? { description: definition.description } : {}),
    shape: definition.symbolId, tags: Object.freeze([...definition.tags]) as string[],
    ports: Object.freeze(definition.ports.map((port) => Object.freeze({ id: port.id, anchor: side(port.anchor),
      direction: port.direction, ...(port.label !== undefined ? { label: port.label } : {}),
      ...(port.maxConnections !== undefined ? { maxConnections: port.maxConnections } : {}) }))) as SymbolPort[],
  });
  const admitted = definition.artwork ? admitSvgArtwork029(definition.artwork.text) : undefined;
  return Object.freeze({ definition, outline, shape: userOutlineShape029(outline), symbol, anchors,
    ...(admitted?.ok ? { artwork029: admitted.artwork } : {}) });
}

const emptyCatalogs = new Map<string, DocumentCatalog029>();
const documentCatalogs = new WeakMap<readonly UserSymbolDefinitionView029[], Map<string, DocumentCatalog029>>();

/** One catalog per parse: memoized on the definitions array, so every consumer of one parse shares it. */
export function documentCatalog029(
  notationId: string, definitions: readonly UserSymbolDefinitionView029[],
): DocumentCatalog029 {
  const base = installedCatalogSnapshot028(notationId);
  if (!definitions.length) {
    let empty = emptyCatalogs.get(notationId);
    if (!empty) {
      empty = Object.freeze({ ...base, userSymbols: new Map(), shapes: new Map() });
      emptyCatalogs.set(notationId, empty);
    }
    return empty;
  }
  let byNotation = documentCatalogs.get(definitions);
  const cached = byNotation?.get(notationId);
  if (cached) return cached;
  const userSymbols = new Map(definitions.map((definition) =>
    [definition.symbolId, resolveUserSymbol029(definition)] as const));
  const catalog: DocumentCatalog029 = Object.freeze({
    ...base,
    symbols: new Map([...base.symbols, ...[...userSymbols].map(([id, user]) => [id, user.symbol] as const)]),
    allowedSymbolIds: new Set([...base.allowedSymbolIds, ...userSymbols.keys()]),
    userSymbols,
    shapes: new Map([...userSymbols].map(([id, user]) => [id, user.shape] as const)),
  });
  if (!byNotation) documentCatalogs.set(definitions, byNotation = new Map());
  byNotation.set(notationId, catalog);
  return catalog;
}

const interpretationCatalogs = new WeakMap<object, Map<string, DocumentCatalog029>>();

/** The document catalog implied by already-resolved interpretations: every
 * consumer that holds a parse's interpretation map can re-resolve its nodes
 * consistently without a separate catalog parameter. */
export function catalogForInterpretations029(
  notationId: string, interpretations: ReadonlyMap<string, { userSymbol029?: ResolvedUserSymbol029 }>,
): DocumentCatalog029 {
  let byNotation = interpretationCatalogs.get(interpretations);
  const cached = byNotation?.get(notationId);
  if (cached) return cached;
  const users = new Map<string, UserSymbolDefinitionView029>();
  for (const interpretation of interpretations.values()) {
    const user = interpretation.userSymbol029;
    if (user) users.set(user.definition.symbolId, user.definition);
  }
  const catalog = documentCatalog029(notationId, [...users.values()]);
  if (!byNotation) interpretationCatalogs.set(interpretations, byNotation = new Map());
  byNotation.set(notationId, catalog);
  return catalog;
}
