/** Frame geometry for edition 0.2.9 user symbols. The node box is the frame
 * (exactly the definition's `size`), outlines are convex and defined in
 * normalized frame coordinates, and authored anchors use the exact outline.
 * Layout-chosen contacts keep the shared contour machinery. */
import type { UserSymbolAnchor, UserSymbolOutline, UserSymbolSide } from '@coral-viz/language';
import type { Point } from './layout/types.js';
import { roundedRectanglePath028 } from './roundedRectanglePath028.js';
import { stencilFitPoint028 } from './stencilAnchorGeometry028.js';
import type { StencilCaptionContext0210 } from './stencilLabelGeometry028.js';
import type { ShapeDefinition } from './types.js';

/** Outline value carried by layout ports and scene nodes; rebuilds the shape. */
export interface UserOutline029 {
  /** `local.<id>`; also the synthetic shape ID. */
  symbolId: string;
  outline: UserSymbolOutline;
  width: number;
  height: number;
}

export interface ResolvedUserAnchor029 {
  id: string;
  kind: 'boundary' | 'interior';
  /** Exit side: the boundary side, or the interior anchor's `exit`. */
  side: UserSymbolSide;
  /** Normalized frame point where layout and routing attach. */
  attachment: Point;
  /** Normalized interior point; present only when the escape is non-empty. */
  interior?: Point;
}

export type UserAnchorResolution029 =
  | { ok: true; anchor: ResolvedUserAnchor029 }
  | { ok: false; reason: 'outside' | 'exit' };

/** Region tolerance in normalized frame units. */
export const USER_OUTLINE_EPSILON029 = 1e-9;
const EPSILON = USER_OUTLINE_EPSILON029;
const LOCAL_PREFIX = 'local.';

const shapes = new Map<string, ShapeDefinition>();
const SHAPE_CACHE_LIMIT = 1024;

/** No bundled shape uses the reserved `local.` prefix, so the ID identifies a user outline. */
export function isUserOutlineShape029(shape: Pick<ShapeDefinition, 'id'>): boolean {
  return shape.id.startsWith(LOCAL_PREFIX);
}

/** The synthetic outline in frame units; its viewBox is `size`, so a frame of `size` maps by the identity. */
export function userOutlineShape029(outline: UserOutline029): ShapeDefinition {
  const { symbolId, width, height } = outline;
  const key = `${symbolId}\u0000${outline.outline}\u0000${width}\u0000${height}`;
  const cached = shapes.get(key);
  if (cached) return cached;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const [type, path]: [ShapeDefinition['type'], string] =
    outline.outline === 'rectangle' ? ['polygon', `M 0,0 L ${width},0 L ${width},${height} L 0,${height} Z`]
      : outline.outline === 'diamond'
        ? ['polygon', `M ${halfWidth},0 L ${width},${halfHeight} L ${halfWidth},${height} L 0,${halfHeight} Z`]
        : outline.outline === 'ellipse'
          ? ['ellipse', `M ${halfWidth},0 A ${halfWidth},${halfHeight} 0 1 1 ${halfWidth},${height} ` +
            `A ${halfWidth},${halfHeight} 0 1 1 ${halfWidth},0 Z`]
          : ['path', roundedRectanglePath028(width, height, Math.min(width, height) / 8)];
  const shape: ShapeDefinition = Object.freeze({
    id: symbolId, name: symbolId, type, viewBox: `0 0 ${width} ${height}`, path,
    defaultSize: Object.freeze({ width, height }),
    portAnchors: Object.freeze((['NORTH', 'SOUTH', 'EAST', 'WEST'] as const)
      .map((side) => Object.freeze({ side, position: 0.5 }))) as ShapeDefinition['portAnchors'],
    sizing: Object.freeze({ textBoundsRatio: Object.freeze({ x: 1, y: 1 }),
      minSize: Object.freeze({ width, height }), padding: Object.freeze({ x: 0, y: 0 }) }),
  });
  if (shapes.size >= SHAPE_CACHE_LIMIT) shapes.clear();
  shapes.set(key, shape);
  return shape;
}

