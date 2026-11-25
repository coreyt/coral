import { benchmarkEnvironment } from '../../../scripts/performance-policy.mjs';
import { performance } from 'node:perf_hooks';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { prepareSpatialScene028 } from '@coral-viz/render';
import { convertGraphToFlow } from '../src/editor/converter.js';
import { useWaypointManager } from '../src/waypoints/useWaypointManager.js';
import { completeSpatialSource029 } from '../../render/test/helpers/spatialQuality029.js';
import type { GraphIR } from '../src/types.js';

function source() {
  return '@diagram block\nroot block\nsink block\n' + Array.from({ length: 12 }, (_, index) =>
    `n${index} block as "Validate customer transaction ${index}"\nstart${index} = root -> n${index}\nfinish${index} = n${index} -> sink\n`).join('');
}

describe.skipIf(!benchmarkEnvironment().measure)('complete waypoint edit performance', () => {
  it('measures waypoint state through a validated current scene while keeping unrelated routes stable', { timeout: 10_000 }, async () => {
    const initial = await completeSpatialSource029(source(), 'hifi', 'RIGHT');
    const flow = convertGraphToFlow(initial.laid as GraphIR);
    const maxX = Math.max(...initial.scene.nodes.map((node) => node.x + node.width));
    const maxY = Math.max(...initial.scene.nodes.map((node) => node.y + node.height));
    const { result } = renderHook(() => useWaypointManager({ ...flow,
      routingOptions: { direction: 'RIGHT', notation: 'block' },
      initialWaypoints: new Map([['start0', [{ id: 'edit', x: maxX + 60, y: maxY + 60, type: 'corner' }]]]),
    }));
    const unrelated = initial.laid.edgeRoutes.get('start1');
    const samples: number[] = [];
    const update = (index: number) => {
      const start = performance.now();
      act(() => result.current.moveWaypoint('start0', 'edit', { x: maxX + 60 + index, y: maxY + 60 + index }));
      const overrides = result.current.getRoutedPaths();
      expect([...overrides.keys()]).toEqual(['start0']);
      const routes = new Map(initial.laid.edgeRoutes);
      for (const [id, route] of overrides) routes.set(id, [route]);
      const scene = prepareSpatialScene028(initial.laid, { style: 'hifi', layoutDirection: 'RIGHT',
        edgeRoutes: routes, semanticGraph: initial.display, successorSource: initial.source });
      expect(scene.status).toBe('complete');
      expect(routes.get('start1')).toBe(unrelated);
      return performance.now() - start;
    };
    const firstMs = update(0);
    for (let index = 1; index <= 20; index++) samples.push(update(index));
    const p95Ms = [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1]!;
    // Match the existing browser repeat-render ceiling. This boundary covers
    // edit/state, routing, final checks, and scene prep; browser paint has its
    // separate production interaction gate.
    expect(firstMs).toBeLessThanOrEqual(200);
    expect(p95Ms).toBeLessThanOrEqual(200);
    console.info('WAYPOINT_EDIT_TO_VALID_SCENE', JSON.stringify({ nodes: flow.nodes.length, edges: flow.edges.length, firstMs, p95Ms }));
  });
});
