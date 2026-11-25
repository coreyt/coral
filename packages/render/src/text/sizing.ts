/** Deterministic, shape-aware node sizing shared by every renderer. */
import {
  CANONICAL_GLYPH_BOX_0210,
  CAPTION_GAP_029,
  CAPTION_SIDE_GAP_0211,
  CAPTION_PAD_X_029,
  CAPTION_PAD_Y_029,
  DEFAULT_CAPTION_WRAP_WIDTH_029,
  captionedStencilFrame029,
  isSideCaptionDirection0211,
  stencilCaptionHeight028,
  stencilLabelSizing028,
  type StencilCaptionContext0210,
  type StencilLabelSizing028,
} from '../stencilLabelGeometry028.js';
import { shapeRegistry } from '../shapes/index.js';
import type {
  NodeDimensions,
  NodeSizingOptions,
  ShapeSizing,
  SizingMode,
} from '../types.js';
import { measureText, textInkVertical028 } from './metrics.js';
import {
  fontMetrics,
  resolveFont,
  type RenderFontWeight,
} from './fonts.js';

const DEFAULT_SIZING: ShapeSizing = {
  textBoundsRatio: { x: 1, y: 1 },
  minSize: { width: 60, height: 30 },
  padding: { x: 16, y: 12 },
};

const OPTICAL_LABEL_SHAPES = new Set(['stadium', 'parallelogram', 'document', 'cylinder']);

const DEFAULT_FONT = {
  fontSize: 12,
  fontFamily: 'Coral Inter',
  fontWeight: 400,
  lineHeight: 1.4,
};

function renderWeight(weight: string | number): RenderFontWeight {
  return typeof weight === 'number' || weight === 'bold' ? weight : 'normal';
}

function measureLabel(options: {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  lineHeight: number;
  maxWidth: number;
  glyphInk?: boolean;
}) {
  const weight = renderWeight(options.fontWeight);
  const measured = measureText({
    text: options.text,
    fontSize: options.fontSize,
    fontFamily: options.fontFamily,
    fontWeight: weight,
    lineHeight: options.lineHeight,
    maxWidth: options.maxWidth,
  });
  const resolved = resolveFont({
    family: options.fontFamily,
    size: options.fontSize,
    weight,
    lineHeight: options.lineHeight,
  });
  const vertical = options.glyphInk ? textInkVertical028(measured.lines.join(''), resolved)
    : fontMetrics(resolved.id, resolved.weight);
  const ascentPx = vertical.ascent * options.fontSize;
  const descentPx = vertical.descent * options.fontSize;
  const lineHeightPx = Math.ceil(options.fontSize * options.lineHeight);
  const glyphBlockHeight = ascentPx + descentPx
    + Math.max(0, measured.lines.length - 1) * lineHeightPx;
  return {
    ...measured,
    ascentPx,
    descentPx,
    inkMetrics: vertical,
    lineHeightPx,
    glyphBlockHeight,
    textHeight: Math.max(measured.height, glyphBlockHeight),
  };
}

function sizingFor(shapeId: string, context?: StencilCaptionContext0210): {
  shape: ReturnType<typeof shapeRegistry.get>;
  sizing: StencilLabelSizing028;
  defaultSize: { width: number; height: number };
} {
  const shape = shapeRegistry.get(shapeId);
  return {
    shape,
    sizing: shape?.sizing ? stencilLabelSizing028(shape, context) : DEFAULT_SIZING,
    defaultSize: shape?.defaultSize ?? { width: 100, height: 60 },
  };
}

/** The centered rectangle in which a shape can safely render its label. */
export function computeTextBox(
  width: number,
  height: number,
  sizing: StencilLabelSizing028,
  shapeId?: string,
  context?: StencilCaptionContext0210,
): NodeDimensions['textBox'] {
  if (sizing.textRegion) {
    const shape = shapeId ? shapeRegistry.get(shapeId) : undefined;
    if (shape && stencilCaptionHeight028(shape.id, context) > 0) {
      return captionedStencilFrame029(shape, width, height, context).textBox;
    }
    const [, , vw = width, vh = height] = shape?.viewBox.split(/\s+/).map(Number) ?? [];
    const scale = Math.min(width / vw, height / vh);
    const fittedWidth = vw * scale, fittedHeight = vh * scale;
    const region = sizing.textRegion;
    return { x: (width - fittedWidth) / 2 + region.x * fittedWidth + sizing.padding.x,
      y: (height - fittedHeight) / 2 + region.y * fittedHeight + sizing.padding.y,
      width: Math.max(0, region.width * fittedWidth - sizing.padding.x * 2),
      height: Math.max(0, region.height * fittedHeight - sizing.padding.y * 2) };
  }
  const textWidth = Math.max(0, (width - sizing.padding.x * 2) / sizing.textBoundsRatio.x);
  const textHeight = Math.max(0, (height - sizing.padding.y * 2) / sizing.textBoundsRatio.y);
  return {
    x: (width - textWidth) / 2,
    y: (height - textHeight) / 2,
    width: textWidth,
    height: textHeight,
  };
}

