import {
  captionedStencilFrame029,
  stencilCaptionHeight028,
  type StencilCaptionContext0210,
} from './stencilLabelGeometry028.js';
import type { Point } from './layout/types.js';
import type { ExactAnchor } from './semanticPorts028.js';
import type { ShapeDefinition } from './types.js';
import { svgPathContour028 } from './svgPathContour028.js';

/** This error prevents a bounding-box corner from masquerading as a stencil pin. */
export class StencilAnchorGeometryCapabilityError extends Error {
  readonly code = 'coral.port.anchor.geometry-unsupported';
  constructor(readonly shapeId: string) {
    super(`coral.port.anchor.geometry-unsupported: ${shapeId} has no exact outline resolver`);
    this.name = 'StencilAnchorGeometryCapabilityError';
  }
}

const directions: Record<ExactAnchor, Point> = {
  N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 },
  NE: { x: 1, y: -1 }, NW: { x: -1, y: -1 }, SE: { x: 1, y: 1 }, SW: { x: -1, y: 1 },
};

/** A free corner hint is selected by layout as a side plus endpoint offset. */
export function cornerAnchorForAttachment028(
  side: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST', position: number,
): ExactAnchor {
  if (position !== 0 && position !== 1) {
    throw new Error(`coral.port.anchor.corner.invalid-position: ${position}`);
  }
  if (side === 'NORTH') return position === 0 ? 'NW' : 'NE';
  if (side === 'SOUTH') return position === 0 ? 'SW' : 'SE';
  if (side === 'EAST') return position === 0 ? 'NE' : 'SE';
  if (side === 'WEST') return position === 0 ? 'NW' : 'SW';
  throw new Error(`coral.port.anchor.corner.invalid-side: ${side}`);
}

function polygonVertices(shape: ShapeDefinition): Point[] {
  const validPath = /^(?:\s|,|[MLZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?)*$/;
  if (!validPath.test(shape.path)) throw new StencilAnchorGeometryCapabilityError(shape.id);
  const tokens = shape.path.match(/[MLZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  const [originX, originY, width, height] = validViewBox(shape);
  const vertices: Point[] = [];
  let index = 0;
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === 'Z') {
      if (index !== tokens.length) throw new StencilAnchorGeometryCapabilityError(shape.id);
      break;
    }
    if ((command !== 'M' && command !== 'L') || (command === 'M' && vertices.length) ||
      (command === 'L' && !vertices.length)) throw new StencilAnchorGeometryCapabilityError(shape.id);
    const x = Number(tokens[index++]);
    const y = Number(tokens[index++]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new StencilAnchorGeometryCapabilityError(shape.id);
    vertices.push({ x: (x - originX) / width, y: (y - originY) / height });
  }
  if (vertices.length < 3 || tokens.at(-1) !== 'Z') throw new StencilAnchorGeometryCapabilityError(shape.id);
  return vertices;
}

function validViewBox(shape: ShapeDefinition): [number, number, number, number] {
  const values = shape.viewBox.trim().split(/[\s,]+/).map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value)) ||
    values[2]! <= 0 || values[3]! <= 0) throw new StencilAnchorGeometryCapabilityError(shape.id);
  return values as [number, number, number, number];
}

/** The SVG `meet` fit used by canvas, layout, and static export. */
export function stencilFit028(
  shape: ShapeDefinition,
  width: number,
  height: number,
  context?: StencilCaptionContext0210,
): {
  scale: number; offsetX: number; offsetY: number; viewX: number; viewY: number;
  fittedWidth: number; fittedHeight: number;
} {
  const [viewX, viewY, viewWidth, viewHeight] = validViewBox(shape);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new StencilAnchorGeometryCapabilityError(shape.id);
  if (stencilCaptionHeight028(shape.id, context) > 0) {
    const frame = captionedStencilFrame029(shape, width, height, context);
    return {
      scale: frame.scale,
      offsetX: frame.glyph.x,
      offsetY: frame.glyph.y,
      viewX: frame.viewX,
      viewY: frame.viewY,
      fittedWidth: frame.glyph.width,
      fittedHeight: frame.glyph.height,
    };
  }
  const scale = Math.min(width / viewWidth, height / viewHeight);
  const fittedWidth = viewWidth * scale;
  const fittedHeight = viewHeight * scale;
  return { scale, offsetX: (width - fittedWidth) / 2, offsetY: (height - viewHeight * scale) / 2,
    viewX, viewY, fittedWidth, fittedHeight };
}

