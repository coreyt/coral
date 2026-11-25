import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { GraphIR, Interaction } from '@graph-ir/core';
import {
  layoutSequence,
  prepareSequenceScene028,
  measureLine,
  notationRegistry,
  projectInstalledSourceToSuccessor028,
  renderSvg,
  sequencePrimitives,
  svgFontFaceRequests,
  symbolRegistry,
  successorSequenceDisplay028,
  type SequencePrimitive,
} from '../src/index.js';

type Message = [id: string, source: string, target: string, token: 'sync' | 'async' | 'return', label?: string];
const KIND = { sync: 'synchronous', async: 'asynchronous', return: 'return' } as const;

function sequence(
  participants: [id: string, type: 'participant' | 'actor', label: string][],
  messages: Message[],
  extra: Pick<Interaction, 'activations' | 'fragments' | 'notes'> = {},
): GraphIR {
  return {
    version: '3.0.0', id: 'seq', name: 'Login',
    metadata: { notation: 'uml-sequence' }, profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
    nodes: participants.map(([id, type, label]) => ({ id, type, label })),
    edges: messages.map(([id, source, target, type, label]) => ({ id, source, target, type, ...(label ? { label } : {}) })),
    interaction: {
      participants: participants.map(([id]) => ({ id, nodeId: id })),
      participantOrder: participants.map(([id]) => id),
      messages: messages.map(([id, source, target, token]) => ({
        id, edgeId: id, sourceParticipantId: source, targetParticipantId: target, kind: KIND[token],
      })),
      messageOrder: messages.map(([id]) => id),
      ...extra,
    },
  };
}

const people: [string, 'participant' | 'actor', string][] = [
  ['Client', 'actor', 'Client'], ['Web', 'participant', 'Web Server'], ['Auth', 'participant', 'Auth Service'],
];
const login = () => sequence(people, [
  ['m1', 'Client', 'Web', 'sync', 'POST /login'],
  ['m2', 'Web', 'Auth', 'sync', 'validate'],
  ['m3', 'Auth', 'Auth', 'sync', 'hash'],
  ['m4', 'Auth', 'Web', 'return', 'token'],
  ['m5', 'Web', 'Client', 'async', 'result'],
], {
  activations: [{ id: 'activation-1', participantId: 'Auth', startMessageId: 'm2', endMessageId: 'm4' }],
  fragments: [{ id: 'fragment-1', kind: 'alt', operands: [
    { id: 'fragment-1-operand-1', guard: { id: 'fragment-1-guard-1', text: 'valid' }, messageIds: ['m3', 'm4'] },
    { id: 'fragment-1-operand-2', guard: { id: 'fragment-1-guard-2', text: 'invalid' }, messageIds: [] },
  ] }],
  notes: [
    { id: 'note-2', text: 'after m2', messageIds: ['m2'] },
    { id: 'note-1', text: 'top', participantIds: ['Client', 'Web'] },
  ],
});

