import { describe, expect, it } from 'vitest';
import { controlSafeFitPadding } from '../src/fitInsets';

// S93-WI-06 / R-044 AC-7: explicit Fit reserves the overlays that cover the
// canvas, measured from their current rectangles.
const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, right: left + width, bottom: top + height, width, height });

describe('controlSafeFitPadding', () => {
  const canvas = rect(437, 51, 843, 415);

  it('reserves a right-side panel and a bottom toolbar, plus the margin', () => {
    expect(controlSafeFitPadding(canvas, [
      rect(960, 51, 320, 415),
      rect(620, 405, 331, 44),
    ], 16)).toEqual({ top: '16px', right: '336px', bottom: '77px', left: '16px' });
  });

  it('ignores overlays that do not intersect the canvas', () => {
    expect(controlSafeFitPadding(canvas, [rect(0, 500, 100, 100)], 16))
      .toEqual({ top: '16px', right: '16px', bottom: '16px', left: '16px' });
  });

  it('keeps the largest inset per side and never exceeds the canvas', () => {
    const padding = controlSafeFitPadding(canvas, [rect(1200, 400, 80, 66), rect(960, 51, 320, 415)], 16);
    expect(padding.right).toBe('336px');
    expect(controlSafeFitPadding(canvas, [rect(437, 51, 843, 415)], 16)).toEqual(
      { top: '16px', right: '16px', bottom: '16px', left: '16px' },
    );
  });
});
