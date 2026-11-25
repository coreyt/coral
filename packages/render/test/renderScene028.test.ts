import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { GraphIR } from '@graph-ir/core';
import { measureSvgNode, prepareSpatialScene028, renderSvg,
  resolveSvgNodeFont } from '../src/svg/serialize.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { retargetSpatialEdgeParts028, spatialPartManifest028 } from '../src/renderScene028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplay028,
  successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { RenderCapabilityError } from '../src/scene.js';
import { bpmnGatewayFrame028 } from '../src/bpmnGatewayVisual028.js';
import { stencilFit028 } from '../src/stencilAnchorGeometry028.js';
import { shapeRegistry } from '../src/shapes/index.js';
import { measureText } from '../src/text/metrics.js';

const authored: GraphIR = {
  version: '3.0.0', id: 'slice', metadata: { notation: 'flowchart' },
  nodes: [
    { id: 'start', type: 'terminal', symbol: 'flowchart-terminal', label: 'Start' },
    { id: 'check', type: 'decision', symbol: 'flowchart-decision', label: 'Ready?' },
  ],
  edges: [{ id: 'next', source: 'start', target: 'check', label: 'yes',
    targetEnd: { marker: { kind: 'arrow', fill: 'open' } } }],
};
const drawing = { ...authored, nodes: [
  { ...authored.nodes[0]!, position: { x: 20, y: 20 }, dimensions: { width: 130, height: 64 } },
  { ...authored.nodes[1]!, position: { x: 240, y: 20 }, dimensions: { width: 150, height: 100 } },
] };

