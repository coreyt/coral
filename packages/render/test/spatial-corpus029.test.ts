import { describe, expect, it } from 'vitest';
import { spatialQualityFixtures029, impossibleSpatialSource029, seededTreeSource029, waypointPaintSource029 } from './fixtures/spatialQuality029.js';
import { completeSpatialSource029, assertSpatialQuality029, properCrossingCount029 } from './helpers/spatialQuality029.js';

describe('production-source spatial quality corpus', () => {
  for (const fixture of spatialQualityFixtures029) it.each(['lowfi', 'hifi'] as const)(
    `${fixture.id} completes with valid, readable %s geometry`, async (style) => {
      const result = await completeSpatialSource029(fixture.source, style, fixture.direction);
      assertSpatialQuality029(result, fixture);
      if (fixture.zeroCrossings) expect(properCrossingCount029(result.scene), fixture.id).toBe(0);
      if (['parallel-3', 'parallel-4'].includes(fixture.id)) {
        const edges = [...result.scene.resolved.edges].sort((a, b) => a.points[0].y - b.points[0].y);
        const minGap = style === 'hifi' && fixture.id === 'parallel-4' ? 12 : 17;
        for (let index = 1; index < edges.length; index++) {
          // Four contacts retain >= 12 px spacing in compact 14 px hifi (> 17 px in lowfi),
          // exceeding the open arrowhead's clearance.
          expect(edges[index].points[0].y - edges[index - 1].points[0].y).toBeGreaterThan(minGap);
          expect(Math.abs(edges[index].points.at(-1)!.y - edges[index - 1].points.at(-1)!.y)).toBeGreaterThan(minGap);
        }
      }
      if (['parallel-terminals-3', 'pinned-parallel-terminals-3'].includes(fixture.id)) {
        const edges = result.scene.resolved.edges;
        for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
          // Curved borders still need enough room for the approximately 12px arrowheads.
          for (const contact of [0, -1]) {
            const a = edges[i].points.at(contact)!, b = edges[j].points.at(contact)!;
            expect(Math.hypot(a.x - b.x, a.y - b.y), `${fixture.id}: separated contacts`)
              .toBeGreaterThanOrEqual(12);
          }
        }
      }
      if (['parallel-only', 'pinned-parallel'].includes(fixture.id)) {
        const [first, second] = result.scene.resolved.edges;
        expect(Math.abs(first.points[0].y - second.points[0].y)).toBeGreaterThanOrEqual(18);
        expect(Math.abs(first.points.at(-1)!.y - second.points.at(-1)!.y)).toBeGreaterThanOrEqual(18);
        for (const edge of [first, second]) {
          expect(edge.points).toHaveLength(2);
          expect(edge.points[0].y).toBeCloseTo(edge.points[1].y, 5);
        }
      }
    });

  it.each(spatialQualityFixtures029.filter((fixture) => ['tree', 'diamond', 'mixed-ports', 'code-containment'].includes(fixture.id)))(
    '$id is repeatable for equal source/style/options without modifying authored meaning', async (fixture) => {
      const a = await completeSpatialSource029(fixture.source, 'hifi', fixture.direction);
      const b = await completeSpatialSource029(fixture.source, 'hifi', fixture.direction);
      expect(b.scene.resolved).toEqual(a.scene.resolved);
      expect(b.source).toEqual(a.source);
    });

  it.each(['lowfi', 'hifi'] as const)('rejects an exact impossible checkpoint in %s without moving pinned source nodes', async (style) => {
    await expect(completeSpatialSource029(impossibleSpatialSource029, style, 'RIGHT')).rejects.toThrow(/obstacle|penetrat|route|waypoint/i);
  });
  it.each(['lowfi', 'hifi'] as const)('keeps pinned geometry translation-equivalent in %s', async (style) => {
    const fixture = spatialQualityFixtures029.find((fixture) => fixture.id === 'pinned-corridor')!;
    const shift = (whole: string, x: string, y: string) => whole.replace(`(${x}, ${y})`, `(${Number(x) + 37}, ${Number(y) - 29})`);
    const translated = fixture.source.replace(/@ \((-?\d+), (-?\d+)\)/g, shift).replace(/waypoint at \((-?\d+), (-?\d+)\)/g, shift);
    const a = await completeSpatialSource029(fixture.source, style, fixture.direction);
    const b = await completeSpatialSource029(translated, style, fixture.direction);
    for (const node of a.scene.resolved.nodes) {
      const moved = b.scene.resolved.nodes.find((candidate) => candidate.id === node.id)!;
      expect(moved.x).toBeCloseTo(node.x + 37);
      expect(moved.y).toBeCloseTo(node.y - 29);
    }
    for (const edge of a.scene.resolved.edges) {
      const moved = b.scene.resolved.edges.find((candidate) => candidate.id === edge.id)!;
      expect(moved.points).toHaveLength(edge.points.length);
      edge.points.forEach((point, index) => {
        expect(moved.points[index]!.x).toBeCloseTo(point.x + 37);
        expect(moved.points[index]!.y).toBeCloseTo(point.y - 29);
      });
    }
  });

  it.each(['lowfi', 'hifi'] as const)('keeps the supplied Code module/class spine aligned and branches ordered in %s', async (style) => {
    const fixture = spatialQualityFixtures029.find((fixture) => fixture.id === 'code-containment')!;
    const { scene } = await completeSpatialSource029(fixture.source, style, 'DOWN');
    const node = (id: string) => scene.resolved.nodes.find((node) => node.id === id)!;
    expect(node('module').x + node('module').width / 2).toBeCloseTo(node('renderer').x + node('renderer').width / 2);
    expect(node('render').x).toBeLessThan(node('version').x);
    const spine = scene.resolved.edges.find((edge) => edge.id === 'moduleClass')!;
    expect(spine.points.every((point) => Math.abs(point.x - spine.points[0]!.x) < 1e-5)).toBe(true);
    expect(properCrossingCount029(scene)).toBe(0);
    let bentBranches = 0;
    for (const id of ['classRender', 'classVersion']) {
      const branch = scene.resolved.edges.find((edge) => edge.id === id)!;
      // Under 0.2.11 BRANDES_KOEPF, one branch aligns straight beneath renderer (0 bends);
      // verify clearance on every bent branch.
      if (branch.points.length <= 2) continue;
      const traverse = branch.points.slice(1).find((point, index) =>
        Math.abs(point.y - branch.points[index]!.y) < 1e-5 &&
        Math.abs(point.x - branch.points[index]!.x) > 1);
      expect(traverse, id).toBeDefined();
      expect(traverse!.y - node('renderer').y - node('renderer').height, id).toBeGreaterThanOrEqual(27);
      bentBranches += 1;
    }
    expect(bentBranches).toBeGreaterThanOrEqual(1);
  });

  it.each([0x123, 0x213, 0x987])('keeps seeded planar tree %i crossing-free and repeatable', async (seed) => {
    const fixture = seededTreeSource029(seed);
    const a = await completeSpatialSource029(fixture.source, 'hifi', fixture.direction);
    const b = await completeSpatialSource029(fixture.source, 'hifi', fixture.direction);
    assertSpatialQuality029(a, fixture);
    expect(properCrossingCount029(a.scene)).toBe(0);
    expect(b.scene.resolved).toEqual(a.scene.resolved);
  });

  it.each(['lowfi', 'hifi'] as const)('allows only short forced shared-port stems between parallel shafts in %s', async style => {
    const source = '@diagram block\na block @ (0, 0) pinned {\n  exit port [direction: out, anchor: E]\n}\n' +
      'b block @ (300, 0) pinned {\n  enter port [direction: in, anchor: W]\n}\n' +
      'first = a:exit -> b:enter\nsecond = a:exit -> b:enter\n';
    const result = await completeSpatialSource029(source, style, 'RIGHT');
    assertSpatialQuality029(result, { id: 'shared-port-parallel', source, direction: 'RIGHT' });
    const [first, second] = result.scene.resolved.edges;
    expect(first.points[0]).toEqual(second.points[0]);
    expect(first.points.at(-1)).toEqual(second.points.at(-1));
    const aNode = result.scene.resolved.nodes.find(node => node.id === 'a')!;
    const bNode = result.scene.resolved.nodes.find(node => node.id === 'b')!;
    expect(first.points[0]).toEqual({ x: aNode.x + aNode.width, y: aNode.y + aNode.height / 2 });
    expect(first.points.at(-1)).toEqual({ x: bNode.x, y: bNode.y + bNode.height / 2 });
    let sharedLength = 0;
    for (let i = 1; i < first.points.length; i++) for (let j = 1; j < second.points.length; j++) {
      const a = first.points[i - 1], b = first.points[i], c = second.points[j - 1], d = second.points[j];
      const horizontal = Math.abs(a.y - b.y) < 1e-6 && Math.abs(c.y - d.y) < 1e-6 && Math.abs(a.y - c.y) < 1e-6;
      const vertical = Math.abs(a.x - b.x) < 1e-6 && Math.abs(c.x - d.x) < 1e-6 && Math.abs(a.x - c.x) < 1e-6;
      if (!horizontal && !vertical) continue;
      const axis = horizontal ? 'x' : 'y', other = horizontal ? 'y' : 'x';
      const from = Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
      const to = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]));
      if (to - from < 1e-6) continue;
      sharedLength += to - from;
      expect([first.points[0], first.points.at(-1)!].some(contact =>
        Math.abs(a[other] - contact[other]) < 1e-6 &&
        Math.max(Math.abs(from - contact[axis]), Math.abs(to - contact[axis])) <= 8.01),
      'only the exact port contact-to-escape stem may overlap').toBe(true);
    }
    expect(sharedLength).toBeLessThanOrEqual(16.01);
    expect(first.points).not.toEqual(second.points);
  });

  it('validates the browser waypoint-paint benchmark source through the production pipeline', async () => {
    const result = await completeSpatialSource029(waypointPaintSource029, 'hifi', 'RIGHT');
    assertSpatialQuality029(result, { id: 'waypoint-paint', source: waypointPaintSource029, direction: 'RIGHT' });
  });

});


