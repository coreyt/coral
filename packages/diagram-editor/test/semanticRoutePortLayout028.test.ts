import { describe, expect, it } from 'vitest';
import { successorSourceDisplayWithSemanticPorts028, verifyPortableSuccessorSource028 } from '@coral-viz/render';
import { layoutNodes } from '../src/hooks/diagramUtils.js';

describe('editor route-only catalog port retention', () => {
  it.each(['RIGHT', 'DOWN'] as const)('resolves the catalog anchor on %s load and Reflow', async (direction) => {
    const source = '@diagram architecture\napi service\nstore database\nrequest = api -> store\nroute edge request {\n' +
      '  bend = waypoint relative to port api:out offset (20, 0)\n}\n';
    const meaning = verifyPortableSuccessorSource028(source).graph!;
    expect(meaning).toBeDefined();
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(meaning);
    const before = JSON.stringify({ meaning, display });
    expect(display.edges[0].sourcePort).toBeUndefined();
    for (const operation of ['load', 'reflow'] as const) {
      const result = await layoutNodes(display.nodes, display.edges, 'architecture',
        { algorithm: 'layered', direction }, false, undefined, undefined, [], operation, semanticInterpretations);
      const api = result.nodes.find((node) => node.id === 'api')!;
      // The service's 100 x 60 stencil is fitted without stretching.
      const scale = Math.min(api.width! / 100, api.height! / 60);
      expect(result.edgeRouting.get('request')!.bendPoints).toEqual([{
        x: api.position.x + api.width! / 2 + (direction === 'RIGHT' ? 50 * scale : 0) + 20,
        y: api.position.y + api.height! / 2 + (direction === 'DOWN' ? 30 * scale : 0),
      }]);
      expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    }
    expect(JSON.stringify({ meaning, display })).toBe(before);
  });
});
