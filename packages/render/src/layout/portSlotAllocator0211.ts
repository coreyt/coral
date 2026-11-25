/**
 * Coral 0.2.11 Slice 40 (ADR Stage 3): Contour-Aware Multi-Slot Port Allocator.
 *
 * Declares safe attachable contour spans [min, max] along NORTH, SOUTH, EAST,
 * and WEST for every catalog shape in shapeRegistry (32/32), computes exact
 * multi-slot port capacities (DRQ-17 >= 12 px preferred, >= 4 px floor),
 * projects every slot onto the true rendered contour via stencilRayPoint028 /
 * frameFitPoint029, and selects flow-adaptive sides respecting DRQ-16
 * (no free attachment through a bottom caption).
 */
import type { Point, LayoutDirection } from './types.js';
import { shapeRegistry } from '../shapes/index.js';
import { notationRegistry } from '../notations/index.js';
import { catalogShape029, catalogSymbol029 } from '../catalogLookup029.js';
import { stencilRayPoint028, stencilFitPoint028 } from '../stencilAnchorGeometry028.js';
import { CANONICAL_GLYPH_BOX_0210, isSideCaptionDirection0211, stencilCaptionHeight028 } from '../stencilLabelGeometry028.js';

export type CardinalSide0211 = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

export interface SideSpan0211 {
  /** Normalized start coordinate along the side (0..1). */
  readonly min: number;
  /** Normalized end coordinate along the side (0..1). */
  readonly max: number;
}

export type ShapeSideSpans0211 = Readonly<Record<CardinalSide0211, SideSpan0211>>;

const RECT_SPANS: ShapeSideSpans0211 = {
  NORTH: { min: 0.14, max: 0.86 },
  SOUTH: { min: 0.14, max: 0.86 },
  EAST: { min: 0.16, max: 0.84 },
  WEST: { min: 0.16, max: 0.84 },
};

const ROUND_SPANS: ShapeSideSpans0211 = {
  NORTH: { min: 0.22, max: 0.78 },
  SOUTH: { min: 0.22, max: 0.78 },
  EAST: { min: 0.22, max: 0.78 },
  WEST: { min: 0.22, max: 0.78 },
};

/**
 * Safe normalized attachable ranges per cardinal side for all 32 catalog shapes.
 * Ranges avoid sharp vertices, decorative caps, waves, roofs, and tails so
 * distributed multi-port attachments land cleanly on solid visible contours.
 */
