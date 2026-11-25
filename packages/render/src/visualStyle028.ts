/** Approved 0.2.8 presentation rules. This module contains no Coral parser or
 * GraphIR inference: callers supply semantic parts and resolved coordinates. */
import type { Position } from '@graph-ir/core';
import { containerStencilShape028 } from './containerGeometry028.js';
import { shapeRegistry } from './shapes/index.js';
import { resolveShapePath } from './scene.js';
import type { ShapeDefinition } from './types.js';

export type RenderStyle028 = 'lowfi' | 'hifi';

/** 0.2.14 canonical render styles: monochrome `lowfi`/`hifi` plus peer `anemone`. */
export type RenderStyle0214 = RenderStyle028 | 'anemone';

/** Accepted style inputs, including the `'ane'` shorthand for `'anemone'`. */
export type RenderStyleInput0214 = RenderStyle0214 | 'ane';

export function normalizeRenderStyle0214(style: unknown): RenderStyle0214 {
  if (style === 'lowfi' || style === 'hifi') return style;
  if (style === 'anemone' || style === 'ane') return 'anemone';
  throw new Error(`render.capability.style: ${String(style)} is unavailable; thx is reserved`);
}

export function baseRenderStyle028(style: unknown): RenderStyle028 {
  return normalizeRenderStyle0214(style ?? 'lowfi') === 'lowfi' ? 'lowfi' : 'hifi';
}

export function isAnemoneStyle0214(style: unknown): boolean {
  return style === 'anemone' || style === 'ane';
}

export interface VisualStyle028 {
  readonly ink: string;
  readonly softInk: string;
  readonly paper: string;
  readonly fontFamily: 'Coral Lowfi Caveat' | 'Coral Inter';
  readonly labelSize: number;
  readonly roleSize: number;
  readonly strokeWidth: number;
}

export const VISUAL_STYLES_028: Readonly<Record<RenderStyle028, VisualStyle028>> = {
  lowfi: { ink: '#363430', softInk: '#77736d', paper: '#ffffff',
    fontFamily: 'Coral Lowfi Caveat', labelSize: 26, roleSize: 26, strokeWidth: 2.3 },
  hifi: { ink: '#22272b', softInk: '#858a8e', paper: '#ffffff',
    fontFamily: 'Coral Inter', labelSize: 14, roleSize: 14, strokeWidth: 1.7 },
};

export interface RouteCornerObstacle028 {
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
}

/** Eligible generated-route elbows only. The quadratic stays inside the
 * original corner square; reject it when even that small arc meets node ink. */
export function routeCornerRadii028(
  points: readonly Position[], obstacles: readonly RouteCornerObstacle028[],
): readonly number[] {
  const route = points.filter((point, index) => index === 0 ||
    Math.hypot(point.x - points[index - 1]!.x, point.y - points[index - 1]!.y) >= 1e-7);
  return route.map((corner, index) => {
    if (index === 0 || index === route.length - 1) return 0;
    const before = route[index - 1]!; const after = route[index + 1]!;
    const inX = corner.x - before.x; const inY = corner.y - before.y;
    const outX = after.x - corner.x; const outY = after.y - corner.y;
    const inLength = Math.hypot(inX, inY); const outLength = Math.hypot(outX, outY);
    if (inLength < 2 || outLength < 2) return 0;
    const ux = inX / inLength; const uy = inY / inLength;
    const vx = outX / outLength; const vy = outY / outLength;
    if (Math.abs(ux * vx + uy * vy) > 1e-4 ||
      !(Math.abs(ux) < 1e-4 || Math.abs(uy) < 1e-4) ||
      !(Math.abs(vx) < 1e-4 || Math.abs(vy) < 1e-4)) return 0;
    const radius = Math.min(6, inLength / 2, outLength / 2);
    const entry = { x: corner.x - ux * radius, y: corner.y - uy * radius };
    const exit = { x: corner.x + vx * radius, y: corner.y + vy * radius };
    for (const obstacle of obstacles) for (const t of [0, .25, .5, .75, 1]) {
      const x = (1 - t) ** 2 * entry.x + 2 * t * (1 - t) * corner.x + t ** 2 * exit.x;
      const y = (1 - t) ** 2 * entry.y + 2 * t * (1 - t) * corner.y + t ** 2 * exit.y;
      if (x >= obstacle.x - 2 && x <= obstacle.x + obstacle.width + 2 &&
        y >= obstacle.y - 2 && y <= obstacle.y + obstacle.height + 2) return 0;
    }
    return radius;
  });
}

