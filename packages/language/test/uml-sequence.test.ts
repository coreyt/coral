import { describe, expect, it } from 'vitest';
import { validateIR } from '@graph-ir/core';
import { isSequenceGraph, print, printWithDiagnostics,
  validateSequenceInteraction, type GraphIR } from '../src/index.js';

// Historical GraphIR 3 interchange and printer contract, not saved 0.2.8 source.
import { parse } from '../src/parser/index.js';

const HEADER = '@graph {"id":"login","metadata":{"notation":"uml-sequence"}}';

const source = `${HEADER}

actor "Client" as Client
participant "Web Server" as WebServer
participant "Auth Service" as AuthService

Client -> WebServer as login [sync, label: "POST /login"]
WebServer -> AuthService as check [sync, label: "validate(credentials)"]
alt "credentials valid" {
  AuthService -> WebServer as ok [return, label: "token"]
} else "credentials invalid" {
  AuthService -> WebServer as denied [return, label: "denied"]
}
WebServer -> Client as reply [async, label: "result"]

activation AuthService from check to denied
note "Credentials are never logged" on AuthService, check`;

function parsed(text: string): GraphIR {
  const result = parse(text);
  expect(result.diagnostics).toEqual([]);
  return result.graph!;
}

function codes(text: string): string[] {
  return parse(text).diagnostics.map((diagnostic) => diagnostic.code);
}

