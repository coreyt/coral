/** BPMN gateway contour and caption frame used by sizing, routing and paint. */
import type { LayoutDirection } from './layout/types.js';
import { fontMetrics, type ResolvedFont } from './text/fonts.js';
import { measureText } from './text/metrics.js';
import type { NodeLabelLayout } from './text/sizing.js';

const DIAMOND_SIZE = 96;
const FRAME_MARGIN = 4;
const CAPTION_GAP = 12;
const CAPTION_MARGIN = 8;

export function isBpmnGatewaySymbol028(symbolId: string | undefined): boolean {
  return symbolId === 'bpmn-gateway-exclusive' ||
    symbolId === 'bpmn-gateway-parallel' ||
    symbolId === 'bpmn-gateway-inclusive' ||
    symbolId === 'bpmn-gateway-event';
}

const sideCaption = (direction: LayoutDirection): boolean =>
  direction === 'DOWN' || direction === 'UP';

function captionMetrics(label: string, font: ResolvedFont) {
  const measured = measureText({ text: label, fontFamily: font.cssFamily,
    fontSize: font.size, fontWeight: font.weight,
    lineHeight: font.lineHeight });
  const vertical = fontMetrics(font.id, font.weight);
  const lineHeightPx = Math.ceil(font.size * font.lineHeight);
  const inkHeight = (measured.lines.length - 1) * lineHeightPx +
    (vertical.ascent + vertical.descent) * font.size;
  return { ...measured, vertical, lineHeightPx, inkHeight };
}

export function bpmnGatewayMinimumSize028(
  label: string, font: ResolvedFont, direction: LayoutDirection = 'RIGHT',
): { width: number; height: number } {
  const caption = captionMetrics(label, font);
  return sideCaption(direction)
    ? { width: Math.ceil(DIAMOND_SIZE + 2 * (CAPTION_GAP +
        caption.width + CAPTION_MARGIN)),
      height: Math.ceil(Math.max(DIAMOND_SIZE + FRAME_MARGIN * 2,
        caption.inkHeight + CAPTION_MARGIN * 2)) }
    : { width: Math.ceil(Math.max(DIAMOND_SIZE + FRAME_MARGIN * 2,
        caption.width + CAPTION_MARGIN * 2)),
      height: Math.ceil(FRAME_MARGIN + DIAMOND_SIZE + CAPTION_GAP +
        caption.inkHeight + CAPTION_MARGIN) };
}

export function bpmnGatewayFrame028(
  width: number, height: number, direction: LayoutDirection = 'RIGHT',
): { x: number; y: number; width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) ||
    width < DIAMOND_SIZE + FRAME_MARGIN * 2 ||
    height < DIAMOND_SIZE + FRAME_MARGIN * 2) {
    throw new Error('render.capability.bpmn-gateway-size: box cannot contain the diamond');
  }
  return sideCaption(direction)
    ? { x: (width - DIAMOND_SIZE) / 2, y: (height - DIAMOND_SIZE) / 2,
      width: DIAMOND_SIZE, height: DIAMOND_SIZE }
    : { x: (width - DIAMOND_SIZE) / 2, y: FRAME_MARGIN,
      width: DIAMOND_SIZE, height: DIAMOND_SIZE };
}

export function bpmnGatewayLabelLayout028(
  label: string, font: ResolvedFont, width: number, height: number,
  direction: LayoutDirection = 'RIGHT',
): NodeLabelLayout {
  const minimum = bpmnGatewayMinimumSize028(label, font, direction);
  if (width + 1e-6 < minimum.width || height + 1e-6 < minimum.height) {
    throw new Error('render.capability.hard-size-text-conflict: BPMN gateway caption ' +
      `requires ${minimum.width}×${minimum.height}px, has ${width}×${height}px`);
  }
  const frame = bpmnGatewayFrame028(width, height, direction);
  const caption = captionMetrics(label, font);
  const top = sideCaption(direction)
    ? (height - caption.inkHeight) / 2
    : frame.y + frame.height + CAPTION_GAP;
  return { width, height,
    textBox: { x: sideCaption(direction) ? frame.x + frame.width + CAPTION_GAP : 0,
      y: top, width: sideCaption(direction)
        ? width - frame.x - frame.width - CAPTION_GAP - FRAME_MARGIN : width,
      height: caption.inkHeight },
    lines: caption.lines, lineHeightPx: caption.lineHeightPx,
    baselines: caption.lines.map((_, index) =>
      top + caption.vertical.ascent * font.size + index * caption.lineHeightPx),
    textWidth: caption.width, textHeight: caption.inkHeight };
}

export function bpmnGatewayCaptionOffsetX028(
  layout: NodeLabelLayout, direction: LayoutDirection = 'RIGHT',
): number {
  if (!sideCaption(direction)) return 0;
  const frame = bpmnGatewayFrame028(layout.width, layout.height, direction);
  return frame.x + frame.width + CAPTION_GAP + layout.textWidth / 2 - layout.width / 2;
}
