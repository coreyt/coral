import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { effectiveNodePorts, layoutNodes, projectDiagramNodes, retainRoutesAfterPositionOverlay } from '../src/hooks/diagramUtils';
import { parseCoralDSL } from '../src/parsers';
import { notationCatalogIdentity028, prepareSpatialScene028,
  projectInstalledSourceToSuccessor028, resolveSuccessorGraphNodes028,
  successorSourceDisplay028, successorSourceDisplayWithSemanticPorts028 } from '@coral-viz/render';
import { attachmentFromBoundaryPoint } from '@coral-viz/render/layout';
import { materializeRenderGraph, nestCanonicalNodes } from '../src/editorProjection';
import { spatialQualityFixtures029 } from '../../render/test/fixtures/spatialQuality029';

describe('reference editor shared-layout adapter', () => {
  it.each(['load', 'reflow'] as const)('gives Code branch traverses room below their class on %s', async operation => {
    const source = readFileSync(resolve(import.meta.dirname,
      '../../render/test/fixtures/code-containment.coral'), 'utf8');
    const parsed = parseCoralDSL(source);
    expect(parsed.errors).toEqual([]);
    const laid = await layoutNodes(parsed.nodes, parsed.edges, 'code',
      { algorithm: 'layered', direction: 'DOWN' }, false, undefined, undefined, [], operation,
      parsed.semanticInterpretations);
    const renderer = laid.nodes.find(node => node.id === 'renderer')!;
    let checkedTraverse = 0;
    for (const id of ['classRender', 'classVersion']) {
      const route = laid.edgeRouting.get(id)!;
      const points = [route.startPoint, ...route.bendPoints, route.endPoint];
      // Under 0.2.11 BRANDES_KOEPF, one branch aligns straight beneath renderer (0 bends);
      // verify the traverse clearance on every bent branch.
      if (points.length <= 2) continue;
      const traverse = points.slice(1).find((point, index) =>
        Math.abs(point.y - points[index]!.y) < 1e-5 && Math.abs(point.x - points[index]!.x) > 1);
      expect(traverse, id).toBeDefined();
      expect(traverse!.y - renderer.position.y - renderer.height!, id).toBeGreaterThanOrEqual(27);
      checkedTraverse += 1;
    }
    expect(checkedTraverse).toBeGreaterThanOrEqual(1);
  });

  it('keeps a mixed group\'s automatic children in its padding on the canvas (D6)', async () => {
    const lay = async (source: string) => {
      const parsed = parseCoralDSL(source);
      expect(parsed.errors).toEqual([]);
      const laid = await layoutNodes(parsed.nodes, parsed.edges, 'flowchart', { algorithm: 'layered', direction: 'RIGHT' },
        true, undefined, undefined, [], 'incremental', parsed.semanticInterpretations);
      return new Map(laid.nodes.map(node => [node.id, node.position]));
    };
    const automatic = await lay('@diagram flowchart\ng group as "G" {\n  a process as "A"\n  b process as "B"\n}\n');
    const mixed = await lay('@diagram flowchart\ng group as "G" {\n  a process as "A"\n  b process as "B" @ (300, 200)\n}\n');
    // Child positions are local to the group: A keeps its inset, B its authored coordinates.
    expect(mixed.get('g.a')).toEqual(automatic.get('g.a'));
    expect(mixed.get('g.b')).toEqual({ x: 300, y: 200 });
  });

  it('executes source proximity through the canvas candidate adapter without changing source identity', async () => {
    const source = '@diagram flowchart\na process\nb process\nc process\n' +
      'near = a -> b\nfar = b ------> c\n';
    const parsed = parseCoralDSL(source);
    expect(parsed.errors).toEqual([]);
    const before = JSON.stringify(parsed.sourceGraph);
    const laid = await layoutNodes(parsed.nodes, parsed.edges, 'flowchart',
      { algorithm: 'layered', direction: 'DOWN' }, false, undefined,
      undefined, [], 'load', parsed.semanticInterpretations);
    const [a, b, c] = ['a', 'b', 'c'].map((id) => laid.nodes.find((node) => node.id === id)!);
    expect(c.position.y - b.position.y - b.height!)
      .toBeGreaterThan(b.position.y - a.position.y - a.height! + 100);
    expect(laid.diagnostics.filter((item) => item.code.startsWith('layout.proximity.'))).toEqual([]);
    expect(JSON.stringify(parsed.sourceGraph)).toBe(before);
    expect(parsed.sourceGraph?.edges[1]).toMatchObject({ first: { node: 'b' }, second: { node: 'c' }, proximityHint: 6 });
  });

  it('uses clear forward BPMN gaps instead of crossing the return corridor with staircases', async () => {
    const source = readFileSync(resolve(import.meta.dirname,
      '../../browser/test/fixtures/acceptance028/bpmn-loop.coral'), 'utf8');
    const projected = projectInstalledSourceToSuccessor028(source).graph!;
    const original = structuredClone(projected);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected);
    const laid = await layoutNodes(display.nodes, display.edges, 'bpmn',
      { algorithm: 'layered', direction: 'DOWN' }, false, undefined,
      undefined, [], 'load', semanticInterpretations);
    const check = laid.edgeRouting.get('edge-2')!;
    expect(laid.edgeRouting.get('edge-1')!.bendPoints).toHaveLength(0);
    expect(check.bendPoints).toHaveLength(0);
    for (const id of ['edge-3', 'edge-5']) expect(laid.edgeRouting.get(id)!.bendPoints.length).toBeLessThanOrEqual(1);
    expect(projected).toEqual(original);
  });

  it('carries BPMN notation into shared candidate routing and reserves event captions', async () => {
    const source = readFileSync(resolve(import.meta.dirname,
      '../../browser/test/fixtures/acceptance028/bpmn-loop.coral'), 'utf8');
    const projected = projectInstalledSourceToSuccessor028(source).graph!;
    const before = JSON.stringify(projected);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected);
    const laid = await layoutNodes(display.nodes, display.edges, 'bpmn',
      { algorithm: 'layered', direction: 'DOWN' }, false, undefined,
      undefined, [], 'load', semanticInterpretations);
    const received = laid.nodes.find((node) => node.id === 'received')!;
    const route = laid.edgeRouting.get('edge-1')!;
    expect(Math.hypot(route.startPoint.x - received.position.x - received.width! / 2,
      route.startPoint.y - received.position.y - 32)).toBeCloseTo(24, 6);
    const points = [route.startPoint, ...route.bendPoints, route.endPoint];
    for (let i = 1; i < points.length; i++) for (let sample = 0; sample <= 128; sample++) {
      const a = points[i - 1]!; const b = points[i]!; const t = sample / 128;
      const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t;
      expect(x > received.position.x && x < received.position.x + received.width! &&
        y > received.position.y + 68 && y < received.position.y + received.height!).toBe(false);
    }
    expect(JSON.stringify(projected)).toBe(before);
  });

  it('does not let idle catalog ports drift the class spine', async () => {
    const source = readFileSync(resolve(import.meta.dirname,
      '../../render/test/fixtures/uml-class-compare-028.coral'), 'utf8');
    const projected = projectInstalledSourceToSuccessor028(source).graph!;
    const { display, semanticInterpretations } =
      successorSourceDisplayWithSemanticPorts028(projected);
    const laid = await layoutNodes(display.nodes, display.edges, 'uml-class',
      { algorithm: 'layered', direction: 'DOWN' }, false, undefined,
      undefined, [], 'reflow', semanticInterpretations);
    const center = (id: string) => { const node = laid.nodes.find((item) => item.id === id)!;
      return node.position.x + node.width! / 2; };
    expect(center('Order')).toBeCloseTo(center('LineItem'), 6);
    expect(center('LineItem')).toBeCloseTo(center('Product'), 6);
  });

  it('projects source classifier dimensions that fit the production scene in either style', () => {
    const source = readFileSync(resolve(import.meta.dirname,
      '../../browser/test/fixtures/acceptance028/uml-class-chain.coral'), 'utf8');
    const projected = projectInstalledSourceToSuccessor028(source).graph!;
    const display = successorSourceDisplay028(projected);
    for (const sizingMode of ['adaptive', 'hybrid', 'uniform'] as const) {
      const privateNodes = projectDiagramNodes(display.nodes, 'uml-class', undefined, sizingMode);
      const nodes = display.nodes.map((node) => {
        const privateNode = privateNodes.find((item) => item.id === node.id)!;
        return { ...node, dimensions: { width: privateNode.width!, height: privateNode.height! } };
      });
      for (const style of ['lowfi', 'hifi'] as const) {
        const scene = prepareSpatialScene028({ ...display, nodes },
          { style, successorSource: projected });
        expect(scene.parts.find((part) => part.id === 'Middle:outline')).toBeDefined();
      }
    }
  });

  it.each(['RIGHT', 'DOWN'] as const)(
    'projects BPMN gateway caption room into private editor layout in %s', (direction) => {
      const source = readFileSync(resolve(import.meta.dirname,
        '../../browser/test/fixtures/acceptance028/bpmn-branch.coral'), 'utf8');
      const projected = projectInstalledSourceToSuccessor028(source).graph!;
      const display = successorSourceDisplay028(projected);
      for (const sizingMode of ['adaptive', 'hybrid', 'uniform'] as const) {
        const privateNodes = projectDiagramNodes(display.nodes, 'bpmn', undefined,
          sizingMode, direction);
        const nodes = display.nodes.map((node) => {
          const privateNode = privateNodes.find((item) => item.id === node.id)!;
          return { ...node, dimensions: { width: privateNode.width!,
            height: privateNode.height! } };
        });
        for (const style of ['lowfi', 'hifi'] as const) {
          const scene = prepareSpatialScene028({ ...display, nodes },
            { style, layoutDirection: direction, successorSource: projected });
          expect(scene.parts.find((part) => part.id === 'approved:outline')).toBeDefined();
          expect(scene.parts.find((part) => part.id === 'approved:label:1')).toBeDefined();
        }
      }
    });

  it('keeps shared-parent inheritance heads separate after private editor layout', async () => {
    const source = readFileSync(resolve(import.meta.dirname,
      '../../browser/test/fixtures/acceptance028/uml-class-fork.coral'), 'utf8');
    const projected = projectInstalledSourceToSuccessor028(source).graph!;
    const { display, semanticInterpretations } =
      successorSourceDisplayWithSemanticPorts028(projected);
    const laid = await layoutNodes(display.nodes, display.edges, 'uml-class',
      { algorithm: 'layered', direction: 'RIGHT' }, false, undefined,
      undefined, [], 'reflow', semanticInterpretations);
    const parent = laid.nodes.find((node) => node.id === 'Document')!;
    for (const childId of ['Order', 'Quote', 'Invoice']) {
      const child = laid.nodes.find((node) => node.id === childId)!;
      expect(child.position.x).toBeGreaterThan(parent.position.x + parent.width!);
    }
    const contacts = display.edges.map((edge) => laid.edgeRouting.get(edge.id)!.endPoint)
      .sort((left, right) => left.y - right.y);
    expect(contacts).toHaveLength(3);
    for (const contact of contacts) {
      // The classifier outline is aspect-fitted slightly inside its ELK box.
      expect(contact.x).toBeGreaterThan(parent.position.x + parent.width! - 6);
      expect(contact.x).toBeLessThanOrEqual(parent.position.x + parent.width!);
    }
    for (let index = 1; index < contacts.length; index += 1) {
      expect(contacts[index]!.y - contacts[index - 1]!.y).toBeGreaterThanOrEqual(24);
    }
  });

  it.each(['RIGHT', 'LEFT', 'DOWN', 'UP'] as const)(
    'ranks a free UML parent before its children in %s', async (direction) => {
      const source = readFileSync(resolve(import.meta.dirname,
        '../../browser/test/fixtures/acceptance028/uml-class-fork.coral'), 'utf8');
      const projected = projectInstalledSourceToSuccessor028(source).graph!;
      const { display, semanticInterpretations } =
        successorSourceDisplayWithSemanticPorts028(projected);
      const laid = await layoutNodes(display.nodes, display.edges, 'uml-class',
        { algorithm: 'layered', direction }, false, undefined,
        undefined, [], 'reflow', semanticInterpretations);
      const parent = laid.nodes.find((node) => node.id === 'Document')!;
      const child = laid.nodes.find((node) => node.id === 'Order')!;
      if (direction === 'RIGHT') expect(parent.position.x + parent.width!)
        .toBeLessThan(child.position.x);
      if (direction === 'LEFT') expect(child.position.x + child.width!)
        .toBeLessThan(parent.position.x);
      if (direction === 'DOWN') expect(parent.position.y + parent.height!)
        .toBeLessThan(child.position.y);
      if (direction === 'UP') expect(child.position.y + child.height!)
        .toBeLessThan(parent.position.y);
    });

  it('routes source-owned plain edges without binding a named semantic port', async () => {
    const parsed = parseCoralDSL('@diagram architecture\napi service\ndb database\napi -> db\n');
    expect(parsed.errors).toEqual([]);
    for (const direction of ['RIGHT', 'DOWN'] as const) {
      const laid = await layoutNodes(parsed.nodes, parsed.edges, 'architecture',
        { algorithm: 'layered', direction }, false, undefined, undefined, [], 'reflow',
        parsed.semanticInterpretations);
      const api = laid.nodes.find((node) => node.id === 'api')!;
      const route = laid.edgeRouting.get('edge-1');
      expect(route).toBeDefined();
      if (direction === 'RIGHT') expect(route!.startPoint.x)
        .toBeGreaterThan(api.position.x + api.width! / 2);
      else expect(route!.startPoint.y)
        .toBeGreaterThan(api.position.y + api.height! / 2);
      expect(parsed.edges[0]?.sourcePort).toBeUndefined();
      expect(parsed.edges[0]?.targetPort).toBeUndefined();
    }
  });

  it('projects source-owned authored ports into canvas handles and layout without GraphIR 3 ports', async () => {
    const semanticInterpretations = resolveSuccessorGraphNodes028({ version: '4.0.0',
      profile: { id: 'architecture', version: '1.0.0' }, catalog: notationCatalogIdentity028('architecture')!,
      nodes: [{ id: 'api', type: 'service', semanticPorts: [
        { id: 'audit', direction: 'out', anchor: { kind: 'side' } },
      ] }, { id: 'db', type: 'database', semanticPorts: [
        { id: 'receive', direction: 'in', anchor: { kind: 'auto' } },
      ] }],
    });
    const nodes = [{ id: 'api', type: 'service', label: 'API' },
      { id: 'db', type: 'database', label: 'DB' }];
    const edges = [{ id: 'query', source: 'api', target: 'db', sourcePort: 'audit', targetPort: 'receive' }];
    const projected = projectDiagramNodes(nodes, 'architecture', undefined, 'adaptive', 'RIGHT',
      semanticInterpretations);
    expect(projected[0]?.data.authoredSemanticPorts).toEqual([
      { id: 'audit', direction: 'out', anchor: 'side' },
    ]);
    expect(projected[0]?.data.canonical).not.toHaveProperty('ports');
    expect(effectiveNodePorts(nodes[0]!, 'architecture', semanticInterpretations)
      ?.some((port) => port.id === 'audit' && port.direction === 'out')).toBe(true);
    for (const direction of ['RIGHT', 'DOWN'] as const) {
      const laid = await layoutNodes(nodes, edges, 'architecture',
        { algorithm: 'layered', direction }, false, undefined, undefined, [], 'reflow',
        semanticInterpretations);
      expect(laid.diagnostics.filter((item) => item.code === 'layout.port.missing')).toEqual([]);
      expect(laid.nodes.find((node) => node.id === 'api')?.data.resolvedPortAttachments?.audit)
        .toBe(direction === 'RIGHT' ? 'EAST' : 'SOUTH');
      expect(laid.nodes.find((node) => node.id === 'api')?.data.canonical).not.toHaveProperty('ports');
    }
  });
  it('projects a semantic corner hint with a derived canvas offset before and after reflow', async () => {
    const parsed = parseCoralDSL('@diagram architecture\napi service {\n' +
      '  audit port [direction: out, anchor: corner]\n}\n' +
      'db database\nquery = api:audit -> db\n');
    expect(parsed.errors).toEqual([]);
    expect(parsed.semanticInterpretations).toBeDefined();
    const sourceMeaning = JSON.stringify(parsed.sourceGraph);
    const projected = projectDiagramNodes(parsed.nodes, 'architecture', undefined, 'adaptive', 'RIGHT',
      parsed.semanticInterpretations);
    expect(projected[0]?.data.authoredSemanticPorts).toEqual([
      { id: 'audit', direction: 'out', anchor: 'corner' },
    ]);
    expect([0, 1]).toContain(projected[0]?.data.resolvedPortPositions?.audit);
    for (const direction of ['RIGHT', 'DOWN'] as const) {
      const laid = await layoutNodes(parsed.nodes, parsed.edges, 'architecture',
        { algorithm: 'layered', direction }, false, undefined, undefined, [], 'reflow',
        parsed.semanticInterpretations);
      const api = laid.nodes.find((node) => node.id === 'api')!;
      const route = laid.edgeRouting.get('query')!;
      const routeAttachment = attachmentFromBoundaryPoint({ absolutePosition: api.position,
        width: api.width!, height: api.height! }, route.startPoint);
      expect(api.data.resolvedPortAttachments?.audit).toBe(routeAttachment.side);
      expect(api.data.resolvedPortPositions?.audit).toBe(routeAttachment.position! > 0.5 ? 1 : 0);
      expect(api.data.canonical).not.toHaveProperty('ports');
    }
    expect(JSON.stringify(parsed.sourceGraph)).toBe(sourceMeaning);
  });
  it('refuses a source interpretation after the canvas node symbol or variant changes', () => {
    const semanticInterpretations = resolveSuccessorGraphNodes028({ version: '4.0.0',
      profile: { id: 'architecture', version: '1.0.0' }, catalog: notationCatalogIdentity028('architecture')!,
      nodes: [{ id: 'api', type: 'service', symbol: 'arch-service' }],
    });
    for (const changed of [
      { id: 'api', type: 'service', symbol: 'arch-database', label: 'API' },
      { id: 'api', type: 'service', symbol: 'arch-service', variant: 'gateway', label: 'API' },
    ]) {
      expect(() => projectDiagramNodes([changed], 'architecture', undefined, 'adaptive', 'RIGHT',
        semanticInterpretations)).toThrow(/semantic-port-sidecar.*api/);
    }
    expect(() => projectDiagramNodes([{ id: 'api', type: 'service', symbol: 'arch-service', label: 'API' }],
      'flowchart', undefined, 'adaptive', 'RIGHT', semanticInterpretations))
      .toThrow(/semantic-port-sidecar.*api/);
  });
  it.each(['RIGHT', 'DOWN'] as const)(
    'does not invent semantic in/out ports for a generic node under %s reflow',
    async (direction) => {
      const result = await layoutNodes([
        { id: 'a', type: 'service', label: 'A' },
        { id: 'b', type: 'service', label: 'B' },
      ], [{ id: 'e', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in' }],
      'flowchart', { algorithm: 'layered', direction }, false);
      expect(result.diagnostics.filter((item) => item.code === 'layout.port.missing')).toHaveLength(2);
    },
  );

  it('shows free-port handles on the sides ELK actually chose for a cycle', async () => {
    const result = await layoutNodes([
      { id: 'a', type: 'process', label: 'A' },
      { id: 'b', type: 'process', label: 'B' },
    ], [{ id: 'ab', source: 'a', target: 'b' },
      { id: 'ba', source: 'b', target: 'a' }], 'flowchart',
    { algorithm: 'layered', direction: 'RIGHT' }, false);
    let changedFromPreferred = false;
    for (const edge of [{ id: 'ab', source: 'a' }, { id: 'ba', source: 'b' }]) {
      const node = result.nodes.find((item) => item.id === edge.source)!;
      const route = result.edgeRouting.get(edge.id)!;
      const actual = Math.abs(route.startPoint.x - node.position.x) < 1 ? 'WEST' : 'EAST';
      expect(node.data.resolvedPortAttachments?.out).toBe(actual);
      if (actual !== 'EAST') changedFromPreferred = true;
    }
    expect(changedFromPreferred).toBe(true);
  });

  it('does not borrow base-symbol ports when the authored variant is unknown', async () => {
    await expect(layoutNodes([
      { id: 'a', type: 'decision', symbol: 'flowchart-decision', variant: 'missing', label: 'A' },
      { id: 'b', type: 'process', label: 'B' },
    ], [{ id: 'e', source: 'a', target: 'b', sourcePort: 'yes' }], 'flowchart')).rejects.toThrow(/unknown.variant/i);
    expect(effectiveNodePorts({ id: 'a', type: 'decision', symbol: 'flowchart-decision',
      variant: 'missing' }, 'flowchart')).toEqual([]);
  });

  it.each(['RIGHT', 'DOWN'] as const)(
    'attaches an unpinned catalog output on the flow-facing side for %s',
    async (direction) => {
      const result = await layoutNodes([
        { id: 'a', type: 'process', label: 'A' },
        { id: 'b', type: 'process', label: 'B' },
      ], [{ id: 'e', source: 'a', target: 'b' }], 'flowchart',
      { algorithm: 'layered', direction }, false);
      const a = result.nodes.find((node) => node.id === 'a')!;
      const b = result.nodes.find((node) => node.id === 'b')!;
      const start = result.edgeRouting.get('e')!.startPoint;
      if (direction === 'RIGHT') expect(start.x).toBeGreaterThan(a.position.x + a.width! / 2);
      else expect(start.y).toBeGreaterThan(a.position.y + a.height! / 2);
      expect(a.data.resolvedPortAttachments?.out).toBe(direction === 'RIGHT' ? 'EAST' : 'SOUTH');
      expect(b.data.resolvedPortAttachments?.in).toBe(direction === 'RIGHT' ? 'WEST' : 'NORTH');
    },
  );

  it('accepts opaque authoritative port ids without synthesizing handle suffixes', async () => {
    const result = await layoutNodes([
      { id: 'a', type: 'process', label: 'A', ports: [{ id: 'link-in', side: 'EAST', position: 0.5 }] },
      { id: 'b', type: 'process', label: 'B', ports: [{ id: 'receive_out', side: 'WEST', position: 0.5 }] },
    ], [{ id: 'e', source: 'a', target: 'b', sourcePort: 'link-in', targetPort: 'receive_out' }], 'flowchart');

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.some((node) => node.position.x !== 0 || node.position.y !== 0)).toBe(true);
  });

  it('keeps the flow-relative handle side during a canvas-only reprojection', () => {
    const source = [{ id: 'a', type: 'process', label: 'A' }];
    const right = projectDiagramNodes(source, 'flowchart', undefined, 'adaptive', 'RIGHT')[0]!;
    expect(right.data.resolvedPortAttachments).toMatchObject({ in: 'WEST', out: 'EAST' });
    expect(right.data.canonical).not.toHaveProperty('resolvedPortAttachments');
    expect(projectDiagramNodes(source, 'flowchart', undefined, 'adaptive', 'DOWN')[0]?.data
      .resolvedPortAttachments).toMatchObject({ in: 'NORTH', out: 'SOUTH' });
  });

  it('preserves pinned positions and publishes the route recomputed by the shared resolver', async () => {
    const result = await layoutNodes([
      { id: 'a', type: 'process', label: 'A', position: { x: 900, y: 700 }, pinned: true },
      { id: 'b', type: 'process', label: 'B' },
    ], [{ id: 'e', source: 'a', target: 'b' }], 'flowchart', undefined, false);

    expect(result.nodes.find((node) => node.id === 'a')?.position).toEqual({ x: 900, y: 700 });
    expect(result.edgeRouting.has('e')).toBe(true);
  });

  it('uses resolved outer-frame coordinates for nested authored positions and keeps groups auto-sized', async () => {
    const result = await layoutNodes([
      {
        id: 'group', type: 'group', label: 'Group',
        layoutOptions: { padding: { left: 25, right: 10, top: 15, bottom: 10 } },
      },
      {
        id: 'child', type: 'process', label: 'Child', parent: 'group',
        position: { x: 7, y: 9 }, dimensions: { width: 220, height: 40 },
      },
    ], [], 'flowchart', undefined, true);

    expect(result.nodes.find((node) => node.id === 'child')?.position).toEqual({ x: 32, y: 24 });
    expect(result.nodes.find((node) => node.id === 'group')?.width).toBeGreaterThanOrEqual(262);
  });

  it.each(['load', 'reflow'] as const)('publishes an expanded container frame consistently to node internals and scene on %s', async operation => {
    const source = spatialQualityFixtures029.find(fixture => fixture.id === 'nested')!.source;
    const parsed = parseCoralDSL(source);
    expect(parsed.errors).toEqual([]);
    const before = structuredClone(parsed.nodes);
    const laid = await layoutNodes(parsed.nodes, parsed.edges, 'architecture',
      { algorithm: 'layered', direction: 'RIGHT' }, true, undefined, undefined, [], operation,
      parsed.semanticInterpretations);
    const group = laid.nodes.find(node => node.id === 'cluster')!;
    expect(group.data.width).toBe(group.width);
    expect(group.data.height).toBe(group.height);
    const graph = materializeRenderGraph({ version: '3.0.0' as const, id: 'nested-publication',
      metadata: { notation: 'architecture' }, nodes: nestCanonicalNodes(parsed.nodes), edges: parsed.edges }, laid.nodes);
    const scene = prepareSpatialScene028(graph, { style: 'lowfi',
      edgeRoutes: new Map([...laid.edgeRouting].map(([id, route]) => [id, [{ startPoint: route.startPoint,
        bendPoints: route.bendPoints, endPoint: route.endPoint }]])) });
    const frame = scene.nodes.find(node => node.node.id === 'cluster')!;
    expect(frame).toMatchObject({ width: group.width, height: group.height });
    for (const id of ['cluster.api', 'cluster.worker']) {
      const child = scene.nodes.find(node => node.node.id === id)!;
      expect(child.x).toBeGreaterThan(frame.x);
      expect(child.x + child.width).toBeLessThan(frame.x + frame.width);
      expect(child.y).toBeGreaterThan(frame.y);
      expect(child.y + child.height).toBeLessThan(frame.y + frame.height);
    }
    expect(parsed.nodes).toEqual(before);
  });

  it('retains final verified routes after the shared resolver auto-sizes a container', async () => {
    const parsed = parseCoralDSL('@diagram flowchart\ngroup group as "Group" {\n  child process as "Child"\n}\n' +
      'outside process as "Outside" @ (700, 0)\ne = group.child -> outside\nroute edge e {\n' +
      '  nearTarget = waypoint relative to node outside offset (400, 400)\n}\n');
    expect(parsed.errors).toEqual([]);
    const result = await layoutNodes(parsed.nodes, parsed.edges, 'flowchart', undefined,
      true, undefined, undefined, [], 'load', parsed.semanticInterpretations);
    expect(result.nodes.find((node) => node.id === 'group')?.width).toBeGreaterThan(0);
    expect(result.edgeRouting.get('e')?.bendPoints).toContainEqual(expect.objectContaining({
      x: expect.any(Number), y: expect.any(Number),
    }));
  });

  it('does not turn BPMN gateway labels into authored port references during layout', async () => {
    const nodes = [
      { id: 'gateway', type: 'decision', symbol: 'bpmn-gateway-exclusive', label: 'Choice' },
      { id: 'task', type: 'service', symbol: 'bpmn-task', label: 'Task' },
    ];
    const edges = [
      { id: 'yes', source: 'gateway', target: 'task', label: 'yes' },
      { id: 'no', source: 'gateway', target: 'task', label: 'no' },
      { id: 'other', source: 'gateway', target: 'task', label: 'otherwise' },
    ];
    await layoutNodes(nodes, edges, 'bpmn');
    expect(edges.every((edge) => !('sourcePort' in edge) && !('targetPort' in edge))).toBe(true);
  });

  it('preserves an explicit BPMN port reference without inferring another from a label', async () => {
    const nodes = [
      { id: 'custom', type: 'decision', symbol: 'bpmn-gateway-exclusive', label: 'Custom', ports: [
        { id: 'custom-a', side: 'EAST' as const, position: 0.25 },
        { id: 'custom-b', side: 'EAST' as const, position: 0.75 },
      ] },
      { id: 'empty', type: 'decision', symbol: 'bpmn-gateway-exclusive', label: 'Empty', ports: [] },
      { id: 'target', type: 'service', symbol: 'bpmn-task', label: 'Target', ports: [] },
    ];
    const edges = [
      { id: 'custom-edge', source: 'custom', target: 'target', label: 'no', sourcePort: 'custom-b' },
      { id: 'empty-edge', source: 'empty', target: 'target', label: 'yes' },
    ];
    await layoutNodes(nodes, edges, 'bpmn');
    expect(edges).toEqual([
      expect.objectContaining({ sourcePort: 'custom-b' }),
      expect.not.objectContaining({ sourcePort: expect.anything() }),
    ]);
    expect(edges.every((edge) => edge.targetPort === undefined)).toBe(true);
  });

  it('drops routes incident to descendants moved by a recovery position overlay', () => {
    const graphNodes = [
      { id: 'group', type: 'group', label: 'Group' },
      { id: 'child', type: 'process', label: 'Child', parent: 'group' },
      { id: 'external', type: 'process', label: 'External' },
      { id: 'other-a', type: 'process', label: 'Other A' },
      { id: 'other-b', type: 'process', label: 'Other B' },
    ];
    const graphEdges = [
      { id: 'affected', source: 'child', target: 'external' },
      { id: 'retained', source: 'other-a', target: 'other-b' },
    ];
    const route = (id: string, sourceId: string, targetId: string) => ({
      id, sourceId, targetId, startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 }, bendPoints: [],
    });
    const routes = new Map([
      ['affected', route('affected', 'child', 'external')],
      ['retained', route('retained', 'other-a', 'other-b')],
    ]);
    const laidNodes = graphNodes.map((node) => ({
      id: node.id, type: 'symbol', position: { x: 0, y: 0 }, data: {} as never,
    }));

    const retained = retainRoutesAfterPositionOverlay(
      graphNodes, graphEdges, laidNodes, routes,
      { group: { x: 400, y: 300 }, 'other-a': { x: 0, y: 0 } },
    );
    expect([...retained.keys()]).toEqual(['retained']);
  });

  it('retains shared diagnostics for an invalid canonical endpoint', async () => {
    const result = await layoutNodes([
      { id: 'a', type: 'process', label: 'A', ports: [] },
      { id: 'b', type: 'process', label: 'B' },
    ], [{ id: 'e', source: 'a', target: 'b', sourcePort: 'missing' }], 'flowchart');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'layout.port.missing' }));
  });
});
