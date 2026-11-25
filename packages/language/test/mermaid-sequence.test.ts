import { describe, expect, it } from 'vitest';
import { validateIR } from '@graph-ir/core';
import { parseMermaid, print, printWithDiagnostics } from '../src/index.js';
import { parse } from '../src/parser/index.js';

function imported(source: string) {
  const result = parseMermaid(source);
  expect(result.diagnostics).toEqual([]);
  expect(result.success).toBe(true);
  return result.graph!;
}

function refusal(source: string): string[] {
  const result = parseMermaid(source);
  expect(result.success).toBe(false);
  return result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').map((diagnostic) => diagnostic.code);
}

const login = `sequenceDiagram
    actor Client
    participant WebServer as Web Server
    participant AuthService as Auth Service
    Client->>+WebServer: POST /login
    WebServer->>AuthService: validate
    alt credentials valid
        AuthService-->>WebServer: token
    else credentials invalid
        AuthService-->>WebServer: denied
    end
    WebServer-)-Client: result`;

describe('Mermaid sequence import', () => {
  it('maps the supported subset to the same structured interaction as Coral', () => {
    const graph = imported(login);
    const coral = `@graph {"id":"mermaid-sequence","metadata":{"notation":"uml-sequence"}}

actor "Client" as Client
participant "Web Server" as WebServer
participant "Auth Service" as AuthService

Client -> WebServer as msg_1 [sync, label: "POST /login"]
WebServer -> AuthService as msg_2 [sync, label: "validate"]
alt "credentials valid" {
  AuthService -> WebServer as msg_3 [return, label: "token"]
} else "credentials invalid" {
  AuthService -> WebServer as msg_4 [return, label: "denied"]
}
WebServer -> Client as msg_5 [async, label: "result"]

activation WebServer from msg_1 to msg_5`;
    const expected = parse(coral);
    expect(expected.diagnostics).toEqual([]);
    expect(graph).toEqual(expected.graph);
    const printed = printWithDiagnostics(graph);
    expect(printed.diagnostics).toEqual([]);
    expect(printed.text).toBe(coral);
    expect(validateIR(graph).valid).toBe(true);
  });

  it('creates undeclared participants in first-appearance order', () => {
    const graph = imported('sequenceDiagram\nA->>B: hi\nparticipant C\nB-->>A: bye');
    expect(graph.interaction?.participantOrder).toEqual(['A', 'B', 'C']);
    expect(Object.hasOwn(graph, 'name')).toBe(false);
    expect(graph.nodes.map((node) => node.type)).toEqual(['participant', 'participant', 'participant']);
    expect(graph.metadata?.custom).toBeUndefined();
  });

  it('accepts case-insensitive keywords, semicolons, empty text, comments, and explicit activation', () => {
    const graph = imported(`sequenceDiagram
%% a comment
PARTICIPANT A; participant B
NOTE OVER A: first
A->>B:
ACTIVATE B
B-->>A: done<br/>now
Deactivate B
LOOP
  A-)B: tick #59; tock
END`);
    expect(graph.edges[0].label).toBeUndefined();
    expect(graph.edges[1].label).toBe('done\nnow');
    expect(graph.interaction?.activations).toEqual([
      { id: 'activation-1', participantId: 'B', startMessageId: 'msg_1', endMessageId: 'msg_2' },
    ]);
    expect(graph.interaction?.fragments).toEqual([
      { id: 'fragment-1', kind: 'loop', operands: [{ id: 'fragment-1-operand-1', messageIds: ['msg_3'] }] },
    ]);
    expect(graph.edges[2].label).toBe('tick ; tock');
    // XML-legal whitespace controls still decode.
    expect(imported('sequenceDiagram\nA->>B: a#9;b').edges[0].label).toBe('a\tb');
    expect(graph.interaction?.notes).toEqual([{ id: 'note-1', text: 'first', participantIds: ['A'] }]);
  });

  it('imports participant notes that precede every message', () => {
    const graph = imported('sequenceDiagram\nparticipant A\nparticipant B\nNote over A,B: shared\nA->>B: x');
    expect(graph.interaction?.notes).toEqual([{ id: 'note-1', text: 'shared', participantIds: ['A', 'B'] }]);
  });

  it('stores activations in canonical order with position-derived ids (DR70-D1)', () => {
    const graph = imported('sequenceDiagram\nA->>+B: x\nB->>+C: y\nC-->>-B: z\nB-->>-A: w');
    expect(graph.interaction?.activations).toEqual([
      { id: 'activation-1', participantId: 'B', startMessageId: 'msg_1', endMessageId: 'msg_4' },
      { id: 'activation-2', participantId: 'C', startMessageId: 'msg_2', endMessageId: 'msg_3' },
    ]);
    expect(parse(print(graph)).graph).toEqual(graph);
  });

  it('round-trips an opt with a guard and an empty alt branch', () => {
    const graph = imported('sequenceDiagram\nA->>B: x\nopt cache miss\nA->>B: y\nend\nalt hit\nB-->>A: z\nelse\nend');
    expect(graph.interaction?.fragments?.[0].operands[0].guard).toEqual({ id: 'fragment-1-guard-1', text: 'cache miss' });
    expect(graph.interaction?.fragments?.[1].operands[1]).toEqual({ id: 'fragment-2-operand-2', messageIds: [] });
    expect(parse(print(graph)).graph).toEqual(graph);
  });
});