/** Map a contour-normalized point into a fitted node's normalized box. */
export function stencilFitPoint028(
  shape: ShapeDefinition, point: Point, width: number, height: number, context?: StencilCaptionContext0210,
): Point {
  const fit = stencilFit028(shape, width, height, context);
  return { x: (fit.offsetX + point.x * fit.fittedWidth) / width,
    y: (fit.offsetY + point.y * fit.fittedHeight) / height };
}

/** Intersect the center-to-corner ray with resolveShapePath's quadratic round. */
function roundedRectangleCorner(shape: ShapeDefinition, anchor: ExactAnchor, requestedRadius: number): Point {
  const [, , width, height] = validViewBox(shape);
  const radius = Math.min(requestedRadius, width / 2, height / 2);
  const rx = radius / width;
  const ry = radius / height;
  // The top-right quadratic is (1-rx*(1-u)^2, ry*u^2). The NE ray obeys
  // x+y=1, so sqrt(ry)*u = sqrt(rx)*(1-u).
  const u = Math.sqrt(rx) / (Math.sqrt(rx) + Math.sqrt(ry));
  const northeast = { x: 1 - rx * (1 - u) ** 2, y: ry * u ** 2 };
  return { x: anchor.endsWith('E') ? northeast.x : 1 - northeast.x,
    y: anchor.startsWith('N') ? northeast.y : 1 - northeast.y };
}

function cross(a: Point, b: Point): number { return a.x * b.y - a.y * b.x; }

function polygonRayPoint(shape: ShapeDefinition, direction: Point): Point {
  const vertices = polygonVertices(shape);
  const center = { x: 0.5, y: 0.5 };
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index]!;
    const end = vertices[(index + 1) % vertices.length]!;
    const segment = { x: end.x - start.x, y: end.y - start.y };
    const denominator = cross(direction, segment);
    if (Math.abs(denominator) < 1e-12) continue;
    const relative = { x: start.x - center.x, y: start.y - center.y };
    const distance = cross(relative, segment) / denominator;
    const along = cross(relative, direction) / denominator;
    if (distance >= 0 && along >= -1e-12 && along <= 1 + 1e-12) nearest = Math.min(nearest, distance);
  }
  if (!Number.isFinite(nearest)) throw new StencilAnchorGeometryCapabilityError(shape.id);
  return { x: center.x + direction.x * nearest, y: center.y + direction.y * nearest };
}

function svgPathRayPoint(shape: ShapeDefinition, direction: Point, requireIntersection: boolean): Point {
  let farthest = Number.NEGATIVE_INFINITY;
  let segments;
  try { segments = svgPathContour028(shape); }
  catch { throw new StencilAnchorGeometryCapabilityError(shape.id); }
  const center = { x: 0.5, y: 0.5 };
  const supportPoint = (): Point => {
    let best: Point | undefined;
    let projection = Number.NEGATIVE_INFINITY;
    let crossDistance = Number.POSITIVE_INFINITY;
    for (const segment of segments) for (const endpoint of [segment.start, segment.end]) {
      const relative = { x: endpoint.x - center.x, y: endpoint.y - center.y };
      const along = relative.x * direction.x + relative.y * direction.y;
      const lateral = Math.abs(cross(relative, direction));
      if (along > projection + 1e-12 ||
        (Math.abs(along - projection) <= 1e-12 && lateral < crossDistance)) {
        best = endpoint; projection = along; crossDistance = lateral;
      }
    }
    if (!best) throw new StencilAnchorGeometryCapabilityError(shape.id);
    return best;
  };
  // Stroke-only stencils have no enclosing fill; a center ray can intersect
  // the torso while the arm/foot is the visible outer feature.
  if (shape.strokeOnly) {
    if (requireIntersection) throw new StencilAnchorGeometryCapabilityError(shape.id);
    return supportPoint();
  }
  for (const { start, end } of segments) {
    const segment = { x: end.x - start.x, y: end.y - start.y };
    const relative = { x: start.x - center.x, y: start.y - center.y };
    const denominator = cross(direction, segment);
    if (Math.abs(denominator) < 1e-12) {
      if (Math.abs(cross(relative, direction)) > 1e-12) continue;
      const lengthSquared = direction.x ** 2 + direction.y ** 2;
      const alongStart = (relative.x * direction.x + relative.y * direction.y) / lengthSquared;
      const alongEnd = ((end.x - center.x) * direction.x +
        (end.y - center.y) * direction.y) / lengthSquared;
      farthest = Math.max(farthest, alongStart, alongEnd);
      continue;
    }
    const distance = cross(relative, segment) / denominator;
    const along = cross(relative, direction) / denominator;
    if (distance >= 0 && along >= -1e-12 && along <= 1 + 1e-12) farthest = Math.max(farthest, distance);
  }
  if (!Number.isFinite(farthest) || farthest < 0) {
    if (requireIntersection) throw new StencilAnchorGeometryCapabilityError(shape.id);
    return supportPoint();
  }
  return { x: center.x + direction.x * farthest, y: center.y + direction.y * farthest };
}