function cornerRadii(outline: UserOutline029): { rx: number; ry: number } {
  const radius = Math.min(outline.width, outline.height) / 8;
  return { rx: radius / outline.width, ry: radius / outline.height };
}

function rectangleRegion(u: number, v: number): number {
  return Math.max(-u, u - 1, -v, v - 1);
}

/** Region function: negative inside, zero on the outline, positive outside. */
export function userOutlineRegion029(outline: UserOutline029, { x: u, y: v }: Point): number {
  if (outline.outline === 'rectangle') return rectangleRegion(u, v);
  if (outline.outline === 'diamond') return Math.abs(u - 0.5) + Math.abs(v - 0.5) - 0.5;
  if (outline.outline === 'ellipse') return Math.hypot(u - 0.5, v - 0.5) - 0.5;
  // Each rounded corner is the quadratic from (0, r) via (0, 0) to (r, 0),
  // which satisfies sqrt(X) + sqrt(Y) = sqrt(r) measured from the corner.
  const { rx, ry } = cornerRadii(outline);
  const along = u < rx ? u : u > 1 - rx ? 1 - u : undefined;
  const across = v < ry ? v : v > 1 - ry ? 1 - v : undefined;
  if (along !== undefined && across !== undefined && along >= 0 && across >= 0)
    return 1 - Math.sqrt(along / rx) - Math.sqrt(across / ry);
  return rectangleRegion(u, v);
}

export function classifyUserOutlinePoint029(outline: UserOutline029, point: Point): 'inside' | 'on' | 'outside' {
  const value = userOutlineRegion029(outline, point);
  return value < -EPSILON ? 'inside' : value > EPSILON ? 'outside' : 'on';
}

const halfChord = (w: number): number => Math.sqrt(Math.max(0, 0.25 - (w - 0.5) ** 2));
const cornerDepth = (w: number, k: number): number => {
  const near = Math.min(w, 1 - w);
  return near < k ? (1 - Math.sqrt(Math.max(0, near) / k)) ** 2 : 0;
};

/** Where the axis-aligned ray from `point` toward `side` leaves the closed region. */
export function userOutlineExitPoint029(outline: UserOutline029, side: UserSymbolSide, { x: u, y: v }: Point): Point {
  if (outline.outline === 'rectangle') return side === 'N' ? { x: u, y: 0 } : side === 'S' ? { x: u, y: 1 }
    : side === 'E' ? { x: 1, y: v } : { x: 0, y: v };
  if (outline.outline === 'diamond') return side === 'N' ? { x: u, y: Math.abs(u - 0.5) }
    : side === 'S' ? { x: u, y: 1 - Math.abs(u - 0.5) }
      : side === 'E' ? { x: 1 - Math.abs(v - 0.5), y: v } : { x: Math.abs(v - 0.5), y: v };
  if (outline.outline === 'ellipse') return side === 'N' ? { x: u, y: 0.5 - halfChord(u) }
    : side === 'S' ? { x: u, y: 0.5 + halfChord(u) }
      : side === 'E' ? { x: 0.5 + halfChord(v), y: v } : { x: 0.5 - halfChord(v), y: v };
  const { rx, ry } = cornerRadii(outline);
  return side === 'N' ? { x: u, y: ry * cornerDepth(u, rx) }
    : side === 'S' ? { x: u, y: 1 - ry * cornerDepth(u, rx) }
      : side === 'E' ? { x: 1 - rx * cornerDepth(v, ry), y: v } : { x: rx * cornerDepth(v, ry), y: v };
}

/** The first outline point met by the inward side normal from the point at `at` on `side`. */
export function userBoundaryAnchorPoint029(outline: UserOutline029, side: UserSymbolSide, at: number): Point {
  return userOutlineExitPoint029(outline, side, side === 'N' || side === 'S' ? { x: at, y: 0.5 } : { x: 0.5, y: at });
}

