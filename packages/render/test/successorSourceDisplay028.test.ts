import { describe, expect, it } from 'vitest';
import { parseInstalledDocument028 } from '../src/installedDocument028.js';
import { notationRegistry } from '../src/notations/index.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplay028, successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { shapeRegistry } from '../src/shapes/index.js';
import { stencilFitPoint028 } from '../src/stencilAnchorGeometry028.js';

describe('read-only display of installed successor source meaning', () => {
  it.each(notationRegistry.getAll().map((notation) => notation.id).filter((id) => id !== 'erd'))(
    'displays a saved %s document without changing its installed profile meaning', (diagramType) => {
      const body = diagramType === 'uml-sequence' ? 'example participant' : 'example group';
      const source = `@diagram ${diagramType}\n${body}\n`;
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const display = successorSourceDisplay028(projected.graph!);
      expect(display).toEqual(parseInstalledDocument028(source).graph);
      expect(display).toMatchObject({ version: '3.0.0', metadata: { notation: diagramType } });
      expect(projected.graph).toMatchObject({ version: '4.0.0',
        catalog: expect.objectContaining({ id: diagramType }) });
    });

  it('keeps disabled Chen source intact and refuses semantic display projection', () => {
    const source = '@diagram erd\nexample entity\n';
    const parsed = parseInstalledDocument028(source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(parsed.header.source).toBe(source);
    expect(parsed.header.diagnostics.map((item) => item.code))
      .toEqual(['header.diagram.disabled']);
    expect(projected.diagnostics.map((item) => item.code))
      .toEqual(['header.diagram.disabled']);
    expect(projected.graph).toBeUndefined();
  });

  it('keeps written endpoint order and marker placement in a non-sequence display', () => {
    const source = '@diagram architecture\nclient service\nserver service\n' +
      'reply = client:in <- server:out [calls] as "Reply"';
    const projected = projectInstalledSourceToSuccessor028(source);
    const display = successorSourceDisplay028(projected.graph!);
    expect(display.edges[0]).toMatchObject({
      id: 'reply', source: 'client', sourcePort: 'in', target: 'server', targetPort: 'out',
      sourceEnd: { marker: { kind: 'arrow' } },
    });
    expect(display.edges[0]).not.toHaveProperty('targetEnd');
    expect(projected.graph?.edges[0]).toMatchObject({
      first: { node: 'client', port: 'in' }, second: { node: 'server', port: 'out' },
      direction: 'second-to-first',
    });
  });

  it('displays reverse sequence sender and receiver without changing successor endpoint order', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'reply = client <- server as "done"';
    const projected = projectInstalledSourceToSuccessor028(source);
    const display = successorSourceDisplay028(projected.graph!);
    expect(projected.graph?.edges[0]).toMatchObject({
      first: { node: 'client' }, second: { node: 'server' }, direction: 'second-to-first',
    });
    expect(display.edges[0]).toMatchObject({ source: 'server', target: 'client' });
    expect(display.interaction?.messages[0]).toMatchObject({
      sourceParticipantId: 'server', targetParticipantId: 'client',
    });
  });

  it('refuses a directed source edge when its display ends would depict a neutral line', () => {
    const projected = projectInstalledSourceToSuccessor028('@diagram block\na block\nb block\na -- b');
    expect(projected.diagnostics).toEqual([]);
    projected.graph!.edges[0]!.direction = 'first-to-second';
    expect(() => successorSourceDisplay028(projected.graph!))
      .toThrow('direction cannot be displayed');
  });

  it('keeps source-owned semantic ports coupled to its read-only SVG display', async () => {
    const projected = projectInstalledSourceToSuccessor028(
      '@diagram architecture\napi service\ndb database\napi -> db [reads]');
    expect(projected.diagnostics).toEqual([]);
    const source = projected.graph!;
    source.nodes[0]!.semanticPorts = [{ id: 'outbound', direction: 'out', anchor: { kind: 'side' } }];
    source.nodes[1]!.semanticPorts = [{ id: 'receive', direction: 'in', anchor: { kind: 'auto' } }];
    source.edges[0]!.first.port = 'outbound';
    source.edges[0]!.second.port = 'receive';
    expect(() => successorSourceDisplay028(source)).toThrow(/cannot preserve/);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(source);
    expect(display.nodes.every((node) => node.ports === undefined && !('semanticPorts' in node))).toBe(true);
    expect(semanticInterpretations.get('api')?.semanticPorts.map((port) => port.id))
      .toContain('outbound');
    for (const direction of ['RIGHT', 'DOWN'] as const) {
      const laid = await layoutGraphForSvg(display, { direction, semanticInterpretations });
      expect(laid.edgeRoutes.get(display.edges[0]!.id)).toHaveLength(1);
      expect(laid.nodes.every((node) => node.ports === undefined)).toBe(true);
    }
    expect(source.nodes[0]?.semanticPorts).toEqual([
      { id: 'outbound', direction: 'out', anchor: { kind: 'side' } },
    ]);
  });

  it('reflows a source-declared side port while keeping a source-declared exact pin fixed', async () => {
    const source = '@diagram architecture\napi service {\n  audit port [direction: out, anchor: side]\n  pinned port [direction: out, anchor: E]\n}\ndb database {\n  receive port [direction: in]\n}\nsideEdge = api:audit -> db:receive [reads]\nfixedEdge = api:pinned -> db:receive [reads]';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
    const right = await layoutGraphForSvg(display, { direction: 'RIGHT', semanticInterpretations });
    const down = await layoutGraphForSvg(display, { direction: 'DOWN', semanticInterpretations });
    const attachment = (laid: typeof right, edgeId: string) => {
      const api = laid.nodes.find((node) => node.id === 'api')!;
      const start = laid.edgeRoutes.get(edgeId)![0]!.startPoint;
      return { api, start };
    };
    const sideRight = attachment(right, 'sideEdge');
    const sideDown = attachment(down, 'sideEdge');
    const fixedRight = attachment(right, 'fixedEdge');
    const fixedDown = attachment(down, 'fixedEdge');
    const shape = shapeRegistry.get('rectangle')!;
    const east = (node: typeof sideRight.api) => stencilFitPoint028(shape, { x: 1, y: 0.5 },
      node.dimensions!.width, node.dimensions!.height);
    const south = (node: typeof sideDown.api) => stencilFitPoint028(shape, { x: 0.5, y: 1 },
      node.dimensions!.width, node.dimensions!.height);
    expect(sideRight.start.x).toBeCloseTo(sideRight.api.position!.x +
      sideRight.api.dimensions!.width * east(sideRight.api).x);
    expect(sideDown.start.y).toBeCloseTo(sideDown.api.position!.y +
      sideDown.api.dimensions!.height * south(sideDown.api).y);
    expect(fixedRight.start.x).toBeCloseTo(fixedRight.api.position!.x +
      fixedRight.api.dimensions!.width * east(fixedRight.api).x);
    expect(fixedDown.start.x).toBeCloseTo(fixedDown.api.position!.x +
      fixedDown.api.dimensions!.width * east(fixedDown.api).x);
    expect(projected.graph?.nodes[0]?.semanticPorts).toMatchObject([
      { id: 'audit', anchor: { kind: 'side' } }, { id: 'pinned', anchor: { kind: 'exact', position: 'E' } },
    ]);
    expect(display.nodes.every((node) => node.ports === undefined)).toBe(true);
  });

  it('rejects sequence semantic ports until the sequence scene has a port path', () => {
    const projected = projectInstalledSourceToSuccessor028(
      '@diagram uml-sequence\nclient participant\nserver participant\nclient -> server as "load()"');
    expect(projected.diagnostics).toEqual([]);
    const source = projected.graph!;
    source.nodes[0]!.semanticPorts = [{ id: 'send', direction: 'out' }];
    expect(() => successorSourceDisplay028(source)).toThrow(/Sequence semantic ports/);
    expect(() => successorSourceDisplayWithSemanticPorts028(source)).toThrow(/sequence semantic-port sidecar/);
  });
});
