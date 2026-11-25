import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplay028 } from '../src/successorSourceDisplay028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSpatialScene028 } from '../src/svg/serialize.js';
import { stencilFit028 } from '../src/stencilAnchorGeometry028.js';
import { shapeRegistry } from '../src/shapes/index.js';

describe('adaptive plain rectangle painted text clearance', () => {
  it.each(['lowfi', 'hifi'] as const)('contains a tall process label inside the %s painted contour', async (style) => {
    const source = '@diagram flowchart\narchive process as "Archive approved request"\n';
    const typed = projectInstalledSourceToSuccessor028(source).graph!;
    const display = successorSourceDisplay028(typed);
    const laid = await layoutGraphForSvg(display, { svgOptions: { style } });
    const scene = prepareSpatialScene028(laid, { style, edgeRoutes: laid.edgeRoutes });
    const node = scene.nodes[0];
    const fit = stencilFit028(shapeRegistry.get('rectangle')!, node.width, node.height);
    const body = { x: node.x + scene.viewport.shiftX + fit.offsetX,
      y: node.y + scene.viewport.shiftY + fit.offsetY, width: fit.fittedWidth, height: fit.fittedHeight };
    const labels = scene.parts.filter((part) => part.owner.kind === 'node' &&
      part.owner.id === 'archive' && part.geometry.kind === 'text');
    expect(labels.length).toBeGreaterThan(0);
    for (const { bounds } of labels) {
      expect(bounds.x).toBeGreaterThanOrEqual(body.x);
      expect(bounds.y).toBeGreaterThanOrEqual(body.y);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(body.x + body.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(body.y + body.height);
    }
  });
});
