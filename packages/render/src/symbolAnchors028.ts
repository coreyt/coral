import type { NamedSymbolAnchor, SymbolDefinition } from './types.js';

/** These spellings already have generic anchor meaning in Coral source. */
const genericAnchorNames028 = new Set([
  'auto', 'side', 'corner', 'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW',
  'up', 'down', 'right', 'left',
]);

export class SymbolAnchorDefinitionError extends Error {
  readonly code = 'coral.catalog.anchor.invalid';
  constructor(readonly symbolId: string) {
    super(`coral.catalog.anchor.invalid: ${symbolId} has malformed named stencil anchors`);
    this.name = 'SymbolAnchorDefinitionError';
  }
}

export class UnknownSymbolAnchorError extends Error {
  readonly code = 'coral.port.anchor.symbol-unknown';
  constructor(readonly symbolId: string, readonly anchorId: string) {
    super(`coral.port.anchor.symbol-unknown: ${symbolId} has no named anchor ${anchorId}`);
    this.name = 'UnknownSymbolAnchorError';
  }
}

/** Resolve the selected variant's list as a replacement, never a merge. */
export function namedSymbolAnchors028(
  symbol: SymbolDefinition, variantId: string | undefined,
): readonly NamedSymbolAnchor[] {
  const variant = variantId === undefined ? undefined : symbol.variants?.[variantId];
  const anchors = variant?.namedAnchors !== undefined ? variant.namedAnchors
    : symbol.namedAnchors !== undefined ? symbol.namedAnchors : [];
  if (!Array.isArray(anchors)) throw new SymbolAnchorDefinitionError(symbol.id);
  const ids = new Set<string>();
  for (const anchor of anchors) {
    if (!anchor || typeof anchor.id !== 'string' ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(anchor.id) ||
      genericAnchorNames028.has(anchor.id) || ids.has(anchor.id) ||
      !['NORTH', 'SOUTH', 'EAST', 'WEST'].includes(anchor.side) ||
      !Number.isFinite(anchor.position) || anchor.position < 0 || anchor.position > 1) {
      throw new SymbolAnchorDefinitionError(symbol.id);
    }
    ids.add(anchor.id);
  }
  return anchors;
}

export function resolveNamedSymbolAnchor028(
  symbol: SymbolDefinition, variantId: string | undefined, anchorId: string,
): NamedSymbolAnchor {
  const anchor = namedSymbolAnchors028(symbol, variantId).find((item) => item.id === anchorId);
  if (!anchor) throw new UnknownSymbolAnchorError(symbol.id, anchorId);
  return anchor;
}
