import type { ShapeDefinition, ShapeSizing } from './types.js';
import type { LayoutDirection } from './layout/types.js';

export const CAPTION_GAP_029 = 5;
export const CAPTION_SIDE_GAP_0211 = 10;
export const CAPTION_PAD_X_029 = 6;
export const CAPTION_PAD_Y_029 = 3;
/** Default caption wrap column (128 px text + 12 px padding = 140 px outer band). */
export const DEFAULT_CAPTION_WRAP_WIDTH_029 = 128;

/** Canonical bounding box for uniform outside-captioned iconic glyphs (DRQ-10 Option 2). */
export const CANONICAL_GLYPH_BOX_0210 = Object.freeze({ width: 72, height: 56 });

/** True when iconic stencil captions sit to the right of the glyph so vertical flows stay straight. */
export function isSideCaptionDirection0211(direction?: LayoutDirection): boolean {
  return direction === 'DOWN' || direction === 'UP';
}

export interface StencilCaptionContext0210 {
  notationId?: string;
  symbolId?: string;
  layoutDirection?: LayoutDirection;
}

const ALWAYS_CAPTIONED_SHAPES_0210 = new Set(
  'actor brain funnel neural-net cube chip chat-bubble shield gear warehouse lake pipe wave dashboard'.split(' '),
);
const DOMAIN_CAPTIONED_SHAPES_0210 = new Set('cylinder diamond hexagon cloud parallelogram'.split(' '));
const DOMAIN_NOTATIONS_0210 = new Set(['aiml', 'architecture', 'infrastructure', 'data-engineering']);

function isDomainCaptionContext0210(context?: StencilCaptionContext0210): boolean {
  return Boolean(context && (
    (context.notationId && DOMAIN_NOTATIONS_0210.has(context.notationId))
    || (context.symbolId && /^(?:aiml|arch|infra|data)-/.test(context.symbolId))
  ));
}

/** Drawing clearance only: never changes the frozen catalog or its anchor geometry. */
export function stencilCaptionHeight028(shapeId: string, context?: StencilCaptionContext0210): number {
  if (ALWAYS_CAPTIONED_SHAPES_0210.has(shapeId)) return 32;
  if (DOMAIN_CAPTIONED_SHAPES_0210.has(shapeId) && isDomainCaptionContext0210(context)) return 32;
  return 0;
}

export interface CaptionedStencilFrame029 {
  glyph: { x: number; y: number; width: number; height: number };
  captionBand: { x: number; y: number; width: number; height: number };
  textBox: { x: number; y: number; width: number; height: number };
  captionSide: 'bottom' | 'right';
  scale: number;
  viewX: number;
  viewY: number;
}

export interface CaptionedStencilFrameOptions029 extends StencilCaptionContext0210 {
  glyphSize?: { width: number; height: number };
  captionWrapWidth?: number;
}

/**
 * Shared independent glyph and caption geometry for outside-captioned stencils
 * (DRQ-10 Option 2). Normalizes glyphs to the canonical glyph box (or explicit
 * `glyphSize`) independent of caption length. In RIGHT/LEFT layouts the caption
 * sits beneath the glyph; in DOWN/UP layouts it sits cleanly to the right so
 * vertical connectors can attach directly to NORTH and SOUTH without detours.
 */
