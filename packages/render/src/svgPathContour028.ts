import type { Point } from './layout/types.js';
import type { ShapeDefinition } from './types.js';

export interface ContourSegment028 { start: Point; end: Point }

const contours = new WeakMap<ShapeDefinition, readonly ContourSegment028[]>();
const numeric = '[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?';
const token = new RegExp(`[MLQCAZ]|${numeric}`, 'g');
const valid = new RegExp(`^(?:\\s|,|[MLQCAZ]|${numeric})*$`);

function curvePoint(a: Point, b: Point, c: Point, t: number): Point {
  const inverse = 1 - t;
  return { x: inverse * inverse * a.x + 2 * inverse * t * b.x + t * t * c.x,
    y: inverse * inverse * a.y + 2 * inverse * t * b.y + t * t * c.y };
}

function cubicPoint(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const inverse = 1 - t;
  return { x: inverse ** 3 * a.x + 3 * inverse ** 2 * t * b.x +
    3 * inverse * t ** 2 * c.x + t ** 3 * d.x,
  y: inverse ** 3 * a.y + 3 * inverse ** 2 * t * b.y +
    3 * inverse * t ** 2 * c.y + t ** 3 * d.y };
}

/** SVG endpoint-to-center arc conversion, then deterministic polyline sampling. */
function arcPoints(
  start: Point, rxInput: number, ryInput: number, rotation: number,
  largeArc: number, sweep: number, end: Point,
): Point[] {
  let rx = Math.abs(rxInput);
  let ry = Math.abs(ryInput);
  if (rx === 0 || ry === 0 || (start.x === end.x && start.y === end.y)) return [end];
  const phi = rotation * Math.PI / 180;
  const cosine = Math.cos(phi);
  const sine = Math.sin(phi);
  const halfX = (start.x - end.x) / 2;
  const halfY = (start.y - end.y) / 2;
  const x1 = cosine * halfX + sine * halfY;
  const y1 = -sine * halfX + cosine * halfY;
  const lambda = x1 ** 2 / rx ** 2 + y1 ** 2 / ry ** 2;
  if (lambda > 1) { const factor = Math.sqrt(lambda); rx *= factor; ry *= factor; }
  const numerator = rx ** 2 * ry ** 2 - rx ** 2 * y1 ** 2 - ry ** 2 * x1 ** 2;
  const denominator = rx ** 2 * y1 ** 2 + ry ** 2 * x1 ** 2;
  const sign = largeArc === sweep ? -1 : 1;
  const factor = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const centerX1 = factor * rx * y1 / ry;
  const centerY1 = factor * -ry * x1 / rx;
  const centerX = cosine * centerX1 - sine * centerY1 + (start.x + end.x) / 2;
  const centerY = sine * centerX1 + cosine * centerY1 + (start.y + end.y) / 2;
  const from = { x: (x1 - centerX1) / rx, y: (y1 - centerY1) / ry };
  const to = { x: (-x1 - centerX1) / rx, y: (-y1 - centerY1) / ry };
  const theta = Math.atan2(from.y, from.x);
  let delta = Math.atan2(from.x * to.y - from.y * to.x, from.x * to.x + from.y * to.y);
  if (sweep === 0 && delta > 0) delta -= 2 * Math.PI;
  if (sweep === 1 && delta < 0) delta += 2 * Math.PI;
  const steps = Math.max(16, Math.ceil(Math.abs(delta) * 48 / Math.PI));
  return Array.from({ length: steps }, (_, index) => {
    if (index === steps - 1) return end;
    const angle = theta + delta * (index + 1) / steps;
    const x = rx * Math.cos(angle);
    const y = ry * Math.sin(angle);
    return { x: centerX + cosine * x - sine * y, y: centerY + sine * x + cosine * y };
  });
}

/** Samples only the SVG commands actually present in the installed stencil catalog. */
export function svgPathContour028(shape: ShapeDefinition): readonly ContourSegment028[] {
  const cached = contours.get(shape);
  if (cached) return cached;
  if (!valid.test(shape.path)) throw new Error(`coral.stencil.path.unsupported: ${shape.id}`);
  const tokens = shape.path.match(token) ?? [];
  const viewBox = shape.viewBox.trim().split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value)) ||
    viewBox[2]! <= 0 || viewBox[3]! <= 0) throw new Error(`coral.stencil.path.invalid-viewbox: ${shape.id}`);
  const [originX, originY, width, height] = viewBox as [number, number, number, number];
  const segments: ContourSegment028[] = [];
  const normalize = (point: Point): Point => ({ x: (point.x - originX) / width,
    y: (point.y - originY) / height });
  let current: Point | undefined;
  let subpathStart: Point | undefined;
  let index = 0;
  const number = (): number => {
    const value = Number(tokens[index++]);
    if (!Number.isFinite(value)) throw new Error(`coral.stencil.path.invalid-number: ${shape.id}`);
    return value;
  };
  const point = (): Point => ({ x: number(), y: number() });
  const append = (next: Point): void => {
    if (!current) throw new Error(`coral.stencil.path.missing-move: ${shape.id}`);
    segments.push({ start: normalize(current), end: normalize(next) });
    current = next;
  };
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === 'M') { current = point(); subpathStart = current; }
    else if (command === 'L') append(point());
    else if (command === 'Q') {
      if (!current) throw new Error(`coral.stencil.path.missing-move: ${shape.id}`);
      const control = point();
      const end = point();
      const start = current;
      for (let step = 1; step <= 32; step += 1) append(curvePoint(start, control, end, step / 32));
    } else if (command === 'C') {
      if (!current) throw new Error(`coral.stencil.path.missing-move: ${shape.id}`);
      const control1 = point();
      const control2 = point();
      const end = point();
      const start = current;
      for (let step = 1; step <= 48; step += 1) append(cubicPoint(start, control1, control2, end, step / 48));
    } else if (command === 'A') {
      if (!current) throw new Error(`coral.stencil.path.missing-move: ${shape.id}`);
      const rx = number(); const ry = number(); const rotation = number();
      const largeArc = number(); const sweep = number(); const end = point();
      if ((largeArc !== 0 && largeArc !== 1) || (sweep !== 0 && sweep !== 1)) {
        throw new Error(`coral.stencil.path.invalid-arc: ${shape.id}`);
      }
      for (const next of arcPoints(current, rx, ry, rotation, largeArc, sweep, end)) append(next);
    } else if (command === 'Z') {
      if (!current || !subpathStart) throw new Error(`coral.stencil.path.missing-move: ${shape.id}`);
      if (current.x !== subpathStart.x || current.y !== subpathStart.y) append(subpathStart);
      current = subpathStart;
    } else throw new Error(`coral.stencil.path.unsupported: ${shape.id}`);
  }
  if (!segments.length) throw new Error(`coral.stencil.path.empty: ${shape.id}`);
  const stable = Object.freeze(segments.map((segment) => Object.freeze({
    start: Object.freeze(segment.start), end: Object.freeze(segment.end),
  })));
  if (Object.isFrozen(shape)) contours.set(shape, stable);
  return stable;
}
