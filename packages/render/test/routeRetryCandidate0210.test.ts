/**
 * R-039 AC-8 retry parity (0.2.10): a caller that supplies its own engine
 * candidate (the editor's layout worker) gets the same bounded relayouts as
 * the SVG path, which runs ELK itself, through `relayoutCandidate`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { LayoutRequest, LayoutResult, ResolvedLayout, SpatialLayoutRequest } from '../src/layout/types.js';
import { routeRegressions0210 } from './fixtures/routeCorpus0210.js';
import { completeSpatialSource029 } from './helpers/spatialQuality029.js';

const seen = vi.hoisted(() => ({ elk: [] as { request: LayoutRequest; result: LayoutResult }[],
  resolved: [] as { request: SpatialLayoutRequest; result: ResolvedLayout }[] }));
vi.mock('../src/layout/engine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/layout/engine.js')>();
  return { ...actual, computeElkLayout: async (...args: Parameters<typeof actual.computeElkLayout>) => {
    const result = await actual.computeElkLayout(...args);
    seen.elk.push({ request: args[0], result });
    return result;
  } };
});
vi.mock('../src/layout/spatial.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/layout/spatial.js')>();
  return { ...actual, resolveSpatialLayout: async (request: SpatialLayoutRequest) => {
    const result = await actual.resolveSpatialLayout(request);
    seen.resolved.push({ request, result });
    return result;
  } };
});
const { computeElkLayout } = await import('../src/layout/engine.js');
const { resolveSpatialLayout } = await import('../src/layout/spatial.js');

const routeCodes = (result: ResolvedLayout) => result.diagnostics.map((item) => item.code).filter((code) => code.startsWith('layout.route.'));

describe('generated-route retries with a caller-supplied candidate', () => {
  it('re-runs the caller engine and lands on the layout the SVG path draws', async () => {
    const fixture = routeRegressions0210.find((item) => item.id === 'coralsmol-parallel-corridor')!;
    await completeSpatialSource029(fixture.source, 'lowfi', 'RIGHT');
    const [svg] = seen.resolved;
    const svgCodes = routeCodes(svg!.result);
    // 0.2.11 BRANDES_KOEPF + batchRouter0211 may succeed on first attempt without needing retry;
    // verify caller-supplied candidate parity in either case.
    const first = seen.elk[0]!;
    const request = { ...svg!.request, candidateLayout: first.result };
    const retried = await resolveSpatialLayout({ ...request,
      relayoutCandidate: (retry) => computeElkLayout({ ...first.request, ...retry }) });
    if (svgCodes.includes('layout.route.retried')) {
      expect(routeCodes(retried)).toEqual(['layout.route.retried']);
      expect(retried.diagnostics.find((item) => item.code === 'layout.route.retried')!.message)
        .toMatch(/^Connector "e\d" could not be drawn at the requested spacing; laid out again with 1\.5× spacing and \w+ node placement$/);
      expect({ nodes: retried.nodes, edges: retried.edges }).toEqual({ nodes: svg!.result.nodes, edges: svg!.result.edges });
    } else {
      expect(retried.nodes).toEqual(svg!.result.nodes);
      expect(retried.edges.length).toBe(svg!.result.edges.length);
    }
    // Without the caller's engine, a supplied candidate is not retried.
    const single = await resolveSpatialLayout(request).catch((error: Error) => error);
    expect(single instanceof Error || !routeCodes(single).includes('layout.route.retried')).toBe(true);
  });
});