export function visualStyle028(style: unknown, theme: 'light' | 'dark' = 'light'): VisualStyle028 {
  if (style !== 'lowfi' && style !== 'hifi') {
    throw new Error(`render.capability.style: ${String(style)} is unavailable; thx is reserved`);
  }
  const selected = VISUAL_STYLES_028[style];
  return theme === 'dark' ? { ...selected, ink: '#f1f5f9', softInk: '#a9bfdc', paper: '#1e1e1e' }
    : selected;
}

/** Small deterministic bow in lowfi ink, with exact first and last contacts.
 * Ported from the reviewed stencil pilot ink route. */
export function inkRoutePath028(
  points: readonly Position[], style: RenderStyle028, cornerRadii?: readonly number[],
): string {
  visualStyle028(style);
  if (points.length < 2 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new Error('render.capability.route: invalid connector route');
  }
  // Layout sections may repeat their shared endpoint. Removing only adjacent
  // zero-length segments leaves both semantic contacts and every bend intact.
  const route = points.filter((point, index) => index === 0 ||
    Math.hypot(point.x - points[index - 1]!.x, point.y - points[index - 1]!.y) >= 1e-7);
  // An unlaid graph can place both endpoints at one point. Keep its authored
  // edge in the scene; a later layout can supply the visible route.
  if (route.length < 2) return `M${points[0]!.x} ${points[0]!.y}`;
  const round = (value: number) => Number(value.toFixed(2));
  let path = `M${route[0]!.x} ${route[0]!.y}`;
  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1]!;
    const next = route[index]!;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-7) throw new Error('render.capability.route: collapsed connector segment');
    if (style === 'hifi') {
      const radius = cornerRadii?.[index] ?? 0;
      if (index < route.length - 1 && radius > 0) {
        const after = route[index + 1]!;
        const outLength = Math.hypot(after.x - next.x, after.y - next.y);
        const entry = { x: next.x - dx / length * radius,
          y: next.y - dy / length * radius };
        const exit = { x: next.x + (after.x - next.x) / outLength * radius,
          y: next.y + (after.y - next.y) / outLength * radius };
        path += ` L${round(entry.x)} ${round(entry.y)}`;
        path += ` Q${next.x} ${next.y} ${round(exit.x)} ${round(exit.y)}`;
        continue;
      }
      path += ` L${next.x} ${next.y}`; continue;
    }
    const amplitude = Math.min(3.4, length * 0.024);
    const sign = (Math.round(previous.x + previous.y + next.x + next.y) + index) % 2 ? 1 : -1;
    const nx = -dy / length * amplitude * sign;
    const ny = dx / length * amplitude * sign;
    path += ` C${round(previous.x + dx * .31 + nx)} ${round(previous.y + dy * .31 + ny)}`;
    path += ` ${round(previous.x + dx * .68 + nx * .57)} ${round(previous.y + dy * .68 + ny * .57)}`;
    path += ` ${next.x} ${next.y}`;
  }
  return path;
}

/** Label contact at half the visible route length, independent of node centers. */
export function routeMidpoint028(points: readonly Position[]): Position {
  if (!points.length) throw new Error('render.capability.route: missing route points');
  const lengths = points.slice(1).map((point, index) =>
    Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!;
    if (remaining > length) { remaining -= length; continue; }
    const first = points[index]!;
    const second = points[index + 1]!;
    const fraction = length ? remaining / length : 0;
    return { x: first.x + (second.x - first.x) * fraction,
      y: first.y + (second.y - first.y) * fraction };
  }
  return points.at(-1)!;
}

/** Uneven but repeatable pen spacing, seeded by the semantic part ID. */
export function visualDashPattern028(
  partId: string, style: RenderStyle028, lineStyle: 'solid' | 'dashed' | 'dotted',
): string | undefined {
  visualStyle028(style);
  if (lineStyle === 'solid') return undefined;
  if (style === 'hifi') return lineStyle === 'dashed' ? '6 4' : '2 4';
  const patterns = lineStyle === 'dashed'
    ? ['7 4 5 3 9 4', '8 4 6 3 5 4', '5 3 8 4 7 4']
    : ['1.7 3.5 2.2 4 1.4 3.2', '2.1 4 1.5 3.2 2 3.8', '1.6 3.3 2 4.1 1.8 3.6'];
  let hash = 2166136261;
  for (let index = 0; index < partId.length; index += 1) {
    hash = Math.imul(hash ^ partId.charCodeAt(index), 16777619);
  }
  return patterns[(hash >>> 0) % patterns.length];
}

