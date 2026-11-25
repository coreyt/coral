import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { documentCatalog029, prepareSpatialScene028, projectInstalledSourceToSuccessor028, renderSvg,
  successorSourceDisplayWithSemanticPorts028 } from '@coral-viz/render';
import { layoutGraphForSvg } from '../../render/src/svg/layout.js';
import { SpatialScenePart028 } from '../src/components/SpatialSceneSvg028.js';
import { EditProvider } from '../src/components/EditContext.js';
import { SymbolNode } from '../src/components/SymbolNode.js';

// C4 agreement (R-065 AC-6; c4-design.md "Testing"): for each outline, the
// canvas puts boundary and interior port handles where the SVG routes attach,
// draws the same routes with their escape segments, and names ports by label.

const SOURCE = (kind: string) => ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {', '  name "Probe"',
  '  size 60 x 40', '  label center', `  outline ${kind}`, '  anchor top [side: N, at: 0.3]',
  '  anchor core [x: 0.5, y: 0.5, exit: E]', '  pin port [direction: out, anchor: top, label: "Pinned"]',
  '  deep port [direction: out, anchor: core, label: "Deep"]', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""', '}', 'a service [symbol: "local.probe"] as "A"', 'b service', 'c service', 'a:pin -> b', 'a:deep -> c', ''].join('\n');

describe.each(['rectangle', 'rounded', 'ellipse', 'diamond'])('canvas and SVG agree on a %s user symbol', (kind) => {
  it('places handles at the SVG attachments, draws the same routes and names ports by label', async () => {
    const graph = projectInstalledSourceToSuccessor028(SOURCE(kind)).graph!;
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
    const laidOut = await layoutGraphForSvg(display, { direction: 'RIGHT', semanticInterpretations });
    const options = { edgeRoutes: laidOut.edgeRoutes, layoutDirection: 'RIGHT' as const,
      semanticGraph: display, successorSource: graph };
    const scene = prepareSpatialScene028(laidOut, options);
    const svg = renderSvg(laidOut, options);
    const node = scene.nodes.find((item) => item.node.id === 'a')!;
    const origin = { x: node.x + scene.viewport.shiftX, y: node.y + scene.viewport.shiftY, width: node.width, height: node.height };
    const { container } = render(<ReactFlowProvider><EditProvider onLabelEdit={vi.fn()}>
      <SymbolNode id="a" selected={false} data={{ label: 'A', nodeType: 'service', symbolId: 'local.probe',
        notationId: 'architecture', documentCatalog029: documentCatalog029('architecture', graph.userSymbols029!),
        sceneParts028: scene.parts.filter((part) => part.owner.kind === 'node' && part.owner.id === 'a'),
        sceneOrigin028: origin, scenePortContacts028: scene.portContacts.a } as never} />
    </EditProvider></ReactFlowProvider>);
    for (const [port, label, target] of [['pin', 'Pinned', 'b'], ['deep', 'Deep', 'c']] as const) {
      const handle = container.querySelector<HTMLElement>(`[data-handleid="${port}"]`)!;
      expect(handle.getAttribute('aria-label')).toBe(`${label}: idle`);
      const edge = scene.resolved.edges.find((item) => item.targetId === target)!;
      // The attachment: one point inside an escape segment, else the route start.
      const attachment = edge.escape029?.source ? edge.points[1]! : edge.points[0]!;
      expect(parseFloat(handle.style.left)).toBeCloseTo(attachment.x + scene.viewport.shiftX - origin.x, 6);
      expect(parseFloat(handle.style.top)).toBeCloseTo(attachment.y + scene.viewport.shiftY - origin.y, 6);
      expect(edge.escape029?.source === true).toBe(port === 'deep');
      // The canvas draws the edge from the same scene part; its path equals the serializer's.
      const shaft = scene.parts.find((part) => part.id === `${edge.id}:shaft`)!;
      const { container: drawn } = render(<svg><SpatialScenePart028 part={shaft} namespace="n" /></svg>);
      const d = drawn.querySelector('path')!.getAttribute('d')!;
      expect(svg).toContain(`data-coral-part-id="${edge.id}:shaft" d="${d}"`);
    }
    // The artwork <use> sits at the frame in both.
    const use = container.querySelector('[data-coral-artwork] use')!;
    expect([use.getAttribute('x'), use.getAttribute('y'), use.getAttribute('width'), use.getAttribute('height')].map(Number))
      .toEqual([origin.x, origin.y, 60, 40]);
    expect(svg).toMatch(new RegExp(`<use href="#[^"]+-coral-sym-probe" x="${origin.x}" y="${origin.y}" width="60" height="40"`));
  });
});
