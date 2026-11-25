import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveSpatialLayout } = vi.hoisted(() => ({ resolveSpatialLayout: vi.fn() }));

vi.mock('@coral-viz/render/layout', () => ({ resolveSpatialLayout }));

import { computeLayout, handleLayout, readGraph } from '../src/tools/layout.js';

describe('MCP shared-layout compatibility adapter', () => {
  beforeEach(() => resolveSpatialLayout.mockReset());

  it('migrates GraphIR 2 through the published named 2-to-3 boundary', () => {
    const graph = readGraph(JSON.stringify({
      version: '2.0.0',
      id: 'legacy',
      metadata: { notation: 'uml-class' },
      nodes: [],
      edges: [],
    }));

    expect(graph).toMatchObject({
      version: '3.0.0',
      profile: { id: 'uml', kind: 'class', version: '1.0.0' },
    });
  });

  it('rejects a GraphIR 2 value relabeled as GraphIR 3', () => {
    expect(() => readGraph(JSON.stringify({
      version: '3.0.0',
      id: 'relabeled',
      nodes: [{ id: 'a', type: 'service' }, { id: 'b', type: 'service' }],
      edges: [{ id: 'e', source: 'a', target: 'b', style: { targetArrow: 'arrow' } }],
    }))).toThrow(/SCHEMA_VIOLATION/);
  });

  it('preserves MCP defaults and projects absolute nodes and every edge section', async () => {
    resolveSpatialLayout.mockResolvedValue({
      nodes: [
        {
          id: 'group', position: { x: 10, y: 20 }, absolutePosition: { x: 10, y: 20 },
          width: 300, height: 200,
        },
        {
          id: 'child', parentId: 'group', position: { x: 5, y: 7 },
          absolutePosition: { x: 15, y: 27 }, width: 80, height: 40,
        },
      ],
      edges: [{
        id: 'edge',
        sections: [
          { startPoint: { x: 1, y: 2 }, bendPoints: [{ x: 3, y: 4 }], endPoint: { x: 5, y: 6 } },
          { startPoint: { x: 7, y: 8 }, bendPoints: [], endPoint: { x: 9, y: 10 } },
        ],
      }],
      width: 640,
      height: 480,
      effectiveOptions: {},
      diagnostics: [],
    });

    const graph = {
      version: '3.0.0',
      id: 'graph',
      nodes: [{
        id: 'group', type: 'group', dimensions: { width: 300, height: 200 },
        ports: [{ id: 'in', side: 'WEST' as const, position: 0.25 }],
        layoutOptions: { padding: { top: 10, right: 20 } },
        children: [{ id: 'child', type: 'service', ports: [] }],
      }],
      edges: [{ id: 'edge', source: 'child', target: 'group', targetPort: 'in' }],
    };

    await expect(computeLayout(graph, {
      algorithm: 'layered', direction: 'RIGHT', nodeSpacing: 50, layerSpacing: 50,
    })).resolves.toEqual({
      nodes: [
        { id: 'group', x: 10, y: 20, width: 300, height: 200 },
        { id: 'child', parentId: 'group', x: 15, y: 27, width: 80, height: 40 },
      ],
      edges: [{
        id: 'edge',
        sections: [
          { startPoint: { x: 1, y: 2 }, bendPoints: [{ x: 3, y: 4 }], endPoint: { x: 5, y: 6 } },
          { startPoint: { x: 7, y: 8 }, bendPoints: [], endPoint: { x: 9, y: 10 } },
        ],
      }],
      width: 640,
      height: 480,
    });

    expect(resolveSpatialLayout).toHaveBeenCalledWith({
      revision: 'mcp:graph',
      graph,
      operation: 'load',
      defaults: {
        algorithm: 'layered',
        direction: 'RIGHT',
        spacing: { nodeNode: 50, layerSpacing: 50 },
        hierarchyHandling: 'INCLUDE_CHILDREN',
      },
    });
  });

  it('retains Zod rejection for unsupported MCP options', async () => {
    await expect(handleLayout({
      content: 'service "A"',
      options: { algorithm: 'stress' },
    })).rejects.toThrow();
    expect(resolveSpatialLayout).not.toHaveBeenCalled();
  });
});
