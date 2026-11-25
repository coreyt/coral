import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getAvailableNotations028 } from '@coral-viz/render';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createCoralMcpServer } from '../src/server.js';

// Each scenario owns a real client/server pair; calls within a scenario retain
// their protocol chain and cleanup even when an assertion fails.
async function withClient(name: string, run: (client: Client) => Promise<void>) {
  const server = createCoralMcpServer();
  const client = new Client({ name, version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

describe('Coral 0.2.8 source over MCP', () => {
  it('imports a bounded Mermaid sequence, then validates and renders its exact Coral text', async () => {
    await withClient('coral-import-test', async (client) => {
      const imported = 'sequenceDiagram\nparticipant A\nparticipant B\nA->>B: hi\nB-->>A: done';
      const converted = await client.callTool({ name: 'coral_convert', arguments: {
        content: imported, from: 'mermaid', to: 'coral', strict: true,
      } });
      expect(converted.isError).toBeFalsy();
      const output = (converted.content[0] as { text: string }).text;
      const source = output.slice(output.indexOf('@diagram'));
      expect(source).toContain('@diagram uml-sequence\n');
      expect(source).toContain('msg_1 = A -#> B as "hi"');
      const validated = await client.callTool({ name: 'coral_validate', arguments: { content: source } });
      expect(validated.isError).toBeFalsy();
      const rendered = await client.callTool({ name: 'coral_render', arguments: { content: source } });
      expect(rendered.isError).toBeFalsy();
      expect(JSON.stringify(rendered.content)).toContain('msg_2');
    });
  });

  it('imports Mermaid alternatives, notes and loops, then validates and renders the written source', async () => {
    await withClient('coral-import-test', async (client) => {
      const alternative = await client.callTool({ name: 'coral_convert', arguments: {
        content: 'sequenceDiagram\nparticipant A\nparticipant B\n' +
          'Note over A,B: shared\nalt accepted\nA->>B: request\nelse rejected\n' +
          'B-->>A: denied\nend\nloop retry\nA->>B: again\nend',
        from: 'mermaid', to: 'coral', strict: true,
      } });
      expect(alternative.isError).toBeFalsy();
      const alternativeSource = (alternative.content[0] as { text: string }).text;
      expect(alternativeSource).toContain('alt "accepted" {');
      expect(alternativeSource).toContain('note "shared" on A, B');
      expect(alternativeSource).toContain('loop "retry" {');
      expect((await client.callTool({ name: 'coral_validate', arguments: {
        content: alternativeSource.slice(alternativeSource.indexOf('@diagram')),
      } })).isError).toBeFalsy();
      expect((await client.callTool({ name: 'coral_render', arguments: {
        content: alternativeSource.slice(alternativeSource.indexOf('@diagram')),
      } })).isError).toBeFalsy();
    });
  });

  it.each(['loop', 'opt cache miss'])('imports Mermaid %s, then validates and renders its written source', async (head) => {
    await withClient('coral-import-test', async (client) => {
      const fragment = await client.callTool({ name: 'coral_convert', arguments: {
        content: `sequenceDiagram\nparticipant A\nparticipant B\n${head}\nA->>B: try\nend`,
        from: 'mermaid', to: 'coral', strict: true,
      } });
      expect(fragment.isError, head).toBeFalsy();
      const written = (fragment.content[0] as { text: string }).text;
      const source = written.slice(written.indexOf('@diagram'));
      expect((await client.callTool({ name: 'coral_validate', arguments: { content: source } })).isError,
        head).toBeFalsy();
      expect((await client.callTool({ name: 'coral_render', arguments: { content: source } })).isError,
        head).toBeFalsy();
    });
  });

  it('refuses unsupported Mermaid activation without emitting Coral source', async () => {
    await withClient('coral-import-test', async (client) => {
      const unsupported = await client.callTool({ name: 'coral_convert', arguments: {
        content: 'sequenceDiagram\nparticipant A\nparticipant B\nA->>+B: hi\nB-->>-A: done',
        from: 'mermaid', to: 'coral', strict: true,
      } });
      expect(unsupported.isError).toBe(true);
      expect(unsupported.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
        code: 'mcp.coral028.import.unsupported',
      }));
      expect(JSON.stringify(unsupported.content)).not.toContain('@diagram');
    });
  });

  const fixtures = [
    ['architecture', 'architecture-ports.coral'], ['block', 'block-ports.coral'],
    ['flowchart', 'flowchart-draft.coral'], ['bpmn', 'bpmn-event.coral'],
    ['uml-class', 'uml-class-named.coral'],
    ['uml-sequence', 'uml-sequence-flat.coral'],
  ] as const;
  const smoke = [
    ['code', 'function', 'class'], ['aiml', 'model', 'dataset'],
    ['data-engineering', 'source', 'warehouse'], ['sketch', 'box', 'box'],
  ] as const;
  const sources = [
    ...fixtures.map(([profile, filename]) => ({ profile,
      source: readFileSync(new URL(`../../browser/test/fixtures/acceptance028/${filename}`,
        import.meta.url), 'utf8') })),
    ...smoke.map(([profile, first, second]) => ({ profile,
      source: `@diagram ${profile}\na ${first}\nb ${second}\nlink = a -> b\n` })),
  ];

  it('covers every installed diagram profile in the protocol source matrix', () => {
    expect(new Set(sources.map(({ profile }) => profile)))
      .toEqual(new Set(getAvailableNotations028().map(({ id }) => id)));
  });

  it.each(sources)('converts and preserves authored $profile source over the real protocol', async ({ profile, source }) => {
    await withClient('coral-profile-test', async (client) => {
      const converted = await client.callTool({ name: 'coral_convert', arguments: {
        content: source, from: 'coral', to: 'json', strict: true,
      } });
      expect(converted.isError, profile).toBeFalsy();
      expect(converted.structuredContent?.modelVerification, profile)
        .toEqual({ scope: 'full', complete: true });
      const output = (converted.content[0] as { text: string }).text;
      const graph = JSON.parse(output.slice(output.indexOf('{')));
      expect(graph.version, profile).toBe('4.0.0');
      expect(graph.catalog.id, profile).toBe(profile);
      expect(graph.conformanceLevel, profile).toBe('typical');
      expect(graph.nodes.length, profile).toBeGreaterThan(0);
      expect(graph.edges.length, profile).toBeGreaterThan(0);
      if (profile.startsWith('uml-')) {
        expect(graph.profile, profile).toMatchObject({ id: 'uml',
          kind: profile.slice('uml-'.length) });
      } else expect(graph.profile.id, profile).toBe(profile);
      if (profile === 'architecture') expect(graph.edges).toContainEqual(expect.objectContaining({
        id: 'read', first: { node: 'api', port: 'audit' },
        second: { node: 'store', port: 'query' }, type: 'reads', label: 'Order IDs',
      }));
      if (profile === 'uml-class') expect(graph.nodes[0].classifier.compartments[1].items)
        .toContainEqual(expect.objectContaining({ name: 'id' }));
      if (profile === 'uml-sequence') expect(graph.interaction.messages)
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ id: 'call', kind: 'synchronous' }),
          expect.objectContaining({ id: 'reply', kind: 'return' }),
        ]));
      const identity = await client.callTool({ name: 'coral_convert', arguments: {
        content: source, from: 'coral', to: 'coral', strict: true,
      } });
      expect(identity.isError, profile).toBeFalsy();
      expect((identity.content[0] as { text: string }).text.endsWith(source), profile).toBe(true);
    });
  });

  it('refuses disabled Chen source through protocol conversion', async () => {
    await withClient('coral-profile-test', async (client) => {
      const chenSource = readFileSync(new URL(
        '../../browser/test/fixtures/acceptance028/erd-relationship.coral', import.meta.url), 'utf8');
      const chen = await client.callTool({ name: 'coral_convert', arguments: {
        content: chenSource, from: 'coral', to: 'json', strict: true,
      } });
      expect(chen.isError).toBe(true);
      expect(chen.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
        code: 'header.diagram.disabled',
      }));
    });
  });

  it('shares valid authored source across validation, layout, render, explain and conversion', async () => {
    await withClient('coral-source-test', async (client) => {
      const source = '@diagram architecture\napi service as "API"\nstore database as "Store"\napi -> store [reads]\n';
      for (const name of ['coral_validate', 'coral_layout', 'coral_render',
        'coral_explain', 'coral_convert'] as const) {
        const response = await client.callTool({ name, arguments: {
          content: source, ...(name === 'coral_convert' ? { to: 'json' } : {}),
        } });
        expect(response.isError, name).toBeFalsy();
        const expected = name === 'coral_validate' ? '2 nodes'
          : name === 'coral_render' || name === 'coral_explain' ? 'API' : 'api';
        expect(JSON.stringify(response).includes(expected), name).toBe(true);
      }
    });
  });

  it('explains required arrangements at every detail level and when focused', async () => {
    await withClient('coral-source-test', async (client) => {
      const arranged = '@diagram architecture\na service\nb service\n' +
        'lane = arrange row: a, b\n';
      for (const level of ['brief', 'standard', 'detailed'] as const) {
        const explained = await client.callTool({ name: 'coral_explain', arguments: {
          content: arranged, level,
        } });
        expect(explained.isError, level).toBeFalsy();
        expect((explained.content[0] as { text: string }).text, level)
          .toContain('required arrangement "lane": row order a, b');
      }
      const focusedArrangement = await client.callTool({ name: 'coral_explain', arguments: {
        content: arranged, focus: 'a',
      } });
      expect(focusedArrangement.isError).toBeFalsy();
      expect((focusedArrangement.content[0] as { text: string }).text)
        .toContain('required arrangement "lane": row order a, b');
    });
  });

  it('explains reverse connector direction, labels and focused endpoint meaning', async () => {
    await withClient('coral-source-test', async (client) => {
      const reverseSource = '@diagram architecture\nclient service as "Client"\n' +
        'server service as "Server"\n' +
        'reply = client:in <- server:out [calls] as "Reply"\n';
      const reverseBrief = await client.callTool({ name: 'coral_explain', arguments: {
        content: reverseSource, level: 'brief',
      } });
      expect(reverseBrief.isError).toBeFalsy();
      expect((reverseBrief.content[0] as { text: string }).text)
        .toContain('receives requests through Server');
      const reverseStandard = await client.callTool({ name: 'coral_explain', arguments: {
        content: reverseSource, level: 'standard',
      } });
      expect((reverseStandard.content[0] as { text: string }).text)
        .toContain('Server:out → Client:in; label "Reply"');
      const reverseFocus = await client.callTool({ name: 'coral_explain', arguments: {
        content: reverseSource, focus: 'client',
      } });
      expect((reverseFocus.content[0] as { text: string }).text)
        .toContain('Server:out (calls; label "Reply"; first end at client: arrow)');
    });
  });

  it('explains plain connectors as undirected without claiming isolation', async () => {
    await withClient('coral-source-test', async (client) => {
      const plain = '@diagram architecture\nclient service as "Client"\n' +
        'server service as "Server"\nclient -- server\n';
      const plainBrief = await client.callTool({ name: 'coral_explain', arguments: {
        content: plain, level: 'brief',
      } });
      expect((plainBrief.content[0] as { text: string }).text)
        .not.toContain('receives requests through');
      const plainStandard = await client.callTool({ name: 'coral_explain', arguments: {
        content: plain, level: 'standard',
      } });
      expect((plainStandard.content[0] as { text: string }).text)
        .toContain('Client — Server');
      const plainFocus = await client.callTool({ name: 'coral_explain', arguments: {
        content: plain, focus: 'client',
      } });
      expect((plainFocus.content[0] as { text: string }).text)
        .toContain('Server (undirected connection)');
      expect((plainFocus.content[0] as { text: string }).text)
        .not.toContain('isolated node');
    });
  });

  it('locates an unknown symbol refusal in source explanation', async () => {
    await withClient('coral-source-test', async (client) => {
      const unknownSymbol = '@diagram architecture\na service [symbol: "missing-symbol"]\n';
      const symbolExplanation = await client.callTool({ name: 'coral_explain', arguments: {
        content: unknownSymbol,
      } });
      expect(symbolExplanation.isError).toBe(true);
      expect(symbolExplanation.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
        code: 'coral.symbol.unknown',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: unknownSymbol.indexOf('"missing-symbol"'),
        }) }),
      }));
    });
  });

  it('locates a missing semantic port refusal in source explanation', async () => {
    await withClient('coral-source-test', async (client) => {
      const unknownPort = '@diagram architecture\na service\nb service\na:missing -> b\n';
      const portExplanation = await client.callTool({ name: 'coral_explain', arguments: {
        content: unknownPort,
      } });
      expect(portExplanation.isError).toBe(true);
      expect(portExplanation.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
        code: 'coral.port.reference.missing',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: unknownPort.indexOf('missing'),
        }) }),
      }));
    });
  });

  it('locates a stale conformance exception refusal in source explanation', async () => {
    await withClient('coral-source-test', async (client) => {
      const staleException = '@diagram flowchart\n' +
        'api process [symbol: "arch-database", conformanceException: "arch-service"]\n';
      const exceptionExplanation = await client.callTool({ name: 'coral_explain', arguments: {
        content: staleException,
      } });
      expect(exceptionExplanation.isError).toBe(true);
      expect(exceptionExplanation.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
        code: 'CORAL.CONFORMANCE.EXCEPTION.INVALID',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: staleException.indexOf('"arch-service"'),
        }) }),
      }));
    });
  });

  it('refuses missing diagram headers consistently across every source tool', async () => {
    await withClient('coral-source-test', async (client) => {
      const invalid = 'api service\n';
      for (const name of ['coral_validate', 'coral_layout', 'coral_render',
        'coral_explain', 'coral_convert'] as const) {
        const response = await client.callTool({ name, arguments: { content: invalid } });
        expect(response.isError, name).toBe(true);
        expect(JSON.stringify(response), name).toContain('header.diagram.required');
      }
    });
  });

  it('refuses render notation conflicts without emitting SVG', async () => {
    await withClient('coral-source-test', async (client) => {
      const source = '@diagram architecture\napi service as "API"\nstore database as "Store"\napi -> store [reads]\n';
      const conflict = await client.callTool({ name: 'coral_render',
        arguments: { content: source, options: { notation: 'flowchart' } } });
      expect(conflict.isError).toBe(true);
      expect(JSON.stringify(conflict)).toContain('mcp.render.notation.conflict');
      expect(JSON.stringify(conflict)).not.toContain('<svg');
    });
  });

  it('refuses sequence layout without a supported layout contract', async () => {
    await withClient('coral-source-test', async (client) => {
      const sequence = '@diagram uml-sequence\nclient actor\nserver participant\nclient -#> server as "load()"';
      const layout = await client.callTool({ name: 'coral_layout', arguments: { content: sequence } });
      expect(layout.isError).toBe(true);
      expect(JSON.stringify(layout)).toContain('mcp.layout.sequence.unsupported');
    });
  });

  it('validates and renders reverse sequence messages with exact identity', async () => {
    await withClient('coral-source-test', async (client) => {
      const reverse = '@diagram uml-sequence\nclient participant\nserver participant\n' +
        'reply = client <- server as "done"';
      const reverseValidation = await client.callTool({ name: 'coral_validate',
        arguments: { content: reverse } });
      expect(reverseValidation.isError).toBeFalsy();
      expect(JSON.stringify(reverseValidation)).not.toContain('coral.validate.successor-portability.unverified');
      const reverseRender = await client.callTool({ name: 'coral_render', arguments: { content: reverse } });
      expect(reverseRender.isError).toBeFalsy();
      expect((reverseRender.content[0] as { text: string }).text).toContain('data-coral-sequence-message="reply"');
    });
  });

  it('exports recursive sequence fragment structure', async () => {
    await withClient('coral-source-test', async (client) => {
      const recursive = '@diagram uml-sequence\nclient participant\nserver participant\n' +
        'choice = alt "yes" {\n  client -> server\n} else "no" {\n  server -> client\n}';
      const convertedRecursive = await client.callTool({ name: 'coral_convert',
        arguments: { content: recursive, to: 'json' } });
      expect(convertedRecursive.isError).toBeFalsy();
      expect((convertedRecursive.content[0] as { text: string }).text).toContain('"version": "4.0.0"');
      expect((convertedRecursive.content[0] as { text: string }).text).toContain('"id": "choice"');
    });
  });

  it.each([
    '@diagram architecture\na service\nb service\npaint = a -> b [style: #FF0000]\n',
    '@diagram architecture\r\n// Keep these bytes\r\na service\r\nb service\r\n' +
      'paint = a -> b [style: #FF0000]\r\n',
    '@diagram uml-sequence\na participant\nb participant\n' +
      'path = par "first" {\n  a -> b\n} and {\n  b -> a\n}\n',
    '@diagram uml-sequence\n@conformanceLevel strict\n' +
      'client participant\nserver participant\nclient -#> server [async]\n',
  ].map((portableSource, index) => ({
    scenario: ['architecture LF', 'architecture CRLF', 'parallel sequence', 'strict async sequence'][index],
    portableSource,
  })))('preserves exact $scenario source in strict identity conversion', async ({ portableSource }) => {
    await withClient('coral-source-test', async (client) => {
      const identity = await client.callTool({ name: 'coral_convert', arguments: {
        content: portableSource, from: 'coral', to: 'coral', strict: true,
      } });
      expect(identity.isError, portableSource).toBeFalsy();
      expect((identity.content[0] as { text: string }).text.endsWith(portableSource), portableSource)
        .toBe(true);
    });
  });

  it('refuses identity conversion of a malformed sequence fragment', async () => {
    await withClient('coral-source-test', async (client) => {
      const malformedFragment = '@diagram uml-sequence\na participant\nb participant\n' +
        'path = alt "only" {\n  a -> b\n}\n';
      const refusedIdentity = await client.callTool({ name: 'coral_convert', arguments: {
        content: malformedFragment, from: 'coral', to: 'coral', strict: true,
      } });
      expect(refusedIdentity.isError).toBe(true);
      expect(refusedIdentity.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
        code: 'coral.sequence.fragment.operands',
      }));
    });
  });

  it('refuses identity conversion with an unknown style term', async () => {
    await withClient('coral-source-test', async (client) => {
      const unknownStyle = '@diagram architecture\na service\nb service\n' +
        'a -> b [style: mintGreen]\n';
      const refusedStyle = await client.callTool({ name: 'coral_convert', arguments: {
        content: unknownStyle, from: 'coral', to: 'coral', strict: true,
      } });
      expect(refusedStyle.isError).toBe(true);
      expect(refusedStyle.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
        code: 'coral.style.term.unknown',
      }));
    });
  });

  it('refuses graph export for an unknown symbol', async () => {
    await withClient('coral-source-test', async (client) => {
      const badSymbol = await client.callTool({ name: 'coral_convert', arguments: {
        content: '@diagram architecture\na service [symbol: "missing-symbol"]', to: 'json',
      } });
      expect(badSymbol.isError).toBe(true);
      expect(JSON.stringify(badSymbol)).toContain('coral.symbol.unknown');
    });
  });

  it('generates authored Coral source, then validates and renders the exact generated text', async () => {
    await withClient('coral-source-test', async (client) => {
      const generated = await client.callTool({ name: 'coral_generate',
        arguments: { description: 'A service and a database' } });
      expect(generated.isError).toBeFalsy();
      const generatedText = (generated.content[0] as { text: string }).text;
      const generatedSource = generatedText.slice(generatedText.indexOf('\n\n') + 2);
      expect(generatedSource).toMatch(/^@diagram architecture\n/);
      expect(generatedSource).not.toContain('@graph');
      const generatedValidation = await client.callTool({ name: 'coral_validate',
        arguments: { content: generatedSource } });
      expect(generatedValidation.isError).toBeFalsy();
      const generatedRender = await client.callTool({ name: 'coral_render',
        arguments: { content: generatedSource } });
      expect(generatedRender.isError).toBeFalsy();
    });
  });

  it('refuses unsupported Mermaid import without a writer contract', async () => {
    await withClient('coral-source-test', async (client) => {
      const unsupportedImport = await client.callTool({ name: 'coral_convert',
        arguments: { content: 'graph TD\n A[Alpha] --> B[Beta]' } });
      expect(unsupportedImport.isError).toBe(true);
      expect(JSON.stringify(unsupportedImport)).toContain('mcp.coral028.writer.unavailable');
    });
  });

});