/** Where the segment from the frame centre to a frame corner meets the outline. */
export function userCornerAnchorPoint029(outline: UserOutline029, corner: 'NE' | 'NW' | 'SE' | 'SW'): Point {
  let northeast: Point;
  if (outline.outline === 'rectangle') northeast = { x: 1, y: 0 };
  else if (outline.outline === 'diamond') northeast = { x: 0.75, y: 0.25 };
  else if (outline.outline === 'ellipse') northeast = { x: 0.5 + 0.5 / Math.SQRT2, y: 0.5 - 0.5 / Math.SQRT2 };
  else {
    const { rx, ry } = cornerRadii(outline);
    const t = Math.sqrt(rx) / (Math.sqrt(rx) + Math.sqrt(ry));
    northeast = { x: 1 - rx * (1 - t) ** 2, y: ry * t * t };
  }
  return { x: corner.endsWith('E') ? northeast.x : 1 - northeast.x,
    y: corner.startsWith('N') ? northeast.y : 1 - northeast.y };
}

/** For a point on the outline: the open ray toward `side` contains no point of the closed region. */
function strictlyOutward(outline: UserOutline029, side: UserSymbolSide, { x: u, y: v }: Point): boolean {
  if (outline.outline === 'rectangle') return side === 'N' ? v <= EPSILON : side === 'S' ? v >= 1 - EPSILON
    : side === 'E' ? u >= 1 - EPSILON : u <= EPSILON;
  if (outline.outline === 'diamond') return side === 'N' ? v <= 0.5 + EPSILON : side === 'S' ? v >= 0.5 - EPSILON
    : side === 'E' ? u >= 0.5 - EPSILON : u <= 0.5 + EPSILON;
  if (outline.outline === 'ellipse') return side === 'N' ? v < 0.5 - EPSILON : side === 'S' ? v > 0.5 + EPSILON
    : side === 'E' ? u > 0.5 + EPSILON : u < 0.5 - EPSILON;
  const { rx, ry } = cornerRadii(outline);
  return side === 'N' ? v < ry - EPSILON : side === 'S' ? v > 1 - ry + EPSILON
    : side === 'E' ? u > 1 - rx + EPSILON : u < rx - EPSILON;
}

/** Resolve one authored anchor against its definition's outline. */
export function resolveUserAnchor029(outline: UserOutline029, anchor: UserSymbolAnchor): UserAnchorResolution029 {
  if (anchor.kind === 'boundary') return { ok: true, anchor: { id: anchor.id, kind: 'boundary', side: anchor.side,
    attachment: userBoundaryAnchorPoint029(outline, anchor.side, anchor.at) } };
  const point = { x: anchor.x, y: anchor.y };
  const position = classifyUserOutlinePoint029(outline, point);
  if (position === 'outside') return { ok: false, reason: 'outside' };
  if (position === 'on') return strictlyOutward(outline, anchor.exit, point)
    ? { ok: true, anchor: { id: anchor.id, kind: 'interior', side: anchor.exit, attachment: point } }
    : { ok: false, reason: 'exit' };
  return { ok: true, anchor: { id: anchor.id, kind: 'interior', side: anchor.exit,
    attachment: userOutlineExitPoint029(outline, anchor.exit, point), interior: point } };
}

/** Frame resolver: user-outline points are frame geometry and map by the
 * identity; every other shape keeps the stencil `meet` fit. */
export function frameFitPoint029(
  shape: ShapeDefinition, point: Point, width: number, height: number, context?: StencilCaptionContext0210,
): Point {
  return isUserOutlineShape029(shape) ? { x: point.x, y: point.y } : stencilFitPoint028(shape, point, width, height, context);
}

/** The artwork viewBox mapped into the frame as SVG `xMidYMid meet`; never moves outline, anchors or ports. */
export function artworkPlacement029(
  viewBox: { minX: number; minY: number; width: number; height: number },
  frame: { x: number; y: number; width: number; height: number },
): { scale: number; translateX: number; translateY: number } {
  const scale = Math.min(frame.width / viewBox.width, frame.height / viewBox.height);
  return { scale,
    translateX: frame.x + (frame.width - viewBox.width * scale) / 2 - viewBox.minX * scale,
    translateY: frame.y + (frame.height - viewBox.height * scale) / 2 - viewBox.minY * scale };
}
