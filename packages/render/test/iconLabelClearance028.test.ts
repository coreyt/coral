import { resolveRenderScene } from '../src/scene.js';
import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028, successorSourceDisplay028, renderSvg } from '../src/index.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSpatialScene028 } from '../src/svg/serialize.js';
import { shapeRegistry } from '../src/shapes/index.js';
import { CANONICAL_GLYPH_BOX_0210 } from '../src/stencilLabelGeometry028.js';
import { stencilFit028 } from '../src/stencilAnchorGeometry028.js';
import { svgPathContour028 } from '../src/svgPathContour028.js';

function project(source: string) {
  const result = projectInstalledSourceToSuccessor028(source);
  expect(result.diagnostics).toEqual([]);
  return result.graph!;
}

const cases = [
  ['architecture', 'user actor as "User"', 'actor', 100],
  ['aiml', 'model model [symbol: "aiml-model"] as "Model"', 'brain', 90],
  ['data-engineering', 'transform transform [symbol: "data-transform"] as "Transform"', 'funnel', 90],
] as const;

describe('generated example icon label clearance', () => {
  for (const style of ['lowfi', 'hifi'] as const) {
    it.each(cases)('reserves a caption below %s / %s ink in '+style, async (profile, declaration, shapeId, glyphHeight) => {
      const typed = project(`@diagram ${profile}\n${declaration}\n`);
      const before = JSON.stringify(typed);
      const graph = successorSourceDisplay028(typed);
      const laid = await layoutGraphForSvg(graph, { svgOptions: { style } });
      const scene = prepareSpatialScene028(laid, { style, edgeRoutes: laid.edgeRoutes });
      const node = scene.nodes[0];
      const fit = stencilFit028(shapeRegistry.get(shapeId)!, node.width, node.height);
      const inkBottom = node.y + scene.viewport.shiftY + fit.offsetY + glyphHeight * fit.scale;
      const labels = scene.parts.filter((part) => part.owner.kind === 'node' && part.geometry.kind === 'text');
      expect(labels.length).toBeGreaterThan(0);
      for (const { bounds } of labels) {
        expect(bounds.y).toBeGreaterThanOrEqual(inkBottom + 2);
        expect(bounds.x).toBeGreaterThanOrEqual(node.x + scene.viewport.shiftX);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(node.x + scene.viewport.shiftX + node.width);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(node.y + scene.viewport.shiftY + node.height);
      }
      expect(JSON.stringify(typed)).toBe(before);
    });

    for (const direction of ['RIGHT', 'DOWN', 'LEFT', 'UP'] as const) {
      it.each(cases)('routes generated %s / %s clear of its caption in '+style+'/'+direction,
        async (profile, declaration, shapeId) => {
          const next = profile === 'architecture' ? 'next service'
            : profile === 'aiml' ? 'next inference [symbol: "aiml-inference"]'
              : 'next sink [symbol: "data-sink"]';
          const id = declaration.split(' ')[0];
          for (const connector of [`${id} -> next`, `next -> ${id}`]) {
            const typed = project(`@diagram ${profile}\n${declaration}\n${next}\ncall = ${connector}\n`);
            const graph = successorSourceDisplay028(typed);
            const laid = await layoutGraphForSvg(graph, { direction, svgOptions: { style } });
            expect(() => renderSvg(laid, { style, layoutDirection: direction,
              edgeRoutes: laid.edgeRoutes })).not.toThrow();
            const scene = prepareSpatialScene028(laid, { style, layoutDirection: direction,
              edgeRoutes: laid.edgeRoutes });
            const node = scene.nodes.find((item) => item.node.id === id)!;
            const edge = resolveRenderScene(laid, { edgeRoutes: laid.edgeRoutes, layoutDirection: direction,
              nodeGeometry: new Map(scene.nodes.map((item) => [item.node.id, item])) }).edges[0];
            const point = connector.startsWith(id) ? edge.points[0] : edge.points.at(-1)!;
            const shape = shapeRegistry.get(shapeId)!;
            const fit = stencilFit028(shape, node.width, node.height, { layoutDirection: direction });
            const local = { x: (point.x - node.x - fit.offsetX) / fit.fittedWidth,
              y: (point.y - node.y - fit.offsetY) / fit.fittedHeight };
            const distance = Math.min(...svgPathContour028(shape).map(({ start, end }) => {
              const dx = end.x - start.x, dy = end.y - start.y;
              const length = dx * dx + dy * dy;
              const t = length ? Math.max(0, Math.min(1,
                ((local.x - start.x) * dx + (local.y - start.y) * dy) / length)) : 0;
              return Math.hypot(local.x - start.x - t * dx, local.y - start.y - t * dy);
            }));
            expect(distance).toBeLessThan(0.001);
          }
        });
    }

    it('places the aiml-inference label cleanly below the uniform 100x80 hexagon in '+style+' (DRQ-10 Option 2)', async () => {
      const typed = project('@diagram aiml\ninference inference [symbol: "aiml-inference"] as "Inference"\n');
      const laid = await layoutGraphForSvg(successorSourceDisplay028(typed), { svgOptions: { style } });
      const scene = prepareSpatialScene028(laid, { style, edgeRoutes: laid.edgeRoutes });
      const node = scene.nodes[0];
      const fit = stencilFit028(shapeRegistry.get('hexagon')!, node.width, node.height, { notationId: 'aiml', symbolId: 'aiml-inference' });
      expect(fit.fittedHeight).toBeCloseTo(CANONICAL_GLYPH_BOX_0210.height, 6);
      const inkBottom = node.y + scene.viewport.shiftY + fit.offsetY + fit.fittedHeight;
      const labels = scene.parts.filter((part) => part.owner.kind === 'node' && part.geometry.kind === 'text');
      expect(labels.length).toBeGreaterThan(0);
      for (const { bounds } of labels) {
        expect(bounds.y).toBeGreaterThanOrEqual(inkBottom + 2);
      }
    });

    it('keeps flowchart decision text inside the painted diamond in '+style+' (DRQ-10 Option 2)', async () => {
      const typed = project('@diagram flowchart\ncheck decision as "Ready?"\n');
      const laid = await layoutGraphForSvg(successorSourceDisplay028(typed), { svgOptions: { style } });
      const scene = prepareSpatialScene028(laid, { style, edgeRoutes: laid.edgeRoutes });
      const node = scene.nodes[0];
      const fit = stencilFit028(shapeRegistry.get('diamond')!, node.width, node.height, { notationId: 'flowchart', symbolId: 'flowchart-decision' });
      const top = node.y + scene.viewport.shiftY + fit.offsetY;
      const bottom = top + fit.fittedHeight;
      for (const { bounds } of scene.parts.filter((part) => part.owner.kind === 'node' && part.geometry.kind === 'text')) {
        expect(bounds.y).toBeGreaterThanOrEqual(top);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(bottom);
      }
    });

    it.each(cases)('refuses a hard frame that cannot contain the %s / %s caption in '+style, (profile, declaration) => {
      const graph = successorSourceDisplay028(project(`@diagram ${profile}\n${declaration}\n`));
      graph.nodes[0].dimensions = { width: 40, height: 40 };
      expect(() => renderSvg(graph, { style })).toThrow(/hard-size-text-conflict/);
    });

    it('refuses an explicit connector through an actor caption in '+style, () => {
      const graph = successorSourceDisplay028(project('@diagram architecture\nuser actor as "User"\napi service\ncall = user -> api\n'));
      graph.nodes[0].position = { x: 0, y: 0 };
      graph.nodes[0].dimensions = { width: 100, height: 200 };
      graph.nodes[1].position = { x: 0, y: 350 };
      graph.nodes[1].dimensions = { width: 100, height: 100 };
      expect(() => renderSvg(graph, { style, edgeRoutes: new Map([['call', [{
        startPoint: { x: 50, y: 100 }, endPoint: { x: 50, y: 350 }, bendPoints: [{ x: 50, y: 120 }],
      }]]]) })).toThrow(/caption|scene-layout/);
    });

    it.each(cases)('keeps %s / %s glyph normalized to canonical 100x80 and routes clear of 67-char captions in '+style,
      async (profile, declaration, shapeId, glyphHeight) => {
        const longLabel = 'SmolLM2-135M base checkpoint fine-tuned on the Coral source corpus';
        const longDeclaration = declaration.replace(/"[^"]+"$/, `"${longLabel}"`);
        const next = profile === 'architecture' ? 'next service'
          : profile === 'aiml' ? 'next inference [symbol: "aiml-inference"]'
            : 'next sink [symbol: "data-sink"]';
        const id = declaration.split(' ')[0];
        const shape = shapeRegistry.get(shapeId)!;
        const [, , viewWidth] = shape.viewBox.split(/\s+/).map(Number);
        const expectedScale = Math.min(CANONICAL_GLYPH_BOX_0210.width / viewWidth!, CANONICAL_GLYPH_BOX_0210.height / glyphHeight);

        for (const direction of ['RIGHT', 'DOWN'] as const) {
          const typed = project(`@diagram ${profile}\n${longDeclaration}\n${next}\ncall = ${id} -> next\n`);
          const graph = successorSourceDisplay028(typed);
          const laid = await layoutGraphForSvg(graph, { direction, svgOptions: { style } });
          const scene = prepareSpatialScene028(laid, { style, layoutDirection: direction, edgeRoutes: laid.edgeRoutes });
          const node = scene.nodes.find((item) => item.node.id === id)!;
          const fit = stencilFit028(shape, node.width, node.height, { notationId: profile, layoutDirection: direction });
          expect(fit.scale).toBeCloseTo(expectedScale, 8);
          expect(fit.fittedWidth).toBeCloseTo(viewWidth! * expectedScale, 8);
          expect(fit.fittedHeight).toBeCloseTo(glyphHeight * expectedScale, 8);
          const inkRight = node.x + scene.viewport.shiftX + fit.offsetX + fit.fittedWidth;
          const inkBottom = node.y + scene.viewport.shiftY + fit.offsetY + fit.fittedHeight;
          const labels = scene.parts.filter((part) => part.owner.kind === 'node' && part.owner.id === id && part.geometry.kind === 'text');
          expect(labels.length).toBeGreaterThan(1);
          for (const { bounds } of labels) {
            if (direction === 'DOWN') {
              expect(bounds.x).toBeGreaterThanOrEqual(inkRight + 2);
            } else {
              expect(bounds.y).toBeGreaterThanOrEqual(inkBottom + 2);
            }
            expect(bounds.x).toBeGreaterThanOrEqual(node.x + scene.viewport.shiftX);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(node.x + scene.viewport.shiftX + node.width);
            expect(bounds.y + bounds.height).toBeLessThanOrEqual(node.y + scene.viewport.shiftY + node.height);
          }
        }
      });
  }
});