export function captionedStencilFrame029(
  shape: ShapeDefinition,
  width: number,
  height: number,
  options?: CaptionedStencilFrameOptions029,
): CaptionedStencilFrame029 {
  const parts = shape.viewBox.trim().split(/[\s,]+/).map(Number);
  const [viewX = 0, viewY = 0, viewWidth = width, viewHeight = height] = parts;
  const minCaptionBand = stencilCaptionHeight028(shape.id, options);
  const targetBox = options?.glyphSize ?? CANONICAL_GLYPH_BOX_0210;
  const nativeScale = Math.min(targetBox.width / viewWidth, targetBox.height / viewHeight);
  const targetW = viewWidth * nativeScale;
  const targetH = viewHeight * nativeScale;

  if (isSideCaptionDirection0211(options?.layoutDirection)) {
    const minSideBand = CAPTION_SIDE_GAP_0211 + 24;
    const shrink = height + 1e-6 < targetH || width + 1e-6 < targetW + minSideBand;
    const scale = shrink
      ? Math.min(nativeScale, height / viewHeight, width / (viewWidth + minSideBand / Math.max(1e-6, nativeScale)))
      : nativeScale;
    const fittedWidth = viewWidth * scale;
    const fittedHeight = viewHeight * scale;
    const shrinkRatio = nativeScale > 0 ? scale / nativeScale : 1;
    const offsetX = 0;
    const offsetY = (height - fittedHeight) / 2;
    const bandLeft = fittedWidth + (shrink ? CAPTION_SIDE_GAP_0211 * shrinkRatio : CAPTION_SIDE_GAP_0211);
    const bandWidth = Math.max(0, width - bandLeft);
    const availableTextWidth = Math.max(0, bandWidth - CAPTION_PAD_X_029 * 2);
    const textWidth = options?.captionWrapWidth !== undefined
      ? Math.min(availableTextWidth, Math.max(0, options.captionWrapWidth))
      : availableTextWidth;
    const textBox = {
      x: bandLeft + CAPTION_PAD_X_029,
      y: CAPTION_PAD_Y_029,
      width: textWidth,
      height: Math.max(0, height - CAPTION_PAD_Y_029 * 2),
    };
    return {
      glyph: { x: offsetX, y: offsetY, width: fittedWidth, height: fittedHeight },
      captionBand: { x: bandLeft, y: 0, width: bandWidth, height },
      textBox,
      captionSide: 'right',
      scale,
      viewX,
      viewY,
    };
  }

  const targetTotalH = targetH + minCaptionBand;
  const shrink = width + 1e-6 < targetW || height + 1e-6 < targetTotalH;
  const scale = shrink
    ? Math.min(nativeScale, width / viewWidth, height / (viewHeight + minCaptionBand / nativeScale))
    : nativeScale;
  const fittedWidth = viewWidth * scale;
  const fittedHeight = viewHeight * scale;
  const shrinkRatio = nativeScale > 0 ? scale / nativeScale : 1;
  const offsetX = (width - fittedWidth) / 2;
  const offsetY = shrink ? (height - (fittedHeight + minCaptionBand * shrinkRatio)) / 2 : 0;
  const bandTop = offsetY + fittedHeight + (shrink ? CAPTION_GAP_029 * shrinkRatio : CAPTION_GAP_029);
  const bandHeight = shrink
    ? Math.max(0, (minCaptionBand - CAPTION_GAP_029) * shrinkRatio)
    : Math.max(0, height - bandTop);
  const availableTextWidth = Math.max(0, width - CAPTION_PAD_X_029 * 2);
  const textWidth = options?.captionWrapWidth !== undefined
    ? Math.min(availableTextWidth, Math.max(0, options.captionWrapWidth))
    : availableTextWidth;
  const textX = options?.captionWrapWidth !== undefined
    ? (width - textWidth) / 2
    : CAPTION_PAD_X_029;
  const textBox = {
    x: textX,
    y: bandTop + CAPTION_PAD_Y_029,
    width: textWidth,
    height: Math.max(0, bandHeight - CAPTION_PAD_Y_029 * 2),
  };
  return {
    glyph: { x: offsetX, y: offsetY, width: fittedWidth, height: fittedHeight },
    captionBand: { x: 0, y: bandTop, width, height: bandHeight },
    textBox,
    captionSide: 'bottom',
    scale,
    viewX,
    viewY,
  };
}

export type StencilLabelSizing028 = ShapeSizing & {
  textRegion?: { x: number; y: number; width: number; height: number };
};

/** Safe text area in the complete drawing frame, including an icon caption band. */
export function stencilLabelSizing028(shape: ShapeDefinition, context?: StencilCaptionContext0210): StencilLabelSizing028 {
  const sizing = shape.sizing ?? { textBoundsRatio: { x: 1, y: 1 },
    minSize: { width: 60, height: 30 }, padding: { x: 16, y: 12 } };
  const captionHeight = stencilCaptionHeight028(shape.id, context);
  if (captionHeight) {
    const [, , viewWidth = 100, viewHeight = 80] = shape.viewBox.trim().split(/[\s,]+/).map(Number);
    const scale = Math.min(CANONICAL_GLYPH_BOX_0210.width / viewWidth, CANONICAL_GLYPH_BOX_0210.height / viewHeight);
    const height = viewHeight * scale;
    const total = height + captionHeight;
    return { ...sizing, minSize: { ...sizing.minSize, height: total },
      padding: { x: CAPTION_PAD_X_029, y: CAPTION_PAD_Y_029 },
      textRegion: { x: 0, y: (height + CAPTION_GAP_029) / total, width: 1, height: (captionHeight - CAPTION_GAP_029) / total } };
  }
  const bodyRegions: Record<string, { x: number; y: number; width: number; height: number }> = {
    stadium: { x: 1 / 6, y: 0, width: 2 / 3, height: 1 },
    parallelogram: { x: 1 / 6, y: 0, width: 2 / 3, height: 1 },
    document: { x: 0, y: 0, width: 1, height: 0.62 },
    cylinder: { x: 0, y: 0.375, width: 1, height: 0.4375 },
  };
  if (bodyRegions[shape.id]) return { ...sizing, padding: { x: 10, y: 6 },
    textRegion: bodyRegions[shape.id] };
  if (shape.id === 'hexagon') return { ...sizing, padding: { x: 6, y: 6 },
    textRegion: { x: 0.15, y: 0.25, width: 0.7, height: 0.5 } };
  if (shape.id === 'diamond') return { ...sizing,
    textBoundsRatio: { x: 1.32, y: 1.32 },
    padding: { x: 14, y: 14 } };
  return sizing;
}