/** Compute node dimensions from deterministic metrics and shape constraints. */
export function computeNodeSize(options: NodeSizingOptions): NodeDimensions {
  const {
    text,
    shapeId,
    sizingMode,
    fontSize = DEFAULT_FONT.fontSize,
    fontFamily = DEFAULT_FONT.fontFamily,
    fontWeight = DEFAULT_FONT.fontWeight,
    lineHeight = DEFAULT_FONT.lineHeight,
    minWidth = 0,
    minHeight = 0,
    uniformSizes,
    glyphSize,
    captionWrapWidth,
    notationId,
    symbolId,
    layoutDirection,
  } = options;
  const captionContext: StencilCaptionContext0210 | undefined =
    notationId !== undefined || symbolId !== undefined || layoutDirection !== undefined
      ? { notationId, symbolId, layoutDirection } : undefined;
  const { shape, sizing, defaultSize } = sizingFor(shapeId, captionContext);
  const captionMinBand = stencilCaptionHeight028(shapeId, captionContext);

  if (sizingMode === 'uniform') {
    const uniformSize = uniformSizes?.get(shapeId);
    if (uniformSize) {
      const squareDiamond = shapeId === 'diamond' && captionMinBand === 0;
      const width = squareDiamond
        ? Math.max(uniformSize.width, uniformSize.height) : uniformSize.width;
      const height = squareDiamond
        ? Math.max(uniformSize.width, uniformSize.height) : uniformSize.height;
      const textBox = shape && captionMinBand > 0 &&
        (glyphSize !== undefined || captionWrapWidth !== undefined)
        ? captionedStencilFrame029(shape, width, height, {
          ...captionContext,
          ...(glyphSize ? { glyphSize } : {}),
          ...(captionWrapWidth !== undefined ? { captionWrapWidth } : {}),
        }).textBox
        : computeTextBox(width, height, sizing, shapeId, captionContext);
      return { width, height, textBox };
    }
  }

  // Independent two-box sizing for outside-captioned stencils (DRQ-10 Option 2):
  // the glyph normalizes to the canonical 100x80 box (or explicit glyphSize) and
  // the caption wraps in its own measured band below without scaling the glyph.
  if (captionMinBand > 0 && shape) {
    const [, , viewWidth = defaultSize.width, viewHeight = defaultSize.height] =
      shape.viewBox.trim().split(/[\s,]+/).map(Number);
    const targetBox = glyphSize ?? CANONICAL_GLYPH_BOX_0210;
    const nativeScale = Math.min(targetBox.width / viewWidth, targetBox.height / viewHeight);
    const glyphW = viewWidth * nativeScale;
    const glyphH = viewHeight * nativeScale;
    // Both default visual styles (12 px hifi Inter and 14 px lowfi Caveat) share
    // the 144 px text column (160 px outer band); larger fonts scale smoothly.
    const defaultWrapWidth = DEFAULT_CAPTION_WRAP_WIDTH_029 * Math.max(1, fontSize / 14);
    const targetWrapWidth = captionWrapWidth ?? defaultWrapWidth;
    let captionMeasured = measureLabel({
      text: text || '',
      fontSize,
      fontFamily,
      fontWeight,
      lineHeight,
      maxWidth: targetWrapWidth > 0 ? targetWrapWidth : Number.POSITIVE_INFINITY,
    });
    // Long unbroken token overflow policy (ISC-3): never clip or drop a token;
    // re-measure once at the expanded token width so sizing and painting agree
    // on exact line breaks and height.
    if (captionMeasured.width > targetWrapWidth + 1e-6) {
      captionMeasured = measureLabel({
        text: text || '',
        fontSize,
        fontFamily,
        fontWeight,
        lineHeight,
        maxWidth: captionMeasured.width,
      });
    }
    const sideCaption = isSideCaptionDirection0211(layoutDirection);
    let width: number;
    let height: number;
    if (sideCaption) {
      width = Math.ceil(Math.max(
        glyphW + CAPTION_SIDE_GAP_0211 + captionMeasured.width + CAPTION_PAD_X_029 * 2,
        sizing.minSize.width,
        minWidth,
      ));
      height = Math.ceil(Math.max(
        glyphH,
        captionMeasured.textHeight + CAPTION_PAD_Y_029 * 2,
        minHeight,
      ));
    } else {
      const captionBandHeight = Math.ceil(Math.max(
        captionMinBand,
        CAPTION_GAP_029 + captionMeasured.textHeight + CAPTION_PAD_Y_029 * 2,
      ));
      width = Math.ceil(Math.max(
        glyphW,
        captionMeasured.width + CAPTION_PAD_X_029 * 2,
        sizing.minSize.width,
        minWidth,
      ));
      const adaptiveHeight = glyphH + captionBandHeight;
      height = Math.ceil(Math.max(
        adaptiveHeight,
        minHeight,
        sizingMode === 'hybrid' ? glyphH + captionMinBand : 0,
      ));
    }
    const effectiveWrapWidth = (captionWrapWidth !== undefined || glyphSize !== undefined)
      ? Math.max(targetWrapWidth, captionMeasured.width)
      : undefined;
    const frame = captionedStencilFrame029(shape, width, height, {
      ...captionContext,
      ...(glyphSize ? { glyphSize } : {}),
      ...(effectiveWrapWidth !== undefined ? { captionWrapWidth: effectiveWrapWidth } : {}),
    });
    return { width, height, textBox: frame.textBox };
  }

  // Scale the initial wrapping column with the requested font. This preserves
  // the shape's visual proportions and prevents a larger font from producing
  // a paradoxically narrower adaptive node solely because it wrapped sooner.
  const initialMaxWidth = (defaultSize.width - sizing.padding.x * 2)
    * (fontSize / DEFAULT_FONT.fontSize);
  const measured = measureLabel({
    text: text || '',
    fontSize,
    fontFamily,
    fontWeight,
    lineHeight,
    maxWidth: initialMaxWidth > 0 ? initialMaxWidth : Number.POSITIVE_INFINITY,
    glyphInk: OPTICAL_LABEL_SHAPES.has(shapeId),
  });
  const contentWidth = sizing.textRegion
    ? (measured.width + sizing.padding.x * 2) / sizing.textRegion.width
    : measured.width * sizing.textBoundsRatio.x + sizing.padding.x * 2;
  const contentHeight = sizing.textRegion
    ? (measured.textHeight + sizing.padding.y * 2) / sizing.textRegion.height
    : measured.textHeight * sizing.textBoundsRatio.y + sizing.padding.y * 2;
  let width = Math.ceil(Math.max(contentWidth, sizing.minSize.width, minWidth));
  const adaptiveHeight = Math.max(contentHeight, sizing.minSize.height, minHeight);
  let height = Math.ceil(sizingMode === 'hybrid'
    ? Math.max(adaptiveHeight, defaultSize.height)
    : adaptiveHeight);

  // The diamond stencil is aspect fitted. A wide, shallow layout box would
  // shrink the visible contour while leaving the measured label box wide,
  // causing text and free connector contacts to crowd its sloped edges.
  // Also enforce the exact inscribed diamond bound (w + h + margin) so square
  // multi-line labels never touch the sloped walls.
  if (shapeId === 'diamond') {
    const inscribed = Math.ceil(measured.width + measured.textHeight + 18);
    width = height = Math.max(width, height, inscribed);
  }
  if (shapeId === 'ellipse') {
    const [, , shapeWidth, shapeHeight] = shapeRegistry.get(shapeId)!.viewBox
      .split(/\s+/).map(Number);
    let scale = Math.max(width / shapeWidth!, height / shapeHeight!);
    const weight = renderWeight(fontWeight);
    const face = resolveFont({ family: fontFamily, size: fontSize,
      weight, lineHeight });
    const metrics = fontMetrics(face.id, face.weight);
    for (let pass = 0; pass < 16; pass += 1) {
      width = Math.ceil(shapeWidth! * scale);
      height = Math.ceil(shapeHeight! * scale);
      const label = layoutNodeLabel({ ...options, dimensions: { width, height } });
      const rx = width / 2;
      const ry = height / 2;
      let score = 0;
      for (const [index, line] of label.lines.entries()) {
        const lineWidth = measureText({ text: line, fontFamily: face.cssFamily,
          fontSize, fontWeight: weight }).width;
        const top = label.baselines[index]! - metrics.ascent * fontSize - ry;
        const bottom = label.baselines[index]! + metrics.descent * fontSize - ry;
        score = Math.max(score,
          (lineWidth / (2 * rx)) ** 2 + (top / ry) ** 2,
          (lineWidth / (2 * rx)) ** 2 + (bottom / ry) ** 2);
      }
      if (score < 0.9) break;
      scale *= Math.max(1.05, Math.sqrt(score / 0.9));
    }
  }

  if (sizing.textRegion) {
    // A text-region stencil keeps its proportions, so its label box grows with
    // the whole frame. Wrapping at the default width and then scaling the frame
    // to that line count overshoots: the final, wider box needs fewer lines and
    // the frame balloons. Find the smallest frame whose own text box holds the
    // label wrapped at that box's width, the exact wrap layoutNodeLabel paints.
    const [, , vw, glyphHeight] = shapeRegistry.get(shapeId)!.viewBox.split(/\s+/).map(Number);
    const vh = glyphHeight! + stencilCaptionHeight028(shapeId);
    const heightFor = (frameWidth: number) => Math.ceil(frameWidth * vh / vw!);
    // Never wrap narrower than the stencil's default column: a label that fit
    // one default line stays on one line.
    const column = Math.min(initialMaxWidth > 0 ? initialMaxWidth : Number.POSITIVE_INFINITY,
      measureLabel({ text: text || '', fontSize, fontFamily, fontWeight, lineHeight,
        maxWidth: Number.POSITIVE_INFINITY, glyphInk: OPTICAL_LABEL_SHAPES.has(shapeId) }).width);
    const fits = (frameWidth: number): boolean => {
      const box = computeTextBox(frameWidth, heightFor(frameWidth), sizing, shapeId);
      if (box.width <= 0 || box.height <= 0 || box.width < column - 1e-6) return false;
      const label = measureLabel({ text: text || '', fontSize, fontFamily, fontWeight, lineHeight,
        maxWidth: box.width, glyphInk: OPTICAL_LABEL_SHAPES.has(shapeId) });
      return label.width <= box.width + 1e-6 && label.textHeight <= box.height + 1e-6;
    };
    const floorHeight = Math.max(sizing.minSize.height, minHeight,
      sizingMode === 'hybrid' ? defaultSize.height : 0);
    let low = Math.ceil(Math.max(sizing.minSize.width, minWidth, floorHeight * vw! / vh));
    let high = Math.max(low, Math.ceil(Math.max(width, height * vw! / vh)));
    for (let guard = 0; !fits(high) && guard < 8; guard++) high = Math.ceil(high * 1.5);
    if (fits(low)) high = low;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (fits(middle)) high = middle; else low = middle;
    }
    width = high;
    height = heightFor(width);
  }
  return { width, height, textBox: computeTextBox(width, height, sizing, shapeId) };
}

