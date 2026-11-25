import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayoutRequest } from '@coral-viz/render/layout';
import { notationCatalogIdentity028, resolveSuccessorGraphNodes028 } from '@coral-viz/render';

const { runEditorLayout } = vi.hoisted(() => ({ runEditorLayout: vi.fn() }));
vi.mock('../src/layoutWorkerClient', () => ({ runEditorLayout }));

import { layoutNodes } from '../src/hooks/diagramUtils';

describe('reference editor layout request hierarchy', () => {
  beforeEach(() => runEditorLayout.mockReset());

  it('nests flattened editor children in the shared request', async () => {
    runEditorLayout.mockImplementation(async (request: LayoutRequest) => ({
      nodes: [
        { id: 'group', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 }, width: 240, height: 200 },
        { id: 'child', parentId: 'group', position: { x: 30, y: 80 }, absolutePosition: { x: 30, y: 80 }, width: 150, height: 50 },
      ],
      edges: [], width: 240, height: 200, effectiveOptions: {}, diagnostics: [],
    }));
    await layoutNodes([
      { id: 'group', type: 'group', label: 'Group' },
      { id: 'child', type: 'process', label: 'Child', parent: 'group' },
    ], [], 'flowchart', undefined, false);

    const request = runEditorLayout.mock.calls[0][0] as LayoutRequest;
    expect(request.nodes).toHaveLength(1);
    expect(request.nodes[0]).toMatchObject({
      id: 'group', children: [expect.objectContaining({ id: 'child' })],
    });
  });

  it('does not attach a source-owned plain connector to a named semantic port by default', async () => {
    runEditorLayout.mockResolvedValue({
      nodes: [
        { id: 'api', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 }, width: 150, height: 60 },
        { id: 'db', position: { x: 250, y: 0 }, absolutePosition: { x: 250, y: 0 }, width: 150, height: 60 },
      ], edges: [], width: 400, height: 60, effectiveOptions: {}, diagnostics: [],
    });
    const semanticInterpretations = resolveSuccessorGraphNodes028({ version: '4.0.0',
      profile: { id: 'architecture', version: '1.0.0' }, catalog: notationCatalogIdentity028('architecture')!,
      nodes: [{ id: 'api', type: 'service' }, { id: 'db', type: 'database' }],
    });
    await layoutNodes([
      { id: 'api', type: 'service' }, { id: 'db', type: 'database' },
    ], [{ id: 'plain-edge', source: 'api', target: 'db' }], 'architecture', undefined, false,
    undefined, undefined, [], 'reflow', semanticInterpretations);
    const request = runEditorLayout.mock.calls[0][0] as LayoutRequest;
    expect(request.nodes[0]?.ports).toEqual([]);
    expect(request.edges[0]?.sourcePort).toBeUndefined();
    expect(request.edges[0]?.targetPort).toBeUndefined();
  });

  it('retains the final route recomputed by shared resolution when candidate rectangles differ', async () => {
    runEditorLayout.mockResolvedValue({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 }, width: 190, height: 50 },
        { id: 'b', position: { x: 400, y: 0 }, absolutePosition: { x: 400, y: 0 }, width: 150, height: 50 },
      ],
      edges: [{ id: 'e', sections: [{ startPoint: { x: 10, y: 10 }, bendPoints: [], endPoint: { x: 400, y: 10 } }] }],
      width: 550, height: 50, effectiveOptions: {}, diagnostics: [],
    });
    const result = await layoutNodes([
      { id: 'a', type: 'process', label: 'A' },
      { id: 'b', type: 'process', label: 'B' },
    ], [{ id: 'e', source: 'a', target: 'b' }], 'flowchart', undefined, false);
    expect(result.edgeRouting.has('e')).toBe(true);
  });
});
