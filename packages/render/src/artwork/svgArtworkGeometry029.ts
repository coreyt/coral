/** Phase P6 of coral.svg-artwork 1: current transformation matrices and
 * effective bounds of the rendering tree (profile §10 items 4–5). Arithmetic
 * is binary64. */
import type { SvgArtworkFailure029, SvgGeometry029, SvgTransform029, SvgViewBox029 } from './svgArtworkModel029.js';
import type { ComputedStyle029 } from './svgArtworkStyle029.js';
import { PRIMITIVES_029, type ArtworkNode029 } from './svgArtworkVocabulary029.js';

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function transformMatrix029(transform: SvgTransform029): Matrix {
  switch (transform.kind) {
    case 'matrix': return transform.values;
    case 'translate': return [1, 0, 0, 1, transform.x, transform.y];
    case 'scale': return [transform.x, 0, 0, transform.y, 0, 0];
    case 'skewX': return [1, 0, Math.tan(radians(transform.angle)), 1, 0, 0];
    case 'skewY': return [1, Math.tan(radians(transform.angle)), 0, 1, 0, 0];
    case 'rotate': {
      const angle = radians(transform.angle);
      const rotation: Matrix = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0];
      if (!transform.center) return rotation;
      const [cx, cy] = transform.center;
      return multiply(multiply([1, 0, 0, 1, cx, cy], rotation), [1, 0, 0, 1, -cx, -cy]);
    }
  }
}

/** Absolute points the bound applies to, and the arc radii (profile §10 item 5). */
function geometryPoints(geometry: SvgGeometry029): { points: number[]; radii: number[] } {
  const points: number[] = [];
  const radii: number[] = [];
  switch (geometry.kind) {
    case 'rect': {
      const { x, y, width, height } = geometry;
      points.push(x, y, x + width, y, x, y + height, x + width, y + height);
      break;
    }
    case 'circle': case 'ellipse': {
      const rx = geometry.kind === 'circle' ? geometry.r : geometry.rx;
      const ry = geometry.kind === 'circle' ? geometry.r : geometry.ry;
      const { cx, cy } = geometry;
      points.push(cx - rx, cy - ry, cx + rx, cy - ry, cx - rx, cy + ry, cx + rx, cy + ry);
      break;
    }
    case 'line': points.push(geometry.x1, geometry.y1, geometry.x2, geometry.y2); break;
    // Point lists may hold 200,000 numbers, too many to spread into a call.
    case 'polyline': case 'polygon': for (const value of geometry.points) points.push(value); break;
    case 'path': {
      let x = 0, y = 0, startX = 0, startY = 0;
      let cubicX = 0, cubicY = 0, quadX = 0, quadY = 0;
      let previous = '';
      for (const { command, values: v } of geometry.commands) {
        const upper = command.toUpperCase();
        const relative = command !== upper;
        const ax = (value: number) => relative ? x + value : value;
        const ay = (value: number) => relative ? y + value : value;
        switch (upper) {
          case 'M': x = ax(v[0]!); y = ay(v[1]!); startX = x; startY = y; points.push(x, y); break;
          case 'L': case 'T': {
            if (upper === 'T') {
              const reflect = previous === 'Q' || previous === 'T';
              quadX = reflect ? x + (x - quadX) : x;
              quadY = reflect ? y + (y - quadY) : y;
              points.push(quadX, quadY);
            }
            x = ax(v[0]!); y = ay(v[1]!); points.push(x, y);
            break;
          }
          case 'H': x = ax(v[0]!); points.push(x, y); break;
          case 'V': y = ay(v[0]!); points.push(x, y); break;
          case 'C': {
            const x1 = ax(v[0]!), y1 = ay(v[1]!);
            cubicX = ax(v[2]!); cubicY = ay(v[3]!);
            const ex = ax(v[4]!), ey = ay(v[5]!);
            points.push(x1, y1, cubicX, cubicY, ex, ey);
            x = ex; y = ey;
            break;
          }
          case 'S': {
            const reflect = previous === 'C' || previous === 'S';
            const x1 = reflect ? x + (x - cubicX) : x, y1 = reflect ? y + (y - cubicY) : y;
            cubicX = ax(v[0]!); cubicY = ay(v[1]!);
            const ex = ax(v[2]!), ey = ay(v[3]!);
            points.push(x1, y1, cubicX, cubicY, ex, ey);
            x = ex; y = ey;
            break;
          }
          case 'Q': {
            quadX = ax(v[0]!); quadY = ay(v[1]!);
            const ex = ax(v[2]!), ey = ay(v[3]!);
            points.push(quadX, quadY, ex, ey);
            x = ex; y = ey;
            break;
          }
          case 'A': {
            const rx = Math.abs(v[0]!), ry = Math.abs(v[1]!);
            let radius = Math.max(rx, ry);
            const minorRadius = Math.min(rx, ry);
            const ex = ax(v[5]!), ey = ay(v[6]!);
            // Short minor arcs need not paint a whole authored ellipse. Keep
            // the old guard, or use the chord/axis-ratio bound (§10 item 5).
            if (v[3] === 0 && minorRadius > 0) {
              const chord = Math.hypot(ex - x, ey - y);
              // Coincident arcs draw nothing; avoid 0 * Infinity for tiny ry/rx.
              radius = chord === 0 ? 0 : Math.min(radius, chord * (radius / minorRadius) / 2);
            }
            radii.push(radius);
            x = ex; y = ey;
            points.push(x, y);
            break;
          }
          case 'Z': x = startX; y = startY; break;
        }
        previous = upper;
      }
      break;
    }
  }
  return { points, radii };
}