describe('0.2.8 prepared scene contract', () => {
  it.each(['RIGHT', 'LEFT'] as const)('separates the flowchart review cycle from its forward shaft in %s', async (direction) => {
    const text = readFileSync(new URL('../../browser/test/fixtures/acceptance028/flowchart-cycle.coral', import.meta.url), 'utf8');
    const source = projectInstalledSourceToSuccessor028(text).graph!;
    const original = structuredClone(source);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(source);
    for (const style of ['lowfi', 'hifi'] as const) {
      const laid = await layoutGraphForSvg(display, { direction, svgOptions: { style }, semanticInterpretations });
      const prepared = prepareSpatialScene028(laid, { style, layoutDirection: direction,
        edgeRoutes: laid.edgeRoutes, semanticGraph: display, successorSource: source });
      const forwardId = display.edges.find((edge) => edge.source === 'work' && edge.target === 'choice')!.id;
      const retryId = display.edges.find((edge) => edge.source === 'choice' && edge.target === 'work')!.id;
      const forward = prepared.resolved.edges.find((edge) => edge.id === forwardId)!;
      const retry = prepared.resolved.edges.find((edge) => edge.id === retryId)!;
      const work = prepared.resolved.nodes.find((node) => node.id === 'work')!;
      const choice = prepared.resolved.nodes.find((node) => node.id === 'choice')!;
      expect([2, 4]).toContain(forward.points.length);
      expect(retry.points).toHaveLength(4);
      // The return goes above both complete node boxes, then enters work
      // from above; its arrow cannot merge with the forward arrow at choice.
      const laneY = retry.points[1]!.y;
      expect(laneY).toBeLessThan(Math.min(work.y, choice.y) - 16);
      expect(retry.points[2]!.y).toBe(laneY);
      expect(retry.points[0]!.x).toBe(retry.points[1]!.x);
      expect(retry.points[2]!.x).toBe(retry.points[3]!.x);
      expect(retry.points[0]!.y).toBeLessThan(forward.points.at(-1)!.y);
      expect(retry.points[3]!.y).toBeLessThan(forward.points[0]!.y);
    }
    expect(source).toEqual(original);
  });

  it.each(['DOWN', 'UP', 'RIGHT', 'LEFT'] as const)('positions BPMN captions beside vertical flows and below horizontal flows in %s', async (direction) => {
    const text = '@diagram bpmn\nreceived startEvent\nwork task\ncompleted endEvent\nfirst = received -> work\nlast = work -> completed\n';
    const source = projectInstalledSourceToSuccessor028(text).graph!;
    const original = structuredClone(source);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(source);
    for (const style of ['lowfi', 'hifi'] as const) {
      const laid = await layoutGraphForSvg(display, { direction, svgOptions: { style }, semanticInterpretations });
      const prepared = prepareSpatialScene028(laid, { style, layoutDirection: direction,
        edgeRoutes: laid.edgeRoutes, semanticGraph: display, successorSource: source });
      for (const id of ['received', 'completed']) {
        const ring = prepared.parts.find((part) => part.id === `${id}:outline`)!;
        const caption = prepared.parts.find((part) => part.id === `${id}:label:1`)!;
        if (direction === 'DOWN' || direction === 'UP') {
          expect(caption.bounds.x).toBeGreaterThan(ring.bounds.x + ring.bounds.width);
          expect(caption.bounds.y).toBeLessThan(ring.bounds.y + ring.bounds.height);
        } else expect(caption.bounds.y).toBeGreaterThan(ring.bounds.y + ring.bounds.height);
      }
      for (const edge of prepared.resolved.edges) expect(edge.points).toHaveLength(2);
    }
    expect(source).toEqual(original);
  });

  it('refuses a fixed event box too narrow for a vertical side caption without resizing the source', () => {
    const graph: GraphIR = { version: '3.0.0', id: 'fixed-event', metadata: { notation: 'bpmn' },
      nodes: [{ id: 'received', type: 'startEvent', dimensions: { width: 64, height: 100 },
        position: { x: 20, y: 30 } }], edges: [] };
    const original = structuredClone(graph);
    expect(() => prepareSpatialScene028(graph, { style: 'hifi', layoutDirection: 'DOWN' }))
      .toThrow(/hard-size-text-conflict/);
    expect(graph).toEqual(original);
  });

  it('keeps a wide lowfi task label inside the painted rectangle', () => {
    const node = { id: 'assess', type: 'task', symbol: 'bpmn-task',
      label: 'Assess eligibility' };
    const options = { style: 'lowfi' as const, notation: 'bpmn' };
    const size = measureSvgNode(node, options);
    const font = resolveSvgNodeFont(node, options)!;
    const ink = measureText({ text: node.label, fontFamily: font.cssFamily,
      fontSize: font.size, fontWeight: font.weight });
    const painted = stencilFit028(shapeRegistry.get('rectangle')!, size.width, size.height);
    expect(painted.fittedWidth).toBeGreaterThanOrEqual(ink.width + 32);
  });
  it('rebases parts without changing a freshly resolved viewport manifest', () => {
    for (const style of ['lowfi', 'hifi'] as const) {
      const prepared = prepareSpatialScene028(drawing, { style });
      const font = resolveSvgNodeFont(undefined, { style, notation: 'flowchart' })!;
      const direct = spatialPartManifest028(prepared.resolved, prepared.nodes, {
        style, shiftX: prepared.viewport.shiftX, shiftY: prepared.viewport.shiftY,
        defaultFont: font,
      });
      const normalize = (value: unknown) => JSON.parse(JSON.stringify(value,
        (_key, entry) => typeof entry === 'number' ? Number(entry.toFixed(9)) : entry));
      expect(normalize(prepared.parts)).toEqual(normalize(direct));
    }
  });
  it('keeps authored meaning independent from derived layout and style', () => {
    const lowfi = prepareSpatialScene028(drawing, { style: 'lowfi', semanticGraph: authored });
    const hifi = prepareSpatialScene028(drawing, { style: 'hifi', semanticGraph: authored });
    expect(lowfi.kind).toBe('spatial');
    expect(lowfi.status).toBe('complete');
    expect(lowfi.semantic).toEqual(hifi.semantic);
    expect(lowfi.semantic.sourceKind).toBe('authored');
    expect(lowfi.semantic.nodes[0]?.position).toBeUndefined();
    expect(lowfi.nodes[0]?.x).toBe(20);
    expect(lowfi.parts.map((part) => part.id)).toContain('next:target-marker');
    expect(lowfi.parts.map((part) => part.id)).toContain('check:outline');
    expect(lowfi.parts.map((part) => part.id)).toContain('check:label:1');
    expect(lowfi.partIndex['check:outline']).toBe(lowfi.parts.findIndex(
      (part) => part.id === 'check:outline'));
    expect(lowfi.ownerLookup.partIds['node:check']).toContain('check:label:1');
    expect(lowfi.ownerLookup.partIds['edge:next']).toContain('next:target-marker');
    expect(lowfi.ownerLookup.hitBounds['node:check']).toMatchObject({
      x: expect.any(Number), width: expect.any(Number), height: expect.any(Number),
    });
    expect(lowfi.ownerLookup.hitBounds['edge:next']!.width).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(lowfi.ownerLookup))).toEqual(lowfi.ownerLookup);
    expect(lowfi.bounds).toEqual({ x: 0, y: 0,
      width: lowfi.viewport.width, height: lowfi.viewport.height });
    expect(prepareSpatialScene028(drawing, { style: 'lowfi', semanticGraph: authored }).revision)
      .toBe(lowfi.revision);
    expect(hifi.revision).not.toBe(lowfi.revision);
    expect(prepareSpatialScene028(drawing, { revision: 'edit-8' }).revision).toBe('edit-8');
    expect(new Set(lowfi.parts.map((part) => part.id)).size).toBe(lowfi.parts.length);
    for (const part of lowfi.parts) {
      expect(Object.values(part.bounds).every(Number.isFinite), part.id).toBe(true);
    }
    expect(lowfi.parts.find((part) => part.id === 'check:outline')?.geometry)
      .not.toEqual(hifi.parts.find((part) => part.id === 'check:outline')?.geometry);
  });

  it('rejects a semantic snapshot with missing or substituted IDs', () => {
    const changed = structuredClone(authored);
    changed.edges[0]!.id = 'different';
    expect(() => prepareSpatialScene028(drawing, { semanticGraph: changed }))
      .toThrow(/semantic-manifest.*IDs differ/);
  });

  it('rejects non-finite scene geometry before projection', () => {
    const invalid = structuredClone(drawing);
    invalid.nodes[0]!.position!.x = Number.NaN;
    expect(() => prepareSpatialScene028(invalid, { semanticGraph: authored }))
      .toThrow(/scene-bounds|route/);
  });

  it('fits a supplied route and its label inside the scene viewport', () => {
    const route = new Map([['next', [{ startPoint: { x: 80, y: 52 },
      bendPoints: [{ x: -90, y: -45 }], endPoint: { x: 240, y: 70 } }]]]);
    const prepared = prepareSpatialScene028(drawing, {
      style: 'hifi', semanticGraph: authored, edgeRoutes: route,
    });
    expect(prepared.viewport.shiftX).toBeGreaterThan(90);
    expect(prepared.viewport.shiftY).toBeGreaterThan(45);
    for (const part of prepared.parts) {
      expect(part.bounds.x, part.id).toBeGreaterThanOrEqual(0);
      expect(part.bounds.y, part.id).toBeGreaterThanOrEqual(0);
      expect(part.bounds.x + part.bounds.width, part.id)
        .toBeLessThanOrEqual(prepared.viewport.width);
      expect(part.bounds.y + part.bounds.height, part.id)
        .toBeLessThanOrEqual(prepared.viewport.height);
    }
  });

  it('rounds generated elbows but leaves authored waypoint corners exact', () => {
    const edgeRoutes = new Map([['next', [{ startPoint: { x: 150, y: 52 },
      bendPoints: [{ x: 180, y: 52 }, { x: 180, y: 170 }],
      endPoint: { x: 315, y: 120 } }]]]);
    const generated = prepareSpatialScene028(drawing, { style: 'hifi', edgeRoutes });
    const authoredRoute = structuredClone(drawing);
    authoredRoute.edges[0]!.routeIntent = { waypoints: [{ id: 'corner',
      placement: { kind: 'absolute', position: { x: 180, y: 52 } } }] };
    const authored = prepareSpatialScene028(authoredRoute, { style: 'hifi', edgeRoutes });
    const shaft = (parts: typeof generated.parts) => parts.find((part) => part.id === 'next:shaft')!;
    expect(shaft(generated.parts).geometry.kind).toBe('route');
    expect(shaft(authored.parts).geometry.kind).toBe('route');
    if (shaft(generated.parts).geometry.kind !== 'route' ||
      shaft(authored.parts).geometry.kind !== 'route') return;
    expect(shaft(generated.parts).geometry.d).toContain(' Q');
    expect(shaft(authored.parts).geometry.d).not.toContain(' Q');
    expect(shaft(generated.parts).geometry.points).toEqual(shaft(authored.parts).geometry.points);
  });

  it('keeps a sparse label check bounded on a very long diagonal route', () => {
    const route = new Map([['next', [{ startPoint: { x: 80, y: 52 },
      bendPoints: [{ x: 100_000, y: 100_000 }], endPoint: { x: 240, y: 70 } }]]]);
    const scene = prepareSpatialScene028(drawing, { style: 'hifi', edgeRoutes: route });
    expect(scene.parts.find((part) => part.id === 'next:label')).toBeDefined();
  });

  it('handles route bounds beyond precise grid-cell coordinates', () => {
    const route = new Map([['next', [{ startPoint: { x: 80, y: 52 },
      bendPoints: [{ x: 1e20, y: 1e20 }], endPoint: { x: 240, y: 70 } }]]]);
    const scene = prepareSpatialScene028(drawing, { style: 'hifi', edgeRoutes: route });
    expect(scene.parts.find((part) => part.id === 'next:label')).toBeDefined();
  });

  it('keeps an edge label clear of its fixed endpoint labels', () => {
    const graph: GraphIR = { version: '3.0.0', id: 'endpoint-label-clearance',
      metadata: { notation: 'flowchart' }, nodes: [
        { id: 'left', type: 'process', label: 'Left', position: { x: 0, y: 0 },
          dimensions: { width: 100, height: 60 } },
        { id: 'right', type: 'process', label: 'Right', position: { x: 200, y: 0 },
          dimensions: { width: 100, height: 60 } },
      ], edges: [{ id: 'review', source: 'left', target: 'right', label: 'Review',
        sourceEnd: { role: 'users' } }] };
    const route = new Map([['review', [{ startPoint: { x: 100, y: 30 },
      bendPoints: [], endPoint: { x: 200, y: 30 } }]]]);
    const parts = prepareSpatialScene028(graph, { style: 'hifi', edgeRoutes: route }).parts;
    const main = parts.find((part) => part.id === 'review:label')!.bounds;
    const endpoint = parts.find((part) => part.id === 'review:source:role')!.bounds;
    expect(main.x + main.width <= endpoint.x || endpoint.x + endpoint.width <= main.x ||
      main.y + main.height <= endpoint.y || endpoint.y + endpoint.height <= main.y).toBe(true);
  });

  it.each(['lowfi', 'hifi'] as const)('keeps complete class connector labels outside painted %s bodies', async (style) => {
    const text = readFileSync(new URL('./fixtures/uml-class.coral', import.meta.url), 'utf8');
    const source = projectInstalledSourceToSuccessor028(text).graph!;
    const original = structuredClone(source);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(source);
    const laidOut = await layoutGraphForSvg(display, { svgOptions: { style }, semanticInterpretations });
    const prepared = prepareSpatialScene028(laidOut, {
      style, edgeRoutes: laidOut.edgeRoutes, semanticGraph: display, successorSource: source,
    });
    const label = prepared.parts.find((part) => part.id === 'contains:label')!;
    expect(label.geometry.kind === 'text' && label.geometry.text).toBe('contains');
    const bodies = prepared.parts.filter((part) => part.role === 'outline' && part.owner.kind === 'node');
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) expect(label.bounds.x < body.bounds.x + body.bounds.width &&
      label.bounds.x + label.bounds.width > body.bounds.x &&
      label.bounds.y < body.bounds.y + body.bounds.height &&
      label.bounds.y + label.bounds.height > body.bounds.y, body.id).toBe(false);
    expect(source).toEqual(original);
    expect(label.bounds.x).toBeGreaterThanOrEqual(0);
    expect(label.bounds.y).toBeGreaterThanOrEqual(0);
    expect(label.bounds.x + label.bounds.width).toBeLessThanOrEqual(prepared.viewport.width);
    expect(label.bounds.y + label.bounds.height).toBeLessThanOrEqual(prepared.viewport.height);
  });

  it('retains a larger configured column gap when reserving automatic label room', async () => {
    const source = projectInstalledSourceToSuccessor028('@diagram block\na block\nb block\ne = a -> b as "A labeled connection"\n').graph!;
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(source);
    const laid = await layoutGraphForSvg(display, { direction: 'RIGHT', layerSpacing: 800,
      svgOptions: { style: 'lowfi' }, semanticInterpretations });
    const a = laid.nodes.find(node => node.id === 'a')!, b = laid.nodes.find(node => node.id === 'b')!;
    expect(b.position!.x - a.position!.x - a.dimensions!.width).toBeGreaterThanOrEqual(800);
  });

  it.each(['lowfi', 'hifi'] as const)('places the dense social-class association label clear of %s bodies', async (style) => {
    const text = readFileSync(new URL(
      '../../diagram-editor/test/llm/fixtures/corpus/coral/social-network-class.coral', import.meta.url), 'utf8');
    const source = projectInstalledSourceToSuccessor028(text).graph!;
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(source);
    const laidOut = await layoutGraphForSvg(display, { svgOptions: { style }, semanticInterpretations });
    const prepared = prepareSpatialScene028(laidOut, {
      style, edgeRoutes: laidOut.edgeRoutes, semanticGraph: display, successorSource: source,
    });
    const node = (id: string) => prepared.resolved.nodes.find(node => node.id === id)!;
    const user = node('User');
    const labelRoom = Math.max(...prepared.parts.filter(part => part.role === 'edge-label').map(part => part.bounds.width)) + 40;
    for (const id of ['Album', 'Notification', 'NewsFeed', 'Post', 'Profile', 'GroupMembership', 'Message'])
      expect(node(id).x - user.x - user.width, id).toBeGreaterThanOrEqual(labelRoom);
    for (const [id, from, to] of [
      ['rel_2', 'User', 'Post'], ['rel_9', 'User', 'Message'],
      ['rel_12', 'User', 'GroupMembership'], ['rel_14', 'User', 'Notification'],
      ['rel_17', 'User', 'NewsFeed'], ['rel_13', 'GroupMembership', 'Group'],
      ['rel_10', 'Message', 'Conversation'],
    ]) {
      // Parts are in viewport coordinates; resolved nodes are not shifted.
      const label = prepared.parts.find(part => part.id === `${id}:label`)!;
      const labelX = label.bounds.x - prepared.viewport.shiftX;
      expect(labelX, `${id} starts in its column gap`).toBeGreaterThanOrEqual(node(from).x + node(from).width + 4);
      expect(labelX + label.bounds.width, `${id} ends in its column gap`).toBeLessThanOrEqual(node(to).x - 4);
    }
    const membership = prepared.parts.find(part => part.id === 'rel_13:label')!;
    const shaft = prepared.parts.find(part => part.id === 'rel_13:shaft')!;
    expect(membership.geometry.kind === 'text' && membership.geometry.text).toBe('membership in');
    if (shaft.geometry.kind !== 'route') throw new Error('Expected association shaft');
    const { x, y, width, height } = membership.bounds;
    const corners = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]];
    const distance = Math.min(...shaft.geometry.points.slice(1).flatMap((end, index) => {
      const start = shaft.geometry.kind === 'route' ? shaft.geometry.points[index]! : end;
      const dx = end.x - start.x, dy = end.y - start.y;
      return corners.map(([cx, cy]) => {
        const t = Math.max(0, Math.min(1, ((cx! - start.x) * dx + (cy! - start.y) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(cx! - start.x - t * dx, cy! - start.y - t * dy);
      });
    }));
    // The label formerly escaped below the entire graph, over 300px away.
    expect(distance).toBeLessThan(40);
    const label = prepared.parts.find(part => part.id === 'rel_2:label')!;
    expect(label.geometry.kind === 'text' && label.geometry.text).toBe('creates');
    for (const label of [membership, prepared.parts.find(part => part.id === 'rel_2:label')!])
    for (const body of prepared.parts.filter(part => part.role === 'outline' && part.owner.kind === 'node')) {
      expect(label.bounds.x < body.bounds.x + body.bounds.width &&
        label.bounds.x + label.bounds.width > body.bounds.x &&
        label.bounds.y < body.bounds.y + body.bounds.height &&
        label.bounds.y + label.bounds.height > body.bounds.y, body.id).toBe(false);
    }
    // Include the measured label in the viewport; a valid candidate must not
    // make it disappear beyond the drawing's exported bounds.
    expect(label.bounds.x).toBeGreaterThanOrEqual(0);
    expect(label.bounds.y).toBeGreaterThanOrEqual(0);
    expect(label.bounds.x + label.bounds.width).toBeLessThanOrEqual(prepared.viewport.width);
    expect(label.bounds.y + label.bounds.height).toBeLessThanOrEqual(prepared.viewport.height);
  });

  it('reports the owning edge when a degenerate route cannot place its label outside a body', () => {
    const graph: GraphIR = { version: '3.0.0', id: 'blocked-label', metadata: { notation: 'uml-class' },
      nodes: [{ id: 'left', type: 'class', position: { x: 0, y: 0 },
        classifier: { kind: 'class', name: 'Left', compartments: [] },
        dimensions: { width: 100, height: 60 } }],
      edges: [{ id: 'review', source: 'left', target: 'left', label: 'Review' }] };
    const original = structuredClone(graph);
    const edgeRoutes = new Map([['review', [{ startPoint: { x: 100, y: 30 },
      bendPoints: [], endPoint: { x: 100, y: 30 } }]]]);
    try {
      prepareSpatialScene028(graph, { style: 'hifi', edgeRoutes });
      expect.fail('An occluded label must not be published');
    } catch (error) {
      expect(error).toBeInstanceOf(RenderCapabilityError);
      expect((error as RenderCapabilityError).diagnostics).toEqual([
        expect.objectContaining({ code: 'render.capability.route',
          subject: { kind: 'edge', id: 'review' } }),
      ]);
    }
    expect(graph).toEqual(original);
  });

  it.each(['lowfi', 'hifi'] as const)(
    'keeps %s source classifier compartments inside the painted frame', (style) => {
      const source = readFileSync(new URL('../../browser/test/fixtures/acceptance028/uml-class-chain.coral',
        import.meta.url), 'utf8');
      const projected = projectInstalledSourceToSuccessor028(source).graph!;
      const graph = successorSourceDisplay028(projected);
      const prepared = prepareSpatialScene028(graph, { style, successorSource: projected });
      const frame = prepared.parts.find((part) => part.id === 'Middle:outline')!;
      expect(frame.geometry.kind).toBe('stencil-path');
      if (frame.geometry.kind !== 'stencil-path') return;
      const { x, y, scale } = frame.geometry.transform;
      const right = x + 100 * scale; const bottom = y + 60 * scale;
      const contents = prepared.parts.filter((part) => part.owner.kind === 'node' &&
        part.owner.id === 'Middle' &&
        (part.role === 'classifier-row' || part.role === 'classifier-separator' ||
          part.role === 'classifier-name'));
      expect(contents.length).toBeGreaterThan(2);
      for (const part of contents) {
        expect(part.bounds.x, part.id).toBeGreaterThanOrEqual(x - 0.01);
        expect(part.bounds.x + part.bounds.width, part.id).toBeLessThanOrEqual(right + 0.01);
        expect(part.bounds.y, part.id).toBeGreaterThanOrEqual(y - 0.01);
        expect(part.bounds.y + part.bounds.height, part.id).toBeLessThanOrEqual(bottom + 0.01);
      }
    });

  it('fits a tall source classifier with several rows inside its painted frame', () => {
    const source = '@diagram uml-class\nTall class {\n  operations {\n' +
      Array.from({ length: 7 }, (_, index) => `    + method${index + 1}(): Boolean\n`).join('') +
      '  }\n}\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const prepared = prepareSpatialScene028(successorSourceDisplay028(projected.graph!),
      { style: 'hifi', successorSource: projected.graph! });
    const frame = prepared.parts.find((part) => part.id === 'Tall:outline')!;
    expect(frame.geometry.kind).toBe('stencil-path');
    if (frame.geometry.kind !== 'stencil-path') return;
    const bottom = frame.geometry.transform.y + 60 * frame.geometry.transform.scale;
    const rows = prepared.parts.filter((part) => part.role === 'classifier-row');
    expect(rows).toHaveLength(7);
    expect(Math.max(...rows.map((part) => part.bounds.y + part.bounds.height)))
      .toBeLessThanOrEqual(bottom + 0.01);
  });

  it('diagnoses a hard-size classifier whose row cannot fit its visible frame', () => {
    const source = readFileSync(new URL('../../browser/test/fixtures/acceptance028/uml-class-chain.coral',
      import.meta.url), 'utf8');
    const projected = projectInstalledSourceToSuccessor028(source).graph!;
    const graph = successorSourceDisplay028(projected);
    const fixed = { ...graph, nodes: graph.nodes.map((node) => node.id === 'Middle'
      ? { ...node, dimensions: { width: 140, height: 80 } } : node) };
    expect(() => prepareSpatialScene028(fixed, { style: 'hifi', successorSource: projected }))
      .toThrow(/hard-size-text-conflict.*Middle/);
  });

  it('publishes named port contacts from resolved route geometry', () => {
    const portGraph: GraphIR = { ...drawing,
      nodes: drawing.nodes.map((node, index) => ({ ...node,
        ports: [{ id: index === 0 ? 'out' : 'in', direction: index === 0 ? 'out' : 'in' }] })),
      edges: [{ ...drawing.edges[0]!, sourcePort: 'out', targetPort: 'in' }] };
    const route = new Map([['next', [{ startPoint: { x: 150, y: 52 },
      bendPoints: [], endPoint: { x: 240, y: 70 } }]]]);
    const prepared = prepareSpatialScene028(portGraph, { style: 'hifi', edgeRoutes: route });
    const shaft = prepared.parts.find((part) => part.id === 'next:shaft')!;
    expect(shaft.geometry.kind).toBe('route');
    if (shaft.geometry.kind !== 'route') return;
    expect(prepared.portContacts.start?.out).toEqual(shaft.geometry.points[0]);
    expect(prepared.portContacts.check?.in).toEqual(shaft.geometry.points.at(-1));
  });

  it('publishes idle catalog contacts on the fitted visible contour', () => {
    const prepared = prepareSpatialScene028({ ...drawing, edges: [] }, { style: 'hifi' });
    const check = prepared.nodes.find((node) => node.node.id === 'check')!;
    const shift = prepared.viewport;
    expect(prepared.portContacts.check?.in).toEqual({
      x: check.x + shift.shiftX + check.width / 2,
      y: check.y + shift.shiftY,
    });
    expect(prepared.portContacts.check?.no).toEqual({
      x: check.x + shift.shiftX + (check.width + check.height) / 2,
      y: check.y + shift.shiftY + check.height / 2,
    });
    expect(prepared.portContacts.start?.out).toBeDefined();
    expect(JSON.parse(JSON.stringify(prepared.portContacts))).toEqual(prepared.portContacts);
  });

  it('projects unconnected source-owned exact and free semantic ports into the scene', () => {
    const projected = projectInstalledSourceToSuccessor028(readFileSync(new URL(
      '../../browser/test/fixtures/acceptance028/block-idle-anchors.coral', import.meta.url), 'utf8'));
    expect(projected.diagnostics).toEqual([]);
    const source = projected.graph!;
    const { display } = successorSourceDisplayWithSemanticPorts028(source);
    const scene = prepareSpatialScene028({ ...display, nodes: display.nodes.map((node) => ({
      ...node, position: { x: 20, y: 30 }, dimensions: { width: 160, height: 80 },
    })) }, { style: 'hifi', successorSource: source });
    const placed = scene.nodes.find((node) => node.node.id === 'unit')!;
    const left = placed.x + scene.viewport.shiftX;
    const top = placed.y + scene.viewport.shiftY;
    expect(scene.portContacts.unit?.north).toEqual({ x: left + 80, y: top });
    expect(scene.portContacts.unit?.flexible?.x).toBeGreaterThan(left + 80);
    expect(scene.portContacts.unit?.flexible?.x).toBeLessThan(left + 160);
    expect(scene.portContacts.unit?.flexible?.y).toBe(top + 40);
    expect(scene.portContacts.unit?.automatic?.x).toBeGreaterThan(left);
    expect(scene.portContacts.unit?.automatic?.x).toBeLessThan(left + 80);
    expect(scene.portContacts.unit?.automatic?.y).toBe(top + 40);
    const corner = scene.portContacts.unit?.cornerPin;
    expect(corner).toBeDefined();
    expect(corner!.x).toBeGreaterThan(left + 100);
    expect(corner!.y).toBeLessThan(top + 25);
    expect(source.nodes[0]?.semanticPorts?.map((port) => port.anchor)).toEqual([
      { kind: 'exact', position: 'N' }, { kind: 'side' },
      { kind: 'corner' }, { kind: 'auto' },
    ]);
    expect(display.nodes[0]?.ports).toBeUndefined();
    const down = prepareSpatialScene028({ ...display, nodes: display.nodes.map((node) => ({
      ...node, position: { x: 20, y: 30 }, dimensions: { width: 160, height: 80 },
    })) }, { style: 'hifi', successorSource: source, layoutDirection: 'DOWN' });
    const downTop = down.nodes[0]!.y + down.viewport.shiftY;
    expect(down.portContacts.unit?.flexible?.y).toBe(downTop + 80);
    expect(down.portContacts.unit?.automatic?.y).toBe(downTop);
    expect(down.revision).not.toBe(scene.revision);
  });

  it.each(['lowfi', 'hifi'] as const)('keeps the authored right alias as an exact E pin in %s across directions', (style) => {
    const source = projectInstalledSourceToSuccessor028('@diagram architecture\napi service {\n' +
      '  audit port [direction: out, anchor: right]\n}\n').graph!;
    const original = JSON.stringify(source);
    const { display } = successorSourceDisplayWithSemanticPorts028(source);
    for (const layoutDirection of ['RIGHT', 'DOWN'] as const) {
      const scene = prepareSpatialScene028({ ...display, nodes: display.nodes.map((node) => ({
        ...node, position: { x: 20, y: 30 }, dimensions: { width: 160, height: 80 },
      })) }, { style, successorSource: source, layoutDirection });
      const placed = scene.nodes[0]!;
      const fit = stencilFit028(shapeRegistry.get('rectangle')!, placed.width, placed.height);
      expect(scene.portContacts.api?.audit).toEqual({
        x: placed.x + scene.viewport.shiftX + fit.offsetX + fit.fittedWidth,
        y: placed.y + scene.viewport.shiftY + placed.height / 2,
      });
      expect(JSON.stringify(source)).toBe(original);
    }
    expect(source.nodes[0]!.semanticPorts![0]).toEqual({ id: 'audit', direction: 'out',
      anchor: { kind: 'exact', position: 'E' } });
  });

  it.each(['lowfi', 'hifi'] as const)('keeps an exact source NE pin on the rounded task contour in %s', (style) => {
    const source = projectInstalledSourceToSuccessor028('@diagram bpmn\nwork task {\n' +
      '  audit port [direction: out, anchor: NE]\n}\n').graph!;
    const { display } = successorSourceDisplayWithSemanticPorts028(source);
    for (const layoutDirection of ['RIGHT', 'DOWN'] as const) {
      const scene = prepareSpatialScene028({ ...display, nodes: display.nodes.map((node) => ({
        ...node, position: { x: 20, y: 30 }, dimensions: { width: 160, height: 80 },
      })) }, { style, successorSource: source, layoutDirection });
      const placed = scene.nodes[0]!;
      const contact = scene.portContacts.work?.audit;
      expect(contact).toBeDefined();
      expect(contact!.x).toBeLessThan(placed.x + scene.viewport.shiftX + placed.width);
      expect(contact!.y).toBeGreaterThan(placed.y + scene.viewport.shiftY);
      expect(contact!.x).toBeGreaterThan(placed.x + scene.viewport.shiftX + placed.width / 2);
      expect(contact!.y).toBeLessThan(placed.y + scene.viewport.shiftY + placed.height / 2);
      expect(source.nodes[0]!.semanticPorts![0].anchor).toEqual({ kind: 'exact', position: 'NE' });
    }
  });

  it('keeps source-owned BPMN event contacts on the painted ring', () => {
    const source = projectInstalledSourceToSuccessor028(
      '@diagram bpmn\nstart startEvent as "Start"\n').graph!;
    const { display } = successorSourceDisplayWithSemanticPorts028(source);
    const scene = prepareSpatialScene028({ ...display, nodes: display.nodes.map((node) => ({
      ...node, position: { x: 10, y: 20 }, dimensions: { width: 120, height: 120 },
    })) }, { style: 'hifi', successorSource: source });
    const placed = scene.nodes[0]!;
    expect(scene.portContacts.start?.out).toEqual({
      x: placed.x + scene.viewport.shiftX + (placed.width - 56) / 2 + 52,
      y: placed.y + scene.viewport.shiftY + 32,
    });
  });

  it('translates a nested source port through its parent coordinate frame', () => {
    const source = projectInstalledSourceToSuccessor028(
      '@diagram architecture\nteam group {\n' +
      '  api service {\n    audit port [direction: out, anchor: side]\n  }\n}\n').graph!;
    const { display } = successorSourceDisplayWithSemanticPorts028(source);
    const positioned = (parentX: number, parentY: number) => ({ ...display,
      nodes: [{ ...display.nodes[0]!, position: { x: parentX, y: parentY },
        children: [{ ...display.nodes[0]!.children![0]!, position: { x: 40, y: 30 } }] }],
    });
    const first = prepareSpatialScene028(positioned(100, 70), {
      successorSource: source, semanticGraph: display, style: 'hifi',
    });
    const moved = prepareSpatialScene028(positioned(175, 90), {
      successorSource: source, semanticGraph: display, style: 'hifi',
    });
    expect(first.nodes.find((node) => node.node.id === 'team.api')).toMatchObject({ x: 140, y: 100 });
    expect(moved.nodes.find((node) => node.node.id === 'team.api')).toMatchObject({ x: 215, y: 120 });
    const firstContact = first.portContacts['team.api']?.audit;
    const movedContact = moved.portContacts['team.api']?.audit;
    if (!firstContact || !movedContact) throw new Error('missing nested audit port contact');
    expect(movedContact.x - moved.viewport.shiftX - firstContact.x + first.viewport.shiftX)
      .toBeCloseTo(75, 6);
    expect(movedContact.y - moved.viewport.shiftY - firstContact.y + first.viewport.shiftY)
      .toBeCloseTo(20, 6);
    expect(source.nodes[0]?.children?.[0]?.semanticPorts?.find((port) => port.id === 'audit')?.anchor)
      .toEqual({ kind: 'side' });
  });

  it('keeps a routed semantic port contact across a source group boundary', async () => {
    const sourceText = '@diagram architecture\nteam group {\n  api service {\n' +
      '    audit port [direction: out, anchor: side]\n  }\n}\nstore database\n' +
      'read = team.api:audit -> store:query [reads]\n';
    const source = projectInstalledSourceToSuccessor028(sourceText).graph!;
    const original = JSON.stringify(source);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(source);
    for (const direction of ['RIGHT', 'DOWN'] as const) {
      const graph = await layoutGraphForSvg(display, { direction, semanticInterpretations });
      const scene = prepareSpatialScene028(graph, { style: 'hifi', successorSource: source,
        semanticGraph: display, edgeRoutes: graph.edgeRoutes, layoutDirection: direction });
      const shaft = scene.parts.find((part) => part.id === 'read:shaft')!;
      expect(shaft.geometry.kind).toBe('route');
      if (shaft.geometry.kind !== 'route') throw new Error('missing cross-boundary route');
      expect(scene.portContacts['team.api']?.audit).toEqual(shaft.geometry.points[0]);
      expect(scene.portContacts.store?.query).toEqual(shaft.geometry.points.at(-1));
      expect(scene.semantic.successorSource).toEqual(source);
      expect(JSON.stringify(source)).toBe(original);
    }
  });

  it('uses a connected source port route without moving its idle sibling or authored anchor', () => {
    const projected = projectInstalledSourceToSuccessor028(
      '@diagram block\nunit block {\n' +
      '  send port [direction: out, anchor: side]\n' +
      '  spare port [direction: out, anchor: N]\n}\n' +
      'peer block\nlink = unit:send -> peer:input\n');
    expect(projected.diagnostics).toEqual([]);
    const source = projected.graph!;
    const { display } = successorSourceDisplayWithSemanticPorts028(source);
    const graph = { ...display, nodes: display.nodes.map((node, index) => ({
      ...node, position: { x: index * 250 + 10, y: 20 },
      dimensions: { width: 120, height: 80 },
    })) };
    const idle = prepareSpatialScene028(graph, { successorSource: source, style: 'hifi' });
    const routed = prepareSpatialScene028(graph, { successorSource: source, style: 'hifi',
      edgeRoutes: new Map([['link', [{ startPoint: { x: 130, y: 60 },
        bendPoints: [], endPoint: { x: 260, y: 60 } }]]]) });
    const shaft = routed.parts.find((part) => part.id === 'link:shaft')!;
    expect(shaft.geometry.kind).toBe('route');
    if (shaft.geometry.kind !== 'route') return;
    expect(routed.portContacts.unit?.send).toEqual(shaft.geometry.points[0]);
    expect(routed.portContacts.unit?.spare).toEqual(idle.portContacts.unit?.spare);
    expect(source.nodes[0]?.semanticPorts?.map((port) => port.anchor)).toEqual([
      { kind: 'side' }, { kind: 'exact', position: 'N' },
    ]);
  });

  it('reports an unsupported source anchor against its semantic port', () => {
    const source = projectInstalledSourceToSuccessor028(
      '@diagram block\nunit block {\n' +
      '  audit port [direction: out, anchor: missingPin]\n}\n').graph!;
    const { display } = successorSourceDisplayWithSemanticPorts028(source);
    try {
      prepareSpatialScene028(display, { successorSource: source });
      throw new Error('The missing named anchor unexpectedly rendered');
    } catch (error) {
      expect(error).toBeInstanceOf(RenderCapabilityError);
      expect((error as RenderCapabilityError).diagnostics).toEqual([
        expect.objectContaining({ code: 'coral.port.anchor.symbol-unknown',
          subject: { kind: 'port', id: 'unit:audit' } }),
      ]);
    }
  });

  it('rejects a drawing symbol that differs from the source-owned selection', () => {
    const source = projectInstalledSourceToSuccessor028('@diagram block\nunit block\n').graph!;
    const { display } = successorSourceDisplayWithSemanticPorts028(source);
    const drawing = { ...display, nodes: display.nodes.map((node) => ({ ...node,
      type: 'unrelated', position: { x: 10, y: 20 },
      dimensions: { width: 120, height: 80 },
    })) };
    expect(() => prepareSpatialScene028(drawing, { successorSource: source,
      semanticGraph: display })).toThrow(/semantic-manifest.*unit.*symbol/);
  });

  it('respects explicit geometric port positions and complete empty port lists', () => {
    const graph: GraphIR = { ...drawing, edges: [], nodes: [
      { ...drawing.nodes[0]!, ports: [{ id: 'audit', side: 'EAST', position: 0.25 }] },
      { ...drawing.nodes[1]!, ports: [] },
    ] };
    const prepared = prepareSpatialScene028(graph, { style: 'lowfi' });
    const start = prepared.nodes.find((node) => node.node.id === 'start')!;
    expect(prepared.portContacts.start?.audit).toEqual({
      x: start.x + prepared.viewport.shiftX + start.width,
      y: start.y + prepared.viewport.shiftY + start.height * 0.25,
    });
    expect(prepared.portContacts.check).toBeUndefined();
    const changed = structuredClone(graph);
    changed.nodes[0]!.ports![0]!.position = 0.75;
    expect(prepareSpatialScene028(changed, { style: 'lowfi' }).revision)
      .not.toBe(prepared.revision);
  });

  it('publishes the connector hit width with its scene route', () => {
    const scene = prepareSpatialScene028({ ...drawing,
      edges: [{ id: 'plain', source: 'start', target: 'check' }] }, { style: 'hifi' });
    const shaft = scene.parts.find((part) => part.id === 'plain:shaft')!;
    expect(shaft.geometry.kind).toBe('route');
    if (shaft.geometry.kind !== 'route') return;
    expect(shaft.geometry.hitStrokeWidth).toBe(20);
    const hit = scene.ownerLookup.hitBounds['edge:plain']!;
    expect(hit.x).toBeLessThanOrEqual(shaft.bounds.x - shaft.geometry.hitStrokeWidth / 2);
    expect(hit.y).toBeLessThanOrEqual(shaft.bounds.y - shaft.geometry.hitStrokeWidth / 2);
  });

  it('diagnoses two routes that disagree on one named port contact', () => {
    const graph: GraphIR = { ...drawing, nodes: drawing.nodes.map((node, index) => ({ ...node,
      ports: index === 0 ? [{ id: 'out', direction: 'out' }] : [] })),
    edges: [
      { id: 'first', source: 'start', target: 'check', sourcePort: 'out' },
      { id: 'second', source: 'start', target: 'check', sourcePort: 'out' },
    ] };
    const routes = new Map([
      ['first', [{ startPoint: { x: 150, y: 45 }, bendPoints: [], endPoint: { x: 240, y: 45 } }]],
      ['second', [{ startPoint: { x: 150, y: 60 }, bendPoints: [], endPoint: { x: 240, y: 60 } }]],
    ]);
    expect(() => prepareSpatialScene028(graph, { edgeRoutes: routes }))
      .toThrow(/port start:out has conflicting routed contacts/);
  });

  it('moves a transient connector using the same scene primitives', () => {
    const scene = prepareSpatialScene028({ ...drawing, edges: [{ ...drawing.edges[0]!,
      sourceEnd: { role: 'users' }, targetEnd: { multiplicity: '1' } }] }, { style: 'hifi' });
    const parts = scene.parts.filter((part) => part.owner.kind === 'edge');
    const shaft = parts.find((part) => part.role === 'edge-shaft')!;
    expect(shaft.geometry.kind).toBe('route');
    if (shaft.geometry.kind !== 'route') return;
    const first = shaft.geometry.points[0]!;
    const last = shaft.geometry.points.at(-1)!;
    const moved = retargetSpatialEdgeParts028(parts,
      [{ x: first.x + 12, y: first.y + 8 }, { x: last.x + 28, y: last.y + 8 }], 'hifi');
    const movedShaft = moved.find((part) => part.role === 'edge-shaft')!;
    expect(movedShaft.geometry.kind).toBe('route');
    if (movedShaft.geometry.kind !== 'route') return;
    expect(movedShaft.geometry.points[0]).toEqual({ x: first.x + 12, y: first.y + 8 });
    expect(movedShaft.geometry.d).toContain(`M${first.x + 12} ${first.y + 8}`);
    expect(moved.find((part) => part.role === 'target-marker')?.geometry).toMatchObject({
      contact: { x: last.x + 28, y: last.y + 8 },
    });
    expect(moved.find((part) => part.role === 'edge-label')?.bounds.x)
      .not.toBe(parts.find((part) => part.role === 'edge-label')?.bounds.x);
    const sourceLabel = parts.find((part) => part.role === 'endpoint-label' &&
      part.geometry.kind === 'text' && part.geometry.endpoint === 'source')!;
    const movedSourceLabel = moved.find((part) => part.id === sourceLabel.id)!;
    expect(movedSourceLabel.bounds.x - sourceLabel.bounds.x).toBe(12);
    expect(movedSourceLabel.bounds.y - sourceLabel.bounds.y).toBe(8);
    expect(shaft.geometry.points[0]).toEqual(first);
  });

  it('supports unique DOM scopes while standalone output remains reproducible', () => {
    const first = renderSvg(drawing, { style: 'hifi', semanticGraph: authored,
      domIdNamespace: 'first' });
    const second = renderSvg(drawing, { style: 'hifi', semanticGraph: authored,
      domIdNamespace: 'second' });
    const marker = (svg: string) => svg.match(/<marker id="([^"]+)"/)?.[1];
    expect(marker(first)).toBeDefined();
    expect(marker(second)).toBeDefined();
    expect(marker(first)).not.toBe(marker(second));
    expect(first).toContain(`marker-end="url(#${marker(first)})"`);
    expect(second).toContain(`marker-end="url(#${marker(second)})"`);
    expect(first).toContain('data-coral-part-id="next:target-marker"');
    expect(second).toContain('data-coral-part-id="next:target-marker"');
    expect(renderSvg(drawing, { style: 'hifi', domIdNamespace: 'stable' }))
      .toBe(renderSvg(drawing, { style: 'hifi', domIdNamespace: 'stable' }));
    expect(renderSvg(drawing, { style: 'hifi' }))
      .toBe(renderSvg(drawing, { style: 'hifi' }));
  });

  it('uses one dark-theme palette for the prepared scene and SVG projector', () => {
    const prepared = prepareSpatialScene028(drawing, { style: 'hifi', theme: 'dark' });
    const outline = prepared.parts.find((part) => part.id === 'start:outline');
    const label = prepared.parts.find((part) => part.id === 'start:label:1');
    expect(outline?.geometry.kind === 'stencil-path' && outline.geometry.stroke)
      .toBe('#f1f5f9');
    expect(label?.geometry.kind === 'text' && label.geometry.fill).toBe('#f1f5f9');
    const svg = renderSvg(drawing, { style: 'hifi', theme: 'dark' });
    expect(svg).toContain('fill="#1e1e1e"');
    expect(svg).toContain('stroke="#f1f5f9"');
  });

  it('attaches an unpinned connector to the visible fitted diamond contour', () => {
    const route = new Map([['next', [{ startPoint: { x: 150, y: 70 },
      bendPoints: [], endPoint: { x: 240, y: 70 } }]]]);
    const prepared = prepareSpatialScene028(drawing, {
      style: 'lowfi', semanticGraph: authored, edgeRoutes: route,
    });
    const end = prepared.resolved.edges[0]!.points.at(-1)!;
    expect(end.x).toBe(265); // 150px box with a centered 100px diamond.
    expect(end.y).toBe(70);
  });

  it('reserves a square diamond for measured decision text', () => {
    const dimensions = measureSvgNode({ ...authored.nodes[1]!, label: 'Approved for release?' },
      { style: 'lowfi', notation: 'flowchart' });
    expect(dimensions.width).toBe(dimensions.height);
    expect(dimensions.width).toBeGreaterThan(100);
  });

  it('uses the approved BPMN ring and keeps its caption outside the contact circle', () => {
    const bpmn: GraphIR = { version: '3.0.0', id: 'process',
      metadata: { notation: 'bpmn' }, nodes: [
        { id: 'received', type: 'startEvent', label: 'received',
          position: { x: 20, y: 20 } },
        { id: 'work', type: 'task', label: 'work', position: { x: 240, y: 20 } },
      ], edges: [{ id: 'flow', source: 'received', target: 'work' }] };
    const prepared = prepareSpatialScene028(bpmn, { style: 'lowfi' });
    const ring = prepared.parts.find((part) => part.id === 'received:outline')!;
    const caption = prepared.parts.find((part) => part.id === 'received:label:1')!;
    expect(ring.bounds.width).toBe(56);
    expect(ring.bounds.height).toBe(56);
    expect(caption.bounds.y).toBeGreaterThan(ring.bounds.y + 48);
    const node = prepared.resolved.nodes.find((item) => item.id === 'received')!;
    const center = { x: node.x + node.width / 2, y: node.y + 32 };
    const contact = prepared.resolved.edges[0]!.points[0]!;
    expect(Math.hypot(contact.x - center.x, contact.y - center.y)).toBeCloseTo(24, 5);
    expect(ring.geometry.kind === 'stencil-path' && ring.geometry.d)
      .toContain('M52 26.5 C53 41.9');
  });

  it('uses authored source direction for the BPMN Sequence Flow head', () => {
    const bpmn: GraphIR = { version: '3.0.0', id: 'process',
      metadata: { notation: 'bpmn' }, nodes: [
        { id: 'received', type: 'startEvent', label: 'received' },
        { id: 'work', type: 'task', label: 'work' },
      ], edges: [{ id: 'flow', source: 'received', target: 'work',
        targetEnd: { marker: { kind: 'arrow', fill: 'open' } } }] };
    const sourceDirections = new Map([['flow', 'first-to-second' as const]]);
    const prepared = prepareSpatialScene028(bpmn, { style: 'hifi', sourceDirections });
    expect(prepared.resolved.edges[0]?.target.marker)
      .toEqual({ kind: 'triangle', fill: 'filled' });
    expect(bpmn.edges[0]?.targetEnd?.marker).toEqual({ kind: 'arrow', fill: 'open' });
    expect(prepared.parts.find((part) => part.id === 'flow:target-marker')?.geometry)
      .toMatchObject({ kind: 'marker', marker: { kind: 'triangle', fill: 'filled' } });
  });

  it('retains successor source meaning beside the display geometry', () => {
    const source = projectInstalledSourceToSuccessor028(
      '@diagram bpmn\nreceived startEvent\nwork task\nflow = received -> work\n').graph!;
    const display = successorSourceDisplay028(source);
    const prepared = prepareSpatialScene028(display, {
      style: 'hifi', semanticGraph: display, successorSource: source,
    });
    expect(prepared.semantic.sourceKind).toBe('successor-source');
    expect(prepared.semantic.successorSource?.edges[0]).toMatchObject({
      id: 'flow', first: { node: 'received' }, second: { node: 'work' },
      direction: 'first-to-second',
    });
    expect(prepared.resolved.edges[0]?.target.marker)
      .toEqual({ kind: 'triangle', fill: 'filled' });
    expect(() => prepareSpatialScene028(display, { successorSource: source,
      sourceDirections: new Map([['flow', 'none' as const]]) }))
      .toThrow(/source direction sidecar differs/);
  });

  it.each(['lowfi', 'hifi'] as const)('keeps the BPMN gateway X inside its diamond in %s',
    (style) => {
      const source = projectInstalledSourceToSuccessor028(
        readFileSync(new URL('../../browser/test/fixtures/acceptance028/bpmn-branch.coral',
          import.meta.url), 'utf8')).graph!;
      const display = successorSourceDisplay028(source);
      const prepared = prepareSpatialScene028(display,
        { style, semanticGraph: display, successorSource: source });
      const node = prepared.nodes.find((item) => item.node.id === 'approved')!;
      const marker = prepared.parts.find((part) => part.id === 'approved:symbol-marker:1')!;
      const label = prepared.parts.find((part) => part.id === 'approved:label:1')!;
      const frame = bpmnGatewayFrame028(node.width, node.height);
      const centerX = node.x + prepared.viewport.shiftX + frame.x + frame.width / 2;
      const centerY = node.y + prepared.viewport.shiftY + frame.y + frame.height / 2;
      expect(marker.bounds.x + marker.bounds.width / 2).toBeCloseTo(centerX);
      expect(marker.bounds.y + marker.bounds.height / 2).toBeCloseTo(centerY);
      expect(label.bounds.y).toBeGreaterThan(
        node.y + prepared.viewport.shiftY + frame.y + frame.height + 4);
      for (const x of [marker.bounds.x, marker.bounds.x + marker.bounds.width]) {
        for (const y of [marker.bounds.y, marker.bounds.y + marker.bounds.height]) {
          const contourScore = Math.abs(x - centerX) / (frame.width / 2) +
            Math.abs(y - centerY) / (frame.height / 2);
          expect(contourScore).toBeLessThan(0.9);
        }
      }
    });

  it.each(['bpmn-gateway-exclusive', 'bpmn-gateway-parallel',
    'bpmn-gateway-inclusive', 'bpmn-gateway-event'] as const)(
    'centers the %s marker and puts its caption beneath a compact diamond', (symbol) => {
      const dimensions = measureSvgNode({ id: 'gateway', type: 'gateway', symbol,
        label: 'G' }, { style: 'hifi', notation: 'bpmn' });
      const prepared = prepareSpatialScene028({
        metadata: { notation: 'bpmn' },
        nodes: [{ id: 'gateway', type: 'gateway', symbol, label: 'G',
          position: { x: 10, y: 10 }, dimensions }],
        edges: [],
      }, { style: 'hifi' });
      const marker = prepared.parts.find((part) => part.role === 'symbol-marker')!;
      const caption = prepared.parts.find((part) => part.id === 'gateway:label:1')!;
      const frame = bpmnGatewayFrame028(dimensions.width, dimensions.height);
      const centerX = 10 + prepared.viewport.shiftX + frame.x + frame.width / 2;
      const centerY = 10 + prepared.viewport.shiftY + frame.y + frame.height / 2;
      expect(marker.bounds.x + marker.bounds.width / 2).toBeCloseTo(centerX);
      expect(marker.bounds.y + marker.bounds.height / 2).toBeCloseTo(centerY);
      expect(marker.bounds.width).toBe(24);
      expect(caption.bounds.y).toBeGreaterThan(centerY + frame.height / 2 + 4);
    });

  it.each(['lowfi', 'hifi'] as const)(
    'reserves a multiline BPMN gateway caption on a DOWN source flow in %s',
    async (style) => {
      const source = projectInstalledSourceToSuccessor028(
        '@diagram bpmn\nchoice exclusiveGateway as "Review\\ncustomer\\naccount\\nstatus"\n' +
        'work task\nchoice -> work\n').graph!;
      const display = successorSourceDisplay028(source);
      const laid = await layoutGraphForSvg(display, {
        direction: 'DOWN', svgOptions: { style },
      });
      const prepared = prepareSpatialScene028(laid, { style,
        layoutDirection: 'DOWN', edgeRoutes: laid.edgeRoutes,
        semanticGraph: display, successorSource: source });
      const captions = prepared.parts.filter((part) => part.id.startsWith('choice:label:'));
      const task = prepared.parts.find((part) => part.id === 'work:outline')!;
      const flow = prepared.parts.find((part) => part.role === 'edge-shaft')!;
      const gateway = prepared.nodes.find((item) => item.node.id === 'choice')!;
      const frame = bpmnGatewayFrame028(gateway.width, gateway.height, 'DOWN');
      const start = flow.geometry.kind === 'route' ? flow.geometry.points[0]! : undefined;
      const centerX = gateway.x + prepared.viewport.shiftX + frame.x + frame.width / 2;
      const centerY = gateway.y + prepared.viewport.shiftY + frame.y + frame.height / 2;
      expect(start).toBeDefined();
      expect(Math.abs(start!.x - centerX) / (frame.width / 2) +
        Math.abs(start!.y - centerY) / (frame.height / 2)).toBeCloseTo(1, 1);
      const overlap = (left: typeof task.bounds, right: typeof task.bounds) =>
        left.x < right.x + right.width && right.x < left.x + left.width &&
        left.y < right.y + right.height && right.y < left.y + left.height;
      expect(captions).toHaveLength(4);
      for (const caption of captions) {
        expect(overlap(caption.bounds, task.bounds)).toBe(false);
        expect(overlap(caption.bounds, flow.bounds)).toBe(false);
      }
    });

  it.each([['RIGHT', 'lowfi'], ['RIGHT', 'hifi'],
    ['DOWN', 'lowfi'], ['DOWN', 'hifi']] as const)(
    'keeps a source BPMN gateway named port on its diamond in %s/%s',
    async (direction, style) => {
      const source = projectInstalledSourceToSuccessor028(
        '@diagram bpmn\nchoice exclusiveGateway {\n' +
        '  send port [direction: out, anchor: E]\n}\n' +
        'work task\nchoice:send -> work\n').graph!;
      const { display, semanticInterpretations } =
        successorSourceDisplayWithSemanticPorts028(source);
      const laid = await layoutGraphForSvg(display, { direction,
        svgOptions: { style }, semanticInterpretations });
      const prepared = prepareSpatialScene028(laid, { style,
        layoutDirection: direction, edgeRoutes: laid.edgeRoutes,
        semanticGraph: display, successorSource: source });
      const gateway = prepared.nodes.find((item) => item.node.id === 'choice')!;
      const frame = bpmnGatewayFrame028(gateway.width, gateway.height, direction);
      const flow = prepared.parts.find((part) => part.role === 'edge-shaft')!;
      const start = flow.geometry.kind === 'route' ? flow.geometry.points[0]! : undefined;
      const centerX = gateway.x + prepared.viewport.shiftX + frame.x + frame.width / 2;
      const centerY = gateway.y + prepared.viewport.shiftY + frame.y + frame.height / 2;
      expect(start).toBeDefined();
      expect(Math.abs(start!.x - centerX) / (frame.width / 2) +
        Math.abs(start!.y - centerY) / (frame.height / 2)).toBeCloseTo(1, 2);
      expect(prepared.portContacts.choice?.send).toEqual(start);
    });

  it.each([['free', 'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM'],
    ['east-port', 'Decision']] as const)(
    'keeps every DOWN gateway shaft segment out of the %s caption', async (portKind, label) => {
      const quoted = JSON.stringify(label);
      const sourceText = portKind === 'east-port'
        ? `@diagram bpmn\nchoice exclusiveGateway as ${quoted} {\n` +
          '  send port [direction: out, anchor: E]\n}\nwork task\nchoice:send -> work\n'
        : `@diagram bpmn\nchoice exclusiveGateway as ${quoted}\n` +
          'work task\nchoice -> work\n';
      const source = projectInstalledSourceToSuccessor028(sourceText).graph!;
      const { display, semanticInterpretations } =
        successorSourceDisplayWithSemanticPorts028(source);
      for (const style of ['lowfi', 'hifi'] as const) {
        const laid = await layoutGraphForSvg(display, { direction: 'DOWN',
          svgOptions: { style }, semanticInterpretations });
        const prepared = prepareSpatialScene028(laid, { style,
          layoutDirection: 'DOWN', edgeRoutes: laid.edgeRoutes,
          semanticGraph: display, successorSource: source });
        const shaft = prepared.parts.find((part) => part.role === 'edge-shaft')!;
        expect(shaft.geometry.kind).toBe('route');
        if (shaft.geometry.kind !== 'route') continue;
        const points = shaft.geometry.points;
        for (const caption of prepared.parts.filter((part) =>
          part.id.startsWith('choice:label:'))) {
          const { x, y, width, height } = caption.bounds;
          const inside = (point: { x: number; y: number }) =>
            point.x > x && point.x < x + width &&
            point.y > y && point.y < y + height;
          for (let index = 1; index < points.length; index += 1) {
            const a = points[index - 1]!; const b = points[index]!;
            const steps = 64;
            for (let step = 0; step <= steps; step += 1) {
              const ratio = step / steps;
              expect(inside({ x: a.x + (b.x - a.x) * ratio,
                y: a.y + (b.y - a.y) * ratio }),
              `${portKind}/${style} shaft ${index - 1} crosses caption`).toBe(false);
            }
          }
        }
      }
    });

  it.each([
    ['DOWN', 'E', 'incoming'], ['UP', 'E', 'incoming'],
    ['RIGHT', 'S', 'outgoing'], ['LEFT', 'S', 'outgoing'],
  ] as const)('keeps a %s gateway %s-port %s shaft clear of its caption',
    async (direction, anchor, relation) => {
      const source = projectInstalledSourceToSuccessor028(
        '@diagram bpmn\nchoice exclusiveGateway as "Decision" {\n' +
        `  send port [direction: ${relation === 'incoming' ? 'in' : 'out'}, anchor: ${anchor}]\n` +
        '}\nwork task\n' +
        (relation === 'incoming' ? 'work -> choice:send\n' : 'choice:send -> work\n')).graph!;
      const { display, semanticInterpretations } =
        successorSourceDisplayWithSemanticPorts028(source);
      for (const style of ['lowfi', 'hifi'] as const) {
        const laid = await layoutGraphForSvg(display, { direction,
          svgOptions: { style }, semanticInterpretations });
        const prepared = prepareSpatialScene028(laid, { style,
          layoutDirection: direction, edgeRoutes: laid.edgeRoutes,
          semanticGraph: display, successorSource: source });
        const shaft = prepared.parts.find((part) => part.role === 'edge-shaft')!;
        if (shaft.geometry.kind !== 'route') throw new Error('missing gateway shaft');
        const points = shaft.geometry.points;
        expect(prepared.portContacts.choice?.send).toEqual(
          relation === 'incoming' ? points.at(-1) : points[0]);
        for (const caption of prepared.parts.filter((part) =>
          part.id.startsWith('choice:label:'))) {
          const { x, y, width, height } = caption.bounds;
          for (let index = 1; index < points.length; index += 1) {
            const a = points[index - 1]!; const b = points[index]!;
            for (let step = 0; step <= 64; step += 1) {
              const ratio = step / 64;
              const px = a.x + (b.x - a.x) * ratio;
              const py = a.y + (b.y - a.y) * ratio;
              expect(px > x && px < x + width && py > y && py < y + height,
                `${direction}/${anchor}/${relation}/${style} shaft crosses caption`).toBe(false);
            }
          }
        }
      }
    });

  it.each(['lowfi', 'hifi'] as const)(
    'keeps a DOWN self gateway %s route outside its caption and marker', async (style) => {
      const source = projectInstalledSourceToSuccessor028(
        '@diagram bpmn\nchoice exclusiveGateway {\n' +
        '  send port [direction: out, anchor: W]\n' +
        '  receive port [direction: in, anchor: E]\n' +
        '}\nchoice:send -> choice:receive\n').graph!;
      const { display, semanticInterpretations } =
        successorSourceDisplayWithSemanticPorts028(source);
      const laid = await layoutGraphForSvg(display, { direction: 'DOWN',
        svgOptions: { style }, semanticInterpretations });
      const prepared = prepareSpatialScene028(laid, { style,
        layoutDirection: 'DOWN', edgeRoutes: laid.edgeRoutes,
        semanticGraph: display, successorSource: source });
      const shaft = prepared.parts.find((part) => part.role === 'edge-shaft')!;
      if (shaft.geometry.kind !== 'route') throw new Error('missing self shaft');
      const points = shaft.geometry.points;
      expect(prepared.portContacts.choice?.send).toEqual(points[0]);
      expect(prepared.portContacts.choice?.receive).toEqual(points.at(-1));
      const forbidden = prepared.parts.filter((part) =>
        part.id.startsWith('choice:label:') || part.role === 'symbol-marker');
      for (const part of forbidden) {
        const { x, y, width, height } = part.bounds;
        for (let index = 1; index < points.length; index += 1) {
          const a = points[index - 1]!; const b = points[index]!;
          for (let step = 0; step <= 64; step += 1) {
            const ratio = step / 64;
            const px = a.x + (b.x - a.x) * ratio;
            const py = a.y + (b.y - a.y) * ratio;
            expect(px > x && px < x + width && py > y && py < y + height,
              `${style} self shaft crosses ${part.id}`).toBe(false);
          }
        }
      }
    });
});
