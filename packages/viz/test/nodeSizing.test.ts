/**
 * Tests for Node Sizing Utilities (CORAL-REQ-011)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  measureText,
  computeNodeSize,
  computeUniformSizes,
  applyAdaptiveSizing,
} from '../src/layout/nodeSizing';
import type { SizingMode } from '../src/types';

describe('measureText', () => {
  describe('basic measurement', () => {
    it('should measure single-line text', () => {
      const result = measureText({
        text: 'Hello World',
        fontSize: 12,
        fontFamily: 'sans-serif',
      });

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.lines).toEqual(['Hello World']);
    });

    it('should measure empty text', () => {
      const result = measureText({
        text: '',
        fontSize: 12,
        fontFamily: 'sans-serif',
      });

      expect(result.width).toBe(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.lines).toEqual(['']);
    });

    it('should scale with font size', () => {
      const small = measureText({
        text: 'Test',
        fontSize: 12,
        fontFamily: 'sans-serif',
      });

      const large = measureText({
        text: 'Test',
        fontSize: 24,
        fontFamily: 'sans-serif',
      });

      expect(large.width).toBeGreaterThan(small.width);
      expect(large.height).toBeGreaterThan(small.height);
    });

    it('should handle long text without maxWidth', () => {
      const result = measureText({
        text: 'This is a very long piece of text that would normally wrap',
        fontSize: 12,
        fontFamily: 'sans-serif',
      });

      expect(result.lines).toHaveLength(1);
      expect(result.width).toBeGreaterThan(100);
    });
  });

  describe('word wrapping', () => {
    it('should wrap text when maxWidth is specified', () => {
      const result = measureText({
        text: 'This is a longer piece of text that should wrap to multiple lines',
        fontSize: 12,
        fontFamily: 'sans-serif',
        maxWidth: 100,
      });

      expect(result.lines.length).toBeGreaterThan(1);
      expect(result.width).toBeLessThanOrEqual(100);
    });

    it('should preserve explicit line breaks', () => {
      const result = measureText({
        text: 'Line 1\nLine 2\nLine 3',
        fontSize: 12,
        fontFamily: 'sans-serif',
      });

      expect(result.lines).toHaveLength(3);
      expect(result.lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should handle line breaks with word wrapping', () => {
      const result = measureText({
        text: 'Short\nThis is a longer line that needs wrapping',
        fontSize: 12,
        fontFamily: 'sans-serif',
        maxWidth: 80,
      });

      expect(result.lines.length).toBeGreaterThan(2);
      expect(result.lines[0]).toBe('Short');
    });
  });

  describe('line height', () => {
    it('should apply line height to height calculation', () => {
      const normal = measureText({
        text: 'Test',
        fontSize: 12,
        fontFamily: 'sans-serif',
        lineHeight: 1.0,
      });

      const spacious = measureText({
        text: 'Test',
        fontSize: 12,
        fontFamily: 'sans-serif',
        lineHeight: 2.0,
      });

      expect(spacious.height).toBeGreaterThan(normal.height);
    });
  });
});

describe('computeNodeSize', () => {
  describe('adaptive mode', () => {
    it('should compute size based on text content', () => {
      const result = computeNodeSize({
        text: 'Short',
        shapeId: 'rectangle',
        sizingMode: 'adaptive',
      });

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.textBox).toBeDefined();
    });

    it('should enforce minimum size', () => {
      const result = computeNodeSize({
        text: 'X',
        shapeId: 'rectangle',
        sizingMode: 'adaptive',
      });

      // Rectangle min size is 60x30
      expect(result.width).toBeGreaterThanOrEqual(60);
      expect(result.height).toBeGreaterThanOrEqual(30);
    });

    it('should respect minWidth and minHeight overrides', () => {
      const result = computeNodeSize({
        text: 'X',
        shapeId: 'rectangle',
        sizingMode: 'adaptive',
        minWidth: 150,
        minHeight: 80,
      });

      expect(result.width).toBeGreaterThanOrEqual(150);
      expect(result.height).toBeGreaterThanOrEqual(80);
    });

    it('should grow for longer text', () => {
      const short = computeNodeSize({
        text: 'Short',
        shapeId: 'rectangle',
        sizingMode: 'adaptive',
      });

      const long = computeNodeSize({
        text: 'This is a much longer piece of text that needs more space',
        shapeId: 'rectangle',
        sizingMode: 'adaptive',
      });

      expect(long.width).toBeGreaterThanOrEqual(short.width);
    });
  });

  describe('shape-specific sizing', () => {
    it('should apply diamond textBoundsRatio', () => {
      // Use longer text to exceed minSize and see textBoundsRatio effect
      const longText = 'This is a longer label for testing';

      const rectangle = computeNodeSize({
        text: longText,
        shapeId: 'rectangle',
        sizingMode: 'adaptive',
      });

      const diamond = computeNodeSize({
        text: longText,
        shapeId: 'diamond',
        sizingMode: 'adaptive',
      });

      // Diamond needs more space (textBoundsRatio 1.45 vs 1.0)
      // Both should exceed their minSize for this text length
      expect(diamond.width).toBeGreaterThan(rectangle.width);
      expect(diamond.height).toBeGreaterThan(rectangle.height);
    });

    it('should apply ellipse textBoundsRatio', () => {
      // Use longer text to exceed minSize
      const longText = 'This is a longer label for testing';

      const rectangle = computeNodeSize({
        text: longText,
        shapeId: 'rectangle',
        sizingMode: 'adaptive',
      });

      const ellipse = computeNodeSize({
        text: longText,
        shapeId: 'ellipse',
        sizingMode: 'adaptive',
      });

      // Ellipse needs more space (textBoundsRatio 1.3 vs 1.0)
      expect(ellipse.width).toBeGreaterThan(rectangle.width);
    });

    it('should handle unknown shapes with defaults', () => {
      const result = computeNodeSize({
        text: 'Test',
        shapeId: 'unknown-shape-id',
        sizingMode: 'adaptive',
      });

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should respect shape minSize for short text', () => {
      const result = computeNodeSize({
        text: 'X',
        shapeId: 'diamond',
        sizingMode: 'adaptive',
      });

      // Diamond min size is 80x80
      expect(result.width).toBeGreaterThanOrEqual(80);
      expect(result.height).toBeGreaterThanOrEqual(80);
    });
  });

  describe('textBox calculation', () => {
    it('should compute valid textBox within node bounds', () => {
      const result = computeNodeSize({
        text: 'Test Node Label',
        shapeId: 'rectangle',
        sizingMode: 'adaptive',
      });

      // TextBox should be inside the node
      expect(result.textBox.x).toBeGreaterThanOrEqual(0);
      expect(result.textBox.y).toBeGreaterThanOrEqual(0);
      expect(result.textBox.x + result.textBox.width).toBeLessThanOrEqual(result.width);
      expect(result.textBox.y + result.textBox.height).toBeLessThanOrEqual(result.height);
    });

    it('should have smaller textBox for shapes with high textBoundsRatio', () => {
      const diamond = computeNodeSize({
        text: 'Test',
        shapeId: 'diamond',
        sizingMode: 'adaptive',
      });

      // Diamond textBox should be significantly smaller than total size
      const textBoxRatio = (diamond.textBox.width * diamond.textBox.height) /
                          (diamond.width * diamond.height);
      expect(textBoxRatio).toBeLessThan(0.6); // Less than 60% of total area
    });
  });

  describe('uniform mode', () => {
    it('should use uniform sizes when provided', () => {
      const uniformSizes = new Map([
        ['rectangle', { width: 200, height: 100 }],
      ]);

      const result = computeNodeSize({
        text: 'Short',
        shapeId: 'rectangle',
        sizingMode: 'uniform',
        uniformSizes,
      });

      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
    });

    it('should compute adaptive size when uniform sizes not yet available', () => {
      const result = computeNodeSize({
        text: 'Test',
        shapeId: 'rectangle',
        sizingMode: 'uniform',
        // No uniformSizes provided - should fall back to adaptive
      });

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });
  });

  describe('hybrid mode', () => {
    it('should use adaptive width with default height', () => {
      const short = computeNodeSize({
        text: 'Hi',
        shapeId: 'rectangle',
        sizingMode: 'hybrid',
      });

      const long = computeNodeSize({
        text: 'This is a much longer label',
        shapeId: 'rectangle',
        sizingMode: 'hybrid',
      });

      // Width should adapt to content
      expect(long.width).toBeGreaterThan(short.width);
      // Height should remain consistent (shape default)
      expect(long.height).toBe(short.height);
    });
  });
});

describe('computeUniformSizes', () => {
  it('should compute max size for each shape type', () => {
    const nodes = [
      { text: 'Short', shapeId: 'rectangle' },
      { text: 'This is a much longer label that needs more space', shapeId: 'rectangle' },
      { text: 'Medium text here', shapeId: 'rectangle' },
      { text: 'Diamond node', shapeId: 'diamond' },
    ];

    const uniformSizes = computeUniformSizes(nodes);

    expect(uniformSizes.has('rectangle')).toBe(true);
    expect(uniformSizes.has('diamond')).toBe(true);

    const rectSize = uniformSizes.get('rectangle')!;
    const diamondSize = uniformSizes.get('diamond')!;

    // Both should have positive dimensions
    expect(rectSize.width).toBeGreaterThan(0);
    expect(rectSize.height).toBeGreaterThan(0);
    expect(diamondSize.width).toBeGreaterThan(0);
    expect(diamondSize.height).toBeGreaterThan(0);

    // Rectangle should be at least as wide as minSize (60)
    expect(rectSize.width).toBeGreaterThanOrEqual(60);
  });

  it('should return empty map for empty input', () => {
    const uniformSizes = computeUniformSizes([]);
    expect(uniformSizes.size).toBe(0);
  });

  it('should handle single node', () => {
    const uniformSizes = computeUniformSizes([
      { text: 'Only Node', shapeId: 'ellipse' },
    ]);

    expect(uniformSizes.has('ellipse')).toBe(true);
  });
});

describe('applyAdaptiveSizing', () => {
  const createNode = (id: string, label: string) => ({
    id,
    type: 'symbol' as const,
    position: { x: 0, y: 0 },
    data: { label, nodeType: 'service' as const, symbolId: 'arch-service' },
    width: undefined as number | undefined,
    height: undefined as number | undefined,
  });

  it('should apply adaptive sizing to nodes', () => {
    const nodes = [
      createNode('1', 'Short'),
      createNode('2', 'This is a much longer label'),
    ];

    const result = applyAdaptiveSizing(nodes, {
      sizingMode: 'adaptive',
      getShapeId: () => 'rectangle',
    });

    expect(result).toHaveLength(2);
    expect(result[0].width).toBeGreaterThan(0);
    expect(result[0].height).toBeGreaterThan(0);
    expect(result[1].width).toBeGreaterThan(result[0].width!);
  });

  it('should apply uniform sizing to nodes', () => {
    const nodes = [
      createNode('1', 'Short'),
      createNode('2', 'Very long label that determines uniform size'),
      createNode('3', 'Medium'),
    ];

    const result = applyAdaptiveSizing(nodes, {
      sizingMode: 'uniform',
      getShapeId: () => 'rectangle',
    });

    // All should have the same size (the max)
    expect(result[0].width).toBe(result[1].width);
    expect(result[0].width).toBe(result[2].width);
    expect(result[0].height).toBe(result[1].height);
  });

  it('should preserve other node properties', () => {
    const nodes = [
      { ...createNode('1', 'Test'), customProp: 'value' },
    ];

    const result = applyAdaptiveSizing(nodes, {
      sizingMode: 'adaptive',
      getShapeId: () => 'rectangle',
    });

    expect((result[0] as any).customProp).toBe('value');
    expect(result[0].id).toBe('1');
    expect(result[0].position).toEqual({ x: 0, y: 0 });
  });

  it('should use shape-specific sizing', () => {
    // Use longer text to exceed minSize and see shape differences
    const longLabel = 'This is a longer label for testing shape sizing';
    const nodes = [
      { ...createNode('1', longLabel), shapeId: 'rectangle' },
      { ...createNode('2', longLabel), shapeId: 'diamond' },
    ];

    const result = applyAdaptiveSizing(nodes, {
      sizingMode: 'adaptive',
      getShapeId: (node: any) => node.shapeId || 'rectangle',
    });

    // Diamond should be larger due to higher textBoundsRatio (1.45 vs 1.0)
    expect(result[1].width).toBeGreaterThan(result[0].width!);
  });
});

describe('sizing modes comparison', () => {
  const testNodes = [
    { text: 'A', shapeId: 'rectangle' },
    { text: 'Short Label', shapeId: 'rectangle' },
    { text: 'This is a much longer label that needs more horizontal space', shapeId: 'rectangle' },
  ];

  it('adaptive mode: each node sized independently', () => {
    const sizes = testNodes.map((n) =>
      computeNodeSize({ ...n, sizingMode: 'adaptive' })
    );

    // All different widths
    expect(sizes[0].width).toBeLessThan(sizes[1].width);
    expect(sizes[1].width).toBeLessThan(sizes[2].width);
  });

  it('uniform mode: all nodes same size', () => {
    const uniformSizes = computeUniformSizes(testNodes);
    const sizes = testNodes.map((n) =>
      computeNodeSize({ ...n, sizingMode: 'uniform', uniformSizes })
    );

    // All same size (the largest)
    expect(sizes[0].width).toBe(sizes[1].width);
    expect(sizes[1].width).toBe(sizes[2].width);
  });

  it('hybrid mode: different widths, same height', () => {
    const sizes = testNodes.map((n) =>
      computeNodeSize({ ...n, sizingMode: 'hybrid' })
    );

    // Different widths
    expect(sizes[0].width).toBeLessThan(sizes[2].width);
    // Same heights (based on shape default)
    expect(sizes[0].height).toBe(sizes[1].height);
    expect(sizes[1].height).toBe(sizes[2].height);
  });
});
