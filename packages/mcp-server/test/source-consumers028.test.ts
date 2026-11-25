import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseAs } from '../src/tools/diagnostics.js';
import { handleLayout, readGraph } from '../src/tools/layout.js';
import { handleValidate } from '../src/tools/validate.js';
import { handleRender } from '../src/tools/render.js';
import { handleConvert } from '../src/tools/convert.js';
import { handleExplain } from '../src/tools/explain.js';

const source = '@diagram architecture\napi service as "API"\n' +
  'store database as "Store"\napi -> store [reads]\n';

describe('MCP Coral 0.2.8 source consumers', () => {
  it('validates every exact Coral authoring-skill example as portable source', async () => {
    const markdown = readFileSync(new URL('../../../skills/coral/SKILL.md', import.meta.url), 'utf8');
    const sources = [...markdown.matchAll(/^```coral\n([\s\S]*?)^```$/gm)].map((match) => match[1]);
    expect(sources).toHaveLength(4);
    for (const [index, content] of sources.entries()) {
      const checked = await handleValidate({ content, strict: true });
      expect(checked.isError, `authoring skill example ${index + 1}: ${checked.content[0].text}`)
        .toBeUndefined();
      expect(checked.structuredContent.diagnostics).toEqual([]);
    }
  });

  it('strictly validates the Claude syntax, conversion, and explanation examples', async () => {
    for (const [skill, expected] of [['coral-dsl', 4], ['coral-convert', 1],
      ['coral-explain', 1]] as const) {
      const markdown = readFileSync(new URL(`../../../.claude/skills/${skill}/SKILL.md`, import.meta.url), 'utf8');
      const sources = [...markdown.matchAll(/^```coral\n([\s\S]*?)^```$/gm)].map((match) => match[1]);
      expect(sources, skill).toHaveLength(expected);
      for (const [index, content] of sources.entries()) {
        const checked = await handleValidate({ content, strict: true });
        expect(checked.isError, `${skill} example ${index + 1}: ${checked.content[0].text}`)
          .toBeUndefined();
        expect(checked.structuredContent.diagnostics).toEqual([]);
      }
    }
  });

  it('converts the exact bounded Mermaid input shown by the Claude skill', async () => {
    const markdown = readFileSync(new URL('../../../.claude/skills/coral-convert/SKILL.md', import.meta.url), 'utf8');
    const source = /^```text\n(sequenceDiagram[\s\S]*?)^```$/m.exec(markdown)?.[1];
    expect(source).toBeDefined();
    const converted = await handleConvert({ content: source, from: 'mermaid', to: 'coral' });
    expect(converted.isError, converted.content[0].text).toBe(false);
    expect(converted.content[0].text).toContain('@diagram uml-sequence');
    expect(converted.structuredContent.diagnostics).toEqual([]);
  });

  it('explains the exact saved-source example shown by the Claude skill', async () => {
    const markdown = readFileSync(new URL('../../../.claude/skills/coral-explain/SKILL.md', import.meta.url), 'utf8');
    const source = /^```coral\n([\s\S]*?)^```$/m.exec(markdown)?.[1];
    expect(source).toBeDefined();
    const explained = await handleExplain({ content: source });
    expect(explained.isError, explained.content[0].text).toBeUndefined();
    expect(explained.content[0].text).toContain('API Gateway');
    expect(explained.content[0].text).toContain('PostgreSQL');
  });

  it('validates the exact skill examples and locates their missing reference', async () => {
    const markdown = readFileSync(new URL('../../../skills/coral-validate/SKILL.md', import.meta.url), 'utf8');
    const sources = [...markdown.matchAll(/^```coral\n([\s\S]*?)^```$/gm)].map((match) => match[1]);
    expect(sources).toHaveLength(2);
    const valid = await handleValidate({ content: sources[0] });
    expect(valid.isError).toBeUndefined();
    expect(valid.content[0].text).toContain('Validation: valid coral-dsl');
    const invalid = await handleValidate({ content: sources[1] });
    expect(invalid.isError).toBe(true);
    expect(invalid.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.reference.target.unresolved',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: sources[1]!.indexOf('missing'),
      }) }),
    }));
  });

  it('uses the installed successor validator for complete portable source', async () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'choice = alt "yes" {\n  client -> server\n} else "no" {\n  server -> client\n}\n';
    const checked = await handleValidate({ content: source, strict: true });
    expect(checked.isError).toBeUndefined();
    expect(checked.structuredContent.diagnostics).toEqual([]);
    expect(checked.content[0].text).toContain('Validation: valid coral-dsl');
  });

  it('exports an authored semantic-port route without changing source or port identity', async () => {
    const content = '@diagram architecture\nteam group {\n  api service {\n' +
      '    outbound port [direction: out, anchor: E]\n  }\n  db database\n' +
      '  request = api:outbound -> db\n  route edge request {\n' +
      '    bend = waypoint relative to port api:outbound offset (20, 0)\n  }\n}\n';
    const validated = await handleValidate({ content, strict: true });
    expect(validated.isError, validated.content[0].text).toBeUndefined();
    expect(validated.structuredContent.diagnostics).toEqual([]);
    const identity = await handleConvert({ content, from: 'coral', to: 'coral', strict: true });
    expect(identity.isError, identity.content[0].text).toBeUndefined();
    expect(identity.content[0].text.endsWith(content)).toBe(true);
    const converted = await handleConvert({ content, to: 'json' });
    expect(converted.isError, converted.content[0].text).toBeUndefined();
    const graph = JSON.parse(converted.content[0].text.slice(converted.content[0].text.indexOf('{')));
    expect(graph.edges[0].routeIntent.waypoints[0].placement).toEqual({ kind: 'relative',
      anchor: { kind: 'port', nodeId: 'team.api', portId: 'outbound' },
      offset: { x: 20, y: 0 } });
  });

  it('locates an unknown semantic-port route anchor and keeps its source saveable', async () => {
    const content = '@diagram architecture\napi service {\n' +
      '  outbound port [direction: out, anchor: E]\n}\nstore database\n' +
      'request = api:outbound -> store\nroute edge request {\n' +
      '  bend = waypoint relative to port api:absent offset (20, 0)\n}\n';
    const checked = await handleValidate({ content, strict: true });
    expect(checked.isError).toBe(true);
    expect(checked.structuredContent.diagnostics).toHaveLength(1);
    expect(checked.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      code: 'GRAPHIR.INVALID_ROUTE_PORT_REFERENCE',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: content.indexOf('api:absent') + 'api:'.length,
      }) }),
    }));
    const identity = await handleConvert({ content, from: 'coral', to: 'coral', strict: true });
    expect(identity.isError).toBe(true);
    expect(JSON.stringify(identity.structuredContent.diagnostics))
      .toContain('INVALID_ROUTE_PORT_REFERENCE');
  });

  it('validates the exact GraphIR 4 JSON exported from saved Coral', async () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'choice = alt "yes" {\n  client -> server\n} else "no" {\n  server -> client\n}\n';
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBeUndefined();
    const text = converted.content[0].text;
    const checked = await handleValidate({ content: text.slice(text.indexOf('{')), strict: true });
    expect(checked.isError).toBeUndefined();
    expect(checked.structuredContent.diagnostics).toEqual([]);
    expect(checked.content[0].text).toContain('Validation: valid graph-ir-json');

    const changed = JSON.parse(text.slice(text.indexOf('{')));
    changed.catalog.digest = 'sha256-' + '0'.repeat(64);
    const refused = await handleValidate({ content: JSON.stringify(changed) });
    expect(refused.isError).toBe(true);
    expect(refused.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.validate.successor-catalog.unavailable',
    }));

    const malformed = JSON.parse(text.slice(text.indexOf('{')));
    delete malformed.interaction.participantOrder;
    const invalid = await handleValidate({ content: JSON.stringify(malformed) });
    expect(invalid.isError).toBe(true);
    expect(invalid.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error', message: expect.stringContaining('GraphIR path /interaction'),
    }));
  });

  it('keeps reserved lost/found GraphIR messages explicit and unverified at the MCP boundary', async () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'request = client -> server\n';
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBeUndefined();
    const text = converted.content[0].text;
    const graph = JSON.parse(text.slice(text.indexOf('{')));
    graph.edges = [];
    graph.interaction.messages = [
      { id: 'lost', kind: 'lost', senderParticipantId: 'client', missingReceiver: true },
      { id: 'found', kind: 'found', missingSender: true, receiverParticipantId: 'server' },
    ];
    graph.interaction.items = [
      { kind: 'message', id: 'lost' }, { kind: 'message', id: 'found' },
    ];
    const content = JSON.stringify(graph);
    const checked = await handleValidate({ content });
    expect(checked.isError).toBeUndefined();
    expect(checked.structuredContent.diagnostics).toEqual([
      expect.objectContaining({ severity: 'warning',
        code: 'coral.validate.successor-portability.unverified',
        message: expect.stringContaining('INTERACTION_MISSING_END_CAPABILITY_UNVERIFIED') }),
    ]);
    const strict = await handleValidate({ content, strict: true });
    expect(strict.isError).toBe(true);
    expect(strict.structuredContent.diagnostics).toEqual(checked.structuredContent.diagnostics);

    graph.interaction.messages[0].receiverParticipantId = 'server';
    const invented = await handleValidate({ content: JSON.stringify(graph) });
    expect(invented.isError).toBe(true);
    expect(invented.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error', message: expect.stringContaining('GraphIR path /interaction/messages/0'),
    }));
  });

  it('validates nested recursive source with the installed successor contract', async () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  retry = alt "again" {\n    a -> b\n' +
      '  } else "stop" {\n    b -> a\n  }\n} else "no" {\n  b -> a\n}';
    const checked = await handleValidate({ content: source });
    expect(checked.content[0].text).toContain('2 nodes, 3 edges');
    expect(checked.structuredContent.diagnostics).toEqual([]);
    expect(checked.structuredContent.diagnostics.map((item) => item.code))
      .not.toContain('render.capability.sequence-fragment');
    expect(checked.structuredContent.diagnostics.some((item) =>
      item.code.startsWith('coral.syntax.'))).toBe(false);
  });
  it('reports independent symbol and port faults in a recursive scene', async () => {
    const source = '@diagram uml-sequence\nclient participant [symbol: "missing-symbol"]\n' +
      'server participant\nchoice = alt "yes" {\n  retry = alt "again" {\n' +
      '    client -> server:missing\n  } else "stop" {\n    server -> client\n  }\n' +
      '} else "no" {\n  server -> client\n}\n';
    const rendered = await handleRender({ content: source });
    expect(rendered.isError).toBe(true);
    expect(rendered.structuredContent?.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'coral.symbol.unknown' }),
      expect.objectContaining({ code: 'coral.port.reference.missing' }),
    ]));
    const validated = await handleValidate({ content: source });
    expect(validated.isError).toBe(true);
    expect(validated.structuredContent.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'coral.symbol.unknown' }),
      expect.objectContaining({ code: 'coral.port.reference.missing' }),
    ]));
  });
  it('uses the source-selected graph in the shared reader and validation tool', async () => {
    const parsed = parseAs('coral', source);
    expect(parsed).toMatchObject({ success: true,
      graph: { metadata: { notation: 'architecture' }, nodes: [
        { id: 'api', type: 'service', label: 'API' },
        { id: 'store', type: 'database', label: 'Store' },
      ], edges: [{ source: 'api', target: 'store', type: 'reads' }] },
    });
    expect(readGraph(source)).toEqual(parsed.graph);
    const validated = await handleValidate({ content: source });
    expect(validated.isError).toBeUndefined();
    expect(validated.content[0].text).toContain('Validation: valid coral-dsl');
  });

  it('validates reverse sequence source without mistaking GraphIR 3 projection limits for syntax errors', async () => {
    const reverse = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'reply = client <- server as "done"\n';
    const checked = await handleValidate({ content: reverse });
    expect(checked.isError).toBeUndefined();
    expect(checked.content[0].text).toContain('Validation: valid coral-dsl');
    expect(checked.content[0].text).toContain('2 nodes, 1 edges');
    expect(checked.structuredContent.diagnostics).toEqual([]);
    expect(checked.structuredContent.diagnostics.some((item) =>
      item.code === 'coral.sequence.operator.unsupported')).toBe(false);
    const strict = await handleValidate({ content: reverse, strict: true });
    expect(strict.isError).toBeUndefined();
  });

  it('validates ordinary saved-header semantic ports through source meaning, not GraphIR 3 geometric ports', async () => {
    const source = '@diagram architecture\napi service\nstore database\n' +
      'read = api:out -> store:query [reads]\n';
    const checked = await handleValidate({ content: source });
    expect(checked.isError).toBeUndefined();
    expect(checked.content[0].text).toContain('2 nodes, 1 edges');
    expect(checked.structuredContent.diagnostics).toEqual([]);
    expect(checked.structuredContent.schemaIssues).toEqual([]);

    const invalid = source.replace('api:out', 'api:missing');
    const rejected = await handleValidate({ content: invalid });
    expect(rejected.isError).toBe(true);
    expect(rejected.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.port.reference.missing',
      range: expect.objectContaining({ start: expect.objectContaining({ offset: invalid.indexOf('missing') }) }),
    }));
  });

  it('locates an invalid catalog port role when a keyed end hides the written arrow', async () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'link = a:in -> b:out [secondEnd: zeroOrOne]';
    const checked = await handleValidate({ content: source });
    expect(checked.isError).toBe(true);
    expect(checked.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.port.reference.direction',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('a:in') + 2,
      }) }),
    }));
  });

  it('reports a keyed unknown catalog symbol at its source value in validation and render', async () => {
    const invalid = '@diagram architecture\napi service [symbol: "missing-symbol"]\n';
    const validated = await handleValidate({ content: invalid });
    expect(validated.isError).toBe(true);
    expect(validated.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.symbol.unknown',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: invalid.indexOf('"missing-symbol"'),
      }) }),
    }));
    const rendered = await handleRender({ content: invalid });
    expect(rendered.isError).toBe(true);
    expect(rendered.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.symbol.unknown',
    }));
  });

  it('rejects a source-declared catalog-port collision at the declaration in render', async () => {
    const invalid = '@diagram architecture\napi service {\n  out port [direction: out]\n}\n';
    const rendered = await handleRender({ content: invalid });
    expect(rendered.isError).toBe(true);
    expect(rendered.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.port.duplicate',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: invalid.indexOf('out port'),
      }) }),
    }));
  });

  it('reports a grouped child symbol at its exact source token in validation', async () => {
    const source = '@diagram architecture\nteam group {\n' +
      '  api service [symbol: "missingStencil"]\n}';
    const checked = await handleValidate({ content: source });
    expect(checked.isError).toBe(true);
    expect(checked.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.symbol.unknown', subject: { kind: 'node', id: 'team.api' },
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('"missingStencil"'),
      }) }),
    }));
  });

  it('reports sequence participant-port scene limits at the authored port in render', async () => {
    const source = '@diagram uml-sequence\nclient participant {\n  send port [direction: out]\n}\nserver participant\nclient -> server';
    const rendered = await handleRender({ content: source });
    expect(rendered.isError).toBe(true);
    expect(rendered.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'render.capability.sequence-semantic-port',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('send port'),
      }) }),
    }));
  });

  it('renders and validates supported sequence destruction without a capability warning', async () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'close = client -> server [destroy] as "stop"';
    const rendered = await handleRender({ content: source });
    expect(rendered.isError).toBeUndefined();
    expect(rendered.content[0].text).toContain('data-coral-destruction-message="close"');
    const checked = await handleValidate({ content: source, strict: true });
    expect(checked.isError).toBeUndefined();
    expect(checked.structuredContent.diagnostics).toEqual([]);
  });

  it('keeps a stale source exception invalid even when validation requests no notation rules', async () => {
    const source = '@diagram flowchart\napi process [symbol: "arch-database", conformanceException: "arch-service"]';
    const checked = await handleValidate({ content: source });
    expect(checked.isError).toBe(true);
    expect(checked.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      code: 'CORAL.CONFORMANCE.EXCEPTION.INVALID',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.lastIndexOf('"arch-service"'),
      }) }),
    }));
  });

  it('locates an unresolved reverse-message endpoint instead of reporting only an old-model operator error', async () => {
    const source = '@diagram uml-sequence\nclient participant\nclient <- absent';
    const checked = await handleValidate({ content: source });
    expect(checked.isError).toBe(true);
    expect(checked.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.reference.target.unresolved',
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('absent') }) }),
    }));
    expect(checked.structuredContent.diagnostics.some((item) =>
      item.code === 'coral.sequence.operator.unsupported')).toBe(false);
  });

  it('locates invalid reverse-message ports at the written endpoint tokens', async () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'client:missing <- server:unknown';
    const checked = await handleValidate({ content: source });
    expect(checked.isError).toBe(true);
    expect(checked.structuredContent.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'coral.port.reference.missing',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.indexOf('client:missing') + 7,
        }) }) }),
      expect.objectContaining({ code: 'coral.port.reference.missing',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.indexOf('server:unknown') + 7,
        }) }) }),
    ]));
  });

  it('never accepts source without a required diagram header', async () => {
    const invalid = 'api service\nstore database\napi -> store\n';
    expect(parseAs('coral', invalid).diagnostics.map((item) => item.code))
      .toContain('header.diagram.required');
    expect(() => readGraph(invalid)).toThrow(/header.diagram.required/);
    const validated = await handleValidate({ content: invalid });
    expect(validated.isError).toBe(true);
    expect(validated.structuredContent.diagnostics.map((item) => item.code))
      .toContain('header.diagram.required');
  });

  it('renders the selected architecture source without substituting a notation', async () => {
    const response = await handleRender({ content: source });
    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain('<svg');
    expect(response.content[0].text).toContain('API');
  });

  it('rejects an explicit render notation that conflicts with the source header', async () => {
    const conflict = await handleRender({ content: source, options: { notation: 'flowchart' } });
    expect(conflict.isError).toBe(true);
    expect(JSON.stringify(conflict)).toContain('mcp.render.notation.conflict');
    expect(JSON.stringify(conflict)).not.toContain('<svg');
    const matching = await handleRender({ content: source, options: { notation: 'architecture' } });
    expect(matching.isError).toBeUndefined();
    const invalid = await handleRender({ content: '@diagram architecture\na service\n!!!',
      options: { notation: 'flowchart' } });
    expect(invalid.isError).toBe(true);
    expect(JSON.stringify(invalid)).toContain('coral.syntax.token.invalid');
    expect(JSON.stringify(invalid)).not.toContain('mcp.render.notation.conflict');
  });

  it('does not claim generic layout for a sequence interaction', async () => {
    const sequence = '@diagram uml-sequence\nclient actor\nserver participant\nclient -#> server as "load()"';
    const result = await handleLayout({ content: sequence });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('mcp.layout.sequence.unsupported');
  });

  it('does not silently omit groups or sequence meaning from explanations', async () => {
    const grouped = '@diagram architecture\nplatform group {\n  api service\n}\n';
    const sequence = '@diagram uml-sequence\nclient actor\nserver participant\nclient -#> server as "load()"';
    for (const content of [grouped, sequence]) {
      const result = await handleExplain({ content });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain('mcp.explain.construct.unsupported');
    }
  });
});


it('validates and exports the exact Batch pipeline source without changing its authored spelling', async () => {
  const content = readFileSync(new URL('../../diagram-editor/src/example-sources/data-engineering.coral', import.meta.url), 'utf8');
  const checked = await handleValidate({ content, strict: true });
  expect(checked.isError, checked.content[0].text).toBeUndefined();
  expect(checked.structuredContent.diagnostics).toEqual([]);
  const identity = await handleConvert({ content, from: 'coral', to: 'coral', strict: true });
  expect(identity.isError, identity.content[0].text).toBeUndefined();
  expect(identity.content[0].text.endsWith(content)).toBe(true);
  const converted = await handleConvert({ content, to: 'json' });
  expect(converted.isError, converted.content[0].text).toBeUndefined();
  const text = converted.content[0].text;
  const graph = JSON.parse(text.slice(text.indexOf('{')));
  expect(graph.edges.map(({ type }: { type: string }) => type))
    .toEqual(['batch-flow', 'batch-flow', 'quality', 'quality']);
  const refused = await handleValidate({ content: content.replace('[batchFlow]', '[batch-flow]') });
  expect(refused.isError).toBe(true);
});
