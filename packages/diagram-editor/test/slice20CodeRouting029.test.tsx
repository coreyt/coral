import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import source from '../src/example-sources/code.coral?raw';
import { useEditorController } from '../src/useEditorController';

if (!window.matchMedia) window.matchMedia = ((query: string) => ({
  matches: false, media: query, onchange: null, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
})) as typeof window.matchMedia;

type Point = { x: number; y: number };
function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const on = (p: Point, q: Point, r: Point) => Math.abs(cross(p, q, r)) < 0.001 &&
    r.x >= Math.min(p.x, q.x) - 0.001 && r.x <= Math.max(p.x, q.x) + 0.001 &&
    r.y >= Math.min(p.y, q.y) - 0.001 && r.y <= Math.max(p.y, q.y) + 0.001;
  return (cross(a, b, c) * cross(a, b, d) < -0.001 &&
    cross(c, d, a) * cross(c, d, b) < -0.001) ||
    on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}

it('keeps the Slice 20 Code tree forward-facing without reversals or crossings', async () => {
  window.localStorage.clear();
  const hook = renderHook(() => useEditorController());
  try {
    act(() => hook.result.current.header.onOpenFile({ name: 'code-containment.coral', text: source }));
    await waitFor(() => expect(hook.result.current.canvas.nodes).toHaveLength(4));
    await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
    for (const style of ['lowfi', 'hifi'] as const) {
      act(() => hook.result.current.canvas.onRenderStyle028Change(style));
      for (const reflow of [false, true]) {
        if (reflow) {
          act(() => hook.result.current.canvas.onReflow());
          await waitFor(() => expect(hook.result.current.canvas.isReflowing).toBe(false));
        }
        const canvas = hook.result.current.canvas;
        expect(canvas.sceneError028).toBeUndefined();
        expect(hook.result.current.editor.dsl).toBe(source);
        const scene = canvas.scene028!.resolved;
        expect(scene.edges).toHaveLength(3);
        const byId = new Map(canvas.nodes.map((node) => [node.id, node]));
        for (const edge of scene.edges) {
          const source = byId.get(edge.sourceId)!;
          const target = byId.get(edge.targetId)!;
          // This tree has no obstacles or authored routes that justify backtracking.
          const horizontal = Math.sign(target.position.x + target.width! / 2 -
            source.position.x - source.width! / 2);
          for (let i = 1; i < edge.points.length; i++) {
            expect(edge.points[i].y, `${edge.id}: forward rank`)
              .toBeGreaterThanOrEqual(edge.points[i - 1].y - 0.01);
            expect(horizontal * (edge.points[i].x - edge.points[i - 1].x),
              `${edge.id}: horizontal reversal`).toBeGreaterThanOrEqual(-0.01);
          }
          if (horizontal === 0) {
            for (const point of edge.points) {
              expect(point.x).toBeCloseTo(source.position.x + source.width! / 2, 1);
            }
          }
        }
        const renderer = byId.get('renderer')!;
        const center = renderer.position.x + renderer.width! / 2;
        expect(scene.edges.find((edge) => edge.id === 'classRender')!.points[0].x).toBeLessThan(center);
        expect(scene.edges.find((edge) => edge.id === 'classVersion')!.points[0].x).toBeGreaterThan(center);
        for (let i = 0; i < scene.edges.length; i++) {
          for (const other of scene.edges.slice(i + 1)) {
            const edge = scene.edges[i];
            for (let a = 1; a < edge.points.length; a++) {
              for (let b = 1; b < other.points.length; b++) {
                expect(intersects(edge.points[a - 1], edge.points[a],
                  other.points[b - 1], other.points[b]), `${edge.id}/${other.id}: crossing`).toBe(false);
              }
            }
          }
        }
      }
    }
  } finally { hook.unmount(); }
}, 20000);
