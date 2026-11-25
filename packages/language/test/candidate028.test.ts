import { describe, expect, it } from 'vitest';
import { validateIR } from '@graph-ir/core';
import { parseCandidate028, replaceCandidateLabel, setCandidateLabel } from '../src/parser/candidate028.js';
import { CONNECTOR_END_SPELLINGS_028, parseConnector028 } from '../src/parser/connector028.js';
import { validateSequenceInteraction } from '../src/sequence.js';

describe('Coral 0.2.8 approved-core candidate', () => {
  it('rejects both retired kind-first forms without projecting a false node', () => {
    const source = 'service "Old API" as oldApi\nservice as oldWorker\nnewApi service';
    const parsed = parseCandidate028(source, { profile: 'architecture' });
    expect(parsed.diagnostics.map((item) => item.code)).toEqual([
      'coral.syntax.legacy-node.unsupported',
      'coral.syntax.legacy-node.unsupported',
    ]);
    expect(parsed.graph.nodes.map((node) => node.id)).toEqual(['newApi']);
    expect(parsed.statements.filter((item) => item.kind === 'node').map((item) => item.id.value))
      .toEqual(['newApi']);
    expect(source).toContain('service as oldWorker');
  });

  it('does not promote children of a retired kind-first group into root meaning', () => {
    const source = 'group "Engineering" as engineering {\n  hidden service\n}\nvisible service';
    const parsed = parseCandidate028(source, { profile: 'architecture' });
    expect(parsed.diagnostics.map((item) => item.code))
      .toEqual(['coral.syntax.legacy-node.unsupported']);
    expect(parsed.graph.nodes.map((node) => node.id)).toEqual(['visible']);
    expect(parsed.statements.filter((item) => item.kind === 'node').map((item) => item.id.value))
      .toEqual(['visible']);
    expect(source).toContain('hidden service');
  });

  it('keeps named activations around exactly their authored recursive body', () => {
    const source = 'api participant\ndb participant\n' +
      'work = activation api {\n  before = api -#> db\n' +
      '  choice = alt "yes" {\n    db -.-> api\n  } else "no" {\n' +
      '    api -> db\n  }\n  after = db -.-> api\n}\n' +
      'activation db {\n  api -> db\n}';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.sequenceItems).toMatchObject([
      { kind: 'activation', id: { value: 'work' }, participant: { value: 'api' },
        items: [{ kind: 'edge', id: { value: 'before' } },
          { kind: 'fragment', id: { value: 'choice' } },
          { kind: 'edge', id: { value: 'after' } }] },
      { kind: 'activation', participant: { value: 'db' }, items: [{ kind: 'edge' }] },
    ]);
    expect(parsed.sequenceItems[0]).toHaveProperty('blockClose');
  });

  it('keeps an activation inside its alt operand and rejects a cross-operand close', () => {
    const accepted = 'api participant\ndb participant\n' +
      'alt "accepted" {\n  activation api {\n    api -> db\n  }\n' +
      '} else "rejected" {\n  db -> api\n}';
    const parsed = parseCandidate028(accepted, { profile: 'uml-sequence' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.sequenceItems).toMatchObject([{ kind: 'fragment', operands: [
      { items: [{ kind: 'activation', participant: { value: 'api' } }] },
      { items: [{ kind: 'edge' }] },
    ] }]);
    const crossing = 'api participant\ndb participant\n' +
      'alt "accepted" {\n  activation api {\n    api -> db\n' +
      '} else "rejected" {\n  db -> api\n}';
    const invalid = parseCandidate028(crossing, { profile: 'uml-sequence' });
    expect(invalid.diagnostics.map((item) => item.code))
      .toContain('coral.sequence.activation.scope');
    expect(crossing).toContain('activation api {');
  });

  it('locates an activation outside its participant lifetime and an unclosed block', () => {
    const beforeCreation = 'client participant\n' +
      'activation worker {\n  client -.-> worker [create]\n}';
    const located = parseCandidate028(beforeCreation, { profile: 'uml-sequence' });
    expect(located.diagnostics).toMatchObject([{
      code: 'coral.sequence.activation.outside-participant-lifetime',
      range: { start: { line: 2, column: 11 } },
    }]);
    const unclosed = 'client participant\nactivation client {\n  client -> client';
    expect(parseCandidate028(unclosed, { profile: 'uml-sequence' }).diagnostics.map((item) => item.code))
      .toContain('coral.sequence.activation.unclosed');
    expect(beforeCreation).toContain('[create]');
  });
  it('locates a message that uses a participant before its creation without changing source', () => {
    const source = 'client participant\nworker participant\n' +
      'early = client -> worker\n' +
      'spawn = client -.-> worker [create]\n' +
      'later = client -> worker\n';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics.map((item) => item.code)).toEqual([
      'coral.sequence.message.outside-participant-lifetime',
    ]);
    expect(parsed.diagnostics[0]?.range?.start.offset).toBe(source.indexOf('worker', source.indexOf('early =')));
    expect(parsed.graph.interaction?.messages.map((message) => message.id))
      .toEqual(['early', 'spawn', 'later']);
  });
  it.each(['loop', 'opt', 'critical', 'break'])(
    'keeps a guarded %s fragment as one recursive operand', (kind) => {
      const source = 'api participant\nworker participant\n' +
        `task = ${kind} "ready" {\n  call = api -> worker\n}\n`;
      const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
      expect(parsed.diagnostics).toEqual([]);
      expect(parsed.sequenceItems).toMatchObject([{ kind: 'fragment',
        id: { value: 'task' }, fragmentKind: { value: kind }, operands: [
          { guard: { value: 'ready' }, items: [{ kind: 'edge', id: { value: 'call' } }] },
        ] }]);
    },
  );

  it('keeps optional loop and critical guards absent without inventing text', () => {
    const source = 'api participant\nworker participant\n' +
      'repeat = loop {\n  api -> worker\n}\n' +
      'lock = critical {\n  worker -> api\n}';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.sequenceItems).toMatchObject([
      { kind: 'fragment', id: { value: 'repeat' }, operands: [{ items: [{ kind: 'edge' }] }] },
      { kind: 'fragment', id: { value: 'lock' }, operands: [{ items: [{ kind: 'edge' }] }] },
    ]);
    expect(parsed.sequenceItems.every((item) => item.kind === 'fragment' &&
      item.operands[0]?.guard === undefined)).toBe(true);
  });

  it('keeps parallel operands and their optional quoted guards in written order', () => {
    const source = 'api participant\nworker participant\n' +
      'both = par "fast" {\n  first = api -> worker\n} and {\n' +
      '  second = worker -> api\n} and "slow" {\n  third = api -> worker\n}';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.sequenceItems).toHaveLength(1);
    const fragment = parsed.sequenceItems[0];
    expect(fragment?.kind).toBe('fragment');
    if (fragment?.kind !== 'fragment') return;
    expect(fragment.fragmentKind.value).toBe('par');
    expect(fragment.operands.map((operand) => operand.guard?.value))
      .toEqual(['fast', undefined, 'slow']);
    expect(fragment.operands.map((operand) => operand.items[0]?.kind))
      .toEqual(['edge', 'edge', 'edge']);
  });

  it('rejects an unguarded opt and an else continuation', () => {
    const source = 'api participant\nworker participant\n' +
      'opt {\n  api -> worker\n}\n' +
      'opt "ready" {\n  api -> worker\n} else "other" {\n  worker -> api\n}\n' +
      'kept = api -> worker';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.sequence.fragment.syntax');
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.sequence.fragment.else');
    expect(parsed.graph.edges.map((edge) => edge.id)).toContain('kept');
    expect(source).toContain('opt {');
  });
  it.each([
    ['missing parallel operand', 'par "first" {\n  api -> worker\n}',
      'coral.sequence.fragment.operands'],
    ['else after par', 'par {\n  api -> worker\n} else "other" {\n  worker -> api\n}',
      'coral.sequence.fragment.else'],
    ['and after alt', 'alt "first" {\n  api -> worker\n} and {\n  worker -> api\n}',
      'coral.sequence.fragment.and'],
    ['unguarded break', 'break {\n  api -> worker\n}',
      'coral.sequence.fragment.syntax'],
  ] as const)('diagnoses %s without flattening it', (_name, body, code) => {
    const parsed = parseCandidate028(`api participant\nworker participant\n${body}`,
      { profile: 'uml-sequence' });
    expect(parsed.diagnostics.map((item) => item.code)).toContain(code);
  });
  it('keeps nested quoted alt/else syntax and written message order', () => {
    const source = 'a participant\nb participant\n' +
      'choice = alt "yes" {\n  first = a -> b\n  nested = alt \'again\' {\n' +
      '    second = b -> a\n  } else \'stop\' {\n    third = a -> b\n  }\n' +
      '} else "no" {\n  fourth = b -> a\n}';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.sequenceItems).toHaveLength(1);
    const fragment = parsed.sequenceItems[0];
    expect(fragment?.kind).toBe('fragment');
    if (fragment?.kind !== 'fragment') return;
    expect(fragment.id?.value).toBe('choice');
    expect(fragment.operands.map((operand) => operand.guard?.value)).toEqual(['yes', 'no']);
    expect(fragment.operands[0]?.items.map((item) => item.kind)).toEqual(['edge', 'fragment']);
    expect(fragment.operands[1]?.items.map((item) => item.kind)).toEqual(['edge']);
  });

  it.each([
    ['missing else', 'alt "yes" {\n  a -> b\n}', 'coral.sequence.fragment.operands'],
    ['unquoted guard', 'alt yes {\n  a -> b\n} else "no" {\n  b -> a\n}', 'coral.sequence.fragment.syntax'],
    ['missing separator', 'alt "yes" {\n  a -> b\n}else "no" {\n  b -> a\n}', 'coral.syntax.spacing.required'],
  ])('diagnoses %s without promoting fragment messages to a flat claim', (_name, body, code) => {
    const parsed = parseCandidate028(`a participant\nb participant\n${body}`, { profile: 'uml-sequence' });
    expect(parsed.diagnostics.map((item) => item.code)).toContain(code);
  });
  it.each([
    ['alt', 'alt "yes" {', 'else "no"'],
    ['par', 'par {', 'and'],
  ])('quarantines a Unicode-rejected %s continuation body without grafting its messages',
    (_name, first, continuation) => {
      const source = `a participant\nb participant\n${first}\n  first = a -> b\n}` +
        `\u00a0${continuation} {\n  hidden = b -> a\n}\nafter = a -> b`;
      const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
      const spacing = parsed.diagnostics.find((item) => item.code === 'coral.syntax.spacing.invalid');
      expect(source.slice(spacing!.range!.start.offset, spacing!.range!.end.offset)).toBe('\u00a0');
      expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.sequence.fragment.operands');
      expect(parsed.sequenceItems.map((item) => item.kind)).toEqual(['fragment', 'edge']);
      const fragment = parsed.sequenceItems[0];
      if (fragment?.kind !== 'fragment') throw new Error('Expected a fragment');
      expect(fragment.operands[0]?.items.map((item) => item.kind)).toEqual(['edge']);
      expect(parsed.statements.filter((item) => item.kind === 'edge').map((item) => item.id?.value))
        .toEqual(['first', 'after']);
    });
  it('resumes the containing timeline after a rejected nested continuation', () => {
    const source = 'a participant\nb participant\nloop {\n' +
      '  alt "yes" {\n    first = a -> b\n  }\u00a0else "no" {\n' +
      '    hidden = b -> a\n  }\n  retained = a -> b\n}\n' +
      'outside = b -> a';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.syntax.spacing.invalid');
    const outer = parsed.sequenceItems[0];
    if (outer?.kind !== 'fragment') throw new Error('Expected an outer fragment');
    expect(outer.operands[0]?.items.map((item) => item.kind))
      .toEqual(['fragment', 'edge']);
    expect(parsed.sequenceItems.map((item) => item.kind)).toEqual(['fragment', 'edge']);
    expect(parsed.statements.filter((item) => item.kind === 'edge').map((item) => item.id?.value))
      .toEqual(['first', 'retained', 'outside']);
  });
  it.each([
    ['missing gap', '}else "no" {', 'coral.syntax.spacing.required'],
    ['unquoted guard', '} else no {', 'coral.sequence.fragment.else'],
    ['invalid escape', '} else "bad\\q" {', 'coral.syntax.string.invalid-escape'],
    ['empty guard', '} else "" {', 'coral.sequence.fragment.guard'],
  ])('quarantines a rejected %s continuation body', (_name, continuation, code) => {
    const source = 'a participant\nb participant\nalt "yes" {\n' +
      `  first = a -> b\n${continuation}\n  hidden = b -> a\n}\n` +
      'after = a -> b';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics.map((item) => item.code)).toContain(code);
    const fragment = parsed.sequenceItems[0];
    if (fragment?.kind !== 'fragment') throw new Error('Expected a fragment');
    expect(fragment.operands[0]?.items.map((item) => item.kind)).toEqual(['edge']);
    expect(parsed.sequenceItems.map((item) => item.kind)).toEqual(['fragment', 'edge']);
    expect(parsed.statements.filter((item) => item.kind === 'edge').map((item) => item.id?.value))
      .toEqual(['first', 'after']);
  });
  it.each([
    ['invalid guard escape', 'alt "bad\\q" {', 'coral.syntax.string.invalid-escape'],
    ['missing keyword gap', 'alt"yes" {', 'coral.syntax.spacing.required'],
    ['empty guard', 'alt "" {', 'coral.sequence.fragment.guard'],
  ])('quarantines a rejected %s fragment opener', (_name, opener, code) => {
    const source = 'a participant\nb participant\n' +
      `${opener}\n  hidden = a -> b\n}\n` +
      'after = b -> a';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics.map((item) => item.code)).toContain(code);
    expect(parsed.sequenceItems.map((item) => item.kind)).toEqual(['edge']);
    expect(parsed.statements.filter((item) => item.kind === 'edge').map((item) => item.id?.value))
      .toEqual(['after']);
  });
  it('keeps a rejected nested fragment body out of its accepted parent', () => {
    const source = 'a participant\nb participant\nloop "repeat" {\n' +
      '  alt "bad\\q" {\n    hidden = a -> b\n  }\n' +
      '  retained = b -> a\n}\nafter = a -> b';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.syntax.string.invalid-escape');
    const loop = parsed.sequenceItems[0];
    if (loop?.kind !== 'fragment') throw new Error('Expected a loop fragment');
    expect(loop.operands[0]?.items.map((item) => item.kind)).toEqual(['edge']);
    expect(parsed.sequenceItems.map((item) => item.kind)).toEqual(['fragment', 'edge']);
    expect(parsed.statements.filter((item) => item.kind === 'edge').map((item) => item.id?.value))
      .toEqual(['retained', 'after']);
  });
  it('uses the public zero-based UTF-16 column contract for tokens and diagnostics', () => {
    const source = 'a service as "😀"\r\n  b service\r\n  a ->';
    const parsed = parseCandidate028(source);
    const node = parsed.statements.find((item) => item.kind === 'node' && item.id.value === 'b');
    expect(node?.id.range.start).toEqual({ line: 2, column: 2,
      offset: source.indexOf('b service') });
    const error = parsed.diagnostics.find((item) => item.code === 'coral.syntax.edge.invalid');
    expect(error?.position).toEqual({ line: 3, column: 4,
      offset: source.lastIndexOf('a ->') + 2 });
    expect(error?.range?.start.column).toBe(4);
    expect(error?.range?.start.offset).toBe(source.lastIndexOf('->'));
  });
  it('reports invalid Unicode separators exactly and preserves quoted Unicode and neighboring declarations', () => {
    const source = 'first service as "First\u00a0label"\nsecond\u00a0service\nthird service';
    const result = parseCandidate028(source);
    const spacing = result.diagnostics.filter((item) => item.code === 'coral.syntax.spacing.invalid');

    expect(spacing).toHaveLength(1);
    expect(source.slice(spacing[0].range!.start.offset, spacing[0].range!.end.offset)).toBe('\u00a0');
    expect(result.graph.nodes.map((node) => node.id)).toEqual(['first', 'third']);
    expect(result.graph.nodes[0].label).toBe('First\u00a0label');
  });

  it.each(['\u200b', '\u2060', '\ufeff'])('treats invisible separator %s as spacing, not an unknown token', (separator) => {
    const source = `first service as "First${separator}label"\nsecond${separator}service\nthird service`;
    const result = parseCandidate028(source);
    const spacing = result.diagnostics.filter((item) => item.code === 'coral.syntax.spacing.invalid');
    expect(spacing).toHaveLength(1);
    expect(source.slice(spacing[0]!.range!.start.offset, spacing[0]!.range!.end.offset)).toBe(separator);
    expect(result.diagnostics.some((item) => item.code === 'coral.syntax.token.invalid')).toBe(false);
    expect(result.graph.nodes.map((node) => node.id)).toEqual(['first', 'third']);
    expect(result.graph.nodes[0]?.label).toBe(`First${separator}label`);
  });

  it.each(['\u{E0001}', '\u{E0100}'])('diagnoses supplementary invisible separator %s as one spacing span', (separator) => {
    const source = `first service as "First${separator}label"\nsecond${separator}service\nthird service`;
    const result = parseCandidate028(source);
    const spacing = result.diagnostics.filter((item) => item.code === 'coral.syntax.spacing.invalid');
    expect(spacing).toHaveLength(1);
    expect(source.slice(spacing[0]!.range!.start.offset, spacing[0]!.range!.end.offset)).toBe(separator);
    expect(spacing[0]!.range!.end.column - spacing[0]!.range!.start.column).toBe(2);
    expect(result.diagnostics.some((item) => item.code === 'coral.syntax.token.invalid')).toBe(false);
    expect(result.graph.nodes.map((node) => node.id)).toEqual(['first', 'third']);
    expect(result.graph.nodes[0]?.label).toBe(`First${separator}label`);
  });

  it.each([
    ['node', 'bad\u202fservice\ngood service', 'good'],
    ['edge', 'a service\nz service\na\u200b-> z\ngood service', 'good'],
    ['connector bracket', 'a service\nz service\na -> z [type:\u00a0flow]\ngood service', 'good'],
    ['arrangement', 'a service\nz service\narrange\u2060row: a, z\ngood service', 'good'],
    ['UML member', 'Order class {\n  attributes {\n    + id:\u{E0001}String\n  }\n}\ngood service', 'good'],
  ] as const)('uses one exact Unicode-spacing diagnostic in the %s scanner and recovers',
    (_name, source, recoveredId) => {
      const parsed = parseCandidate028(source, { profile: 'uml-class' });
      const invalid = /[\u202f\u200b\u00a0\u2060]|\u{E0001}/u.exec(source)![0];
      const spacing = parsed.diagnostics.filter((item) => item.code === 'coral.syntax.spacing.invalid');
      expect(spacing, source).toHaveLength(1);
      expect(source.slice(spacing[0]!.range!.start.offset, spacing[0]!.range!.end.offset)).toBe(invalid);
      expect(parsed.graph.nodes.map((node) => node.id)).toContain(recoveredId);
    });

  it('does not promote children of a Unicode-rejected block into root nodes', () => {
    const source = 'broken\u2060group {\n  hidden service\n}\nvisible service';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.spacing.invalid',
      range: expect.objectContaining({ start: expect.objectContaining({ line: 1, column: 6 }) }),
    }));
    expect(parsed.graph.nodes.map((node) => node.id)).toEqual(['visible']);
  });

  it('recovers the enclosing scope after a Unicode-rejected closing brace', () => {
    const source = 'engineering group {\n  inside service\n}\u2060\noutside service';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['coral.syntax.spacing.invalid']);
    expect(parsed.graph.nodes).toMatchObject([
      { id: 'engineering', children: [{ id: 'engineering.inside', parent: 'engineering' }] },
      { id: 'outside' },
    ]);
  });

  it('ignores quoted and commented braces while recovering a rejected line', () => {
    const parsed = parseCandidate028('bad\u2060service as "{" // }\nvisible service');
    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['coral.syntax.spacing.invalid']);
    expect(parsed.graph.nodes.map((node) => node.id)).toEqual(['visible']);
  });

  it('parses ID-first and assigned node declarations without changing identity', () => {
    const result = parseCandidate028('apiGateway service as "API gateway"\nauditSink = service');
    expect(result.diagnostics).toEqual([]);
    expect(result.graph.nodes).toMatchObject([
      { id: 'apiGateway', type: 'service', label: 'API gateway' },
      { id: 'auditSink', type: 'service', label: 'auditSink' },
    ]);
  });

  it('uses keyed node brackets for explicit catalog symbol and variant before the quoted label', () => {
    const source = 'api service [symbol: "arch-service", variant: "gateway"] as "API"\n' +
      'db = database [symbol: "arch-database"]';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.nodes).toMatchObject([
      { id: 'api', type: 'service', symbol: 'arch-service', variant: 'gateway', label: 'API' },
      { id: 'db', type: 'database', symbol: 'arch-database', label: 'db' },
    ]);
    expect(parsed.statements.filter((item) => item.kind === 'node')).toMatchObject([
      { symbol: { raw: '"arch-service"' }, variant: { raw: '"gateway"' } },
      { symbol: { raw: '"arch-database"' } },
    ]);
  });

  it('keeps a node-local conformance exception bound to an exact quoted symbol value', () => {
    const parsed = parseCandidate028('api process [symbol: "arch-service", conformanceException: "arch-service"]');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.statements.filter((item) => item.kind === 'node')).toMatchObject([
      { id: { value: 'api' }, symbol: { value: 'arch-service' },
        conformanceException: { value: 'arch-service' } },
    ]);
    expect(parsed.graph.nodes[0]).not.toHaveProperty('conformanceException');
  });

  it('rejects an unbound boolean or repeated conformance exception field', () => {
    const parsed = parseCandidate028('a process [symbol: "arch-service", conformanceException: true]\n' +
      'b process [conformanceException: "arch-service", symbol: "arch-service", conformanceException: "arch-service"]');
    expect(parsed.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'coral.syntax.node.field.quoted-required',
      'coral.syntax.node.conformance-exception.duplicate',
    ]));
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.node.field.quoted-required',
      message: 'conformanceException requires a quoted, exact symbol ID',
    }));
  });

  it('diagnoses duplicate, unknown, and unquoted node bracket fields without dropping a neighboring node', () => {
    const source = 'a service [symbol: "arch-service", symbol: "arch-database"]\n' +
      'b service [variant: gateway]\n' +
      'c service [style: "compact"]\n' +
      'good service';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'coral.syntax.node.symbol.duplicate',
      'coral.syntax.node.field.quoted-required',
      'coral.syntax.node.field.unknown',
    ]));
    expect(parsed.graph.nodes.map((node) => node.id)).toEqual(['good']);
  });

  it('keeps node-local port declarations and explicit anchor spelling in the source syntax', () => {
    const parsed = parseCandidate028('api service {\n  outbound port [direction: out, anchor: side]\n  audit port [direction: out, anchor: auto]\n}\ndb database');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.nodes.map((node) => node.id)).toEqual(['api', 'db']);
    expect(parsed.graph.nodes[0]).not.toHaveProperty('ports');
    expect(parsed.statements.filter((item) => item.kind === 'port')).toMatchObject([
      { owner: { value: 'api' }, id: { value: 'outbound' }, direction: { value: 'out' },
        anchor: { value: 'side' } },
      { owner: { value: 'api' }, id: { value: 'audit' }, direction: { value: 'out' },
        anchor: { value: 'auto' } },
    ]);
  });

  it('rejects duplicate port fields and duplicate port IDs without promoting children', () => {
    const source = 'api service {\n  send port [direction: out, direction: in]\n  send port [direction: out]\n  send port [direction: out]\n}\ndb database';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.syntax.port.direction.duplicate');
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.identity.port.duplicate');
    expect(parsed.graph.nodes.map((node) => node.id)).toEqual(['api', 'db']);
  });

  it('locates complete later and first port assignments even when the first value is invalid', () => {
    const source = 'api service {\n' +
      '  send port [direction: sideways, direction: out, anchor: side, anchor: corner]\n}';
    const parsed = parseCandidate028(source);
    for (const [code, first, later] of [
      ['coral.syntax.port.direction.duplicate', 'direction: sideways', 'direction: out'],
      ['coral.syntax.port.anchor.duplicate', 'anchor: side', 'anchor: corner'],
    ]) {
      const diagnostic = parsed.diagnostics.find((item) => item.code === code);
      expect(diagnostic?.range).toMatchObject({
        start: { offset: source.indexOf(later) },
        end: { offset: source.indexOf(later) + later.length },
      });
      expect(diagnostic?.related?.[0]?.range).toMatchObject({
        start: { offset: source.indexOf(first) },
        end: { offset: source.indexOf(first) + first.length },
      });
    }
    expect(parsed.diagnostics.map((item) => item.code))
      .toContain('coral.syntax.port.direction.invalid');
  });

  it('uses the same port declaration syntax inside groups and UML classes', () => {
    const grouped = parseCandidate028('team group {\n  link port [direction: inout]\n  api service {\n    send port [direction: out]\n  }\n}');
    expect(grouped.diagnostics).toEqual([]);
    expect(grouped.statements.filter((item) => item.kind === 'port')).toMatchObject([
      { owner: { value: 'team' }, id: { value: 'link' } },
      { owner: { value: 'api' }, id: { value: 'send' } },
    ]);
    expect(grouped.graph.nodes).toMatchObject([{ id: 'team', children: [{ id: 'team.api' }] }]);
    const uml = parseCandidate028('Order class {\n  access port [direction: in, anchor: N]\n  attributes {\n    + id: String\n  }\n}', { profile: 'uml-class' });
    expect(uml.diagnostics).toEqual([]);
    expect(uml.statements.filter((item) => item.kind === 'port')).toMatchObject([
      { owner: { value: 'Order' }, id: { value: 'access' }, anchor: { value: 'N' } },
    ]);
  });

  it('keeps port brackets keyed regardless of field order and rejects missing direction', () => {
    const source = 'api service {\n  audit port [anchor: side, direction: out]\n}';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.statements.filter((item) => item.kind === 'port')).toMatchObject([
      { id: { value: 'audit' }, direction: { value: 'out' }, anchor: { value: 'side' } },
    ]);
    const missing = parseCandidate028('api service {\n  audit port [anchor: side]\n}\nstore database');
    expect(missing.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.port.direction.required',
      range: expect.objectContaining({ start: expect.objectContaining({ line: 2 }) }),
    }));
    expect(missing.graph.nodes.map((node) => node.id)).toEqual(['api', 'store']);
  });

  it('carries an injected profile through the portable graph in isolated tests', () => {
    const parsed = parseCandidate028('apiGateway service', { profile: 'architecture' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.metadata?.notation).toBe('architecture');
  });

  it('parses ID-first nested groups with qualified node identities', () => {
    const source = [
      'engineering group as "Engineering" {',
      '  delivery group {',
      '    lead position as "Lead"',
      '    developer position',
      '  }',
      '}',
      'engineering.delivery.developer -> engineering.delivery.lead [reports_to]',
    ].join('\n');
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.nodes).toMatchObject([{ id: 'engineering', type: 'group', label: 'Engineering',
      children: [{ id: 'engineering.delivery', type: 'group', parent: 'engineering', children: [
        { id: 'engineering.delivery.lead', type: 'position', label: 'Lead', parent: 'engineering.delivery' },
        { id: 'engineering.delivery.developer', type: 'position', label: 'engineering.delivery.developer', parent: 'engineering.delivery' },
      ] }],
    }]);
    expect(parsed.graph.edges).toMatchObject([{ source: 'engineering.delivery.developer',
      target: 'engineering.delivery.lead', type: 'reports_to' }]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
  });

  it('parses the approved named UML class compartment and member into portable classifier structure', () => {
    const source = 'Order class {\n  fields = attributes {\n    orderId = public attribute id: String\n  }\n}';
    const parsed = parseCandidate028(source, { profile: 'uml-class' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.profile).toEqual({ id: 'uml', kind: 'class', version: '1.0.0' });
    expect(parsed.graph.nodes[0]).toMatchObject({ id: 'Order', type: 'class', label: 'Order',
      classifier: { kind: 'class', name: 'Order', compartments: [
        { id: 'name', kind: 'name' },
        { id: 'fields', kind: 'attributes', items: [{ id: 'orderId', kind: 'attribute',
          visibility: 'public', name: 'id', type: 'String' }] },
      ] } });
    expect(validateIR(parsed.graph).errors).toEqual([]);
  });

  it.each(['public', 'private', 'protected', 'package'])(
    'projects a named %s UML attribute without changing its visibility', (visibility) => {
      const source = `Order class {\n  attributes {\n` +
        `    orderId = ${visibility} attribute id: UUID\n  }\n}`;
      const parsed = parseCandidate028(source, { profile: 'uml-class' });
      expect(parsed.diagnostics).toEqual([]);
      expect(parsed.graph.nodes[0]?.classifier?.compartments[1]).toMatchObject({
        kind: 'attributes', items: [{ id: 'orderId', kind: 'attribute', visibility, name: 'id', type: 'UUID' }],
      });
      expect(validateIR(parsed.graph).errors).toEqual([]);
    },
  );

  it('allows independently unnamed compartments and compact unnamed UML members', () => {
    const sources = [
      'Order class {\n  attributes {\n    + id: String\n  }\n}',
      'Order class {\n  attributes {\n    orderId = public attribute id: String\n  }\n}',
      'Order class {\n  fields = attributes {\n    + id: String\n  }\n}',
    ];
    for (const source of sources) {
      const parsed = parseCandidate028(source, { profile: 'uml-class' });
      expect(parsed.diagnostics, source).toEqual([]);
      const classifier = parsed.graph.nodes[0]?.classifier;
      expect(classifier?.compartments[1]).toMatchObject({ kind: 'attributes',
        items: [{ kind: 'attribute', visibility: 'public', name: 'id', type: 'String' }] });
      expect(validateIR(parsed.graph).errors, source).toEqual([]);
    }
  });

  it('keeps both approved UML operation forms and typed signatures in one classifier', () => {
    const source = 'Order class {\n  actions = operations {\n' +
      '    saveOp = public operation save(id: String): Boolean\n' +
      '    + load()\n    - reset()\n    # inspect()\n    ~ refresh()\n  }\n}';
    const parsed = parseCandidate028(source, { profile: 'uml-class' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.nodes[0]?.classifier?.compartments[1]).toMatchObject({
      id: 'actions', kind: 'operations', items: [
        { id: 'saveOp', kind: 'operation', visibility: 'public', name: 'save',
          parameters: [{ name: 'id', type: 'String' }], returnType: 'Boolean' },
        { kind: 'operation', visibility: 'public', name: 'load', parameters: [] },
        { kind: 'operation', visibility: 'private', name: 'reset', parameters: [] },
        { kind: 'operation', visibility: 'protected', name: 'inspect', parameters: [] },
        { kind: 'operation', visibility: 'package', name: 'refresh', parameters: [] },
      ],
    });
    expect(validateIR(parsed.graph).errors).toEqual([]);
    expect(source).toContain('saveOp = public operation save(id: String): Boolean');
  });

  it('keeps interface operations as classifier members', () => {
    const source = 'Repository interface {\n  operations {\n' +
      '    saveOp = public operation save(order: Order): Void\n  }\n}';
    const parsed = parseCandidate028(source, { profile: 'uml-class' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.nodes[0]?.classifier).toMatchObject({
      kind: 'interface', compartments: [
        { kind: 'name' },
        { kind: 'operations', items: [{ id: 'saveOp', kind: 'operation', name: 'save' }] },
      ],
    });
  });

  it('rejects named symbolic operations and malformed signatures without losing later members', () => {
    const source = 'Order class {\n  operations {\n' +
      '    bad = + save()\n    + broken(id:)\n    + good()\n  }\n}';
    const parsed = parseCandidate028(source, { profile: 'uml-class' });
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.uml.member.named-symbolic-unsupported');
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.uml.operation.parameter.invalid');
    expect(parsed.graph.nodes[0]?.classifier?.compartments[1]).toMatchObject({
      kind: 'operations', items: [{ name: 'good' }],
    });
    expect(source).toContain('bad = + save()');
  });

  it('diagnoses a UML member ID reused across attribute and operation compartments', () => {
    const source = 'Order class {\n  attributes {\n' +
      '    shared = public attribute id: String\n  }\n' +
      '  operations {\n    shared = public operation save()\n  }\n}';
    const parsed = parseCandidate028(source, { profile: 'uml-class' });
    const duplicate = parsed.diagnostics.find((item) => item.code === 'coral.uml.member.id.duplicate');
    expect(duplicate?.range?.start.line).toBe(6);
    expect(duplicate?.related?.[0]?.range?.start.line).toBe(3);
    expect(parsed.graph.nodes[0]?.classifier?.compartments[2]).toMatchObject({
      kind: 'operations', items: [],
    });
  });

  it('accepts an inline empty UML attribute compartment', () => {
    const parsed = parseCandidate028('Order class {\n  attributes {}\n  fields = attributes {}\n}',
      { profile: 'uml-class' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.nodes[0]?.classifier?.compartments).toMatchObject([
      { kind: 'name' }, { kind: 'attributes', items: [] },
      { id: 'fields', kind: 'attributes', items: [] },
    ]);
  });

  it('keeps UML member identity local to a canonically qualified class owner', () => {
    const source = [
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
    ].join('\n');
    const parsed = parseCandidate028(source, { profile: 'uml-class' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.nodes.map((group) => group.children?.[0]?.id))
      .toEqual(['left.Order', 'right.Order']);
    for (const group of parsed.graph.nodes) {
      expect(group.children?.[0]?.classifier?.compartments[1]).toMatchObject({
        id: 'fields', kind: 'attributes', items: [{
          id: 'orderId', kind: 'attribute', visibility: 'public',
          name: 'id', type: 'String',
        }],
      });
    }
  });

  it('keeps generated UML member ordinals local despite an explicit ID in another group', () => {
    const source = [
      'left group {',
      '  Order class {',
      '    attributes {',
      '      attribute_1 = public attribute id: String',
      '    }',
      '  }',
      '}',
      'right group {',
      '  Order class {',
      '    attributes {',
      '      + total: Number',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const parsed = parseCandidate028(source, { profile: 'uml-class' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.nodes[1]?.children?.[0]?.classifier?.compartments[1])
      .toMatchObject({ items: [{ id: 'attribute_1', name: 'total' }] });
  });

  it('still locates a duplicate member across compartments of one grouped class', () => {
    const source = [
      'team group {',
      '  Order class {',
      '    first = attributes {',
      '      orderId = public attribute id: String',
      '    }',
      '    second = attributes {',
      '      orderId = public attribute other: String',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const parsed = parseCandidate028(source, { profile: 'uml-class' });
    const duplicate = parsed.diagnostics.filter((item) =>
      item.code === 'coral.uml.member.id.duplicate');
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0]?.range?.start.offset).toBe(source.indexOf('orderId =', source.indexOf('second =')));
    expect(duplicate[0]?.related?.[0]?.range?.start.offset).toBe(source.indexOf('orderId ='));
    expect(parsed.graph.nodes[0]?.children?.[0]?.classifier?.compartments[2])
      .toMatchObject({ items: [] });
  });

  it('rejects duplicate UML identities and the unapproved named symbolic member form', () => {
    const source = 'Order class {\n  fields = attributes {\n    orderId = public attribute id: String\n    orderId = public attribute other: String\n    second = + other: String\n  }\n}';
    const parsed = parseCandidate028(source, { profile: 'uml-class' });
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.uml.member.id.duplicate');
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.uml.member.named-symbolic-unsupported');
    const duplicate = parsed.diagnostics.find((item) => item.code === 'coral.uml.member.id.duplicate');
    expect(duplicate?.related?.[0]?.range?.start.offset).toBe(source.indexOf('orderId ='));
  });

  it('does not graft a duplicate class body onto the first classifier', () => {
    const source = 'Order class {\n  attributes {\n    + id: String\n  }\n}\nOrder class {\n  fields = attributes {\n    other = public attribute other: Number\n  }\n}';
    const parsed = parseCandidate028(source, { profile: 'uml-class' });
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.identity.node.duplicate');
    expect(parsed.graph.nodes).toHaveLength(1);
    expect(parsed.graph.nodes[0]?.classifier?.compartments).toHaveLength(2);
    expect(parsed.graph.nodes[0]?.classifier?.compartments[1]).toMatchObject({ kind: 'attributes',
      items: [{ name: 'id', type: 'String' }] });
  });

  it('keeps generated unnamed-member IDs distinct from explicit member IDs', () => {
    const source = 'Order class {\n  attributes {\n    attribute_1 = public attribute first: String\n    + second: String\n  }\n}';
    const parsed = parseCandidate028(source, { profile: 'uml-class' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.nodes[0]?.classifier?.compartments[1]).toMatchObject({ kind: 'attributes',
      items: [{ id: 'attribute_1', name: 'first' }, { id: 'attribute_2', name: 'second' }] });
    expect(validateIR(parsed.graph).errors).toEqual([]);
  });

  it('projects named and unnamed arrangement statements into typed portable constraints', () => {
    const source = 'api service\nworker service\norders database\nserviceRow = arrange row: api, worker, orders\narrange column: orders, api';
    const parsed = parseCandidate028(source, { profile: 'architecture' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.constraints).toMatchObject([
      { id: 'serviceRow', kind: 'arrangement', axis: 'row', subjects: [
        { kind: 'node', nodeId: 'api' }, { kind: 'node', nodeId: 'worker' }, { kind: 'node', nodeId: 'orders' },
      ] },
      { id: expect.any(String), kind: 'arrangement', axis: 'column', subjects: [
        { kind: 'node', nodeId: 'orders' }, { kind: 'node', nodeId: 'api' },
      ] },
    ]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
  });

  it('reports arrangement duplicate identities, repeated subjects, and unresolved references', () => {
    const source = 'api service\nworker service\nrow = arrange row: api, worker\nrow = arrange row: api, missing\narrange column: api, api';
    const parsed = parseCandidate028(source, { profile: 'architecture' });
    expect(parsed.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'coral.identity.arrangement.duplicate',
      'coral.reference.arrangement.unresolved',
      'coral.reference.arrangement.duplicate-subject',
    ]));
    expect(parsed.graph.constraints).toHaveLength(1);
    expect(parsed.diagnostics.find((item) => item.code === 'coral.identity.arrangement.duplicate')
      ?.related?.[0]?.range?.start.offset).toBe(source.indexOf('row ='));
  });

  it('does not reserve arrange as a node ID outside the arrangement statement form', () => {
    const node = parseCandidate028('arrange service');
    expect(node.diagnostics).toEqual([]);
    expect(node.graph.nodes[0]).toMatchObject({ id: 'arrange', type: 'service' });
    expect(parseCandidate028('arrange row api, worker').diagnostics.map((item) => item.code))
      .toContain('coral.syntax.arrangement.axis');
  });

  it('retains arrangement source tokens, explicit identity, and stable generated identity', () => {
    const source = 'a service\nb service\nc service\narrange row: a, b\narrangement_1 = arrange column: b, c';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    const arrangements = parsed.statements.filter((item) => item.kind === 'arrangement');
    expect(arrangements).toHaveLength(2);
    expect(arrangements[0]).not.toHaveProperty('id');
    expect(arrangements[0]).not.toHaveProperty('assignment');
    expect(arrangements[0]).toMatchObject({ axis: { raw: 'row' },
      subjects: [{ raw: 'a' }, { raw: 'b' }] });
    expect(arrangements[1]).toMatchObject({ id: { raw: 'arrangement_1' },
      assignment: { raw: '=' }, axis: { raw: 'column' } });
    expect(arrangements[1]?.id?.range.start.offset).toBe(source.indexOf('arrangement_1'));
    expect(parsed.graph.constraints?.map((constraint) => constraint.id)).toEqual([
      'arrangement_2', 'arrangement_1',
    ]);
    expect(source).toContain('arrange row: a, b');
  });

  it('rejects malformed arrangement boundaries without inventing a constraint', () => {
    const cases = [
      ['arrange row:', 'coral.syntax.arrangement.subject-count'],
      ['arrange row: a', 'coral.syntax.arrangement.subject-count'],
      ['arrange row: a, b,', 'coral.syntax.arrangement.trailing-comma'],
      ['arrange row: a,, b', 'coral.syntax.arrangement.subject'],
      ['arrange row: a b', 'coral.syntax.arrangement.comma-required'],
      ['arrange row: a, b as row', 'coral.syntax.arrangement.comma-required'],
    ] as const;
    for (const [statement, code] of cases) {
      const parsed = parseCandidate028(`a service\nb service\n${statement}`);
      expect(parsed.diagnostics.map((item) => item.code), statement).toContain(code);
      expect(parsed.graph.constraints, statement).toBeUndefined();
    }
  });

  it('reports unclosed class and compartment scopes without changing authored text', () => {
    const source = 'Order class {\n  attributes {\n    + id: String';
    const parsed = parseCandidate028(source, { profile: 'uml-class' });
    expect(parsed.diagnostics.map((item) => item.code)).toEqual([
      'coral.uml.class.unclosed', 'coral.uml.compartment.unclosed',
    ]);
    expect(parsed.graph.nodes[0]?.classifier?.compartments[1]).toMatchObject({ kind: 'attributes',
      items: [{ name: 'id', type: 'String' }] });
    expect(source).toBe('Order class {\n  attributes {\n    + id: String');
  });

  it('recovers after an extra group close without losing neighboring declarations', () => {
    const source = 'team group {\n  lead position\n}\nrootLead position\n}\nafter position';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.syntax.group.unexpected-close');
    expect(parsed.graph.nodes.map((node) => node.id)).toEqual(['team', 'rootLead', 'after']);
  });

  it('gives same-spelled children distinct group-qualified IDs and resolves qualified references', () => {
    const source = 'sales group {\n  person service\n}\n' +
      'ops group {\n  person service\n}\n' +
      'sales.person -> ops.person';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.nodes).toMatchObject([
      { id: 'sales', children: [{ id: 'sales.person', parent: 'sales' }] },
      { id: 'ops', children: [{ id: 'ops.person', parent: 'ops' }] },
    ]);
    expect(parsed.graph.edges).toMatchObject([
      { source: 'sales.person', target: 'ops.person' },
    ]);
  });

  it('qualifies named edges and arrangements by their containing group without changing source names', () => {
    const source = 'sales group {\n  a service\n  b service\n' +
      '  route = a -> b\n  lane = arrange row: a, b\n}\n' +
      'ops group {\n  a service\n  b service\n' +
      '  route = a -> b\n  lane = arrange column: a, b\n}';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.statements.filter((item) => item.kind === 'edge' || item.kind === 'arrangement')
      .map((item) => item.id?.raw)).toEqual(['route', 'lane', 'route', 'lane']);
    expect(parsed.graph.edges.map(({ id, source, target }) => [id, source, target])).toEqual([
      ['sales.route', 'sales.a', 'sales.b'], ['ops.route', 'ops.a', 'ops.b'],
    ]);
    expect(parsed.graph.constraints).toMatchObject([
      { id: 'sales.lane', axis: 'row', subjects: [
        { nodeId: 'sales.a' }, { nodeId: 'sales.b' },
      ] },
      { id: 'ops.lane', axis: 'column', subjects: [
        { nodeId: 'ops.a' }, { nodeId: 'ops.b' },
      ] },
    ]);
  });

  it('locates genuinely repeated named edges and arrangements within one group', () => {
    const source = 'team group {\n  a service\n  b service\n' +
      '  route = a -> b\n  route = b -> a\n' +
      '  lane = arrange row: a, b\n  lane = arrange column: b, a\n}';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map(({ code }) => code)).toEqual([
      'coral.identity.edge.duplicate', 'coral.identity.arrangement.duplicate',
    ]);
    expect(parsed.diagnostics[0]?.range?.start.offset).toBe(source.indexOf('route =', source.indexOf('route =') + 1));
    expect(parsed.diagnostics[1]?.range?.start.offset).toBe(source.indexOf('lane =', source.indexOf('lane =') + 1));
    expect(parsed.graph.edges.map(({ id }) => id)).toEqual(['team.route']);
    expect(parsed.graph.constraints?.map(({ id }) => id)).toEqual(['team.lane']);
  });

  it('resolves bare references within their group without rewriting source tokens', () => {
    const source = 'left group {\n  item service as "Left"\n  sink service as "Sink"\n' +
      '  item -> sink\n}\nright group {\n  item service as "Right"\n}\n' +
      'left.item -> right.item';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ['left.item', 'left.sink'], ['left.item', 'right.item'],
    ]);
    expect(parsed.statements.filter((item) => item.kind === 'edge').map((item) => item.source.raw))
      .toEqual(['item', 'left.item']);
  });

  it('keeps duplicate and unresolved group references local to their actual IDs', () => {
    const source = 'left group {\n  item service\n  item service\n}\n' +
      'right group {\n  item service\n}\nitem -> right.item';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((finding) => finding.code)).toEqual([
      'coral.identity.node.duplicate', 'coral.reference.source.unresolved',
    ]);
    expect(parsed.diagnostics[0]?.message).toBe('Duplicate node ID: left.item');
    expect(parsed.graph.nodes[1]?.children?.[0]?.id).toBe('right.item');
    expect(parsed.graph.edges).toEqual([]);
  });

  it('rejects a qualified declaration without reinterpreting it as nested ownership', () => {
    const source = 'team group {\n  team.item service\n  real service\n}';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((finding) => finding.code)).toEqual(['coral.syntax.node.id-qualified']);
    expect(parsed.graph.nodes[0]?.children?.map((node) => node.id)).toEqual(['team.real']);
  });

  it('reports an unclosed group at its opening brace without dropping parsed children', () => {
    const source = 'team group {\n  lead position';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.syntax.group.unclosed');
    expect(parsed.graph.nodes[0]?.children?.[0]).toMatchObject({ id: 'team.lead', parent: 'team' });
  });

  it('retains the exact closing token for each nested group scope', () => {
    const source = 'outer group {\n  inner group {\n    member service\n  }\n}\n';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    const outer = parsed.statements.find((item) => item.kind === 'node' && item.id.value === 'outer');
    const inner = parsed.statements.find((item) => item.kind === 'node' && item.id.value === 'inner');
    expect(outer?.kind === 'node' ? outer.blockClose?.range.start.offset : undefined)
      .toBe(source.lastIndexOf('}'));
    expect(inner?.kind === 'node' ? inner.blockClose?.range.start.offset : undefined)
      .toBe(source.indexOf('  }') + 2);
  });

  it('does not graft a duplicate group declaration onto the first group', () => {
    const source = 'team group {\n}\nteam group {\n  ghost position\n}';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.identity.node.duplicate');
    expect(parsed.graph.nodes[0]?.children).toBeUndefined();
    expect(parsed.graph.nodes.some((node) => node.id === 'ghost')).toBe(false);
  });

  it('allows a compact empty group without leaving an open scope', () => {
    const parsed = parseCandidate028('engineering group as "Engineering" {}\nafter service');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.nodes).toMatchObject([
      { id: 'engineering', type: 'group', label: 'Engineering' },
      { id: 'after', type: 'service' },
    ]);
    expect(parsed.graph.nodes[0]?.children).toBeUndefined();
  });

  it('adds a group label without rewriting its block or its child', () => {
    const source = 'team group {  // keep this comment\n  member service\n}';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    const edited = setCandidateLabel(source, parsed.statements[0]!, 'My team');
    expect(edited).toBe('team group as "My team" {  // keep this comment\n  member service\n}');
    const reparsed = parseCandidate028(edited);
    expect(reparsed.diagnostics).toEqual([]);
    expect(reparsed.graph.nodes[0]).toMatchObject({ id: 'team', label: 'My team',
      children: [{ id: 'team.member', parent: 'team' }] });
  });

  it('parses a named edge with separate type and rendered label', () => {
    const result = parseCandidate028('review decision\napprove process\nyesPath = review -> approve [flow] as "Yes"');
    expect(result.diagnostics).toEqual([]);
    expect(result.graph.edges[0]).toMatchObject({
      id: 'yesPath', source: 'review', target: 'approve', type: 'flow', label: 'Yes',
    });
  });

  it('locates both declarations when node or named-edge identity is duplicated', () => {
    const source = 'api service\napi database\naudit service\ncall = api -> audit\ncall = audit -> api';
    const result = parseCandidate028(source);
    const node = result.diagnostics.find((item) => item.code === 'coral.identity.node.duplicate');
    const edge = result.diagnostics.find((item) => item.code === 'coral.identity.edge.duplicate');
    expect(node?.range?.start.offset).toBe(source.indexOf('api database'));
    expect(node?.related?.[0]?.range?.start.offset).toBe(source.indexOf('api service'));
    expect(edge?.range?.start.offset).toBe(source.lastIndexOf('call ='));
    expect(edge?.related?.[0]?.range?.start.offset).toBe(source.indexOf('call ='));
  });

  it('keeps textual endpoint order while placing a reverse arrow at the first end', () => {
    const result = parseCandidate028('a service\nz service\na <- z');
    expect(result.diagnostics).toEqual([]);
    expect(result.graph.edges[0]).toMatchObject({
      source: 'a', target: 'z',
      sourceEnd: { marker: { kind: 'arrow', fill: 'open' } },
      targetEnd: { marker: { kind: 'none', fill: 'unspecified' } },
    });
    const edge = result.statements[2];
    expect(edge?.kind).toBe('edge');
    if (edge?.kind === 'edge') expect(edge.operator.raw).toBe('<-');
  });

  it('accepts one through six dashes for reverse and two-headed solid connectors', () => {
    for (const count of [1, 2, 3, 4, 5, 6] as const) {
      for (const twoHeaded of [false, true]) {
        const operator = `<${'-'.repeat(count)}${twoHeaded ? '>' : ''}`;
        const result = parseCandidate028(`a service\nz service\na ${operator} z`);
        expect(result.diagnostics, operator).toEqual([]);
        expect(result.graph.edges[0], operator).toMatchObject({
          source: 'a', target: 'z',
          sourceEnd: { marker: { kind: 'arrow', fill: 'open' } },
          targetEnd: { marker: { kind: twoHeaded ? 'arrow' : 'none' } },
        });
        const edge = result.statements[2];
        expect(edge?.kind, operator).toBe('edge');
        if (edge?.kind === 'edge') {
          expect(edge.operator.raw, operator).toBe(operator);
          expect(edge.connector?.dashCount, operator).toBe(count);
        }
      }
    }
    for (const operator of ['<-------', '<------->']) {
      const result = parseCandidate028(`a service\nz service\na ${operator} z`);
      expect(result.diagnostics, operator).toContainEqual(expect.objectContaining({
        code: 'coral.syntax.connector.invalid',
      }));
      expect(result.graph.edges, operator).toEqual([]);
    }
  });

  it('counts up to six shaft positions, including a second-position dot, without changing endpoints', () => {
    const source = 'a service\nb service\n' +
      'a ------> b\na -.----> b\na <------ b\na <------> b\n';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    const edges = parsed.statements.filter((item) => item.kind === 'edge');
    expect(edges.map((edge) => edge.kind === 'edge' ? edge.operator.raw : '')).toEqual([
      '------>', '-.---->', '<------', '<------>',
    ]);
    expect(edges.map((edge) => edge.kind === 'edge' ? edge.connector?.dashCount : undefined))
      .toEqual([6, 6, 6, 6]);
    expect(edges.map((edge) => edge.kind === 'edge' ? edge.connector?.stroke : undefined))
      .toEqual(['solid', 'dashed', 'solid', 'solid']);
    expect(parsed.graph.edges.map((edge) => [edge.source, edge.target]))
      .toEqual([['a', 'b'], ['a', 'b'], ['a', 'b'], ['a', 'b']]);

    const seven = parseCandidate028('a service\nb service\na -.-----> b');
    expect(seven.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.connector.dash-count',
      range: expect.objectContaining({ start: expect.objectContaining({ line: 3, column: 2 }),
        end: expect.objectContaining({ line: 3, column: 9 }) }),
    }));
    expect(seven.graph.edges).toEqual([]);
    const shiftedDot = parseCandidate028('a service\nb service\na --.---> b');
    expect(shiftedDot.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.connector.dot-position',
      range: expect.objectContaining({ start: expect.objectContaining({ line: 3, column: 4 }),
        end: expect.objectContaining({ line: 3, column: 5 }) }),
    }));
    expect(shiftedDot.graph.edges).toEqual([]);
  });

  it('projects neutral, bidirectional, circle, and dashed-neutral connector art without changing endpoint order', () => {
    const source = 'a service\nz service\na -- z\na <-> z\na --o z\na -.- z';
    const result = parseCandidate028(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ['a', 'z'], ['a', 'z'], ['a', 'z'], ['a', 'z'],
    ]);
    expect(result.graph.edges.map((edge) => [edge.sourceEnd?.marker?.kind, edge.targetEnd?.marker?.kind]))
      .toEqual([['none', 'none'], ['arrow', 'arrow'], ['none', 'circle'], ['none', 'none']]);
    expect(result.graph.edges[3].style?.lineStyle).toBe('dashed');
  });

  it('retains which connector ends were authored, independently of normalized no-mark ends', () => {
    const source = 'a service\nz service\na -> z\na <- z\na -- z\na <-> z\na -.-> z';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.statements.filter((item) => item.kind === 'edge').map((item) => item.connector)).toEqual([
      expect.objectContaining({ firstEndAuthored: false, secondEndAuthored: true }),
      expect.objectContaining({ firstEndAuthored: true, secondEndAuthored: false }),
      expect.objectContaining({ firstEndAuthored: true, secondEndAuthored: true }),
      expect.objectContaining({ firstEndAuthored: true, secondEndAuthored: true }),
      expect.objectContaining({ firstEndAuthored: false, secondEndAuthored: true }),
    ]);
  });

  it('lets keyed ends fill an unspecified side but rejects a competing shortform marker', () => {
    const source = 'a service\nz service\na -> z [firstEnd: diamond]';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.edges[0]).toMatchObject({
      sourceEnd: { marker: { kind: 'diamond', fill: 'open' } },
      targetEnd: { marker: { kind: 'arrow', fill: 'open' } },
    });
    const conflict = source.replace('firstEnd', 'secondEnd');
    const rejected = parseCandidate028(conflict);
    expect(rejected.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.connector.end-conflict',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: conflict.indexOf('diamond'),
      }) }),
    }));
    expect(rejected.graph.edges).toEqual([]);
  });

  it.each([
    ['none', 'none', 'unspecified'], ['arrow', 'arrow', 'open'],
    ['filledArrow', 'arrow', 'filled'], ['triangle', 'triangle', 'open'],
    ['filledTriangle', 'triangle', 'filled'], ['diamond', 'diamond', 'open'],
    ['filledDiamond', 'diamond', 'filled'], ['circle', 'circle', 'open'],
    ['filledCircle', 'circle', 'filled'], ['bar', 'bar', 'unspecified'],
    ['crowFoot', 'crow-foot', 'unspecified'],
    ['zeroOrOne', 'zero-or-one', 'unspecified'], ['one', 'one', 'unspecified'],
    ['zeroOrMany', 'zero-or-many', 'unspecified'],
    ['oneOrMany', 'one-or-many', 'unspecified'],
  ] as const)('retains the selected keyed end %s as a distinct mark', (name, kind, fill) => {
    const source = `A service\nB service\nA -> B [firstEnd: ${name}]`;
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.edges[0]).toMatchObject({
      source: 'A', target: 'B',
      sourceEnd: { marker: { kind, fill } },
      targetEnd: { marker: { kind: 'arrow', fill: 'open' } },
    });
  });

  it.each([
    ['A -> B [secondEnd: arrow]', 'arrow', 'open'],
    ['A -#> B [secondEnd: filledArrow]', 'arrow', 'filled'],
    ['A --|> B [secondEnd: triangle]', 'triangle', 'open'],
  ] as const)('accepts equal operator and keyed end restatement in %s', (edge, kind, fill) => {
    const parsed = parseCandidate028(`A service\nB service\n${edge}`);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.edges[0]).toMatchObject({ targetEnd: { marker: { kind, fill } } });
  });

  it('permits a registered no-shortform end to replace an operator mark but rejects unknown ends', () => {
    const source = 'a service\nz service\na -> z [firstEnd: zeroOrOne, secondEnd: zeroOrOne]';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.edges[0]).toMatchObject({
      sourceEnd: { marker: { kind: 'zero-or-one', fill: 'unspecified' } },
      targetEnd: { marker: { kind: 'zero-or-one', fill: 'unspecified' } },
    });
    const unknown = parseCandidate028('a service\nz service\na -> z [secondEnd: uniqueend]');
    expect(unknown.diagnostics.map((item) => item.code))
      .toContain('coral.syntax.connector.end-unknown');
    expect(unknown.graph.edges).toEqual([]);
  });

  it('maps semantic zeroToMany to the canonical zero-or-many end mark', () => {
    const source = 'a entity\nb entity\na -- b [secondEnd: zeroToMany]';
    const parsed = parseCandidate028(source, { profile: 'erd' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.edges[0]?.targetEnd?.marker).toEqual({
      kind: 'zero-or-many', fill: 'unspecified',
    });
    expect((parsed.statements[2] as { secondEnd?: { value: string } }).secondEnd?.value)
      .toBe('zeroToMany');
  });

  it('resolves bare nested references through the nearest enclosing group', () => {
    const source = 'lead service\nteam group {\n  lead database\n  squad group {\n' +
      '    worker service\n    worker -> lead\n    worker -> team.lead\n  }\n}';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ['team.squad.worker', 'team.lead'],
      ['team.squad.worker', 'team.lead'],
    ]);
    expect(source).toContain('worker -> lead');
  });

  it('keeps dotted references absolute even inside a nested group', () => {
    const source = 'team group {\n  lead service\n  squad group {\n' +
      '    worker service\n    squad.worker -> lead\n    worker -> team.lead\n  }\n}';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.reference.source.unresolved');
    expect(parsed.graph.edges.map((edge) => [edge.source, edge.target]))
      .toEqual([['team.squad.worker', 'team.lead']]);
  });

  it('allows a rare keyed end on an explicitly unmarked connector without making every end unspecified', () => {
    const source = 'a service\nz service\na -- z [secondEnd: zeroOrOne]';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.edges[0]).toMatchObject({
      source: 'a', target: 'z',
      sourceEnd: { marker: { kind: 'none' } },
      targetEnd: { marker: { kind: 'zero-or-one' } },
    });

    const conflicting = parseCandidate028('a service\nz service\na -- z [secondEnd: diamond]');
    expect(conflicting.diagnostics.map((item) => item.code))
      .toContain('coral.syntax.connector.end-conflict');
    expect(conflicting.graph.edges).toEqual([]);
  });

  it('allows a first-end diamond on a neutral shaft because no first-end diamond shorthand exists', () => {
    const source = 'Whole class\nPart class\n' +
      'Whole -- Part [aggregation, firstEnd: diamond]\n' +
      'Whole -- Part [composition, firstEnd: filledDiamond]';
    const parsed = parseCandidate028(source, { profile: 'uml-class' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.edges).toMatchObject([
      { sourceEnd: { marker: { kind: 'diamond', fill: 'open' } },
        targetEnd: { marker: { kind: 'none' } } },
      { sourceEnd: { marker: { kind: 'diamond', fill: 'filled' } },
        targetEnd: { marker: { kind: 'none' } } },
    ]);
    const second = parseCandidate028('Whole class\nPart class\nWhole -- Part [secondEnd: diamond]');
    expect(second.diagnostics.map((item) => item.code)).toContain('coral.syntax.connector.end-conflict');
  });

  it('uses keyed ERD cardinality on a neutral shaft without inferring direction', () => {
    const source = 'customer entity\norder entity\ncustomer -- order ' +
      '[firstEnd: zeroOrOne, secondEnd: zeroOrMany] as "appears in"';
    const parsed = parseCandidate028(source, { profile: 'erd' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.edges[0]).toMatchObject({
      source: 'customer', target: 'order', label: 'appears in',
      sourceEnd: { marker: { kind: 'zero-or-one' } },
      targetEnd: { marker: { kind: 'zero-or-many' } },
    });
    expect(parsed.statements.find((statement) => statement.kind === 'edge'))
      .toMatchObject({ connector: { firstEndAuthored: true, secondEndAuthored: true } });
  });

  it.each([
    'customer <0..1--0..*> order as "appears in"',
    'customer 0..1 -- 0..* order as "appears in"',
    'customer ||--o{ order as "appears in"',
  ])('keeps playground-only cardinality spelling out of production: %s', (edge) => {
    const parsed = parseCandidate028(`customer entity\norder entity\n${edge}`, { profile: 'erd' });
    expect(parsed.diagnostics.length).toBeGreaterThan(0);
    expect(parsed.graph.edges).toEqual([]);
  });

  it('parses a reverse-ended UML sequence message while retaining written endpoint tokens', () => {
    const source = 'a participant\nz participant\nreply = a:in <- z:out as "done"';
    const result = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(result.diagnostics).toEqual([]);
    const syntax = result.statements.find((item) => item.kind === 'edge');
    if (syntax?.kind !== 'edge') throw new Error('Expected edge syntax');
    expect([syntax.source.value, syntax.sourcePort?.value, syntax.target.value, syntax.targetPort?.value])
      .toEqual(['a', 'in', 'z', 'out']);
    // GraphIR 3's sequence display edge must run sender-to-receiver. The
    // source-owned successor retains the written first/second endpoints.
    expect(result.graph.edges[0]).toMatchObject({
      id: 'reply', source: 'z', sourcePort: 'out', target: 'a', targetPort: 'in', label: 'done',
    });
    expect(result.graph.interaction?.messages[0]).toMatchObject({
      id: 'reply', sourceParticipantId: 'z', targetParticipantId: 'a', kind: 'asynchronous',
    });
  });


  it('normalizes bare and keyed type without guessing a positional label', () => {
    const source = 'review decision\napprove process\nreview -> approve [flow, label: "Yes"]';
    const bare = parseCandidate028(source);
    const keyed = parseCandidate028(source.replace('flow,', 'type: flow,'));
    expect(bare.diagnostics).toEqual([]);
    expect(keyed.diagnostics).toEqual([]);
    expect(bare.graph.edges[0]).toMatchObject({ type: 'flow', label: 'Yes' });
    expect(keyed.graph.edges[0]).toMatchObject({ type: 'flow', label: 'Yes' });
    const invalid = parseCandidate028(source.replace('label: ', ''));
    expect(invalid.diagnostics.some((item) => item.code === 'coral.syntax.bracket.unknown-positional')).toBe(true);
  });

  it.each(['architecture', 'block', 'flowchart', 'bpmn', 'erd', 'code', 'aiml',
    'data-engineering', 'sketch', 'uml-class', 'uml-sequence'])(
    'accepts a connector without a bracketed relation in %s', (profile) => {
      const nodeType = profile === 'uml-sequence' ? 'participant' : 'service';
      const parsed = parseCandidate028(`a ${nodeType}\nb ${nodeType}\na -> b`, { profile });
      expect(parsed.diagnostics).toEqual([]);
      expect(parsed.graph.edges).toHaveLength(1);
      expect(parsed.graph.edges[0]).toMatchObject({ source: 'a', target: 'b' });
      expect(parsed.graph.edges[0].type).toBe(profile === 'uml-sequence' ? 'async' : undefined);
      const syntax = parsed.statements.find((item) => item.kind === 'edge');
      expect(syntax).not.toHaveProperty('edgeType');
    },
  );

  it('trials colon port references beside equivalent keyed endpoint references', () => {
    const declarations = 'api service\ndb database\n';
    const short = parseCandidate028(`${declarations}read = api:outbound -> db:query [reads]`);
    const keyed = parseCandidate028(`${declarations}read = api -> db [reads, firstPort: outbound, secondPort: query]`);
    expect(short.diagnostics).toEqual([]);
    expect(keyed.diagnostics).toEqual([]);
    expect(short.graph.edges[0]).toEqual(keyed.graph.edges[0]);
    const syntax = short.statements.find((item) => item.kind === 'edge');
    if (syntax?.kind !== 'edge') throw new Error('Expected edge syntax');
    expect(syntax.sourcePort?.raw).toBe('outbound');
    expect(syntax.targetPort?.raw).toBe('query');
  });

  it('accepts spaces around the colon in endpoint port references', () => {
    const source = 'api service {\n  outbound port [direction: out]\n}\n' +
      'db database {\n  query port [direction: in]\n}\n' +
      'api : outbound -> db : query';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.statements.find((item) => item.kind === 'edge')).toMatchObject({
      sourcePort: { value: 'outbound' }, targetPort: { value: 'query' },
    });
  });

  it('keeps port ownership in written endpoint order for a left-arrow trial', () => {
    const parsed = parseCandidate028('client service\nserver service\nclient:reply <- server:send [return]');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.edges[0]).toMatchObject({
      source: 'client', sourcePort: 'reply', target: 'server', targetPort: 'send',
      sourceEnd: { marker: { kind: 'arrow' } }, targetEnd: { marker: { kind: 'none' } },
    });
  });

  it('rejects duplicate shorthand and keyed port references without choosing one silently', () => {
    const source = 'api service\ndb database\napi:outbound -> db:query [reads, firstPort: other]';
    const parsed = parseCandidate028(source);
    const duplicate = parsed.diagnostics.find((item) => item.code === 'coral.syntax.port.duplicate');
    expect(duplicate?.range?.start.offset).toBe(source.indexOf('firstPort: other'));
    expect(duplicate?.related?.[0]?.range?.start.offset).toBe(source.indexOf(':outbound'));
    expect(parsed.graph.edges).toEqual([]);
  });

  it('places an explicitly edited label after a shorthand target port', () => {
    const source = 'api service\ndb database\napi:outbound -> db:query [reads]';
    const parsed = parseCandidate028(source);
    const edge = parsed.statements.find((item) => item.kind === 'edge');
    if (edge?.kind !== 'edge') throw new Error('Expected edge syntax');
    expect(setCandidateLabel(source, edge, 'Order IDs'))
      .toBe('api service\ndb database\napi:outbound -> db:query [reads] as "Order IDs"');
  });

  it('diagnoses duplicate labels with both authored locations', () => {
    const source = 'a service\nb service\na -> b [flow, label: "First"] as "Second"';
    const result = parseCandidate028(source);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ code: 'coral.syntax.label.duplicate', severity: 'error' });
    expect(result.diagnostics[0]?.range?.start.offset).toBe(source.indexOf('as "Second"'));
    expect(result.diagnostics[0]?.related?.[0]?.range?.start.offset).toBe(source.indexOf('label: "First"'));
    expect(result.graph.edges).toEqual([]);
  });

  it('diagnoses duplicate type assignments rather than silently choosing one', () => {
    const source = 'a service\nb service\na -> b [flow, type: calls]';
    const result = parseCandidate028(source);
    const duplicate = result.diagnostics.find((item) => item.code === 'coral.syntax.type.duplicate');
    expect(duplicate?.range?.start.offset).toBe(source.indexOf('type: calls'));
    expect(duplicate?.related?.[0]?.range?.start.offset).toBe(source.indexOf('flow'));
    expect(result.graph.edges).toEqual([]);
  });

  it.each([
    { name: 'bare and keyed type', edge: 'A -> B [flow, type: flow]', code: 'coral.syntax.type.duplicate',
      message: 'Duplicate edge type', first: 'flow', later: 'type: flow' },
    { name: 'two keyed types', edge: 'A -> B [type: flow, type: calls]', code: 'coral.syntax.type.duplicate',
      message: 'Duplicate edge type', first: 'type: flow', later: 'type: calls' },
    { name: 'keyed and as label', edge: 'A -> B [label: "🌊, [x]"] as "No"',
      code: 'coral.syntax.label.duplicate', message: 'Duplicate edge label',
      first: 'label: "🌊, [x]"', later: 'as "No"' },
    { name: 'two keyed labels', edge: 'A -> B [label: "A", label: "B"]',
      code: 'coral.syntax.label.duplicate', message: 'Duplicate edge label',
      first: 'label: "A"', later: 'label: "B"' },
    { name: 'colon and keyed first port', edge: 'A:p -> B [firstPort: p]',
      code: 'coral.syntax.port.duplicate', message: 'Duplicate firstPort reference',
      first: ':p', later: 'firstPort: p' },
    { name: 'colon and keyed second port', edge: 'A -> B:q [secondPort: q]',
      code: 'coral.syntax.port.duplicate', message: 'Duplicate secondPort reference',
      first: ':q', later: 'secondPort: q' },
    { name: 'two keyed first ports', edge: 'A -> B [firstPort: p, firstPort: q]',
      code: 'coral.syntax.port.duplicate', message: 'Duplicate firstPort reference',
      first: 'firstPort: p', later: 'firstPort: q' },
    { name: 'two keyed second ports', edge: 'A -> B [secondPort: p, secondPort: q]',
      code: 'coral.syntax.port.duplicate', message: 'Duplicate secondPort reference',
      first: 'secondPort: p', later: 'secondPort: q' },
    { name: 'two keyed first ends', edge: 'A -> B [firstEnd: diamond, firstEnd: diamond]',
      code: 'coral.syntax.connector.end-duplicate', message: 'Duplicate firstEnd assignment',
      first: 'firstEnd: diamond', later: 'firstEnd: diamond' },
    { name: 'two keyed second ends', edge: 'A -> B [secondEnd: zeroOrOne, secondEnd: zeroOrMany]',
      code: 'coral.syntax.connector.end-duplicate', message: 'Duplicate secondEnd assignment',
      first: 'secondEnd: zeroOrOne', later: 'secondEnd: zeroOrMany' },
  ])('locates complete assignments for $name', ({ edge, code, message, first, later }) => {
    const source = `A service\nB service\n${edge}`;
    const result = parseCandidate028(source);
    const duplicates = result.diagnostics.filter((item) => item.code === code);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({ code, message, severity: 'error' });
    const firstAt = source.indexOf(first, source.indexOf(edge));
    const laterAt = source.lastIndexOf(later);
    expect(duplicates[0]?.range).toMatchObject({
      start: { line: 3, column: laterAt - source.indexOf(edge), offset: laterAt },
      end: { line: 3, column: laterAt - source.indexOf(edge) + later.length, offset: laterAt + later.length },
    });
    expect(duplicates[0]?.related).toEqual([expect.objectContaining({
      message: 'First assignment',
      range: {
        start: { line: 3, column: firstAt - source.indexOf(edge), offset: firstAt },
        end: { line: 3, column: firstAt - source.indexOf(edge) + first.length, offset: firstAt + first.length },
      },
    })]);
    expect(result.graph.edges).toEqual([]);
  });

  it('relates every later type assignment to the first of three', () => {
    const edge = 'A -> B [type: flow, type: calls, type: reads]';
    const source = `A service\nB service\n${edge}`;
    const parsed = parseCandidate028(source);
    const duplicates = parsed.diagnostics.filter((item) => item.code === 'coral.syntax.type.duplicate');
    expect(duplicates).toHaveLength(2);
    expect(duplicates.map((item) => item.range?.start.offset)).toEqual([
      source.indexOf('type: calls'), source.indexOf('type: reads'),
    ]);
    expect(duplicates.map((item) => item.related?.[0]?.range?.end.offset)).toEqual([
      source.indexOf('type: flow') + 'type: flow'.length,
      source.indexOf('type: flow') + 'type: flow'.length,
    ]);
  });

  it.each([
    ['type: "flow"', 'type requires a bare relation word'],
    ['label: Yes', 'label requires quoted text'],
    ['firstPort: "send"', 'firstPort requires a port ID'],
    ['secondEnd: "arrow"', 'secondEnd requires an end name'],
    ["style: 'dotted'", 'style requires one bare term or a double-quoted recipe'],
  ])('reports the value type for known edge field %s', (field, message) => {
    const source = `A service\nB service\nA -> B [${field}]`;
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.bracket.value-invalid', message, severity: 'error',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf(':') + 2,
      }) }),
    }));
    expect(parsed.graph.edges).toEqual([]);
  });

  it('distinguishes an unknown edge field from a known field with a wrong value', () => {
    const source = 'A service\nB service\nA -> B [weight: thick]';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.bracket.unknown-field', message: 'Unknown edge field: weight',
    }));
  });

  it('counts an invalid field value as an occurrence and relates later duplicates to the first', () => {
    const source = 'A service\nB service\nA -> B [type: "bad", type: flow, type: "again"]';
    const parsed = parseCandidate028(source);
    const duplicates = parsed.diagnostics.filter((item) => item.code === 'coral.syntax.type.duplicate');
    expect(duplicates).toHaveLength(2);
    expect(duplicates.map((item) => item.range?.start.offset)).toEqual([
      source.indexOf('type: flow'), source.indexOf('type: "again"'),
    ]);
    expect(duplicates.every((item) => item.related?.[0]?.range?.start.offset ===
      source.indexOf('type: "bad"'))).toBe(true);
    expect(parsed.diagnostics.filter((item) => item.code === 'coral.syntax.bracket.value-invalid'))
      .toHaveLength(2);
    expect(parsed.graph.edges).toEqual([]);
  });

  it('does not let a missing first value evade a later duplicate', () => {
    const source = 'A service\nB service\nA -> B [type:, type: flow]';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'coral.syntax.bracket.value-required', 'coral.syntax.type.duplicate',
    ]));
    const duplicate = parsed.diagnostics.find((item) => item.code === 'coral.syntax.type.duplicate');
    expect(duplicate?.related?.[0]?.range?.start.offset).toBe(source.indexOf('type:'));
    expect(parsed.graph.edges).toEqual([]);
  });

  it('relates an as label to an earlier keyed label with a wrong value type', () => {
    const source = 'A service\nB service\nA -> B [label: Yes] as "Ready"';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'coral.syntax.bracket.value-invalid', 'coral.syntax.label.duplicate',
    ]));
    const duplicate = parsed.diagnostics.find((item) => item.code === 'coral.syntax.label.duplicate');
    expect(duplicate?.related?.[0]?.range?.start.offset).toBe(source.indexOf('label: Yes'));
    expect(parsed.graph.edges).toEqual([]);
  });

  it('does not consume a closing bracket as a missing keyed value', () => {
    const source = 'A service\nB service\nbad = A -> B [type: ]\ngood = A -> B [flow]';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.syntax.bracket.value-required');
    expect(parsed.diagnostics.map((item) => item.code)).not.toContain('coral.syntax.bracket.unclosed');
    expect(parsed.graph.edges.map((edge) => edge.id)).toEqual(['good']);
  });

  it('renders a single known line-style value without changing the authored token', () => {
    const source = 'A service\nB service\nA -> B [style: dotted]';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.statements[2]).toMatchObject({ style: { raw: 'dotted', value: 'dotted' } });
    expect(parsed.graph.edges[0]?.style).toEqual({ lineStyle: 'dotted' });
  });

  it('parses a quoted portable style recipe without changing its source token', () => {
    const source = 'A service\nB service\nA -> B [style: "dotted, #FF0000, thick, animated:reverse"]';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.statements[2]).toMatchObject({
      style: { raw: '"dotted, #FF0000, thick, animated:reverse"' },
      styleIntent: { lineStyle: 'dotted', strokeColor: '#FF0000',
        strokeWeight: 'thick', motion: { kind: 'animated', direction: 'second-to-first' } },
    });
  });
  it('retains a named sequence note with exact quoted text and timeline position', () => {
    const source = 'api participant\nworker participant\n' +
      'call = api -> worker\ncheck = note "Check\\nRecord" on worker\nworker -> api';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.statements[3]).toMatchObject({ kind: 'note', id: { value: 'check' },
      text: { raw: '"Check\\nRecord"', value: 'Check\nRecord' }, target: { value: 'worker' } });
    expect(parsed.sequenceItems.map((item) => item.kind)).toEqual(['edge', 'note', 'edge']);
  });
  it('keeps message and multi-participant note targets as exact authored tokens', () => {
    const source = 'api participant\nworker participant\n' +
      'call = api -> worker\n' +
      'retry = note "retried" on call\n' +
      'shared = note "shared" on api, worker';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.sequenceItems[1]).toMatchObject({ kind: 'note', id: { value: 'retry' },
      targets: [{ value: 'call' }] });
    expect(parsed.sequenceItems[2]).toMatchObject({ kind: 'note', id: { value: 'shared' },
      targets: [{ value: 'api' }, { value: 'worker' }] });
    expect(source.slice(parsed.sequenceItems[2]!.kind === 'note'
      ? parsed.sequenceItems[2]!.targets[1]!.range.start.offset : 0,
    parsed.sequenceItems[2]!.kind === 'note'
      ? parsed.sequenceItems[2]!.targets[1]!.range.end.offset : 0)).toBe('worker');
  });
  it('diagnoses an unquoted sequence note without rewriting its source', () => {
    const source = 'api participant\nnote Check on api';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.sequence.note.text-quoted');
    expect(parsed.sequenceItems).toEqual([]);
  });
  it('rejects a qualified declared note ID without changing dotted references', () => {
    const source = 'api participant\nscope.check = note "Review" on api';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.sequence.note.id-qualified');
    expect(parsed.sequenceItems).toEqual([]);
  });
  it('rejects as as a note identity instead of treating it as a rendered label', () => {
    const source = 'api participant\nnote "Review" on api as check';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.note.as-invalid',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('as check'),
      }) }),
    }));
  });

  it('diagnoses repeated style dimensions and malformed color without guessing a repair', () => {
    const source = 'A service\nB service\nA -> B [style: "#FF0000, #GGGGGG, thick, regular"]';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'coral.syntax.style.hex-invalid', 'coral.syntax.style.dimension-conflict',
    ]));
    expect(parsed.diagnostics.filter((item) => item.code === 'coral.syntax.style.dimension-conflict'))
      .toHaveLength(2);
  });
  it('separates a repeated equal style term from a conflicting assignment', () => {
    const source = 'A service\nB service\nA -> B [style: "thick, thick, regular"]';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toEqual([
      'coral.syntax.style.dimension-duplicate', 'coral.syntax.style.dimension-conflict',
    ]);
    expect(parsed.diagnostics[0]?.range?.start.offset).toBe(source.indexOf('thick', source.indexOf('thick') + 1));
    expect(parsed.diagnostics[0]?.related?.[0]?.range?.start.offset).toBe(source.indexOf('thick'));
    expect(parsed.diagnostics[1]?.range?.start.offset).toBe(source.indexOf('regular'));
    expect(parsed.diagnostics[1]?.related?.[0]?.range?.start.offset).toBe(source.indexOf('thick'));
  });

  it('retains an RGB edge in source syntax without offering a color-blind display graph', () => {
    const source = 'A service\nB service\npaint = A -> B [style: #FF0000]';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.statements.find((item) => item.kind === 'edge')).toMatchObject({
      id: { value: 'paint' }, style: { raw: '#FF0000', value: '#FF0000' },
    });
    expect(parsed.graph.edges).toHaveLength(1);
  });

  it.each([
    ['black', '#000000'], ['gray', '#808080'], ['red', '#FF0000'],
    ['orange', '#FFA500'], ['yellow', '#FFFF00'], ['green', '#008000'],
    ['blue', '#0000FF'], ['purple', '#800080'],
  ] as const)('projects approved named color %s to canonical RGB %s', (name, rgb) => {
    const source = `A service\nB service\npaint = A -> B [style: ${name}]`;
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.statements.find((item) => item.kind === 'edge')).toMatchObject({
      id: { value: 'paint' }, style: { raw: name, value: name },
      styleIntent: { strokeColor: rgb },
    });
    expect(parsed.graph.edges).toHaveLength(1);
  });

  it('combines a named color with other typed recipe dimensions', () => {
    const source = 'A service\nB service\n' +
      'paint = A -> B [style: "dotted, green, thick, animated"]';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.statements.find((item) => item.kind === 'edge')).toMatchObject({
      styleIntent: { lineStyle: 'dotted', strokeColor: '#008000',
        strokeWeight: 'thick', motion: { kind: 'animated', direction: 'auto' } },
    });
  });

  it('compares a named color with exact RGB by canonical channels', () => {
    const equal = 'A service\nB service\nA -> B [style: "green, #008000"]';
    const repeated = parseCandidate028(equal);
    expect(repeated.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.style.dimension-duplicate',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: equal.indexOf('#008000'),
      }) }),
      related: [expect.objectContaining({ range: expect.objectContaining({
        start: expect.objectContaining({ offset: equal.indexOf('green') }),
      }) })],
    }));
    const different = 'A service\nB service\nA -> B [style: "red, #00FF00"]';
    expect(parseCandidate028(different).diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.style.dimension-conflict',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: different.indexOf('#00FF00'),
      }) }),
    }));
  });

  it('warns on an unknown style term and withholds an unverified visual result', () => {
    const source = 'A service\nB service\nA -> B [style: mintGreen]';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'coral.style.term.unknown', severity: 'warning',
        range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('mintGreen') }) }) }),
      expect.objectContaining({ code: 'coral.style.capability.unavailable', severity: 'error' }),
    ]));
    expect(parsed.graph.edges).toEqual([]);
  });

  it('rejects repeated style assignments on the complete later field', () => {
    const source = 'A service\nB service\nA -> B [style: dotted, style: dotted]';
    const parsed = parseCandidate028(source);
    const duplicate = parsed.diagnostics.find((item) => item.code === 'coral.syntax.style.duplicate');
    expect(duplicate?.range?.start.offset).toBe(source.lastIndexOf('style: dotted'));
    expect(duplicate?.related?.[0]?.range?.start.offset).toBe(source.indexOf('style: dotted'));
    expect(parsed.graph.edges).toEqual([]);
  });

  it('diagnoses malformed hex colors and explicit operator line-treatment conflicts', () => {
    const malformed = parseCandidate028('A service\nB service\nA -> B [style: #GGGGGG]');
    expect(malformed.diagnostics.map((item) => item.code)).toContain('coral.syntax.style.hex-invalid');
    const conflict = parseCandidate028('A service\nB service\nA -.-> B [style: dotted]');
    expect(conflict.diagnostics.map((item) => item.code))
      .toContain('coral.syntax.style.operator-conflict');
    expect(conflict.graph.edges).toEqual([]);
  });

  it('rejects an empty bracket rather than inventing an edge type', () => {
    const result = parseCandidate028('a service\nb service\na -> b []');
    expect(result.diagnostics.some((item) => item.code === 'coral.syntax.bracket.empty')).toBe(true);
  });

  it.each(['[flow,]', '[type: flow,]', '[flow, label: "Yes",]'])(
    'rejects the trailing comma in connector bracket %s with an exact source range', (fields) => {
      const source = `a service\nb service\nbad = a -> b ${fields}\ngood = a -> b [flow]`;
      const result = parseCandidate028(source);
      const comma = result.diagnostics.find((item) => item.code === 'coral.syntax.bracket.trailing-comma');
      expect(comma?.range?.start.offset).toBe(source.indexOf(fields) + fields.lastIndexOf(','));
      expect(comma?.range?.end.offset).toBe(comma!.range!.start.offset + 1);
      expect(result.graph.edges.map((edge) => edge.id)).toEqual(['good']);
    });

  it('reports an empty connector-bracket field at the separator and recovers the next edge', () => {
    const source = 'a service\nb service\nbad = a -> b [flow,, label: "No"]\ngood = a -> b [flow]';
    const result = parseCandidate028(source);
    const empty = result.diagnostics.find((item) => item.code === 'coral.syntax.bracket.empty-item');
    expect(empty?.range?.start.offset).toBe(source.indexOf(',,') + 1);
    expect(result.graph.edges.map((edge) => edge.id)).toEqual(['good']);
  });

  it('distinguishes omitted and explicitly empty rendered labels', () => {
    const result = parseCandidate028('a service\nb service as ""');
    expect(result.diagnostics).toEqual([]);
    expect(result.graph.nodes.map((node) => node.label)).toEqual(['a', '']);
    expect(result.statements[0]).not.toHaveProperty('label');
    expect(result.statements[1]).toHaveProperty('label');
  });

  it('distinguishes three sequence operators and creation identity', () => {
    const source = 'client participant\nserver participant\nclient -#> server as "load()"\nserver -> client as "reply later"\nserver -.-> client as "result"\nclient -.-> worker [create] as "spawn()"';
    const result = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(result.diagnostics).toEqual([]);
    expect(result.graph.interaction?.messages.map((message) => message.kind)).toEqual([
      'synchronous', 'asynchronous', 'return', 'create',
    ]);
    expect(result.graph.interaction?.participants.map((participant) => participant.id)).toEqual([
      'client', 'server', 'worker',
    ]);
    expect(result.graph.metadata?.notation).toBe('uml-sequence');
    expect(result.graph.nodes.find((node) => node.id === 'worker')?.label).toBe('worker');
    expect(result.graph.edges.map((edge) => edge.type)).toEqual(['sync', 'async', 'return', 'create']);
    expect(validateSequenceInteraction(result.graph)).toEqual([]);
  });

  it('keeps a six-position dashed create operator as creation with a length hint', () => {
    const source = 'client participant\nclient -.----> worker [create]\n' +
      'worker -> client\nclient -.----> missing';
    const result = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(result.graph.interaction?.messages.map((message) => message.kind))
      .toEqual(['create', 'asynchronous']);
    expect(result.graph.interaction?.participants.map((participant) => participant.id))
      .toEqual(['client', 'worker']);
    expect(result.graph.nodes.some((node) => node.id === 'missing')).toBe(false);
    expect(result.diagnostics.map((item) => item.code))
      .toContain('coral.reference.target.unresolved');
    expect(result.statements.filter((item) => item.kind === 'edge')
      .map((item) => item.connector?.dashCount)).toEqual([6, 1, 6]);
  });

  it('uses the authored sequence operator for sender and kind despite keyed end marks', () => {
    const source = 'client participant\nserver participant\n' +
      'client -> server [firstEnd: arrow]\n' +
      'client <- server [firstEnd: zeroOrOne]';
    const result = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(result.diagnostics).toEqual([]);
    expect(result.graph.interaction?.messages).toEqual([
      expect.objectContaining({ sourceParticipantId: 'client', targetParticipantId: 'server',
        kind: 'asynchronous' }),
      expect.objectContaining({ sourceParticipantId: 'server', targetParticipantId: 'client',
        kind: 'asynchronous' }),
    ]);
    expect(result.graph.edges[1]).toMatchObject({ source: 'server', target: 'client',
      targetEnd: { marker: { kind: 'zero-or-one' } } });
  });

  it('retains explicit sequence kinds even when they contradict operator-derived appearance and message meaning', () => {
    const source = 'client participant\nserver participant\nclient -#> server [async]\nclient -> server [return]\nclient -> server [create]\nclient -> server [type: async]\nclient -.-> server [sync]';
    const result = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(result.diagnostics).toEqual([]);
    expect(result.graph.interaction?.messages.map((message) => message.kind)).toEqual([
      'synchronous', 'asynchronous', 'asynchronous', 'asynchronous', 'return',
    ]);
    expect(result.graph.edges.map((edge) => edge.type)).toEqual(['async', 'return', 'create', 'async', 'sync']);
    expect(validateSequenceInteraction(result.graph)).toEqual([]);
  });

  it('accepts matching explicit sequence types as semantic restatements', () => {
    const source = 'client participant\nserver participant\nclient -#> server [sync]\nclient -> server [type: async]\nserver -.-> client [return]';
    const result = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(result.diagnostics).toEqual([]);
    expect(result.graph.edges.map((edge) => edge.type)).toEqual(['sync', 'async', 'return']);
    expect(validateSequenceInteraction(result.graph)).toEqual([]);
  });

  it('does not silently invent an ordinary unresolved target', () => {
    const result = parseCandidate028('client participant\nclient -> missing as "request"', { profile: 'uml-sequence' });
    expect(result.diagnostics.some((item) => item.code === 'coral.reference.target.unresolved')).toBe(true);
    expect(result.graph.nodes.some((node) => node.id === 'missing')).toBe(false);
    expect(result.graph.edges).toEqual([]);
    expect(result.graph.interaction?.messages).toEqual([]);
    expect(validateIR(result.graph).valid).toBe(true);
  });

  it('keeps valid sequence neighbors without projecting an unresolved source', () => {
    const result = parseCandidate028('client participant\nserver participant\nmissing -> server\nclient -> server',
      { profile: 'uml-sequence' });
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.reference.source.unresolved');
    expect(result.graph.edges).toHaveLength(1);
    expect(result.graph.interaction?.messages).toHaveLength(1);
    expect(result.graph.edges[0]).toMatchObject({ source: 'client', target: 'server' });
    expect(validateIR(result.graph).valid).toBe(true);
  });

  it('keeps a valid general-graph edge when another edge has a missing endpoint', () => {
    const result = parseCandidate028('a service\nb service\na -> missing\na -> b');
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.reference.target.unresolved');
    expect(result.graph.edges).toHaveLength(1);
    expect(result.graph.edges[0]).toMatchObject({ source: 'a', target: 'b' });
    expect(validateIR(result.graph).valid).toBe(true);
  });

  it('does not synthesize a creation target when its sender is unresolved', () => {
    const result = parseCandidate028('client participant\nmissing -.-> worker [create]',
      { profile: 'uml-sequence' });
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.reference.source.unresolved');
    expect(result.diagnostics.map((item) => item.code)).not.toContain('coral.reference.target.unresolved');
    expect(result.graph.nodes.map((node) => node.id)).toEqual(['client']);
    expect(result.graph.edges).toEqual([]);
    expect(result.graph.interaction?.messages).toEqual([]);
    expect(validateIR(result.graph).valid).toBe(true);
  });

  it('does not turn a wrong-kind sequence declaration into a created participant', () => {
    const result = parseCandidate028('client participant\nworker service\nclient -.-> worker [create]',
      { profile: 'uml-sequence' });
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.sequence.participant.invalid');
    expect(result.diagnostics.map((item) => item.code)).not.toContain('coral.reference.target.unresolved');
    expect(result.graph.nodes.map((node) => node.id)).toEqual(['client']);
    expect(result.graph.edges).toEqual([]);
    expect(result.graph.interaction?.participants.map((item) => item.id)).toEqual(['client']);
    expect(validateIR(result.graph).valid).toBe(true);
  });

  it('reports a wrong-kind sequence sender without calling it unresolved', () => {
    const result = parseCandidate028('client service\nserver participant\nclient -> server',
      { profile: 'uml-sequence' });
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.sequence.participant.invalid');
    expect(result.diagnostics.map((item) => item.code)).not.toContain('coral.reference.source.unresolved');
    expect(result.graph.nodes.map((node) => node.id)).toEqual(['server']);
    expect(result.graph.edges).toEqual([]);
    expect(validateIR(result.graph).valid).toBe(true);
  });

  it('accepts an already-declared actor as a creation target without duplicating it', () => {
    const result = parseCandidate028('client participant\nworker actor as "Worker"\nclient -.-> worker [create]',
      { profile: 'uml-sequence' });
    expect(result.diagnostics).toEqual([]);
    expect(result.graph.nodes.map((node) => node.id)).toEqual(['client', 'worker']);
    expect(result.graph.nodes[1]).toMatchObject({ type: 'actor', label: 'Worker' });
    expect(result.graph.interaction?.messages[0]?.kind).toBe('create');
    expect(result.graph.edges[0]?.type).toBe('create');
    expect(validateSequenceInteraction(result.graph)).toEqual([]);
    expect(validateIR(result.graph).valid).toBe(true);
  });

  it('resolves a later participant declaration to the same creation target', () => {
    const source = 'client participant\nclient -.-> worker [create] as "spawn()"\nworker participant as "Worker"';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.nodes.filter((node) => node.id === 'worker')).toEqual([
      expect.objectContaining({ id: 'worker', label: 'Worker' }),
    ]);
    expect(parsed.graph.interaction?.participants.filter((participant) => participant.id === 'worker')).toHaveLength(1);
    expect(parsed.statements.filter((item) => item.kind === 'node')).toHaveLength(2);
  });

  it('preserves an authored delimiter and unrelated bytes during a label edit', () => {
    const source = `// review note\r\napiGateway = service as 'Old label'  // keep this\r\nauditSink service`;
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(replaceCandidateLabel(source, parsed.statements[0]!, 'New "label"\nline')).toBe(
      `// review note\r\napiGateway = service as 'New "label"\\nline'  // keep this\r\nauditSink service`,
    );
  });

  it('round trips a backslash through an authored and generated label edit', () => {
    const source = "api service as 'Old'\nstore database";
    const parsed = parseCandidate028(source);
    const value = 'C:\\temp "archive"';
    const replaced = replaceCandidateLabel(source, parsed.statements[0]!, value);
    expect(replaced).toBe("api service as 'C:\\\\temp \"archive\"'\nstore database");
    expect(parseCandidate028(replaced).graph.nodes[0]?.label).toBe(value);
    const generated = setCandidateLabel(source, parsed.statements[1]!, value);
    expect(generated).toBe("api service as 'Old'\nstore database as \"C:\\\\temp \\\"archive\\\"\"");
    expect(parseCandidate028(generated).graph.nodes[1]?.label).toBe(value);
  });

  it.each([
    ['line separator', '\u2028'], ['paragraph separator', '\u2029'],
    ['NUL', '\u0000'], ['C1 control', '\u0085'], ['isolated surrogate', '\ud800'],
  ])('refuses a %s before editing source labels', (_name, character) => {
    const source = 'api service as "Old"\nstore database\napi -> store';
    const parsed = parseCandidate028(source);
    const value = `before${character}after`;
    expect(() => replaceCandidateLabel(source,
      parsed.statements[0]!, value)).toThrow(/Unsupported control character in label/);
    expect(() => setCandidateLabel(source,
      parsed.statements[1]!, value)).toThrow(/Unsupported control character in label/);
    expect(() => setCandidateLabel(source,
      parsed.statements[2]!, value)).toThrow(/Unsupported control character in label/);
  });

  it('edits an edge label without rewriting its ID, bracket, or neighboring declarations', () => {
    const source = 'a service\nb service\ncall = a -> b [type: calls] as "Old"';
    const parsed = parseCandidate028(source);
    const edited = replaceCandidateLabel(source, parsed.statements[2]!, 'New');
    expect(edited).toBe('a service\nb service\ncall = a -> b [type: calls] as "New"');
    expect(parseCandidate028(edited).graph.edges[0]).toMatchObject({
      id: 'call', type: 'calls', label: 'New',
    });
  });

  it('adds a generated quoted label without rewriting comments, spacing, or the bracket', () => {
    const source = 'a service  // keep\r\nb service\r\na -> b [flow]  // edge';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    const nodeLabeled = setCandidateLabel(source, parsed.statements[0]!, 'A "service"');
    expect(nodeLabeled).toBe('a service as "A \\"service\\""  // keep\r\nb service\r\na -> b [flow]  // edge');
    const edgeLabeled = setCandidateLabel(source, parsed.statements[2]!, 'Yes');
    expect(edgeLabeled).toBe('a service  // keep\r\nb service\r\na -> b [flow] as "Yes"  // edge');
    expect(parseCandidate028(edgeLabeled).graph.edges[0]?.label).toBe('Yes');
  });

  it('adds a node label after keyed symbol fields and before a port block', () => {
    const source = '@diagram architecture\napi service [symbol: "arch-service"] {\n' +
      '  audit port [direction: out, anchor: auto]\n}\nstore database';
    const body = source.slice(source.indexOf('\n') + 1);
    const parsed = parseCandidate028(body);
    expect(parsed.diagnostics).toEqual([]);
    const edited = setCandidateLabel(body, parsed.statements[0]!, 'API gateway');
    expect(edited).toContain('api service [symbol: "arch-service"] as "API gateway" {');
    expect(edited).toContain('audit port [direction: out, anchor: auto]');
    expect(parseCandidate028(edited).diagnostics).toEqual([]);
  });

  it('distinguishes exact ID-first text from a legacy kind-first guess', () => {
    const result = parseCandidate028('service apiGateway');
    expect(result.diagnostics).toEqual([]);
    expect(result.graph.nodes[0]).toMatchObject({ id: 'service', type: 'apiGateway', label: 'service' });
  });

  it('keeps valid neighbors after a bad line and reports UTF-16 offsets', () => {
    const source = 'first service as "🌊"\nsecond service\nfirst -> second [flow, "No"]\nthird service';
    const result = parseCandidate028(source);
    expect(result.graph.nodes.map((node) => node.id)).toEqual(['first', 'second', 'third']);
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.syntax.bracket.unknown-positional');
    const problem = result.diagnostics.find((item) => item.code === 'coral.syntax.bracket.unknown-positional')!;
    expect(problem.range?.start.offset).toBe(source.indexOf('"No"'));
  });

  it('does not project malformed syntax on a line while retaining valid neighboring statements', () => {
    const source = [
      'first service', 'second service',
      'bad = first -> second [flow, "No"]',
      'good = first -> second [flow] as "Yes"',
      'wrong service as "bad\\t escape"',
      'last service',
    ].join('\n');
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.syntax.bracket.unknown-positional');
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.syntax.string.invalid-escape');
    expect(parsed.graph.edges.map((edge) => edge.id)).toEqual(['good']);
    expect(parsed.graph.nodes.map((node) => node.id)).toEqual(['first', 'second', 'last']);
    expect(parsed.statements.filter((item) => item.kind === 'edge').map((item) => item.id?.value)).toEqual(['good']);
  });

  it('does not promote children of an invalid group header to root nodes', () => {
    const source = 'before service\nbad group as "bad\\t" {\n  child service\n}\nafter service';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.syntax.string.invalid-escape');
    expect(parsed.graph.nodes.map((node) => node.id)).toEqual(['before', 'after']);
    expect(parsed.statements.filter((item) => item.kind === 'node').map((item) => item.id.value))
      .toEqual(['before', 'after']);
  });

  it('recovers inside a valid outer group after an invalid nested block', () => {
    const source = 'outer group {\n  bad group as "bad\\t" {\n    lost service\n  }\n  kept service\n}';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.syntax.string.invalid-escape');
    expect(parsed.graph.nodes[0]).toMatchObject({ id: 'outer', children: [{ id: 'outer.kept', parent: 'outer' }] });
    expect(parsed.graph.nodes).toHaveLength(1);
  });

  it('accepts trailing whitespace but diagnoses non-ASCII separators', () => {
    expect(parseCandidate028('first service\n  \t').diagnostics).toEqual([]);
    const source = 'first\u00a0service';
    const result = parseCandidate028(source);
    expect(result.diagnostics.some((item) => item.code === 'coral.syntax.spacing.invalid')).toBe(true);
    expect(result.diagnostics[0]?.range?.start.offset).toBe(5);
  });

  it('decodes approved escapes and diagnoses unnecessary ones', () => {
    const accepted = parseCandidate028(`first service as 'It\\'s\\nready'`);
    expect(accepted.diagnostics).toEqual([]);
    expect(accepted.graph.nodes[0]?.label).toBe("It's\nready");
    const rejected = parseCandidate028(`first service as 'bad\\"escape'`);
    expect(rejected.diagnostics.some((item) => item.code === 'coral.syntax.string.invalid-escape')).toBe(true);
  });

  it('uses quote-neutral diagnostics and UTF-16 ranges for a malformed note body', () => {
    const control = 'api participant\nnote "🌊\t" on api';
    const parsedControl = parseCandidate028(control, { profile: 'uml-sequence' });
    expect(parsedControl.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.string.control', message: 'Control character in quoted text',
      range: { start: { line: 2, column: 8, offset: control.indexOf('\t') },
        end: { line: 2, column: 9, offset: control.indexOf('\t') + 1 } },
    }));
    const rawLinebreak = 'api participant\nnote "first\nsecond" on api';
    const parsedLinebreak = parseCandidate028(rawLinebreak, { profile: 'uml-sequence' });
    expect(parsedLinebreak.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.string.unclosed', message: 'Quoted text is not closed',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: rawLinebreak.indexOf('"first'),
      }) }),
    }));
  });

  it('keeps exact case-sensitive IDs while allowing Unicode in rendered text', () => {
    const source = 'Api service as "Café 🌊"\napi service as \'café\'\n' +
      'upper = Api -> api\nlower = api -> Api';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.nodes.map(({ id, label }) => [id, label])).toEqual([
      ['Api', 'Café 🌊'], ['api', 'café'],
    ]);
    expect(parsed.graph.edges.map(({ source: first, target: second }) => [first, second]))
      .toEqual([['Api', 'api'], ['api', 'Api']]);
    const invalid = parseCandidate028('café service\nkept service');
    expect(invalid.diagnostics.map((item) => item.code)).toContain('coral.syntax.token.invalid');
    expect(invalid.graph.nodes.map((node) => node.id)).toEqual(['kept']);
  });

  it('keeps dotted node references out of port and declared-ID positions', () => {
    const source = 'api service {\n  out port [direction: out]\n}\nstore database\n' +
      'api:out.extra -> store\napi -> store [firstPort: out.extra]\n' +
      'bad.link = api -> store\ngood = api:out -> store';
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'coral.syntax.edge.invalid', 'coral.syntax.bracket.value-invalid',
      'coral.syntax.edge.id-qualified',
    ]));
    expect(parsed.graph.edges.map((edge) => edge.id)).toEqual(['good']);
  });

  it('rejects qualified port and fragment declarations without losing valid neighbors', () => {
    const ports = parseCandidate028('api service {\n  send.extra port [direction: out]\n' +
      '  send port [direction: out]\n}\nstore database\napi:send -> store');
    expect(ports.diagnostics.map((item) => item.code)).toContain('coral.syntax.port.invalid');
    expect(ports.statements.filter((item) => item.kind === 'port').map((item) => item.id.value))
      .toEqual(['send']);
    const sequence = parseCandidate028('api participant\nworker participant\n' +
      'bad.loop = loop "more" {\n  api -> worker\n}\nkept = api -> worker',
    { profile: 'uml-sequence' });
    expect(sequence.diagnostics.map((item) => item.code)).toContain('coral.sequence.fragment.id-qualified');
    expect(sequence.graph.edges.map((edge) => edge.id)).toEqual(['kept']);
  });

  it.each([
    ['DEL', '\u007f', 'coral.syntax.string.control'],
    ['C1 control', '\u0085', 'coral.syntax.string.control'],
    ['Unicode line separator', '\u2028', 'coral.syntax.string.control'],
    ['Unicode paragraph separator', '\u2029', 'coral.syntax.string.control'],
    ['isolated surrogate', '\ud800', 'coral.syntax.string.invalid-scalar'],
  ])('diagnoses a %s inside shared quoted text', (_name, character, code) => {
    const source = `api service as "left${character}right"\nkept service`;
    const parsed = parseCandidate028(source);
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      code, range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf(character),
      }) }),
    }));
    expect(parsed.graph.nodes.map((node) => node.id)).toEqual(['kept']);
  });

  it('projects a candidate sequence into a schema-valid portable graph', () => {
    const source = 'client participant\nserver participant\nclient -#> server as "load()"\nclient -.-> worker [create] as "spawn()"';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics).toEqual([]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
  });

  it('reparses a localized label edit with unchanged identity and meaning', () => {
    const source = `apiGateway service as 'Old'\nauditSink service\ncall = apiGateway -> auditSink [calls] as "Send"`;
    const before = parseCandidate028(source);
    const edited = replaceCandidateLabel(source, before.statements[0]!, 'New');
    const after = parseCandidate028(edited);
    expect(after.diagnostics).toEqual([]);
    expect(after.graph.nodes[0]).toMatchObject({ id: 'apiGateway', type: 'service', label: 'New' });
    expect(after.graph.edges).toEqual(before.graph.edges);
    expect(edited).toContain(`apiGateway service as 'New'`);
    expect(edited).toContain(`call = apiGateway -> auditSink [calls] as "Send"`);
  });

  it('requires horizontal separators around connector operators', () => {
    const noGap = parseCandidate028('a service\nb service\na->b');
    expect(noGap.diagnostics.some((item) => item.code === 'coral.syntax.spacing.required')).toBe(true);
    const tabbed = parseCandidate028('a service\nb service\na\t->\tb');
    expect(tabbed.diagnostics).toEqual([]);
  });

  it('requires a separator between an ID and kind and around the as literal', () => {
    const badLabel = parseCandidate028('a service as"A"');
    expect(badLabel.diagnostics.some((item) => item.code === 'coral.syntax.spacing.required')).toBe(true);
    const good = parseCandidate028('a\tservice as "A"');
    expect(good.diagnostics).toEqual([]);
  });

  it('normalizes selected filled ends while retaining exact operator spelling and proximity', () => {
    const variants = [
      ['--#>', 'arrow', 'filled', 2], ['-->#', 'arrow', 'filled', 2],
      ['--#|>', 'triangle', 'filled', 2], ['--|#>', 'triangle', 'filled', 2],
      ['--|>#', 'triangle', 'filled', 2], ['--|>', 'triangle', 'open', 2],
      ['--<>', 'diamond', 'open', 2], ['--#<>', 'diamond', 'filled', 2],
      ['--<#>', 'diamond', 'filled', 2], ['--<>#', 'diamond', 'filled', 2],
      ['--o', 'circle', 'open', 2], ['--#o', 'circle', 'filled', 2],
      ['--o#', 'circle', 'filled', 2],
      ['--|', 'bar', 'unspecified', 2], ['--{', 'crow-foot', 'unspecified', 2],
      ['---->', 'arrow', 'open', 4],
      ['-', 'none', 'unspecified', 1],
    ] as const;
    for (const [operator, kind, fill, dashCount] of variants) {
      const parsed = parseCandidate028(`a service\nb service\na ${operator} b`);
      expect(parsed.diagnostics, operator).toEqual([]);
      const edge = parsed.statements[2]!;
      expect(edge.kind).toBe('edge');
      if (edge.kind !== 'edge') continue;
      expect(edge.operator.raw).toBe(operator);
      expect(edge.connector).toMatchObject({ dashCount, secondEnd: { kind, fill } });
      expect(parsed.graph.edges[0]?.sourceEnd?.marker).toEqual({ kind: 'none', fill: 'unspecified' });
      expect(parsed.graph.edges[0]?.targetEnd?.marker).toEqual({ kind, fill });
    }
  });

  it('tokenizes every staged solid second-end spelling at every approved dash count', () => {
    for (const dashCount of [1, 2, 3, 4, 5, 6] as const) {
      for (const suffix of ['', ...CONNECTOR_END_SPELLINGS_028]) {
        const operator = `${'-'.repeat(dashCount)}${suffix}`;
        const expected = parseConnector028(operator);
        expect(expected, operator).toBeDefined();
        const parsed = parseCandidate028(`first service\nsecond service\nfirst ${operator} second`);
        expect(parsed.diagnostics, operator).toEqual([]);
        const edge = parsed.statements.find((item) => item.kind === 'edge');
        expect(edge?.operator.raw, operator).toBe(operator);
        expect(edge?.connector, operator).toEqual(expected);
        expect(parsed.graph.edges[0], operator).toMatchObject({ source: 'first', target: 'second' });
      }
    }
  });

  it('rejects more than six shaft positions and invalid fill on a bar or crow foot', () => {
    const long = parseCandidate028('a service\nb service\na -------> b');
    expect(long.diagnostics.find((item) => item.code === 'coral.syntax.connector.dash-count')?.range?.start)
      .toMatchObject({ line: 3, column: 2 });
    const bar = parseCandidate028('a service\nb service\na --#| b');
    expect(bar.diagnostics.some((item) => item.code === 'coral.syntax.connector.fill-invalid')).toBe(true);
    const barAfter = parseCandidate028('a service\nb service\na --|# b');
    expect(barAfter.diagnostics.find((item) => item.code === 'coral.syntax.connector.fill-invalid')?.range?.start)
      .toMatchObject({ line: 3, column: 5 });
    for (const operator of ['--#{', '--{#']) {
      const crow = parseCandidate028(`a service\nb service\na ${operator} b`);
      expect(crow.diagnostics.some((item) => item.code === 'coral.syntax.connector.fill-invalid'), operator)
        .toBe(true);
    }
    const repeated = parseCandidate028('a service\nb service\na --##> b');
    expect(repeated.diagnostics.some((item) => item.code === 'coral.syntax.connector.fill-duplicate')).toBe(true);
    const repeatedAfter = parseCandidate028('a service\nb service\na --#># b');
    expect(repeatedAfter.diagnostics.find((item) => item.code === 'coral.syntax.connector.fill-duplicate')?.range?.start)
      .toMatchObject({ line: 3, column: 6 });
  });

  it('keeps sequence meaning across solid dash counts without inventing a bar message', () => {
    const parsed = parseCandidate028('a participant\nb participant\na --#> b\na ---> b\na --| b',
      { profile: 'uml-sequence' });
    expect(parsed.graph.interaction?.messages.map((message) => message.kind)).toEqual([
      'synchronous', 'asynchronous',
    ]);
    expect(parsed.graph.edges).toHaveLength(2);
    expect(parsed.statements.filter((item) => item.kind === 'edge').map((item) =>
      item.kind === 'edge' ? item.connector?.dashCount : undefined)).toEqual([2, 3, 2]);
    expect(parsed.diagnostics.some((item) => item.code === 'coral.sequence.operator.unsupported')).toBe(true);
  });
});