describe('Mermaid sequence refusal', () => {
  it.each([
    ['solid open arrow', 'A->B: x', 'mermaid.sequence.message.unsupported'],
    ['dotted open arrow', 'A-->B: x', 'mermaid.sequence.message.unsupported'],
    ['cross arrow', 'A-xB: x', 'mermaid.sequence.message.unsupported'],
    ['dotted cross arrow', 'A--xB: x', 'mermaid.sequence.message.unsupported'],
    ['dotted async arrow', 'A--)B: x', 'mermaid.sequence.message.unsupported'],
    ['bidirectional arrow', 'A<<->>B: x', 'mermaid.sequence.message.unsupported'],
    ['half arrow', 'A-|>B: x', 'mermaid.sequence.message.unsupported'],
    ['side note', 'participant A\nNote right of A: x', 'mermaid.sequence.note.placement'],
    ['late note', 'A->>B: x\nNote over A: y', 'mermaid.sequence.note.placement'],
    ['note inside a block', 'loop\nNote over A: x\nA->>B: y\nend', 'mermaid.sequence.note.placement'],
    ['alt without else (GraphIR requires two operands)', 'alt ok\nA->>B: hi\nend', 'mermaid.sequence.fragment.invalid'],
    ['out-of-range numeric entity', 'A->>B: #99999999;', 'mermaid.sequence.text.unsupported'],
    ['surrogate numeric entity', 'A->>B: #55296;', 'mermaid.sequence.text.unsupported'],
    ['NUL numeric entity (XML-illegal)', 'A->>B: before#0;after', 'mermaid.sequence.text.unsupported'],
    ['C0 control numeric entity', 'A->>B: bell#7;', 'mermaid.sequence.text.unsupported'],
    ['U+FFFE numeric entity', 'A->>B: #65534;', 'mermaid.sequence.text.unsupported'],
    ['U+FFFF numeric entity', 'A->>B: #65535;', 'mermaid.sequence.text.unsupported'],
    ['raw C0 control in text', 'A->>B: tab\u0001here', 'mermaid.sequence.text.unsupported'],
    ['par', 'par a\nA->>B: x\nand b\nA->>B: y\nend', 'mermaid.sequence.fragment.unsupported'],
    ['critical', 'critical c\nA->>B: x\nend', 'mermaid.sequence.fragment.unsupported'],
    ['break', 'break b\nA->>B: x\nend', 'mermaid.sequence.fragment.unsupported'],
    ['rect', 'rect rgb(0,0,0)\nA->>B: x\nend', 'mermaid.sequence.fragment.unsupported'],
    ['nested fragment', 'loop\nopt\nA->>B: x\nend\nend', 'mermaid.sequence.fragment.nested'],
    ['else outside alt', 'loop\nA->>B: x\nelse\nend', 'mermaid.sequence.fragment.invalid'],
    ['stray end', 'end', 'mermaid.sequence.fragment.invalid'],
    ['unclosed fragment', 'opt\nA->>B: x', 'mermaid.sequence.fragment.invalid'],
    ['empty fragment', 'A->>B: x\nopt\nend', 'mermaid.sequence.fragment.invalid'],
    ['unanchored activation', 'participant A\nactivate A', 'mermaid.sequence.activation.invalid'],
    ['uninvolved activation', 'participant C\nA->>B: x\nactivate C', 'mermaid.sequence.activation.invalid'],
    ['unmatched deactivation', 'A->>B: x\ndeactivate B', 'mermaid.sequence.activation.invalid'],
    ['unclosed activation', 'A->>+B: x', 'mermaid.sequence.activation.invalid'],
    ['box', 'box Aqua Group\nparticipant A\nend', 'mermaid.sequence.participant.unsupported'],
    ['create', 'A->>B: x\ncreate participant C\nA->>C: y', 'mermaid.sequence.participant.unsupported'],
    ['destroy', 'A->>B: x\ndestroy B', 'mermaid.sequence.participant.unsupported'],
    ['link', 'participant A\nlink A: Docs @ https://example.com', 'mermaid.sequence.participant.unsupported'],
    ['typed participant', 'participant A@{ "type": "database" }', 'mermaid.sequence.participant.unsupported'],
    ['autonumber', 'autonumber\nA->>B: x', 'mermaid.sequence.numbering.unsupported'],
    ['late declaration', 'A->>B: x\nparticipant A', 'mermaid.sequence.participant.duplicate'],
    ['named entity', 'A->>B: a #quot; b', 'mermaid.sequence.text.unsupported'],
    ['wrap directive', 'A->>B:wrap: long text', 'mermaid.sequence.text.unsupported'],
    ['title', 'title Checkout\nA->>B: x', 'mermaid.sequence.line.unparsed'],
    ['hyphenated identifier', 'my-service->>B: x', 'mermaid.sequence.line.unparsed'],
    ['unknown line', 'A->>B: x\nfrobnicate', 'mermaid.sequence.line.unparsed'],
  ])('refuses %s', (_name, body, code) => {
    expect(refusal(`sequenceDiagram\n${body}`)).toContain(code);
  });

  it('attributes a refusal to its source line', () => {
    const result = parseMermaid('sequenceDiagram\nA->>B: x\nautonumber');
    expect(result.diagnostics[0]).toMatchObject({ code: 'mermaid.sequence.numbering.unsupported', line: 3 });
  });
});
