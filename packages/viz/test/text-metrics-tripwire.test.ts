import { describe, it, expect } from 'vitest';
import { measureText, computeNodeSize } from '../src/layout/nodeSizing';
import {
  computeNodeSize as renderComputeNodeSize,
  measureText as renderMeasureText,
  layoutNodeLabel,
} from '@coral-viz/render';

/**
 * Text-metrics tripwire.
 *
 * Node geometry is derived from text measurement, and layout is derived from node
 * geometry, so any change to how text is measured silently moves every diagram. The
 * rest of the suite asserts relationally (`toBeGreaterThan`), which cannot detect that.
 * These assertions are deliberately exact.
 *
 * If a change to text measurement makes these fail, that is the tripwire working. Update
 * the numbers in the same reviewed commit that changes measurement, and nowhere else —
 * never as an incidental fix while working on something adjacent.
 *
 * These values come from the exact bundled Inter metrics. The same DOM-free
 * implementation runs in browsers, jsdom, Node renderers, and MCP tools.
 */
describe('text metrics tripwire', () => {
  const FONT = { fontSize: 12, fontFamily: 'system-ui, -apple-system, sans-serif' };

  describe('measureText produces exact dimensions', () => {
    const cases: Array<[string, { width: number; height: number; lines: string[] }]> = [
      ['', { width: 0, height: 17, lines: [''] }],
      ['A', { width: 9, height: 17, lines: ['A'] }],
      ['Web App', { width: 56, height: 17, lines: ['Web App'] }],
      ['API Gateway', { width: 76, height: 17, lines: ['API Gateway'] }],
      ['Orders Database', { width: 102, height: 17, lines: ['Orders Database'] }],
      ['iiiii', { width: 15, height: 17, lines: ['iiiii'] }],
      ['WWWWW', { width: 60, height: 17, lines: ['WWWWW'] }],
    ];

    it.each(cases)('measures %j exactly', (text, expected) => {
      expect(measureText({ text, ...FONT })).toEqual(expected);
    });

    it('measures a wrapped label exactly', () => {
      expect(
        measureText({ text: 'Payment Processing Service', ...FONT, maxWidth: 100 })
      ).toEqual({
        width: 68,
        height: 51,
        lines: ['Payment', 'Processing', 'Service'],
      });
    });

    it('measures an explicit newline exactly', () => {
      expect(measureText({ text: 'Line1\nLine2', ...FONT })).toEqual({
        width: 33,
        height: 34,
        lines: ['Line1', 'Line2'],
      });
    });
  });

  describe('computeNodeSize produces exact dimensions', () => {
    it('sizes a rectangle adaptively', () => {
      expect(
        computeNodeSize({ text: 'API Gateway', shapeId: 'rectangle', sizingMode: 'adaptive' })
      ).toMatchObject({ width: 83, height: 58 });
    });

    it('sizes a cylinder adaptively with room below its cap', () => {
      // The approved body region changes sizing; Inter measurements stay fixed.
      // 0.2.10: the smallest frame whose own label box holds the label (was 133×107).
      expect(
        computeNodeSize({ text: 'Orders Database', shapeId: 'cylinder', sizingMode: 'adaptive' })
      ).toMatchObject({ width: 122, height: 98 });
      expect(layoutNodeLabel({ text: 'Orders Database', shapeId: 'cylinder', sizingMode: 'adaptive' }).lines)
        .toHaveLength(1);
    });

    it('applies the shape minimum width for an empty label', () => {
      expect(
        computeNodeSize({ text: '', shapeId: 'rectangle', sizingMode: 'adaptive' })
      ).toMatchObject({ width: 60, height: 41 });
    });
  });

  it('keeps the viz compatibility exports identical to the DOM-free render functions', () => {
    const measureOptions = {
      text: 'Payment Processing Service',
      fontSize: 16,
      fontFamily: 'monospace',
      fontWeight: 700,
      lineHeight: 1.8,
      maxWidth: 100,
    };
    const sizeOptions = {
      text: 'Payment Processing Service',
      shapeId: 'diamond',
      sizingMode: 'hybrid' as const,
      fontSize: 16,
      fontFamily: 'monospace',
      fontWeight: 700,
      lineHeight: 1.8,
    };

    expect(measureText(measureOptions)).toEqual(renderMeasureText(measureOptions));
    expect(computeNodeSize(sizeOptions)).toEqual(renderComputeNodeSize(sizeOptions));
  });
});
