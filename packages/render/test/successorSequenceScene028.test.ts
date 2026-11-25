import { readFileSync } from 'node:fs';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import { measureText } from '../src/text/metrics.js';
import { describe, expect, it } from 'vitest';
import { prepareSequenceScene028, projectInstalledSourceToSuccessor028,
  successorSourceDisplay028, renderSvg, layoutSequence, type SequenceGraph } from '../src/index.js';
import { successorCatalogSnapshot028 } from '../src/successorInterpretation028.js';

function prepare(source: string, style: 'lowfi' | 'hifi') {
  const projected = projectInstalledSourceToSuccessor028(source);
  expect(projected.diagnostics).toEqual([]);
  const graph = projected.graph!;
  const before = JSON.stringify(graph);
  const display = successorSourceDisplay028(graph);
  const prepared = prepareSequenceScene028(display, { style, successorSource: graph });
  expect(JSON.stringify(graph)).toBe(before);
  expect(JSON.stringify(display)).not.toContain('sourceTimeline028');
  expect(prepared.semantic.successorSource).toEqual(graph);
  return prepared;
}

describe('source-owned sequence timeline scene', () => {
  it.each(['lowfi', 'hifi'] as const)('displays valid typed optional alt guards without inventing them in %s', (style) => {
    for (const mode of ['all omitted', 'mixed', 'nested']) {
      const body = mode === 'nested'
        ? 'choice = alt "outer" {\ninner = alt "yes" {\nfirst = a -> b\n} else "no" {\nsecond = b -> a\n}\n} else "stop" {\nlast = a -> b\n}\n'
        : 'choice = alt "one" {\nfirst = a -> b\n} else "two" {\nsecond = b -> a\n}\n';
      const graph = projectInstalledSourceToSuccessor028(`@diagram uml-sequence\na participant\nb participant\n${body}`).graph!;
      for (const fragment of graph.interaction!.fragments!) for (const [index, operand] of fragment.operands.entries())
        if (mode !== 'mixed' || index === 0) delete operand.guard;
      expect(validateGraphIRSuccessorWithCatalog(graph, successorCatalogSnapshot028(graph)).errors).toEqual([]);
      const before = JSON.stringify(graph);
      const display = successorSourceDisplay028(graph) as SequenceGraph;
      expect(display.sourceTimeline028).toEqual(graph.interaction);
      const { scene } = prepareSequenceScene028(display, { style, successorSource: graph });
      expect(scene.fragments.map(({ id }) => id).sort()).toEqual(graph.interaction!.fragments!.map(({ id }) => id).sort());
      for (const frame of scene.fragments) {
        const authored = graph.interaction!.fragments!.find(({ id }) => id === frame.id)!;
        expect(frame.accessibleName).toContain('unguarded');
        expect(frame.operands.map((operand) => Boolean(operand.guard)))
          .toEqual(authored.operands.map((operand) => Boolean(operand.guard)));
      }
      expect(scene.messages.map(({ id }) => id)).toEqual(graph.interaction!.messages.map(({ id }) => id));
      expect(renderSvg(display, { style, successorSource: graph })).not.toContain('[undefined]');
      expect(JSON.stringify(graph)).toBe(before);
    }
  });

  it.each(['omitted note', 'repeated note', 'omitted activation', 'crossing activation', 'changed message'])(
    'refuses a malformed derived timeline: %s', (mutation) => {
      const source = '@diagram uml-sequence\na participant\nb participant\n' +
        'work = activation a {\n inner = activation b {\n call = a -> b\n }\n}\ncheck = note "Ready" on a';
      const display = successorSourceDisplay028(projectInstalledSourceToSuccessor028(source).graph!) as SequenceGraph;
      const timeline = display.sourceTimeline028!;
      if (mutation === 'omitted note') timeline.items = timeline.items.filter((item) => item.kind !== 'note');
      if (mutation === 'repeated note') timeline.items.push({ kind: 'note', id: 'check' });
      if (mutation === 'omitted activation') timeline.items = timeline.items.filter((item) =>
        item.kind !== 'activation-start' && item.kind !== 'activation-end');
      if (mutation === 'crossing activation') {
        timeline.activations![1].participantId = timeline.activations![0].participantId;
        const ends = timeline.items.filter((item) => item.kind === 'activation-end');
        [ends[0].id, ends[1].id] = [ends[1].id, ends[0].id];
      }
      if (mutation === 'changed message') timeline.messages[0].receiverParticipantId = 'a';
      expect(() => layoutSequence(display)).toThrow(/coral.sequence.layout.invalid/);
    });

  it.each(['lowfi', 'hifi'] as const)('retains source decorations through the SVG layout handoff in %s', async (style) => {
    const source = readFileSync(new URL('../../diagram-editor/src/example-sources/uml-sequence.coral', import.meta.url), 'utf8');
    const graph = projectInstalledSourceToSuccessor028(source).graph!;
    const display = successorSourceDisplay028(graph);
    const laid = await layoutGraphForSvg(display, { svgOptions: { style } });
    expect(JSON.stringify(laid)).not.toContain('sourceTimeline028');
    const svg = renderSvg(laid, { style, successorSource: graph });
    for (const [kind, id] of [['fragment', 'choice'], ['activation', 'work'], ['note', 'note-1']])
      expect(svg.includes(`data-coral-sequence-${kind}="${id}"`)).toBe(true);
    expect(svg.includes('Passwords are never logged')).toBe(true);
  });

  it('keeps the production Welcome source as the cross-surface regression fixture', () => {
    expect(readFileSync(new URL('../../browser/test/fixtures/acceptance028/uml-sequence-activation-notes.coral', import.meta.url), 'utf8'))
      .toBe(readFileSync(new URL('../../diagram-editor/src/example-sources/uml-sequence.coral', import.meta.url), 'utf8'));
  });

  it.each(['lowfi', 'hifi'] as const)('reserves created headers before following timeline items in %s', (style) => {
    for (const kind of ['participant', 'actor']) for (const decoration of ['note "Ready" on worker',
      'work = activation worker {\n worker -> client\n}',
      'retry = loop "again" {\n worker -> client\n}']) {
      const source = '@diagram uml-sequence\nclient participant\n' +
        `worker ${kind} as "New\\nWorker"\nspawn = client -.-> worker [create]\n${decoration}\nworker -> client`;
      const { scene } = prepare(source, style);
      const worker = scene.participants.find((item) => item.id === 'worker')!;
      const afterHeader = worker.header.y + worker.header.height;
      const next = scene.notes[0] ?? scene.activations[0] ?? scene.fragments[0];
      expect(next.y).toBeGreaterThanOrEqual(afterHeader + 8);
      const spawn = scene.messages.find((item) => item.id === 'spawn')!;
      expect(Math.abs(spawn.points.at(-1)!.y - worker.header.y - worker.header.height / 2)).toBeLessThanOrEqual(0.5);
    }
  });

  it.each(['lowfi', 'hifi'] as const)('contains deep activation labels and nested guards in %s', (style) => {
    const nested = (kind: 'activation' | 'loop', body: string): string =>
      Array.from({ length: 9 }, (_, i) => kind === 'activation' ? `work${i} = activation a {` :
        `repeat${i} = loop "LONG GUARD CONTENT" {`).join('\n') + '\n' + body + '\n' + '}\n'.repeat(9);
    const activation = prepare('@diagram uml-sequence\na participant\nb participant\n' +
      nested('activation', 'a -> a as "Long self-message label"'), style).scene;
    const label = activation.messages[0].label!;
    const ink = measureText({ text: label.lines.join('\n'), fontSize: activation.messageFont.size,
      fontFamily: activation.messageFont.cssFamily, fontWeight: activation.messageFont.weight });
    expect(label.x + ink.width).toBeLessThan(activation.width);
    const fragments = prepare('@diagram uml-sequence\na participant\nb participant\n' +
      nested('loop', 'a -> b'), style).scene;
    for (const guard of fragments.fragments.flatMap((frame) => frame.operands.flatMap((operand) => operand.guard ? [operand.guard] : []))) {
      const width = measureText({ text: guard.lines.join('\n'), fontSize: fragments.font.size,
        fontFamily: fragments.font.cssFamily, fontWeight: fragments.font.weight }).width;
      expect(guard.x + width).toBeLessThan(fragments.participants[0].lifeline.x);
    }
  });

  it.each(['lowfi', 'hifi'] as const)('draws the actual D9 activation and ordered note in %s', (style) => {
    const source = readFileSync(new URL(
      '../../diagram-editor/src/example-sources/uml-sequence.coral', import.meta.url), 'utf8');
    const prepared = prepare(source, style);
    const { scene } = prepared;
    expect(scene.messages.map(({ id }) => id)).toEqual(['signIn', 'verify', 'granted', 'denied', 'notify']);
    expect(scene.activations.map(({ id }) => id)).toEqual(['work']);
    expect(scene.notes).toHaveLength(1);
    const activation = scene.activations[0];
    const messageY = (id: string) => scene.messages.find((message) => message.id === id)!.points[0].y;
    expect(activation.y).toBeGreaterThan(messageY('verify'));
    expect(activation.y).toBeLessThan(messageY('granted'));
    expect(activation.y + activation.height).toBeGreaterThan(messageY('denied'));
    expect(activation.y + activation.height).toBeLessThan(messageY('notify'));
    expect(scene.notes[0].y).toBeGreaterThan(messageY('notify'));
    expect(scene.notes[0].text.lines.join(' ')).toBe('Passwords are never logged');
    expect(prepared.ownerLookup.hitBounds['activation:work']).toMatchObject({
      x: activation.x, y: activation.y, width: activation.width, height: activation.height,
    });
    expect(scene.activations[0].accessibleName).toContain('Auth');
  });

  it.each(['lowfi', 'hifi'] as const)('contains an operand-local activation and message note in %s', (style) => {
    const source = '@diagram uml-sequence\napi participant\ndb participant\n' +
      'choice = alt "yes" {\n  work = activation api {\n' +
      '    call = api -> db\n    note "Review" on call\n  }\n' +
      '} else "no" {\n  api -> db\n}';
    const { scene } = prepare(source, style);
    const frame = scene.fragments[0];
    const note = scene.notes[0];
    const activation = scene.activations[0];
    expect(note.y).toBeGreaterThan(scene.messages[0].points[0].y);
    expect(note.y + note.height).toBeLessThan(frame.operands[1].separatorY!);
    expect(note.x).toBeGreaterThan(frame.x);
    expect(note.x + note.width).toBeLessThan(frame.x + frame.width);
    expect(activation.y).toBeLessThan(scene.messages[0].points[0].y);
    expect(activation.y + activation.height).toBeGreaterThan(note.y + note.height);
    expect(activation.y + activation.height).toBeLessThan(frame.operands[1].separatorY!);
    expect(scene.messages[0].points[0].x).toBe(activation.x + activation.width);
  });

  it('keeps note event order separate from alphabetical IDs and target ownership', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'z = note "First" on a\naNote = note "Second" on b\n' +
      'call = a -> b\nlast = note "Last" on a\n';
    const { scene } = prepare(source, 'hifi');
    expect(scene.notes.map(({ id }) => id)).toEqual(['z', 'aNote', 'last']);
    expect(scene.notes[0].y + scene.notes[0].height).toBeLessThan(scene.notes[1].y);
    expect(scene.notes[1].y + scene.notes[1].height).toBeLessThan(scene.messages[0].points[0].y);
    expect(scene.notes[2].y).toBeGreaterThan(scene.messages[0].points[0].y);
    expect(scene.notes[0].accessibleName).toContain('a');
    expect(scene.notes[1].accessibleName).toContain('b');
  });

  it.each([
    'retry = loop "more" {\n opt "ready" {\n  a -> b\n }\n}\n' +
      'lock = critical {\n a -> b\n}\nstop = break "cancelled" {\n b -> a\n}',
    'parallel = par {\n a -> b\n} and "other" {\n b -> a\n}',
    'empty = alt "yes" {\n} else "no" {\n}',
  ])('draws already accepted fragment forms without inventing a missing guard: %s', (body) => {
    const { scene } = prepare(`@diagram uml-sequence\na participant\nb participant\n${body}`, 'hifi');
    expect(scene.fragments.length).toBeGreaterThan(0);
    expect(scene.fragments.every((frame) => frame.height > frame.tab.height)).toBe(true);
    expect(scene.fragments.flatMap((frame) => frame.operands).some((operand) =>
      operand.guard?.lines.some((line) => line.includes('undefined')))).toBe(false);
    expect(scene.fragments.map(({ kind }) => kind).join(' ')).not.toContain('undefined');
  });
});
