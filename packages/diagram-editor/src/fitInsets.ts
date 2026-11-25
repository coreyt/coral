type Rect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;
type Side = 'top' | 'right' | 'bottom' | 'left';

/** Fit may need less than 10% for a long diagram in a short split pane. */
export const MIN_CANVAS_ZOOM = 0.01;

/**
 * Pixel padding for an explicit Fit that keeps every node clear of the
 * overlays covering the canvas (R-044 AC-7). Each intersecting overlay is
 * reserved from the canvas edge it is nearest to; an overlay too large to
 * reserve (more than half the canvas on that axis) is ignored.
 */
export function controlSafeFitPadding(canvas: Rect, overlays: readonly Rect[], margin = 16): Record<Side, `${number}px`> {
  const inset: Record<Side, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  const width = canvas.right - canvas.left;
  const height = canvas.bottom - canvas.top;
  for (const overlay of overlays) {
    if (overlay.right <= canvas.left || overlay.left >= canvas.right
      || overlay.bottom <= canvas.top || overlay.top >= canvas.bottom) continue;
    const candidates: Array<[Side, number, number]> = [
      ['top', overlay.bottom - canvas.top, height],
      ['right', canvas.right - overlay.left, width],
      ['bottom', canvas.bottom - overlay.top, height],
      ['left', overlay.right - canvas.left, width],
    ];
    const [side, value, extent] = candidates.reduce((best, next) => (next[1] < best[1] ? next : best));
    if (value > extent / 2) continue;
    inset[side] = Math.max(inset[side], value);
  }
  return {
    top: `${Math.round(inset.top + margin)}px`,
    right: `${Math.round(inset.right + margin)}px`,
    bottom: `${Math.round(inset.bottom + margin)}px`,
    left: `${Math.round(inset.left + margin)}px`,
  };
}
