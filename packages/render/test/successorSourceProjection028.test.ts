import { describe, expect, it } from 'vitest';
import { validateGraphIRSuccessorWithCatalog, validateIR } from '@graph-ir/core';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplay028 } from '../src/successorSourceDisplay028.js';
import { verifyPortableSuccessorSource028 } from '../src/successorPortableExport028.js';
import { successorCatalogSnapshot028 } from '../src/successorInterpretation028.js';
import { successorSequenceDisplay028, successorSequenceRuleView028 } from '../src/successorSequenceDisplay028.js';
import { parseInstalledDocument028, prepareInstalledDocumentForSave028 } from '../src/installedDocument028.js';
import { checkInstalledSuccessorSourceConformance028 } from '../src/successorSourceConformance028.js';
import { renderSvg } from '../src/index.js';
import { layoutSequence } from '../src/sequence.js';
import { measureText } from '../src/text/metrics.js';

describe('installed Coral source to the local GraphIR successor', () => {
  it.each([
    ['block', 'node'], ['flowchart', 'node'], ['bpmn', 'node'], ['code', 'node'],
    ['architecture', 'node'], ['aiml', 'node'], ['data-engineering', 'node'],
    ['sketch', 'node'], ['uml-class', 'class'], ['uml-sequence', 'participant'],
  ] as const)('keeps an untyped directed connector portable in %s', (profile, kind) => {
    const source = `@diagram ${profile}\na ${kind}\nb ${kind}\na -> b\n`;
    const opened = parseInstalledDocument028(source);
    expect(opened.header.source).toBe(source);
    expect(opened.syntax.diagnostics).toEqual([]);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.edges[0]).toMatchObject({
      first: { node: 'a' }, second: { node: 'b' }, direction: 'first-to-second',
    });
    expect(projected.graph?.edges[0]?.type).toBe(profile === 'uml-sequence' ? 'async' : undefined);
    expect(validateGraphIRSuccessorWithCatalog(projected.graph!,
      successorCatalogSnapshot028(projected.graph!)).errors).toEqual([]);
    expect(verifyPortableSuccessorSource028(source).graph).toEqual(projected.graph);
    const checked = checkInstalledSuccessorSourceConformance028(source);
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.ruleset?.profileId).toBe(profile);
    expect(checked.report?.claimStatus).toBe('not-claimed');
  });

  it.each(['client -> server', 'server <- client'])(
    'renders destruction in the public display adapter without calling it synchronous: %s', (connector) => {
      const source = `@diagram uml-sequence\nclient participant\nserver participant\nclose = ${connector} [destroy]\n`;
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const before = JSON.stringify(projected.graph);
      const scene = layoutSequence(successorSequenceDisplay028(projected.graph!));
      expect(scene.messages[0].kind).toBe('destroy');
      expect(scene.participants.find((item) => item.id === 'server')!.lifeline.y2)
        .toBe(scene.messages[0].points.at(-1)!.y);
      const ruleView = successorSequenceRuleView028(projected.graph!);
      expect(ruleView.interaction?.messages[0].kind).toBe('destroy');
      expect(layoutSequence(ruleView).messages[0].kind).toBe('destroy');
      expect(JSON.stringify(projected.graph)).toBe(before);
    },
  );

  it('keeps successor creation provenance out of the GraphIR 3 display document', () => {
    const source = '@diagram uml-sequence\nclient participant\n' +
      'spawn = client -.-> worker [create] as "spawn()"\n';
    const successor = projectInstalledSourceToSuccessor028(source);
    expect(successor.diagnostics).toEqual([]);
    expect(successor.graph?.interaction?.participants[1]).toMatchObject({ createdByMessageId: 'spawn' });
    const display = successorSequenceDisplay028(successor.graph!);
    expect(display.interaction?.participants[1]).toEqual({ id: 'worker', nodeId: 'worker' });
    expect(validateIR(display).valid).toBe(true);
  });
  it('compiles an accepted activation as start, body, and end without changing source', () => {
    const source = '@diagram uml-sequence\napi participant\ndb participant\n' +
      'work = activation api {\n  api -#> db\n}\n';
    const opened = parseInstalledDocument028(source);
    expect(opened.header.source).toBe(source);
    expect(opened.syntax.diagnostics).toEqual([]);
    expect(opened.graph).toBeUndefined();
    const saved = prepareInstalledDocumentForSave028(source, opened);
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    expect(parseInstalledDocument028(saved.source).header.source).toBe(saved.source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.interaction?.activations).toEqual([
      { id: 'work', participantId: 'api' },
    ]);
    expect(projected.graph?.interaction?.items).toEqual([
      { kind: 'activation-start', id: 'work' },
      { kind: 'message', id: 'edge-1' },
      { kind: 'activation-end', id: 'work' },
    ]);
    expect(verifyPortableSuccessorSource028(source).graph).toEqual(projected.graph);
  });
  it('keeps an activation and named-message note inside one alt operand', () => {
    const source = '@diagram uml-sequence\napi participant\ndb participant\n' +
      'choice = alt "yes" {\n  work = activation api {\n' +
      '    call = api -> db\n    note "Review" on call\n  }\n' +
      '} else "no" {\n  api -> db\n}';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.interaction?.activations).toEqual([
      { id: 'work', participantId: 'api' },
    ]);
    expect(projected.graph?.interaction?.fragments?.[0]?.operands[0]?.items).toEqual([
      { kind: 'activation-start', id: 'work' },
      { kind: 'message', id: 'call' },
      { kind: 'note', id: 'note-1' },
      { kind: 'activation-end', id: 'work' },
    ]);
    expect(projected.graph?.interaction?.notes).toEqual([
      { id: 'note-1', text: 'Review', messageIds: ['call'] },
    ]);
    expect(verifyPortableSuccessorSource028(source).graph).toEqual(projected.graph);
  });
  it('projects a named region as an ordered nested timeline without rewriting source', () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'before = api -> worker\n' +
      'phase = region "Review" {\n  inside = worker -> api\n  note "Check" on api\n}\n' +
      'after = api -> worker';
    const opened = parseInstalledDocument028(source);
    expect(opened.header.source).toBe(source);
    expect(opened.syntax.diagnostics).toEqual([]);
    expect(opened.graph).toBeUndefined(); // The GraphIR 3 shell cannot carry region order.
    const saved = prepareInstalledDocumentForSave028(source, opened);
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.interaction?.items).toEqual([
      { kind: 'message', id: 'before' }, { kind: 'region', id: 'phase' },
      { kind: 'message', id: 'after' },
    ]);
    expect(projected.graph?.interaction?.regions).toEqual([{
      id: 'phase', label: 'Review', items: [
        { kind: 'message', id: 'inside' }, { kind: 'note', id: 'note-1' },
      ],
    }]);
    expect(verifyPortableSuccessorSource028(source).graph).toEqual(projected.graph);
  });
  it('keeps malformed region text saveable and locates a cross-region note target', () => {
    const malformed = '@diagram uml-sequence\na participant\nphase = region "Review" {\n  a -> a\n';
    const saved = prepareInstalledDocumentForSave028(malformed, parseInstalledDocument028(malformed));
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(malformed);
    const rejected = projectInstalledSourceToSuccessor028(malformed);
    expect(rejected.graph).toBeUndefined();
    expect(rejected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.region.unclosed',
    }));
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'phase = region "Review" {\n  call = a -> b\n}\n' +
      'note "Check" on call';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.graph).toBeUndefined();
    expect(projected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.note.message-scope',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.lastIndexOf('call'),
      }) }),
    }));
  });
  it('projects a participant group without changing lane order or authored text', () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'team = participants worker, api [label: "Operations"]\n' +
      'api -> worker';
    const opened = parseInstalledDocument028(source);
    expect(opened.header.source).toBe(source);
    expect(opened.syntax.diagnostics).toEqual([]);
    expect(opened.graph).toBeUndefined();
    const saved = prepareInstalledDocumentForSave028(source, opened);
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.interaction?.participantOrder).toEqual(['api', 'worker']);
    expect(projected.graph?.interaction?.groups).toEqual([
      { id: 'team', label: 'Operations', participantIds: ['worker', 'api'] },
    ]);
    expect(verifyPortableSuccessorSource028(source).graph).toEqual(projected.graph);
    expect(validateGraphIRSuccessorWithCatalog(projected.graph!, successorCatalogSnapshot028(projected.graph!)).errors)
      .toEqual([]);
  });
  it('numbers unnamed participant groups independently of explicit identities', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'named = participants a\nparticipants b';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.interaction?.groups).toEqual([
      { id: 'named', participantIds: ['a'] }, { id: 'group-1', participantIds: ['b'] },
    ]);
    expect(verifyPortableSuccessorSource028(source).graph).toEqual(projected.graph);
  });
  it.each([
    ['unknown', 'team = participants api, missing',
      'coral.sequence.group.participant-unresolved', 'missing'],
    ['repeated', 'team = participants api, api',
      'coral.sequence.group.participant-duplicate', 'api'],
    ['multiple groups', 'team = participants api\nother = participants api',
      'coral.sequence.group.participant-multiple-groups', 'api'],
  ] as const)('locates %s participant-group membership and retains source',
    (_name, body, code, token) => {
      const source = `@diagram uml-sequence\napi participant\n${body}`;
      const saved = prepareInstalledDocumentForSave028(source, parseInstalledDocument028(source));
      expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.graph).toBeUndefined();
      expect(projected.diagnostics).toContainEqual(expect.objectContaining({
        code, range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.lastIndexOf(token),
        }) }),
      }));
    });
  it('locates an activation identity that repeats a named message', () => {
    const source = '@diagram uml-sequence\napi participant\ndb participant\n' +
      'work = api -> db\nwork = activation api {\n  api -> db\n}';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.graph).toBeUndefined();
    expect(projected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.identity.activation.duplicate',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.lastIndexOf('work ='),
      }) }),
    }));
    const saved = prepareInstalledDocumentForSave028(source, parseInstalledDocument028(source));
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
  });
  it('keeps a branch-local creation saveable but withholds portable projection', () => {
    const source = '@diagram uml-sequence\nclient participant\n' +
      'choice = alt "yes" {\n  spawn = client -.-> worker [create]\n' +
      '} else "no" {\n  client -> client\n}';
    const opened = parseInstalledDocument028(source);
    expect(opened.syntax.diagnostics).toEqual([]);
    const saved = prepareInstalledDocumentForSave028(source, opened);
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.graph).toBeUndefined();
    expect(projected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.create.root-only',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('create'),
      }) }),
    }));
  });
  it('keeps a root-scope creation inside an activation in root timeline order', () => {
    const source = '@diagram uml-sequence\nclient participant\n' +
      'work = activation client {\n  spawn = client -.-> worker [create]\n}';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.interaction?.participants).toContainEqual({
      id: 'worker', nodeId: 'worker', createdByMessageId: 'spawn',
    });
    expect(projected.graph?.interaction?.items).toEqual([
      { kind: 'activation-start', id: 'work' },
      { kind: 'message', id: 'spawn' },
      { kind: 'activation-end', id: 'work' },
    ]);
  });
  it('locates a second creation of one participant instead of exporting invalid linkage', () => {
    const source = '@diagram uml-sequence\nclient participant\n' +
      'first = client -.-> worker [create]\nsecond = client -.-> worker [create]';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.graph).toBeUndefined();
    expect(projected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.create.duplicate',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.lastIndexOf('create'),
      }) }),
    }));
  });
  it('carries an approved dotted style through the portable source view', () => {
    const source = '@diagram architecture\na service\nb service\na -> b [style: dotted]';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges[0]?.style).toEqual({ lineStyle: 'dotted' });
  });
  it('projects an exact RGB color while refusing a color-blind GraphIR 3 scene', () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'paint = a -> b [style: #FF0000]';
    const document = parseInstalledDocument028(source);
    expect(document.header.source).toBe(source);
    expect(document.graph).toBeUndefined();
    const saved = prepareInstalledDocumentForSave028(source, document);
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    expect(parseInstalledDocument028(saved.source).header.source).toBe(saved.source);
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges[0]).toMatchObject({ id: 'paint',
      style: { strokeColor: '#FF0000' } });
    expect(verifyPortableSuccessorSource028(source)).toMatchObject({
      graph: { edges: [{ id: 'paint', style: { strokeColor: '#FF0000' } }] },
      diagnostics: [],
    });
    expect(() => successorSourceDisplay028(result.graph!)).toThrow(/stroke color/i);
  });
  it('projects an approved named color to RGB while preserving its written source', () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'paint = a -> b [style: "dotted, green, thick, animated"]';
    const opened = parseInstalledDocument028(source);
    expect(opened.header.source).toBe(source);
    const saved = prepareInstalledDocumentForSave028(source, opened);
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    expect(parseInstalledDocument028(saved.source).header.source).toBe(saved.source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.edges[0]?.style).toEqual({ lineStyle: 'dotted',
      strokeColor: '#008000', strokeWeight: 'thick',
      motion: { kind: 'animated', direction: 'auto' } });
    expect(verifyPortableSuccessorSource028(source).graph).toEqual(projected.graph);
  });
  it('compiles a multi-term style into independent typed successor fields', () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'paint = a -> b [style: "dotted, #FF0000, thick, animated:reverse"]';
    const opened = parseInstalledDocument028(source);
    expect(opened.graph).toBeUndefined();
    expect(opened.header.source).toBe(source);
    const saved = prepareInstalledDocumentForSave028(source, opened);
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    expect(parseInstalledDocument028(saved.source).header.source).toBe(saved.source);
    const result = verifyPortableSuccessorSource028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges[0]).toMatchObject({ id: 'paint',
      style: { lineStyle: 'dotted', strokeColor: '#FF0000', strokeWeight: 'thick',
        motion: { kind: 'animated', direction: 'second-to-first' } } });
    expect(() => successorSourceDisplay028(result.graph!)).toThrow(/stroke color|weight|motion/i);
  });
  it('projects group-qualified identities, local references, ports, and exact symbol exceptions', () => {
    const source = '@diagram architecture\nleft group {\n' +
      '  item service [symbol: "arch-service", conformanceException: "arch-service"] as "Left" {\n' +
      '    scopedSend port [direction: out]\n  }\n  sink service as "Sink"\n' +
      '  item:scopedSend -> sink\n}\nright group {\n  item service as "Right"\n}\n' +
      'left.item -> right.item';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes).toMatchObject([
      { id: 'left', children: [
        { id: 'left.item', parent: 'left', semanticPorts: [{ id: 'scopedSend', direction: 'out' }] },
        { id: 'left.sink', parent: 'left' },
      ] },
      { id: 'right', children: [{ id: 'right.item', parent: 'right' }] },
    ]);
    expect(result.graph?.edges.map((edge) => [edge.first.node, edge.second.node])).toEqual([
      ['left.item', 'left.sink'], ['left.item', 'right.item'],
    ]);
    expect(result.graph?.conformanceExceptions).toEqual([
      { kind: 'explicit-symbol', nodeId: 'left.item', symbol: 'arch-service' },
    ]);
  });
  it('compiles same-named grouped UML classes and their local members to distinct successor owners', () => {
    const source = [
      '@diagram uml-class',
      'left group {',
      '  Order class {',
      '    fields = attributes {',
      '      orderId = public attribute id: String',
      '    }',
      '  }',
      '}',
      'right group {',
      '  Order class {',
      '    fields = attributes {',
      '      orderId = public attribute id: String',
      '    }',
      '  }',
      '}',
      'left.Order -- right.Order',
    ].join('\n');
    const opened = parseInstalledDocument028(source);
    expect(opened.header.source).toBe(source);
    const saved = prepareInstalledDocumentForSave028(source, opened);
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    expect(parseInstalledDocument028(saved.source).header.source).toBe(saved.source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.nodes.map((group) => group.children?.[0]?.id))
      .toEqual(['left.Order', 'right.Order']);
    for (const group of projected.graph?.nodes ?? []) {
      expect(group.children?.[0]?.classifier?.compartments[1]).toMatchObject({
        id: 'fields', kind: 'attributes',
        items: [{ id: 'orderId', name: 'id', type: 'String' }],
      });
    }
    expect(projected.graph?.edges[0]).toMatchObject({
      first: { node: 'left.Order' }, second: { node: 'right.Order' }, direction: 'none',
    });
  });
  it('projects approved word and symbolic UML operations without changing the source', () => {
    const source = '@diagram uml-class\nOrder class {\n  actions = operations {\n' +
      '    saveOp = public operation save(id: String): Boolean\n' +
      '    - reset()\n    # inspect()\n    ~ refresh()\n  }\n}\n' +
      'Receipt class\nOrder -- Receipt';
    const opened = parseInstalledDocument028(source);
    expect(opened.header.source).toBe(source);
    const saved = prepareInstalledDocumentForSave028(source, opened);
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    expect(parseInstalledDocument028(saved.source).header.source).toBe(saved.source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.nodes[0]?.classifier?.compartments[1]).toMatchObject({
      id: 'actions', kind: 'operations', items: [
        { id: 'saveOp', visibility: 'public', name: 'save',
          parameters: [{ name: 'id', type: 'String' }], returnType: 'Boolean' },
        { visibility: 'private', name: 'reset', parameters: [] },
        { visibility: 'protected', name: 'inspect', parameters: [] },
        { visibility: 'package', name: 'refresh', parameters: [] },
      ],
    });
  });
  it('compiles a nested bare reference to its nearest enclosing group identity', () => {
    const source = '@diagram architecture\nlead service\nteam group {\n' +
      '  lead database\n  squad group {\n    worker service\n' +
      '    worker -> lead\n  }\n}';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges[0]).toMatchObject({
      first: { node: 'team.squad.worker' }, second: { node: 'team.lead' },
    });
  });
  it('compiles and displays a sequence note at its authored timeline position', () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'call = api -> worker\ncheck = note "Check\\nRecord" on worker\n' +
      'worker -> api';
    const document = parseInstalledDocument028(source);
    expect(document.header.source).toBe(source);
    expect(document.graph).toBeUndefined();
    const saved = prepareInstalledDocumentForSave028(source, document);
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    expect(parseInstalledDocument028(saved.source).header.source).toBe(saved.source);
    const projected = verifyPortableSuccessorSource028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.interaction).toMatchObject({
      notes: [{ id: 'check', text: 'Check\nRecord', participantIds: ['worker'] }],
      items: [{ kind: 'message', id: 'call' }, { kind: 'note', id: 'check' },
        { kind: 'message' }],
    });
    const scene = layoutSequence(successorSourceDisplay028(projected.graph!));
    expect(scene.notes[0].text.lines).toEqual(['Check', 'Record']);
    expect(scene.notes[0].y).toBeGreaterThan(scene.messages[0].points[0].y);
    expect(scene.notes[0].y + scene.notes[0].height).toBeLessThan(scene.messages[1].points[0].y);
  });
  it('numbers unnamed notes independently of explicit note identities', () => {
    const source = '@diagram uml-sequence\napi participant\n' +
      'named = note "First" on api\nnote \'Second\' on api';
    const result = verifyPortableSuccessorSource028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.interaction?.notes).toMatchObject([
      { id: 'named', text: 'First' }, { id: 'note-1', text: 'Second' },
    ]);
    expect(result.graph?.interaction?.items).toEqual([
      { kind: 'note', id: 'named' }, { kind: 'note', id: 'note-1' },
    ]);
  });
  it('compiles and displays guarded single-operand fragments without changing source', () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'retry = loop "more" {\n  opt "ready" {\n    call = api -> worker\n  }\n}\n' +
      'lock = critical "available" {\n  api -#> worker\n}\n' +
      'stop = break "cancelled" {\n  worker -.-> api\n}\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.interaction?.items).toEqual([
      { kind: 'fragment', id: 'retry' }, { kind: 'fragment', id: 'lock' },
      { kind: 'fragment', id: 'stop' },
    ]);
    expect(projected.graph?.interaction?.fragments).toMatchObject([
      { id: 'retry', kind: 'loop', operands: [{ guard: { text: 'more' },
        items: [{ kind: 'fragment', id: 'fragment-1' }] }] },
      { id: 'fragment-1', kind: 'opt', operands: [{ guard: { text: 'ready' },
        items: [{ kind: 'message', id: 'call' }] }] },
      { id: 'lock', kind: 'critical' }, { id: 'stop', kind: 'break' },
    ]);
    expect(layoutSequence(successorSourceDisplay028(projected.graph!)).fragments.map(({ kind }) => kind))
      .toEqual(['loop', 'opt', 'critical', 'break']);
    const saved = prepareInstalledDocumentForSave028(source, parseInstalledDocument028(source));
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
  });
  it('decodes the shared quoted line-break rule without changing authored delimiters', () => {
    const source = '@diagram uml-sequence\na participant as \'A\\nOne\'\nb participant\n' +
      'choice = alt \'go\\nnow\' {\n  a -> b\n} else "stop" {\n  b -> a\n}\n' +
      'check = note "Review\\nRecord" on a';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.nodes[0]?.label).toBe('A\nOne');
    expect(projected.graph?.interaction?.fragments?.[0]?.operands[0]?.guard?.text).toBe('go\nnow');
    expect(projected.graph?.interaction?.notes?.[0]?.text).toBe('Review\nRecord');
    expect(parseInstalledDocument028(source).header.source).toBe(source);
  });
  it('refuses a missing sequence note target at the authored reference', () => {
    const source = '@diagram uml-sequence\napi participant\n' +
      'check = note "Review" on missing';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.note.target-unresolved',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('missing'),
      }) }),
    }));
  });
  it('projects a note only into its authored alt operand without changing source', () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'choice = alt "yes" {\n  note "Review" on worker\n} else "no" {\n' +
      '  api -> worker\n}';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(parseInstalledDocument028(source).header.source).toBe(source);
    expect(result.graph?.interaction?.notes).toMatchObject([
      { id: 'note-1', text: 'Review', participantIds: ['worker'] },
    ]);
    expect(result.graph?.interaction?.fragments?.[0]?.operands.map((operand) => operand.items))
      .toEqual([[{ kind: 'note', id: 'note-1' }], [{ kind: 'message', id: 'edge-1' }]]);
  });
  it('locates a note before participant creation while keeping its source saveable', () => {
    const source = '@diagram uml-sequence\nclient participant\n' +
      'early = note "Ready" on worker\n' +
      'spawn = client -.-> worker [create]\n' +
      'late = note "Warm cache" on worker';
    const opened = parseInstalledDocument028(source);
    expect(opened.header.source).toBe(source);
    const saved = prepareInstalledDocumentForSave028(source, opened);
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    expect(parseInstalledDocument028(saved.source).header.source).toBe(saved.source);
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.note.outside-participant-lifetime',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('worker', source.indexOf('early = note')),
      }) }),
    }));
    const valid = source.replace('early = note "Ready" on worker\n', '');
    const projected = projectInstalledSourceToSuccessor028(valid);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.interaction?.participants).toContainEqual({
      id: 'worker', nodeId: 'worker', createdByMessageId: 'spawn',
    });
    expect(projected.graph?.interaction?.items).toEqual([
      { kind: 'message', id: 'spawn' }, { kind: 'note', id: 'late' },
    ]);
  });
  it('projects named-message and multi-participant note targets without rewriting source', () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'call = api -> worker\n' +
      'retry = note "retried" on call\n' +
      'shared = note "shared" on api, worker';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(parseInstalledDocument028(source).header.source).toBe(source);
    expect(result.graph?.interaction?.notes).toEqual([
      { id: 'retry', text: 'retried', messageIds: ['call'] },
      { id: 'shared', text: 'shared', participantIds: ['api', 'worker'] },
    ]);
    expect(result.graph?.interaction?.items).toEqual([
      { kind: 'message', id: 'call' }, { kind: 'note', id: 'retry' },
      { kind: 'note', id: 'shared' },
    ]);
  });
  it.each([
    ['other operand', 'choice = alt "yes" {\n  call = api -> worker\n' +
      '} else "no" {\n  note "Review" on call\n}'],
    ['root after operand', 'choice = alt "yes" {\n  call = api -> worker\n' +
      '} else "no" {\n  api -> worker\n}\nnote "Review" on call'],
  ] as const)('locates a named-message note outside its %s timeline scope', (_name, body) => {
    const source = `@diagram uml-sequence\napi participant\nworker participant\n${body}`;
    const opened = parseInstalledDocument028(source);
    expect(opened.syntax.diagnostics).toEqual([]);
    const saved = prepareInstalledDocumentForSave028(source, opened);
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.graph).toBeUndefined();
    expect(projected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.note.message-scope',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.lastIndexOf('call'),
      }) }),
    }));
  });
  it.each([
    ['unguarded loop', 'loop {\n  api -> worker\n}', 'loop'],
    ['parallel operands', 'par {\n  api -> worker\n} and "other" {\n  worker -> api\n}',
      'par'],
  ] as const)('compiles approved %s syntax without inventing a guard',
    (_name, body, kind) => {
      const source = `@diagram uml-sequence\napi participant\nworker participant\n${body}`;
      const opened = parseInstalledDocument028(source);
      expect(opened.header.source).toBe(source);
      expect(opened.syntax.diagnostics).toEqual([]);
      const saved = prepareInstalledDocumentForSave028(source, opened);
      expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      expect(projected.graph?.interaction?.fragments?.[0]?.kind).toBe(kind);
      expect(projected.graph?.interaction?.fragments?.[0]?.operands[0]?.guard).toBeUndefined();
      if (kind === 'par') expect(projected.graph?.interaction?.fragments?.[0]?.operands[1]?.guard)
        .toMatchObject({ text: 'other' });
      expect(verifyPortableSuccessorSource028(source).graph).toEqual(projected.graph);
    });
  it.each([
    ['ambiguous', 'call participant\napi participant\ncall = api -> call\n' +
      'note "which?" on call', 'coral.sequence.note.target-ambiguous', 'call'],
    ['mixed', 'api participant\nworker participant\ncall = api -> worker\n' +
      'note "mixed" on api, call', 'coral.sequence.note.targets-mixed', 'call'],
    ['multiple messages', 'api participant\nworker participant\ncall = api -> worker\n' +
      'reply = worker -> api\nnote "mixed" on call, reply',
    'coral.sequence.note.targets-mixed', 'reply'],
  ] as const)('locates %s note targets and keeps source saveable',
    (_name, body, code, token) => {
      const source = `@diagram uml-sequence\n${body}`;
      const opened = parseInstalledDocument028(source);
      expect(opened.header.source).toBe(source);
      const saved = prepareInstalledDocumentForSave028(source, opened);
      expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
      const result = projectInstalledSourceToSuccessor028(source);
      expect(result.graph).toBeUndefined();
      expect(result.diagnostics).toContainEqual(expect.objectContaining({
        code, range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.lastIndexOf(token),
        }) }),
      }));
    });
  it('preserves explicit node symbol and variant through source projection and catalog resolution', () => {
    const source = '@diagram architecture\napi service [symbol: "arch-service", variant: "gateway"] as "API"';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes[0]).toMatchObject({ id: 'api', type: 'service',
      symbol: 'arch-service', variant: 'gateway', label: 'API' });
    expect(result.graph?.nodes[0]).not.toHaveProperty('ports');
  });

  it('projects a node-local exception as an exact symbol-bound successor exception', () => {
    const source = '@diagram flowchart\napi process [symbol: "arch-service", conformanceException: "arch-service"]';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.conformanceExceptions).toEqual([
      { kind: 'explicit-symbol', nodeId: 'api', symbol: 'arch-service' },
    ]);
  });
  it('projects node-local semantic ports, preserving omission and explicit auto', () => {
    const source = '@diagram architecture\napi service {\n  send port [direction: out, anchor: side]\n  audit port [direction: out, anchor: auto]\n}\ndb database {\n  receive port [direction: in]\n}\napi:send -> db:receive [reads]';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes).toMatchObject([
      { id: 'api', semanticPorts: [
        { id: 'send', direction: 'out', anchor: { kind: 'side' } },
        { id: 'audit', direction: 'out', anchor: { kind: 'auto' } },
      ] },
      { id: 'db', semanticPorts: [{ id: 'receive', direction: 'in' }] },
    ]);
    expect(result.graph?.nodes[1]?.semanticPorts?.[0]).not.toHaveProperty('anchor');
    expect(result.graph?.nodes[0]).not.toHaveProperty('ports');
    expect(result.graph?.edges[0]).toMatchObject({ first: { node: 'api', port: 'send' },
      second: { node: 'db', port: 'receive' } });
  });

  it('projects a source waypoint relative to a grouped semantic port into GraphIR 4', () => {
    const source = '@diagram architecture\nteam group {\n  api service {\n' +
      '    outbound port [direction: out, anchor: E]\n  }\n  db database\n' +
      '  request = api:outbound -> db\n  route edge request {\n' +
      '    bend = waypoint relative to port api:outbound offset (20, 0)\n  }\n}\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.edges[0]).toMatchObject({ id: 'team.request',
      routeIntent: { waypoints: [{ id: 'bend', placement: { kind: 'relative',
        anchor: { kind: 'port', nodeId: 'team.api', portId: 'outbound' },
        offset: { x: 20, y: 0 } } }] } });
    expect(validateGraphIRSuccessorWithCatalog(projected.graph!,
      successorCatalogSnapshot028(projected.graph!)).errors).toEqual([]);
    const portable = verifyPortableSuccessorSource028(source);
    expect(portable.diagnostics).toEqual([]);
    expect(portable.graph).toEqual(projected.graph);
  });

  it('does not certify a route anchor port missing from the selected node', () => {
    const source = '@diagram architecture\napi service {\n' +
      '  outbound port [direction: out, anchor: E]\n}\nstore database\n' +
      'request = api:outbound -> store\nroute edge request {\n' +
      '  bend = waypoint relative to port api:absent offset (20, 0)\n}\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const validation = validateGraphIRSuccessorWithCatalog(projected.graph!,
      successorCatalogSnapshot028(projected.graph!));
    expect(validation.errors.map((item) => item.code)).toContain('UNKNOWN_ROUTE_SEMANTIC_PORT');
    expect(verifyPortableSuccessorSource028(source).graph).toBeUndefined();
  });

  it('normalizes a selected directional word and exact anchor without changing source', () => {
    const source = '@diagram architecture\napi service {\n  pinned port [direction: out, anchor: right]\n  northbound port [direction: out, anchor: N]\n}';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes[0]?.semanticPorts).toMatchObject([
      { id: 'pinned', anchor: { kind: 'exact', position: 'E' } },
      { id: 'northbound', anchor: { kind: 'exact', position: 'N' } },
    ]);
    expect(source).toContain('anchor: right');
  });
  it('keeps unapproved compass words as symbol-specific anchor names', () => {
    const source = '@diagram architecture\napi service {\n  eastbound port [direction: out, anchor: east]\n  northbound port [direction: out, anchor: north]\n}';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes[0]?.semanticPorts).toMatchObject([
      { id: 'eastbound', anchor: { kind: 'symbol', id: 'east' } },
      { id: 'northbound', anchor: { kind: 'symbol', id: 'north' } },
    ]);
  });
  it('keeps authored endpoint order, ports, direction, markers, and saved identities', () => {
    const source = [
      '@diagram architecture',
      '@conformanceLevel strict',
      'client service',
      'server service',
      'reply = client:in <- server:out [calls] as "Reply"',
    ].join('\n');
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph).toMatchObject({
      version: '4.0.0', conformanceLevel: 'strict',
      profile: { id: 'architecture', version: '1.0.0' },
      edges: [{ id: 'reply', first: { node: 'client', port: 'in' },
        second: { node: 'server', port: 'out' }, direction: 'second-to-first',
        firstEnd: { marker: { kind: 'arrow' } },
        type: 'calls', label: 'Reply' }],
    });
    expect(result.graph?.edges[0]).not.toHaveProperty('secondEnd');
    expect(result.graph?.edges[0]).not.toHaveProperty('source');
    expect(result.graph?.edges[0]).not.toHaveProperty('sourcePort');
    expect(result.graph?.nodes[0]).not.toHaveProperty('ports');
    expect(successorCatalogSnapshot028(result.graph!)).toMatchObject({
      profile: result.graph!.profile, catalog: result.graph!.catalog,
    });
  });

  it('preserves neutral, forward, and bidirectional meaning separately from edge ends', () => {
    const source = '@diagram block\na block\nz block\na -- z\na -> z\na <-> z';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges.map((edge) => edge.direction)).toEqual([
      'none', 'first-to-second', 'both',
    ]);
  });

  it('keeps arrow direction when keyed no-shortform markers replace its visible end', () => {
    const source = '@diagram architecture\na service\nz service\n' +
      'a -> z [firstEnd: zeroOrOne, secondEnd: zeroOrMany]';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges[0]).toMatchObject({
      direction: 'first-to-second',
      firstEnd: { marker: { kind: 'zero-or-one' } },
      secondEnd: { marker: { kind: 'zero-or-many' } },
    });
  });

  it('keeps an unmarked operator semantically undirected when a rare keyed end is added', () => {
    const source = '@diagram architecture\na service\nz service\na -- z [secondEnd: zeroOrOne]';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges[0]).toMatchObject({
      direction: 'none',
      firstEnd: { marker: { kind: 'none' } },
      secondEnd: { marker: { kind: 'zero-or-one' } },
    });
  });
  it('distinguishes an unspecified end from an explicitly authored none end', () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'a -> b\na -> b [firstEnd: none]\na -- b\na <- b\n' +
      'a <- b [secondEnd: none]';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(parseInstalledDocument028(source).header.source).toBe(source);
    expect(result.graph?.edges.map(({ firstEnd, secondEnd }) => [
      firstEnd?.marker.kind, secondEnd?.marker.kind,
    ])).toEqual([
      [undefined, 'arrow'], ['none', 'arrow'], ['none', 'none'],
      ['arrow', undefined], ['arrow', 'none'],
    ]);
  });
  it('retains the same explicit-none boundary for sequence messages', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'a -> b\na -> b [firstEnd: none]\na <- b\na <- b [secondEnd: none]';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges.map(({ firstEnd, secondEnd }) => [
      firstEnd?.marker.kind, secondEnd?.marker.kind,
    ])).toEqual([
      [undefined, 'arrow'], ['none', 'arrow'],
      ['arrow', undefined], ['arrow', 'none'],
    ]);
  });
  it('compiles semantic zeroToMany into its canonical GraphIR end mark', () => {
    const source = '@diagram architecture\na service\nb service\na -- b [secondEnd: zeroToMany]';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges[0]?.secondEnd?.marker).toEqual({
      kind: 'zero-or-many', fill: 'unspecified',
    });
    expect(result.graph?.edges[0]?.direction).toBe('none');
  });

  it('projects a flat sequence timeline without fabricating message order', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\ncall = client -#> server as "load()"\nreply = server -.-> client as "done"';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.interaction).toMatchObject({
      participants: [{ id: 'client', nodeId: 'client' }, { id: 'server', nodeId: 'server' }],
      participantOrder: ['client', 'server'],
      messages: [{ id: 'call', kind: 'synchronous', edgeId: 'call',
        senderParticipantId: 'client', receiverParticipantId: 'server' },
      { id: 'reply', kind: 'return', edgeId: 'reply',
        senderParticipantId: 'server', receiverParticipantId: 'client' }],
      items: [{ kind: 'message', id: 'call' }, { kind: 'message', id: 'reply' }],
    });
    expect(result.graph?.edges[0]).toMatchObject({ direction: 'first-to-second',
      secondEnd: { marker: { kind: 'triangle', fill: 'filled' } } });
  });

  it('preserves nested alt/else order in the successor and lays out containing frames', () => {
    const source = [
      '@diagram uml-sequence', 'client participant', 'server participant',
      'before = client -> server',
      'choice = alt "valid" {',
      '  inside = server -> client',
      '  retry = alt "again" {',
      '    nested = client -#> server',
      '  } else "stop" {',
      '    stopped = server -.-> client',
      '  }',
      '} else "invalid" {',
      '  rejected = client -> server',
      '}',
      'after = server -> client',
    ].join('\n');
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.interaction).toMatchObject({
      items: [{ kind: 'message', id: 'before' }, { kind: 'fragment', id: 'choice' },
        { kind: 'message', id: 'after' }],
      fragments: [{ id: 'choice', kind: 'alt', operands: [
        { guard: { text: 'valid' }, items: [{ kind: 'message', id: 'inside' },
          { kind: 'fragment', id: 'retry' }] },
        { guard: { text: 'invalid' }, items: [{ kind: 'message', id: 'rejected' }] },
      ] }, { id: 'retry', kind: 'alt', operands: [
        { guard: { text: 'again' }, items: [{ kind: 'message', id: 'nested' }] },
        { guard: { text: 'stop' }, items: [{ kind: 'message', id: 'stopped' }] },
      ] }],
    });
    const display = successorSequenceDisplay028(result.graph!);
    expect(JSON.stringify(display)).not.toContain('recursiveFragments028');
    const scene = layoutSequence(display);
    expect(scene.messages.map((message) => message.id)).toEqual([
      'before', 'inside', 'nested', 'stopped', 'rejected', 'after',
    ]);
    expect(scene.messages.map((message) => message.points[0].y))
      .toEqual([...scene.messages.map((message) => message.points[0].y)].sort((a, b) => a - b));
    const outer = scene.fragments.find((fragment) => fragment.id === 'choice')!;
    const inner = scene.fragments.find((fragment) => fragment.id === 'retry')!;
    expect(outer.y).toBeLessThan(inner.y);
    expect(outer.y + outer.height).toBeGreaterThan(inner.y + inner.height);
    expect(outer.x).toBeLessThan(inner.x);
    expect(outer.x + outer.width).toBeGreaterThan(inner.x + inner.width);
    expect(inner.operands[0].guard?.y).toBeLessThan(scene.messages[2].points[0].y);
    expect(inner.operands[1].separatorY).toBeLessThan(scene.messages[3].points[0].y);
    expect(renderSvg(display)).toContain('data-coral-sequence-fragment="retry"');
    expect(successorSequenceRuleView028(result.graph!).interaction?.messageOrder).toEqual([
      'before', 'inside', 'nested', 'stopped', 'rejected', 'after',
    ]);
    const broken = structuredClone(result.graph!);
    broken.interaction!.fragments![1]!.operands[0].items.push({ kind: 'fragment', id: 'choice' });
    expect(() => successorSequenceRuleView028(broken)).toThrow(/fragment reference/);
    expect(prepareInstalledDocumentForSave028(source, parseInstalledDocument028(source)).source)
      .toContain('} else "invalid" {');
  });

  it('draws parallel and typed optional-guard fragments but refuses unresolved activation items', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  a -> b\n} else "no" {\n  b -> a\n}';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const graph = projected.graph!;

    const parallel = structuredClone(graph);
    Object.assign(parallel.interaction!.fragments![0], { kind: 'par' });
    expect(layoutSequence(successorSequenceDisplay028(parallel)).fragments[0].kind).toBe('par');
    expect(successorSequenceRuleView028(parallel).interaction?.messageOrder).toEqual([
      'edge-1', 'edge-2',
    ]);

    const unguarded = structuredClone(graph);
    Object.assign(unguarded.interaction!.fragments![0].operands[0], { guard: undefined });
    expect(successorSequenceDisplay028(unguarded).sourceTimeline028).toEqual(unguarded.interaction);
    expect(successorSequenceRuleView028(unguarded).interaction?.messageOrder).toEqual([
      'edge-1', 'edge-2',
    ]);

    for (const kind of ['activation-start', 'activation-end'] as const) {
      const activation = structuredClone(graph);
      activation.interaction!.items.unshift({ kind, id: 'work' } as
        typeof activation.interaction.items[number]);
      expect(() => successorSequenceDisplay028(activation)).toThrow(/timeline cannot be displayed/i);
      expect(() => successorSequenceRuleView028(activation)).toThrow(/invalid.*activation/i);
    }
  });

  it('keeps a long quoted nested guard inside its frame and SVG bounds', () => {
    const guard = 'retry when the customer profile is unavailable and the cached version has expired';
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n' +
      `  retry = alt "${guard}" {\n    a -> b\n` +
      '  } else "stop" {\n    b -> a\n  }\n' +
      '} else "no" {\n  b -> a\n}';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const scene = layoutSequence(successorSequenceDisplay028(projected.graph!));
    const inner = scene.fragments.find((fragment) => fragment.id === 'retry')!;
    const measured = measureText({ text: `[${guard}]`, fontSize: scene.font.size,
      fontFamily: scene.font.cssFamily, fontWeight: scene.font.weight }).width;
    const right = inner.operands[0].guard!.x + measured;
    expect(right).toBeLessThan(inner.x + inner.width - 8);
    expect(right).toBeLessThan(scene.width - 8);
  });

  it('diagnoses an alt without else at its authored keyword', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\nalt "yes" {\n  a -> b\n}';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.fragment.operands',
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('alt') }) }),
    }));
  });

  it('keeps operator-derived synchronous meaning when a rare keyed end replaces its arrow', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'call = client -#> server [secondEnd: zeroOrOne] as "load()"';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.edges[0]).toMatchObject({ direction: 'first-to-second',
      secondEnd: { marker: { kind: 'zero-or-one' } }, type: 'sync' });
    expect(projected.graph?.interaction?.messages[0]).toMatchObject({
      senderParticipantId: 'client', receiverParticipantId: 'server', kind: 'synchronous',
    });
  });

  it('preserves sequence participant ports in typed source even though the scene has no port path yet', () => {
    const source = '@diagram uml-sequence\nclient participant {\n  send port [direction: out]\n}\nserver participant\nclient -> server';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes[0]?.semanticPorts).toMatchObject([{ id: 'send', direction: 'out' }]);
  });

  it('preserves a creation-introduced participant through saved source, successor meaning, and SVG', () => {
    const source = '@diagram uml-sequence\nclient participant\n' +
      'spawn = client -.-> worker [create] as "spawn()"';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes).toMatchObject([
      { id: 'client', type: 'participant' },
      { id: 'worker', type: 'participant' },
    ]);
    expect(result.graph?.interaction?.messages).toMatchObject([
      { id: 'spawn', kind: 'create', senderParticipantId: 'client',
        receiverParticipantId: 'worker' },
    ]);
    const display = successorSequenceDisplay028(result.graph!);
    expect(display.interaction?.messages[0]?.kind).toBe('create');
    expect(renderSvg(display)).toContain('data-coral-sequence-message="spawn"');
  });

  it('projects long dashed creation with the same lifecycle meaning and six-position hint', () => {
    const source = '@diagram uml-sequence\nclient participant\n' +
      'spawn = client -.----> worker [create]';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges[0]).toMatchObject({
      id: 'spawn', direction: 'first-to-second', proximityHint: 6, type: 'create',
    });
    expect(result.graph?.interaction?.participants).toContainEqual({
      id: 'worker', nodeId: 'worker', createdByMessageId: 'spawn',
    });
    expect(result.graph?.interaction?.messages[0]).toMatchObject({
      id: 'spawn', kind: 'create', senderParticipantId: 'client',
      receiverParticipantId: 'worker',
    });
  });

  it('compiles a root destruction with a reciprocal participant lifetime link', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'close = client -> server [destroy] as "Done"';
    const opened = parseInstalledDocument028(source);
    expect(opened.syntax.diagnostics).toEqual([]);
    expect(prepareInstalledDocumentForSave028(source, opened).source
      .replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.interaction?.participants).toContainEqual({
      id: 'server', nodeId: 'server', destroyedByMessageId: 'close',
    });
    expect(projected.graph?.interaction?.messages).toContainEqual({
      id: 'close', edgeId: 'close', kind: 'destroy',
      senderParticipantId: 'client', receiverParticipantId: 'server',
    });
    expect(verifyPortableSuccessorSource028(source).graph).toEqual(projected.graph);
  });

  it('keeps written ends fixed when a backward arrow destroys its first participant', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'close = client <- server [destroy]';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.edges[0]).toMatchObject({
      id: 'close', first: { node: 'client' }, second: { node: 'server' },
      direction: 'second-to-first',
    });
    expect(projected.graph?.interaction?.messages).toContainEqual({
      id: 'close', edgeId: 'close', kind: 'destroy',
      senderParticipantId: 'server', receiverParticipantId: 'client',
    });
    expect(projected.graph?.interaction?.participants).toContainEqual({
      id: 'client', nodeId: 'client', destroyedByMessageId: 'close',
    });
  });

  it('withholds a message after its receiver was destroyed and retains source', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'close = client -> server [destroy]\nclient -> server\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.graph).toBeUndefined();
    expect(projected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.message.outside-participant-lifetime',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.lastIndexOf('->'),
      }) }),
    }));
    expect(prepareInstalledDocumentForSave028(source, parseInstalledDocument028(source)).source
      .replace('@coralVersion "0.2.8"\n', '')).toBe(source);
  });

  it('locates a participant note after destruction without changing its text', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'close = client -> server [destroy]\nnote "Too late" on server\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.graph).toBeUndefined();
    expect(projected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.note.outside-participant-lifetime',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.lastIndexOf('server'),
      }) }),
    }));
    expect(prepareInstalledDocumentForSave028(source, parseInstalledDocument028(source)).source
      .replace('@coralVersion "0.2.8"\n', '')).toBe(source);
  });

  it('locates an activation after destruction at its participant token', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'close = client -> server [destroy]\nwork = activation server {\n  client -> client\n}\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.graph).toBeUndefined();
    expect(projected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.activation.outside-participant-lifetime',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('server', source.indexOf('activation')),
      }) }),
    }));
  });
  it('rejects an activation whose own body destroys its participant', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'work = activation server {\n  close = client -> server [destroy]\n}\n';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.graph).toBeUndefined();
    expect(projected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.activation.outside-participant-lifetime',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('server', source.indexOf('activation')),
      }) }),
    }));
  });

  it('locates branch-local destruction without flattening the sequence branch', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'choice = alt "yes" {\n  close = client -> server [destroy]\n' +
      '} else "no" {\n  client -> server\n}';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.graph).toBeUndefined();
    expect(projected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.destroy.root-only',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('destroy'),
      }) }),
    }));
  });
  it('withholds two destruction messages for one participant', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'first = client -> server [destroy]\nsecond = client -> server [destroy]';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.graph).toBeUndefined();
    expect(projected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.destroy.duplicate',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.lastIndexOf('destroy'),
      }) }),
    }));
  });

  it.each(['lost', 'found'])('refuses to project unsupported %s sequence meaning as an ordinary message', (kind) => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      `client -> server [${kind}] as "event"`;
    const parsed = parseInstalledDocument028(source);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(prepareInstalledDocumentForSave028(source, parsed).source).toContain(`[${kind}]`);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.graph).toBeUndefined();
    expect(projected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'render.capability.sequence-message-kind',
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf(kind) }) }),
    }));
  });

  it('keeps reverse sequence endpoints fixed while reversing sender and receiver', () => {
    const source = [
      '@diagram uml-sequence', 'client participant', 'server participant',
      'server -> client as "ordinary"',
      'client <- server as "reverse"',
    ].join('\n');
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges).toMatchObject([
      { id: 'edge-1', first: { node: 'server' }, second: { node: 'client' },
        direction: 'first-to-second' },
      { id: 'edge-2', first: { node: 'client' }, second: { node: 'server' },
        direction: 'second-to-first' },
    ]);
    expect(result.graph?.interaction?.messages).toMatchObject([
      { id: 'edge-1', senderParticipantId: 'server', receiverParticipantId: 'client',
        kind: 'asynchronous' },
      { id: 'edge-2', senderParticipantId: 'server', receiverParticipantId: 'client',
        kind: 'asynchronous' },
    ]);
  });

  it('retains authored dash-count proximity as typed successor edge intent', () => {
    const source = '@diagram architecture\nA service\nD service\nM service\nZ service\n' +
      'A -> D\nD --> M\nZ ----#> D\n';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges.map((edge) => edge.proximityHint)).toEqual([1, 2, 4]);
  });

  it('projects six-position solid and dashed shafts without changing written endpoint order', () => {
    const source = '@diagram architecture\nA service\nB service\n' +
      'A ------> B\nA -.----> B\nA <------ B\n';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges.map((edge) => edge.proximityHint)).toEqual([6, 6, 6]);
    expect(result.graph?.edges.map((edge) => [edge.first.node, edge.second.node,
      edge.direction])).toEqual([
      ['A', 'B', 'first-to-second'],
      ['A', 'B', 'first-to-second'],
      ['A', 'B', 'second-to-first'],
    ]);
    expect(result.graph?.edges[1]?.style?.lineStyle).toBe('dashed');
  });

  it('rejects a reverse sequence reference missing from the participant set', () => {
    const source = '@diagram uml-sequence\nclient participant\nclient <- absent';
    const result = projectInstalledSourceToSuccessor028(source);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.reference.target.unresolved',
      range: { start: { line: 3, column: 10, offset: source.indexOf('absent') },
        end: { line: 3, column: 16, offset: source.indexOf('absent') + 6 } },
    }));
  });

  it('withholds a successor graph for invalid source instead of migrating partial GraphIR 3', () => {
    const result = projectInstalledSourceToSuccessor028('@diagram architecture\napi service\napi -> missing');
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});


it.each(['batchFlow', 'type: batchFlow'])(
  'retains data-engineering [%s] as the registered portable relation through save and display', (field) => {
    const source = `@diagram data-engineering\na node\nb node\nmove = a -> b [${field}]\n`;
    const opened = parseInstalledDocument028(source);
    expect(opened.graph?.edges[0].type).toBe('batch-flow');
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.edges[0].type).toBe('batch-flow');
    expect(verifyPortableSuccessorSource028(source).graph).toEqual(projected.graph);
    expect(successorSourceDisplay028(projected.graph!).edges[0].type).toBe('batch-flow');
    const saved = prepareInstalledDocumentForSave028(source, opened).source;
    expect(saved.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    expect(projectInstalledSourceToSuccessor028(saved).graph).toEqual(projected.graph);
  });