function roundedRectangleRayPoint(shape: ShapeDefinition, direction: Point, requestedRadius: number): Point {
  const [, , width, height] = validViewBox(shape);
  const radius = Math.min(requestedRadius, width / 2, height / 2);
  const rx = radius / width;
  const ry = radius / height;
  const sharp = polygonRayPoint(shape, direction);
  const inRoundedCorner = (sharp.x > 1 - rx || sharp.x < rx) &&
    (sharp.y < ry || sharp.y > 1 - ry);
  if (!inRoundedCorner) return sharp;
  const right = direction.x >= 0;
  const top = direction.y < 0;
  const normalized = { x: Math.abs(direction.x), y: -Math.abs(direction.y) };
  const pointOnCurve = (u: number): Point => ({
    x: 1 - rx * (1 - u) ** 2,
    y: ry * u ** 2,
  });
  const signedDistance = (u: number): number => {
    const point = pointOnCurve(u);
    return cross({ x: point.x - 0.5, y: point.y - 0.5 }, normalized);
  };
  let low = 0;
  let high = 1;
  let lowSign = Math.sign(signedDistance(low));
  const highSign = Math.sign(signedDistance(high));
  if (lowSign === highSign && lowSign !== 0) throw new StencilAnchorGeometryCapabilityError(shape.id);
  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;
    const sign = Math.sign(signedDistance(middle));
    if (sign === lowSign) { low = middle; lowSign = sign; }
    else high = middle;
  }
  const point = pointOnCurve((low + high) / 2);
  return { x: right ? point.x : 1 - point.x, y: top ? point.y : 1 - point.y };
}

/** Snap a layout-selected rectangle-boundary location to the real stencil ray. */
export function stencilRayPoint028(
  shape: ShapeDefinition, toward: Point,
  parameters?: { cornerRadius?: number; requireIntersection?: boolean },
): Point {
  const direction = { x: toward.x - 0.5, y: toward.y - 0.5 };
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y) ||
    (direction.x === 0 && direction.y === 0)) throw new StencilAnchorGeometryCapabilityError(shape.id);
  const radius = parameters?.cornerRadius;
  if (radius !== undefined && (!Number.isFinite(radius) || radius < 0)) {
    throw new StencilAnchorGeometryCapabilityError(shape.id);
  }
  if (shape.type === 'ellipse') {
    const scale = 0.5 / Math.hypot(direction.x, direction.y);
    return { x: 0.5 + direction.x * scale, y: 0.5 + direction.y * scale };
  }
  if (shape.type === 'path' || shape.type === 'compound')
    return svgPathRayPoint(shape, direction, parameters?.requireIntersection === true);
  if (shape.type !== 'polygon') throw new StencilAnchorGeometryCapabilityError(shape.id);
  if (shape.id === 'rectangle' && radius) return roundedRectangleRayPoint(shape, direction, radius);
  return polygonRayPoint(shape, direction);
}

/** Normalized visible-contour point for a hard-pinned generic anchor.
 *
 * Installed polygons, ellipses, SVG path/compound stencils, and the renderer's
 * parametric rounded rectangle are supported. Curves and arcs use deterministic
 * sampled contour segments; malformed or unresolvable paths fail closed.
 */
export function stencilAnchorPoint028(
  shape: ShapeDefinition, anchor: ExactAnchor, parameters?: { cornerRadius?: number },
): Point {
  const direction = directions[anchor];
  if (!direction) throw new StencilAnchorGeometryCapabilityError(shape.id);
  const radius = parameters?.cornerRadius;
  if (radius !== undefined && (!Number.isFinite(radius) || radius < 0)) {
    throw new StencilAnchorGeometryCapabilityError(shape.id);
  }
  if (shape.id === 'rectangle' && radius && anchor.length === 2) {
    return roundedRectangleCorner(shape, anchor, radius);
  }
  return stencilRayPoint028(shape,
    { x: 0.5 + direction.x, y: 0.5 + direction.y }, parameters);
}