/** Canonical geometry for the approved six-family tranche. Contours use a
 * normalized viewBox; layout and semantic connector contacts remain separate. */
export function visualContour028(
  shape: string | ShapeDefinition, style: RenderStyle028,
  parameters?: Readonly<Record<string, number | string | boolean>>,
  containerFrame?: { width: number; height: number },
): string {
  visualStyle028(style);
  const registered = typeof shape === 'string' ? shapeRegistry.get(shape) : shape;
  const installed = registered && containerFrame
    ? containerStencilShape028(registered, containerFrame.width, containerFrame.height, true) : registered;
  if (!installed) throw new Error(`render.capability.stencil: ${typeof shape === 'string' ? shape : shape.id} is not installed`);
  const exact = resolveShapePath(installed, parameters);
  if (style === 'hifi') return exact;
  const [, , width, height] = installed.viewBox.split(/\s+/).map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height) || !width || !height) {
    throw new Error(`render.capability.stencil: ${typeof shape === 'string' ? shape : shape.id} has an invalid viewBox`);
  }
  const w = width!;
  const h = height!;
  // Each contour passes through the exact catalog contact at every compass
  // anchor. Variation lives between contacts, so route and hit geometry never
  // suggest a different endpoint or port. Unlike a turbulence filter the
  // result is stable at every zoom and on both canvas and standalone SVG.
  if (shape === 'rectangle' && !(typeof parameters?.cornerRadius === 'number' && parameters.cornerRadius > 0)) {
    return `M0 0 Q${w * .25} ${-h * .007} ${w / 2} 0 Q${w * .75} ${h * .004} ${w} 0 ` +
      `Q${w * 1.004} ${h * .25} ${w} ${h / 2} Q${w * .997} ${h * .75} ${w} ${h} ` +
      `Q${w * .75} ${h * 1.005} ${w / 2} ${h} Q${w * .25} ${h * .997} 0 ${h} ` +
      `Q${-w * .004} ${h * .75} 0 ${h / 2} Q${w * .003} ${h * .25} 0 0 Z`;
  }
  if (shape === 'diamond') {
    return `M${w / 2} 0 Q${w * .62} ${h * .12} ${w * .75} ${h * .25} ` +
      `Q${w * .88} ${h * .38} ${w} ${h / 2} Q${w * .88} ${h * .63} ${w * .75} ${h * .75} ` +
      `Q${w * .62} ${h * .88} ${w / 2} ${h} Q${w * .37} ${h * .88} ${w * .25} ${h * .75} ` +
      `Q${w * .12} ${h * .62} 0 ${h / 2} Q${w * .12} ${h * .37} ${w * .25} ${h * .25} ` +
      `Q${w * .37} ${h * .12} ${w / 2} 0 Z`;
  }
  if (shape === 'ellipse') {
    const rx = w / 2;
    const ry = h / 2;
    const points = Array.from({ length: 9 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI / 4;
      return { x: rx + rx * Math.cos(angle), y: ry + ry * Math.sin(angle) };
    });
    let path = `M${points[0]!.x} ${points[0]!.y}`;
    for (let index = 0; index < 8; index += 1) {
      const first = points[index]!;
      const last = points[index + 1]!;
      const angle = -Math.PI / 2 + (index + .5) * Math.PI / 4;
      const bias = index % 2 ? 1.006 : .994;
      const middle = { x: rx + rx * Math.cos(angle) * bias,
        y: ry + ry * Math.sin(angle) * bias };
      // The control point makes the quadratic pass through the biased middle.
      path += ` Q${2 * middle.x - (first.x + last.x) / 2} ` +
        `${2 * middle.y - (first.y + last.y) / 2} ${last.x} ${last.y}`;
    }
    return `${path} Z`;
  }
  if (shape === 'stadium') {
    const r = h / 2;
    return `M${r} 0 Q${w * .36} ${-h * .006} ${w / 2} 0 ` +
      `Q${w * .64} ${h * .004} ${w - r} 0 ` +
      `C${w - r * .43} ${-h * .008} ${w * 1.005} ${h * .22} ${w} ${h / 2} ` +
      `C${w * 1.004} ${h * .78} ${w - r * .43} ${h * 1.005} ${w - r} ${h} ` +
      `Q${w * .64} ${h * 1.005} ${w / 2} ${h} ` +
      `Q${w * .36} ${h * .997} ${r} ${h} ` +
      `C${r * .43} ${h * 1.006} ${-w * .004} ${h * .78} 0 ${h / 2} ` +
      `C${-w * .003} ${h * .22} ${r * .43} ${-h * .004} ${r} 0 Z`;
  }
  if (shape === 'parallelogram') {
    const inset = w / 6;
    return `M${inset} 0 Q${w * .34} ${-h * .006} ${w / 2} 0 ` +
      `Q${w * .82} ${h * .004} ${w} 0 ` +
      `Q${w - inset * .24} ${h * .22} ${w - inset / 2} ${h / 2} ` +
      `Q${w - inset * .78} ${h * .78} ${w - inset} ${h} ` +
      `Q${w * .68} ${h * 1.004} ${w / 2} ${h} ` +
      `Q${w * .23} ${h * .997} 0 ${h} ` +
      `Q${inset * .25} ${h * .77} ${inset / 2} ${h / 2} ` +
      `Q${inset * .77} ${h * .22} ${inset} 0 Z`;
  }
  if (shape === 'document') {
    return `M0 0 Q${w * .25} ${-h * .005} ${w / 2} 0 ` +
      `Q${w * .75} ${h * .004} ${w} 0 ` +
      `Q${w * 1.003} ${h * .25} ${w} ${h / 2} ` +
      `Q${w * .997} ${h * .64} ${w} ${h * 55 / 70} ` +
      `Q${w * .75} ${h * 1.004} ${w * .5} ${h * 55 / 70} ` +
      `Q${w * .25} ${h * 40 / 70} 0 ${h * 55 / 70} ` +
      `Q${-w * .003} ${h * .65} 0 ${h / 2} ` +
      `Q${w * .003} ${h * .25} 0 0 Z`;
  }
  if (shape === 'subroutine') {
    return visualContour028('rectangle', style) +
      ` M${w * .1} 0 Q${w * .102} ${h * .5} ${w * .1} ${h}` +
      ` M${w * .9} 0 Q${w * .898} ${h * .5} ${w * .9} ${h}`;
  }
  return exact;
}