export const SHAPE_SIDE_SPANS_0211: Readonly<Record<string, ShapeSideSpans0211>> = {
  rectangle: RECT_SPANS,
  'text-box': RECT_SPANS,
  subroutine: RECT_SPANS,
  'sketch-rect': RECT_SPANS,
  'sketch-rounded-rect': RECT_SPANS,
  stadium: {
    NORTH: { min: 0.22, max: 0.78 },
    SOUTH: { min: 0.22, max: 0.78 },
    EAST: { min: 0.25, max: 0.75 },
    WEST: { min: 0.25, max: 0.75 },
  },
  diamond: {
    NORTH: { min: 0.34, max: 0.66 },
    SOUTH: { min: 0.34, max: 0.66 },
    EAST: { min: 0.34, max: 0.66 },
    WEST: { min: 0.34, max: 0.66 },
  },
  'sketch-diamond': {
    NORTH: { min: 0.34, max: 0.66 },
    SOUTH: { min: 0.34, max: 0.66 },
    EAST: { min: 0.34, max: 0.66 },
    WEST: { min: 0.34, max: 0.66 },
  },
  ellipse: ROUND_SPANS,
  'sketch-oval': ROUND_SPANS,
  cylinder: {
    NORTH: { min: 0.22, max: 0.78 },
    SOUTH: { min: 0.22, max: 0.78 },
    EAST: { min: 0.24, max: 0.78 },
    WEST: { min: 0.24, max: 0.78 },
  },
  parallelogram: {
    NORTH: { min: 0.24, max: 0.76 },
    SOUTH: { min: 0.24, max: 0.76 },
    EAST: { min: 0.16, max: 0.84 },
    WEST: { min: 0.16, max: 0.84 },
  },
  hexagon: {
    NORTH: { min: 0.28, max: 0.72 },
    SOUTH: { min: 0.28, max: 0.72 },
    EAST: { min: 0.28, max: 0.72 },
    WEST: { min: 0.28, max: 0.72 },
  },
  document: {
    NORTH: { min: 0.14, max: 0.86 },
    SOUTH: { min: 0.16, max: 0.84 },
    EAST: { min: 0.16, max: 0.78 },
    WEST: { min: 0.16, max: 0.82 },
  },
  trapezoid: {
    NORTH: { min: 0.24, max: 0.76 },
    SOUTH: { min: 0.14, max: 0.86 },
    EAST: { min: 0.20, max: 0.80 },
    WEST: { min: 0.20, max: 0.80 },
  },
  triangle: {
    NORTH: { min: 0.42, max: 0.58 },
    SOUTH: { min: 0.16, max: 0.84 },
    EAST: { min: 0.32, max: 0.82 },
    WEST: { min: 0.32, max: 0.82 },
  },
  cloud: {
    NORTH: { min: 0.24, max: 0.76 },
    SOUTH: { min: 0.20, max: 0.80 },
    EAST: { min: 0.26, max: 0.76 },
    WEST: { min: 0.26, max: 0.76 },
  },
  note: {
    NORTH: { min: 0.14, max: 0.74 },
    SOUTH: { min: 0.14, max: 0.86 },
    EAST: { min: 0.26, max: 0.86 },
    WEST: { min: 0.14, max: 0.86 },
  },
  actor: {
    NORTH: { min: 0.38, max: 0.62 },
    SOUTH: { min: 0.22, max: 0.78 },
    EAST: { min: 0.22, max: 0.62 },
    WEST: { min: 0.22, max: 0.62 },
  },
  brain: {
    NORTH: { min: 0.24, max: 0.76 },
    SOUTH: { min: 0.24, max: 0.76 },
    EAST: { min: 0.24, max: 0.76 },
    WEST: { min: 0.24, max: 0.76 },
  },
  cube: {
    NORTH: { min: 0.24, max: 0.84 },
    SOUTH: { min: 0.14, max: 0.76 },
    EAST: { min: 0.22, max: 0.82 },
    WEST: { min: 0.24, max: 0.86 },
  },
  chip: {
    NORTH: { min: 0.20, max: 0.80 },
    SOUTH: { min: 0.20, max: 0.80 },
    EAST: { min: 0.20, max: 0.80 },
    WEST: { min: 0.20, max: 0.80 },
  },
  'chat-bubble': {
    NORTH: { min: 0.16, max: 0.84 },
    SOUTH: { min: 0.30, max: 0.84 },
    EAST: { min: 0.18, max: 0.68 },
    WEST: { min: 0.18, max: 0.68 },
  },
  shield: {
    NORTH: { min: 0.22, max: 0.78 },
    SOUTH: { min: 0.40, max: 0.60 },
    EAST: { min: 0.16, max: 0.62 },
    WEST: { min: 0.16, max: 0.62 },
  },
  'neural-net': {
    NORTH: { min: 0.18, max: 0.82 },
    SOUTH: { min: 0.18, max: 0.82 },
    EAST: { min: 0.18, max: 0.82 },
    WEST: { min: 0.18, max: 0.82 },
  },
  gear: {
    NORTH: { min: 0.28, max: 0.72 },
    SOUTH: { min: 0.28, max: 0.72 },
    EAST: { min: 0.28, max: 0.72 },
    WEST: { min: 0.28, max: 0.72 },
  },
  funnel: {
    NORTH: { min: 0.16, max: 0.84 },
    SOUTH: { min: 0.42, max: 0.58 },
    EAST: { min: 0.12, max: 0.44 },
    WEST: { min: 0.12, max: 0.44 },
  },
  warehouse: {
    NORTH: { min: 0.34, max: 0.66 },
    SOUTH: { min: 0.14, max: 0.86 },
    EAST: { min: 0.36, max: 0.88 },
    WEST: { min: 0.36, max: 0.88 },
  },
  lake: {
    NORTH: { min: 0.18, max: 0.82 },
    SOUTH: { min: 0.18, max: 0.82 },
    EAST: { min: 0.24, max: 0.84 },
    WEST: { min: 0.24, max: 0.84 },
  },
  pipe: {
    NORTH: { min: 0.18, max: 0.82 },
    SOUTH: { min: 0.18, max: 0.82 },
    EAST: { min: 0.20, max: 0.80 },
    WEST: { min: 0.20, max: 0.80 },
  },
  wave: {
    NORTH: { min: 0.16, max: 0.84 },
    SOUTH: { min: 0.16, max: 0.84 },
    EAST: { min: 0.20, max: 0.80 },
    WEST: { min: 0.20, max: 0.80 },
  },
  dashboard: {
    NORTH: { min: 0.14, max: 0.86 },
    SOUTH: { min: 0.14, max: 0.86 },
    EAST: { min: 0.16, max: 0.84 },
    WEST: { min: 0.16, max: 0.84 },
  },
};

