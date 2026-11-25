import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareSequenceScene028, projectInstalledSourceToSuccessor028, renderSvg,
  successorSourceDisplay028 } from '../src/index.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';

const source = readFileSync(new URL('../../browser/test/fixtures/acceptance028/uml-sequence-lifecycle.coral', import.meta.url), 'utf8');

function prepare(text: string, style: 'lowfi' | 'hifi') {
  const projected = projectInstalledSourceToSuccessor028(text);
  expect(projected.diagnostics).toEqual([]);
  const before = JSON.stringify(projected.graph);
  const graph = successorSourceDisplay028(projected.graph!);
  const prepared = prepareSequenceScene028(graph, { style, successorSource: projected.graph });
  expect(JSON.stringify(projected.graph)).toBe(before);
  return { graph, prepared, meaning: projected.graph! };
}

describe('source-owned sequence end of life', () => {
  it.each(['lowfi', 'hifi'] as const)('terminates a created lifeline after recursive work in %s', async (style) => {
    const { graph, prepared, meaning } = prepare(source, style);
    const { scene } = prepared;
    const close = scene.messages.find((item) => item.id === 'close')!;
    const worker = scene.participants.find((item) => item.id === 'worker')!;
    const terminal = close.points.at(-1)!;
    expect(close).toMatchObject({ kind: 'destroy', dashed: false, head: 'open', targetId: 'worker' });
    expect(close.accessibleName).toContain('destruction');
    expect(terminal).toEqual({ x: worker.lifeline.x, y: worker.lifeline.y2 });
    expect(worker.accessibleName).toMatch(/destroyed.*close/i);
    expect(scene.messages.find((item) => item.id === 'record')!.points[0].y).toBeGreaterThan(terminal.y);
    expect(scene.participants.find((item) => item.id === 'audit')!.lifeline.y2).toBeGreaterThan(terminal.y);
    const parts = JSON.stringify(prepared.parts);
    expect(parts).toContain('data-coral-destruction');
    expect(prepared.ownerLookup.hitBounds['message:close'].y).toBeLessThan(terminal.y - 8);
    expect(prepared.ownerLookup.hitBounds['participant:worker'].y +
      prepared.ownerLookup.hitBounds['participant:worker'].height).toBe(terminal.y);
    const laid = await layoutGraphForSvg(graph, { svgOptions: { style } });
    const svg = renderSvg(laid, { style, successorSource: meaning });
    expect(svg.includes('data-coral-destruction="worker"')).toBe(true);
    expect(svg.includes('data-coral-sequence-message="close"')).toBe(true);
  });

  it.each(['lowfi', 'hifi'] as const)('leaves a positive lifeline for immediate created-actor destruction in %s', (style) => {
    const text = '@diagram uml-sequence\nclient participant\nworker actor as "New\\nActor"\n' +
      'spawn = client -.-> worker [create]\nclose = client -> worker [destroy]';
    const { graph } = prepare(text, style);
    // The explicit GraphIR 3 interchange path also needs clear lifecycle
    // geometry when it has no ordered-source sidecar.
    const { scene } = prepareSequenceScene028({ ...graph }, { style });
    const worker = scene.participants.find((item) => item.id === 'worker')!;
    expect(worker.lifeline.y2).toBeGreaterThan(worker.lifeline.y1 + 12);
    expect(scene.messages[1].points.at(-1)!.y).toBe(worker.lifeline.y2);
  });

  it('keeps independent destruction events at their own timeline offsets', () => {
    const text = '@diagram uml-sequence\na participant\nb participant\nc participant\n' +
      'first = a -> b [destroy]\nnote "Survivor" on c\n' +
      'second = a -> c [destroy]\nlast = a -> a as "continue"';
    for (const style of ['lowfi', 'hifi'] as const) {
      const { prepared } = prepare(text, style);
      const ends = ['b', 'c'].map((id) => prepared.scene.participants.find((item) => item.id === id)!.lifeline.y2);
      expect(ends[1]).toBeGreaterThan(ends[0]);
      for (const message of prepared.scene.messages.filter((item) => item.kind === 'destroy'))
        expect(message.points.at(-1)!.y).toBe(prepared.scene.participants.find((item) => item.id === message.targetId)!.lifeline.y2);
      expect(prepared.scene.participants[0].lifeline.y2).toBeGreaterThan(ends[1]);
    }
  });

  it('refuses a destroyed participant reused through a malformed display view', () => {
    const projected = projectInstalledSourceToSuccessor028('@diagram uml-sequence\nclient participant\nserver participant\nclose = client -> server [destroy]\n');
    const graph = successorSourceDisplay028(projected.graph!);
    graph.edges.push({ id: 'late', source: 'server', target: 'client', type: 'async' });
    graph.interaction!.messages.push({ id: 'late', edgeId: 'late', sourceParticipantId: 'server', targetParticipantId: 'client', kind: 'asynchronous' });
    graph.interaction!.messageOrder.push('late');
    expect(() => prepareSequenceScene028(graph)).toThrow(/destroyed participant/);
  });

  it.each([['client -> server', 'server'], ['server <- client', 'server'],
    ['client <- server', 'client'], ['server -> server', 'server']])(
    'ends the directed receiver lifeline for %s', (connector, receiverId) => {
      const text = '@diagram uml-sequence\nclient participant\nserver actor\n' +
        `close = ${connector} [destroy] as "stop"\n`;
      for (const style of ['lowfi', 'hifi'] as const) {
        const { prepared } = prepare(text, style);
        const message = prepared.scene.messages[0];
        const receiver = prepared.scene.participants.find((item) => item.id === receiverId)!;
        expect(message.kind).toBe('destroy');
        expect(message.points.at(-1)).toEqual({ x: receiver.lifeline.x, y: receiver.lifeline.y2 });
        expect(message.head).toBe('open');
        expect(message.dashed).toBe(false);
      }
    });
});
