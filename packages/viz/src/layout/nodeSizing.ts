/**
 * Node Sizing Utilities (CORAL-REQ-011)
 *
 * Provides text measurement and adaptive node sizing based on:
 * - Text content dimensions
 * - Shape geometry constraints (textBoundsRatio)
 * - Minimum size requirements
 * - Padding specifications
 */

import type {
  TextMeasureOptions,
  TextDimensions,
  NodeSizingOptions,
  NodeDimensions,
  SizingMode,
  ShapeSizing,
} from '../types';
import { shapeRegistry } from '../shapes';

/**
 * Default sizing for shapes without explicit sizing metadata
 */
const DEFAULT_SIZING: ShapeSizing = {
  textBoundsRatio: { x: 1.0, y: 1.0 },
  minSize: { width: 60, height: 30 },
  padding: { x: 16, y: 12 },
};

/**
 * Default font settings
 */
const DEFAULT_FONT = {
  fontSize: 12,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontWeight: 500,
  lineHeight: 1.4,
};

/**
 * Canvas context for text measurement (cached for performance)
 */
let measureContext: CanvasRenderingContext2D | null = null;

/**
 * Get or create a canvas context for text measurement
 */
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureContext) {
    return measureContext;
  }

  // Check if we're in a browser environment
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  measureContext = canvas.getContext('2d');
  return measureContext;
}

/**
 * Measure text dimensions using canvas
 *
 * Uses the Canvas API's measureText() for accurate text width measurement,
 * with word wrapping support when maxWidth is specified.
 */
export function measureText(options: TextMeasureOptions): TextDimensions {
  const {
    text,
    fontSize = DEFAULT_FONT.fontSize,
    fontFamily = DEFAULT_FONT.fontFamily,
    fontWeight = DEFAULT_FONT.fontWeight,
    maxWidth,
    lineHeight = DEFAULT_FONT.lineHeight,
  } = options;

  const ctx = getMeasureContext();

  // Fallback for non-browser environments (SSR, tests)
  if (!ctx) {
    return measureTextFallback(options);
  }

  // Set font for measurement
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

  // If no max width, measure as single line
  if (!maxWidth) {
    const metrics = ctx.measureText(text);
    return {
      width: Math.ceil(metrics.width),
      height: Math.ceil(fontSize * lineHeight),
      lines: [text],
    };
  }

  // Word wrap to fit maxWidth
  const lines = wrapText(ctx, text, maxWidth);
  const lineHeightPx = fontSize * lineHeight;

  // Find the widest line
  let maxLineWidth = 0;
  for (const line of lines) {
    const metrics = ctx.measureText(line);
    maxLineWidth = Math.max(maxLineWidth, metrics.width);
  }

  return {
    width: Math.ceil(maxLineWidth),
    height: Math.ceil(lines.length * lineHeightPx),
    lines,
  };
}

/**
 * Wrap text to fit within maxWidth
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  // Handle empty text
  if (!text || text.trim() === '') {
    return [''];
  }

  // Split by explicit line breaks first
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);

    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine + ' ' + word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width <= maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    lines.push(currentLine);
  }

  return lines;
}

/**
 * Fallback text measurement for non-browser environments
 * Uses character-based approximation
 */
function measureTextFallback(options: TextMeasureOptions): TextDimensions {
  const {
    text,
    fontSize = DEFAULT_FONT.fontSize,
    lineHeight = DEFAULT_FONT.lineHeight,
    maxWidth,
  } = options;

  // Approximate character width (varies by font, but 0.6 is reasonable for sans-serif)
  const avgCharWidth = fontSize * 0.6;
  const lineHeightPx = fontSize * lineHeight;

  // Always split by newlines first
  const paragraphs = text.split('\n');

  if (!maxWidth) {
    // No wrapping, just return paragraphs as lines
    const maxLineWidth = Math.max(
      0,
      ...paragraphs.map((p) => p.length * avgCharWidth)
    );
    return {
      width: Math.ceil(maxLineWidth),
      height: Math.ceil(paragraphs.length * lineHeightPx),
      lines: paragraphs,
    };
  }

  // Approximate word wrapping
  const charsPerLine = Math.floor(maxWidth / avgCharWidth);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('');
    } else if (paragraph.length <= charsPerLine) {
      lines.push(paragraph);
    } else {
      // Simple word-aware wrapping
      const words = paragraph.split(/\s+/);
      let currentLine = '';

      for (const word of words) {
        if ((currentLine + ' ' + word).length <= charsPerLine) {
          currentLine = currentLine ? currentLine + ' ' + word : word;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) lines.push(currentLine);
    }
  }

  const maxLineWidth = Math.max(0, ...lines.map((l) => l.length * avgCharWidth));

  return {
    width: Math.ceil(maxLineWidth),
    height: Math.ceil(lines.length * lineHeightPx),
    lines,
  };
}

/**
 * Compute optimal node size based on text content and shape geometry
 *
 * The sizing algorithm:
 * 1. Measure text dimensions
 * 2. Apply shape's textBoundsRatio to account for geometry (e.g., diamond needs more space)
 * 3. Add padding for visual breathing room
 * 4. Enforce minimum size constraints
 * 5. Optionally apply uniform sizing across nodes of the same shape
 */
