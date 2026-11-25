import { describe, expect, it } from 'vitest';
import { parseMermaid, writeSupplementalMermaidSequence028 } from '../src/index.js';

const imported = 'sequenceDiagram\nparticipant A\nparticipant B\n' +
  'A->>B: before\nalt accepted\nA->>B: request\nelse rejected\nB-->>A: denied\nend\nA-)B: after';

function graph() {
  const parsed = parseMermaid(imported);
  expect(parsed.diagnostics).toEqual([]);
  return structuredClone(parsed.graph!);
}

describe('bounded Mermaid supplemental sequence source writer', () => {
  it('retains one flat alternative, its guards, and surrounding message order', () => {
    expect(writeSupplementalMermaidSequence028(graph())).toContain(
      'msg_1 = A -#> B as "before"\nalt "accepted" {\n' +
      '  msg_2 = A -#> B as "request"\n} else "rejected" {\n' +
      '  msg_3 = B -.-> A as "denied"\n}\nmsg_4 = A -> B as "after"');
  });

  it('writes participant notes before the first message and a following alternative', () => {
    const withNote = graph();
    withNote.interaction!.notes = [{ id: 'note-1', text: 'shared', participantIds: ['A', 'B'] }];
    expect(writeSupplementalMermaidSequence028(withNote)).toContain(
      'note "shared" on A, B\nmsg_1 = A -#> B as "before"\nalt "accepted" {');
    withNote.interaction!.notes[0]!.messageIds = [];
    expect(writeSupplementalMermaidSequence028(withNote)).toBeUndefined();
  });

  it('preserves optional loop guards and requires an opt guard', () => {
    const source = (head: string) => parseMermaid(
      `sequenceDiagram\nparticipant A\nparticipant B\n${head}\nA->>B: try\nend`).graph!;
    expect(writeSupplementalMermaidSequence028(source('loop'))).toContain(
      'loop {\n  msg_1 = A -#> B as "try"\n}');
    expect(writeSupplementalMermaidSequence028(source('loop retry'))).toContain(
      'loop "retry" {\n  msg_1 = A -#> B as "try"\n}');
    expect(writeSupplementalMermaidSequence028(source('opt cache miss'))).toContain(
      'opt "cache miss" {\n  msg_1 = A -#> B as "try"\n}');
    expect(writeSupplementalMermaidSequence028(source('opt'))).toBeUndefined();
  });

  it('writes successive flat fragments but refuses overlap or changed fragment order', () => {
    const parsed = parseMermaid('sequenceDiagram\nparticipant A\nparticipant B\n' +
      'alt yes\nA->>B: one\nelse no\nB-->>A: two\nend\n' +
      'A-)B: between\nloop retry\nA->>B: again\nend');
    expect(parsed.diagnostics).toEqual([]);
    const graph = structuredClone(parsed.graph!);
    expect(writeSupplementalMermaidSequence028(graph)).toContain(
      '}\nmsg_3 = A -> B as "between"\nloop "retry" {\n  msg_4 = A -#> B as "again"\n}');
    const overlapping = structuredClone(graph);
    overlapping.interaction!.fragments![1]!.operands[0]!.messageIds = ['msg_2'];
    expect(writeSupplementalMermaidSequence028(overlapping)).toBeUndefined();
    const reordered = structuredClone(graph);
    reordered.interaction!.fragments!.reverse();
    expect(writeSupplementalMermaidSequence028(reordered)).toBeUndefined();
  });

  it('refuses unrepresented fields, invalid guards, and changed containment', () => {
    const named = graph();
    named.name = 'Unrepresented name';
    expect(writeSupplementalMermaidSequence028(named)).toBeUndefined();

    const extra = graph();
    extra.edges[1]!.properties = { hidden: true };
    expect(writeSupplementalMermaidSequence028(extra)).toBeUndefined();

    const unguarded = graph();
    unguarded.interaction!.fragments![0]!.operands[1]!.guard!.text = '';
    expect(writeSupplementalMermaidSequence028(unguarded)).toBeUndefined();

    const reordered = graph();
    reordered.interaction!.fragments![0]!.operands[1]!.messageIds = ['msg_4'];
    expect(writeSupplementalMermaidSequence028(reordered)).toBeUndefined();
  });

  it('refuses raw controls instead of emitting an invalid quoted guard', () => {
    const controlled = graph();
    controlled.interaction!.fragments![0]!.operands[0]!.guard!.text = 'accepted\ttoo';
    expect(writeSupplementalMermaidSequence028(controlled)).toBeUndefined();
  });

  it.each(['\u2028', '\u2029'])('refuses literal line separator %s in any quoted field', (separator) => {
    const participant = graph();
    participant.nodes[0]!.label = `before${separator}after`;
    expect(writeSupplementalMermaidSequence028(participant)).toBeUndefined();

    const message = graph();
    message.edges[0]!.label = `before${separator}after`;
    expect(writeSupplementalMermaidSequence028(message)).toBeUndefined();

    const guard = graph();
    guard.interaction!.fragments![0]!.operands[0]!.guard!.text = `before${separator}after`;
    expect(writeSupplementalMermaidSequence028(guard)).toBeUndefined();

    const note = graph();
    note.interaction!.notes = [{ id: 'note-1', text: `before${separator}after`, participantIds: ['A'] }];
    expect(writeSupplementalMermaidSequence028(note)).toBeUndefined();
  });
});
