import { describe, expect, it } from 'vitest';
import { validateIR } from '@graph-ir/core';
import { print, validateSequenceInteraction, type GraphIR } from '@coral-viz/language';
import { parse } from '@coral-viz/language/parser';
import { applySequenceOperation, canEnterSequenceNotation, canonicalizeSequenceGraph,
  type SequenceOperation } from '../src/sequenceEditing';

const HEADER = '@graph {"id":"seq","metadata":{"notation":"uml-sequence"}}';

function graphOf(body: string): GraphIR {
  const result = parse(`${HEADER}\n${body}`);
  expect(result.diagnostics).toEqual([]);
  return result.graph!;
}

const base = () => graphOf(`participant "A" as A
participant "B" as B
A -> B as m1 [sync]
alt "ok" {
  B -> A as m2 [return]
} else "no" {
  B -> A as m3 [return]
}
A -> B as m4 [async]
activation B from m1 to m2
note "hi" on m4`);

function apply(graph: GraphIR, operation: SequenceOperation): GraphIR {
  const result = applySequenceOperation(graph, operation);
  if (!result.ok) throw new Error(result.error);
  // Every committed candidate is canonical, schema-valid, and equal to its own reparse (DR70-D7.1).
  expect(validateSequenceInteraction(result.graph)).toEqual([]);
  expect(validateIR(result.graph).valid).toBe(true);
  expect(parse(print(result.graph)).graph).toEqual(result.graph);
  return result.graph;
}

function refused(graph: GraphIR, operation: SequenceOperation): string {
  const result = applySequenceOperation(graph, operation);
  expect(result.ok).toBe(false);
  return result.ok ? '' : result.error;
}