export interface UniformSizingOptions {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  lineHeight?: number;
}

/** Determine the largest adaptive size for each shape in a diagram. */
export function computeUniformSizes(
  nodes: Array<{ text: string; shapeId: string }>,
  options: UniformSizingOptions = {},
): Map<string, { width: number; height: number }> {
  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of nodes) {
    const dimensions = computeNodeSize({
      text: node.text,
      shapeId: node.shapeId,
      sizingMode: 'adaptive',
      ...options,
    });
    const current = sizes.get(node.shapeId);
    sizes.set(node.shapeId, {
      width: Math.max(current?.width ?? 0, dimensions.width),
      height: Math.max(current?.height ?? 0, dimensions.height),
    });
  }
  return sizes;
}

export interface AdaptiveSizingOptions<T> extends UniformSizingOptions {
  sizingMode: SizingMode;
  getShapeId: (node: T) => string;
}

/** Apply computed dimensions without mutating the input nodes. */
export function applyAdaptiveSizing<
  T extends { data: { label?: string }; width?: number; height?: number },
>(nodes: T[], options: AdaptiveSizingOptions<T>): T[] {
  const { sizingMode, getShapeId, ...font } = options;
  const uniformSizes = sizingMode === 'uniform'
    ? computeUniformSizes(nodes.map((node) => ({
      text: node.data.label ?? '',
      shapeId: getShapeId(node),
    })), font)
    : undefined;

  return nodes.map((node) => {
    const dimensions = computeNodeSize({
      text: node.data.label ?? '',
      shapeId: getShapeId(node),
      sizingMode,
      ...font,
      ...(uniformSizes ? { uniformSizes } : {}),
    });
    return { ...node, width: dimensions.width, height: dimensions.height };
  });
}