describe('GraphIR 3 sequence interchange syntax', () => {
  it('recognizes and validates a portable profile-only sequence without descriptive metadata', () => {
    const graph = parsed(source);
    delete graph.metadata;
    graph.nodes[0]!.position = { x: 12, y: 20 };
    expect(isSequenceGraph(graph)).toBe(true);
    expect(validateSequenceInteraction(graph)).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.field.unsupported', entity: { kind: 'node', id: 'Client' },
    }));
  });

  it('reports source round-trip loss for a profile-only sequence until saved header is settled', () => {
    const graph = parsed(source);
    delete graph.metadata;
    const printed = printWithDiagnostics(graph);
    expect(printed.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.graph.profile.dropped', severity: 'error',
      subject: { kind: 'graph', id: graph.id },
    }));
    expect(() => print(graph)).toThrow('coral.graph.profile.dropped');
  });

  it('parses every supported entity into the GraphIR 3 interaction', () => {
    const graph = parsed(source);
    expect(graph.profile).toEqual({ id: 'uml', kind: 'sequence', version: '1.0.0' });
    expect(graph.nodes.map((node) => [node.id, node.type])).toEqual([
      ['Client', 'actor'], ['WebServer', 'participant'], ['AuthService', 'participant'],
    ]);
    expect(graph.edges.map((edge) => [edge.id, edge.type])).toEqual([
      ['login', 'sync'], ['check', 'sync'], ['ok', 'return'], ['denied', 'return'], ['reply', 'async'],
    ]);
    expect(graph.interaction).toEqual({
      participants: [
        { id: 'Client', nodeId: 'Client' },
        { id: 'WebServer', nodeId: 'WebServer' },
        { id: 'AuthService', nodeId: 'AuthService' },
      ],
      participantOrder: ['Client', 'WebServer', 'AuthService'],
      messages: [
        { id: 'login', edgeId: 'login', sourceParticipantId: 'Client', targetParticipantId: 'WebServer', kind: 'synchronous' },
        { id: 'check', edgeId: 'check', sourceParticipantId: 'WebServer', targetParticipantId: 'AuthService', kind: 'synchronous' },
        { id: 'ok', edgeId: 'ok', sourceParticipantId: 'AuthService', targetParticipantId: 'WebServer', kind: 'return' },
        { id: 'denied', edgeId: 'denied', sourceParticipantId: 'AuthService', targetParticipantId: 'WebServer', kind: 'return' },
        { id: 'reply', edgeId: 'reply', sourceParticipantId: 'WebServer', targetParticipantId: 'Client', kind: 'asynchronous' },
      ],
      messageOrder: ['login', 'check', 'ok', 'denied', 'reply'],
      activations: [{ id: 'activation-1', participantId: 'AuthService', startMessageId: 'check', endMessageId: 'denied' }],
      fragments: [{
        id: 'fragment-1', kind: 'alt', operands: [
          { id: 'fragment-1-operand-1', guard: { id: 'fragment-1-guard-1', text: 'credentials valid' }, messageIds: ['ok'] },
          { id: 'fragment-1-operand-2', guard: { id: 'fragment-1-guard-2', text: 'credentials invalid' }, messageIds: ['denied'] },
        ],
      }],
      notes: [{ id: 'note-1', text: 'Credentials are never logged', participantIds: ['AuthService'], messageIds: ['check'] }],
    });
    expect(validateSequenceInteraction(graph)).toEqual([]);
  });

  it('produces schema-valid GraphIR 3 for every accepted source', () => {
    expect(validateIR(parsed(source)).valid).toBe(true);
  });

  it('prints canonical source that reopens with exact equality', () => {
    const graph = parsed(source);
    const printed = printWithDiagnostics(graph);
    expect(printed.diagnostics).toEqual([]);
    expect(printed.text).toBe(source);
    expect(parsed(printed.text)).toEqual(graph);
  });

  it('preserves explicit order under node, edge, and interaction storage permutations', () => {
    const graph = parsed(source);
    const permuted: GraphIR = structuredClone(graph);
    permuted.nodes.reverse();
    permuted.edges.reverse();
    permuted.interaction!.participants.reverse();
    permuted.interaction!.messages.reverse();
    expect(print(permuted)).toBe(source);
    expect(parsed(print(permuted)).interaction?.messageOrder).toEqual(graph.interaction?.messageOrder);
  });

  it('round-trips overridden identities, loop/opt, empty alt operands, and message-only notes', () => {
    const text = `${HEADER}

participant "A" as A
participant "B" as B

loop "every 5s" as poll {
  A -> B as m1 [sync]
  B -> A as m2 [return]
}
alt "hit" {
  A -> A as m3 [sync, label: "cache"]
} else {
}
opt {
  A -> B as m4 [async]
}

activation B from m1 to m2 as serve
activation A from m3 to m3
note "second" on A
note "first" on m1, m2 as n1`;
    const graph = parsed(text);
    expect(graph.interaction?.fragments?.map((fragment) => fragment.id)).toEqual(['poll', 'fragment-2', 'fragment-3']);
    expect(graph.interaction?.fragments?.[1].operands[1]).toEqual({ id: 'fragment-2-operand-2', messageIds: [] });
    expect(graph.interaction?.fragments?.[2].operands[0]).toEqual({ id: 'fragment-3-operand-1', messageIds: ['m4'] });
    expect(graph.interaction?.activations?.map((activation) => activation.id)).toEqual(['serve', 'activation-2']);
    expect(graph.interaction?.notes).toEqual([
      { id: 'note-1', text: 'second', participantIds: ['A'] },
      { id: 'n1', text: 'first', messageIds: ['m1', 'm2'] },
    ]);
    expect(print(graph)).toBe(text);
  });

  it('stores activations and notes in one canonical order regardless of statement or storage order (DR70-D1)', () => {
    const text = `${HEADER}

participant "A" as A
participant "B" as B

A -> B as m1 [sync]
B -> A as m2 [return]
A -> B as m3 [sync]

note "late" on m3
note "top" on A
activation B from m3 to m3
activation B from m1 to m2`;
    const graph = parsed(text);
    expect(graph.interaction?.activations).toEqual([
      { id: 'activation-1', participantId: 'B', startMessageId: 'm1', endMessageId: 'm2' },
      { id: 'activation-2', participantId: 'B', startMessageId: 'm3', endMessageId: 'm3' },
    ]);
    expect(graph.interaction?.notes?.map((note) => [note.id, note.text])).toEqual([['note-1', 'top'], ['note-2', 'late']]);
    const canonical = print(graph);
    expect(canonical).toContain('activation B from m1 to m2\nactivation B from m3 to m3\nnote "top" on A\nnote "late" on m3');
    const permuted: GraphIR = structuredClone(graph);
    permuted.interaction!.activations!.reverse();
    permuted.interaction!.notes!.reverse();
    expect(print(permuted)).toBe(canonical);
    expect(parsed(print(permuted))).toEqual(graph);
  });

  it('round-trips explicit and derived ids that tie on the same anchor (DR70-D1)', () => {
    const notes = Array.from({ length: 11 }, (_, index) => `note "n${index}" on m1`).join('\n');
    for (const body of ['note "x" on m1 as zeta\nnote "y" on m1 as alpha', 'note "x" on m1 as zz\nnote "y" on m1', notes]) {
      const graph = parsed(`${HEADER}\nparticipant "A" as A\nparticipant "B" as B\nA -> B as m1 [sync]\n${body}`);
      expect(parsed(print(graph))).toEqual(graph);
      expect(print(parsed(print(graph)))).toBe(print(graph));
    }
  });

  it('orders arbitrarily long numeric id suffixes exactly (no Number precision loss)', () => {
    const graph = parsed(`${HEADER}\nparticipant "A" as A\nparticipant "B" as B\nA -> B as m1 [sync]\nnote "big" on m1 as "note-100000000000000000000"\nnote "small" on m1 as "note-99999999999999999999"`);
    expect(graph.interaction?.notes?.map((note) => note.text)).toEqual(['small', 'big']);
    expect(parsed(print(graph))).toEqual(graph);
  });

  it('recognizes statements by shape, so keyword-named participants still send messages (DR70-D5)', () => {
    const graph = parsed(`${HEADER}\nparticipant "Note" as note\nparticipant "Loop" as loop\nnote -> loop as m1 [sync, label: "a -> b"]\nnote "x -> y" on note`);
    expect(graph.edges.map((edge) => [edge.source, edge.target])).toEqual([['note', 'loop']]);
    expect(graph.interaction?.notes).toEqual([{ id: 'note-1', text: 'x -> y', participantIds: ['note'] }]);
  });

  it('derives an empty interaction for a sequence document with no declarations', () => {
    const graph = parsed(HEADER);
    expect(graph.interaction).toEqual({ participants: [], participantOrder: [], messages: [], messageOrder: [] });
    expect(print(graph)).toBe(HEADER);
  });

  it('keeps sequence statements inert outside sequence notation', () => {
    const result = parse('@graph {"id":"x"}\nactivation A from m1 to m2');
    expect(result.graph?.interaction).toBeUndefined();
    expect(result.diagnostics.map((d) => d.code)).toContain('coral.line.unparsed');
  });
});

