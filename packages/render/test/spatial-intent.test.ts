import { describe, expect, it } from 'vitest';
import type { ElkNode } from 'elkjs';
import type { GraphIR } from '@graph-ir/core';
import { bpmnGatewayFrame028 } from '../src/bpmnGatewayVisual028.js';
import {
  canPublishResolvedLayout,
  resolveSpatialLayout,
  type LayoutEngine,
} from '../src/layout/index.js';

function graph(overrides: Partial<GraphIR> = {}): GraphIR {
  return { version: '3.0.0', id: 'g', nodes: [], edges: [], ...overrides };
}

const echoEngine: LayoutEngine = {
  async layout(input: ElkNode): Promise<ElkNode> {
    const place = (node: ElkNode): ElkNode => ({
      ...node,
      x: node.x ?? 0,
      y: node.y ?? 0,
      children: node.children?.map(place),
    });
    return {
      ...input,
      width: 600,
      height: 400,
      children: input.children?.map(place),
      edges: input.edges?.map((edge) => ({ ...edge, sections: [] })),
    };
  },
};

describe('GraphIR 3 authored spatial intent', () => {
  it.each(['RIGHT', 'LEFT'] as const)('keeps independent overlapping cycle returns on distinct lanes in %s', async (direction) => {
    const nodes = ['a', 'b', 'c', 'd'].map((id, index) => ({ id,
      position: { x: (direction === 'RIGHT' ? index : 3 - index) * 200, y: 0 },
      width: 100, height: 60 }));
    const upper = (id: string) => ({ x: nodes.find((node) => node.id === id)!.position.x + 50, y: 0 });
    const route = (id: string, source: string, target: string, y: number) => ({ id,
      sections: [{ startPoint: upper(source), endPoint: upper(target),
        bendPoints: [{ x: upper(source).x, y }, { x: upper(target).x, y }] }] });
    const input = graph({ metadata: { notation: 'flowchart' },
      nodes: nodes.map(({ id, width, height }) => ({ id, type: 'process', dimensions: { width, height } })),
      edges: [{ id: 'ab', source: 'a', target: 'b' }, { id: 'bc', source: 'b', target: 'c' },
        { id: 'cd', source: 'c', target: 'd' }, { id: 'ca', source: 'c', target: 'a' },
        { id: 'db', source: 'd', target: 'b' }] });
    const ca = route('ca', 'c', 'a', -30); const db = route('db', 'd', 'b', -60);
    const result = await resolveSpatialLayout({ graph: input, revision: direction,
      operation: 'load', defaults: { algorithm: 'layered', direction },
      candidateLayout: { nodes: nodes.map((node) => ({ ...node, absolutePosition: node.position })),
        edges: [ca, db], width: 700, height: 100, effectiveOptions: {}, diagnostics: [] } });
    expect(result.edges.find((edge) => edge.id === 'ca')!.sections).toEqual(ca.sections);
    expect(result.edges.find((edge) => edge.id === 'db')!.sections).toEqual(db.sections);
  });

  it.each(['blocked', 'pinned', 'named port', 'parallel'] as const)(
    'preserves a horizontal feedback route with %s intent or obstacles', async (caseName) => {
      const frames = { work: { x: 0, y: 100, width: 100, height: 60 },
        choice: { x: 200, y: 100, width: 100, height: 100 },
        ...(caseName === 'blocked' ? {
          above: { x: 40, y: 0, width: 20, height: 80 },
          below: { x: 40, y: 220, width: 20, height: 80 },
        } : {}) };
      const bends = [{ x: 330, y: 150 }, { x: 330, y: 320 },
        { x: -30, y: 320 }, { x: -30, y: 130 }];
      const input = graph({ metadata: { notation: 'flowchart' },
        nodes: Object.entries(frames).map(([id, frame]) => ({ id, type: 'process',
          dimensions: { width: frame.width, height: frame.height },
          ...(caseName === 'pinned' && id === 'work'
            ? { position: { x: frame.x, y: frame.y }, pinned: true } : {}),
          ...(caseName === 'named port' && id === 'choice'
            ? { ports: [{ id: 'retry', side: 'EAST' as const, position: 0.5 }] } : {}) })),
        edges: [{ id: 'forward', source: 'work', target: 'choice' },
          { id: 'retry', source: 'choice', target: 'work',
            ...(caseName === 'named port' ? { sourcePort: 'retry' } : {}) },
          ...(caseName === 'parallel' ? [{ id: 'other', source: 'choice', target: 'work' }] : [])] });
      const original = structuredClone(input);
      const result = await resolveSpatialLayout({ graph: input, revision: caseName,
        operation: 'load', defaults: { algorithm: 'layered', direction: 'RIGHT' },
        candidateLayout: { nodes: Object.entries(frames).map(([id, frame]) => ({ id,
          position: { x: frame.x, y: frame.y }, absolutePosition: { x: frame.x, y: frame.y },
          width: frame.width, height: frame.height })),
          edges: [{ id: 'forward', sections: [] },
            { id: 'retry', sections: [{ startPoint: { x: 300, y: 150 },
              bendPoints: bends, endPoint: { x: 0, y: 130 } }] }],
          width: 400, height: 340, effectiveOptions: {}, diagnostics: [] } });
      expect(result.edges.find((edge) => edge.id === 'retry')!.sections[0]!.bendPoints).toEqual(bends);
      expect(input).toEqual(original);
    });

  it.each(['defaults', 'default ELK options', 'ELK options'] as const)(
    'honors a non-layered BPMN algorithm supplied through %s', async (source) => {
      const input = graph({ metadata: { notation: 'bpmn' },
        nodes: ['a', 'b', 'c'].map((id) => ({ id, type: 'bpmn-task',
          dimensions: { width: 100, height: 100 } })),
        edges: [{ id: 'ab', source: 'a', target: 'b' },
          { id: 'bc', source: 'b', target: 'c' }] });
      const expected = await resolveSpatialLayout({ graph: input,
        revision: 'explicit-box', operation: 'load',
        defaults: { algorithm: 'layered', direction: 'DOWN' },
        options: { algorithm: 'box' } });
      const actual = await resolveSpatialLayout({ graph: input,
        revision: 'box-equivalence', operation: 'load',
        defaults: { algorithm: source === 'defaults' ? 'box' : 'layered',
          direction: 'DOWN', ...(source === 'default ELK options'
            ? { elkOptions: { 'elk.algorithm': 'box' } } : {}) },
        ...(source === 'ELK options'
          ? { options: { elkOptions: { 'elk.algorithm': 'box' } } } : {}) });
      expect(actual.nodes.map(({ id, absolutePosition }) => ({ id, absolutePosition })))
        .toEqual(expected.nodes.map(({ id, absolutePosition }) => ({ id, absolutePosition })));
      expect(actual.nodes[0]!.absolutePosition.y).toBe(actual.nodes[1]!.absolutePosition.y);
      expect(actual.nodes[0]!.absolutePosition.x).not.toBe(actual.nodes[1]!.absolutePosition.x);
    });

  it('keeps the ELK gateway branch when every one-bend lane crosses a node', async () => {
    const bends = [{ x: 250, y: 50 }, { x: 250, y: 150 },
      { x: 475, y: 150 }, { x: 475, y: 450 }];
    const frames = { gateway: { x: 100, y: 0, width: 100, height: 100 },
      blocker: { x: 285, y: 200, width: 170, height: 80 },
      approve: { x: 300, y: 500, width: 140, height: 70 } };
    const result = await resolveSpatialLayout({ revision: 'blocked-branch-shortcut',
      operation: 'load', graph: graph({ metadata: { notation: 'flowchart' },
        nodes: Object.entries(frames).map(([id, frame]) => ({ id,
          type: id === 'gateway' ? 'decision' : 'process',
          dimensions: { width: frame.width, height: frame.height } })),
        edges: [{ id: 'branch', source: 'gateway', target: 'approve' }] }),
      candidateLayout: { nodes: Object.entries(frames).map(([id, frame]) => ({ id,
        position: { x: frame.x, y: frame.y },
        absolutePosition: { x: frame.x, y: frame.y },
        width: frame.width, height: frame.height })),
        edges: [{ id: 'branch', sections: [{ startPoint: { x: 200, y: 50 },
          bendPoints: bends, endPoint: { x: 370, y: 500 } }] }],
        width: 500, height: 570, effectiveOptions: {}, diagnostics: [] },
    });
    // The engine branch is kept; its diagonal final leg is squared with one elbow.
    const section = result.edges[0]!.sections[0]!;
    expect(section.bendPoints.slice(0, bends.length)).toEqual(bends);
    expect(section.bendPoints).toHaveLength(bends.length + 1);
    expect(section.bendPoints.at(-1)!.y).toBe(450);
    expect(section.bendPoints.at(-1)!.x).toBeCloseTo(section.endPoint.x, 6);
  });

  it('keeps multiple return sources at distinct parent contacts', async () => {
    const result = await resolveSpatialLayout({ revision: 'feedback-fan-in',
      operation: 'load', graph: graph({ metadata: { notation: 'flowchart' },
        nodes: ['A', 'B', 'C'].map((id) => ({ id, type: 'process',
          dimensions: { width: 100, height: 60 } })),
        edges: [{ id: 'ab', source: 'A', target: 'B' },
          { id: 'ac', source: 'A', target: 'C' },
          { id: 'ba', source: 'B', target: 'A' },
          { id: 'ca', source: 'C', target: 'A' }] }),
      candidateLayout: { nodes: [
        { id: 'A', position: { x: 300, y: 0 },
          absolutePosition: { x: 300, y: 0 }, width: 100, height: 60 },
        { id: 'B', position: { x: 0, y: 200 },
          absolutePosition: { x: 0, y: 200 }, width: 100, height: 60 },
        { id: 'C', position: { x: 150, y: 200 },
          absolutePosition: { x: 150, y: 200 }, width: 100, height: 60 },
      ], edges: [
        { id: 'ab', sections: [] }, { id: 'ac', sections: [] },
        { id: 'ba', sections: [{ startPoint: { x: 100, y: 220 },
          bendPoints: [{ x: 270, y: 220 }, { x: 270, y: 20 }],
          endPoint: { x: 300, y: 20 } }] },
        { id: 'ca', sections: [{ startPoint: { x: 250, y: 240 },
          bendPoints: [{ x: 280, y: 240 }, { x: 280, y: 40 }],
          endPoint: { x: 300, y: 40 } }] },
      ], width: 400, height: 260, effectiveOptions: {}, diagnostics: [] },
    });
    const ba = result.edges.find((edge) => edge.id === 'ba')!.sections[0]!;
    const ca = result.edges.find((edge) => edge.id === 'ca')!.sections[0]!;
    // The old B return crossed C's body at y=220. Repair that corridor
    // while keeping the two existing arrival contacts distinct.
    expect(ba.endPoint.y).not.toBe(ca.endPoint.y);
    for (const section of [ba, ca]) {
      const points = [section.startPoint, ...section.bendPoints, section.endPoint];
      for (let i = 1; i < points.length; i++) for (let step = 1; step < 100; step++) {
        const t = step / 100, x = points[i - 1]!.x + t * (points[i]!.x - points[i - 1]!.x);
        const y = points[i - 1]!.y + t * (points[i]!.y - points[i - 1]!.y);
        expect(x > 150 && x < 250 && y > 200 && y < 260).toBe(false);
      }
    }
  });

  it('keeps parallel feedback connectors on distinct ELK lanes', async () => {
    const result = await resolveSpatialLayout({ revision: 'parallel-feedback',
      operation: 'load', graph: graph({ metadata: { notation: 'flowchart' },
        nodes: [{ id: 'A', type: 'process', dimensions: { width: 100, height: 60 } },
          { id: 'B', type: 'process', dimensions: { width: 100, height: 60 } }],
        edges: [{ id: 'forward', source: 'A', target: 'B' },
          { id: 'retry', source: 'B', target: 'A' },
          { id: 'update', source: 'B', target: 'A' }] }),
      candidateLayout: { nodes: [
        { id: 'A', position: { x: 100, y: 0 },
          absolutePosition: { x: 100, y: 0 }, width: 100, height: 60 },
        { id: 'B', position: { x: 0, y: 200 },
          absolutePosition: { x: 0, y: 200 }, width: 100, height: 60 },
      ], edges: [
        { id: 'forward', sections: [{ startPoint: { x: 150, y: 60 },
          bendPoints: [], endPoint: { x: 50, y: 200 } }] },
        { id: 'retry', sections: [{ startPoint: { x: 100, y: 225 },
          bendPoints: [{ x: 220, y: 225 }, { x: 220, y: 25 }],
          endPoint: { x: 200, y: 25 } }] },
        { id: 'update', sections: [{ startPoint: { x: 100, y: 240 },
          bendPoints: [{ x: 240, y: 240 }, { x: 240, y: 40 }],
          endPoint: { x: 200, y: 40 } }] },
      ], width: 250, height: 260, effectiveOptions: {}, diagnostics: [] },
    });
    const retry = result.edges.find((edge) => edge.id === 'retry')!.sections[0]!;
    const update = result.edges.find((edge) => edge.id === 'update')!.sections[0]!;
    expect(retry.bendPoints).toEqual([{ x: 220, y: 225 }, { x: 220, y: 25 }]);
    expect(update.bendPoints).toEqual([{ x: 240, y: 240 }, { x: 240, y: 40 }]);
  });

  it('keeps an ELK return route when its exterior side lane is blocked', async () => {
    const frames = { upper: { x: 100, y: 0, width: 100, height: 60 },
      lower: { x: 0, y: 200, width: 100, height: 60 },
      blocker: { x: -28, y: 100, width: 30, height: 30 } };
    const result = await resolveSpatialLayout({ revision: 'blocked-feedback-lane',
      operation: 'load', graph: graph({ metadata: { notation: 'flowchart' },
        nodes: Object.entries(frames).map(([id, frame]) => ({ id, type: 'process',
          dimensions: { width: frame.width, height: frame.height } })),
        edges: [{ id: 'forward', source: 'upper', target: 'lower' },
          { id: 'return', source: 'lower', target: 'upper' }] }),
      candidateLayout: { nodes: Object.entries(frames).map(([id, frame]) => ({ id,
        position: { x: frame.x, y: frame.y },
        absolutePosition: { x: frame.x, y: frame.y },
        width: frame.width, height: frame.height })),
        edges: [{ id: 'forward', sections: [{ startPoint: { x: 150, y: 60 },
          bendPoints: [], endPoint: { x: 50, y: 200 } }] },
        { id: 'return', sections: [{ startPoint: { x: 100, y: 230 },
          bendPoints: [{ x: 220, y: 230 }, { x: 220, y: 30 }],
          endPoint: { x: 200, y: 30 } }] }],
        width: 230, height: 260, effectiveOptions: {}, diagnostics: [] },
    });
    const returning = result.edges.find((edge) => edge.id === 'return')!.sections[0]!;
    expect(returning.bendPoints).toEqual([{ x: 220, y: 230 }, { x: 220, y: 30 }]);
    expect(returning.endPoint.x).toBe(200);
  });

  it('keeps a named feedback port instead of using a generated side lane', async () => {
    const result = await resolveSpatialLayout({ revision: 'authored-feedback-port',
      operation: 'load', graph: graph({ metadata: { notation: 'flowchart' },
        nodes: [
          { id: 'upper', type: 'process', dimensions: { width: 100, height: 60 } },
          { id: 'lower', type: 'process', dimensions: { width: 100, height: 60 },
            ports: [{ id: 'return', side: 'EAST', position: 0.5 }] },
        ], edges: [{ id: 'forward', source: 'upper', target: 'lower' },
          { id: 'return', source: 'lower', sourcePort: 'return', target: 'upper' }] }),
      candidateLayout: { nodes: [
        { id: 'upper', position: { x: 100, y: 0 },
          absolutePosition: { x: 100, y: 0 }, width: 100, height: 60 },
        { id: 'lower', position: { x: 0, y: 200 },
          absolutePosition: { x: 0, y: 200 }, width: 100, height: 60 },
      ], edges: [{ id: 'forward', sections: [{ startPoint: { x: 150, y: 60 },
        bendPoints: [], endPoint: { x: 50, y: 200 } }] },
      { id: 'return', sections: [{ startPoint: { x: 100, y: 230 },
        bendPoints: [{ x: 220, y: 230 }, { x: 220, y: 30 }],
        endPoint: { x: 200, y: 30 } }] }],
      width: 230, height: 260, effectiveOptions: {}, diagnostics: [] },
    });
    const returning = result.edges.find((edge) => edge.id === 'return')!.sections[0]!;
    expect(returning.startPoint).toEqual({ x: 100, y: 230 });
    expect(returning.bendPoints).toEqual([{ x: 220, y: 230 }, { x: 220, y: 30 }]);
  });

  it('spaces class heads inside an enclosing group', async () => {
    const frames = { G: { x: 0, y: 0, width: 500, height: 500 },
      P: { x: 50, y: 50, width: 200, height: 120 },
      A: { x: 50, y: 350, width: 20, height: 20 },
      B: { x: 250, y: 350, width: 20, height: 20 } };
    const node = (id: keyof typeof frames) => ({ id, type: 'class', parent: 'G',
      dimensions: { width: frames[id].width, height: frames[id].height },
      classifier: { kind: 'class' as const, name: id,
        compartments: [{ id: 'name', kind: 'name' as const }] } });
    const result = await resolveSpatialLayout({ revision: 'nested-class-heads',
      operation: 'load', graph: graph({ metadata: { notation: 'uml-class' },
        nodes: [{ id: 'G', type: 'group', dimensions: { width: 500, height: 500 },
          children: [node('P'), node('A'), node('B')] }],
        edges: [{ id: 'a-base', source: 'A', target: 'P', type: 'inheritance' },
          { id: 'b-base', source: 'B', target: 'P', type: 'inheritance' }] }),
      candidateLayout: { nodes: Object.entries(frames).map(([id, frame]) => ({ id,
        ...(id === 'G' ? {} : { parentId: 'G' }),
        position: { x: frame.x, y: frame.y },
        absolutePosition: { x: frame.x, y: frame.y },
        width: frame.width, height: frame.height })),
        edges: [{ id: 'a-base', sections: [{ startPoint: { x: 60, y: 350 },
          bendPoints: [{ x: 60, y: 300 }, { x: 149, y: 300 }, { x: 149, y: 180 }],
          endPoint: { x: 149, y: 170 } }] },
        { id: 'b-base', sections: [{ startPoint: { x: 260, y: 350 },
          bendPoints: [{ x: 260, y: 300 }, { x: 151, y: 300 }, { x: 151, y: 180 }],
          endPoint: { x: 151, y: 170 } }] }],
        width: 500, height: 500, effectiveOptions: {}, diagnostics: [] },
    });
    const contacts = result.edges.map((edge) => edge.sections.at(-1)!.endPoint.x)
      .sort((a, b) => a - b);
    expect(contacts[1]! - contacts[0]!).toBeGreaterThanOrEqual(24);
  });

  it('keeps clear candidate routes when reordering free triangle heads would cross a node', async () => {
    const nodes = [
      { id: 'P', type: 'class', classifier: { kind: 'class' as const, name: 'P',
        compartments: [{ id: 'name', kind: 'name' as const }] } },
      { id: 'A', type: 'class' }, { id: 'B', type: 'class' },
      { id: 'X', type: 'process' },
    ];
    const positions = { P: { x: 0, y: 0, width: 200, height: 120 },
      A: { x: 0, y: 300, width: 20, height: 20 },
      B: { x: 160, y: 300, width: 20, height: 20 },
      X: { x: 50, y: 122, width: 60, height: 20 } };
    const result = await resolveSpatialLayout({ revision: 'triangle-reorder-obstacle',
      operation: 'load', graph: graph({ metadata: { notation: 'uml-class' },
        nodes: nodes.map((node) => ({ ...node, dimensions: {
          width: positions[node.id as keyof typeof positions].width,
          height: positions[node.id as keyof typeof positions].height,
        } })), edges: [
          { id: 'a-base', source: 'A', target: 'P', type: 'inheritance' },
          { id: 'b-base', source: 'B', target: 'P', type: 'inheritance' },
        ] }), candidateLayout: {
        nodes: nodes.map((node) => { const frame = positions[node.id as keyof typeof positions];
          const position = { x: frame.x, y: frame.y };
          return { id: node.id, position, absolutePosition: position,
            width: frame.width, height: frame.height }; }),
        edges: [
          { id: 'a-base', sections: [{ startPoint: { x: 10, y: 300 },
            bendPoints: [{ x: 10, y: 280 }, { x: 180, y: 280 }, { x: 180, y: 130 }],
            endPoint: { x: 180, y: 120 } }] },
          { id: 'b-base', sections: [{ startPoint: { x: 170, y: 300 },
            bendPoints: [{ x: 170, y: 270 }, { x: 20, y: 270 }, { x: 20, y: 130 }],
            endPoint: { x: 20, y: 120 } }] },
        ], width: 200, height: 320, effectiveOptions: {}, diagnostics: [],
      } });
    expect(result.edges.find((edge) => edge.id === 'a-base')!.sections.at(-1)!.endPoint.x)
      .toBeGreaterThan(150);
    expect(result.edges.find((edge) => edge.id === 'b-base')!.sections.at(-1)!.endPoint.x)
      .toBeLessThan(50);
    for (const edge of result.edges) {
      const section = edge.sections[0]!;
      const points = [section.startPoint, ...section.bendPoints, section.endPoint];
      for (let index = 1; index < points.length; index += 1) {
        const a = points[index - 1]!; const b = points[index]!;
        for (let sample = 0; sample <= 64; sample += 1) {
          const x = a.x + (b.x - a.x) * sample / 64;
          const y = a.y + (b.y - a.y) * sample / 64;
          expect(x > 50 && x < 110 && y > 122 && y < 142,
            `${edge.id} crosses X`).toBe(false);
        }
      }
    }
  });

  it('preserves graph-level ELK options on a cyclic flowchart', async () => {
    let receivedOptions: ElkNode['layoutOptions'];
    const engine: LayoutEngine = { async layout(input) {
      receivedOptions = input.layoutOptions;
      return echoEngine.layout(input);
    } };
    await resolveSpatialLayout({ revision: 'flowchart-authored-cycle-options',
      operation: 'load', graph: graph({ metadata: { notation: 'flowchart' },
        nodes: [{ id: 'a', type: 'process' }, { id: 'b', type: 'process' }],
        edges: [{ id: 'ab', source: 'a', target: 'b' },
          { id: 'ba', source: 'b', target: 'a' }],
        layoutOptions: { elkOptions: {
          'elk.layered.cycleBreaking.strategy': 'GREEDY',
          'elk.layered.spacing.nodeNodeBetweenLayers': 88,
        } } as GraphIR['layoutOptions'],
      }), execution: { engine } });
    expect(receivedOptions?.['elk.layered.cycleBreaking.strategy']).toBe('GREEDY');
    expect(receivedOptions?.['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('88');
  });

  it('keeps an ELK class detour when a sibling blocks every straight rank lane', async () => {
    const positions = new Map([
      ['Entity', { x: 100, y: 0 }], ['Block', { x: 100, y: 150 }],
      ['Order', { x: 100, y: 300 }],
    ]);
    const engine: LayoutEngine = { async layout(input) {
      return { ...input, width: 400, height: 400,
        children: input.children?.map((node) => ({ ...node, ...positions.get(node.id)! })),
        edges: input.edges?.map((edge) => ({ ...edge, sections: [{
          startPoint: { x: 200, y: 100 },
          bendPoints: [{ x: 350, y: 100 }, { x: 350, y: 300 }],
          endPoint: { x: 200, y: 300 },
        }] })),
      };
    } };
    const classifier = (name: string) => ({ kind: 'class' as const, name,
      compartments: [{ id: 'name', kind: 'name' as const }] });
    const result = await resolveSpatialLayout({ revision: 'blocked-class-lane',
      operation: 'load', graph: graph({ metadata: { notation: 'uml-class' }, nodes: [
        { id: 'Entity', type: 'class', dimensions: { width: 200, height: 100 },
          classifier: classifier('Entity') },
        { id: 'Block', type: 'process', dimensions: { width: 200, height: 100 } },
        { id: 'Order', type: 'class', dimensions: { width: 200, height: 100 },
          classifier: classifier('Order') },
      ], edges: [{ id: 'base', source: 'Order', target: 'Entity', type: 'inheritance' }] }),
      defaults: { algorithm: 'layered', direction: 'DOWN' }, execution: { engine },
    });
    expect(result.edges[0]?.sections[0]?.bendPoints).toHaveLength(2);
  });

  it('retains an ELK detour when a direct free connector would cross a node', async () => {
    const positions = new Map([
      ['source', { x: 0, y: 0 }], ['obstacle', { x: 40, y: 100 }],
      ['target', { x: 0, y: 220 }],
    ]);
    const bends = [{ x: 120, y: 50 }, { x: 120, y: 220 }];
    const engine: LayoutEngine = { async layout(input) {
      return { ...input, width: 140, height: 270,
        children: input.children?.map((node) => ({ ...node, ...positions.get(node.id)! })),
        edges: input.edges?.map((edge) => ({ ...edge, sections: [{
          startPoint: { x: 50, y: 50 }, bendPoints: bends,
          endPoint: { x: 50, y: 220 },
        }] })),
      };
    } };
    const result = await resolveSpatialLayout({ revision: 'detour-obstacle',
      operation: 'load', graph: graph({ nodes: [
        { id: 'source', type: 'process', dimensions: { width: 100, height: 50 } },
        { id: 'obstacle', type: 'process', dimensions: { width: 20, height: 60 } },
        { id: 'target', type: 'process', dimensions: { width: 100, height: 50 } },
      ], edges: [{ id: 'flow', source: 'source', target: 'target' }] }),
      defaults: { algorithm: 'layered', direction: 'DOWN' }, execution: { engine },
    });
    // The detour corridor at x=120 is kept. The engine's first leg ran along the
    // source's bottom edge, so the free contact leaves the right side square.
    const section = result.edges[0]!.sections[0]!;
    expect(section.bendPoints.map(({ x }) => x)).toEqual([120, 120]);
    expect(section.bendPoints.at(-1)).toEqual({ x: 120, y: 220 });
    expect(section.startPoint.x).toBeGreaterThan(50);
    expect(section.bendPoints[0]!.y).toBeCloseTo(section.startPoint.y, 6);
  });

  it.each(['NORTH', 'SOUTH'] as const)(
    'preserves a legacy event %s box pin or refuses an inward caption escape', async (side) => {
      const input = graph({ metadata: { notation: 'bpmn' }, nodes: [
        { id: 'received', type: 'startEvent', pinned: true, position: { x: 0, y: 0 },
          dimensions: { width: 100, height: 120 }, ports: [{ id: 'out', side, position: 0.5 }] },
        { id: 'work', type: 'task', pinned: true, position: { x: 0, y: 200 },
          dimensions: { width: 100, height: 60 } },
      ], edges: [{ id: 'flow', source: 'received', sourcePort: 'out', target: 'work' }] });
      const before = JSON.stringify(input);
      const result = resolveSpatialLayout({ revision: side, operation: 'load', graph: input,
        defaults: { algorithm: 'layered', direction: 'DOWN' },
        candidateLayout: { nodes: [
          { id: 'received', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 }, width: 100, height: 120 },
          { id: 'work', position: { x: 0, y: 200 }, absolutePosition: { x: 0, y: 200 }, width: 100, height: 60 },
        ], edges: [{ id: 'flow', sections: [{ startPoint: { x: 50, y: side === 'NORTH' ? 8 : 56 },
          bendPoints: [], endPoint: { x: 50, y: 200 } }] }],
        width: 100, height: 260, effectiveOptions: {}, diagnostics: [] },
      });
      if (side === 'NORTH') await expect(result).rejects.toMatchObject({
        diagnostics: [expect.objectContaining({ code: 'layout.capability.unsupported',
          message: expect.stringContaining('crosses event received ring'), subject: { kind: 'edge', id: 'flow' } })],
      });
      else {
        const section = (await result).edges[0]!.sections[0]!;
        expect(section.startPoint).toEqual({ x: 50, y: 120 });
        const points = [section.startPoint, ...section.bendPoints, section.endPoint];
        for (let i = 1; i < points.length; i++) for (let sample = 0; sample <= 128; sample++) {
          const a = points[i - 1]!; const b = points[i]!; const t = sample / 128;
          const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t;
          expect(Math.hypot(x - 50, y - 32)).toBeGreaterThanOrEqual(24 - 1e-6);
          expect(x > 0 && x < 100 && y > 68 && y < 120).toBe(false);
        }
      }
      expect(JSON.stringify(input)).toBe(before);
    });

  it.each(['blocked detour', 'authored waypoint'] as const)(
    'refuses a BPMN event caption crossing with a %s', async (mode) => {
      const frames = { received: { x: 0, y: 0, width: 100, height: 120 },
        work: { x: 0, y: 200, width: 100, height: 60 },
        ...(mode === 'blocked detour' ? { obstacle: { x: 104, y: 90, width: 20, height: 30 } } : {}) };
      const input = graph({ metadata: { notation: 'bpmn' },
        nodes: Object.entries(frames).map(([id, frame]) => ({ id, pinned: true,
          type: id === 'received' ? 'startEvent' : 'task',
          position: { x: frame.x, y: frame.y }, dimensions: { width: frame.width, height: frame.height } })),
        edges: [{ id: 'flow', source: 'received', target: 'work',
          ...(mode === 'authored waypoint' ? { routeIntent: { waypoints: [
            { id: 'caption-point', placement: { kind: 'absolute', position: { x: 50, y: 100 } } },
          ] } } : {}) }] });
      const before = JSON.stringify(input);
      await expect(resolveSpatialLayout({ revision: mode, operation: 'load', graph: input,
        defaults: { algorithm: 'layered', direction: 'RIGHT' },
        candidateLayout: { nodes: Object.entries(frames).map(([id, frame]) => ({ id,
          position: { x: frame.x, y: frame.y }, absolutePosition: { x: frame.x, y: frame.y },
          width: frame.width, height: frame.height })),
          edges: [{ id: 'flow', sections: [{ startPoint: { x: 50, y: 56 },
            bendPoints: [], endPoint: { x: 50, y: 200 } }] }],
          width: 124, height: 260, effectiveOptions: {}, diagnostics: [] },
      })).rejects.toMatchObject({ diagnostics: [expect.objectContaining({
        code: 'layout.capability.unsupported',
        message: expect.stringContaining(mode === 'blocked detour'
          ? 'crosses node obstacle' : 'Authored route flow crosses BPMN event received caption'),
        subject: { kind: 'edge', id: 'flow' },
      })] });
      expect(JSON.stringify(input)).toBe(before);
    });

  it('preserves an obstacle-avoiding candidate while escaping a BPMN caption', async () => {
    const nodes = [
      { id: 'choice', type: 'exclusiveGateway', label: 'Decision', pinned: true,
        position: { x: 0, y: 0 }, dimensions: { width: 182, height: 104 },
        ports: [{ id: 'send', side: 'EAST' as const, position: 0.5 }] },
      { id: 'obstacle', type: 'task', pinned: true,
        position: { x: 80, y: 120 }, dimensions: { width: 100, height: 60 } },
      { id: 'work', type: 'task', pinned: true,
        position: { x: 300, y: 300 }, dimensions: { width: 100, height: 60 } },
    ];
    const result = await resolveSpatialLayout({ revision: 'bpmn-caption-obstacle',
      operation: 'load', graph: graph({ metadata: { notation: 'bpmn' }, nodes,
        edges: [{ id: 'flow', source: 'choice', sourcePort: 'send', target: 'work' }] }),
      defaults: { algorithm: 'layered', direction: 'DOWN' },
      candidateLayout: {
        nodes: nodes.map((node) => ({ id: node.id, position: node.position,
          absolutePosition: node.position, ...node.dimensions })),
        edges: [{ id: 'flow', sections: [{ startPoint: { x: 100, y: 52 },
          bendPoints: [{ x: 200, y: 52 }, { x: 200, y: 200 },
            { x: 250, y: 200 }, { x: 250, y: 330 }],
          endPoint: { x: 300, y: 330 } }] }],
        width: 400, height: 360, effectiveOptions: {}, diagnostics: [],
      } });
    const section = result.edges[0]!.sections[0]!;
    expect(section.bendPoints).toContainEqual({ x: 200, y: 200 });
    const points = [section.startPoint, ...section.bendPoints, section.endPoint];
    const frame = bpmnGatewayFrame028(182, 104, 'DOWN');
    const captionStart = frame.x + frame.width + 12;
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1]!; const b = points[index]!;
      for (let step = 0; step <= 64; step += 1) {
        const ratio = step / 64;
        const x = a.x + (b.x - a.x) * ratio;
        const y = a.y + (b.y - a.y) * ratio;
        expect(x > 80 && x < 180 && y > 120 && y < 180,
          'route crosses pinned obstacle').toBe(false);
        expect(x > captionStart && x < 182 && y > 0 && y < 104,
          'route crosses gateway caption reservation').toBe(false);
      }
    }
  });
  it('allows an enclosing ancestor but refuses an unrelated BPMN detour container', async () => {
    const choice = { id: 'choice', type: 'exclusiveGateway', label: 'Decision',
      pinned: true, position: { x: 0, y: 0 },
      dimensions: { width: 182, height: 104 },
      ports: [{ id: 'send', side: 'EAST' as const, position: 0.5 }] };
    const work = { id: 'work', type: 'task', pinned: true,
      position: { x: 300, y: 300 }, dimensions: { width: 100, height: 60 } };
    const candidateRoute = { id: 'flow', sections: [{
      startPoint: { x: 100, y: 52 }, bendPoints: [{ x: 200, y: 52 },
        { x: 200, y: 200 }, { x: 250, y: 200 }, { x: 250, y: 330 }],
      endPoint: { x: 300, y: 330 },
    }] };
    const rect = (id: string, x: number, y: number, width: number, height: number,
      parentId?: string) => ({ id, ...(parentId ? { parentId } : {}),
      position: { x, y }, absolutePosition: { x, y }, width, height });
    const request = (nested: boolean) => ({ revision: nested ? 'ancestor' : 'sibling',
      operation: 'load' as const,
      graph: graph({ metadata: { notation: 'bpmn' },
        nodes: nested ? [
          { id: 'process', type: 'group', pinned: true, position: { x: 0, y: 0 },
            dimensions: { width: 220, height: 120 },
            children: [{ ...choice, parent: 'process' }] }, work,
        ] : [choice, { id: 'other', type: 'group', pinned: true,
          position: { x: 110, y: 106 }, dimensions: { width: 40, height: 40 },
          children: [{ id: 'leaf', parent: 'other', type: 'task',
            position: { x: 20, y: 24 }, dimensions: { width: 10, height: 10 } }] }, work],
        edges: [{ id: 'flow', source: 'choice', sourcePort: 'send', target: 'work' }] }),
      defaults: { algorithm: 'layered' as const, direction: 'DOWN' as const },
      candidateLayout: { nodes: nested ? [
        rect('process', 0, 0, 220, 120), rect('choice', 0, 0, 182, 104, 'process'),
        rect('work', 300, 300, 100, 60),
      ] : [rect('choice', 0, 0, 182, 104), rect('other', 110, 106, 40, 40),
        rect('leaf', 130, 130, 10, 10, 'other'), rect('work', 300, 300, 100, 60)],
      edges: [candidateRoute], width: 400, height: 360,
      effectiveOptions: {}, diagnostics: [] },
    });
    const allowed = await resolveSpatialLayout(request(true));
    expect(allowed.edges[0]?.sections[0]?.bendPoints).toContainEqual({ x: 200, y: 200 });
    await expect(resolveSpatialLayout(request(false))).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'layout.capability.unsupported',
        message: expect.stringContaining('crosses node other') })],
    });
  });
  it('rejects a BPMN caption detour painted along an adjacent obstacle border', async () => {
    const result = resolveSpatialLayout({ revision: 'caption-adjacent-border', operation: 'load',
      graph: graph({ metadata: { notation: 'bpmn' }, nodes: [
        { id: 'choice', type: 'exclusiveGateway', label: 'Decision', pinned: true,
          position: { x: 0, y: 0 }, dimensions: { width: 182, height: 104 },
          ports: [{ id: 'send', side: 'EAST', position: 0.5 }] },
        { id: 'obstacle', type: 'task', pinned: true, position: { x: 80, y: 112 },
          dimensions: { width: 100, height: 60 } },
        { id: 'work', type: 'task', pinned: true, position: { x: 300, y: 300 },
          dimensions: { width: 100, height: 60 } },
      ], edges: [{ id: 'flow', source: 'choice', sourcePort: 'send', target: 'work' }] }),
      defaults: { algorithm: 'layered', direction: 'DOWN' },
      candidateLayout: { nodes: [
        { id: 'choice', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 },
          width: 182, height: 104 },
        { id: 'obstacle', position: { x: 80, y: 112 },
          absolutePosition: { x: 80, y: 112 }, width: 100, height: 60 },
        { id: 'work', position: { x: 300, y: 300 },
          absolutePosition: { x: 300, y: 300 }, width: 100, height: 60 },
      ], edges: [{ id: 'flow', sections: [{ startPoint: { x: 100, y: 52 },
        bendPoints: [{ x: 200, y: 52 }, { x: 200, y: 200 },
          { x: 250, y: 200 }, { x: 250, y: 330 }],
        endPoint: { x: 300, y: 330 } }] }],
      width: 400, height: 360, effectiveOptions: {}, diagnostics: [] },
    });
    await expect(result).rejects.toMatchObject({ diagnostics: [expect.objectContaining({
      code: 'layout.capability.unsupported',
      message: expect.stringContaining('crosses node obstacle'),
    })] });
  });
  it('keeps ELK geometry for unconstrained nested siblings', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-nested-elk', operation: 'load',
      graph: graph({
        nodes: [{ id: 'platform', type: 'group', children: [
          { id: 'platform.api', parent: 'platform', type: 'service' },
          { id: 'platform.worker', parent: 'platform', type: 'service' },
        ] }],
        edges: [{ id: 'call', source: 'platform.api', target: 'platform.worker' }],
      }),
      defaults: { algorithm: 'layered', direction: 'RIGHT', hierarchyHandling: 'INCLUDE_CHILDREN' },
    });
    const parent = result.nodes.find((node) => node.id === 'platform')!;
    const api = result.nodes.find((node) => node.id === 'platform.api')!;
    const worker = result.nodes.find((node) => node.id === 'platform.worker')!;
    expect(worker.absolutePosition.x).toBeGreaterThan(api.absolutePosition.x + api.width);
    for (const child of [api, worker]) {
      expect(child.absolutePosition.x).toBeGreaterThan(parent.absolutePosition.x);
      expect(child.absolutePosition.x + child.width).toBeLessThan(parent.absolutePosition.x + parent.width);
    }
  });
  it('converts nested content-box positions to resolved outer-frame coordinates once', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r1',
      graph: graph({ nodes: [{
        id: 'group', type: 'group', position: { x: 10, y: 20 }, dimensions: { width: 200, height: 160 },
        layoutOptions: { padding: { top: 11, left: 7 } },
        children: [{ id: 'child', parent: 'group', type: 'service', position: { x: 3, y: 5 }, dimensions: { width: 30, height: 20 } }],
      }] }),
      operation: 'load',
      execution: { engine: echoEngine },
    });

    expect(result.nodes.find((node) => node.id === 'child')).toMatchObject({
      position: { x: 10, y: 16 },
      absolutePosition: { x: 20, y: 36 },
    });
  });

  it('satisfies required relations and rejects a conflicting preference in authored order', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r2', operation: 'incremental', execution: { engine: echoEngine },
      graph: graph({
        nodes: [
          { id: 'a', type: 'service', dimensions: { width: 40, height: 20 }, position: { x: 100, y: 0 } },
          { id: 'b', type: 'service', dimensions: { width: 40, height: 20 }, position: { x: 0, y: 0 }, pinned: true },
        ],
        constraints: [
          { id: 'required-right', kind: 'relative', strength: 'required', subject: { kind: 'node', nodeId: 'a' }, relation: 'right-of', target: { kind: 'node', nodeId: 'b' }, gap: 10 },
          { id: 'preferred-left', kind: 'relative', strength: 'preferred', subject: { kind: 'node', nodeId: 'a' }, relation: 'left-of', target: { kind: 'node', nodeId: 'b' }, gap: 10 },
        ],
      }),
    });

    const a = result.nodes.find((node) => node.id === 'a')!;
    const b = result.nodes.find((node) => node.id === 'b')!;
    expect(a.absolutePosition.x).toBeGreaterThanOrEqual(b.absolutePosition.x + b.width + 10 - 1e-6);
    expect(result.acceptedConstraintIds).toEqual(['required-right']);
    expect(result.rejectedConstraintIds).toEqual(['preferred-left']);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'layout.constraint.preferred-rejected', path: 'constraints.preferred-left' }));
  });

  it('treats an arrangement gap as a minimum during final verification', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-gap', operation: 'incremental', execution: { engine: echoEngine },
      graph: graph({
        nodes: [
          { id: 'a', type: 'service', position: { x: 0, y: 0 }, dimensions: { width: 20, height: 20 } },
          { id: 'b', type: 'service', position: { x: 100, y: 0 }, dimensions: { width: 20, height: 20 } },
        ],
        constraints: [{
          id: 'row', kind: 'arrangement', axis: 'row', gap: 10,
          subjects: [{ kind: 'node', nodeId: 'a' }, { kind: 'node', nodeId: 'b' }],
        }],
      }),
    });
    expect(result.acceptedConstraintIds).toEqual(['row']);
    expect(result.nodes.find((node) => node.id === 'b')!.absolutePosition.x).toBe(100);
  });

  it('admits preferred constraints in authored order', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-preference-order', operation: 'reflow', execution: { engine: echoEngine },
      graph: graph({
        nodes: [{ id: 'a', type: 'service' }, { id: 'b', type: 'service' }],
        constraints: [
          { id: 'first', kind: 'relative', strength: 'preferred', subject: { kind: 'node', nodeId: 'a' }, relation: 'left-of', target: { kind: 'node', nodeId: 'b' }, gap: 10 },
          { id: 'second', kind: 'relative', strength: 'preferred', subject: { kind: 'node', nodeId: 'b' }, relation: 'left-of', target: { kind: 'node', nodeId: 'a' }, gap: 10 },
        ],
      }),
    });
    expect(result.acceptedConstraintIds).toEqual(['first']);
    expect(result.rejectedConstraintIds).toEqual(['second']);
  });

  it('executes reverse column arrangements with end alignment', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-reverse-column', operation: 'reflow', execution: { engine: echoEngine },
      graph: graph({
        nodes: [
          { id: 'a', type: 'service', dimensions: { width: 20, height: 20 } },
          { id: 'b', type: 'service', dimensions: { width: 40, height: 30 } },
        ],
        constraints: [{
          id: 'column', kind: 'arrangement', axis: 'column', direction: 'reverse', alignment: 'end', gap: 5,
          subjects: [{ kind: 'node', nodeId: 'a' }, { kind: 'node', nodeId: 'b' }],
        }],
      }),
    });
    const a = result.nodes.find((node) => node.id === 'a')!;
    const b = result.nodes.find((node) => node.id === 'b')!;
    expect(a.absolutePosition.y).toBeGreaterThanOrEqual(b.absolutePosition.y + b.height + 5 - 1e-6);
    expect(a.absolutePosition.x + a.width).toBeCloseTo(b.absolutePosition.x + b.width, 8);
  });

  it('fails atomically when required pinned positions contradict', async () => {
    await expect(resolveSpatialLayout({
      revision: 'r3', operation: 'incremental', execution: { engine: echoEngine },
      graph: graph({
        nodes: [
          { id: 'a', type: 'service', dimensions: { width: 40, height: 20 }, position: { x: 0, y: 0 }, pinned: true },
          { id: 'b', type: 'service', dimensions: { width: 40, height: 20 }, position: { x: 0, y: 0 }, pinned: true },
        ],
        constraints: [{ id: 'apart', kind: 'relative', subject: { kind: 'node', nodeId: 'a' }, relation: 'left-of', target: { kind: 'node', nodeId: 'b' }, gap: 10 }],
      }),
    })).rejects.toMatchObject({ diagnostics: [expect.objectContaining({ code: 'layout.constraint.required-unsatisfied' })] });
  });

  it('enumerates graph extrema instead of treating the boundary as an expandable variable', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-boundary', operation: 'incremental', execution: { engine: echoEngine },
      graph: graph({
        nodes: [
          { id: 'left', type: 'service', dimensions: { width: 20, height: 20 } },
          { id: 'subject', type: 'service', dimensions: { width: 20, height: 20 } },
        ],
        constraints: [{
          id: 'inset', kind: 'boundary', subject: { kind: 'node', nodeId: 'subject' },
          side: 'left', scope: { kind: 'graph' }, inset: 10,
        }],
      }),
    });
    const left = result.nodes.find((node) => node.id === 'left')!;
    const subject = result.nodes.find((node) => node.id === 'subject')!;
    expect(subject.absolutePosition.x).toBeCloseTo(left.absolutePosition.x + 10, 8);
  });

  it('detects a required relation cycle with no feasible geometry', async () => {
    await expect(resolveSpatialLayout({
      revision: 'r-cycle', operation: 'incremental', execution: { engine: echoEngine },
      graph: graph({
        nodes: [{ id: 'a', type: 'service' }, { id: 'b', type: 'service' }],
        constraints: [
          { id: 'a-left', kind: 'relative', subject: { kind: 'node', nodeId: 'a' }, relation: 'left-of', target: { kind: 'node', nodeId: 'b' }, gap: 1 },
          { id: 'b-left', kind: 'relative', subject: { kind: 'node', nodeId: 'b' }, relation: 'left-of', target: { kind: 'node', nodeId: 'a' }, gap: 1 },
        ],
      }),
    })).rejects.toMatchObject({ diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'layout.constraint.required-unsatisfied' }),
    ]) });
  });

  it('repairs avoidable overlap but diagnoses overlap forced by authored exact positions', async () => {
    const repaired = await resolveSpatialLayout({
      revision: 'r-overlap', operation: 'incremental', execution: { engine: echoEngine },
      graph: graph({ nodes: [{ id: 'a', type: 'service' }, { id: 'b', type: 'service' }] }),
    });
    const [a, b] = repaired.nodes;
    expect(a.absolutePosition.x + a.width <= b.absolutePosition.x + 1e-6 ||
      a.absolutePosition.y + a.height <= b.absolutePosition.y + 1e-6).toBe(true);

    const forced = await resolveSpatialLayout({
      revision: 'r-forced', operation: 'incremental', execution: { engine: echoEngine },
      graph: graph({ nodes: [
        { id: 'a', type: 'service', position: { x: 0, y: 0 } },
        { id: 'b', type: 'service', position: { x: 0, y: 0 } },
      ] }),
    });
    expect(forced.diagnostics).toContainEqual(expect.objectContaining({ code: 'layout.constraint.overlap-forced' }));
  });

  it('expands an auto-sized container when an arrangement needs more room', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-auto', operation: 'incremental', execution: { engine: echoEngine },
      graph: graph({ nodes: [{
        id: 'group', type: 'group', layoutOptions: { padding: { left: 10, right: 10, top: 10, bottom: 10 } },
        children: [
          { id: 'a', parent: 'group', type: 'service', dimensions: { width: 100, height: 20 } },
          { id: 'b', parent: 'group', type: 'service', dimensions: { width: 100, height: 20 } },
        ],
      }], constraints: [{
        id: 'row', kind: 'arrangement', subjects: [
          { kind: 'node', nodeId: 'a' }, { kind: 'node', nodeId: 'b' },
        ], axis: 'row', gap: 30,
      }] }),
    });
    expect(result.nodes.find((node) => node.id === 'group')!.width).toBeGreaterThanOrEqual(250);
  });

  it('resizes an auto-container after nested overlap repair', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-nested-overlap', operation: 'reflow', execution: { engine: echoEngine },
      graph: graph({ nodes: [{
        id: 'group', type: 'group', layoutOptions: { padding: { left: 10, right: 10, top: 10, bottom: 10 } },
        children: [
          { id: 'a', parent: 'group', type: 'service', dimensions: { width: 80, height: 20 } },
          { id: 'b', parent: 'group', type: 'service', dimensions: { width: 80, height: 20 } },
        ],
      }] }),
    });
    const group = result.nodes.find((node) => node.id === 'group')!;
    for (const id of ['a', 'b']) {
      const child = result.nodes.find((node) => node.id === id)!;
      expect(child.absolutePosition.x + child.width).toBeLessThanOrEqual(
        group.absolutePosition.x + group.width - 10 + 1e-6,
      );
      expect(child.absolutePosition.y + child.height).toBeLessThanOrEqual(
        group.absolutePosition.y + group.height - 10 + 1e-6,
      );
    }
  });

  it('honors an authored auto-container minimum size', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-minimum-size', operation: 'reflow', execution: { engine: echoEngine },
      graph: graph({ nodes: [{
        id: 'group', type: 'group', layoutOptions: {
          sizeConstraints: ['MINIMUM_SIZE'], minimumSize: { width: 500, height: 200 },
        },
        children: [{ id: 'child', parent: 'group', type: 'service', dimensions: { width: 20, height: 20 } }],
      }] }),
    });
    expect(result.nodes.find((node) => node.id === 'group')).toMatchObject({ width: 500, height: 200 });
  });

  it.each([
    ['left', 15, 'x', 15],
    ['right', 25, 'x', 175],
    ['top', 11, 'y', 11],
    ['bottom', 17, 'y', 123],
  ] as const)('resolves a %s node boundary against the outer rectangle', async (side, inset, axis, expected) => {
    const request = {
      revision: `r-node-boundary-${side}`, operation: 'reflow' as const, execution: { engine: echoEngine },
      graph: graph({
        nodes: [{
          id: 'group', type: 'group', dimensions: { width: 200, height: 140 },
          layoutOptions: { padding: { left: 10, right: 20, top: 7, bottom: 13 } },
          children: [{ id: 'child', parent: 'group', type: 'service', dimensions: { width: 30, height: 20 } }],
        }],
        constraints: [{
          id: side, kind: 'boundary', subject: { kind: 'node', nodeId: 'child' },
          side, scope: { kind: 'node', nodeId: 'group' }, inset,
        }],
      }),
    };
    const first = await resolveSpatialLayout(request);
    const second = await resolveSpatialLayout(request);
    expect(second).toEqual(first);
    const group = first.nodes.find((node) => node.id === 'group')!;
    const child = first.nodes.find((node) => node.id === 'child')!;
    const actual = side === 'left' || side === 'top'
      ? child.absolutePosition[axis]
      : child.absolutePosition[axis] + (axis === 'x' ? child.width : child.height);
    expect(actual).toBeCloseTo(group.absolutePosition[axis] + expected, 8);
  });

  it.each([
    ['required', ['grow'] as const, [] as const],
    ['preferred', [] as const, ['grow'] as const],
  ])('grows an auto-container before admitting a %s right-boundary constraint', async (_strength, required, preferred) => {
    const constraints = [
      ...required.map((id) => ({
        id, kind: 'boundary' as const, subject: { kind: 'node' as const, nodeId: 'child' },
        side: 'right' as const, scope: { kind: 'node' as const, nodeId: 'group' }, inset: 200,
      })),
      ...preferred.map((id) => ({
        id, kind: 'boundary' as const, strength: 'preferred' as const,
        subject: { kind: 'node' as const, nodeId: 'child' },
        side: 'right' as const, scope: { kind: 'node' as const, nodeId: 'group' }, inset: 200,
      })),
    ];
    const result = await resolveSpatialLayout({
      revision: `r-auto-boundary-${_strength}`, operation: 'reflow', execution: { engine: echoEngine },
      graph: graph({
        nodes: [{
          id: 'group', type: 'group',
          children: [{ id: 'child', parent: 'group', type: 'service', dimensions: { width: 20, height: 20 } }],
        }],
        constraints,
      }),
    });
    const group = result.nodes.find((node) => node.id === 'group')!;
    const child = result.nodes.find((node) => node.id === 'child')!;
    expect(group.width).toBe(220);
    expect(child.absolutePosition.x + child.width).toBeCloseTo(
      group.absolutePosition.x + group.width - 200, 8,
    );
    expect(result.acceptedConstraintIds).toEqual(['grow']);
  });

  it('grows a nested auto-container chain before required feasibility', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-nested-auto-boundary', operation: 'reflow', execution: { engine: echoEngine },
      graph: graph({
        nodes: [{
          id: 'outer', type: 'group', children: [{
            id: 'inner', parent: 'outer', type: 'group', children: [{
              id: 'child', parent: 'inner', type: 'service', dimensions: { width: 20, height: 20 },
            }],
          }],
        }],
        constraints: [{
          id: 'outer-right', kind: 'boundary', subject: { kind: 'node', nodeId: 'child' },
          side: 'right', scope: { kind: 'node', nodeId: 'outer' }, inset: 200,
        }],
      }),
    });
    const outer = result.nodes.find((node) => node.id === 'outer')!;
    const child = result.nodes.find((node) => node.id === 'child')!;
    expect(outer.width).toBe(220);
    expect(child.absolutePosition.x + child.width).toBeCloseTo(
      outer.absolutePosition.x + outer.width - 200, 8,
    );
  });

  it.each([
    ['required', 0, 240],
    ['preferred', 0, 240],
    ['required', 200, 440],
    ['preferred', 200, 440],
  ] as const)(
    'derives auto-container width from a row and %s trailing boundary with inset %s',
    async (strength, inset, expectedWidth) => {
      const result = await resolveSpatialLayout({
        revision: `r-auto-row-boundary-${strength}`, operation: 'reflow', execution: { engine: echoEngine },
        graph: graph({
          nodes: [{
            id: 'group', type: 'group', children: [
              { id: 'a', parent: 'group', type: 'service', dimensions: { width: 20, height: 20 } },
              { id: 'b', parent: 'group', type: 'service', dimensions: { width: 20, height: 20 } },
            ],
          }],
          constraints: [{
            id: 'row', kind: 'arrangement', axis: 'row', gap: 200,
            subjects: [{ kind: 'node', nodeId: 'a' }, { kind: 'node', nodeId: 'b' }],
          }, {
            id: 'right', kind: 'boundary', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'b' }, side: 'right',
            scope: { kind: 'node', nodeId: 'group' }, inset,
          }],
        }),
      });
      const group = result.nodes.find((node) => node.id === 'group')!;
      const a = result.nodes.find((node) => node.id === 'a')!;
      const b = result.nodes.find((node) => node.id === 'b')!;
      expect(group.width).toBe(expectedWidth);
      expect(b.absolutePosition.x).toBeGreaterThanOrEqual(a.absolutePosition.x + a.width + 200 - 1e-6);
      expect(b.absolutePosition.x + b.width).toBeCloseTo(
        group.absolutePosition.x + group.width - inset, 8,
      );
      expect(result.acceptedConstraintIds).toEqual(['row', 'right']);
    },
  );

  it('derives nested auto-container extents from a combined required conjunction', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-nested-auto-row-boundary', operation: 'reflow', execution: { engine: echoEngine },
      graph: graph({
        nodes: [{
          id: 'outer', type: 'group', children: [{
            id: 'inner', parent: 'outer', type: 'group', children: [
              { id: 'a', parent: 'inner', type: 'service', dimensions: { width: 20, height: 20 } },
              { id: 'b', parent: 'inner', type: 'service', dimensions: { width: 20, height: 20 } },
            ],
          }],
        }],
        constraints: [{
          id: 'row', kind: 'arrangement', axis: 'row', gap: 200,
          subjects: [{ kind: 'node', nodeId: 'a' }, { kind: 'node', nodeId: 'b' }],
        }, {
          id: 'outer-right', kind: 'boundary', subject: { kind: 'node', nodeId: 'b' },
          side: 'right', scope: { kind: 'node', nodeId: 'outer' }, inset: 200,
        }],
      }),
    });
    const outer = result.nodes.find((node) => node.id === 'outer')!;
    const inner = result.nodes.find((node) => node.id === 'inner')!;
    const b = result.nodes.find((node) => node.id === 'b')!;
    expect(inner.width).toBe(240);
    expect(outer.width).toBe(440);
    expect(b.absolutePosition.x + b.width).toBeCloseTo(
      outer.absolutePosition.x + outer.width - 200, 8,
    );
  });

  it.each(['required', 'preferred'] as const)(
    'moves a disposable far candidate before rejecting a satisfiable %s auto-boundary',
    async (strength) => {
      const result = await resolveSpatialLayout({
        revision: `r-auto-far-candidate-${strength}`, operation: 'reflow',
        graph: graph({
          nodes: [{
            id: 'group', type: 'group', children: [
              {
                id: 'a', parent: 'group', type: 'service', pinned: true,
                position: { x: 0, y: 0 }, dimensions: { width: 20, height: 20 },
              },
              { id: 'b', parent: 'group', type: 'service', dimensions: { width: 20, height: 20 } },
            ],
          }],
          constraints: [{
            id: 'right', kind: 'boundary', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'a' }, side: 'right',
            scope: { kind: 'node', nodeId: 'group' }, inset: 200,
          }],
        }),
        candidateLayout: {
          nodes: [
            {
              id: 'group', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 },
              width: 1020, height: 60,
            },
            {
              id: 'a', parentId: 'group', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 },
              width: 20, height: 20,
            },
            {
              id: 'b', parentId: 'group', position: { x: 1000, y: 0 }, absolutePosition: { x: 1000, y: 0 },
              width: 20, height: 20,
            },
          ],
          edges: [], width: 1020, height: 60, effectiveOptions: {}, diagnostics: [],
        },
      });
      const group = result.nodes.find((node) => node.id === 'group')!;
      const a = result.nodes.find((node) => node.id === 'a')!;
      const b = result.nodes.find((node) => node.id === 'b')!;
      expect(group.width).toBe(220);
      expect(a.absolutePosition.x + a.width).toBeCloseTo(
        group.absolutePosition.x + group.width - 200, 8,
      );
      expect(b.absolutePosition.x + b.width).toBeLessThanOrEqual(group.absolutePosition.x + group.width + 1e-6);
      expect(b.absolutePosition.x).not.toBe(1000);
      expect(result.acceptedConstraintIds).toEqual(['right']);
    },
  );

  it.each(['required', 'preferred'] as const)(
    'normalizes an oversized auto-container before testing a %s relation',
    async (strength) => {
      const result = await resolveSpatialLayout({
        revision: `r-auto-provisional-size-${strength}`, operation: 'reflow',
        graph: graph({
          nodes: [
            {
              id: 'p', type: 'group', pinned: true, position: { x: 0, y: 0 },
              children: [{ id: 'child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 } }],
            },
            {
              id: 'b', type: 'service', pinned: true, position: { x: 200, y: 0 },
              dimensions: { width: 20, height: 60 },
            },
          ],
          constraints: [{
            id: 'left', kind: 'relative', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'p' }, relation: 'left-of',
            target: { kind: 'node', nodeId: 'b' },
          }],
        }),
        candidateLayout: {
          nodes: [
            {
              id: 'p', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 },
              width: 1000, height: 60,
            },
            {
              id: 'child', parentId: 'p', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 },
              width: 20, height: 20,
            },
            {
              id: 'b', position: { x: 200, y: 0 }, absolutePosition: { x: 200, y: 0 },
              width: 20, height: 60,
            },
          ],
          edges: [], width: 1000, height: 60, effectiveOptions: {}, diagnostics: [],
        },
      });
      const parent = result.nodes.find((node) => node.id === 'p')!;
      const external = result.nodes.find((node) => node.id === 'b')!;
      expect(parent.width).toBe(150);
      expect(parent.absolutePosition.x + parent.width).toBeLessThanOrEqual(external.absolutePosition.x + 1e-6);
      expect(result.acceptedConstraintIds).toEqual(['left']);
    },
  );

  it('normalizes nested provisional auto sizes before relation feasibility', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-nested-provisional-size', operation: 'reflow',
      graph: graph({
        nodes: [
          {
            id: 'outer', type: 'group', pinned: true, position: { x: 0, y: 0 }, children: [{
              id: 'inner', parent: 'outer', type: 'group', children: [{
                id: 'child', parent: 'inner', type: 'service', dimensions: { width: 20, height: 20 },
              }],
            }],
          },
          {
            id: 'external', type: 'service', pinned: true, position: { x: 200, y: 0 },
            dimensions: { width: 20, height: 60 },
          },
        ],
        constraints: [{
          id: 'left', kind: 'relative', subject: { kind: 'node', nodeId: 'outer' },
          relation: 'left-of', target: { kind: 'node', nodeId: 'external' },
        }],
      }),
      candidateLayout: {
        nodes: [
          {
            id: 'outer', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 },
            width: 1000, height: 1000,
          },
          {
            id: 'inner', parentId: 'outer', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 },
            width: 900, height: 900,
          },
          {
            id: 'child', parentId: 'inner', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 },
            width: 20, height: 20,
          },
          {
            id: 'external', position: { x: 200, y: 0 }, absolutePosition: { x: 200, y: 0 },
            width: 20, height: 60,
          },
        ],
        edges: [], width: 1000, height: 1000, effectiveOptions: {}, diagnostics: [],
      },
    });
    expect(result.nodes.find((node) => node.id === 'inner')!.width).toBe(150);
    expect(result.nodes.find((node) => node.id === 'outer')!.width).toBe(150);
    expect(result.acceptedConstraintIds).toEqual(['left']);
  });

  it.each(['required', 'preferred'] as const)(
    'jointly grows an auto-container for %s perpendicular center alignment',
    async (strength) => {
      const result = await resolveSpatialLayout({
        revision: `r-auto-center-size-${strength}`, operation: 'reflow', execution: { engine: echoEngine },
        graph: graph({
          nodes: [
            {
              id: 'p', type: 'group', pinned: true, position: { x: 0, y: 0 },
              children: [{ id: 'child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 } }],
            },
            {
              id: 'b', type: 'service', pinned: true, position: { x: 100, y: 200 },
              dimensions: { width: 20, height: 20 },
            },
          ],
          constraints: [{
            id: 'above', kind: 'relative', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'p' }, relation: 'above',
            target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
          }],
        }),
      });
      const parent = result.nodes.find((node) => node.id === 'p')!;
      const external = result.nodes.find((node) => node.id === 'b')!;
      expect(parent.width).toBe(220);
      expect(parent.absolutePosition.x + parent.width / 2).toBeCloseTo(
        external.absolutePosition.x + external.width / 2, 8,
      );
      expect(parent.absolutePosition.y + parent.height).toBeLessThanOrEqual(external.absolutePosition.y + 1e-6);
      expect(result.acceptedConstraintIds).toEqual(['above']);
    },
  );

  it.each([
    ['relative end', {
      id: 'above', kind: 'relative' as const, subject: { kind: 'node' as const, nodeId: 'p' },
      relation: 'above' as const, target: { kind: 'node' as const, nodeId: 'b' }, alignment: 'end' as const,
    }],
    ['column center arrangement', {
      id: 'column', kind: 'arrangement' as const, axis: 'column' as const, alignment: 'center' as const,
      subjects: [{ kind: 'node' as const, nodeId: 'p' }, { kind: 'node' as const, nodeId: 'b' }],
    }],
  ])('jointly grows an auto-container for %s', async (_case, constraint) => {
    const result = await resolveSpatialLayout({
      revision: `r-auto-alignment-${constraint.id}`, operation: 'reflow', execution: { engine: echoEngine },
      graph: graph({
        nodes: [
          {
            id: 'p', type: 'group', pinned: true, position: { x: 0, y: 0 },
            children: [{ id: 'child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 } }],
          },
          {
            id: 'b', type: 'service', pinned: true, position: { x: 200, y: 200 },
            dimensions: { width: 20, height: 20 },
          },
        ],
        constraints: [constraint],
      }),
    });
    const parent = result.nodes.find((node) => node.id === 'p')!;
    const external = result.nodes.find((node) => node.id === 'b')!;
    expect(parent.width).toBe(_case === 'relative end' ? 220 : 420);
    if (_case === 'relative end') {
      expect(parent.absolutePosition.x + parent.width).toBeCloseTo(
        external.absolutePosition.x + external.width, 8,
      );
    } else {
      expect(parent.absolutePosition.x + parent.width / 2).toBeCloseTo(
        external.absolutePosition.x + external.width / 2, 8,
      );
    }
    expect(result.acceptedConstraintIds).toEqual([constraint.id]);
  });

  it('propagates center-driven growth through nested auto-containers', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-nested-auto-center-size', operation: 'reflow', execution: { engine: echoEngine },
      graph: graph({
        nodes: [
          {
            id: 'outer', type: 'group', pinned: true, position: { x: 0, y: 0 }, children: [{
              id: 'inner', parent: 'outer', type: 'group', children: [{
                id: 'child', parent: 'inner', type: 'service', dimensions: { width: 20, height: 20 },
              }],
            }],
          },
          {
            id: 'b', type: 'service', pinned: true, position: { x: 100, y: 300 },
            dimensions: { width: 20, height: 20 },
          },
        ],
        constraints: [{
          id: 'above', kind: 'relative', subject: { kind: 'node', nodeId: 'outer' },
          relation: 'above', target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
        }],
      }),
    });
    expect(result.nodes.find((node) => node.id === 'outer')!.width).toBe(220);
    expect(result.nodes.find((node) => node.id === 'inner')!.width).toBe(150);
    expect(result.acceptedConstraintIds).toEqual(['above']);
  });

  it('moves an unpinned auto-container instead of growing it for center alignment', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-movable-auto-center', operation: 'reflow', execution: { engine: echoEngine },
      graph: graph({
        nodes: [
          {
            id: 'p', type: 'group', children: [
              { id: 'child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 } },
            ],
          },
          {
            id: 'b', type: 'service', pinned: true, position: { x: 100, y: 200 },
            dimensions: { width: 20, height: 20 },
          },
        ],
        constraints: [{
          id: 'above', kind: 'relative', subject: { kind: 'node', nodeId: 'p' },
          relation: 'above', target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
        }],
      }),
    });
    const parent = result.nodes.find((node) => node.id === 'p')!;
    expect(parent.width).toBe(150);
    expect(parent.absolutePosition.x).toBe(35);
  });

  it('solves coupled center-alignment sizes for two pinned auto-containers', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-coupled-auto-centers', operation: 'reflow', execution: { engine: echoEngine },
      graph: graph({
        nodes: [
          {
            id: 'a', type: 'group', pinned: true, position: { x: 0, y: 0 }, children: [
              { id: 'a-child', parent: 'a', type: 'service', dimensions: { width: 20, height: 20 } },
            ],
          },
          {
            id: 'b', type: 'group', pinned: true, position: { x: 200, y: 300 }, children: [
              { id: 'b-child', parent: 'b', type: 'service', dimensions: { width: 20, height: 20 } },
            ],
          },
        ],
        constraints: [{
          id: 'column', kind: 'arrangement', axis: 'column', alignment: 'center',
          subjects: [{ kind: 'node', nodeId: 'a' }, { kind: 'node', nodeId: 'b' }],
        }],
      }),
    });
    const a = result.nodes.find((node) => node.id === 'a')!;
    const b = result.nodes.find((node) => node.id === 'b')!;
    expect(a.width).toBe(550);
    expect(b.width).toBe(150);
    expect(a.absolutePosition.x + a.width / 2).toBeCloseTo(b.absolutePosition.x + b.width / 2, 8);
  });

  it.each(['required', 'preferred'] as const)(
    'keeps a movable %s alignment as a position degree of freedom',
    async (strength) => {
      const result = await resolveSpatialLayout({
        revision: `r-mixed-auto-centers-${strength}`, operation: 'reflow', execution: { engine: echoEngine },
        graph: graph({
          nodes: [
            {
              id: 'p', type: 'group', pinned: true, position: { x: 0, y: 0 }, children: [
                { id: 'child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 } },
              ],
            },
            {
              id: 'b', type: 'service', pinned: true, position: { x: 100, y: 200 },
              dimensions: { width: 20, height: 20 },
            },
            { id: 'c', type: 'service', dimensions: { width: 20, height: 20 } },
          ],
          constraints: [{
            id: 'above-b', kind: 'relative', subject: { kind: 'node', nodeId: 'p' },
            relation: 'above', target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
          }, {
            id: 'above-c', kind: 'relative', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'p' }, relation: 'above',
            target: { kind: 'node', nodeId: 'c' }, alignment: 'center',
          }],
        }),
      });
      const parent = result.nodes.find((node) => node.id === 'p')!;
      const movable = result.nodes.find((node) => node.id === 'c')!;
      expect(parent.width).toBe(220);
      expect(movable.absolutePosition.x).toBe(100);
      expect(movable.absolutePosition.y).toBeGreaterThanOrEqual(parent.absolutePosition.y + parent.height - 1e-6);
      expect(result.acceptedConstraintIds).toEqual(['above-b', 'above-c']);
    },
  );

  it.each(['required', 'preferred'] as const)(
    'derives %s alignment size from locally pinned siblings in a movable component',
    async (strength) => {
      const result = await resolveSpatialLayout({
        revision: `r-relative-component-${strength}`, operation: 'reflow', execution: { engine: echoEngine },
        graph: graph({
          nodes: [{
            id: 'g', type: 'group', children: [
              {
                id: 'p', parent: 'g', type: 'group', pinned: true, position: { x: 0, y: 0 },
                children: [{
                  id: 'child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 },
                }],
              },
              {
                id: 'b', parent: 'g', type: 'service', pinned: true, position: { x: 100, y: 200 },
                dimensions: { width: 20, height: 20 },
              },
            ],
          }],
          constraints: [{
            id: 'above', kind: 'relative', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'p' }, relation: 'above',
            target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
          }],
        }),
      });
      const ancestor = result.nodes.find((node) => node.id === 'g')!;
      const parent = result.nodes.find((node) => node.id === 'p')!;
      const sibling = result.nodes.find((node) => node.id === 'b')!;
      expect(parent.width).toBe(220);
      expect(ancestor.width).toBe(220);
      expect(ancestor.height).toBe(220);
      expect(parent.absolutePosition.x + parent.width / 2).toBeCloseTo(
        sibling.absolutePosition.x + sibling.width / 2, 8,
      );
      expect(result.acceptedConstraintIds).toEqual(['above']);
    },
  );

  it('keeps locally pinned nodes in separate movable ancestors position-independent', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-separate-relative-components', operation: 'reflow', execution: { engine: echoEngine },
      graph: graph({
        nodes: [{
          id: 'g1', type: 'group', children: [{
            id: 'p', parent: 'g1', type: 'group', pinned: true, position: { x: 0, y: 0 }, children: [{
              id: 'child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 },
            }],
          }],
        }, {
          id: 'g2', type: 'group', children: [{
            id: 'b', parent: 'g2', type: 'service', pinned: true, position: { x: 100, y: 200 },
            dimensions: { width: 20, height: 20 },
          }],
        }],
        constraints: [{
          id: 'above', kind: 'relative', subject: { kind: 'node', nodeId: 'p' },
          relation: 'above', target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
        }],
      }),
    });
    const parent = result.nodes.find((node) => node.id === 'p')!;
    const sibling = result.nodes.find((node) => node.id === 'b')!;
    expect(parent.width).toBe(150);
    expect(parent.absolutePosition.x + parent.width / 2).toBeCloseTo(
      sibling.absolutePosition.x + sibling.width / 2, 8,
    );
  });

  it.each(['required', 'preferred'] as const)(
    'uses a fixed-size right boundary to derive %s horizontal alignment size',
    async (strength) => {
      const result = await resolveSpatialLayout({
        revision: `r-fixed-right-component-${strength}`, operation: 'reflow', execution: { engine: echoEngine },
        graph: graph({
          nodes: [{
            id: 'g', type: 'group', dimensions: { width: 300, height: 300 }, children: [
              {
                id: 'p', parent: 'g', type: 'group', pinned: true, position: { x: 0, y: 0 }, children: [{
                  id: 'child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 },
                }],
              },
              { id: 'b', parent: 'g', type: 'service', dimensions: { width: 20, height: 20 } },
            ],
          }],
          constraints: [{
            id: 'right', kind: 'boundary', subject: { kind: 'node', nodeId: 'b' }, side: 'right',
            scope: { kind: 'node', nodeId: 'g' }, inset: 180,
          }, {
            id: 'top', kind: 'boundary', subject: { kind: 'node', nodeId: 'b' }, side: 'top',
            scope: { kind: 'node', nodeId: 'g' }, inset: 200,
          }, {
            id: 'above', kind: 'relative', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'p' }, relation: 'above',
            target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
          }],
        }),
      });
      const parent = result.nodes.find((node) => node.id === 'p')!;
      const sibling = result.nodes.find((node) => node.id === 'b')!;
      expect(parent.width).toBe(220);
      expect(sibling.position).toEqual({ x: 100, y: 200 });
      expect(parent.absolutePosition.x + parent.width / 2).toBeCloseTo(
        sibling.absolutePosition.x + sibling.width / 2, 8,
      );
      expect(result.acceptedConstraintIds).toEqual(['right', 'top', 'above']);
    },
  );

  it.each(['required', 'preferred'] as const)(
    'uses a fixed-size bottom boundary to derive %s vertical alignment size',
    async (strength) => {
      const result = await resolveSpatialLayout({
        revision: `r-fixed-bottom-component-${strength}`, operation: 'reflow', execution: { engine: echoEngine },
        graph: graph({
          nodes: [{
            id: 'g', type: 'group', dimensions: { width: 300, height: 300 }, children: [
              {
                id: 'p', parent: 'g', type: 'group', pinned: true, position: { x: 0, y: 0 }, children: [{
                  id: 'child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 },
                }],
              },
              { id: 'b', parent: 'g', type: 'service', dimensions: { width: 20, height: 20 } },
            ],
          }],
          constraints: [{
            id: 'bottom', kind: 'boundary', subject: { kind: 'node', nodeId: 'b' }, side: 'bottom',
            scope: { kind: 'node', nodeId: 'g' }, inset: 180,
          }, {
            id: 'left', kind: 'boundary', subject: { kind: 'node', nodeId: 'b' }, side: 'left',
            scope: { kind: 'node', nodeId: 'g' }, inset: 200,
          }, {
            id: 'left-of', kind: 'relative', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'p' }, relation: 'left-of',
            target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
          }],
        }),
      });
      const parent = result.nodes.find((node) => node.id === 'p')!;
      const sibling = result.nodes.find((node) => node.id === 'b')!;
      expect(parent.height).toBe(220);
      expect(sibling.position).toEqual({ x: 200, y: 100 });
      expect(parent.absolutePosition.y + parent.height / 2).toBeCloseTo(
        sibling.absolutePosition.y + sibling.height / 2, 8,
      );
      expect(result.acceptedConstraintIds).toEqual(['bottom', 'left', 'left-of']);
    },
  );

  it.each(['required', 'preferred'] as const)(
    'jointly solves a variable right boundary with %s center alignment',
    async (strength) => {
      const result = await resolveSpatialLayout({
        revision: `r-variable-right-center-${strength}`, operation: 'reflow', execution: { engine: echoEngine },
        graph: graph({
          nodes: [{
            id: 'g', type: 'group', dimensions: { width: 300, height: 300 }, children: [
              { id: 'p', parent: 'g', type: 'group', children: [{
                id: 'child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 },
              }] },
              {
                id: 'b', parent: 'g', type: 'service', pinned: true, position: { x: 100, y: 200 },
                dimensions: { width: 20, height: 20 },
              },
            ],
          }],
          constraints: [{
            id: 'right', kind: 'boundary', subject: { kind: 'node', nodeId: 'p' }, side: 'right',
            scope: { kind: 'node', nodeId: 'g' }, inset: 100,
          }, {
            id: 'above', kind: 'relative', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'p' }, relation: 'above',
            target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
          }],
        }),
      });
      const parent = result.nodes.find((node) => node.id === 'p')!;
      const sibling = result.nodes.find((node) => node.id === 'b')!;
      expect(parent.position.x).toBe(20);
      expect(parent.width).toBe(180);
      expect(parent.absolutePosition.x + parent.width / 2).toBeCloseTo(
        sibling.absolutePosition.x + sibling.width / 2, 8,
      );
      expect(result.acceptedConstraintIds).toEqual(['right', 'above']);
    },
  );

  it.each(['required', 'preferred'] as const)(
    'jointly solves a variable bottom boundary with %s center alignment',
    async (strength) => {
      const result = await resolveSpatialLayout({
        revision: `r-variable-bottom-center-${strength}`, operation: 'reflow', execution: { engine: echoEngine },
        graph: graph({
          nodes: [{
            id: 'g', type: 'group', dimensions: { width: 300, height: 300 }, children: [
              { id: 'p', parent: 'g', type: 'group', children: [{
                id: 'child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 },
              }] },
              {
                id: 'b', parent: 'g', type: 'service', pinned: true, position: { x: 200, y: 100 },
                dimensions: { width: 20, height: 20 },
              },
            ],
          }],
          constraints: [{
            id: 'bottom', kind: 'boundary', subject: { kind: 'node', nodeId: 'p' }, side: 'bottom',
            scope: { kind: 'node', nodeId: 'g' }, inset: 100,
          }, {
            id: 'left-of', kind: 'relative', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'p' }, relation: 'left-of',
            target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
          }],
        }),
      });
      const parent = result.nodes.find((node) => node.id === 'p')!;
      const sibling = result.nodes.find((node) => node.id === 'b')!;
      expect(parent.position.y).toBe(20);
      expect(parent.height).toBe(180);
      expect(parent.absolutePosition.y + parent.height / 2).toBeCloseTo(
        sibling.absolutePosition.y + sibling.height / 2, 8,
      );
      expect(result.acceptedConstraintIds).toEqual(['bottom', 'left-of']);
    },
  );

  it.each(['required', 'preferred'] as const)(
    'jointly derives auto width from required left and %s right boundaries',
    async (strength) => {
      const result = await resolveSpatialLayout({
        revision: `r-variable-two-boundaries-${strength}`, operation: 'reflow', execution: { engine: echoEngine },
        graph: graph({
          nodes: [{
            id: 'g', type: 'group', dimensions: { width: 300, height: 300 }, children: [{
              id: 'p', parent: 'g', type: 'group', children: [{
                id: 'child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 },
              }],
            }],
          }],
          constraints: [{
            id: 'left', kind: 'boundary', subject: { kind: 'node', nodeId: 'p' }, side: 'left',
            scope: { kind: 'node', nodeId: 'g' }, inset: 20,
          }, {
            id: 'right', kind: 'boundary', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'p' }, side: 'right',
            scope: { kind: 'node', nodeId: 'g' }, inset: 100,
          }],
        }),
      });
      const parent = result.nodes.find((node) => node.id === 'p')!;
      expect(parent.position.x).toBe(20);
      expect(parent.width).toBe(180);
      expect(result.acceptedConstraintIds).toEqual(['left', 'right']);
    },
  );

  it.each(['required', 'preferred'] as const)(
    'chooses a feasible point in an underdetermined horizontal auto-size family for %s alignment',
    async (strength) => {
      const result = await resolveSpatialLayout({
        revision: `r-affine-auto-widths-${strength}`, operation: 'reflow', execution: { engine: echoEngine },
        graph: graph({
          nodes: [{
            id: 'g', type: 'group', pinned: true, position: { x: 0, y: 0 },
            dimensions: { width: 500, height: 500 }, children: [
              { id: 'p', parent: 'g', type: 'group', children: [{
                id: 'p-child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 },
              }] },
              {
                id: 'b', parent: 'g', type: 'group', pinned: true, position: { x: 100, y: 200 },
                children: [{
                  id: 'b-child', parent: 'b', type: 'service', dimensions: { width: 20, height: 20 },
                }],
              },
            ],
          }],
          constraints: [{
            id: 'right', kind: 'boundary', subject: { kind: 'node', nodeId: 'p' }, side: 'right',
            scope: { kind: 'node', nodeId: 'g' }, inset: 100,
          }, {
            id: 'above', kind: 'relative', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'p' }, relation: 'above',
            target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
          }],
        }),
      });
      const parent = result.nodes.find((node) => node.id === 'p')!;
      const sibling = result.nodes.find((node) => node.id === 'b')!;
      expect(parent.width + sibling.width).toBeCloseTo(600, 8);
      expect(parent.absolutePosition.x + parent.width).toBeCloseTo(400, 8);
      expect(parent.absolutePosition.x + parent.width / 2).toBeCloseTo(
        sibling.absolutePosition.x + sibling.width / 2, 8,
      );
      expect(parent.width).toBeGreaterThanOrEqual(20);
      expect(sibling.width).toBeGreaterThanOrEqual(20);
      expect(result.acceptedConstraintIds).toEqual(['right', 'above']);
    },
  );

  it.each(['required', 'preferred'] as const)(
    'chooses a feasible point in an underdetermined vertical auto-size family for %s alignment',
    async (strength) => {
      const result = await resolveSpatialLayout({
        revision: `r-affine-auto-heights-${strength}`, operation: 'reflow', execution: { engine: echoEngine },
        graph: graph({
          nodes: [{
            id: 'g', type: 'group', pinned: true, position: { x: 0, y: 0 },
            dimensions: { width: 500, height: 500 }, children: [
              { id: 'p', parent: 'g', type: 'group', children: [{
                id: 'p-child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 },
              }] },
              {
                id: 'b', parent: 'g', type: 'group', pinned: true, position: { x: 200, y: 100 },
                children: [{
                  id: 'b-child', parent: 'b', type: 'service', dimensions: { width: 20, height: 20 },
                }],
              },
            ],
          }],
          constraints: [{
            id: 'bottom', kind: 'boundary', subject: { kind: 'node', nodeId: 'p' }, side: 'bottom',
            scope: { kind: 'node', nodeId: 'g' }, inset: 100,
          }, {
            id: 'left-of', kind: 'relative', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'p' }, relation: 'left-of',
            target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
          }],
        }),
      });
      const parent = result.nodes.find((node) => node.id === 'p')!;
      const sibling = result.nodes.find((node) => node.id === 'b')!;
      expect(parent.height + sibling.height).toBeCloseTo(600, 8);
      expect(parent.absolutePosition.y + parent.height).toBeCloseTo(400, 8);
      expect(parent.absolutePosition.y + parent.height / 2).toBeCloseTo(
        sibling.absolutePosition.y + sibling.height / 2, 8,
      );
      expect(parent.height).toBeGreaterThanOrEqual(20);
      expect(sibling.height).toBeGreaterThanOrEqual(20);
      expect(result.acceptedConstraintIds).toEqual(['bottom', 'left-of']);
    },
  );

  it('keeps the same underdetermined witness satisfiable with explicit fixed sizes', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-affine-fixed-control', operation: 'reflow', execution: { engine: echoEngine },
      graph: graph({
        nodes: [{
          id: 'g', type: 'group', pinned: true, position: { x: 0, y: 0 },
          dimensions: { width: 500, height: 500 }, children: [
            {
              id: 'p', parent: 'g', type: 'group', dimensions: { width: 300, height: 60 },
              children: [{ id: 'p-child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 } }],
            },
            {
              id: 'b', parent: 'g', type: 'group', pinned: true, position: { x: 100, y: 200 },
              dimensions: { width: 300, height: 60 },
              children: [{ id: 'b-child', parent: 'b', type: 'service', dimensions: { width: 20, height: 20 } }],
            },
          ],
        }],
        constraints: [{
          id: 'right', kind: 'boundary', subject: { kind: 'node', nodeId: 'p' }, side: 'right',
          scope: { kind: 'node', nodeId: 'g' }, inset: 100,
        }, {
          id: 'above', kind: 'relative', subject: { kind: 'node', nodeId: 'p' }, relation: 'above',
          target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
        }],
      }),
    });
    expect(result.nodes.find((node) => node.id === 'p')).toMatchObject({
      absolutePosition: { x: 100, y: 0 }, width: 300, height: 60,
    });
    expect(result.acceptedConstraintIds).toEqual(['right', 'above']);
  });

  it.each(['required', 'preferred'] as const)(
    'sizes an underdetermined horizontal auto family against the graph boundary for %s alignment',
    async (strength) => {
      const result = await resolveSpatialLayout({
        revision: `r-graph-affine-auto-widths-${strength}`, operation: 'reflow', execution: { engine: echoEngine },
        graph: graph({
          nodes: [{
            id: 'g', type: 'group', pinned: true, position: { x: 0, y: 0 },
            dimensions: { width: 500, height: 500 }, children: [
              { id: 'p', parent: 'g', type: 'group', children: [{
                id: 'p-child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 },
              }] },
              {
                id: 'b', parent: 'g', type: 'group', pinned: true, position: { x: 100, y: 200 },
                children: [{
                  id: 'b-child', parent: 'b', type: 'service', dimensions: { width: 20, height: 20 },
                }],
              },
            ],
          }],
          constraints: [{
            id: 'right', kind: 'boundary', subject: { kind: 'node', nodeId: 'p' }, side: 'right',
            scope: { kind: 'graph' }, inset: 100,
          }, {
            id: 'above', kind: 'relative', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'p' }, relation: 'above',
            target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
          }],
        }),
      });
      const parent = result.nodes.find((node) => node.id === 'p')!;
      const sibling = result.nodes.find((node) => node.id === 'b')!;
      expect(parent.width + sibling.width).toBeCloseTo(600, 8);
      expect(parent.absolutePosition.x + parent.width).toBeCloseTo(400, 8);
      expect(parent.absolutePosition.x + parent.width / 2).toBeCloseTo(
        sibling.absolutePosition.x + sibling.width / 2, 8,
      );
      expect(result.acceptedConstraintIds).toEqual(['right', 'above']);
    },
  );

  it.each(['required', 'preferred'] as const)(
    'sizes an underdetermined vertical auto family against the graph boundary for %s alignment',
    async (strength) => {
      const result = await resolveSpatialLayout({
        revision: `r-graph-affine-auto-heights-${strength}`, operation: 'reflow', execution: { engine: echoEngine },
        graph: graph({
          nodes: [{
            id: 'g', type: 'group', pinned: true, position: { x: 0, y: 0 },
            dimensions: { width: 500, height: 500 }, children: [
              { id: 'p', parent: 'g', type: 'group', children: [{
                id: 'p-child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 },
              }] },
              {
                id: 'b', parent: 'g', type: 'group', pinned: true, position: { x: 200, y: 100 },
                children: [{
                  id: 'b-child', parent: 'b', type: 'service', dimensions: { width: 20, height: 20 },
                }],
              },
            ],
          }],
          constraints: [{
            id: 'bottom', kind: 'boundary', subject: { kind: 'node', nodeId: 'p' }, side: 'bottom',
            scope: { kind: 'graph' }, inset: 100,
          }, {
            id: 'left-of', kind: 'relative', ...(strength === 'preferred' ? { strength } : {}),
            subject: { kind: 'node', nodeId: 'p' }, relation: 'left-of',
            target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
          }],
        }),
      });
      const parent = result.nodes.find((node) => node.id === 'p')!;
      const sibling = result.nodes.find((node) => node.id === 'b')!;
      expect(parent.height + sibling.height).toBeCloseTo(600, 8);
      expect(parent.absolutePosition.y + parent.height).toBeCloseTo(400, 8);
      expect(parent.absolutePosition.y + parent.height / 2).toBeCloseTo(
        sibling.absolutePosition.y + sibling.height / 2, 8,
      );
      expect(result.acceptedConstraintIds).toEqual(['bottom', 'left-of']);
    },
  );

  it('keeps the graph-boundary affine witness satisfiable with explicit fixed sizes', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-graph-affine-fixed-control', operation: 'reflow', execution: { engine: echoEngine },
      graph: graph({
        nodes: [{
          id: 'g', type: 'group', pinned: true, position: { x: 0, y: 0 },
          dimensions: { width: 500, height: 500 }, children: [
            {
              id: 'p', parent: 'g', type: 'group', dimensions: { width: 300, height: 60 },
              children: [{ id: 'p-child', parent: 'p', type: 'service', dimensions: { width: 20, height: 20 } }],
            },
            {
              id: 'b', parent: 'g', type: 'group', pinned: true, position: { x: 100, y: 200 },
              dimensions: { width: 300, height: 60 },
              children: [{ id: 'b-child', parent: 'b', type: 'service', dimensions: { width: 20, height: 20 } }],
            },
          ],
        }],
        constraints: [{
          id: 'right', kind: 'boundary', subject: { kind: 'node', nodeId: 'p' }, side: 'right',
          scope: { kind: 'graph' }, inset: 100,
        }, {
          id: 'above', kind: 'relative', subject: { kind: 'node', nodeId: 'p' }, relation: 'above',
          target: { kind: 'node', nodeId: 'b' }, alignment: 'center',
        }],
      }),
    });
    expect(result.nodes.find((node) => node.id === 'p')).toMatchObject({
      absolutePosition: { x: 100, y: 0 }, width: 300, height: 60,
    });
    expect(result.acceptedConstraintIds).toEqual(['right', 'above']);
  });

  it('shares one lazily enumerated graph-left extremum across repeated boundaries', async () => {
    const ids = Array.from({ length: 8 }, (_, index) => `n${index}`);
    const result = await resolveSpatialLayout({
      revision: 'r-shared-graph-extremum', operation: 'incremental', execution: { engine: echoEngine },
      graph: graph({
        nodes: ids.map((id, index) => ({
          id, type: 'service', position: { x: 0, y: index * 40 }, dimensions: { width: 20, height: 20 },
        })),
        constraints: ids.map((id) => ({
          id: `left-${id}`, kind: 'boundary' as const, subject: { kind: 'node' as const, nodeId: id },
          side: 'left' as const, scope: { kind: 'graph' as const }, inset: 0,
        })),
      }),
    });
    expect(result.acceptedConstraintIds).toEqual(ids.map((id) => `left-${id}`));
  });

  it('resolves authored route waypoints in order without promoting generated bends', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r4', operation: 'incremental', execution: { engine: echoEngine },
      graph: graph({
        nodes: [
          { id: 'a', type: 'service', position: { x: 0, y: 0 }, dimensions: { width: 20, height: 20 } },
          { id: 'b', type: 'service', position: { x: 100, y: 0 }, dimensions: { width: 20, height: 20 } },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b', routeIntent: { waypoints: [
          { id: 'w1', placement: { kind: 'absolute', position: { x: 40, y: 30 } } },
          { id: 'w2', placement: { kind: 'relative', anchor: { kind: 'node', nodeId: 'b' }, offset: { x: -20, y: 10 } } },
        ] } }],
      }),
    });

    expect(result.edges[0].sections).toHaveLength(3);
    expect(result.edges[0].sections[0].endPoint).toEqual({ x: 40, y: 30 });
    expect(result.edges[0].sections[1].endPoint).toEqual({ x: 90, y: 20 });
    expect(result.edges[0].waypointIds).toEqual(['w1', 'w2']);
  });

  it('resolves source, target, and port anchors from selected endpoint attachments', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-route-attachments', operation: 'incremental', execution: { engine: echoEngine },
      graph: graph({
        nodes: [
          {
            id: 'a', type: 'service', position: { x: 0, y: 0 }, dimensions: { width: 40, height: 20 },
            ports: [{ id: 'out', side: 'EAST', position: 0.5 }],
          },
          {
            id: 'b', type: 'service', position: { x: 100, y: 0 }, dimensions: { width: 40, height: 20 },
            ports: [{ id: 'in', side: 'WEST', position: 0.5 }, { id: 'east', side: 'EAST', position: 0.5 }],
          },
        ],
        edges: [{
          id: 'e', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in', routeIntent: { waypoints: [
            { id: 'source-relative', placement: { kind: 'relative', anchor: { kind: 'source' }, offset: { x: 10, y: 0 } } },
            { id: 'target-relative', placement: { kind: 'relative', anchor: { kind: 'target' }, offset: { x: -10, y: 0 } } },
            { id: 'port-relative', placement: { kind: 'relative', anchor: { kind: 'port', nodeId: 'b', portId: 'east' }, offset: { x: -60, y: 20 } } },
          ] },
        }],
      }),
    });
    const points = result.edges[0].sections.map((section) => section.endPoint);
    expect(result.edges[0].sections[0].startPoint).toEqual({ x: 40, y: 10 });
    expect(points).toEqual([
      { x: 50, y: 10 },
      { x: 90, y: 10 },
      { x: 80, y: 30 },
      { x: 100, y: 10 },
    ]);
  });

  it('retains engine-routed bends for ordinary edges', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-engine-route', operation: 'reflow',
      graph: graph({
        nodes: [
          { id: 'a', type: 'service', dimensions: { width: 20, height: 20 } },
          { id: 'b', type: 'service', dimensions: { width: 20, height: 20 } },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b' }],
      }),
      candidateLayout: {
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 }, width: 20, height: 20 },
          { id: 'b', position: { x: 100, y: 0 }, absolutePosition: { x: 100, y: 0 }, width: 20, height: 20 },
        ],
        edges: [{ id: 'e', sections: [{
          startPoint: { x: 20, y: 10 }, bendPoints: [{ x: 60, y: 40 }], endPoint: { x: 100, y: 10 },
        }] }],
        width: 120, height: 60, effectiveOptions: {}, diagnostics: [],
      },
    });

    expect(result.edges[0]).toMatchObject({
      waypointIds: [],
      sections: [{ bendPoints: [{ x: 60, y: 40 }] }],
    });
  });

  it('drops stale engine bends when constraint resolution moves geometry', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-reroute', operation: 'reflow',
      graph: graph({
        nodes: [
          { id: 'a', type: 'service', dimensions: { width: 20, height: 20 } },
          { id: 'b', type: 'service', dimensions: { width: 20, height: 20 } },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b' }],
        constraints: [{
          id: 'below', kind: 'relative', subject: { kind: 'node', nodeId: 'b' },
          relation: 'below', target: { kind: 'node', nodeId: 'a' }, gap: 30,
        }],
      }),
      candidateLayout: {
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 }, width: 20, height: 20 },
          { id: 'b', position: { x: 100, y: 0 }, absolutePosition: { x: 100, y: 0 }, width: 20, height: 20 },
        ],
        edges: [{ id: 'e', sections: [{
          startPoint: { x: 20, y: 10 }, bendPoints: [{ x: 60, y: -50 }], endPoint: { x: 100, y: 10 },
        }] }],
        width: 120, height: 70, effectiveOptions: {}, diagnostics: [],
      },
    });

    expect(result.edges[0].sections).toHaveLength(1);
    expect(result.edges[0].sections[0].bendPoints).toEqual([]);
  });

  it('assigns coincident parallel attachments in stable edge-id side order', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r-coincident', operation: 'incremental', execution: { engine: echoEngine },
      graph: graph({
        nodes: [
          { id: 'a', type: 'service', position: { x: 0, y: 0 }, dimensions: { width: 20, height: 20 } },
          { id: 'b', type: 'service', position: { x: 0, y: 0 }, dimensions: { width: 20, height: 20 } },
        ],
        edges: ['d', 'b', 'a', 'c'].map((id) => ({ id, source: 'a', target: 'b' })),
      }),
    });
    const starts = new Map(result.edges.map((edge) => [edge.id, edge.sections[0].startPoint]));
    const ends = new Map(result.edges.map((edge) => [edge.id, edge.sections.at(-1)!.endPoint]));
    expect(starts).toEqual(new Map([
      ['d', { x: 10, y: 4 }],
      ['b', { x: 0, y: 10 }],
      ['a', { x: 20, y: 10 }],
      ['c', { x: 10, y: 16 }],
    ]));
    expect(ends).toEqual(new Map([
      ['d', { x: 10, y: 16 }],
      ['b', { x: 20, y: 10 }],
      ['a', { x: 0, y: 10 }],
      ['c', { x: 10, y: 4 }],
    ]));
  });

  it('refuses malformed label placement before publishing layout', async () => {
    await expect(resolveSpatialLayout({
      revision: 'r5', operation: 'incremental', execution: { engine: echoEngine },
      graph: graph({ nodes: [{ id: 'a', type: 'service', labelPlacement: { side: 'above', offset: -1 } }] }),
    })).rejects.toMatchObject({ diagnostics: [expect.objectContaining({ code: 'layout.capability.unsupported' })] });
  });

  it('publishes only an exact authored revision match', async () => {
    const result = await resolveSpatialLayout({
      revision: 'r6', operation: 'incremental', execution: { engine: echoEngine },
      graph: graph({ nodes: [{ id: 'a', type: 'service' }] }),
    });
    expect(canPublishResolvedLayout(result, 'r6')).toBe(true);
    expect(canPublishResolvedLayout(result, 'r7')).toBe(false);
  });
});
