/** Approved BPMN event ring and caption geometry. This presentation module
 * changes neither the canonical symbol nor its semantic ports. */
import { fontMetrics, type ResolvedFont } from './text/fonts.js';
import { measureText } from './text/metrics.js';
import type { NodeLabelLayout } from './text/sizing.js';
import type { RenderStyle028 } from './visualStyle028.js';
import type { StencilPathPrimitive028 } from './drawingPrimitives028.js';
import type { LayoutDirection } from './layout/types.js';

export const BPMN_EVENT_DIAMETER_028 = 56;
const RING_TOP = 4;
const CAPTION_TOP = 68;
const SIDE_GAP = 12;
const sideCaption = (direction: LayoutDirection) => direction === 'DOWN' || direction === 'UP';

export function isBpmnEventSymbol028(symbolId: string | undefined): boolean {
  return symbolId === 'bpmn-start-event' || symbolId === 'bpmn-end-event' ||
    symbolId === 'bpmn-intermediate-event';
}

export function bpmnEventMinimumSize028(label: string, font: ResolvedFont, direction: LayoutDirection = 'RIGHT'): {
  width: number; height: number;
} {
  const ink = measureText({ text: label, fontFamily: font.cssFamily,
    fontSize: font.size, fontWeight: font.weight, lineHeight: font.lineHeight });
  const metrics = fontMetrics(font.id, font.weight);
  if (sideCaption(direction)) return {
    width: Math.ceil(BPMN_EVENT_DIAMETER_028 + 2 * (SIDE_GAP + ink.width + 8)),
    height: Math.ceil(Math.max(BPMN_EVENT_DIAMETER_028 + 8,
      (metrics.ascent + metrics.descent) * font.size + 16)),
  };
  return { width: Math.ceil(Math.max(BPMN_EVENT_DIAMETER_028 + 8, ink.width + 16)),
    height: Math.ceil(CAPTION_TOP + Math.max(ink.height,
      (metrics.ascent + metrics.descent) * font.size) + 8) };
}

export function bpmnEventFrame028(width: number, height: number, direction: LayoutDirection = 'RIGHT'): {
  x: number; y: number; width: number; height: number;
} {
  if (!Number.isFinite(width) || !Number.isFinite(height) ||
    width < BPMN_EVENT_DIAMETER_028 || height < (sideCaption(direction) ? 64 : CAPTION_TOP)) {
    throw new Error('render.capability.bpmn-event-size: event box cannot contain the native ring');
  }
  return { x: (width - BPMN_EVENT_DIAMETER_028) / 2,
    y: sideCaption(direction) ? (height - BPMN_EVENT_DIAMETER_028) / 2 : RING_TOP,
    width: BPMN_EVENT_DIAMETER_028, height: BPMN_EVENT_DIAMETER_028 };
}

export function bpmnEventLabelLayout028(
  label: string, font: ResolvedFont, width: number, height: number,
  direction: LayoutDirection = 'RIGHT',
): NodeLabelLayout {
  const minimum = bpmnEventMinimumSize028(label, font, direction);
  if (width + 1e-6 < minimum.width || height + 1e-6 < minimum.height) {
    throw new Error(`render.capability.hard-size-text-conflict: BPMN event caption requires ` +
      `${minimum.width}×${minimum.height}px, has ${width}×${height}px`);
  }
  const ink = measureText({ text: label, fontFamily: font.cssFamily,
    fontSize: font.size, fontWeight: font.weight, lineHeight: font.lineHeight });
  const metrics = fontMetrics(font.id, font.weight);
  const inkHeight = (metrics.ascent + metrics.descent) * font.size;
  const frame = bpmnEventFrame028(width, height, direction);
  const top = sideCaption(direction) ? (height - inkHeight) / 2 : CAPTION_TOP;
  return { width, height,
    textBox: { x: sideCaption(direction) ? frame.x + frame.width + SIDE_GAP : 0,
      y: top, width: sideCaption(direction) ? ink.width : width, height: inkHeight },
    lines: [label], lineHeightPx: Math.ceil(font.size * font.lineHeight),
    baselines: [top + metrics.ascent * font.size],
    textWidth: ink.width, textHeight: ink.height };
}

export function bpmnEventCaptionOffsetX028(layout: NodeLabelLayout, direction: LayoutDirection = 'RIGHT'): number {
  if (!sideCaption(direction)) return 0;
  const frame = bpmnEventFrame028(layout.width, layout.height, direction);
  return frame.x + frame.width + SIDE_GAP + layout.textWidth / 2 - layout.width / 2;
}

export function bpmnEventCaptionBox028(width: number, height: number, direction: LayoutDirection = 'RIGHT') {
  const frame = bpmnEventFrame028(width, height, direction);
  return sideCaption(direction)
    ? { x: frame.x + frame.width + SIDE_GAP, y: 0,
      width: width - frame.x - frame.width - SIDE_GAP, height }
    : { x: 0, y: CAPTION_TOP, width, height: height - CAPTION_TOP };
}

/** Local 56×56 contours from the approved pilot; caption layout is separate. */
export function bpmnEventPathPrimitives028(
  ownerId: string, symbolId: string, style: RenderStyle028,
  fill: string, stroke: string,
): readonly StencilPathPrimitive028[] {
  if (!isBpmnEventSymbol028(symbolId)) {
    throw new Error(`render.capability.stencil: ${symbolId} is not a BPMN event`);
  }
  const lowfi = style === 'lowfi';
  const d = lowfi
    ? 'M52 26.5 C53 41.9 42.3 52.3 27.5 52 C13.4 51.6 3.8 42.1 4 28.8 C4.2 13.5 14.2 4 27 4 C42 4.2 52.2 13.5 52 26.5 Z'
    : 'M28 4 A24 24 0 1 1 28 52 A24 24 0 1 1 28 4 Z';
  const base = { ownerId, stroke, strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const };
  return [
    { ...base, id: `${ownerId}:outline`, role: 'outline', d, fill,
      strokeWidth: symbolId === 'bpmn-end-event' ? 3.8 : lowfi ? 2.3 : 1.9 },
    ...(lowfi ? [{ ...base, id: `${ownerId}:ring-overdraw`,
      role: 'corner-overdraw' as const,
      d: 'M13 9 C20 3.2 34 2.4 43 8', fill: 'none', strokeWidth: 1.1 }] : []),
  ];
}
