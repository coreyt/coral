import { describe, expect, it, vi } from 'vitest';
import type { LayoutRequest, SpatialLayoutRequest } from '@coral-viz/render/layout';

// R-039 AC-8 retry parity: the canvas supplies its worker's candidate, so a
// generated-route retry must re-run the worker with the retry's options.
const { runEditorLayout, requests } = vi.hoisted(() => ({ runEditorLayout: vi.fn(), requests: [] as SpatialLayoutRequest[] }));
vi.mock('../src/layoutWorkerClient', () => ({ runEditorLayout }));
vi.mock('@coral-viz/render/layout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@coral-viz/render/layout')>();
  return { ...actual, resolveSpatialLayout: (request: SpatialLayoutRequest) => {
    requests.push(request);
    return actual.resolveSpatialLayout(request);
  } };
});
import { layoutNodes } from '../src/hooks/diagramUtils';

describe('editor generated-route retries', () => {
  it('re-runs the layout worker for a retry with the same nodes and edges', async () => {
    runEditorLayout.mockResolvedValue({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 }, width: 150, height: 50 },
        { id: 'b', position: { x: 300, y: 0 }, absolutePosition: { x: 300, y: 0 }, width: 150, height: 50 },
      ], edges: [], width: 450, height: 50, effectiveOptions: {}, diagnostics: [],
    });
    await layoutNodes([{ id: 'a', type: 'process' }, { id: 'b', type: 'process' }],
      [{ id: 'e', source: 'a', target: 'b' }], 'flowchart', undefined, false);
    const [request] = requests;
    expect(request!.candidateLayout).toBeDefined();
    const retry = { defaults: { algorithm: 'layered', direction: 'RIGHT' as const }, options: { spacing: { nodeNode: 75 } } };
    await request!.relayoutCandidate!(retry);
    const [first, second] = runEditorLayout.mock.calls.map(([sent]) => sent as LayoutRequest);
    expect(second).toEqual({ ...first, ...retry });
  });
});