describe('UML sequence layout', () => {
  it.each(['hifi', 'lowfi'] as const)(
    'keeps creation headers and lifelines aligned before, between and after nested frames in %s', (style) => {
      const source = readFileSync(new URL(
        '../../browser/test/fixtures/acceptance028/uml-sequence-created-after-nested.coral', import.meta.url), 'utf8');
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const before = JSON.stringify(projected.graph);
      const prepared = prepareSequenceScene028(successorSequenceDisplay028(projected.graph!), { style });
      const { scene } = prepared;
      for (const [messageId, participantId] of [['early', 'monitor'], ['spawn', 'worker'], ['archive', 'archiveWorker']]) {
        const message = scene.messages.find((item) => item.id === messageId)!;
        const participant = scene.participants.find((item) => item.id === participantId)!;
        const contact = message.points.at(-1)!;
        // Integer-normalized boxes can have an odd height and a half-unit center.
        expect(Math.abs(contact.y - participant.header.y - participant.header.height / 2)).toBeLessThanOrEqual(0.5);
        expect(contact.x).toBe(participant.header.x);
        expect(participant.lifeline.y1).toBe(participant.header.y + participant.header.height);
        expect(participant.label.y).toBeGreaterThan(participant.header.y);
        expect(participant.label.y).toBeLessThan(participant.lifeline.y1);
        expect(participant.lifeline.y2).toBeGreaterThan(participant.lifeline.y1);
        expect(prepared.ownerLookup.hitBounds[`participant:${participantId}`].y).toBe(participant.header.y);
      }
      const worker = scene.participants.find((item) => item.id === 'worker')!;
      const choice = scene.fragments.find((item) => item.id === 'choice')!;
      expect(worker.header.y).toBeGreaterThan(choice.y + choice.height);
      expect(worker.header.y).toBeLessThan(scene.fragments.find((item) => item.id === 'delivery')!.y);
      const archive = scene.participants.find((item) => item.id === 'archiveWorker')!;
      expect(archive.header.y).toBeGreaterThan(Math.max(...scene.fragments.map((frame) => frame.y + frame.height)));
      expect(JSON.stringify(projected.graph)).toBe(before);
    },
  );

  it('keeps tab ink and first guards clear of the tab border at hifi text size', () => {
    const source = [
      '@diagram uml-sequence', 'client participant', 'server participant',
      'before = client -> server',
      'choice = alt "valid" {', '  call = client -> server',
      '  retry = alt "again" {', '    nested = server -> client',
      '  } else "stop" {', '    stopped = client -> server', '  }',
      '} else "invalid" {', '  rejected = server -> client', '}',
    ].join('\n');
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    for (const [fontSize, fontFamily] of [[18, 'Coral Inter'], [26, 'Coral Lowfi Caveat']] as const) {
      const options = { fontSize, fontFamily, lineHeight: 1.4 };
      const recursive = layoutSequence(successorSequenceDisplay028(projected.graph!), options);
      const messageY = (id: string) => recursive.messages.find((message) => message.id === id)!.points[0].y;
      const frameY = (id: string) => recursive.fragments.find((fragment) => fragment.id === id)!.y;
      expect(frameY('choice') - messageY('before')).toBeGreaterThanOrEqual(8);
      expect(frameY('retry') - messageY('call')).toBeGreaterThanOrEqual(8);
      for (const graph of [login(), successorSequenceDisplay028(projected.graph!)]) {
        const scene = layoutSequence(graph, options);
        for (const fragment of scene.fragments) {
          const tabBottom = fragment.tab.y + fragment.tab.height;
          expect(fragment.tab.text.y + 4).toBeLessThanOrEqual(tabBottom);
          expect(fragment.operands[0].guard!.y - scene.font.size).toBeGreaterThanOrEqual(tabBottom + 4);
          const firstLifeline = Math.min(...scene.participants
            .map((participant) => participant.lifeline.x)
            .filter((x) => x >= fragment.x && x <= fragment.x + fragment.width));
          for (const operand of fragment.operands) if (operand.guard) {
            const widestLine = Math.max(...operand.guard.lines.map((line) =>
              measureLine(line, scene.font.size, scene.font.cssFamily, scene.font.weight)));
            expect(operand.guard.x + widestLine + 8).toBeLessThanOrEqual(firstLifeline);
          }
        }
      }
    }
  });

  it('keeps a legacy fragment guard clear of uninvolved lifelines to its left', () => {
    const graph = sequence([
      ['A', 'participant', 'A'], ['B', 'participant', 'B'], ['C', 'participant', 'C'],
    ], [['m', 'B', 'C', 'sync']], {
      fragments: [{ id: 'opt', kind: 'opt', operands: [{ id: 'branch',
        guard: { id: 'guard', text: 'long permission validation' }, messageIds: ['m'] }] }],
    });
    const scene = layoutSequence(graph, { fontSize: 18, fontFamily: 'Coral Inter', lineHeight: 1.4 });
    const guard = scene.fragments[0].operands[0].guard!;
    const guardRight = guard.x + Math.max(...guard.lines.map((line) =>
      measureLine(line, scene.font.size, scene.font.cssFamily, scene.font.weight)));
    expect(guardRight + 8).toBeLessThanOrEqual(Math.min(...scene.participants.map((part) => part.lifeline.x)));
  });

  it('builds one versioned, owned primitive envelope for canvas and SVG', () => {
    const graph = login();
    const prepared = prepareSequenceScene028(graph, { style: 'lowfi', revision: 'edit-12' });
    const ids: string[] = [];
    const visit = (parts: readonly SequencePrimitive[]) => parts.forEach((part) => {
      ids.push(String(part.attrs['data-coral-part-id']));
      visit(part.children ?? []);
    });
    visit(prepared.parts);
    expect(prepared.kind).toBe('sequence');
    expect(prepared.revision).toBe('edit-12');
    expect(prepared.semantic.interaction?.messageOrder).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(prepared.partIndex)).toHaveLength(ids.length);
    expect(prepared.ownerLookup.partIds['message:m1']?.length).toBeGreaterThan(2);
    expect(prepared.ownerLookup.hitBounds['message:m1']?.width).toBeGreaterThan(0);
    expect(prepared.ownerLookup.partIds['participant:Client']?.length).toBeGreaterThan(2);
    const fragment = prepared.scene.fragments[0]!;
    const first = prepared.ownerLookup.hitBounds['operand:fragment-1-operand-1']!;
    const second = prepared.ownerLookup.hitBounds['operand:fragment-1-operand-2']!;
    expect(first.x).toBe(fragment.x);
    expect(second.width).toBe(fragment.width);
    expect(first.y).toBeGreaterThanOrEqual(fragment.y + fragment.tab.height);
    expect(first.y + first.height).toBe(second.y);
    expect(second.y).toBeGreaterThan(first.y);
    expect(second.y + second.height).toBe(fragment.y + fragment.height);
    expect(renderSvg(graph)).toMatch(/data-coral-part-id="message:m1:g:\d+"/);
  });
  it('renders the portable sequence profile without descriptive notation metadata', () => {
    const graph = login();
    delete graph.metadata;
    expect(renderSvg(graph)).toContain('data-coral-sequence-message="m1"');
  });

  it('renders a creation message dashed and open into the new participant header', () => {
    const graph = sequence([
      ['Client', 'participant', 'Client'], ['Worker', 'participant', 'Worker'],
    ], [['createWorker', 'Client', 'Worker', 'return', 'spawn()']]);
    graph.interaction!.messages[0].kind = 'create';
    const scene = layoutSequence(graph);
    const client = scene.participants[0];
    const worker = scene.participants[1];
    const creation = scene.messages[0];
    expect(creation).toMatchObject({ kind: 'create', dashed: true, head: 'open' });
    expect(worker.header.y).toBeGreaterThan(client.header.y);
    expect(creation.points[1].x).toBe(worker.header.x);
    expect(creation.points[1].y).toBeGreaterThan(worker.header.y);
    expect(creation.points[1].y).toBeLessThan(worker.header.y + worker.header.height);
    expect(worker.lifeline.y1).toBe(worker.header.y + worker.header.height);
    expect(renderSvg(graph)).toContain('data-coral-sequence-message="createWorker"');
  });

  it('keeps a creation label between the sender and target header', () => {
    const label = 'spawn a new background processing worker';
    const graph = sequence([
      ['Client', 'participant', 'Client'], ['Worker', 'participant', 'Worker'],
    ], [['createWorker', 'Client', 'Worker', 'return', label]]);
    graph.interaction!.messages[0].kind = 'create';
    const scene = layoutSequence(graph);
    const text = scene.messages[0].label!;
    const width = measureLine(label, scene.fontSize, scene.font.cssFamily, scene.font.weight);
    expect(text.x + width / 2).toBeLessThan(scene.participants[1].header.x - 8);
  });

  it('targets the header right edge for leftward creation', () => {
    const graph = sequence([
      ['Worker', 'participant', 'Worker'], ['Client', 'participant', 'Client'],
    ], [['createWorker', 'Client', 'Worker', 'return', 'spawn()']]);
    graph.interaction!.messages[0].kind = 'create';
    const scene = layoutSequence(graph);
    const worker = scene.participants[0];
    expect(scene.messages[0].points[1].x).toBe(worker.header.x + worker.header.width);
    expect(worker.lifeline.y1).toBe(worker.header.y + worker.header.height);
  });

  it('orders lifelines and messages by the interaction, not storage', () => {
    const scene = layoutSequence(login());
    expect(scene.participants.map((participant) => participant.id)).toEqual(['Client', 'Web', 'Auth']);
    const xs = scene.participants.map((participant) => participant.lifeline.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    const ys = scene.messages.map((message) => message.points[0].y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(scene.messages.map((message) => [message.id, message.dashed, message.head])).toEqual([
      ['m1', false, 'filled'], ['m2', false, 'filled'], ['m3', false, 'filled'], ['m4', true, 'open'], ['m5', false, 'open'],
    ]);
    expect(scene.messages[2].self).toBe(true);
    expect(scene.messages[2].points).toHaveLength(4);
    expect(scene.participants[0].kind).toBe('actor');
  });

  it('is invariant under node, edge, and interaction storage permutations', () => {
    const graph = login();
    const permuted = structuredClone(graph);
    permuted.nodes.reverse();
    permuted.edges.reverse();
    permuted.interaction!.participants.reverse();
    permuted.interaction!.messages.reverse();
    permuted.interaction!.notes!.reverse();
    expect(layoutSequence(permuted)).toEqual(layoutSequence(graph));
    expect(renderSvg(permuted)).toBe(renderSvg(graph));
  });

  it('places participant-only notes first and message notes after their anchor, tied by id', () => {
    const scene = layoutSequence(login());
    const [top, after] = scene.notes;
    expect(top.id).toBe('note-1');
    expect(top.y).toBeLessThan(scene.messages[0].points[0].y);
    expect(after.y).toBeGreaterThan(scene.messages[1].points[0].y);
    expect(after.y).toBeLessThan(scene.messages[2].points[0].y);
    const tied = sequence(people.slice(0, 2), [['m1', 'Client', 'Web', 'sync']], { notes: [
      { id: 'note-10', text: 'b', messageIds: ['m1'] }, { id: 'note-2', text: 'a', messageIds: ['m1'] },
    ] });
    expect(layoutSequence(tied).notes.map((note) => note.id)).toEqual(['note-2', 'note-10']);
    const huge = sequence(people.slice(0, 2), [['m1', 'Client', 'Web', 'sync']], { notes: [
      { id: 'note-100000000000000000000', text: 'b', messageIds: ['m1'] }, { id: 'note-99999999999999999999', text: 'a', messageIds: ['m1'] },
    ] });
    expect(layoutSequence(huge).notes.map((note) => note.id)).toEqual(['note-99999999999999999999', 'note-100000000000000000000']);
  });

  it('frames a flat fragment around its range with guards, separators, and an empty operand band', () => {
    const scene = layoutSequence(login());
    const [frame] = scene.fragments;
    expect(frame.kind).toBe('alt');
    expect(frame.y).toBeLessThan(scene.messages[2].points[0].y);
    expect(frame.y + frame.height).toBeGreaterThan(scene.messages[3].points[0].y);
    expect(frame.y + frame.height).toBeLessThan(scene.messages[4].points[0].y);
    expect(frame.operands.map((operand) => operand.guard?.lines[0])).toEqual(['[valid]', '[invalid]']);
    expect(frame.operands[1].separatorY).toBeGreaterThan(scene.messages[3].points[0].y);
    expect(frame.y + frame.height - frame.operands[1].separatorY!).toBeGreaterThanOrEqual(24);
    expect(frame.accessibleName).toBe('alt fragment, messages 3 to 4, operands: [valid], [invalid]');
  });

  it('stacks nested and overlapping activations on distinct levels and stops messages at the deepest bar', () => {
    const graph = sequence(people.slice(0, 2), [
      ['m1', 'Client', 'Web', 'sync'], ['m2', 'Client', 'Web', 'sync'], ['m3', 'Web', 'Client', 'return'], ['m4', 'Web', 'Client', 'return'],
    ], { activations: [
      { id: 'a', participantId: 'Web', startMessageId: 'm1', endMessageId: 'm3' },
      { id: 'b', participantId: 'Web', startMessageId: 'm2', endMessageId: 'm4' },
    ] });
    const scene = layoutSequence(graph);
    const [first, second] = scene.activations;
    expect(second.x - first.x).toBe(5);
    expect(scene.messages[1].points[1].x).toBe(second.x);
    expect(scene.activations[0].accessibleName).toBe('Activation of Web Server from message 1 to message 3');
  });

  it('grows rows for multiline labels and widens gaps for long labels', () => {
    const short = layoutSequence(sequence(people.slice(0, 2), [['m1', 'Client', 'Web', 'sync', 'a'], ['m2', 'Web', 'Client', 'return', 'b']]));
    const tall = layoutSequence(sequence(people.slice(0, 2), [['m1', 'Client', 'Web', 'sync', 'a'], ['m2', 'Web', 'Client', 'return', 'a\nb\nc']]));
    expect(tall.messages[1].points[0].y - tall.messages[0].points[0].y)
      .toBeGreaterThan(short.messages[1].points[0].y - short.messages[0].points[0].y);
    const wide = layoutSequence(sequence(people.slice(0, 2), [['m1', 'Client', 'Web', 'sync', 'x'.repeat(80)]]));
    expect(wide.participants[1].lifeline.x - wide.participants[0].lifeline.x)
      .toBeGreaterThan(short.participants[1].lifeline.x - short.participants[0].lifeline.x);
  });

  it('renders multiline guards on separate lines (CR70-7)', () => {
    const graph = login();
    graph.interaction!.fragments![0].operands[0].guard!.text = 'first\nsecond';
    const scene = layoutSequence(graph);
    expect(scene.fragments[0].operands[0].guard?.lines).toEqual(['[first', 'second]']);
    expect(scene.messages[2].points[0].y - scene.fragments[0].operands[0].guard!.y).toBeGreaterThan(scene.lineHeight);
  });

  it('keeps self-message loops visible under deep activation stacking (CR70-8)', () => {
    const messages: Message[] = Array.from({ length: 6 }, (_, index) => [`m${index + 1}`, 'Web', 'Web', 'sync', `step ${index + 1}`] as Message);
    const graph = sequence(people.slice(1, 2), messages, {
      activations: messages.map(([id], index) => ({ id: `a${index}`, participantId: 'Web', startMessageId: id, endMessageId: 'm6' })),
    });
    for (const message of layoutSequence(graph).messages) {
      expect(message.points[1].x - message.points[0].x).toBeGreaterThanOrEqual(20);
      // The label sits beside its loop, never over it.
      expect(message.label === undefined || message.label.x > message.points[1].x).toBe(true);
    }
  });

  it('handles empty and message-free interactions', () => {
    const empty = layoutSequence(sequence([], []));
    expect(empty.participants).toEqual([]);
    expect(sequencePrimitives(empty, THEME)).toHaveLength(1);
    const lonely = layoutSequence(sequence([people[1]], []));
    expect(lonely.participants[0].lifeline.y2 - lonely.participants[0].lifeline.y1).toBeGreaterThanOrEqual(48);
    expect(lonely.description).toBe('Sequence diagram with 1 participant and 0 messages');
  });

  it.each<[string, (graph: GraphIR) => void]>([
    ['incomplete message order', (graph) => { graph.interaction!.messageOrder.pop(); }],
    ['dangling activation', (graph) => { graph.interaction!.activations![0].endMessageId = 'nope'; }],
    ['unanchored note', (graph) => { graph.interaction!.notes![0] = { id: 'n', text: 'x' }; }],
    ['non-contiguous fragment', (graph) => { graph.interaction!.fragments![0].operands[0].messageIds = ['m1', 'm3']; }],
  ])('refuses a structurally unusable interaction: %s', (_name, mutate) => {
    const graph = login();
    mutate(graph);
    expect(() => layoutSequence(graph)).toThrow('coral.sequence.layout.invalid');
    expect(() => renderSvg(graph)).toThrow('coral.sequence.layout.invalid');
  });
});

const THEME = { background: '#fff', fill: '#f8fafc', stroke: '#334155', text: '#0f172a', edge: '#475569', noteFill: '#fef9c3' };

function count(primitives: SequencePrimitive[], attribute: string): number {
  return primitives.reduce((total, primitive) => total + (attribute in primitive.attrs ? 1 : 0) + count(primitive.children ?? [], attribute), 0);
}

describe('UML sequence SVG and shared primitives', () => {
  it('applies shared text shaping to participant, message, note and guard text without changing the model', () => {
    const graph = login();
    const original = structuredClone(graph);
    const scene = layoutSequence(graph);
    const flatten = (items: SequencePrimitive[]): SequencePrimitive[] =>
      items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
    const texts = flatten(sequencePrimitives(scene, THEME)).filter((item) => item.tag === 'text');
    const labels = texts.map((item) => (item.children ?? []).map((line) => line.text).join('\n'));
    expect(labels).toEqual(expect.arrayContaining(['Client', 'POST /login', 'after m2', '[valid]']));
    expect(texts.every((item) => item.attrs.class === 'coral-font-text')).toBe(true);
    const svg = renderSvg(graph);
    const renderedTexts = svg.match(/<text\b[^>]*>/g) ?? [];
    expect(renderedTexts).toHaveLength(texts.length);
    expect(renderedTexts.every((tag) => tag.includes('class="coral-font-text"'))).toBe(true);
    expect(graph).toEqual(original);
  });

  it('emits one accessible group per scene element from the shared primitives', () => {
    const scene = layoutSequence(login());
    const primitives = sequencePrimitives(scene, THEME);
    expect(count(primitives, 'data-coral-sequence-participant')).toBe(3);
    expect(count(primitives, 'data-coral-sequence-message')).toBe(5);
    expect(count(primitives, 'data-coral-sequence-activation')).toBe(1);
    expect(count(primitives, 'data-coral-sequence-note')).toBe(2);
    expect(count(primitives, 'data-coral-sequence-fragment')).toBe(1);
    const svg = renderSvg(login());
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title>Login</title>');
    expect(svg).toContain('<desc>Sequence diagram with 3 participants and 5 messages</desc>');
    expect(svg).toContain('aria-label="Message 2 of 5: Web Server to Auth Service, synchronous, &quot;validate&quot;"');
    expect(svg.match(/data-coral-sequence-message=/g)).toHaveLength(5);
    expect(svg).not.toContain('data-coral-edge');
  });

  it('renders with the document font settings and embeds only the selected faces (R-033)', () => {
    const graph = login();
    const inter = renderSvg(graph, { fontSettings: { default: { family: 'Inter', size: 12 } } });
    const serif = renderSvg(graph, { fontSettings: { default: { family: 'Serif', size: 30, weight: 'bold', lineHeight: 1.6 } } });
    expect(serif).not.toBe(inter);
    const size = (svg: string) => svg.match(/width="(\d+)" height="(\d+)"/)!.slice(1).map(Number);
    expect(size(serif)[0]).toBeGreaterThan(size(inter)[0]);
    expect(size(serif)[1]).toBeGreaterThan(size(inter)[1]);
    const scene = layoutSequence(graph, { fontSettings: { default: { family: 'Serif', size: 30, weight: 'bold', lineHeight: 1.6 } } });
    expect(scene.font).toMatchObject({ size: 30, weight: 700, lineHeight: 48 });
    expect(serif).toContain(`font-family="${scene.font.cssFamily}"`);
    expect(serif).toContain('font-size="30"');
    expect(serif).toContain('font-weight="700"');
    expect(serif).not.toContain('font-size="12"');
    expect(serif.match(/@font-face/g)?.length).toBeGreaterThan(0);
    expect(serif).not.toContain('Coral Inter');
  });

  it('reports exactly the faces the sequence SVG embeds for raster preloading', () => {
    const options = { fontSettings: { default: { family: 'Inter', size: 12, weight: 'normal' as const } } };
    const graph = login();
    const scene = layoutSequence(graph, options);
    expect(scene.faces.map((face) => face.weight).sort()).toEqual([400, 700]);
    expect(svgFontFaceRequests(graph, options)).toEqual(scene.faces);
    expect(svgFontFaceRequests(graph, {})).toEqual([
      { id: 'caveat', weight: 500 },
      { id: 'caveat', weight: 550 },
      { id: 'caveat', weight: 700 },
    ]);
    const refined = renderSvg(graph);
    expect(refined).toContain('font-family="Coral Lowfi Caveat"');
    expect(refined).toContain('font-weight="550"');
  });

  it('applies a participant symbol override to its header only', () => {
    const scene = layoutSequence(login(), { fontSettings: {
      default: { family: 'Inter', size: 12 }, symbolOverrides: { 'uml-actor': { family: 'Mono', size: 20 } },
    } });
    expect(scene.participants[0].font?.size).toBe(20);
    expect(scene.participants[1].font?.size).toBe(12);
    // The actor figure (30) plus a box grown by the 20 px override's line height.
    expect(scene.participants[0].header.height).toBeGreaterThan(30 + 36);
  });

  it('is byte-deterministic and escapes text', () => {
    const graph = sequence(people.slice(0, 2), [['m1', 'Client', 'Web', 'sync', '<script>&"']]);
    expect(renderSvg(graph)).toBe(renderSvg(structuredClone(graph)));
    expect(renderSvg(graph)).toContain('&lt;script&gt;&amp;&quot;');
    expect(renderSvg(graph)).not.toContain('<script>');
  });
});

describe('UML sequence notation registration', () => {
  it('registers participant and actor symbols without ports', () => {
    const notation = notationRegistry.get('uml-sequence');
    expect(notation?.symbols).toEqual(['uml-participant', 'uml-actor']);
    for (const id of ['uml-participant', 'uml-actor']) {
      expect(symbolRegistry.get(id)?.ports ?? []).toEqual([]);
    }
  });
});
