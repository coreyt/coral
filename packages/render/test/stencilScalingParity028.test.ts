import { describe, expect, it } from 'vitest';
import { validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import { successorCatalogSnapshot028 } from '../src/successorInterpretation028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSpatialScene028, renderSvg } from '../src/svg/serialize.js';
import { semanticLayoutPorts028 } from '../src/semanticLayoutPorts028.js';
import { symbolRegistry } from '../src/symbols/index.js';
import { resolveSpatialLayout } from '../src/layout/spatial.js';

const source = '@diagram flowchart\ncheck decision as "Q" @ (80, 120) pinned {\n' +
  '  departure port [direction: out, anchor: NE]\n}\n' +
  'done process @ (700, 120) pinned {\n  arrival port [direction: in, anchor: W]\n}\n' +
  'flow = check:departure -> done:arrival\n';

describe('resized stencil and exact semantic-port scaling', () => {
  it.each([[320, 120, 190, 30], [120, 320, 90, 130]])(
    'keeps a %s×%s diamond pin at the analytic meet-fit point', async (width, height, pinX, pinY) => {
      const meaning = projectInstalledSourceToSuccessor028(source).graph!;
      meaning.nodes[0].dimensions = { width, height };
      meaning.nodes[1].dimensions = { width: 120, height: 80 };
      expect(validateGraphIRSuccessorWithCatalog(meaning, successorCatalogSnapshot028(meaning)).errors).toEqual([]);
      const before = JSON.stringify(meaning);
      const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(meaning);
      const loaded = await layoutGraphForSvg(display, { semanticInterpretations });
      const reflow = await resolveSpatialLayout({ revision: 'resized-stencil', operation: 'reflow',
        graph: { ...display, nodes: loaded.nodes.map((node) => {
          const interpreted = semanticInterpretations.get(node.id)!;
          return { ...node, ports: semanticLayoutPorts028(interpreted,
            symbolRegistry.get(interpreted.effectiveSymbolId!), interpreted.effectiveVariantId, 'DOWN').ports };
        }) }, defaults: { algorithm: 'layered', direction: 'DOWN' } });
      const reflowed = { ...loaded, nodes: loaded.nodes.map((node) => {
        const rect = reflow.nodes.find((item) => item.id === node.id)!;
        return { ...node, position: rect.absolutePosition, dimensions: { width: rect.width, height: rect.height } };
      }), edgeRoutes: new Map(reflow.edges.map((edge) => [edge.id, edge.sections])) };
      for (const drawing of [loaded, reflowed]) for (const style of ['lowfi', 'hifi'] as const) {
        const options = { style, successorSource: meaning, semanticGraph: display, edgeRoutes: drawing.edgeRoutes };
        const scene = prepareSpatialScene028(drawing, options);
        const expected = { x: 80 + pinX + scene.viewport.shiftX, y: 120 + pinY + scene.viewport.shiftY };
        expect(scene.portContacts.check.departure.x).toBeCloseTo(expected.x, 8);
        expect(scene.portContacts.check.departure.y).toBeCloseTo(expected.y, 8);
        const body = scene.parts.find((part) => part.id === 'check:outline')!;
        if (body.geometry.kind !== 'stencil-path') throw new Error('missing diamond outline');
        expect(body.geometry.transform.scale).toBeCloseTo(1.2, 8);
        expect(body.geometry.transform.x).toBeCloseTo(80 + (width - 120) / 2 + scene.viewport.shiftX, 8);
        expect(body.geometry.transform.y).toBeCloseTo(120 + (height - 120) / 2 + scene.viewport.shiftY, 8);
        const shaft = scene.parts.find((part) => part.id === 'flow:shaft')!;
        if (shaft.geometry.kind !== 'route') throw new Error('missing connector');
        expect(shaft.geometry.points[0].x).toBeCloseTo(expected.x, 8);
        expect(shaft.geometry.points[0].y).toBeCloseTo(expected.y, 8);
        expect(renderSvg(drawing, options)).toContain('scale(1.2)');
        // The former stretch-to-box policy is a 50px error on these fixtures.
        expect(Math.hypot(pinX - width * .75, pinY - height * .25)).toBe(50);
      }
      expect(JSON.stringify(meaning)).toBe(before);
    });
});