/** Short pen overdraw at vertices; never changes the attachment contour. */
export function visualOverdraw028(shape: string | ShapeDefinition, style: RenderStyle028,
  parameters?: Readonly<Record<string, number | string | boolean>>,
  containerFrame?: { width: number; height: number }): readonly string[] {
  visualStyle028(style);
  if (style === 'hifi') return [];
  const registered = typeof shape === 'string' ? shapeRegistry.get(shape) : shape;
  const installed = registered && containerFrame
    ? containerStencilShape028(registered, containerFrame.width, containerFrame.height, true) : registered;
  if (!installed) throw new Error(`render.capability.stencil: ${typeof shape === 'string' ? shape : shape.id} is not installed`);
  const [, , width, height] = installed.viewBox.split(/\s+/).map(Number);
  const w = width!;
  const h = height!;
  if (shape === 'rectangle' && !(typeof parameters?.cornerRadius === 'number' && parameters.cornerRadius > 0)) {
    const dx = Math.min(5, w * .05);
    const dy = Math.min(4, h * .06);
    return [`M${-dx} 0 L${dx} 0`, `M${w - dx} 0 L${w + dx} 0`,
      `M${-dx} ${h} L${dx} ${h}`, `M${w - dx} ${h} L${w + dx} ${h}`,
      `M0 ${-dy} L0 ${dy}`, `M${w} ${-dy} L${w} ${dy}`,
      `M0 ${h - dy} L0 ${h + dy}`, `M${w} ${h - dy} L${w} ${h + dy}`];
  }
  if (shape === 'diamond') {
    const dx = Math.min(4, w * .04);
    const dy = Math.min(4, h * .04);
    return [`M${w / 2 - dx} ${-dy} L${w / 2 + dx} ${dy}`,
      `M${w - dx} ${h / 2 - dy} L${w + dx} ${h / 2 + dy}`,
      `M${w / 2 - dx} ${h - dy} L${w / 2 + dx} ${h + dy}`,
      `M${-dx} ${h / 2 - dy} L${dx} ${h / 2 + dy}`];
  }
  return [];
}
