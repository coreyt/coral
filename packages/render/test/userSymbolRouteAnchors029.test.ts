import { describe, expect, it } from 'vitest';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { verifyPortableSuccessorSource028 } from '../src/successorPortableExport028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSpatialScene028 } from '../src/svg/serialize.js';
import { userBoundaryAnchorPoint029, userOutlineExitPoint029 } from '../src/userSymbolGeometry029.js';

const source = (port: string) => ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {',
  '  name "Probe"', '  size 60 x 40', '  outline ellipse', '  anchor top [side: N, at: 0.3]',
  '  anchor core [x: 0.5, y: 0.5, exit: E]', '  pin port [direction: out, anchor: top]',
  '  deep port [direction: out, anchor: core]', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""', '}', 'g service [symbol: "local.probe"]', 'b service', `req = g:${port} -> b`, 'route edge req {',
  `  bend = waypoint relative to port g:${port} offset (20, -30)`, '}', ''].join('\n');
const outline = { symbolId: 'local.probe', outline: 'ellipse' as const, width: 60, height: 40 };

describe.each([
  ['pin', userBoundaryAnchorPoint029(outline, 'N', 0.3)],
  ['deep', userOutlineExitPoint029(outline, 'E', { x: 0.5, y: 0.5 })],
])('route anchor relative to user-symbol port %s', (port, attachment) => {
  it('is accepted by source validation and resolves from the attachment point', async () => {
    const text = source(port);
    expect(verifyPortableSuccessorSource028(text).diagnostics).toEqual([]);
    const graph = projectInstalledSourceToSuccessor028(text).graph!;
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
    const laidOut = await layoutGraphForSvg(display, { direction: 'RIGHT', semanticInterpretations });
    const prepared = prepareSpatialScene028(laidOut, { edgeRoutes: laidOut.edgeRoutes, layoutDirection: 'RIGHT',
      semanticGraph: display, successorSource: graph });
    const node = prepared.resolved.nodes.find((item) => item.id === 'g')!;
    const expected = { x: node.x + attachment.x * 60 + 20, y: node.y + attachment.y * 40 - 30 };
    const edge = prepared.resolved.edges.find((item) => item.id === 'req')!;
    expect(edge.points.some((point) => Math.abs(point.x - expected.x) < 1e-6 &&
      Math.abs(point.y - expected.y) < 1e-6)).toBe(true);
  });
});