export function shapeSideSpan0211(shapeId: string, side: CardinalSide0211): SideSpan0211 {
  return SHAPE_SIDE_SPANS_0211[shapeId]?.[side] ?? RECT_SPANS[side];
}

/**
 * Maximum number of clean non-colliding port slots along `side` for a glyph of
 * dimensions (glyphWidth x glyphHeight) at `minPitchPx` spacing (DRQ-17: 12 px).
 */
export function shapePortCapacity0211(
  shapeId: string,
  side: CardinalSide0211,
  glyphWidth: number,
  glyphHeight: number,
  minPitchPx = 12,
): number {
  const span = shapeSideSpan0211(shapeId, side);
  const sideExtent = (side === 'NORTH' || side === 'SOUTH' ? glyphWidth : glyphHeight) * Math.max(0, span.max - span.min);
  if (sideExtent < minPitchPx) return 1;
  return Math.max(1, Math.floor(sideExtent / minPitchPx) + 1);
}

export interface AllocatedPortSlot0211 {
  readonly index: number;
  readonly side: CardinalSide0211;
  /** Normalized coordinate along `side` (0..1). */
  readonly position: number;
  /** Normalized contour point in the node's composite frame (0..1 x 0..1). */
  readonly framePoint: Point;
  /** Local pixel point inside the node's composite box (width x height). */
  readonly localPoint: Point;
}

export interface PortSlotAllocation0211 {
  readonly side: CardinalSide0211;
  readonly slots: readonly AllocatedPortSlot0211[];
  readonly pitchPx: number;
  /** True when `count` exceeds the preferred 12 px clean capacity on this side. */
  readonly exceedsPreferredCapacity: boolean;
  /** Recommended secondary sides if caller chooses to spill excess slots. */
  readonly spillSides: readonly CardinalSide0211[];
}

/**
 * Symmetrically allocate `count` contour-fitted port slots on `side` for a
 * node of composite size (nodeWidth x nodeHeight).
 */