describe('UML sequence Coral rejection', () => {
  const graphWith = (body: string) => `${HEADER}\nparticipant "A" as A\nparticipant "B" as B\n${body}`;

  it('accepts typed root destruction while rejecting post-destruction occurrences', () => {
    const graph = parsed(graphWith('A -> B as m1 [async]\nA -> A as m2 [async]'));
    graph.interaction!.messages[0].kind = 'destroy';
    graph.edges[0].type = 'destroy';
    expect(validateSequenceInteraction(graph)).toEqual([]);
    graph.interaction!.messages[1].sourceParticipantId = 'B';
    graph.edges[1].source = 'B';
    expect(validateSequenceInteraction(graph)).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.participant.after-destruction', entity: { kind: 'edge', id: 'm2' },
    }));
  });

  it('rejects an activation crossing its participant destruction', () => {
    const graph = parsed(graphWith('A -> B as m1 [async]\nA -> B as m2 [async]'));
    graph.interaction!.messages[1].kind = 'destroy';
    graph.edges[1].type = 'destroy';
    graph.interaction!.activations = [{ id: 'work', participantId: 'B', startMessageId: 'm1', endMessageId: 'm2' }];
    expect(validateSequenceInteraction(graph)).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.activation.outside-participant-lifetime',
    }));
  });

  it.each([
    ['non-participant node', `${HEADER}\nservice "S" as S`, 'coral.sequence.participant.invalid'],
    ['nested participant', `${HEADER}\nparticipant "A" as A {\n  participant "B" as B\n}`, 'coral.sequence.participant.invalid'],
    ['missing message kind', graphWith('A -> B as m1'), 'coral.sequence.message.invalid'],
    ['unknown message kind', graphWith('A -> B as m1 [call]'), 'coral.sequence.message.invalid'],
    ['contradictory line style on a message', graphWith('A -> B as m1 [sync, dashed]'), 'coral.sequence.style.invalid'],
    ['participant geometry', `${HEADER}\nparticipant "A" as A @ (10, 20)`, 'coral.sequence.field.unsupported'],
    ['nested fragment', graphWith('loop {\n  opt {\n    A -> B [sync]\n  }\n}'), 'coral.sequence.fragment.nested.unsupported'],
    ['empty fragment', graphWith('opt "x" {\n}'), 'coral.sequence.fragment.invalid'],
    ['else on loop', graphWith('loop {\n  A -> B [sync]\n} else {\n  A -> B [sync]\n}'), 'coral.sequence.fragment.invalid'],
    ['unclosed fragment', graphWith('alt "x" {\n  A -> B [sync]'), 'coral.sequence.fragment.unparsed'],
    ['stray else', graphWith('} else {'), 'coral.sequence.fragment.unparsed'],
    ['empty guard', graphWith('opt "" {\n  A -> B [sync]\n}'), 'coral.sequence.statement.invalid'],
    ['activation in fragment', graphWith('opt {\n  A -> B as m1 [sync]\n  activation B from m1 to m1\n}'), 'coral.sequence.statement.misplaced.invalid'],
    ['note in fragment', graphWith('opt {\n  A -> B as m1 [sync]\n  note "x" on A\n}'), 'coral.sequence.statement.misplaced.invalid'],
    ['malformed activation', graphWith('activation B from m1'), 'coral.sequence.statement.invalid'],
    ['malformed note', graphWith('note on A'), 'coral.sequence.statement.invalid'],
    ['dangling activation participant', graphWith('A -> B as m1 [sync]\nactivation C from m1 to m1'), 'coral.sequence.reference.unresolved.invalid'],
    ['dangling activation message', graphWith('A -> B as m1 [sync]\nactivation B from m1 to nope'), 'coral.sequence.reference.unresolved.invalid'],
    ['wrong-kind activation reference', graphWith('A -> B as m1 [sync]\nactivation m1 from m1 to m1'), 'coral.sequence.reference.unresolved.invalid'],
    ['uninvolved activation', graphWith('participant "C" as C\nA -> B as m1 [sync]\nactivation C from m1 to m1'), 'coral.sequence.activation.invalid'],
    ['reversed activation', graphWith('A -> B as m1 [sync]\nB -> A as m2 [return]\nactivation B from m2 to m1'), 'coral.sequence.activation.invalid'],
    ['dangling note target', graphWith('note "x" on Z'), 'coral.sequence.reference.unresolved.invalid'],
    ['ambiguous note target', graphWith('A -> B as A [sync]\nnote "x" on A'), 'coral.sequence.reference.ambiguous.invalid'],
    ['empty note text', graphWith('note "" on A'), 'coral.sequence.note.invalid'],
    ['single-operand alt (GraphIR requires two)', graphWith('alt "only" {\n  A -> B [sync]\n}'), 'coral.sequence.fragment.invalid'],
    ['whitespace-only note', graphWith('note " " on A'), 'coral.sequence.note.invalid'],
    ['par block', graphWith('par "x" {\n  A -> B [sync]\n}'), 'coral.sequence.construct.unsupported'],
    ['critical block', graphWith('critical {\n  A -> B [sync]\n}'), 'coral.sequence.construct.unsupported'],
    ['break block', graphWith('break "x" {\n  A -> B [sync]\n}'), 'coral.sequence.construct.unsupported'],
    ['participant group', graphWith('box "g" {\n}'), 'coral.sequence.construct.unsupported'],
    ['numbering', graphWith('autonumber'), 'coral.sequence.construct.unsupported'],
    ['create message with the wrong operator', graphWith('A -> B as m1 [create]'), 'coral.sequence.message.operator.invalid'],
    ['participant data field', `${HEADER}\nparticipant "A" as A data {"symbol":"uml-actor"}`, 'coral.sequence.field.unsupported'],
    ['duplicate activation id', graphWith('A -> B as m1 [sync]\nactivation B from m1 to m1 as x\nactivation A from m1 to m1 as x'), 'coral.sequence.identity.duplicate'],
  ])('rejects %s', (_name, text, code) => {
    const result = parse(text);
    expect(result.success).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain(code);
  });

  it('never stores rejected interaction meaning in generic fields', () => {
    const result = parse(graphWith('loop {\n  opt {\n    A -> B [sync]\n  }\n}'));
    expect(JSON.stringify(result.graph?.metadata ?? {})).not.toContain('custom');
    for (const edge of result.graph?.edges ?? []) expect(edge.properties).toBeUndefined();
  });

  it('reports one nested alt with else operands as one defect (CR70-9)', () => {
    const nested = codes(graphWith('loop {\n  A -> B [sync]\n  alt "x" {\n    A -> B [sync]\n  } else "y" {\n    B -> A [return]\n  }\n  A -> B [sync]\n}'));
    expect(nested).toEqual(['coral.sequence.fragment.nested.unsupported']);
  });

  it('codes reject every case exactly once per defect', () => {
    expect(codes(graphWith('opt "" {\n  A -> B [sync]\n}')).filter((c) => c === 'coral.sequence.statement.invalid')).toHaveLength(1);
  });
});