export interface NodeLabelLayoutOptions extends NodeSizingOptions {
  dimensions?: { width: number; height: number };
}

export interface NodeLabelLayout extends NodeDimensions {
  lines: string[];
  lineHeightPx: number;
  baselines: number[];
  textWidth: number;
  textHeight: number;
  inkMetrics?: { ascent: number; descent: number };
  anchor?: 'middle' | 'start';
}

/** Lay out the exact label lines that should be painted inside a node. */
export function layoutNodeLabel(options: NodeLabelLayoutOptions): NodeLabelLayout {
  const captionContext: StencilCaptionContext0210 | undefined =
    options.notationId !== undefined || options.symbolId !== undefined || options.layoutDirection !== undefined
      ? { notationId: options.notationId, symbolId: options.symbolId, layoutDirection: options.layoutDirection } : undefined;
  const { shape, sizing } = sizingFor(options.shapeId, captionContext);
  const isCaptioned = stencilCaptionHeight028(options.shapeId, captionContext) > 0;
  const useOpticalInk = !isCaptioned && OPTICAL_LABEL_SHAPES.has(options.shapeId);
  const fontSize = options.fontSize ?? DEFAULT_FONT.fontSize;
  const lineHeight = options.lineHeight ?? DEFAULT_FONT.lineHeight;
  const computed = options.dimensions
    ? (() => {
      const effectiveWrapWidth = isCaptioned && (options.captionWrapWidth !== undefined || options.glyphSize !== undefined)
        ? (options.captionWrapWidth ?? DEFAULT_CAPTION_WRAP_WIDTH_029 * Math.max(1, fontSize / 14))
        : undefined;
      const textBox = isCaptioned && shape && (options.glyphSize !== undefined || effectiveWrapWidth !== undefined)
        ? captionedStencilFrame029(shape, options.dimensions.width, options.dimensions.height, {
          ...captionContext,
          ...(options.glyphSize ? { glyphSize: options.glyphSize } : {}),
          ...(effectiveWrapWidth !== undefined ? { captionWrapWidth: effectiveWrapWidth } : {}),
        }).textBox
        : computeTextBox(options.dimensions.width, options.dimensions.height, sizing, options.shapeId, captionContext);
      return {
        width: options.dimensions.width,
        height: options.dimensions.height,
        textBox,
      };
    })()
    : computeNodeSize(options);
  const measured = measureLabel({
    text: options.text || '',
    fontSize,
    fontFamily: options.fontFamily ?? DEFAULT_FONT.fontFamily,
    fontWeight: options.fontWeight ?? DEFAULT_FONT.fontWeight,
    lineHeight,
    maxWidth: computed.textBox.width,
    glyphInk: useOpticalInk,
  });
  const isSideCaption = isCaptioned && isSideCaptionDirection0211(options.layoutDirection);
  const firstBaseline = isCaptioned && !isSideCaption
    ? computed.textBox.y + measured.ascentPx
    : computed.textBox.y
      + Math.max(0, (computed.textBox.height - measured.glyphBlockHeight) / 2)
      + measured.ascentPx;
  return {
    ...computed,
    lines: measured.lines,
    lineHeightPx: measured.lineHeightPx,
    baselines: measured.lines.map((_, index) => firstBaseline + index * measured.lineHeightPx),
    textWidth: measured.width,
    textHeight: useOpticalInk ? measured.glyphBlockHeight : measured.textHeight,
    ...(useOpticalInk ? { inkMetrics: measured.inkMetrics } : {}),
    ...(isSideCaption ? { anchor: 'start' as const } : {}),
  };
}