describe('spatial crossing measurement', () => {
  const route = (points: Array<[number, number]>, sourceId = 'a', targetId = 'b') => ({
    sourceId, targetId, points: points.map(([x, y]) => ({ x, y })),
  });
  it.each([
    ['at a generated bend', route([[0, 0], [5, 0], [5, 5]]), route([[5, -5], [5, 0], [10, 0]], 'c', 'd')],
    ['at a T contact', route([[0, 0], [10, 0]]), route([[5, -5], [5, 0]], 'c', 'd')],
    ['along overlapping shafts', route([[0, 0], [10, 0]]), route([[5, 0], [15, 0]], 'c', 'd')],
  ])('detects intersections %s', (_name, a, b) => {
    expect(properCrossingCount029({ resolved: { edges: [a, b] } })).toBeGreaterThan(0);
  });
  it('permits a common source contact without permitting a shared shaft', () => {
    const a = route([[0, 0], [10, 0]]);
    const b = route([[0, 0], [0, 10]], 'a', 'c');
    expect(properCrossingCount029({ resolved: { edges: [a, b] } })).toBe(0);
    expect(properCrossingCount029({ resolved: { edges: [a, route([[0, 0], [5, 0], [5, 10]], 'a', 'c')] } })).toBeGreaterThan(0);
  });
});
