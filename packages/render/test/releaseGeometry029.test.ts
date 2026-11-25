import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { completeSpatialSource029 } from './helpers/spatialQuality029.js';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const cases = [
  { id: 'required row with a connection skipping the middle node',
    source: '@diagram architecture\norigin service\nlatest service\nsink service\n' +
      'origin -> sink\nlane = arrange row: origin, latest, sink\n' },
  { id: 'BPMN branch gateway',
    source: read('../../browser/test/fixtures/acceptance028/bpmn-branch.coral') },
  { id: 'AI/ML model caption', source: read('../../diagram-editor/src/example-sources/aiml.coral') },
  { id: 'catalog port used only by an authored waypoint',
    source: '@diagram architecture\napi service @ (20, 20) pinned\nstore database @ (500, 20) pinned\n' +
      'request = api -> store\nroute edge request {\n' +
      '  bend = waypoint relative to port api:out offset (20, 20)\n}\n' },
];

describe('release browser geometry reproductions in the shared renderer', () => {
  it.each(['lowfi', 'hifi'] as const)('still refuses a checkpoint whose outgoing segment enters its source (%s)', async (style) => {
    const invalid = cases.at(-1)!.source.replace('offset (20, 20)', 'offset (20, 0)');
    await expect(completeSpatialSource029(invalid, style, 'DOWN')).rejects.toThrow(/passes through node "api"/);
  });
  it.each([
    ['column', false], ['row', true], ['column', true],
  ] as const)('keeps a spanning connection drawable in a %s arrangement (reverse=%s)', async (axis, reverse) => {
    const text = '@diagram architecture\norigin service\nlatest service\nsink service\norigin -> sink\n' +
      `lane = arrange ${axis}: node origin, node latest, node sink${reverse ? ' [direction: reverse]' : ''}\n`;
    const { scene } = await completeSpatialSource029(text, 'lowfi', 'DOWN');
    const primary = axis === 'row' ? 'x' : 'y';
    const size = axis === 'row' ? 'width' : 'height';
    const order = reverse ? ['sink', 'latest', 'origin'] : ['origin', 'latest', 'sink'];
    const nodes = order.map((id) => scene.resolved.nodes.find((node) => node.id === id)!);
    expect(nodes[0][primary] + nodes[0][size]).toBeLessThanOrEqual(nodes[1][primary]);
    expect(nodes[1][primary] + nodes[1][size]).toBeLessThanOrEqual(nodes[2][primary]);
    expect(scene.resolved.edges).toHaveLength(1);
  });

  for (const fixture of cases) it.each(['lowfi', 'hifi'] as const)(
    `${fixture.id} completes in %s`, async (style) => {
      const { source, scene } = await completeSpatialSource029(fixture.source, style, 'DOWN');
      expect(scene.status).toBe('complete');
      expect(scene.resolved.edges).toHaveLength(source.edges.length);
      for (const node of source.nodes) if (node.pinned && node.position) {
        const placed = scene.resolved.nodes.find((candidate) => candidate.id === node.id)!;
        expect({ x: placed.x, y: placed.y }).toEqual(node.position);
      }
      if (fixture.id.startsWith('required row')) {
        const [first, middle, last] = ['origin', 'latest', 'sink'].map((id) =>
          scene.resolved.nodes.find((node) => node.id === id)!);
        expect(first.x + first.width).toBeLessThanOrEqual(middle.x);
        expect(middle.x + middle.width).toBeLessThanOrEqual(last.x);
        expect(middle.y + middle.height / 2).toBeCloseTo(first.y + first.height / 2);
        expect(last.y + last.height / 2).toBeCloseTo(first.y + first.height / 2);
      }
    });
});