export function allocateSidePortSlots0211(
  shapeId: string,
  side: CardinalSide0211,
  count: number,
  nodeWidth: number,
  nodeHeight: number,
  options: {
    notationId?: string;
    symbolId?: string;
    cornerRadius?: number;
    preferredPitchPx?: number;
    minPitchPx?: number;
    hasBottomCaption?: boolean;
    hasRightCaption?: boolean;
    layoutDirection?: LayoutDirection;
  } = {},
): PortSlotAllocation0211 {
  const n = Math.max(1, Math.floor(count));
  const preferredPitchPx = options.preferredPitchPx ?? 12;
  const minPitchPx = options.minPitchPx ?? 4;
  const span = shapeSideSpan0211(shapeId, side);
  const shape = catalogShape029(shapeId);
  const capReserve = stencilCaptionHeight028(shapeId, { notationId: options.notationId, symbolId: options.symbolId });
  const sideCap = isSideCaptionDirection0211(options.layoutDirection);
  const hasBottomCap = options.hasBottomCaption ?? (capReserve > 0 && !sideCap);
  const hasRightCap = options.hasRightCaption ?? (capReserve > 0 && sideCap);
  const isCaptioned = hasBottomCap || hasRightCap;
  const glyphWidth = isCaptioned ? Math.min(nodeWidth, CANONICAL_GLYPH_BOX_0210.width) : nodeWidth;
  const glyphHeight = hasBottomCap
    ? Math.max(24, Math.min(CANONICAL_GLYPH_BOX_0210.height, nodeHeight - capReserve))
    : hasRightCap ? Math.min(nodeHeight, CANONICAL_GLYPH_BOX_0210.height) : nodeHeight;

  const sideLength = side === 'NORTH' || side === 'SOUTH' ? glyphWidth : glyphHeight;
  const usablePx = Math.max(1, sideLength * (span.max - span.min));
  const preferredCap = shapePortCapacity0211(shapeId, side, glyphWidth, glyphHeight, preferredPitchPx);

  let positions: number[];
  let pitchPx = usablePx;
  if (n === 1) {
    positions = [(span.min + span.max) / 2];
  } else {
    // Center slots symmetrically around the span midpoint using preferredPitchPx
    // when all slots fit, otherwise fill [span.min, span.max] down to minPitchPx.
    const maxStepPx = usablePx / (n - 1);
    const stepPx = maxStepPx >= preferredPitchPx
      ? Math.min(24, Math.max(preferredPitchPx, Math.min(maxStepPx, usablePx / n)))
      : Math.max(minPitchPx, maxStepPx);
    pitchPx = stepPx;
    const totalNorm = Math.min(span.max - span.min, (stepPx * (n - 1)) / Math.max(1, sideLength));
    const mid = (span.min + span.max) / 2;
    const start = mid - totalNorm / 2;
    positions = Array.from({ length: n }, (_, i) => start + (totalNorm * i) / (n - 1));
  }

  const slots: AllocatedPortSlot0211[] = positions.map((pos, index) => {
    const toward: Point =
      side === 'NORTH' ? { x: pos, y: 0 }
        : side === 'SOUTH' ? { x: pos, y: 1 }
          : side === 'EAST' ? { x: 1, y: pos }
            : { x: 0, y: pos };
    const rayPoint = shape
      ? stencilRayPoint028(shape, toward, options.cornerRadius !== undefined ? { cornerRadius: options.cornerRadius } : undefined)
      : toward;
    const framePoint = shape
      ? stencilFitPoint028(shape, rayPoint, nodeWidth, nodeHeight, {
        notationId: options.notationId,
        symbolId: options.symbolId,
        layoutDirection: options.layoutDirection,
      })
      : toward;
    return {
      index,
      side,
      position: pos,
      framePoint,
      localPoint: { x: framePoint.x * nodeWidth, y: framePoint.y * nodeHeight },
    };
  });

  const spillSides: CardinalSide0211[] = side === 'EAST' || side === 'WEST'
    ? (hasBottomCap ? ['NORTH'] : ['NORTH', 'SOUTH'])
    : (hasRightCap ? ['WEST'] : ['EAST', 'WEST']);

  return {
    side,
    slots,
    pitchPx,
    exceedsPreferredCapacity: n > preferredCap,
    spillSides,
  };
}

/**
 * Flow-adaptive ordered side preference for automatic (non-authored) port
 * attachment, enforcing DRQ-16 (never choosing SOUTH on a bottom-captioned icon).
 */
export function preferredFlowSides0211(
  direction: LayoutDirection,
  role: 'source' | 'target',
  hasBottomCaption: boolean,
  hasRightCaption = false,
): readonly CardinalSide0211[] {
  const raw: readonly CardinalSide0211[] = (() => {
    if (direction === 'RIGHT') return role === 'source' ? ['EAST', 'NORTH', 'SOUTH', 'WEST'] : ['WEST', 'NORTH', 'SOUTH', 'EAST'];
    if (direction === 'LEFT') return role === 'source' ? ['WEST', 'NORTH', 'SOUTH', 'EAST'] : ['EAST', 'NORTH', 'SOUTH', 'WEST'];
    if (direction === 'DOWN') return role === 'source' ? ['SOUTH', 'WEST', 'EAST', 'NORTH'] : ['NORTH', 'WEST', 'EAST', 'SOUTH'];
    return role === 'source' ? ['NORTH', 'WEST', 'EAST', 'SOUTH'] : ['SOUTH', 'WEST', 'EAST', 'NORTH'];
  })();
  return raw.filter((side) => !(hasBottomCaption && side === 'SOUTH') && !(hasRightCaption && side === 'EAST'));
}