describe('sequence editor operations', () => {
  it('orders storage without replacing a message kind that differs from its explicit type', () => {
    const graph = base();
    graph.interaction!.messages[0].kind = 'return';
    graph.nodes.reverse();
    graph.edges.reverse();
    const canonical = canonicalizeSequenceGraph(graph);
    expect(canonical.interaction?.messages[0].kind).toBe('return');
    expect(canonical.edges[0].type).toBe('sync');
    expect(refused(graph, { type: 'addParticipant', kind: 'actor' })).toContain('source');
  });
  it('adds, renames, retypes, reorders, and deletes participants', () => {
    let graph = apply(base(), { type: 'addParticipant', kind: 'actor' });
    expect(graph.nodes.at(-1)).toEqual({ id: 'actor', type: 'actor', label: 'Actor' });
    graph = apply(graph, { type: 'addParticipant', kind: 'actor' });
    expect(graph.interaction?.participantOrder).toEqual(['A', 'B', 'actor', 'actor_2']);
    graph = apply(graph, { type: 'updateParticipant', id: 'actor', label: 'User', kind: 'participant' });
    expect(graph.nodes.find((node) => node.id === 'actor')).toEqual({ id: 'actor', type: 'participant', label: 'User' });
    graph = apply(graph, { type: 'moveParticipant', id: 'actor', direction: -1 });
    expect(graph.interaction?.participantOrder).toEqual(['A', 'actor', 'B', 'actor_2']);
    expect(graph.nodes.map((node) => node.id)).toEqual(['A', 'actor', 'B', 'actor_2']);
    graph = apply(graph, { type: 'deleteParticipant', id: 'actor_2' });
    expect(graph.interaction?.participantOrder).toEqual(['A', 'actor', 'B']);
    expect(refused(graph, { type: 'deleteParticipant', id: 'B' })).toContain('still referenced');
  });

  it('adds a message into the selected message operand and edits its fields', () => {
    let graph = apply(base(), { type: 'addMessage', after: 'm2', label: 'retry' });
    const added = graph.edges.find((edge) => edge.label === 'retry')!;
    expect(added).toMatchObject({ source: 'A', target: 'B', type: 'sync' });
    expect(graph.interaction?.messageOrder).toEqual(['m1', 'm2', added.id, 'm3', 'm4']);
    expect(graph.interaction?.fragments?.[0].operands[0].messageIds).toEqual(['m2', added.id]);
    graph = apply(graph, { type: 'updateMessage', id: added.id, kind: 'return', label: 'again', source: 'B', target: 'A' });
    expect(graph.edges.find((edge) => edge.id === added.id)).toMatchObject({ source: 'B', target: 'A', type: 'return', label: 'again' });
    expect(graph.interaction?.messages.find((message) => message.id === added.id)).toMatchObject({ kind: 'return', sourceParticipantId: 'B' });
    graph = apply(graph, { type: 'addMessage' });
    expect(graph.interaction?.messageOrder.at(-1)).toBe('a_to_b_2');
  });

  it('moves messages like source lines, crossing fragment boundaries', () => {
    let graph = apply(base(), { type: 'moveMessage', id: 'm4', direction: -1 });
    // m4 crosses the closing brace into the last operand.
    expect(graph.interaction?.fragments?.[0].operands[1].messageIds).toEqual(['m3', 'm4']);
    graph = apply(graph, { type: 'moveMessage', id: 'm3', direction: -1 });
    // m3 crosses `else` into the first operand.
    expect(graph.interaction?.fragments?.[0].operands.map((operand) => operand.messageIds)).toEqual([['m2', 'm3'], ['m4']]);
    graph = apply(graph, { type: 'moveMessage', id: 'm2', direction: -1 });
    expect(graph.interaction?.fragments?.[0].operands[0].messageIds).toEqual(['m3']);
    expect(graph.interaction?.messageOrder).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(refused(graph, { type: 'moveMessage', id: 'm2', direction: -1 })).toContain('activation');
  });

  it('refuses deletions that would break activations, notes, or fragments', () => {
    expect(refused(base(), { type: 'deleteMessage', id: 'm1' })).toContain('activation');
    expect(refused(base(), { type: 'deleteMessage', id: 'm4' })).toContain('target');
    const graph = apply(base(), { type: 'deleteMessage', id: 'm3' });
    expect(graph.interaction?.fragments?.[0].operands[1].messageIds).toEqual([]);
    expect(refused(graph, { type: 'deleteMessage', id: 'm2' })).toContain('activation');
    const unbounded = apply(graph, { type: 'deleteActivation', id: 'activation-1' });
    expect(refused(unbounded, { type: 'deleteMessage', id: 'm2' })).toContain('owns no message');
  });

  it('adds, edits, and deletes activations and notes with first-free derived ids', () => {
    let graph = apply(base(), { type: 'addActivation', participantId: 'A', startMessageId: 'm1', endMessageId: 'm4' });
    expect(graph.interaction?.activations?.map((activation) => activation.id)).toEqual(['activation-1', 'activation-2']);
    expect(refused(graph, { type: 'addActivation', participantId: 'A', startMessageId: 'm4', endMessageId: 'm1' })).toContain('starts after');
    graph = apply(graph, { type: 'updateActivation', id: 'activation-2', endMessageId: 'm2' });
    graph = apply(graph, { type: 'addNote', text: 'about A', targets: ['A', 'm1'] });
    expect(graph.interaction?.notes?.find((note) => note.text === 'about A')).toMatchObject({ participantIds: ['A'], messageIds: ['m1'] });
    const id = graph.interaction!.notes!.find((note) => note.text === 'about A')!.id;
    graph = apply(graph, { type: 'updateNote', id, text: 'changed', targets: ['B'] });
    expect(graph.interaction?.notes?.find((note) => note.id === id)).toEqual({ id, text: 'changed', participantIds: ['B'] });
    graph = apply(graph, { type: 'deleteNote', id });
    expect(refused(graph, { type: 'addNote', text: '', targets: ['A'] })).toContain('text');
  });

  it('wraps, splits, guards, and unwraps flat fragments', () => {
    let graph = apply(base(), { type: 'addFragment', kind: 'loop', firstMessageId: 'm4', lastMessageId: 'm4', guard: 'forever' });
    expect(graph.interaction?.fragments?.map((fragment) => [fragment.id, fragment.kind])).toEqual([['fragment-1', 'alt'], ['fragment-2', 'loop']]);
    expect(refused(graph, { type: 'addFragment', kind: 'opt', firstMessageId: 'm1', lastMessageId: 'm2' })).toContain('nested');
    graph = apply(graph, { type: 'updateGuard', fragmentId: 'fragment-1', operandIndex: 1, guard: undefined });
    expect(graph.interaction?.fragments?.[0].operands[1].guard).toBeUndefined();
    graph = apply(graph, { type: 'splitOperand', fragmentId: 'fragment-1', messageId: 'm3' });
    expect(graph.interaction?.fragments?.[0].operands.map((operand) => operand.messageIds)).toEqual([['m2'], [], ['m3']]);
    expect(refused(graph, { type: 'splitOperand', fragmentId: 'fragment-2', messageId: 'm4' })).toContain('alt');
    graph = apply(graph, { type: 'deleteFragment', id: 'fragment-1' });
    expect(graph.interaction?.fragments?.map((fragment) => fragment.id)).toEqual(['fragment-2']);
    expect(graph.interaction?.messageOrder).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('wraps an alt with two operands and refuses message endpoints outside the participants (CR70-1, CR70-3)', () => {
    const graph = apply(base(), { type: 'addFragment', kind: 'alt', firstMessageId: 'm4', lastMessageId: 'm4', guard: 'g' });
    expect(graph.interaction?.fragments?.find((fragment) => fragment.id === 'fragment-2')?.operands.map((operand) => operand.messageIds))
      .toEqual([['m4'], []]);
    expect(validateIR(graph).valid).toBe(true);
    expect(refused(base(), { type: 'updateMessage', id: 'm1', target: 'ghost' })).toContain('ghost');
  });

  it('never mutates its input graph', () => {
    const graph = base();
    const before = structuredClone(graph);
    applySequenceOperation(graph, { type: 'deleteMessage', id: 'm3' });
    applySequenceOperation(graph, { type: 'deleteMessage', id: 'm1' });
    expect(graph).toEqual(before);
  });
});

describe('entering sequence notation', () => {
  it('allows empty graphs and graphs already shaped as sequences, deriving storage order once', () => {
    expect(canEnterSequenceNotation({ version: '3.0.0', id: 'x', nodes: [], edges: [] })).toMatchObject({ ok: true });
    const entered = canEnterSequenceNotation({
      version: '3.0.0', id: 'x', metadata: { notation: 'flowchart' },
      nodes: [{ id: 'b', type: 'actor', label: 'B' }, { id: 'a', type: 'participant', label: 'A' }],
      edges: [{ id: 'e', source: 'b', target: 'a', type: 'sync' }],
    });
    expect(entered.ok && entered.graph.interaction?.participantOrder).toEqual(['b', 'a']);
    expect(entered.ok && entered.graph.profile).toEqual({ id: 'uml', kind: 'sequence', version: '1.0.0' });
    expect(canEnterSequenceNotation({
      version: '3.0.0', id: 'x', nodes: [{ id: 's', type: 'service', label: 'S' }], edges: [],
    })).toMatchObject({ ok: false });
  });
});