export function checkGeometry029(root: ArtworkNode029, viewBox: SvgViewBox029,
  computed: ReadonlyMap<ArtworkNode029, ComputedStyle029>): SvgArtworkFailure029[] {
  const failures: SvgArtworkFailure029[] = [];
  const reach = 8 * Math.max(viewBox.width, viewBox.height);
  const minX = viewBox.minX - reach, maxX = viewBox.minX + viewBox.width + reach;
  const minY = viewBox.minY - reach, maxY = viewBox.minY + viewBox.height + reach;
  const fail = (node: ArtworkNode029, detail: string) => failures.push({ code: 'coral.artwork.svg.geometry.invalid',
    phase: 'P6', detail: `<${node.name}> ${detail}`, start: node.raw.start, end: node.raw.end });

  const visit = (node: ArtworkNode029, parent: Matrix) => {
    let ctm = parent;
    for (const transform of node.transform) ctm = multiply(ctm, transformMatrix029(transform));
    if (ctm.some((entry) => !Number.isFinite(entry)) || ctm[0] * ctm[3] - ctm[1] * ctm[2] === 0) {
      fail(node, 'has a singular or non-finite transformation');
      return;
    }
    if (PRIMITIVES_029.has(node.name) && node.geometry) {
      const { points, radii } = geometryPoints(node.geometry);
      const scale = Math.max(Math.abs(ctm[0]) + Math.abs(ctm[2]), Math.abs(ctm[1]) + Math.abs(ctm[3]));
      let inside = true;
      for (let index = 0; index < points.length && inside; index += 2) {
        const px = points[index]!, py = points[index + 1]!;
        const tx = ctm[0] * px + ctm[2] * py + ctm[4];
        const ty = ctm[1] * px + ctm[3] * py + ctm[5];
        inside = tx >= minX && tx <= maxX && ty >= minY && ty <= maxY;
      }
      if (!inside) fail(node, 'lies outside the effective bounds');
      else if (computed.get(node)!.strokeWidth * scale > reach) fail(node, 'stroke width exceeds the effective bounds');
      else if (radii.some((radius) => radius * scale > reach)) fail(node, 'arc radius exceeds the effective bounds');
      return;
    }
    for (const child of node.children) if (child.rendering) visit(child, ctm);
  };
  visit(root, IDENTITY);
  return failures;
}
