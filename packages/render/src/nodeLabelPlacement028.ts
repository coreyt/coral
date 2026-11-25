import type { NodeLabelPlacement } from '@graph-ir/core';
import { authoredEdgeLabelBox028 } from './edgeLabelPlacement028.js';

/** Page-relative sides refer to the resolved node frame, in layout pixels.
 * The centered orthogonal axis is independent of layout direction. */
export function authoredNodeLabelBox028(frame: { x: number; y: number; width: number; height: number },
  placement: NodeLabelPlacement, width: number, height: number) {
  if (![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) || frame.width < 0 || frame.height < 0)
    throw new Error('layout.capability.unsupported: invalid node label placement frame');
  const anchor = {
    x: placement.side === 'left' ? frame.x : placement.side === 'right' ? frame.x + frame.width : frame.x + frame.width / 2,
    y: placement.side === 'above' ? frame.y : placement.side === 'below' ? frame.y + frame.height : frame.y + frame.height / 2,
  };
  try { return authoredEdgeLabelBox028([anchor], { side: placement.side, offset: placement.offset }, width, height); }
  catch { throw new Error('layout.capability.unsupported: invalid authored node label placement'); }
}