export function computeNodeSize(options: NodeSizingOptions): NodeDimensions {
  const {
    text,
    shapeId,
    sizingMode,
    fontSize = DEFAULT_FONT.fontSize,
    fontFamily = DEFAULT_FONT.fontFamily,
    fontWeight = DEFAULT_FONT.fontWeight,
    minWidth,
    minHeight,
    uniformSizes,
  } = options;

  // Get shape definition and sizing metadata
  const shape = shapeRegistry.get(shapeId);
  const sizing = shape?.sizing || DEFAULT_SIZING;
  const defaultSize = shape?.defaultSize || { width: 100, height: 60 };

  // For uniform mode, use cached sizes if available
  if (sizingMode === 'uniform' && uniformSizes?.has(shapeId)) {
    const uniformSize = uniformSizes.get(shapeId)!;
    return {
      width: uniformSize.width,
      height: uniformSize.height,
      textBox: computeTextBox(uniformSize.width, uniformSize.height, sizing),
    };
  }

  // Measure text with initial max width estimate
  const initialMaxWidth = defaultSize.width - sizing.padding.x * 2;
  const textDims = measureText({
    text: text || '',
    fontSize,
    fontFamily,
    fontWeight,
    maxWidth: initialMaxWidth > 0 ? initialMaxWidth : undefined,
  });

  // Apply textBoundsRatio to account for shape geometry
  // For a diamond, text occupies ~70% of the bounding box, so ratio is 1.45
  const contentWidth = textDims.width * sizing.textBoundsRatio.x + sizing.padding.x * 2;
  const contentHeight = textDims.height * sizing.textBoundsRatio.y + sizing.padding.y * 2;

  // Determine final size based on sizing mode
  let width: number;
  let height: number;

  switch (sizingMode) {
    case 'adaptive':
      // Size adapts to content
      width = Math.max(contentWidth, sizing.minSize.width, minWidth || 0);
      height = Math.max(contentHeight, sizing.minSize.height, minHeight || 0);
      break;

    case 'uniform':
      // All nodes of this shape use the same size (largest needed)
      // This will be populated on a second pass
      width = Math.max(contentWidth, sizing.minSize.width, minWidth || 0);
      height = Math.max(contentHeight, sizing.minSize.height, minHeight || 0);
      break;

    case 'hybrid':
    default:
      // Blend: adaptive width, uniform height per shape type
      width = Math.max(contentWidth, sizing.minSize.width, minWidth || 0);
      height = Math.max(sizing.minSize.height, defaultSize.height, minHeight || 0);
      break;
  }

  // Round to reasonable values
  width = Math.ceil(width);
  height = Math.ceil(height);

  return {
    width,
    height,
    textBox: computeTextBox(width, height, sizing),
  };
}

/**
 * Compute the text bounding box within a node
 * This is where text can be safely rendered without clipping
 */
function computeTextBox(
  width: number,
  height: number,
  sizing: ShapeSizing
): { x: number; y: number; width: number; height: number } {
  // Text box is centered within the shape, reduced by the textBoundsRatio
  const textWidth = (width - sizing.padding.x * 2) / sizing.textBoundsRatio.x;
  const textHeight = (height - sizing.padding.y * 2) / sizing.textBoundsRatio.y;

  return {
    x: (width - textWidth) / 2,
    y: (height - textHeight) / 2,
    width: textWidth,
    height: textHeight,
  };
}

/**
 * Compute uniform sizes for all shapes in a diagram
 *
 * For uniform sizing mode, we need to find the maximum required size
 * for each shape type, then apply that to all nodes of that type.
 */
export function computeUniformSizes(
  nodes: Array<{ text: string; shapeId: string }>,
  options?: {
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string | number;
  }
): Map<string, { width: number; height: number }> {
  const uniformSizes = new Map<string, { width: number; height: number }>();

  // First pass: compute adaptive sizes for all nodes
  const sizesByShape = new Map<string, Array<{ width: number; height: number }>>();

  for (const node of nodes) {
    const dims = computeNodeSize({
      text: node.text,
      shapeId: node.shapeId,
      sizingMode: 'adaptive',
      ...options,
    });

    if (!sizesByShape.has(node.shapeId)) {
      sizesByShape.set(node.shapeId, []);
    }
    sizesByShape.get(node.shapeId)!.push({ width: dims.width, height: dims.height });
  }

  // Second pass: find max size for each shape
  for (const [shapeId, sizes] of sizesByShape) {
    const maxWidth = Math.max(...sizes.map((s) => s.width));
    const maxHeight = Math.max(...sizes.map((s) => s.height));
    uniformSizes.set(shapeId, { width: maxWidth, height: maxHeight });
  }

  return uniformSizes;
}

/**
 * Apply adaptive sizing to a set of nodes
 *
 * This is the main entry point for layout integration.
 * Returns nodes with updated width/height properties.
 */
export function applyAdaptiveSizing<T extends { data: { label?: string }; width?: number; height?: number }>(
  nodes: T[],
  options: {
    sizingMode: SizingMode;
    getShapeId: (node: T) => string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string | number;
  }
): T[] {
  const { sizingMode, getShapeId, fontSize, fontFamily, fontWeight } = options;

  // For uniform mode, pre-compute sizes
  let uniformSizes: Map<string, { width: number; height: number }> | undefined;
  if (sizingMode === 'uniform') {
    uniformSizes = computeUniformSizes(
      nodes.map((n) => ({ text: n.data.label || '', shapeId: getShapeId(n) })),
      { fontSize, fontFamily, fontWeight }
    );
  }

  return nodes.map((node) => {
    const dims = computeNodeSize({
      text: node.data.label || '',
      shapeId: getShapeId(node),
      sizingMode,
      fontSize,
      fontFamily,
      fontWeight,
      uniformSizes,
    });

    return {
      ...node,
      width: dims.width,
      height: dims.height,
    };
  });
}