describe('UML sequence printer boundary', () => {
  const base = () => parsed(source);
  const blocking = (graph: GraphIR) => printWithDiagnostics(graph).diagnostics
    .filter((diagnostic) => diagnostic.severity === 'error').map((diagnostic) => diagnostic.code);

  it('separates a structurally valid type/kind conflict from legacy source loss', () => {
    const graph = base();
    graph.edges[0].type = 'async';
    expect(validateSequenceInteraction(graph)).toEqual([]);
    expect(blocking(graph)).toContain('coral.sequence.print.unsupported');
    expect(() => print(graph)).toThrow('coral.sequence.print.unsupported');
  });

  it.each<[string, (graph: GraphIR) => void]>([
    ['missing profile', (graph) => { delete graph.profile; }],
    ['missing interaction', (graph) => { delete graph.interaction; }],
    ['participant id differing from node id', (graph) => { graph.interaction!.participants[0].id = 'p1'; graph.interaction!.participantOrder[0] = 'p1'; }],
    ['message id differing from edge id', (graph) => { graph.interaction!.messages[0].id = 'x'; graph.interaction!.messageOrder[0] = 'x'; }],
    ['create message', (graph) => { graph.interaction!.messages[0].kind = 'create'; }],
    ['missing message kind', (graph) => { delete graph.interaction!.messages[0].kind; }],
    ['kind/token disagreement', (graph) => { graph.edges[0].type = 'async'; }],
    ['incomplete order', (graph) => { graph.interaction!.messageOrder.pop(); }],
    ['non-contiguous fragment', (graph) => { graph.interaction!.fragments![0].operands[1].messageIds = ['reply']; }],
    ['operands out of order', (graph) => { graph.interaction!.fragments![0].operands.reverse(); }],
    ['non-derived operand id', (graph) => { graph.interaction!.fragments![0].operands[0].id = 'custom'; }],
    ['unanchored note', (graph) => { graph.interaction!.notes![0] = { id: 'note-1', text: 'x' }; }],
    ['unanchored fragment', (graph) => { graph.interaction!.fragments![0].operands.forEach((operand) => { operand.messageIds = []; }); }],
    ['multiply-owned message', (graph) => { graph.interaction!.fragments!.push({ id: 'fragment-2', kind: 'opt', operands: [{ id: 'fragment-2-operand-1', messageIds: ['ok'] }] }); }],
    ['non-participant node', (graph) => { graph.nodes[0].type = 'service'; }],
    ['positioned participant', (graph) => { graph.nodes[0].position = { x: 1, y: 2 }; }],
    ['message to a non-participant (CR70-3)', (graph) => { graph.edges[0].target = 'ghost'; graph.interaction!.messages[0].targetParticipantId = 'ghost'; }],
    ['single-operand alt', (graph) => { graph.interaction!.fragments![0].operands.pop(); graph.interaction!.fragments![0].operands[0].messageIds = ['ok', 'denied']; }],
    ['symbol on a participant', (graph) => { graph.nodes[0].symbol = 'uml-actor'; }],
    ['edge style', (graph) => { graph.edges[0].style = { stroke: '#f00' } as never; }],
    ['empty guard text', (graph) => { graph.interaction!.fragments![0].operands[0].guard!.text = ''; }],
    ['routed message', (graph) => { graph.edges[0].routeIntent = { waypoints: [{ id: 'w1', placement: { kind: 'absolute', x: 1, y: 2 } }] } as never; }],
  ])('blocks printing %s', (_name, mutate) => {
    const graph = base();
    mutate(graph);
    expect(blocking(graph)).toContain('coral.sequence.print.unsupported');
  });

  it('keeps interaction outside sequence notation an attributable loss', () => {
    const graph = base();
    graph.metadata = {};
    delete graph.profile;
    expect(printWithDiagnostics(graph).diagnostics.map((d) => d.code)).toContain('coral.graph.interaction.dropped');
  });
});
