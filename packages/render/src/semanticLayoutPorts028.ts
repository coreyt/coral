import type { LayoutDirection, LayoutPort } from './layout/types.js';
import type { NodeInterpretation028 } from './interpretation028.js';
import { portAttachmentPolicy028 } from './portAttachment028.js';
import { shapeRegistry } from './shapes/index.js';
import { isSideCaptionDirection0211, stencilCaptionHeight028 } from './stencilLabelGeometry028.js';
import { stencilAnchorPoint028, stencilRayPoint028,
  StencilAnchorGeometryCapabilityError } from './stencilAnchorGeometry028.js';
import { resolveNamedSymbolAnchor028, UnknownSymbolAnchorError } from './symbolAnchors028.js';
import type { ShapeDefinition, SymbolDefinition } from './types.js';
import type { ResolvedUserSymbol029 } from './documentCatalog029.js';
import { userBoundaryAnchorPoint029, userCornerAnchorPoint029, userOutlineShape029 } from './userSymbolGeometry029.js';

export interface SemanticLayoutPorts028 {
  ports: LayoutPort[];
  sourceDefault?: string;
  targetDefault?: string;
}

const sideNames = { N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST' } as const;

export class SemanticPortCollisionError extends Error {
  readonly code = 'coral.port.duplicate';
  constructor(readonly nodeId: string, readonly portIds: readonly string[]) {
    super(`coral.port.duplicate: node ${nodeId} has conflicting semantic port IDs: ${portIds.join(', ')}`);
    this.name = 'SemanticPortCollisionError';
  }
}

export class SemanticPortResolutionCapabilityError extends Error {
  readonly code: 'render.capability.unknown-symbol' | 'render.capability.unknown-variant';
  constructor(readonly nodeId: string, status: 'unknown-symbol' | 'unknown-variant') {
    const code = status === 'unknown-symbol'
      ? 'render.capability.unknown-symbol' : 'render.capability.unknown-variant';
    super(`${code}: node ${nodeId} has no resolved symbol geometry for semantic-port attachment`);
    this.name = 'SemanticPortResolutionCapabilityError';
    this.code = code;
  }
}

export class CatalogProjectionMismatchError extends Error {
  readonly code = 'render.capability.catalog-mismatch';
  constructor(readonly nodeId: string) {
    super(`render.capability.catalog-mismatch: node ${nodeId} cannot project ports from a symbol or variant other than its U1 interpretation`);
    this.name = 'CatalogProjectionMismatchError';
  }
}

/** The contour of a layout port: a carried user outline, else an installed stencil.
 * A `local.` shape without its outline value is unavailable, never looked up globally. */
export function layoutPortShape029(port: Pick<LayoutPort, 'frameOutline029' | 'stencilShapeId' | 'freeStencil'>):
  ShapeDefinition | undefined {
  if (port.frameOutline029) return userOutlineShape029(port.frameOutline029);
  const shapeId = port.stencilShapeId ?? port.freeStencil?.shapeId;
  if (shapeId === undefined) return undefined;
  if (shapeId.startsWith('local.')) throw new StencilAnchorGeometryCapabilityError(shapeId);
  return shapeRegistry.get(shapeId);
}

/** User-symbol ports: authored anchors pin exact frame points; generic free ports keep layout choice. */
function userSymbolLayoutPorts029(
  interpretation: NodeInterpretation028, user: ResolvedUserSymbol029, direction: LayoutDirection,
): LayoutPort[] {
  const frameOutline029 = user.outline;
  const horizontalFlow = direction === 'RIGHT' || direction === 'LEFT';
  return interpretation.semanticPorts.map((port): LayoutPort => {
    if (typeof port.anchor === 'object') {
      const anchor = user.anchors.get(port.anchor.id);
      if (!anchor) throw new UnknownSymbolAnchorError(user.symbol.id, port.anchor.id);
      const side = sideNames[anchor.side];
      return { id: port.id, side, attachment: 'fixed', outlinePoint: anchor.attachment,
        position: side === 'NORTH' || side === 'SOUTH' ? anchor.attachment.x : anchor.attachment.y,
        frameOutline029, ...(anchor.interior ? { escape029: { interior: anchor.interior } } : {}) };
    }
    if (port.anchor === 'N' || port.anchor === 'S' || port.anchor === 'E' || port.anchor === 'W') {
      const outlinePoint = userBoundaryAnchorPoint029(user.outline, port.anchor, 0.5);
      const side = sideNames[port.anchor];
      return { id: port.id, side, attachment: 'fixed', outlinePoint,
        position: side === 'NORTH' || side === 'SOUTH' ? outlinePoint.x : outlinePoint.y, frameOutline029 };
    }
    if (port.anchor === 'NE' || port.anchor === 'NW' || port.anchor === 'SE' || port.anchor === 'SW') {
      const outlinePoint = userCornerAnchorPoint029(user.outline, port.anchor);
      return { id: port.id, attachment: 'fixed', outlinePoint, frameOutline029,
        side: horizontalFlow ? port.anchor.endsWith('E') ? 'EAST' : 'WEST'
          : port.anchor.startsWith('S') ? 'SOUTH' : 'NORTH',
        position: horizontalFlow ? outlinePoint.y : outlinePoint.x };
    }
    const policy = portAttachmentPolicy028(port, direction, port.direction === 'in' ? 'target' : 'source');
    const preferred = policy.preferred;
    return { id: port.id, attachment: 'free', frameOutline029, freeStencil: { shapeId: user.symbol.id },
      side: preferred && preferred in sideNames ? sideNames[preferred as keyof typeof sideNames] : 'SOUTH',
      ...(port.anchor === 'side' || port.anchor === 'corner' ? { attachmentClass: port.anchor } : {}) };
  });
}

/** One derived catalog-port projection for editor and SVG layout; never persisted.
 * A user symbol's interpretation supplies its own symbol and frame geometry. */
export function semanticLayoutPorts028(
  interpretation: NodeInterpretation028,
  catalogSymbol: SymbolDefinition | undefined,
  variant: string | undefined,
  direction: LayoutDirection,
): SemanticLayoutPorts028 {
  const symbol = interpretation.userSymbol029?.symbol ?? catalogSymbol;
  if (interpretation.portCollisions.length) {
    throw new SemanticPortCollisionError(interpretation.nodeId, interpretation.portCollisions);
  }
  if (interpretation.status === 'unknown-symbol' || interpretation.status === 'unknown-variant') {
    throw new SemanticPortResolutionCapabilityError(interpretation.nodeId, interpretation.status);
  }
  if (interpretation.effectiveSymbolId !== symbol?.id ||
    interpretation.effectiveVariantId !== variant) {
    throw new CatalogProjectionMismatchError(interpretation.nodeId);
  }
  if (interpretation.userSymbol029) return {
    ports: userSymbolLayoutPorts029(interpretation, interpretation.userSymbol029, direction),
    sourceDefault: interpretation.semanticPorts.find((port) => port.direction !== 'in')?.id,
    targetDefault: interpretation.semanticPorts.find((port) => port.direction !== 'out')?.id,
  };
  const registered = (variant ? symbol?.variants?.[variant]?.ports : undefined) ?? symbol?.ports;
  const defaults = { ...(symbol?.defaults ?? {}), ...(variant ? symbol?.variants?.[variant]?.defaults ?? {} : {}) };
  const cornerRadius = interpretation.effectiveShapeId === 'rectangle' &&
    typeof defaults.cornerRadius === 'number' ? defaults.cornerRadius : undefined;
  const ports: LayoutPort[] = interpretation.semanticPorts.map((port) => {
    if (typeof port.anchor === 'object' && port.anchor.kind === 'symbol') {
      if (!symbol || interpretation.effectiveSymbolId !== symbol.id) {
        throw new SemanticPortResolutionCapabilityError(interpretation.nodeId, 'unknown-symbol');
      }
      const named = resolveNamedSymbolAnchor028(symbol, variant, port.anchor.id);
      const shapeId = interpretation.effectiveShapeId ?? symbol.shape;
      const shape = shapeRegistry.get(shapeId);
      if (!shape) throw new StencilAnchorGeometryCapabilityError(shapeId);
      const toward = named.side === 'NORTH' ? { x: named.position, y: 0 }
        : named.side === 'SOUTH' ? { x: named.position, y: 1 }
          : named.side === 'EAST' ? { x: 1, y: named.position }
            : { x: 0, y: named.position };
      const outlinePoint = stencilRayPoint028(shape, toward,
        { cornerRadius, requireIntersection: true });
      return { id: port.id, side: named.side, attachment: 'fixed', outlinePoint, stencilShapeId: shapeId,
        ...(interpretation.effectiveSymbolId ? { stencilSymbolId: interpretation.effectiveSymbolId } : {}),
        position: named.side === 'NORTH' || named.side === 'SOUTH'
          ? outlinePoint.x : outlinePoint.y };
    }
    const endpoint = port.direction === 'in' ? 'target' : 'source';
    const shapeId = interpretation.effectiveShapeId ?? 'rectangle';
    const hasBottomCaption = !isSideCaptionDirection0211(direction)
      && stencilCaptionHeight028(shapeId, { symbolId: interpretation.effectiveSymbolId }) > 0;
    const policy = portAttachmentPolicy028(port, direction, endpoint, { hasBottomCaption });
    const preferred = policy.preferred;
    const needsContour = policy.fixed || port.anchor === 'corner';
    const shape = needsContour ? shapeRegistry.get(shapeId) : undefined;
    if (needsContour && !shape) throw new StencilAnchorGeometryCapabilityError(shapeId);
    if (port.anchor === 'corner' && shape) stencilAnchorPoint028(shape, 'NE', { cornerRadius });
    const freeShape = policy.fixed ? undefined : shape ?? shapeRegistry.get(shapeId);
    if (!policy.fixed && !freeShape) throw new StencilAnchorGeometryCapabilityError(shapeId);
    const freeStencil = freeShape
      ? { shapeId, ...(cornerRadius !== undefined ? { cornerRadius } : {}) } : undefined;
    const outlinePoint = policy.fixed && shape
      ? stencilAnchorPoint028(shape, port.anchor as NonNullable<typeof preferred>, { cornerRadius }) : undefined;
    const catalogPort = registered?.find((item) => item.id === port.id);
    if (port.anchor === 'NE' || port.anchor === 'NW' || port.anchor === 'SE' || port.anchor === 'SW') {
      const horizontalFlow = direction === 'RIGHT' || direction === 'LEFT';
      const east = port.anchor.endsWith('E');
      const south = port.anchor.startsWith('S');
      return { id: port.id, attachment: 'fixed', stencilShapeId: shapeId,
        ...(interpretation.effectiveSymbolId ? { stencilSymbolId: interpretation.effectiveSymbolId } : {}),
        side: horizontalFlow ? east ? 'EAST' : 'WEST' : south ? 'SOUTH' : 'NORTH',
        position: horizontalFlow ? outlinePoint!.y : outlinePoint!.x,
        outlinePoint };
    }
    const side = preferred && preferred in sideNames
      ? sideNames[preferred as keyof typeof sideNames]
      : catalogPort?.anchor ?? 'SOUTH';
    return { id: port.id, side, stencilShapeId: shapeId,
      ...(interpretation.effectiveSymbolId ? { stencilSymbolId: interpretation.effectiveSymbolId } : {}),
      attachment: port.anchor === 'auto' || port.anchor === 'side' || port.anchor === 'corner' ? 'free' : 'fixed',
      ...(outlinePoint ? { outlinePoint } : {}),
      ...(freeStencil ? { freeStencil } : {}),
      ...(port.anchor === 'side' || port.anchor === 'corner'
        ? { attachmentClass: port.anchor } : {}),
      ...(outlinePoint ? { position: side === 'NORTH' || side === 'SOUTH' ? outlinePoint.x : outlinePoint.y }
        : catalogPort?.position !== undefined ? { position: catalogPort.position } : {}) };
  });
  return {
    ports,
    sourceDefault: interpretation.semanticPorts.find((port) => port.direction !== 'in')?.id,
    targetDefault: interpretation.semanticPorts.find((port) => port.direction !== 'out')?.id,
  };
}
