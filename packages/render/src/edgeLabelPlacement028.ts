import type { EdgeLabelPlacement, Position } from '@graph-ir/core';
import { fontMetrics, resolveFont } from './text/fonts.js';
import { measureText, type MeasureOptions } from './text/metrics.js';

/** Alphabetic baselines must contain ascent/descent even when authored line
 * spacing is smaller than the font's ink. Keep the requested row advance. */
export function measureEdgeLabel028(options: MeasureOptions) {
  const measured = measureText(options);
  const size = options.fontSize ?? 12;
  const weight = options.fontWeight;
  const font = resolveFont({ size, family: options.fontFamily,
    weight: typeof weight === 'number' || weight === 'bold' ? weight : 'normal' });
  const metrics = fontMetrics(font.id, font.weight);
  const advance = Math.ceil(size * (options.lineHeight ?? 1.4));
  // Browsers grid-fit the bundled font's ascent/descent to whole pixels.
  const ascent = Math.ceil(metrics.ascent * size);
  const descent = Math.ceil(metrics.descent * size);
  const inkHeight = ascent + descent + (measured.lines.length - 1) * advance;
  const height = Math.max(measured.height, inkHeight);
  // Advance width does not include italic/handwritten glyph side overhang.
  // Reserve a quarter-em inset on either side of the common label box.
  return { ...measured, width: measured.width + 2 * Math.ceil(size / 4), height,
    baselineOffset: (height - inkHeight) / 2 + ascent };
}

/** Page-relative label box at normalized arc length on the final resolved
 * source-to-target polyline. Presentation ink does not reorder its points. */
export function authoredEdgeLabelBox028(points: readonly Position[], placement: EdgeLabelPlacement,
  width: number, height: number): { x: number; y: number; width: number; height: number } {
  const { side, at = .5, offset = 0 } = placement;
  if (!['above', 'below', 'left', 'right', 'center'].includes(side) ||
    !Number.isFinite(at) || at < 0 || at > 1 || !Number.isFinite(offset) || offset < 0 ||
    (side === 'center' && offset !== 0) || !Number.isFinite(width) || !Number.isFinite(height) ||
    width < 0 || height < 0 || !points.length || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)))
    throw new Error('layout.capability.unsupported: invalid authored edge label placement');
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!Number.isFinite(total)) throw new Error('layout.capability.unsupported: non-finite edge path length');
  let distance = total * at;
  let anchor = points[0];
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index];
    if (length === 0) continue;
    if (distance <= length || index === lengths.length - 1) {
      const fraction = distance / length;
      anchor = { x: points[index].x + (points[index + 1].x - points[index].x) * fraction,
        y: points[index].y + (points[index + 1].y - points[index].y) * fraction };
      break;
    }
    distance -= length;
  }
  return { x: side === 'left' ? anchor.x - offset - width : side === 'right' ? anchor.x + offset : anchor.x - width / 2,
    y: side === 'above' ? anchor.y - offset - height : side === 'below' ? anchor.y + offset : anchor.y - height / 2,
    width, height };
}
