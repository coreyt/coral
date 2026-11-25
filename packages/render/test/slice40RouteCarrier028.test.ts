import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplay028 } from '../src/successorSourceDisplay028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { checkGraphConformance028 } from '../src/graphConformance028.js';

const base = '@diagram architecture\na service\nb service\nlegacy = a <- b\ndependent = a -> b\n';

describe('Slice 40 faithful route validation carriers', () => {
  it('keeps legacy-representable first/second anchors on edges without a redundant root sidecar', () => {
    const projected = projectInstalledSourceToSuccessor028(base +
      'route edge legacy {\n first = waypoint relative to first offset (10, 0)\n' +
      ' second = waypoint relative to second offset (0, 10)\n}\n');
    expect(projected.diagnostics).toEqual([]);
    const before = structuredClone(projected.graph);
    const display = successorSourceDisplay028(projected.graph!);
    expect(display).not.toHaveProperty('routeIntents028');
    expect(display.edges[0]).toMatchObject({ source: 'a', target: 'b', routeIntent: { waypoints: [
      { id: 'first', placement: { anchor: { kind: 'source' } } },
      { id: 'second', placement: { anchor: { kind: 'target' } } },
    ] } });
    expect(checkGraphConformance028(display, { requestedLevel: 'strict', operation: 'check' })
      .findings).toEqual([]);
    expect(projected.graph).toEqual(before);
  });

  it('resolves mixed legacy and dependent routes without changing reversed written ends', async () => {
    const source = '@diagram architecture\na service @ (20, 20) pinned\nb service @ (500, 20) pinned\n' +
      'legacy = a <- b\ndependent = a -> b\n' +
      'route edge legacy {\n start = waypoint at (240, 180)\n}\n' +
      'route edge dependent {\n one = waypoint at (240, 240)\n' +
      ' two = waypoint relative to waypoint one offset (120, 0)\n}\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const display = successorSourceDisplay028(projected.graph!);
    const laid = await layoutGraphForSvg(display);
    const points = (id: string) => laid.edgeRoutes.get(id)!.flatMap((section) =>
      [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]);
    expect(points('legacy')).toContainEqual({ x: 240, y: 180 });
    expect(points('dependent')).toEqual(expect.arrayContaining([{ x: 240, y: 240 }, { x: 360, y: 240 }]));
    expect(display.edges[0]).toMatchObject({ source: 'a', target: 'b',
      sourceEnd: { marker: { kind: 'arrow' } } });
    expect(projected.graph!.edges[0]).toMatchObject({ first: { node: 'a' }, second: { node: 'b' },
      direction: 'second-to-first' });
  });

  it('keeps only dependent routes in the successor sidecar alongside faithful legacy routes', () => {
    const projected = projectInstalledSourceToSuccessor028(base +
      'route edge legacy {\n start = waypoint at (40, 60)\n}\n' +
      'route edge dependent {\n one = waypoint at (80, 60)\n' +
      ' two = waypoint relative to waypoint one offset (20, 0)\n}\n');
    expect(projected.diagnostics).toEqual([]);
    const display = successorSourceDisplay028(projected.graph!);
    expect(display).toHaveProperty('routeIntents028', {
      dependent: projected.graph!.edges[1]!.routeIntent,
    });
    expect(display.edges[0]?.routeIntent).toEqual({ waypoints: [
      { id: 'start', placement: { kind: 'absolute', position: { x: 40, y: 60 } } },
    ] });
    expect(display.edges[1]).not.toHaveProperty('routeIntent');
    // The display sidecar is for verified source layout, never public GraphIR3 input.
    expect(checkGraphConformance028(display, { requestedLevel: 'strict', operation: 'check' })
      .findings).toContainEqual(expect.objectContaining({
        id: 'GRAPHIR.SCHEMA_VIOLATION', category: 'integrity', path: '/routeIntents028',
      }));
  });
});
