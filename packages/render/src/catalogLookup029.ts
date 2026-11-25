/** Catalog-aware symbol and shape lookup. A `local.` ID resolves only through
 * a document catalog or a carried outline value, never a global registry. */
import type { CatalogSnapshot028, NodeInterpretation028 } from './interpretation028.js';
import type { Point } from './layout/types.js';
import { shapeRegistry } from './shapes/index.js';
import { symbolRegistry } from './symbols/index.js';
import type { ShapeDefinition, SymbolDefinition } from './types.js';
import { userOutlineShape029, type UserOutline029 } from './userSymbolGeometry029.js';

const isLocal = (id: string): boolean => id.startsWith('local.');

export function catalogSymbol029(symbolId: string, catalog?: CatalogSnapshot028): SymbolDefinition | undefined {
  if (catalog) return catalog.symbols.get(symbolId);
  return isLocal(symbolId) ? undefined : symbolRegistry.get(symbolId);
}

export function catalogShape029(shapeId: string, catalog?: CatalogSnapshot028): ShapeDefinition | undefined {
  return isLocal(shapeId) ? catalog?.userSymbols?.get(shapeId)?.shape : shapeRegistry.get(shapeId);
}

/** The drawn or contacted shape of a scene node; a user symbol carries its outline value. */
export function sceneNodeShape029(node: { shapeId: string; outline029?: UserOutline029 }): ShapeDefinition | undefined {
  if (node.outline029) return userOutlineShape029(node.outline029);
  return isLocal(node.shapeId) ? undefined : shapeRegistry.get(node.shapeId);
}

/** Vector from a port's attachment point to its interior anchor, in diagram units. */
export type EscapeOffset029 = Point;

/** The escape of an interior-anchored port: offset from attachment to interior point. */
export function portEscapeOffset029(
  interpretation: Pick<NodeInterpretation028, 'semanticPorts' | 'userSymbol029'> | undefined,
  portId: string | undefined,
): EscapeOffset029 | undefined {
  const user = interpretation?.userSymbol029;
  if (!user || portId === undefined) return undefined;
  const port = interpretation.semanticPorts.find((item) => item.id === portId);
  if (!port || typeof port.anchor !== 'object') return undefined;
  const anchor = user.anchors.get(port.anchor.id);
  if (!anchor?.interior) return undefined;
  return { x: (anchor.interior.x - anchor.attachment.x) * user.outline.width,
    y: (anchor.interior.y - anchor.attachment.y) * user.outline.height };
}

/** Escape offsets for each connector endpoint that names an interior-anchored port. */
export function escapeOffsets029(
  edge: { sourcePort?: string; targetPort?: string },
  source: Pick<NodeInterpretation028, 'semanticPorts' | 'userSymbol029'> | undefined,
  target: Pick<NodeInterpretation028, 'semanticPorts' | 'userSymbol029'> | undefined,
): { source?: EscapeOffset029; target?: EscapeOffset029 } {
  const from = portEscapeOffset029(source, edge.sourcePort);
  const to = portEscapeOffset029(target, edge.targetPort);
  return { ...(from ? { source: from } : {}), ...(to ? { target: to } : {}) };
}
