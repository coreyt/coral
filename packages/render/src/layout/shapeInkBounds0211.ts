/**
 * True painted SVG ink bounds for catalog shapes whose path coordinates extend
 * outside or sit asymmetrically inside their declared viewBox (e.g. `cloud`,
 * whose left cubic lobe reaches x = -15 in a 0..120 viewBox).
 *
 * Keeps frozen catalog digests in `shapes/index.ts` untouched while giving
 * alignment, port placement, and quality analysis the exact visual ink center
 * and contour extents.
 */
import { catalogShape029 } from '../catalogLookup029.js';
import { svgPathContour028 } from '../svgPathContour028.js';

export interface InkFractions0211 {
  /** Left painted ink edge as a fraction of fitted shape width (may be < 0, e.g. cloud ≈ -0.045). */
  readonly minX: number;
  /** Right painted ink edge as a fraction of fitted shape width. */
  readonly maxX: number;
  /** Top painted ink edge as a fraction of fitted shape height. */
  readonly minY: number;
  /** Bottom painted ink edge as a fraction of fitted shape height. */
  readonly maxY: number;
  /** Visual horizontal ink center fraction: (minX + maxX) / 2. */
  readonly centerX: number;
  /** Visual vertical ink center fraction: (minY + maxY) / 2. */
  readonly centerY: number;
}

const DEFAULT_INK: InkFractions0211 = {
  minX: 0, maxX: 1, minY: 0, maxY: 1, centerX: 0.5, centerY: 0.5,
};

const cache = new Map<string, InkFractions0211>();

/**
 * Compute normalized painted-ink extents for a catalog shape using its
 * sampled SVG contour polyline (`svgPathContour028`).
 */
export function shapeInkFractions0211(shapeId: string | undefined): InkFractions0211 {
  if (!shapeId) return DEFAULT_INK;
  const hit = cache.get(shapeId);
  if (hit) return hit;

  const shape = catalogShape029(shapeId);
  if (!shape || shape.type !== 'path' || !shape.path) {
    cache.set(shapeId, DEFAULT_INK);
    return DEFAULT_INK;
  }

  try {
    const segs = svgPathContour028(shape);
    if (!segs.length) {
      cache.set(shapeId, DEFAULT_INK);
      return DEFAULT_INK;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of segs) {
      for (const p of [s.start, s.end]) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) {
      cache.set(shapeId, DEFAULT_INK);
      return DEFAULT_INK;
    }
    const result: InkFractions0211 = {
      minX,
      maxX,
      minY,
      maxY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
    cache.set(shapeId, result);
    return result;
  } catch {
    cache.set(shapeId, DEFAULT_INK);
    return DEFAULT_INK;
  }
}

/**
 * Project a nominal fitted glyph rectangle into its true painted SVG ink
 * bounding box (e.g. expanding `cloud`'s left edge to cover its protruding puff).
 */
export function inkBoundsForFrame0211(
  shapeId: string | undefined,
  frame: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const f = shapeInkFractions0211(shapeId);
  return {
    x: frame.x + f.minX * frame.width,
    y: frame.y + f.minY * frame.height,
    width: (f.maxX - f.minX) * frame.width,
    height: (f.maxY - f.minY) * frame.height,
  };
}
