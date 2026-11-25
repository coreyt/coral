import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { prepareSpatialScene028, projectInstalledSourceToSuccessor028, renderSvg,
  successorSourceDisplayWithSemanticPorts028 } from '@coral-viz/render';
import { layoutGraphForSvg } from '../../render/src/svg/layout.js';
import { SpatialScenePart028 } from '../src/components/SpatialSceneSvg028.js';

// C4 revision 6 (c4-design.md "Reservation in layout", rule 11): the canvas
// draws a reserved definition-side label from the same scene part as the SVG,
// at the same place, without an authored placement.

const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {', '  name "Probe"', '  size 60 x 40',
  '  label above', '  outline ellipse', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""', '}', 'p service', 'a service [symbol: "local.probe"] as "Auth gateway"', 'q service', 'p -> a', 'a -> q',
  'p -> q', ''].join('\n');

describe('canvas and SVG agree on a reserved label', () => {
  it('draws the label part above the frame in both', async () => {
    const graph = projectInstalledSourceToSuccessor028(SOURCE).graph!;
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
    const laidOut = await layoutGraphForSvg(display, { direction: 'RIGHT', semanticInterpretations });
    const options = { edgeRoutes: laidOut.edgeRoutes, layoutDirection: 'RIGHT' as const, semanticGraph: display,
      successorSource: graph };
    const scene = prepareSpatialScene028(laidOut, options);
    const svg = renderSvg(laidOut, options);
    const node = scene.nodes.find((item) => item.node.id === 'a')!;
    const label = scene.parts.find((part) => part.id === 'a:label:1')!;
    expect(label.bounds.y + label.bounds.height).toBeLessThanOrEqual(node.y + scene.viewport.shiftY + 1e-6);
    expect(label.geometry).not.toHaveProperty('labelPlacement');
    const { container } = render(<svg><SpatialScenePart028 part={label} namespace="n" /></svg>);
    const text = container.querySelector('text')!;
    const x = text.getAttribute('x'); const y = text.getAttribute('y');
    expect(svg).toMatch(new RegExp(`data-coral-part-id="a:label:1"[^>]*x="${x}"[^>]*y="${y}"`));
  });
});
