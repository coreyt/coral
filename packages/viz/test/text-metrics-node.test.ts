// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  PORTABLE_FONTS,
  computeNodeSize as renderComputeNodeSize,
  measureText as renderMeasureText,
} from '@coral-viz/render';
import {
  computeNodeSize,
  measureText,
} from '../src/layout/nodeSizing';

describe('DOM-free text metrics compatibility', () => {
  it('keeps every portable profile and weight identical to render in Node', () => {
    expect(typeof document).toBe('undefined');

    for (const font of PORTABLE_FONTS) {
      for (const fontWeight of [400, 700] as const) {
        const measureOptions = {
          text: 'Payment Processing Service',
          fontSize: 16,
          fontFamily: font.cssFamily,
          fontWeight,
          lineHeight: 1.8,
          maxWidth: 100,
        };
        const sizeOptions = {
          text: 'Payment Processing Service',
          shapeId: 'diamond',
          sizingMode: 'hybrid' as const,
          fontSize: 16,
          fontFamily: font.cssFamily,
          fontWeight,
          lineHeight: 1.8,
        };

        expect(measureText(measureOptions)).toEqual(renderMeasureText(measureOptions));
        expect(computeNodeSize(sizeOptions)).toEqual(renderComputeNodeSize(sizeOptions));
      }
    }
  });
});
