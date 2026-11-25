import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028, successorSourceDisplayWithSemanticPorts028,
  renderSvg, prepareSpatialScene028 } from '../src/index.js';
import { resolveRenderScene } from '../src/scene.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';

const source = readFileSync(new URL('../../diagram-editor/src/example-sources/sketch.coral', import.meta.url), 'utf8');
const cross = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const intersects = (a: { x: number; y: number }, b: { x: number; y: number },
  c: { x: number; y: number }, d: { x: number; y: number }) =>
  cross(a, b, c) * cross(a, b, d) < -1e-6 && cross(c, d, a) * cross(c, d, b) < -1e-6;

describe('CR-98 generated sketch feedback', () => {
  for (const style of ['lowfi', 'hifi'] as const) for (const direction of ['RIGHT', 'LEFT'] as const) {
    it('keeps the exact example forward and return paths separate in '+style+'/'+direction, async () => {
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const before = JSON.stringify(projected.graph);
      const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
      const laid = { ...await layoutGraphForSvg(display, { direction, semanticInterpretations, svgOptions: { style } }), id: display.id };
      const prepared = prepareSpatialScene028(laid, { style, layoutDirection: direction,
        edgeRoutes: laid.edgeRoutes, successorSource: projected.graph });
      const scene = resolveRenderScene(laid, { edgeRoutes: laid.edgeRoutes, layoutDirection: direction,
        nodeGeometry: new Map(prepared.nodes.map((node) => [node.node.id, node])) });
      const forward = scene.edges.find(({ id }) => id === 'ideaDecision')!.points;
      const back = scene.edges.find(({ id }) => id === 'decisionIdea')!.points;
      for (let i = 1; i < forward.length; i++) for (let j = 1; j < back.length; j++)
        expect(intersects(forward[i - 1], forward[i], back[j - 1], back[j])).toBe(false);
      expect(laid.edgeRoutes.get('decisionIdea')![0].bendPoints).toHaveLength(2);
      expect(Math.hypot(forward[0].x - back.at(-1)!.x, forward[0].y - back.at(-1)!.y)).toBeGreaterThan(12);
      const idea = laid.nodes.find(({ id }) => id === 'idea')!;
      const decision = laid.nodes.find(({ id }) => id === 'decision')!;
      expect(direction === 'RIGHT' ? idea.position!.x < decision.position!.x : idea.position!.x > decision.position!.x).toBe(true);
      expect(renderSvg(laid, { style, edgeRoutes: laid.edgeRoutes, layoutDirection: direction,
        successorSource: projected.graph })).toContain('data-coral-edge="decisionIdea"');
      expect(JSON.stringify(projected.graph)).toBe(before);
    });
  }
});
