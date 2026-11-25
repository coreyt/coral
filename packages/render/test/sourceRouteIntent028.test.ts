import { describe, expect, it } from 'vitest';
import { validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplay028, successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { successorCatalogSnapshot028 } from '../src/successorInterpretation028.js';
import { verifyPortableSuccessorSource028 } from '../src/successorPortableExport028.js';
import { resolveSpatialLayout } from '../src/layout/spatial.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSequenceScene028, prepareSpatialScene028 } from '../src/svg/serialize.js';

const prefix = '@diagram architecture\napi service @ (20, 20) pinned\nstore service @ (500, 20) pinned\n';

describe('source-owned authored route execution', () => {
  it('keeps authored diagonal segments when orthogonal routing is only an engine default', async () => {
    const text = prefix + 'request = api -> store\nroute edge request {\n' +
      '  turn = waypoint at (240, 180)\n}\n';
    const projected = projectInstalledSourceToSuccessor028(text).graph!;
    const before = JSON.stringify(projected);
    const { display } = successorSourceDisplayWithSemanticPorts028(projected);
    const resolved = await resolveSpatialLayout({ revision: 'default-route-policy', graph: display,
      operation: 'load', defaults: { algorithm: 'layered', direction: 'RIGHT', edgeRouting: 'ORTHOGONAL' } });
    expect(resolved.edges[0]!.sections[0]!.endPoint).toEqual({ x: 240, y: 180 });
    expect(resolved.nodes.map(({ id, absolutePosition }) => ({ id, position: absolutePosition })))
      .toEqual(projected.nodes.map(({ id, position }) => ({ id, position })));
    expect(JSON.stringify(projected)).toBe(before);
  });

  it.each([
    { edgeRouting: 'ORTHOGONAL' },
    { elkOptions: { 'elk.edgeRouting': 'orthogonal' } },
  ])('still enforces explicit public API routing restrictions: %j', async (options) => {
    const text = prefix + 'request = api -> store\nroute edge request {\n' +
      '  turn = waypoint at (240, 180)\n}\n';
    const { display } = successorSourceDisplayWithSemanticPorts028(projectInstalledSourceToSuccessor028(text).graph!);
    await expect(resolveSpatialLayout({ revision: 'explicit-route-policy', graph: display,
      operation: 'load', options, defaults: { algorithm: 'layered', direction: 'RIGHT' } }))
      .rejects.toThrow(/Orthogonal route contains a diagonal segment/);
  });

  it('still enforces an explicit source routing restriction', async () => {
    const text = prefix.replace('@diagram architecture\n', '@diagram architecture\nlayout [edgeRouting: ORTHOGONAL]\n') +
      'request = api -> store\nroute edge request {\n  turn = waypoint at (240, 180)\n}\n';
    const { display } = successorSourceDisplayWithSemanticPorts028(projectInstalledSourceToSuccessor028(text).graph!);
    await expect(layoutGraphForSvg(display)).rejects.toThrow(/Orthogonal route contains a diagonal segment/);
  });

  it('projects ordered absolute waypoints into portable meaning and the resolved shaft', async () => {
    const source = prefix + 'request = api -> store\nroute edge request {\n' +
      '  turn = waypoint at (240, 180)\n  next = waypoint at (360, 180)\n}\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph!.edges[0]).toMatchObject({ routeIntent: { waypoints: [
      { id: 'turn', placement: { kind: 'absolute', position: { x: 240, y: 180 } } },
      { id: 'next', placement: { kind: 'absolute', position: { x: 360, y: 180 } } },
    ] } });
    expect(validateGraphIRSuccessorWithCatalog(projected.graph!, successorCatalogSnapshot028(projected.graph!)).errors).toEqual([]);
    expect(verifyPortableSuccessorSource028(source).graph).toEqual(projected.graph);
    const before = JSON.stringify(projected.graph);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const laid = await layoutGraphForSvg(display, { semanticInterpretations });
    for (const style of ['lowfi', 'hifi'] as const) {
      const scene = prepareSpatialScene028(laid, { style, successorSource: projected.graph,
        semanticGraph: display, edgeRoutes: laid.edgeRoutes });
      const shaft = scene.parts.find((part) => part.id === 'request:shaft')!;
      if (shaft.geometry.kind !== 'route') throw new Error('missing route');
      expect(shaft.geometry.points.slice(1, -1)).toEqual([
        { x: 240 + scene.viewport.shiftX, y: 180 + scene.viewport.shiftY },
        { x: 360 + scene.viewport.shiftX, y: 180 + scene.viewport.shiftY },
      ]);
    }
    expect(JSON.stringify(projected.graph)).toBe(before);
  });

  it.each(['->', '<-'])('preserves first/second anchors in written order for %s', async (arrow) => {
    const source = prefix + `request = api ${arrow} store\nroute edge request {\n` +
      '  leave = waypoint relative to first offset (20, 80)\n' +
      '  arrive = waypoint relative to second offset (-20, 80)\n}\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph!.edges[0]).toMatchObject({ first: { node: 'api' }, second: { node: 'store' },
      routeIntent: { waypoints: [
        { id: 'leave', placement: { kind: 'relative', anchor: { kind: 'first' }, offset: { x: 20, y: 80 } } },
        { id: 'arrive', placement: { kind: 'relative', anchor: { kind: 'second' }, offset: { x: -20, y: 80 } } },
      ] } });
    expect(validateGraphIRSuccessorWithCatalog(projected.graph!, successorCatalogSnapshot028(projected.graph!)).errors).toEqual([]);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const laid = await layoutGraphForSvg(display, { semanticInterpretations });
    const sections = laid.edgeRoutes.get('request')!;
    expect(sections[0].endPoint).toEqual({ x: sections[0].startPoint.x + 20, y: sections[0].startPoint.y + 80 });
    expect(sections.at(-1)!.startPoint).toEqual({ x: sections.at(-1)!.endPoint.x - 20, y: sections.at(-1)!.endPoint.y + 80 });
  });

  it('retains qualified node anchors and resolves them from the final node center', async () => {
    const source = '@diagram architecture\nteam group {\n  api service\n  db service\n' +
      '  request = api -> db\n  route edge request {\n' +
      '    bend = waypoint relative to node api offset (120, 100)\n  }\n}\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph!.edges[0]).toMatchObject({ id: 'team.request', routeIntent: { waypoints: [
      { id: 'bend', placement: { kind: 'relative', anchor: { kind: 'node', nodeId: 'team.api' }, offset: { x: 120, y: 100 } } },
    ] } });
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const laid = await layoutGraphForSvg(display, { semanticInterpretations });
    const api = laid.nodes.find((node) => node.id === 'team.api')!;
    expect(laid.edgeRoutes.get('team.request')![0].endPoint).toEqual({
      x: api.position!.x + api.dimensions!.width / 2 + 120,
      y: api.position!.y + api.dimensions!.height / 2 + 100,
    });
  });
  it('recomputes relative waypoints from the final attachments on Reflow without rewriting source intent', async () => {
    const source = prefix.replaceAll(' pinned', '') + 'request = api -> store\nroute edge request {\n' +
      '  leave = waypoint relative to first offset (20, 80)\n' +
      '  arrive = waypoint relative to second offset (-20, 80)\n}\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    const before = JSON.stringify(projected.graph);
    const { display } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const resolved = await resolveSpatialLayout({ revision: 'route-reflow', graph: display, operation: 'reflow',
      defaults: { algorithm: 'layered', direction: 'RIGHT' } });
    expect(resolved.nodes.find((node) => node.id === 'store')!.absolutePosition).not.toEqual({ x: 500, y: 20 });
    const sections = resolved.edges[0].sections;
    expect(sections[0].endPoint).toEqual({ x: sections[0].startPoint.x + 20, y: sections[0].startPoint.y + 80 });
    expect(sections.at(-1)!.startPoint).toEqual({ x: sections.at(-1)!.endPoint.x - 20, y: sections.at(-1)!.endPoint.y + 80 });
    expect(JSON.stringify(projected.graph)).toBe(before);
  });

  it.each(['RIGHT', 'DOWN'] as const)('retains a route-only catalog port through %s SVG layout', async (direction) => {
    const source = '@diagram architecture\napi service\nstore database\nrequest = api -> store\nroute edge request {\n' +
      '  bend = waypoint relative to port api:out offset (20, 0)\n}\n';
    const meaning = verifyPortableSuccessorSource028(source).graph!;
    expect(meaning).toBeDefined();
    const before = JSON.stringify(meaning);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(meaning);
    expect(display.edges[0].sourcePort).toBeUndefined();
    expect(display.nodes[0].ports).toBeUndefined();
    const laid = await layoutGraphForSvg(display, { direction, semanticInterpretations });
    const api = laid.nodes.find((node) => node.id === 'api')!;
    // The service stencil is a 100 x 60 rectangle, uniformly fitted in its node.
    const scale = Math.min(api.dimensions!.width / 100, api.dimensions!.height / 60);
    const expected = { x: api.position!.x + api.dimensions!.width / 2 + (direction === 'RIGHT' ? 50 * scale : 0) + 20,
      y: api.position!.y + api.dimensions!.height / 2 + (direction === 'DOWN' ? 30 * scale : 0) };
    expect(laid.edgeRoutes.get('request')![0].endPoint).toEqual(expected);
    for (const style of ['lowfi', 'hifi'] as const) {
      const scene = prepareSpatialScene028(laid, { style, layoutDirection: direction, successorSource: meaning,
        semanticGraph: display, edgeRoutes: laid.edgeRoutes });
      const shaft = scene.parts.find((part) => part.id === 'request:shaft')!;
      if (shaft.geometry.kind !== 'route') throw new Error('missing route');
      expect(shaft.geometry.points[1]).toEqual({ x: expected.x + scene.viewport.shiftX,
        y: expected.y + scene.viewport.shiftY });
    }
    expect(JSON.stringify(meaning)).toBe(before);
    expect(display.nodes.every((node) => node.ports === undefined)).toBe(true);
  });

  it('refuses to silently discard route intent on a supplied sequence graph', () => {
    const projected = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na participant\nb participant\ncall = a <- b\n');
    expect(projected.diagnostics).toEqual([]);
    projected.graph!.edges[0].routeIntent = { waypoints: [
      { id: 'turn', placement: { kind: 'relative', anchor: { kind: 'first' }, offset: { x: 20, y: 80 } } },
    ] };
    const display = successorSourceDisplay028(projected.graph!);
    expect(display.edges[0]).toMatchObject({ source: 'b', target: 'a', routeIntent: { waypoints: [
      { id: 'turn', placement: { kind: 'relative', anchor: { kind: 'target' }, offset: { x: 20, y: 80 } } },
    ] } });
    expect(() => prepareSequenceScene028(display)).toThrow(/authored route intent is not executable/);
  });

});
