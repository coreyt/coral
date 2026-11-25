import { describe, expect, it } from 'vitest';
import { parse as parseBase } from '../src/parser/index.js';
import { print, printWithDiagnostics } from '../src/printer/index.js';

const parse = (source: string) => parseBase(source, { edition: '0.2.8-preview' });

// Transitional RED gates for the approved 0.2.8 source contract. Remove
// `.fails` one test at a time as the replacement grammar becomes executable.
// These are not compatibility tests for the 0.2.6 parser.
const SEQUENCE_HEADER = '@graph {"id":"candidate","metadata":{"notation":"uml-sequence"}}';
const CLASS_HEADER = '@graph {"id":"candidate","metadata":{"notation":"uml-class"}}';

describe('0.2.8 Coral source contract — RED gates', () => {
  it.each([
    ['node', 'bad\u202fservice\ngood service'],
    ['edge', 'a service\nz service\na\u200b-> z\ngood service'],
    ['connector bracket', 'a service\nz service\na -> z [type:\u00a0flow]\ngood service'],
    ['arrangement', 'a service\nz service\narrange\u2060row: a, z\ngood service'],
  ] as const)('keeps the preview %s scanner aligned on exact invalid Unicode spacing', (_name, source) => {
    const result = parse(source);
    const spacing = result.diagnostics.filter((item) => item.code === 'coral.syntax.spacing.invalid');
    expect(spacing).toHaveLength(1);
    const invalid = /[\u202f\u200b\u00a0\u2060]/u.exec(source)![0];
    expect(source.slice(spacing[0]!.range!.start.offset, spacing[0]!.range!.end.offset)).toBe(invalid);
    expect(result.graph?.nodes.map((node) => node.id)).toContain('good');
  });

  it('does not reinterpret children of a spacing-rejected block as root declarations', () => {
    const result = parse('broken\u2060group {\n  hidden service\n}\nvisible service');
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.syntax.spacing.invalid');
    expect(result.graph?.nodes.map((node) => node.id)).toEqual(['visible']);
  });

  it('recovers a valid group when its closing brace carries invisible spacing', () => {
    const result = parse('engineering group {\n  inside service\n}\u2060\noutside service');
    expect(result.diagnostics.map((item) => item.code)).toEqual(['coral.syntax.spacing.invalid']);
    expect(result.graph?.nodes).toMatchObject([
      { id: 'engineering', children: [{ id: 'inside', parent: 'engineering' }] },
      { id: 'outside' },
    ]);
  });

  it('does not count quoted or commented braces on a spacing-rejected line', () => {
    const result = parse('bad\u2060service as "{" // }\nvisible service');
    expect(result.diagnostics.map((item) => item.code)).toEqual(['coral.syntax.spacing.invalid']);
    expect(result.graph?.nodes.map((node) => node.id)).toEqual(['visible']);
  });

  it('keeps unversioned saved source on its existing reader until the header is decided', () => {
    const source = 'apiGateway service as "API gateway"';
    expect(parseBase(source).diagnostics.map((item) => item.code)).toContain('coral.line.unparsed');
    expect(parse(source).diagnostics).toEqual([]);
  });

  it('does not reinterpret obsolete kind-first declarations in the explicit preview edition', () => {
    const old = 'service "Old API" as oldApi\nservice as oldWorker';
    expect(parseBase(old).graph?.nodes.map((node) => node.id)).toEqual(['oldApi', 'oldWorker']);
    const result = parse(`${old}\nnewApi service`);
    expect(result.diagnostics.filter((item) => item.code === 'coral.syntax.legacy-node.unsupported'))
      .toHaveLength(2);
    expect(result.graph?.nodes.map((node) => node.id)).toEqual(['newApi']);
  });

  it('does not promote children of an obsolete kind-first group into root nodes', () => {
    const result = parse('group "Engineering" as engineering {\n  hidden service\n}\nvisible service');
    expect(result.diagnostics.map((item) => item.code))
      .toEqual(['coral.syntax.legacy-node.unsupported']);
    expect(result.graph?.nodes.map((node) => node.id)).toEqual(['visible']);
  });

  it('parses an ID-first node with a quoted rendered label', () => {
    const result = parse('apiGateway service as "API gateway"');
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes[0]).toMatchObject({
      id: 'apiGateway', type: 'service', label: 'API gateway',
    });
  });

  it('accepts optional assignment on a node declaration', () => {
    const result = parse('apiGateway = service as "API gateway"');
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes[0]).toMatchObject({
      id: 'apiGateway', type: 'service', label: 'API gateway',
    });
  });

  it('defaults the visible label to the ID and preserves an authored blank label', () => {
    const result = parse('auditSink service\nhidden service as ""');
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes).toMatchObject([
      { id: 'auditSink', type: 'service', label: 'auditSink' },
      { id: 'hidden', type: 'service', label: '' },
    ]);
    const printed = print(result.graph!, { edition: '0.2.8-preview' });
    expect(printed).toContain('hidden service as ""');
    expect(printed).toContain('auditSink service as "auditSink"');
    expect(parse(printed).graph?.nodes.map((node) => node.label)).toEqual(['auditSink', '']);
  });

  it('accepts matching single quotes without changing the authored ID', () => {
    const result = parse("apiGateway service as 'API gateway'");
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes[0]).toMatchObject({
      id: 'apiGateway', type: 'service', label: 'API gateway',
    });
  });

  it('rejects unknown and unnecessary escapes in preview labels with UTF-16 ranges', () => {
    const source = 'api service as "\u{1F30A}\\q"\ndb database';
    const result = parse(source);
    const diagnostic = result.diagnostics.find((item) => item.code === 'coral.string.escape.invalid');
    expect(diagnostic?.range).toMatchObject({
      start: { line: 1, column: 18 }, end: { line: 1, column: 20 },
    });
    expect(result.graph?.nodes.map((node) => node.id)).toEqual(['db']);

    const unnecessary = parse("api service as 'a\\\"b'");
    expect(unnecessary.diagnostics.map((item) => item.code)).toContain('coral.string.escape.invalid');
  });

  it('rejects an unknown escape in a bracket label instead of silently rewriting it', () => {
    const result = parse('api service\ndb database\napi -> db [flow, label: "read\\t"]');
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.string.escape.invalid');
    expect(result.graph?.edges).toEqual([]);
  });

  it('pinpoints an unterminated or mismatched quoted label and keeps later nodes', () => {
    const result = parse('api service as "Gateway\'\ndb database');
    const diagnostic = result.diagnostics.find((item) => item.code === 'coral.string.unterminated');
    expect(diagnostic?.range).toMatchObject({
      start: { line: 1, column: 15 }, end: { line: 1, column: 24 },
    });
    expect(result.graph?.nodes.map((node) => node.id)).toEqual(['db']);
  });

  it('reports a duplicate ID-first declaration without renaming the node', () => {
    const result = parse('api service\napi database');
    expect(result.graph?.nodes).toMatchObject([{ id: 'api', type: 'service' }]);
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.node.id.invalid');
  });

  it('binds an edge ID separately from its type and visible label', () => {
    const result = parse(`review decision\napprove process\nyesPath = review -> approve [flow] as "Yes"`);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges[0]).toMatchObject({
      id: 'yesPath', source: 'review', target: 'approve', type: 'flow', label: 'Yes',
    });
  });

  it('does not reinterpret an unquoted edge label as an old edge ID in preview mode', () => {
    const result = parse('api service\ndb database\napi -> db as readPath');
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.edge.label.quote-required');
    expect(result.graph?.edges).toEqual([]);
  });

  it('accepts keyed connector type and label but rejects a duplicate `as` label', () => {
    const source = 'api service\ndb database\nreadPath = api -> db [type: reads, label: "Order IDs"]';
    const result = parse(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges[0]).toMatchObject({
      id: 'readPath', type: 'reads', label: 'Order IDs',
    });
    const duplicate = parse(`${source} as "again"`);
    expect(duplicate.diagnostics.map((item) => item.code)).toContain('coral.edge.label.duplicate');
    expect(duplicate.diagnostics.find((item) => item.code === 'coral.edge.label.duplicate')?.related)
      .toMatchObject([{ message: expect.any(String), range: { start: { line: 3 } } }]);
    expect(duplicate.graph?.edges).toEqual([]);
  });

  it('locates both type assignments when bare and keyed connector types conflict', () => {
    const source = 'api service\ndb database\napi -> db [flow, type: reads]';
    const result = parse(source);
    const diagnostic = result.diagnostics.find((item) => item.code === 'coral.edge.type.duplicate');
    expect(diagnostic?.range?.start).toMatchObject({ line: 3, column: 17 });
    expect(diagnostic?.related?.[0]?.range?.start).toMatchObject({ line: 3, column: 11 });
    expect(result.graph?.edges).toEqual([]);
  });

  it('locates both keyed edge labels rather than keeping either silently', () => {
    const result = parse('api service\ndb database\napi -> db [flow, label: "One", label: "Two"]');
    const diagnostic = result.diagnostics.find((item) => item.code === 'coral.edge.label.duplicate');
    expect(diagnostic?.range?.start.line).toBe(3);
    expect(diagnostic?.related?.[0]?.range?.start.line).toBe(3);
    expect(result.graph?.edges).toEqual([]);
  });

  it('accepts a single-quoted keyed label containing comma and bracket characters', () => {
    const result = parse("api service\ndb database\napi -> db [flow, label: 'Read, [then] return']");
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges[0]).toMatchObject({ type: 'flow', label: 'Read, [then] return' });
  });

  it('prints an edge with a quoted identity ahead of the connector for round-trip', () => {
    const source = print({ version: '3.0.0', id: 'draft',
      nodes: [{ id: 'api', type: 'service', label: 'API' },
        { id: 'db', type: 'database', label: 'DB' }],
      edges: [{ id: 'api-db', source: 'api', target: 'db', label: 'reads',
        sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'none', fill: 'unspecified' } } }],
    }, { edition: '0.2.8-preview' });
    expect(source).toContain('"api-db" = api -- db as "reads"');
    const parsed = parse(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph?.edges[0]).toMatchObject({ id: 'api-db', source: 'api',
      target: 'db', label: 'reads' });
    expect(parsed.graph?.edges[0].targetEnd?.marker?.kind).toBe('none');
  });

  it('treats compact and keyed async clauses as equivalent', () => {
    const compact = parse(`${SEQUENCE_HEADER}\nclient participant\nserver participant\nclient -> server [async] as "request"`);
    const keyed = parse(`${SEQUENCE_HEADER}\nclient participant\nserver participant\nclient -> server [type: async] as "request"`);
    expect(compact.diagnostics).toEqual([]);
    expect(keyed.diagnostics).toEqual([]);
    expect(compact.graph?.interaction?.messages[0].kind).toBe('asynchronous');
    expect(keyed.graph?.interaction?.messages[0].kind).toBe('asynchronous');
  });

  it('derives sync, async, and return from sequence operators', () => {
    const result = parse(`${SEQUENCE_HEADER}\nclient participant\nserver participant\nworker participant\nclient -#> server as "load()"\nserver -> worker as "enqueue()"\nserver -.-> client as "result"`);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.interaction?.messages.map((message) => message.kind)).toEqual([
      'synchronous', 'asynchronous', 'return',
    ]);
    expect(result.graph?.edges[0]?.targetEnd).toMatchObject({
      marker: { kind: 'triangle', fill: 'filled' },
    });
  });

  it('uses the preview meaning for an unlabeled, unnamed sequence arrow', () => {
    const result = parse(`${SEQUENCE_HEADER}\nclient participant\nserver participant\nclient -> server`);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.interaction?.messages[0]).toMatchObject({
      sourceParticipantId: 'client', targetParticipantId: 'server', kind: 'asynchronous',
    });
    expect(result.graph?.edges[0]).toMatchObject({
      source: 'client', target: 'server', type: 'async',
      targetEnd: { marker: { kind: 'arrow', fill: 'open' } },
    });
  });

  it('keeps a neutral connector free of endpoint decoration', () => {
    const result = parse('api service\ndb database\napi -- db');
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.edges[0]).toMatchObject({ source: 'api', target: 'db' });
    expect(result.graph?.edges[0].sourceEnd?.marker?.kind).toBe('none');
    expect(result.graph?.edges[0].targetEnd?.marker?.kind).toBe('none');
  });

  it('keeps two-headed and dashed-neutral connector appearance in the public preview', () => {
    const source = 'a service\nz service\nboth = a <-> z\ndashed = a -.- z';
    const first = parse(source);
    expect(first.diagnostics).toEqual([]);
    expect(first.graph?.edges[0]).toMatchObject({
      id: 'both', source: 'a', target: 'z',
      sourceEnd: { marker: { kind: 'arrow', fill: 'open' } },
      targetEnd: { marker: { kind: 'arrow', fill: 'open' } },
    });
    expect(first.graph?.edges[1]).toMatchObject({
      id: 'dashed', source: 'a', target: 'z', style: { lineStyle: 'dashed' },
    });
    expect(first.graph?.edges[1].sourceEnd?.marker?.kind).toBe('none');
    expect(first.graph?.edges[1].targetEnd?.marker?.kind).toBe('none');
    const printed = print(first.graph!, { edition: '0.2.8-preview' });
    expect(printed).toContain('both = a <-> z');
    expect(printed).toContain('dashed = a -.- z');
    expect(parse(printed).diagnostics).toEqual([]);
  });

  it('parses reverse and two-headed solid connectors with one through six shaft positions', () => {
    for (const count of [1, 2, 3, 4, 5, 6] as const) {
      for (const twoHeaded of [false, true]) {
        const operator = `<${'-'.repeat(count)}${twoHeaded ? '>' : ''}`;
        const result = parse(`a service\nz service\na ${operator} z`);
        expect(result.diagnostics, operator).toEqual([]);
        expect(result.graph?.edges[0], operator).toMatchObject({
          source: 'a', target: 'z',
          sourceEnd: { marker: { kind: 'arrow', fill: 'open' } },
          targetEnd: { marker: { kind: twoHeaded ? 'arrow' : 'none' } },
        });
      }
    }
    for (const operator of [`<${'-'.repeat(7)}`, `<${'-'.repeat(7)}>`]) {
      const result = parse(`a service\nz service\na ${operator} z`);
      expect(result.diagnostics.length, operator).toBeGreaterThan(0);
      expect(result.graph?.edges, operator).toEqual([]);
    }
  });

  it('round-trips supported endpoint decorations through explicit preview printing', () => {
    const operators = ['--|>', '--#|>', '-<>', '-#<>', '--o', '--#o', '--|'];
    for (const operator of operators) {
      const source = `a service\nb service\nrelation = a ${operator} b`;
      const first = parse(source);
      expect(first.diagnostics, operator).toEqual([]);
      const printed = printWithDiagnostics(first.graph!, { edition: '0.2.8-preview' });
      expect(printed.diagnostics, operator).toEqual([]);
      const second = parse(printed.text);
      expect(second.diagnostics, operator).toEqual([]);
      expect(second.graph?.edges[0]?.sourceEnd, operator).toEqual(first.graph?.edges[0]?.sourceEnd);
      expect(second.graph?.edges[0]?.targetEnd, operator).toEqual(first.graph?.edges[0]?.targetEnd);
      expect(second.graph?.edges[0]?.style, operator).toEqual(first.graph?.edges[0]?.style);
    }
  });

  it('does not drop or contradict a portable UML profile when printing preview source', () => {
    const graph = { version: '3.0.0' as const, id: 'uml',
      profile: { id: 'uml' as const, kind: 'class' as const, version: '1.0.0' as const },
      nodes: [], edges: [] };
    const printed = printWithDiagnostics(graph, { edition: '0.2.8-preview' });
    expect(printed.diagnostics).toEqual([]);
    expect(printed.text).toContain('"notation":"uml-class"');
    expect(parse(printed.text).graph?.profile).toEqual(graph.profile);

    const sequence = { ...graph, profile: { ...graph.profile, kind: 'sequence' as const },
      nodes: [{ id: 'client', type: 'participant' }, { id: 'server', type: 'participant' }],
      edges: [{ id: 'call', source: 'client', target: 'server', type: 'sync',
        sourceEnd: { marker: { kind: 'none' as const, fill: 'unspecified' as const } },
        targetEnd: { marker: { kind: 'triangle' as const, fill: 'filled' as const } } }] };
    const printedSequence = printWithDiagnostics(sequence, { edition: '0.2.8-preview' });
    expect(printedSequence.diagnostics).toEqual([]);
    expect(printedSequence.text).toContain('call = client -#> server');
    expect(printedSequence.text).not.toContain('[sync]');
    expect(parse(printedSequence.text).graph?.interaction?.messages[0]?.kind).toBe('synchronous');

    const conflicting = { ...sequence, edges: [{ ...sequence.edges[0]!, type: 'async' }] };
    const printedConflict = printWithDiagnostics(conflicting, { edition: '0.2.8-preview' });
    expect(printedConflict.diagnostics).toEqual([]);
    expect(printedConflict.text).toContain('call = client -#> server [async]');
    expect(parse(printedConflict.text).graph?.edges[0]?.type).toBe('async');

    const contradictory = printWithDiagnostics({ ...graph,
      metadata: { notation: 'architecture' } }, { edition: '0.2.8-preview' });
    expect(contradictory.text).toBe('');
    expect(contradictory.diagnostics.map((item) => item.code))
      .toContain('coral.preview.graph.unsupported');
  });

  it('keeps written endpoint order for a first-end arrow through preview print and parse', () => {
    const source = 'a service\nz service\nback = a <- z';
    const first = parse(source);
    expect(first.diagnostics).toEqual([]);
    expect(first.graph?.edges[0]).toMatchObject({ id: 'back', source: 'a', target: 'z',
      sourceEnd: { marker: { kind: 'arrow', fill: 'open' } } });
    expect(first.graph?.edges[0].targetEnd?.marker?.kind).toBe('none');
    const printed = print(first.graph!, { edition: '0.2.8-preview' });
    expect(printed).toContain('back = a <- z');
    expect(parse(printed).graph?.edges[0]).toEqual(first.graph?.edges[0]);
  });

  it('does not mistake a two-headed sequence connector for a one-way message', () => {
    const result = parse(`${SEQUENCE_HEADER}\na participant\nz participant\na <-> z`);
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.sequence.message.operator.invalid');
    expect(result.graph?.interaction?.messages).toEqual([]);
  });

  it('does not silently reinterpret a first-end sequence arrow as a forward message', () => {
    const result = parse(`${SEQUENCE_HEADER}\na participant\nz participant\na <- z`);
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.sequence.message.operator.invalid');
    expect(result.graph?.interaction?.messages).toEqual([]);
    expect(result.graph?.edges).toEqual([]);
  });

  it('round-trips the settled UML sequence operator subset in preview printing', () => {
    const source = `${SEQUENCE_HEADER}\nclient participant\nserver participant\n` +
      'client -#> server as "load()"\nserver -> client as "notify"\nserver -.-> client as "result"';
    const first = parse(source);
    expect(first.diagnostics).toEqual([]);
    const printed = print(first.graph!, { edition: '0.2.8-preview' });
    const second = parse(printed);
    expect(second.diagnostics).toEqual([]);
    expect(second.graph?.interaction?.messages.map((message) => message.kind)).toEqual([
      'synchronous', 'asynchronous', 'return',
    ]);
    expect(printed).toContain('client -#> server');
    expect(printed).toContain('server -.-> client');
  });

  it('preserves a sequence operator and conflicting explicit type for U2 on preview reopen', () => {
    const source = `${SEQUENCE_HEADER}\nclient participant\nserver participant\n` +
      'load = client -#> server [async] as "load()"\n' +
      'reply = server -.-> client [sync] as "result"';
    const first = parse(source);
    expect(first.diagnostics).toEqual([]);
    expect(first.graph?.edges.map((edge) => edge.type)).toEqual(['async', 'sync']);
    expect(first.graph?.interaction?.messages.map((message) => message.kind)).toEqual(['synchronous', 'return']);
    const printed = print(first.graph!, { edition: '0.2.8-preview' });
    const second = parse(printed);
    expect(second.diagnostics).toEqual([]);
    expect(second.graph?.edges.map((edge) => edge.type)).toEqual(['async', 'sync']);
    expect(second.graph?.interaction?.messages.map((message) => message.kind)).toEqual(['synchronous', 'return']);
    expect(printed).toContain('load = client -#> server [async] as "load()"');
    expect(printed).toContain('reply = server -.-> client [sync] as "result"');
  });

  it('does not let a conflicting create type introduce a target without the create operator', () => {
    const result = parse(`${SEQUENCE_HEADER}\nclient participant\nclient -> worker [create]`);
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.reference.unresolved.invalid');
    expect(result.graph?.nodes.some((node) => node.id === 'worker')).toBe(false);
  });

  it('rejects an unknown explicit sequence type while leaving a valid neighboring message', () => {
    const result = parse(`${SEQUENCE_HEADER}\nclient participant\nserver participant\n` +
      'client -> server [reads]\nclient -> server [async]');
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.sequence.message.operator.invalid');
    expect(result.graph?.edges.map((edge) => edge.type)).toEqual(['async']);
  });

  it('fails closed when preview printing cannot preserve authored portable fields', () => {
    const graph = { version: '3.0.0' as const, id: 'draft', nodes: [
      { id: 'api', type: 'service', label: 'api', symbol: 'custom', position: { x: 10, y: 20 } }], edges: [] };
    const result = printWithDiagnostics(graph, { edition: '0.2.8-preview' });
    expect(result.text).toBe('');
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.preview.node.unsupported');
    expect(() => print(graph, { edition: '0.2.8-preview' })).toThrow('coral.preview.node.unsupported');

    const endpoint = printWithDiagnostics({ version: '3.0.0', id: 'draft',
      nodes: [{ id: 'api', type: 'service' }, { id: 'db', type: 'database' }],
      edges: [{ id: 'relation', source: 'api', target: 'db',
        targetEnd: { role: 'reader', marker: { kind: 'arrow', fill: 'open' } } }],
    }, { edition: '0.2.8-preview' });
    expect(endpoint.text).toBe('');
    expect(endpoint.diagnostics.map((item) => item.code)).toContain('coral.preview.edge.unsupported');

    const unspecifiedEnds = printWithDiagnostics({ version: '3.0.0', id: 'draft',
      nodes: [{ id: 'api', type: 'service' }, { id: 'db', type: 'database' }],
      edges: [{ id: 'relation', source: 'api', target: 'db' }],
    }, { edition: '0.2.8-preview' });
    expect(unspecifiedEnds.text).toBe('');
    expect(unspecifiedEnds.diagnostics.map((item) => item.code)).toContain('coral.preview.edge.unsupported');
  });

  it('does not invent a declaration for a creation-introduced participant on print', () => {
    const parsed = parse(`${SEQUENCE_HEADER}\nclient participant\nclient -.-> worker [create] as "spawn()"`);
    expect(parsed.diagnostics).toEqual([]);
    const printed = printWithDiagnostics(parsed.graph!, { edition: '0.2.8-preview' });
    expect(printed.text).toBe('');
    expect(printed.diagnostics.map((item) => item.code)).toContain('coral.preview.graph.unsupported');
  });

  it('round-trips a nested group and named arrangement in preview printing', () => {
    const source = 'engineering group {\n  api service\n  worker service\n}\n' +
      'serviceRow = arrange row: api, worker';
    const first = parse(source);
    expect(first.diagnostics).toEqual([]);
    const printed = print(first.graph!, { edition: '0.2.8-preview' });
    const second = parse(printed);
    expect(second.diagnostics).toEqual([]);
    expect(second.graph?.nodes[0]).toMatchObject({ id: 'engineering', type: 'group',
      children: [{ id: 'api' }, { id: 'worker' }] });
    expect(second.graph?.constraints?.[0]).toMatchObject({ id: 'serviceRow', axis: 'row' });
  });

  it('parses approved named UML compartments and public attributes beside short unnamed forms', () => {
    const sources = [
      'Order class {\n  fields = attributes {\n    orderId = public attribute id: String\n  }\n}',
      'Order class {\n  attributes {\n    + id: String\n  }\n}',
      'Order class {\n  fields = attributes {\n    + id: String\n  }\n}',
    ];
    for (const source of sources) {
      const result = parse(`${CLASS_HEADER}\n${source}`);
      expect(result.diagnostics, source).toEqual([]);
      expect(result.graph?.nodes[0]?.classifier?.compartments[1]).toMatchObject({
        kind: 'attributes', items: [{ kind: 'attribute', visibility: 'public', name: 'id', type: 'String' }],
      });
    }
    const named = parse(`${CLASS_HEADER}\n${sources[0]}`);
    expect(named.graph?.nodes[0]?.classifier?.compartments[1]).toMatchObject({
      id: 'fields', items: [{ id: 'orderId' }],
    });
  });

  it('does not reuse `as` for a UML member identity in preview mode', () => {
    const source = `${CLASS_HEADER}\nOrder class {\n  attributes {\n    attribute id: String as orderId\n  }\n}`;
    const result = parse(source);
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.uml.member.identity.unsupported');
    expect(result.graph?.nodes[0]?.classifier?.compartments[1]).toMatchObject({ items: [] });
  });

  it('prints and reparses the named UML-class subset without moving identities into `as`', () => {
    const source = `${CLASS_HEADER}\nOrder class {\n  fields = attributes {\n    orderId = public attribute id: String\n  }\n}`;
    const first = parse(source);
    expect(first.diagnostics).toEqual([]);
    const printed = print(first.graph!, { edition: '0.2.8-preview' });
    expect(printed).toContain('fields = attributes {');
    expect(printed).toContain('orderId = public attribute id: String');
    expect(printed).not.toContain('as orderId');
    const second = parse(printed);
    expect(second.diagnostics).toEqual([]);
    expect(second.graph?.nodes[0]?.classifier).toEqual(first.graph?.nodes[0]?.classifier);
  });

  it('uses the candidate grammar’s stable generated identity for an unnamed attribute', () => {
    const result = parse(`${CLASS_HEADER}\nOrder class {\n  attributes {\n    + id: String\n  }\n}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes[0]?.classifier?.compartments[1]).toMatchObject({
      items: [{ id: 'attribute_1', name: 'id' }],
    });
  });

  it('reserves later explicit UML member IDs before allocating unnamed identities', () => {
    const result = parse(`${CLASS_HEADER}\nOrder class {\n  attributes {\n    + first: String\n    attribute_1 = public attribute second: String\n  }\n}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.nodes[0]?.classifier?.compartments[1]).toMatchObject({
      items: [{ id: 'attribute_2', name: 'first' }, { id: 'attribute_1', name: 'second' }],
    });
    const printed = print(result.graph!, { edition: '0.2.8-preview' });
    expect(parse(printed).graph?.nodes[0]?.classifier).toEqual(result.graph?.nodes[0]?.classifier);
  });

  it('lets an explicit creation message introduce its target participant', () => {
    const result = parse(`${SEQUENCE_HEADER}\nclient participant\nclient -.-> worker [create] as "spawn()"`);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.interaction?.participants.some((participant) => participant.id === 'worker')).toBe(true);
    expect(result.graph?.interaction?.messages[0]).toMatchObject({
      sourceParticipantId: 'client', targetParticipantId: 'worker', kind: 'create',
    });
  });

  it('does not infer an ordinary missing participant and lets a later declaration enrich creation', () => {
    const missing = parse(`${SEQUENCE_HEADER}\nclient participant\nclient -> worker as "ping"`);
    expect(missing.graph?.nodes.map((node) => node.id)).toEqual(['client']);
    expect(missing.diagnostics.map((item) => item.code)).toContain('coral.reference.unresolved.invalid');

    const declared = parse(`${SEQUENCE_HEADER}\nclient participant\n` +
      'client -.-> worker [create] as "spawn()"\nworker participant as "Worker"');
    expect(declared.diagnostics).toEqual([]);
    expect(declared.graph?.nodes.filter((node) => node.id === 'worker')).toMatchObject([
      { id: 'worker', type: 'participant', label: 'Worker' },
    ]);
  });

  it('maps the approved named arrangement syntax in the public parser', () => {
    const result = parse('api service\nworker service\nserviceRow = arrange row: api, worker');
    expect(result.diagnostics).toEqual([]);
    expect(result.graph?.constraints?.[0]).toMatchObject({ id: 'serviceRow', kind: 'arrangement',
      axis: 'row', subjects: [{ kind: 'node', nodeId: 'api' }, { kind: 'node', nodeId: 'worker' }] });
  });

  it('checks arrangement membership and preserves a forward node reference', () => {
    const valid = parse('serviceRow = arrange row: api, worker\napi service\nworker service');
    expect(valid.diagnostics).toEqual([]);
    expect(valid.graph?.constraints?.[0]).toMatchObject({ id: 'serviceRow', kind: 'arrangement',
      axis: 'row' });
    const invalid = parse('api service\narrange row: api, missing');
    expect(invalid.diagnostics.map((item) => item.code)).toContain('coral.constraint.reference.unresolved.invalid');
  });
});
