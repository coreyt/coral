import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { renderSvg } from '../src/index.js';
import { bpmnEventCaptionBox028, bpmnEventFrame028 } from '../src/bpmnEventVisual028.js';
import { bpmnGatewayFrame028 } from '../src/bpmnGatewayVisual028.js';
import { notationCatalogIdentity028 } from '../src/notations/index.js';
import { resolveSuccessorGraphNodes028 } from '../src/successorInterpretation028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';

/** One layout-for-SVG projection shared by MCP and the browser package (Slice 80). */

const flow: GraphIR = {
  version: '3.0.0', id: 'flow', name: 'Flow',
  nodes: [
    { id: 'group', type: 'group', label: 'Group', children: [{ id: 'inner', type: 'service', label: 'Inner' }] },
    { id: 'db', type: 'database', label: 'DB' },
  ],
  edges: [{ id: 'e1', source: 'inner', target: 'db', type: 'flow' }],
} as GraphIR;

describe('layoutGraphForSvg', () => {
  it('keeps a BPMN return loop beside the painted gateway', async () => {
    const source = readFileSync(new URL('fixtures/acceptance028/bpmn-loop.coral',
      new URL('../../browser/test/', import.meta.url)), 'utf8');
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const { display, semanticInterpretations } =
      successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const laid = await layoutGraphForSvg(display, {
      direction: 'DOWN', svgOptions: { style: 'hifi', notation: 'bpmn' },
      semanticInterpretations,
    });
    const edge = laid.edges.find((candidate) => candidate.source === 'revise' &&
      candidate.target === 'check')!;
    const route = laid.edgeRoutes.get(edge.id)![0]!;
    const gateway = laid.nodes.find((node) => node.id === 'approved')!;
    const start = laid.nodes.find((node) => node.id === 'received')!;
    const end = laid.nodes.find((node) => node.id === 'completed')!;
    const frame = bpmnGatewayFrame028(gateway.dimensions!.width,
      gateway.dimensions!.height, 'DOWN');
    expect(end.position!.x + end.dimensions!.width / 2)
      .toBeCloseTo(start.position!.x + start.dimensions!.width / 2, 6);
    expect(route.bendPoints).toHaveLength(2);
    expect(route.bendPoints[0]!.x).toBeLessThan(gateway.position!.x + frame.x - 4);
    expect(route.bendPoints[0]!.x).toBeCloseTo(route.bendPoints[1]!.x, 6);
  });

  it('keeps legacy BPMN default ports on the ring without crossing the caption', async () => {
    // Explicit GraphIR 3 control: the authored example now uses the installed reader.
    const parsed = { graph: { version: '3.0.0' as const, id: 'legacy-bpmn',
      metadata: { notation: 'bpmn' }, nodes: [
        { id: 'start', type: 'startEvent', label: 'Invoice received' },
        { id: 'task', type: 'task', label: 'Approve invoice' },
      ], edges: [{ id: 'to-task', source: 'start', target: 'task' }] } };
    expect(parsed.graph).toBeDefined();
    const before = JSON.stringify(parsed.graph);
    const laid = await layoutGraphForSvg(parsed.graph!, { direction: 'DOWN',
      svgOptions: { style: 'hifi', notation: 'bpmn' } });
    const event = laid.nodes.find((node) => node.id === 'start')!;
    const edge = parsed.graph!.edges.find(({ source, target }) => source === 'start' && target === 'task')!;
    const section = laid.edgeRoutes.get(edge.id)![0]!;
    expect(Math.hypot(section.startPoint.x - event.position!.x - event.dimensions!.width / 2,
      section.startPoint.y - event.position!.y - 32)).toBeCloseTo(24, 6);
    const points = [section.startPoint, ...section.bendPoints, section.endPoint];
    for (let i = 1; i < points.length; i++) for (let sample = 0; sample <= 128; sample++) {
      const a = points[i - 1]!; const b = points[i]!; const t = sample / 128;
      const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t;
      expect(x > event.position!.x && x < event.position!.x + event.dimensions!.width &&
        y > event.position!.y + 68 && y < event.position!.y + event.dimensions!.height).toBe(false);
    }
    expect(JSON.stringify(parsed.graph)).toBe(before);
  });

  it.each(['lowfi', 'hifi'] as const)(
    'keeps default DOWN %s event connectors clear of their captions', async (style) => {
      const source = readFileSync(new URL('../../browser/test/fixtures/acceptance028/bpmn-loop.coral',
        import.meta.url), 'utf8');
      const projected = projectInstalledSourceToSuccessor028(source);
      const before = JSON.stringify(projected.graph);
      const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
      const laid = await layoutGraphForSvg(display, { direction: 'DOWN',
        svgOptions: { style, notation: 'bpmn' }, semanticInterpretations });
      for (const id of ['received', 'completed']) {
        const event = laid.nodes.find((node) => node.id === id)!;
        const frame = bpmnEventFrame028(event.dimensions!.width, event.dimensions!.height, 'DOWN');
        const caption = bpmnEventCaptionBox028(event.dimensions!.width, event.dimensions!.height, 'DOWN');
        const center = { x: event.position!.x + frame.x + frame.width / 2,
          y: event.position!.y + frame.y + frame.height / 2 };
        for (const edge of laid.edges.filter((edge) => edge.source === id || edge.target === id)) {
          for (const section of laid.edgeRoutes.get(edge.id)!) {
            const contact = edge.source === id ? section.startPoint : section.endPoint;
            expect(Math.hypot(contact.x - center.x, contact.y - center.y)).toBeCloseTo(24, 6);
            const points = [section.startPoint, ...section.bendPoints, section.endPoint];
            for (let i = 1; i < points.length; i++) for (let sample = 0; sample <= 128; sample++) {
              const a = points[i - 1]!; const b = points[i]!; const t = sample / 128;
              const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t;
              expect(x > event.position!.x + caption.x && x < event.position!.x + caption.x + caption.width &&
                y > event.position!.y + caption.y && y < event.position!.y + caption.y + caption.height,
              `${edge.id} crosses ${id} caption`).toBe(false);
            }
          }
        }
      }
      expect(JSON.stringify(projected.graph)).toBe(before);
    });

  it.each(['bpmn-event', 'bpmn-branch', 'bpmn-loop'] as const)(
    'aligns visible flow-object centers in the default RIGHT %s view', async (name) => {
      const source = readFileSync(new URL(`../../browser/test/fixtures/acceptance028/${name}.coral`,
        import.meta.url), 'utf8');
      const projected = projectInstalledSourceToSuccessor028(source);
      const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
      const laid = await layoutGraphForSvg(display, { direction: 'RIGHT',
        svgOptions: { style: 'hifi', notation: 'bpmn' }, semanticInterpretations });
      const nodes = new Map(laid.nodes.map((node) => [node.id, node]));
      const center = (id: string) => {
        const node = nodes.get(id)!;
        const height = node.dimensions!.height;
        const local = id === 'received' || id === 'completed' ? 32
          : id === 'approved' ? 52 : height / 2;
        return node.position!.y + local;
      };
      const spine = name === 'bpmn-event' ? ['received', 'work']
        : name === 'bpmn-branch' ? ['received', 'check', 'approved', 'fulfill', 'completed']
          : ['received', 'check', 'approved', 'completed'];
      for (const id of spine) expect(center(id)).toBeCloseTo(center('received'), 6);
      for (let i = 1; i < spine.length; i++) {
        const edge = laid.edges.find((edge) => edge.source === spine[i - 1] && edge.target === spine[i])!;
        const section = laid.edgeRoutes.get(edge.id)![0]!;
        expect(section.startPoint.y).toBeCloseTo(section.endPoint.y, 6);
        expect(section.bendPoints).toEqual([]);
      }
      expect(projectInstalledSourceToSuccessor028(source).graph).toEqual(projected.graph);
    });

  it.each(['back = d -> b', 'shortcut = b -> d'])(
    'keeps the aligned RIGHT BPMN %s clear of an intervening task', async (extra) => {
      const source = '@diagram bpmn\na startEvent\nb task\nc task\nd task\ne endEvent\n' +
        'a -> b\nb -> c\nc -> d\nd -> e\n' + extra;
      const projected = projectInstalledSourceToSuccessor028(source);
      const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
      const laid = await layoutGraphForSvg(display, { direction: 'RIGHT',
        svgOptions: { style: 'hifi', notation: 'bpmn' }, semanticInterpretations });
      const obstacle = laid.nodes.find((node) => node.id === 'c')!;
      const section = laid.edgeRoutes.get(extra.split(' ')[0]!)![0]!;
      const points = [section.startPoint, ...section.bendPoints, section.endPoint];
      for (let i = 1; i < points.length; i++) for (let sample = 0; sample <= 64; sample++) {
        const a = points[i - 1]!; const b = points[i]!; const t = sample / 64;
        const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t;
        expect(x > obstacle.position!.x - 4 && x < obstacle.position!.x + obstacle.dimensions!.width + 4 &&
          y > obstacle.position!.y - 4 && y < obstacle.position!.y + obstacle.dimensions!.height + 4).toBe(false);
      }
      expect(section.bendPoints).toHaveLength(2);
    });

  it('keeps a blocked horizontal shortcut clear of the end-event caption', async () => {
    const source = '@diagram bpmn\na startEvent\nb task\nc task\nd task\nobstacle task\n' +
      'e endEvent as "Completed"\na -> b\nb -> c\nc -> d\nd -> obstacle\nd -> e\nshortcut = b -> e';
    const projected = projectInstalledSourceToSuccessor028(source);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const laid = await layoutGraphForSvg(display, { direction: 'RIGHT',
      svgOptions: { style: 'hifi', notation: 'bpmn' }, semanticInterpretations });
    const event = laid.nodes.find((node) => node.id === 'e')!;
    const section = laid.edgeRoutes.get('shortcut')![0]!;
    const points = [section.startPoint, ...section.bendPoints, section.endPoint];
    for (let i = 1; i < points.length; i++) for (let sample = 0; sample <= 128; sample++) {
      const a = points[i - 1]!; const b = points[i]!; const t = sample / 128;
      const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t;
      expect(x > event.position!.x && x < event.position!.x + event.dimensions!.width &&
        y > event.position!.y + 68 && y < event.position!.y + event.dimensions!.height).toBe(false);
    }
  });

  it.each(['lowfi', 'hifi'] as const)(
    'aligns the %s BPMN forward path and separates its exception lanes', async (style) => {
      const source = readFileSync(new URL(
        './fixtures/bpmn.coral',
        import.meta.url), 'utf8');
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const { display, semanticInterpretations } =
        successorSourceDisplayWithSemanticPorts028(projected.graph!);
      const laid = await layoutGraphForSvg(display, {
        direction: 'DOWN', svgOptions: { style, notation: 'bpmn' }, semanticInterpretations,
      });
      const nodes = new Map(laid.nodes.map((node) => [node.id, node]));
      const center = (id: string) => {
        const node = nodes.get(id)!;
        return node.position!.x + node.dimensions!.width / 2;
      };
      const spine = ['received', 'validate', 'complete', 'assess', 'eligible',
        'review', 'approved', 'issue', 'finished'];
      for (const id of spine) expect(center(id)).toBeCloseTo(center('received'), 6);
      for (const id of ['complete', 'eligible', 'approved']) {
        const node = nodes.get(id)!;
        const frame = bpmnGatewayFrame028(node.dimensions!.width,
          node.dimensions!.height, 'DOWN');
        expect(node.position!.x + frame.x + frame.width / 2)
          .toBeCloseTo(center('received'), 6);
      }
      for (const [side, peer] of [['requestInfo', 'assess'], ['decline', 'issue']] as const) {
        const sideNode = nodes.get(side)!; const peerNode = nodes.get(peer)!;
        expect(sideNode.position!.x + sideNode.dimensions!.width + 40)
          .toBeLessThanOrEqual(peerNode.position!.x + 1e-6);
      }
      const decline = laid.edges.find((edge) => edge.source === 'eligible' &&
        edge.target === 'decline')!;
      // 0.2.11 DRQ-12: orthogonalized gateway branch uses <= 2 clean bends (0 diagonals).
      expect(laid.edgeRoutes.get(decline.id)?.[0]?.bendPoints.length).toBeLessThanOrEqual(2);
    });

  it.each([
    ['flowchart', 'flowchart', 'collect', 'complete', 'check'],
    ['bpmn', 'bpmn', 'requestInfo', 'validate', 'complete'],
  ] as const)('routes the %s feedback connector into a separate side', async (
    file, notation, returning, target, forward,
  ) => {
    const source = readFileSync(new URL(
      `./fixtures/${file}.coral`,
      import.meta.url), 'utf8');
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const { display, semanticInterpretations } =
      successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const laid = await layoutGraphForSvg(display, {
      direction: 'DOWN', svgOptions: { style: 'hifi', notation }, semanticInterpretations,
    });
    const feedback = laid.edges.find((edge) => edge.source === returning &&
      edge.target === target)!;
    const departure = laid.edges.find((edge) => edge.source === target &&
      edge.target === forward)!;
    const route = laid.edgeRoutes.get(feedback.id)![0]!;
    const targetNode = laid.nodes.find((node) => node.id === target)!;
    expect(route.bendPoints).toHaveLength(2);
    expect(route.endPoint.x).toBeLessThan(targetNode.position!.x +
      targetNode.dimensions!.width / 2);
    const forwardStart = laid.edgeRoutes.get(departure.id)![0]!.startPoint;
    expect(Math.hypot(route.endPoint.x - forwardStart.x,
      route.endPoint.y - forwardStart.y)).toBeGreaterThan(24);
  });

  it.each([
    ['flowchart', ['approve', 'decline']],
    ['bpmn', ['decline']],
  ] as const)('uses a single clear side bend for long %s gateway branches', async (
    file, targets,
  ) => {
    const source = readFileSync(new URL(
      `./fixtures/${file}.coral`,
      import.meta.url), 'utf8');
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const { display, semanticInterpretations } =
      successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const laid = await layoutGraphForSvg(display, {
      direction: 'DOWN', svgOptions: { style: 'hifi', notation: file }, semanticInterpretations,
    });
    const svg = renderSvg(laid, { style: 'hifi', layoutDirection: 'DOWN',
      edgeRoutes: laid.edgeRoutes });
    for (const target of targets) {
      const edge = laid.edges.find((item) => item.source === 'eligible' && item.target === target)!;
      const route = laid.edgeRoutes.get(edge.id)![0]!;
      // 0.2.11 DRQ-12: branches arrive vertically and remain strictly orthogonal.
      const pts = [route.startPoint, ...route.bendPoints, route.endPoint];
      for (let i = 1; i < pts.length; i++) {
        expect(Math.abs(pts[i]!.x - pts[i - 1]!.x) < 1e-3 || Math.abs(pts[i]!.y - pts[i - 1]!.y) < 1e-3).toBe(true);
      }
      if (route.bendPoints.length > 0) {
        expect(route.bendPoints.at(-1)!.x).toBeCloseTo(route.endPoint.x, 6);
      }
      const shaft = new RegExp(`data-coral-part-id="${edge.id}:shaft" d="([^"]+)"`).exec(svg)?.[1];
      expect(shaft).toBeDefined();
    }
  });

  it('aligns the UML class spine and draws clear generalizations without doglegs', async () => {
    const source = readFileSync(new URL('./fixtures/uml-class-compare-028.coral', import.meta.url), 'utf8');
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const { display, semanticInterpretations } =
      successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const laid = await layoutGraphForSvg(display, {
      direction: 'DOWN', svgOptions: { style: 'hifi', notation: 'uml-class' }, semanticInterpretations,
    });
    const nodes = new Map(laid.nodes.map((node) => [node.id, node]));
    const center = (id: string) => nodes.get(id)!.position!.x + nodes.get(id)!.dimensions!.width / 2;
    expect(center('Order')).toBeCloseTo(center('LineItem'), 6);
    expect(center('LineItem')).toBeCloseTo(center('Product'), 6);
    for (const id of ['contains', 'describes']) {
      expect(laid.edgeRoutes.get(id)?.[0]?.bendPoints).toEqual([]);
    }
    for (const id of ['customerBase', 'orderBase', 'paymentBase']) {
      const route = laid.edgeRoutes.get(id)![0]!;
      const pts = [route.startPoint, ...route.bendPoints, route.endPoint];
      for (let i = 1; i < pts.length; i++) {
        expect(Math.abs(pts[i]!.x - pts[i - 1]!.x) < 1e-3 || Math.abs(pts[i]!.y - pts[i - 1]!.y) < 1e-3).toBe(true);
      }
    }
    const svg = renderSvg(laid, { style: 'hifi', layoutDirection: 'DOWN', edgeRoutes: laid.edgeRoutes });
    expect(svg).toContain('data-coral-part-id="orderBase:shaft"');
  });

  it.each(['lowfi', 'hifi'] as const)(
    'ranks an unconstrained %s class hierarchy base above its subclasses', async (style) => {
      const source = [
        '@diagram uml-class',
        'Entity class', 'Customer class', 'Order class', 'LineItem class',
        'Product class', 'Payment class',
        'Customer --|> Entity [inheritance]',
        'Order --|> Entity [inheritance]',
        'Payment --|> Entity [inheritance]',
        'Customer -> Order [association]',
        'Payment -> Order [association]',
        'Order -> LineItem [composition]',
        'LineItem -> Product [association]',
      ].join('\n');
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const { display, semanticInterpretations } =
        successorSourceDisplayWithSemanticPorts028(projected.graph!);
      const laid = await layoutGraphForSvg(display, {
        direction: 'DOWN', svgOptions: { style, notation: 'uml-class' }, semanticInterpretations,
      });
      const nodes = new Map(laid.nodes.map((node) => [node.id, node]));
      const y = (id: string) => nodes.get(id)!.position!.y;
      expect(y('Entity')).toBeLessThan(y('Customer'));
      expect(y('Entity')).toBeLessThan(y('Payment'));
      expect(y('Customer')).toBeLessThan(y('Order'));
      expect(y('Payment')).toBeLessThan(y('Order'));
      expect(y('Order')).toBeLessThan(y('LineItem'));
      expect(y('LineItem')).toBeLessThan(y('Product'));
      const bases = laid.edges.filter((edge) => edge.type === 'inheritance');
      expect(bases).toHaveLength(3);
      for (const edge of bases) {
        expect(edge.target).toBe('Entity');
        const contact = laid.edgeRoutes.get(edge.id)!.at(-1)!.endPoint;
        const entity = nodes.get('Entity')!;
        expect(contact.y).toBeCloseTo(entity.position!.y + entity.dimensions!.height, 6);
      }
    });

  it.each(['lowfi', 'hifi'] as const)(
    'spaces free %s inheritance heads on a shared parent contour', async (style) => {
      const source = readFileSync(new URL('../../browser/test/fixtures/acceptance028/uml-class-fork.coral',
        import.meta.url), 'utf8');
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const { display, semanticInterpretations } =
        successorSourceDisplayWithSemanticPorts028(projected.graph!);
      const laid = await layoutGraphForSvg(display,
        { svgOptions: { style, notation: 'uml-class' }, semanticInterpretations });
      expect(laid.edges).toHaveLength(3);
      const document = laid.nodes.find((node) => node.id === 'Document')!;
      const contacts = laid.edges.map((edge) => {
        expect(edge.type).toBe('inheritance');
        expect(edge.target).toBe('Document');
        return laid.edgeRoutes.get(edge.id)!.at(-1)!.endPoint;
      }).sort((left, right) => left.y - right.y);
      for (const contact of contacts) {
        expect(contact.x).toBeCloseTo(document.position!.x + document.dimensions!.width, 6);
        expect(contact.y).toBeGreaterThan(document.position!.y + 8);
        expect(contact.y).toBeLessThan(document.position!.y + document.dimensions!.height - 8);
      }
      for (let index = 1; index < contacts.length; index += 1) {
        expect(contacts[index]!.y - contacts[index - 1]!.y).toBeGreaterThanOrEqual(24);
      }
      const svg = renderSvg(laid, { style, edgeRoutes: laid.edgeRoutes });
      const painted = [...svg.matchAll(/data-coral-part-id="[^"]+:target-marker" data-coral-marker-contact="([\d.-]+),([\d.-]+)"/g)]
        .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }))
        .sort((left, right) => left.y - right.y);
      expect(painted).toHaveLength(3);
      for (let index = 1; index < painted.length; index += 1) {
        expect(painted[index]!.y - painted[index - 1]!.y).toBeGreaterThanOrEqual(24);
      }
      const footprints = laid.edges.map((edge) => {
        const shaft = new RegExp(`data-coral-part-id="${edge.id}:shaft" d="([^"]+)"[^>]*stroke-width="([^"]+)"`)
          .exec(svg)!;
        const coordinates = [...shaft[1]!.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)]
          .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
        const before = coordinates.at(-2)!;
        const contact = coordinates.at(-1)!;
        const length = Math.hypot(contact.x - before.x, contact.y - before.y);
        const cosine = (contact.x - before.x) / length;
        const sine = (contact.y - before.y) / length;
        // The production marker has a 16-unit viewBox, 10-unit viewport,
        // triangle M2 2 L14 8 L2 14 Z, and 1.5-unit marker stroke.
        expect(svg).toContain('viewBox="0 0 16 16" refX="14" refY="8" markerWidth="10"');
        expect(svg).toContain('d="M2 2 L14 8 L2 14 Z"');
        const scale = Number(shaft[2]) * 10 / 16;
        const ys = [[-12, -6], [0, 0], [-12, 6]].map(([x, y]) =>
          contact.y + scale * (x! * sine + y! * cosine));
        const stroke = scale * 1.5 / 2;
        return { minY: Math.min(...ys) - stroke, maxY: Math.max(...ys) + stroke };
      }).sort((left, right) => left.minY - right.minY);
      for (let index = 1; index < footprints.length; index += 1) {
        expect(footprints[index]!.minY - footprints[index - 1]!.maxY)
          .toBeGreaterThanOrEqual(1);
      }
    });

  it('spaces source-owned open triangles with no explicit inheritance type', async () => {
    const source = '@diagram uml-class\nDocument class\nC0 class\nC1 class\nC2 class\n' +
      'C0 --|> Document\nC1 --|> Document\nC2 --|> Document\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const { display, semanticInterpretations } =
      successorSourceDisplayWithSemanticPorts028(projected.graph!);
    expect(display.edges.every((edge) => edge.type === undefined &&
      edge.targetEnd?.marker?.kind === 'triangle')).toBe(true);
    const laid = await layoutGraphForSvg(display,
      { svgOptions: { style: 'lowfi', notation: 'uml-class' }, semanticInterpretations });
    const contacts = laid.edges.map((edge) => laid.edgeRoutes.get(edge.id)!.at(-1)!.endPoint)
      .sort((left, right) => left.y - right.y);
    expect(contacts).toHaveLength(3);
    for (let index = 1; index < contacts.length; index += 1) {
      expect(contacts[index]!.y - contacts[index - 1]!.y).toBeGreaterThanOrEqual(24);
    }
  });

  it.each([
    ['realization', undefined],
    ['inheritance', { role: 'parent' }],
  ] as const)('spaces %s catalog-default open triangles', async (type, targetEnd) => {
    const source = readFileSync(new URL('../../browser/test/fixtures/acceptance028/uml-class-fork.coral',
      import.meta.url), 'utf8');
    const projected = projectInstalledSourceToSuccessor028(source);
    const { display, semanticInterpretations } =
      successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const graph = { ...display, edges: display.edges.map((edge) => ({
      ...edge, type, ...(targetEnd ? { targetEnd } : { targetEnd: undefined }),
    })) } as GraphIR;
    const laid = await layoutGraphForSvg(graph,
      { svgOptions: { style: 'lowfi', notation: 'uml-class' }, semanticInterpretations });
    const contacts = laid.edges.map((edge) => laid.edgeRoutes.get(edge.id)!.at(-1)!.endPoint)
      .sort((left, right) => left.y - right.y);
    for (let index = 1; index < contacts.length; index += 1)
      expect(contacts[index]!.y - contacts[index - 1]!.y).toBeGreaterThanOrEqual(24);
    const svg = renderSvg(laid, { style: 'lowfi', edgeRoutes: laid.edgeRoutes });
    expect([...svg.matchAll(/data-coral-part-id="[^"]+:target-marker"/g)]).toHaveLength(3);
  });

  it('does not add a catalog triangle over an explicit none endpoint', async () => {
    const source = readFileSync(new URL('../../browser/test/fixtures/acceptance028/uml-class-fork.coral',
      import.meta.url), 'utf8');
    const projected = projectInstalledSourceToSuccessor028(source);
    const { display, semanticInterpretations } =
      successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const graph = { ...display, edges: display.edges.map((edge, index) => ({
      ...edge, type: 'realization', targetEnd: index === 0 ? { marker: { kind: 'none' } } : undefined,
    })) } as GraphIR;
    const laid = await layoutGraphForSvg(graph,
      { svgOptions: { style: 'lowfi', notation: 'uml-class' }, semanticInterpretations });
    const svg = renderSvg(laid, { style: 'lowfi', edgeRoutes: laid.edgeRoutes });
    expect(svg).not.toContain(`data-coral-part-id="${laid.edges[0]!.id}:target-marker"`);
    expect([...svg.matchAll(/data-coral-part-id="[^"]+:target-marker"/g)]).toHaveLength(2);
  });

  it('spaces source-end open triangles while retaining first/second meaning', async () => {
    const source = '@diagram uml-class\nDocument class\n' +
      Array.from({ length: 5 }, (_, index) => `C${index} class\n`).join('') +
      Array.from({ length: 5 }, (_, index) =>
        `out${index} = Document -- C${index} [inheritance, firstEnd: triangle, secondEnd: none]\n`).join('');
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const { display, semanticInterpretations } =
      successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const laid = await layoutGraphForSvg(display,
      { svgOptions: { style: 'lowfi', notation: 'uml-class' }, semanticInterpretations });
    const parent = laid.nodes.find((node) => node.id === 'Document')!;
    const contacts = laid.edges.map((edge) => {
      expect(edge.source).toBe('Document');
      expect(edge.sourceEnd?.marker?.kind).toBe('triangle');
      return laid.edgeRoutes.get(edge.id)![0]!.startPoint;
    }).sort((left, right) => left.y - right.y);
    expect(contacts).toHaveLength(5);
    for (const contact of contacts) {
      expect(contact.x).toBeCloseTo(parent.position!.x + parent.dimensions!.width, 6);
    }
    for (let index = 1; index < contacts.length; index += 1) {
      expect(contacts[index]!.y - contacts[index - 1]!.y).toBeGreaterThanOrEqual(24);
    }
  });

  it('reports a node-scoped capability when a fixed classifier cannot fit its marker heads', async () => {
    const source = '@diagram uml-class\nDocument class\n' +
      Array.from({ length: 6 }, (_, index) => `C${index} class\n`).join('') +
      Array.from({ length: 6 }, (_, index) =>
        `edge${index} = C${index} --|> Document [inheritance]\n`).join('');
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const { display, semanticInterpretations } =
      successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const fixed = { ...display, nodes: display.nodes.map((node) => node.id === 'Document'
      ? { ...node, dimensions: { width: 200, height: 120 } } : node) };
    await expect(layoutGraphForSvg(fixed,
      { svgOptions: { style: 'lowfi', notation: 'uml-class' }, semanticInterpretations }))
      .rejects.toMatchObject({ diagnostics: expect.arrayContaining([expect.objectContaining({
        code: 'layout.capability.unsupported', path: 'nodes.Document',
      })]) });
  });

  it.each(['lowfi', 'hifi'] as const)(
    'keeps an authored %s triangle contact fixed while spacing free painted heads', async (style) => {
      const source = readFileSync(new URL(
        '../../browser/test/fixtures/acceptance028/uml-class-mixed-anchors.coral', import.meta.url), 'utf8');
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const { display, semanticInterpretations } =
        successorSourceDisplayWithSemanticPorts028(projected.graph!);
      const laid = await layoutGraphForSvg(display,
        { svgOptions: { style, notation: 'uml-class' }, semanticInterpretations });
      const parent = laid.nodes.find((node) => node.id === 'Document')!;
      const fixed = laid.edges.find((edge) => edge.targetPort === 'receive')!;
      expect(laid.edgeRoutes.get(fixed.id)!.at(-1)!.endPoint).toEqual({
        x: parent.position!.x, y: parent.position!.y + parent.dimensions!.height / 2,
      });
      const contacts = laid.edges.map((edge) => laid.edgeRoutes.get(edge.id)!.at(-1)!.endPoint)
        .sort((left, right) => left.y - right.y);
      for (let index = 1; index < contacts.length; index += 1)
        expect(contacts[index]!.y - contacts[index - 1]!.y).toBeGreaterThanOrEqual(24);
      const orderedFreeHeads = laid.edges.filter((edge) => !edge.targetPort)
        .map((edge) => ({ sourceY: laid.nodes.find((node) => node.id === edge.source)!.position!.y,
          targetY: laid.edgeRoutes.get(edge.id)!.at(-1)!.endPoint.y }))
        .sort((left, right) => left.sourceY - right.sourceY);
      for (let index = 1; index < orderedFreeHeads.length; index += 1)
        expect(orderedFreeHeads[index]!.targetY).toBeGreaterThan(orderedFreeHeads[index - 1]!.targetY);
      for (const edge of laid.edges.filter((candidate) => !candidate.targetPort)) {
        const section = laid.edgeRoutes.get(edge.id)!.at(-1)!;
        expect((section.bendPoints.at(-1) ?? section.startPoint).y).toBeCloseTo(section.endPoint.y, 6);
      }
      const svg = renderSvg(laid, { style, edgeRoutes: laid.edgeRoutes });
      const footprints = laid.edges.map((edge) => {
        const shaft = new RegExp(`data-coral-part-id="${edge.id}:shaft" d="([^"]+)"[^>]*stroke-width="([^"]+)"`)
          .exec(svg)!;
        const points = [...shaft[1]!.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)]
          .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
        const before = points.at(-2)!;
        const contact = points.at(-1)!;
        const length = Math.hypot(contact.x - before.x, contact.y - before.y);
        const sine = (contact.y - before.y) / length;
        const cosine = (contact.x - before.x) / length;
        const scale = Number(shaft[2]) * 10 / 16;
        const vertices = [[-12, -6], [0, 0], [-12, 6]].map(([x, y]) => ({
          x: contact.x + scale * (x! * cosine - y! * sine),
          y: contact.y + scale * (x! * sine + y! * cosine),
        }));
        return { points: vertices, stroke: scale * 1.5 / 2 };
      });
      for (let left = 0; left < footprints.length; left += 1) {
        for (let right = left + 1; right < footprints.length; right += 1) {
          const first = footprints[left]!;
          const second = footprints[right]!;
          const axes = [first, second].flatMap(({ points }) => points.map((point, index) => {
            const next = points[(index + 1) % points.length]!;
            const dx = next.x - point.x;
            const dy = next.y - point.y;
            const length = Math.hypot(dx, dy);
            return { x: -dy / length, y: dx / length };
          }));
          const separated = axes.some((axis) => {
            const a = first.points.map((point) => point.x * axis.x + point.y * axis.y);
            const b = second.points.map((point) => point.x * axis.x + point.y * axis.y);
            return Math.max(Math.min(...a) - Math.max(...b), Math.min(...b) - Math.max(...a)) >
              first.stroke + second.stroke;
          });
          expect(separated).toBe(true);
        }
      }
    });

  it('refuses two colliding authored triangle heads even with a movable third head', async () => {
    const source = '@diagram uml-class\nDocument class {\n' +
      '  receive port [direction: in, anchor: W]\n}\n' +
      'C0 class\nC1 class\nC2 class\n' +
      'C0 --|> Document:receive [inheritance]\n' +
      'C1 --|> Document:receive [inheritance]\n' +
      'C2 --|> Document [inheritance]\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const { display, semanticInterpretations } =
      successorSourceDisplayWithSemanticPorts028(projected.graph!);
    await expect(layoutGraphForSvg(display,
      { svgOptions: { style: 'lowfi', notation: 'uml-class' }, semanticInterpretations }))
      .rejects.toMatchObject({ diagnostics: expect.arrayContaining([expect.objectContaining({
        code: 'layout.capability.unsupported', path: 'nodes.Document',
      })]) });
  });

  it('flattens nodes with positions and dimensions, and returns ELK routes', async () => {
    const laid = await layoutGraphForSvg(flow);
    expect(laid.nodes.map((node) => node.id)).toEqual(['group', 'inner', 'db']);
    for (const node of laid.nodes) {
      expect(node.position).toEqual({ x: expect.any(Number), y: expect.any(Number) });
      expect(node.dimensions).toEqual({ width: expect.any(Number), height: expect.any(Number) });
      expect('children' in node).toBe(false);
    }
    expect(laid.edges).toEqual(flow.edges);
    expect(laid.edgeRoutes.get('e1')?.length).toBeGreaterThan(0);
    expect(renderSvg(laid, { edgeRoutes: laid.edgeRoutes })).toContain('Inner');
  });

  describe('group padding beside positioned children (D6, owner 2026-11-15)', () => {
    const group = (children: GraphIR['nodes']): GraphIR => ({ ...flow, nodes: [
      { id: 'group', type: 'group', label: 'Group', children }, { id: 'db', type: 'database', label: 'DB' }] } as GraphIR);
    const at = (laid: Awaited<ReturnType<typeof layoutGraphForSvg>>, id: string) => laid.nodes.find((node) => node.id === id)!.position!;
    const inGroup = (laid: Awaited<ReturnType<typeof layoutGraphForSvg>>, id: string) =>
      ({ x: at(laid, id).x - at(laid, 'group').x, y: at(laid, id).y - at(laid, 'group').y });
    /** Every node rectangle and route, so any geometry change shows. */
    const digest = (laid: Awaited<ReturnType<typeof layoutGraphForSvg>>) => createHash('sha256').update(JSON.stringify({
      nodes: laid.nodes.map((node) => [node.id, node.position, node.dimensions]),
      routes: [...laid.edgeRoutes].sort(([a], [b]) => a.localeCompare(b)) })).digest('hex');
    const mixedGroup = group([{ id: 'inner', type: 'service', label: 'Inner' },
      { id: 'side', type: 'service', label: 'Side', position: { x: 300, y: 200 } }]);
    const allPositioned = group([{ id: 'inner', type: 'service', label: 'Inner', position: { x: 20, y: 152 } },
      { id: 'side', type: 'service', label: 'Side', position: { x: 20, y: 40 } }]);

    it('keeps a mixed group\'s automatic children in its padding; authored ones stay local to its corner', async () => {
      const automatic = await layoutGraphForSvg(group([{ id: 'inner', type: 'service', label: 'Inner' }, { id: 'side', type: 'service', label: 'Side' }]));
      const mixed = await layoutGraphForSvg(mixedGroup);
      // The grown group itself may move; its automatic child keeps its place in it.
      expect(inGroup(mixed, 'inner')).toEqual(inGroup(automatic, 'inner'));
      expect(at(mixed, 'side')).toEqual({ x: at(mixed, 'group').x + 300, y: at(mixed, 'group').y + 200 });
      expect(digest(mixed)).toBe('1561672cc1c6b6919bbd3815beea5e48ea4bdbf36ccec13c5f119e0a5db4f0db');
    });

    it('lays out a group whose children are all positioned exactly as before D6', async () => {
      // Deterministic 0.2.11 BRANDES_KOEPF baseline.
      expect(digest(await layoutGraphForSvg(allPositioned))).toBe('52ce6596facda448c01c2f1f11c3c08501b9675cc34f2550b383f791e842ec07');
    });
  });

  it('is deterministic and honours direction', async () => {
    const right = await layoutGraphForSvg(flow);
    expect(await layoutGraphForSvg(flow)).toEqual(right);
    const down = await layoutGraphForSvg(flow, { direction: 'DOWN' });
    expect(down.nodes).not.toEqual(right.nodes);
  });

  it('routes catalog semantic ports toward flow in both SVG directions', async () => {
    const graph: GraphIR = {
      version: '3.0.0', id: 'attachment', metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service' }, { id: 'db', type: 'database' }],
      edges: [{ id: 'query', source: 'api', target: 'db' }],
    };
    const right = await layoutGraphForSvg(graph, { direction: 'RIGHT' });
    const rightApi = right.nodes.find((node) => node.id === 'api')!;
    const rightDb = right.nodes.find((node) => node.id === 'db')!;
    const rightRoute = right.edgeRoutes.get('query')?.[0];
    expect(rightRoute?.startPoint.x).toBeGreaterThan(rightApi.position!.x + rightApi.dimensions!.width / 2);
    expect(rightRoute?.endPoint.x).toBeLessThan(rightDb.position!.x + rightDb.dimensions!.width / 2);

    const down = await layoutGraphForSvg(graph, { direction: 'DOWN' });
    const downApi = down.nodes.find((node) => node.id === 'api')!;
    const downDb = down.nodes.find((node) => node.id === 'db')!;
    const downRoute = down.edgeRoutes.get('query')?.[0];
    expect(downRoute?.startPoint.y).toBeGreaterThan(downApi.position!.y + downApi.dimensions!.height / 2);
    expect(downRoute?.endPoint.y).toBeLessThan(downDb.position!.y + downDb.dimensions!.height / 2);
    expect(graph.nodes.every((node) => node.ports === undefined)).toBe(true);
  });

  it('routes additive successor semantic ports through SVG layout without persisting geometric ports', async () => {
    const graph: GraphIR = { version: '3.0.0', id: 'authored-attachment',
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service' }, { id: 'db', type: 'database' }],
      edges: [{ id: 'query', source: 'api', target: 'db', sourcePort: 'audit', targetPort: 'receive' }],
    };
    const semanticInterpretations = resolveSuccessorGraphNodes028({ version: '4.0.0',
      profile: { id: 'architecture', version: '1.0.0' }, catalog: notationCatalogIdentity028('architecture')!,
      nodes: [{ id: 'api', type: 'service', semanticPorts: [
        { id: 'audit', direction: 'out', anchor: { kind: 'side' } },
      ] }, { id: 'db', type: 'database', semanticPorts: [
        { id: 'receive', direction: 'in', anchor: { kind: 'auto' } },
      ] }],
    });
    expect(semanticInterpretations.get('api')?.semanticPorts.map((port) => port.id))
      .toEqual(['in', 'out', 'data', 'audit']);
    for (const direction of ['RIGHT', 'DOWN'] as const) {
      const laid = await layoutGraphForSvg(graph, { direction, semanticInterpretations });
      const api = laid.nodes.find((node) => node.id === 'api')!;
      const db = laid.nodes.find((node) => node.id === 'db')!;
      const route = laid.edgeRoutes.get('query')?.[0];
      if (!route) throw new Error('Authored-port edge has no SVG route');
      if (direction === 'RIGHT') {
        expect(route.startPoint.x).toBeGreaterThan(api.position!.x + api.dimensions!.width / 2);
        expect(route.endPoint.x).toBeLessThan(db.position!.x + db.dimensions!.width / 2);
      } else {
        expect(route.startPoint.y).toBeGreaterThan(api.position!.y + api.dimensions!.height / 2);
        expect(route.endPoint.y).toBeLessThan(db.position!.y + db.dimensions!.height / 2);
      }
      expect(laid.nodes.every((node) => node.ports === undefined)).toBe(true);
      expect(graph.nodes.every((node) => node.ports === undefined)).toBe(true);
    }
  });

  it('routes an unported successor connector on the node boundary without assigning a named port', async () => {
    const source = '@diagram architecture\napi service\ndb database\napi -> db\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
    for (const direction of ['RIGHT', 'DOWN'] as const) {
      const laid = await layoutGraphForSvg(display, { direction, semanticInterpretations });
      const api = laid.nodes.find((node) => node.id === 'api')!;
      const route = laid.edgeRoutes.get('edge-1')?.[0];
      expect(route).toBeDefined();
      if (direction === 'RIGHT') expect(route!.startPoint.x)
        .toBeGreaterThan(api.position!.x + api.dimensions!.width / 2);
      else expect(route!.startPoint.y)
        .toBeGreaterThan(api.position!.y + api.dimensions!.height / 2);
      expect(laid.edges[0]?.sourcePort).toBeUndefined();
      expect(laid.edges[0]?.targetPort).toBeUndefined();
    }
    expect(projected.graph?.edges[0]?.first.port).toBeUndefined();
    expect(projected.graph?.edges[0]?.second.port).toBeUndefined();
  });

  it('does not bind an unported edge to the only authored hard-pinned semantic port', async () => {
    const source = '@diagram architecture\ngateway group {\n' +
      '  audit port [direction: out, anchor: N]\n}\nstore database\n' +
      'gateway -> store\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const laid = await layoutGraphForSvg(display, { direction: 'RIGHT', semanticInterpretations });
    const gateway = laid.nodes.find((node) => node.id === 'gateway')!;
    const start = laid.edgeRoutes.get('edge-1')?.[0]?.startPoint;
    expect(start).toBeDefined();
    expect(start!.x).toBeGreaterThan(gateway.position!.x + gateway.dimensions!.width / 2);
    expect(projected.graph?.edges[0]?.first.port).toBeUndefined();
  });

  it('keeps an authored corner hint on a visible corner through source-first SVG reflow', async () => {
    const source = '@diagram architecture\napi service {\n' +
      '  audit port [direction: out, anchor: corner]\n}\n' +
      'store database\napi:audit -> store:query [reads]';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.nodes[0]?.semanticPorts).toMatchObject([
      { id: 'audit', anchor: { kind: 'corner' } },
    ]);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
    for (const direction of ['RIGHT', 'DOWN'] as const) {
      const laid = await layoutGraphForSvg(display, { direction, semanticInterpretations });
      const api = laid.nodes.find((node) => node.id === 'api')!;
      const start = laid.edgeRoutes.get('edge-1')?.[0]?.startPoint;
      expect(start).toBeDefined();
      const x = (start!.x - api.position!.x) / api.dimensions!.width;
      const y = (start!.y - api.position!.y) / api.dimensions!.height;
      expect(Math.min(x, 1 - x)).toBeLessThan(0.25);
      expect(Math.min(y, 1 - y)).toBeLessThan(0.25);
      expect(laid.nodes.every((node) => node.ports === undefined)).toBe(true);
    }
    expect(display.nodes.every((node) => node.ports === undefined)).toBe(true);
  });

  it('refuses incomplete or mixed-authority semantic interpretation sidecars', async () => {
    const graph: GraphIR = { version: '3.0.0', id: 'sidecar-integrity',
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service' }, { id: 'db', type: 'database' }],
      edges: [{ id: 'e', source: 'api', target: 'db' }] };
    const semanticInterpretations = resolveSuccessorGraphNodes028({ version: '4.0.0',
      profile: { id: 'architecture', version: '1.0.0' }, catalog: notationCatalogIdentity028('architecture')!,
      nodes: [{ id: 'api', type: 'service', semanticPorts: [{ id: 'audit', direction: 'out' }] }],
    });
    await expect(layoutGraphForSvg(graph, { semanticInterpretations }))
      .rejects.toThrow(/render\.capability\.semantic-port-sidecar.*db/);
    const withGeometricPorts: GraphIR = { ...graph, nodes: [
      { ...graph.nodes[0]!, ports: [{ id: 'legacy', side: 'EAST' }] }, graph.nodes[1]!,
    ] };
    await expect(layoutGraphForSvg(withGeometricPorts, { semanticInterpretations }))
      .rejects.toThrow(/render\.capability\.semantic-port-sidecar.*api/);
    const changedSymbol: GraphIR = { ...graph, nodes: [
      { ...graph.nodes[0]!, symbol: 'arch-database' }, graph.nodes[1]!,
    ] };
    await expect(layoutGraphForSvg(changedSymbol, { semanticInterpretations }))
      .rejects.toThrow(/render\.capability\.semantic-port-sidecar.*api/);
  });

  it('keeps a successor exact pin on the authored side during downward reflow', async () => {
    const graph: GraphIR = { version: '3.0.0', id: 'fixed-attachment',
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service' }, { id: 'db', type: 'database' }],
      edges: [{ id: 'query', source: 'api', target: 'db', sourcePort: 'audit' }],
    };
    const semanticInterpretations = resolveSuccessorGraphNodes028({ version: '4.0.0',
      profile: { id: 'architecture', version: '1.0.0' }, catalog: notationCatalogIdentity028('architecture')!,
      nodes: [{ id: 'api', type: 'service', semanticPorts: [
        { id: 'audit', direction: 'out', anchor: { kind: 'exact', position: 'E' } },
      ] }, { id: 'db', type: 'database' }],
    });
    const laid = await layoutGraphForSvg(graph, { direction: 'DOWN', semanticInterpretations });
    const api = laid.nodes.find((node) => node.id === 'api')!;
    const start = laid.edgeRoutes.get('query')?.[0]?.startPoint;
    expect(start?.x).toBeGreaterThan(api.position!.x + api.dimensions!.width / 2);
    expect(start?.y).toBeGreaterThanOrEqual(api.position!.y);
    expect(start?.y).toBeLessThanOrEqual(api.position!.y + api.dimensions!.height);
    expect(laid.nodes.every((node) => node.ports === undefined)).toBe(true);
  });

  it('keeps ELK-selected free-port sides when a cycle reverses a flow preference', async () => {
    const graph: GraphIR = { version: '3.0.0', id: 'free-cycle', metadata: { notation: 'flowchart' },
      nodes: [{ id: 'a', type: 'process' }, { id: 'b', type: 'process' }],
      edges: [{ id: 'ab', source: 'a', target: 'b' }, { id: 'ba', source: 'b', target: 'a' }] };
    const laid = await layoutGraphForSvg(graph, { direction: 'RIGHT' });
    const sides = laid.edges.map((edge) => {
      const source = laid.nodes.find((node) => node.id === edge.source)!;
      const point = laid.edgeRoutes.get(edge.id)?.[0]?.startPoint;
      return (point?.x ?? NaN) < source.position!.x + source.dimensions!.width / 2 ? 'WEST' : 'EAST';
    });
    expect(sides).toContain('WEST');
    expect(graph.nodes.every((node) => node.ports === undefined)).toBe(true);
  });

  it('keeps a flowchart collection loop below its initiating decision', async () => {
    const graph: GraphIR = { version: '3.0.0', id: 'feedback-order',
      metadata: { notation: 'flowchart' }, nodes: [
        { id: 'start', type: 'terminal' }, { id: 'complete', type: 'decision' },
        { id: 'collect', type: 'process' }, { id: 'check', type: 'process' },
      ], edges: [
        { id: 'received', source: 'start', target: 'complete' },
        { id: 'missing', source: 'complete', target: 'collect' },
        { id: 'updated', source: 'collect', target: 'complete' },
        { id: 'ready', source: 'complete', target: 'check' },
      ] };
    const laid = await layoutGraphForSvg(graph, { direction: 'DOWN' });
    const y = (id: string) => laid.nodes.find((node) => node.id === id)!.position!.y;
    expect(y('start')).toBeLessThan(y('complete'));
    expect(y('complete')).toBeLessThan(y('collect'));
    expect(y('complete')).toBeLessThan(y('check'));
    expect(laid.edgeRoutes.get('updated')?.length).toBeGreaterThan(0);
  });

  it('keeps notation metadata and returns no routes for an empty graph', async () => {
    const laid = await layoutGraphForSvg({ version: '3.0.0', id: 'e', nodes: [], edges: [], metadata: { notation: 'flowchart' } } as GraphIR);
    expect(laid).toEqual({ nodes: [], edges: [], metadata: { notation: 'flowchart' }, edgeRoutes: new Map() });
  });

  it('projects a sequence graph without ELK', async () => {
    const graph = {
      version: '3.0.0', id: 'seq', name: 'Login',
      metadata: { notation: 'uml-sequence' }, profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
      nodes: [{ id: 'a', type: 'participant', label: 'A' }, { id: 'b', type: 'participant', label: 'B' }],
      edges: [{ id: 'm', source: 'a', target: 'b', type: 'synchronous' }],
      interaction: {
        participants: [{ id: 'a', nodeId: 'a' }, { id: 'b', nodeId: 'b' }],
        participantOrder: ['a', 'b'],
        messages: [{ id: 'm', edgeId: 'm', sourceParticipantId: 'a', targetParticipantId: 'b', kind: 'synchronous' }],
        messageOrder: ['m'],
      },
    } as unknown as GraphIR;
    const laid = await layoutGraphForSvg(graph);
    expect(laid).toEqual({
      id: 'seq', name: 'Login', nodes: graph.nodes, edges: graph.edges,
      metadata: { notation: 'uml-sequence' }, profile: graph.profile,
      interaction: graph.interaction, edgeRoutes: new Map(),
    });
    expect(laid.nodes[0]).not.toHaveProperty('position');
  });

  it('preserves a profile-only sequence through layout and SVG without inventing metadata', async () => {
    const graph: GraphIR = {
      version: '3.0.0', id: 'profile-only-sequence',
      profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
      nodes: [{ id: 'a', type: 'participant' }, { id: 'b', type: 'participant' }],
      edges: [{ id: 'm', source: 'a', target: 'b', type: 'sync' }],
      interaction: {
        participants: [{ id: 'a', nodeId: 'a' }, { id: 'b', nodeId: 'b' }],
        participantOrder: ['a', 'b'],
        messages: [{ id: 'm', edgeId: 'm', sourceParticipantId: 'a',
          targetParticipantId: 'b', kind: 'synchronous' }],
        messageOrder: ['m'],
      },
    };
    const laid = await layoutGraphForSvg(graph);
    expect(laid.profile).toEqual(graph.profile);
    expect(laid.metadata).toBeUndefined();
    expect(laid.edgeRoutes.size).toBe(0);
    expect(renderSvg(laid)).toContain('data-coral-sequence-message="m"');
  });

  it('retains a profile-only UML class identity through ordinary layout and SVG', async () => {
    const graph: GraphIR = { version: '3.0.0', id: 'profile-only-class',
      profile: { id: 'uml', kind: 'class', version: '1.0.0' },
      nodes: [{ id: 'Order', type: 'class', label: 'Order', classifier: {
        kind: 'class', name: 'Order', compartments: [{ id: 'name', kind: 'name' }],
      } }], edges: [] };
    const laid = await layoutGraphForSvg(graph);
    expect(laid.profile).toEqual(graph.profile);
    expect(laid.metadata).toBeUndefined();
    expect(laid.nodes[0]?.position).toBeDefined();
    expect(renderSvg(laid)).toContain('Order');
  });

  it('refuses a contradictory UML profile before choosing a layout path', async () => {
    const graph: GraphIR = { version: '3.0.0', id: 'mismatch',
      metadata: { notation: 'uml-sequence' },
      profile: { id: 'uml', kind: 'class', version: '1.0.0' },
      nodes: [{ id: 'Order', type: 'class' }], edges: [] };
    await expect(layoutGraphForSvg(graph)).rejects.toThrow(/render\.capability\.profile-contradiction/);
  });
});