export interface CatalogPortAuditRow0211 {
  readonly shapeId: string;
  readonly viewBox: string;
  readonly defaultSize: string;
  readonly cleanCapacity: Readonly<Record<CardinalSide0211, number>>;
  readonly allSlotsValid: boolean;
}

export interface SymbolPortAuditSummary0211 {
  readonly totalShapes: number;
  readonly shapesWithValidSpans: number;
  readonly totalSymbols: number;
  readonly singleSideCatalogSymbols: readonly string[];
  readonly bottomCaptionConflictPorts: readonly string[];
  readonly shapeRows: readonly CatalogPortAuditRow0211[];
}

const CARDINAL_SIDES: readonly CardinalSide0211[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];

/**
 * Deterministic Slice 40 catalog audit verifying all 32 shapes and all
 * registered symbols against the multi-slot contour & DRQ-16 port contracts.
 */
export function auditCatalogPortContracts0211(): SymbolPortAuditSummary0211 {
  const shapes = shapeRegistry.getAll();
  const shapeRows: CatalogPortAuditRow0211[] = [];
  let shapesWithValidSpans = 0;

  for (const shape of shapes) {
    const hasSpans = shape.id in SHAPE_SIDE_SPANS_0211;
    const cleanCapacity = {} as Record<CardinalSide0211, number>;
    let allSlotsValid = hasSpans;
    for (const side of CARDINAL_SIDES) {
      const cap = shapePortCapacity0211(shape.id, side, shape.defaultSize.width, shape.defaultSize.height, 12);
      cleanCapacity[side] = cap;
      const alloc = allocateSidePortSlots0211(shape.id, side, Math.min(3, cap), shape.defaultSize.width, shape.defaultSize.height);
      for (const slot of alloc.slots) {
        if (!Number.isFinite(slot.localPoint.x) || !Number.isFinite(slot.localPoint.y)) allSlotsValid = false;
        if (slot.framePoint.x < -0.25 || slot.framePoint.x > 1.25 || slot.framePoint.y < -0.25 || slot.framePoint.y > 1.25) {
          allSlotsValid = false;
        }
      }
    }
    if (allSlotsValid) shapesWithValidSpans++;
    shapeRows.push({
      shapeId: shape.id,
      viewBox: shape.viewBox,
      defaultSize: `${shape.defaultSize.width}x${shape.defaultSize.height}`,
      cleanCapacity,
      allSlotsValid,
    });
  }

  const singleSideCatalogSymbols: string[] = [];
  const bottomCaptionConflictPorts: string[] = [];
  const seenSymbols = new Set<string>();

  for (const notation of notationRegistry.getAll()) {
    for (const symId of notation.symbols ?? []) {
      const sym = catalogSymbol029(symId);
      if (!sym || seenSymbols.has(sym.id)) continue;
      seenSymbols.add(sym.id);
      const ports = sym.ports ?? [];
      const sides = new Set<string>(ports.map((p) => p.anchor));
      if (ports.length > 0 && sides.size === 1) {
        singleSideCatalogSymbols.push(`${sym.id}(${[...sides][0]})`);
      }
      if (stencilCaptionHeight028(sym.shape, { notationId: notation.id, symbolId: sym.id }) > 0) {
        for (const p of ports) {
          if (p.anchor === 'SOUTH') bottomCaptionConflictPorts.push(`${sym.id}.${p.id}`);
        }
      }
    }
  }

  return {
    totalShapes: shapes.length,
    shapesWithValidSpans,
    totalSymbols: seenSymbols.size,
    singleSideCatalogSymbols,
    bottomCaptionConflictPorts,
    shapeRows,
  };
}
