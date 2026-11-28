import { describe, it, expect } from 'vitest';
import { handleConvert, detectFormat, convertTool,
  verifySuccessorCandidateForConversion028 } from '../src/tools/convert.js';
import { detectFormat as detectSharedFormat, parseMermaid } from '@coral-viz/language';
import { parseInstalledDocument028, verifyPortableSuccessorSource028 } from '@coral-viz/render';

/** coral_convert now delegates to @coral-viz/language - R-021. */

const textOf = (r: Awaited<ReturnType<typeof handleConvert>>) =>
  (r.content[0] as { text: string }).text;

describe('coral_convert', () => {
  describe('format detection', () => {
    it.each([
      ['@startuml\n[A]\n@enduml', 'plantuml'],
      ['digraph G { a -> b }', 'dot'],
      ['graph TD\n A --> B', 'mermaid'],
      ['@diagram architecture\na service as "A"', 'coral'],
    ])('detects %j as %s', (source, expected) => {
      expect(detectFormat(source)).toBe(expected);
    });

    // R-064 AC-1: MCP and the editor decide the format with one detector.
    it.each([
      '@startuml\nA -> B\n@enduml', 'sequenceDiagram\nA->>B: hi', 'graph LR\nA-->B',
      'strict digraph G {\n a -> b\n}', 'flowchart TD\n  A --> B', '@graph "x"\nservice a', '',
      '  @startuml', 'erDiagram\n A ||--o{ B : has', 'graph TD { a }',
    ])('agrees with the shared detector on %j', (source) => {
      const shared = detectSharedFormat(source).format;
      const expected = shared === 'mermaid' || shared === 'dot' || shared === 'plantuml' ? shared : 'coral';
      expect(detectFormat(source)).toBe(expected);
    });

    it('delegates to the shared detector rather than a private copy', async () => {
      const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/tools/convert.ts', import.meta.url), 'utf8'));
      expect(source).not.toMatch(/sequenceDiagram\|classDiagram/);
    });
  });

  describe('conversion', () => {
    it.each([
      ['headerless', 'service "API" as api'],
      ['retired header', '@graph {"id":"old"}\nservice "API" as api'],
    ])('refuses %s Coral before any GraphIR conversion', async (_name, content) => {
      for (const to of ['json', 'coral'] as const) {
        const converted = await handleConvert({ content, from: 'coral', to });
        expect(converted.isError).toBe(true);
        expect(converted.structuredContent.diagnostics).toEqual(expect.arrayContaining([
          expect.objectContaining({ code: 'header.diagram.required' }),
        ]));
        expect(textOf(converted)).not.toContain('"version": "3.0.0"');
      }
    });

    it.each([
      ['GraphIR JSON', JSON.stringify({ version: '3.0.0', id: 'g', nodes: [], edges: [] }), 'graphir-json'],
      ['Coral document JSON', JSON.stringify({
        schemaVersion: '1.0.0', metadata: { name: 'Doc' }, content: { format: 'graph-ir' },
      }), 'coral-document'],
    ])('rejects recognized but unsupported %s in auto mode', async (_label, content, detected) => {
      const r = await handleConvert({ content });

      expect(r.isError).toBe(true);
      expect(r.structuredContent).toMatchObject({ from: detected });
      expect(JSON.stringify(r)).toContain('mcp.input.unsupported-format');
    });

    it.each([
      ['JSON matching neither supported shape', '{"hello":1}'],
      ['invalid JSON', '{ not json'],
    ])('reports %s as unrecognized in auto mode', async (_label, content) => {
      const r = await handleConvert({ content });

      expect(r.isError).toBe(true);
      expect(r.structuredContent).toMatchObject({ from: 'unrecognized' });
      expect(JSON.stringify(r)).toContain('mcp.input.unrecognized');
    });

    it.each([
      ['coral', JSON.stringify({ version: '3.0.0', id: 'g', nodes: [], edges: [] })],
      ['mermaid', 'service "Detected as Coral"'],
    ] as const)('honors explicit from=%s without automatic detection', async (from, content) => {
      const r = await handleConvert({ content, from });

      expect(r.structuredContent).toMatchObject({ from });
      expect(JSON.stringify(r)).not.toMatch(/mcp\.input\.(unrecognized|unsupported-format)/);
    });

    it('converts Mermaid to GraphIR JSON without changing its importer', async () => {
      const r = await handleConvert({ content: 'graph TD\n  A[Alpha] --> B[Beta]', to: 'json' });

      expect(r.isError).toBeFalsy();
      expect(textOf(r)).toContain('Alpha');
      expect(r.structuredContent.from).toBe('mermaid');
      expect(r.structuredContent.nodeCount).toBe(2);
      expect(r.structuredContent.diagnostics).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'coral.graph.id.dropped' }),
      ]));
    });

    it('converts PlantUML to GraphIR JSON through the real importer', async () => {
      const r = await handleConvert({
        content: '@startuml\npackage "Platform" {\n  component "Auth" as auth\n}\n[Web] --> auth\n@enduml',
        to: 'json',
      });

      expect(textOf(r)).toContain('Auth');
      expect(textOf(r)).toContain('Platform');
    });

    it('derives node ids the same way the rest of the server does', async () => {
      // The old converter lowercased and stripped punctuation with no dedupe,
      // so "Order Service" became `orderservice` and two of them merged.
      const r = await handleConvert({
        content: '@startuml\n[Order Service]\n[Order-Service]\n@enduml',
        to: 'json',
      });

      const graph = JSON.parse(textOf(r).slice(textOf(r).indexOf('{')));
      const ids = graph.nodes.map((n: { id: string }) => n.id);
      expect(new Set(ids).size).toBe(2);
      expect(ids[0]).toBe('order_service');
    });

    it('emits Graph-IR JSON when asked', async () => {
      const r = await handleConvert({ content: '@diagram architecture\na service as "A"', to: 'json' });

      expect(textOf(r)).toContain('"version": "4.0.0"');
      expect(textOf(r)).toContain('"conformanceLevel": "typical"');
      expect(textOf(r)).not.toContain('runtime schema verification unavailable');
      expect(r.structuredContent.modelVerification).toEqual({ scope: 'full', complete: true });
    });

    it('checks the exact installed GraphIR 4 schema and catalog before JSON export', () => {
      const source = '@diagram architecture\na service\n';
      const graph = verifyPortableSuccessorSource028(source).graph!;
      expect(verifySuccessorCandidateForConversion028(graph)).toEqual({
        valid: true, diagnostics: [], verification: { scope: 'full', complete: true }, graph,
      });
      const invalid = verifySuccessorCandidateForConversion028({
        ...graph, edges: [{ id: 'invalid', first: { node: 'a' },
          second: { node: 'missing' }, direction: 'first-to-second' }],
      });
      expect(invalid.valid).toBe(false);
      expect(invalid.diagnostics).toContainEqual(expect.objectContaining({
        code: 'GRAPHIR.UNKNOWN_ENDPOINT_NODE', severity: 'error',
        message: expect.stringContaining('/edges/0/second/node'),
      }));
    });

    it('keeps a strict sequence notation conflict portable without rewriting either authored choice', async () => {
      const source = '@diagram uml-sequence\n@conformanceLevel strict\n' +
        'client participant\nserver participant\ncall = client -#> server [async]\n';
      const converted = await handleConvert({ content: source, to: 'json', strict: true });
      expect(converted.isError).toBeFalsy();
      expect(converted.structuredContent.modelVerification).toEqual({ scope: 'full', complete: true });
      const graph = JSON.parse(textOf(converted).slice(textOf(converted).indexOf('{')));
      expect(graph.conformanceLevel).toBe('strict');
      expect(graph.edges[0]).toMatchObject({ id: 'call', type: 'async',
        secondEnd: { marker: { kind: 'triangle', fill: 'filled' } } });
      expect(graph.interaction.messages[0]).toMatchObject({ id: 'call', kind: 'synchronous' });
      const identity = await handleConvert({ content: source, to: 'coral' });
      expect(textOf(identity).endsWith(source)).toBe(true);
    });

    it('keeps recursive sequence order in saved-header JSON conversion', async () => {
      const source = '@diagram uml-sequence\na participant\nb participant\n' +
        'choice = alt "yes" {\n  a -> b\n} else "no" {\n  b -> a\n}\n' +
        'after = a -#> b [sync] as "Done"';
      const converted = await handleConvert({ content: source, to: 'json', strict: true });
      expect(converted.isError).toBeFalsy();
      const graph = JSON.parse(textOf(converted).slice(textOf(converted).indexOf('{')));
      expect(graph).toMatchObject({ version: '4.0.0', interaction: {
        fragments: [{ id: 'choice', kind: 'alt' }],
        items: [{ kind: 'fragment', id: 'choice' }, { kind: 'message', id: 'after' }],
      } });
      expect(graph.edges.at(-1)).toMatchObject({ id: 'after', direction: 'first-to-second',
        first: { node: 'a' }, second: { node: 'b' }, type: 'sync', label: 'Done' });
    });

    it('keeps a positioned message inside a nested operand in portable JSON', async () => {
      const source = '@diagram uml-sequence\na participant\nb participant\n' +
        'outer = alt "yes" {\n  inner = alt "again" {\n    nested = a -> b\n' +
        '    follow = b -#> a [sync] as "Retry"\n    unchanged = b -> a\n' +
        '  } else "stop" {\n    stop = a -> b\n  }\n' +
        '} else "no" {\n  rejected = b -> a\n}\n';
      const converted = await handleConvert({ content: source, to: 'json', strict: true });
      expect(converted.isError).toBeFalsy();
      const graph = JSON.parse(textOf(converted).slice(textOf(converted).indexOf('{')));
      expect(graph.interaction.fragments.find((fragment: { id: string }) => fragment.id === 'inner')
        .operands[0].items).toEqual([
        { kind: 'message', id: 'nested' }, { kind: 'message', id: 'follow' },
        { kind: 'message', id: 'unchanged' },
      ]);
      expect(graph.edges.find((edge: { id: string }) => edge.id === 'follow'))
        .toMatchObject({ first: { node: 'b' }, second: { node: 'a' }, type: 'sync', label: 'Retry' });
    });

    it('keeps authored semantic ports and written ends in saved-header JSON conversion', async () => {
      const source = '@diagram architecture\napi service {\n  send port [direction: out]\n}\n' +
        'store database\nread = api:send -> store:query [reads]';
      const converted = await handleConvert({ content: source, to: 'json' });
      expect(converted.isError).toBeFalsy();
      const graph = JSON.parse(textOf(converted).slice(textOf(converted).indexOf('{')));
      expect(graph).toMatchObject({ version: '4.0.0',
        nodes: [{ id: 'api', semanticPorts: [{ id: 'send', direction: 'out' }] }, { id: 'store' }],
        edges: [{ id: 'read', first: { node: 'api', port: 'send' },
          second: { node: 'store', port: 'query' }, direction: 'first-to-second' }],
      });
    });

    it('refuses a saved-header JSON conversion with an unknown symbol', async () => {
      const source = '@diagram architecture\na service [symbol: "missing-symbol"]';
      const converted = await handleConvert({ content: source, to: 'json' });
      expect(converted.isError).toBe(true);
      expect(converted.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
        code: 'coral.symbol.unknown',
        range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('"missing-symbol"') }) }),
      }));
    });

    it('refuses unknown catalog meaning inside a recursive model', async () => {
      const source = '@diagram uml-sequence\na participant [symbol: "missing-symbol"]\n' +
        'b participant\nchoice = alt "yes" {\n  a -> b\n} else "no" {\n  b -> a\n}';
      const converted = await handleConvert({ content: source, to: 'json' });
      expect(converted.isError).toBe(true);
      expect(converted.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
        code: 'coral.symbol.unknown',
        range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('"missing-symbol"') }) }),
      }));
    });

    it('refuses malformed recursive source without flattening its messages', async () => {
      const source = '@diagram uml-sequence\na participant\nb participant\n' +
        'choice = alt "yes" {\n  a -> b\n}';
      const converted = await handleConvert({ content: source, to: 'json' });
      expect(converted.isError).toBe(true);
      expect(converted.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
        code: 'coral.sequence.fragment.operands',
      }));
      expect(textOf(converted)).not.toContain('"version": "3.0.0"');
    });
  });

  describe('loss reporting', () => {
    it('lists what a lossy conversion dropped', async () => {
      const r = await handleConvert({
        content: '@startuml\nskinparam monochrome true\n[A] --> [B]\n@enduml', to: 'json',
      });

      expect(textOf(r)).toContain('Conversion notes');
      expect(textOf(r)).toContain('plantuml.skinparam.dropped');
      expect(r.structuredContent.diagnostics.length).toBeGreaterThan(0);
    });

    it('refuses a lossy conversion in strict mode', async () => {
      const r = await handleConvert({
        content: '@startuml\nskinparam monochrome true\n[A] --> [B]\n@enduml', to: 'json',
        strict: true,
      });

      expect(r.isError).toBe(true);
      expect(textOf(r)).toMatch(/refusing a lossy conversion/i);
    });

    it('does not refuse a clean conversion in strict mode', async () => {
      const r = await handleConvert({ content: '@diagram architecture\na service as "A"\nb database as "B"', to: 'json', strict: true });

      expect(r.isError).toBeFalsy();
    });

    it('preserves authored Coral bytes for a validated identity conversion', async () => {
      const source = '@diagram architecture\n// Keep my spelling\na service as "A"\n';
      const r = await handleConvert({ content: source, strict: true });

      expect(r.isError).toBeFalsy();
      expect(textOf(r)).toContain(source);
      expect(r.structuredContent.diagnostics).toEqual([]);
    });

    it('preserves a valid empty draft in an identity conversion', async () => {
      const source = '@diagram architecture\n// Work will go here\n';
      const r = await handleConvert({ content: source, from: 'coral', to: 'coral' });
      expect(r.isError).toBeFalsy();
      expect(textOf(r)).toContain(source);
      expect(r.structuredContent.nodeCount).toBe(0);
    });

    it('does not emit obsolete Coral when import-to-Coral writing is unavailable', async () => {
      const r = await handleConvert({ content: 'digraph G { a -> b }' });
      expect(r.isError).toBe(true);
      expect(JSON.stringify(r)).toContain('mcp.coral028.writer.unavailable');
      expect(textOf(r)).not.toContain('@graph');
    });

    it('writes a strict, lossless Mermaid participant/message subset as Coral 0.2.8', async () => {
      const imported = 'sequenceDiagram\nparticipant A\nparticipant B\n' +
        'A->>B: hi\nB-->>A: done\nA-)B: notify';
      const r = await handleConvert({ content: imported, from: 'mermaid', to: 'coral', strict: true });
      expect(r.isError).toBe(false);
      expect(r.structuredContent.diagnostics).toEqual([]);
      const source = textOf(r).slice(textOf(r).indexOf('@diagram'));
      expect(source).toContain('@diagram uml-sequence\n');
      expect(source).toContain('msg_1 = A -#> B as "hi"');
      expect(source).toContain('msg_2 = B -.-> A as "done"');
      expect(source).toContain('msg_3 = A -> B as "notify"');
      const reparsed = parseInstalledDocument028(source);
      expect(reparsed.header.diagnostics).toEqual([]);
      expect(reparsed.syntax.diagnostics).toEqual([]);
      expect(reparsed.graph?.interaction?.messageOrder).toEqual(['msg_1', 'msg_2', 'msg_3']);
      expect(reparsed.graph?.edges.map(({ id, source: first, target: second, type, label }) =>
        ({ id, first, second, type, label }))).toEqual([
        { id: 'msg_1', first: 'A', second: 'B', type: 'sync', label: 'hi' },
        { id: 'msg_2', first: 'B', second: 'A', type: 'return', label: 'done' },
        { id: 'msg_3', first: 'A', second: 'B', type: 'async', label: 'notify' },
      ]);
      const importedGraph = parseMermaid(imported).graph!;
      expect({ ...reparsed.graph!, id: importedGraph.id,
        edges: reparsed.graph!.edges.map((edge) => {
          const unstyled = { ...edge };
          delete unstyled.sourceEnd;
          delete unstyled.targetEnd;
          delete unstyled.style;
          return unstyled;
        }),
      }).toEqual({
        ...importedGraph,
        metadata: { ...importedGraph.metadata, custom: { coralEdition: '0.2.14' } },
      });
      expect(verifyPortableSuccessorSource028(source).diagnostics).toEqual([]);
      const autodetected = await handleConvert({ content: imported, to: 'coral', strict: true });
      expect(autodetected.isError).toBe(false);
      expect(textOf(autodetected)).toBe(textOf(r));
    });

    it.each([
      ['explicit actor', 'sequenceDiagram\nactor Client\nparticipant Server\nClient->>Server: hi',
        'Client actor'],
      ['implicit participants', 'sequenceDiagram\nClient->>Server: hi',
        'Client participant'],
    ])('writes %s without inventing a different source identity', async (_name, imported, declaration) => {
      const r = await handleConvert({ content: imported, from: 'mermaid', to: 'coral', strict: true });
      expect(r.isError).toBe(false);
      const source = textOf(r).slice(textOf(r).indexOf('@diagram'));
      expect(source).toContain(declaration);
      expect(source).toContain('msg_1 = Client -#> Server as "hi"');
      expect(verifyPortableSuccessorSource028(source).diagnostics).toEqual([]);
    });

    it('keeps a Mermaid message line break as escaped Coral text', async () => {
      const imported = 'sequenceDiagram\nA->>B: first<br/>second';
      const r = await handleConvert({ content: imported, from: 'mermaid', to: 'coral', strict: true });
      expect(r.isError).toBe(false);
      const source = textOf(r).slice(textOf(r).indexOf('@diagram'));
      expect(source).toContain('as "first\\nsecond"');
      expect(parseInstalledDocument028(source).graph?.edges[0]?.label).toBe('first\nsecond');
    });

    it('writes a two-operand Mermaid alternative with its ordered messages and guards', async () => {
      const imported = 'sequenceDiagram\nparticipant A\nparticipant B\n' +
        'A->>B: before\nalt accepted\nA->>B: request\nelse rejected\nB-->>A: denied\nend\nA-)B: after';
      const r = await handleConvert({ content: imported, from: 'mermaid', to: 'coral', strict: true });
      expect(r.isError).toBe(false);
      const source = textOf(r).slice(textOf(r).indexOf('@diagram'));
      expect(source).toContain('alt "accepted" {\n  msg_2 = A -#> B as "request"\n} else "rejected" {\n  msg_3 = B -.-> A as "denied"\n}');
      const reparsed = parseInstalledDocument028(source);
      expect(reparsed.syntax.diagnostics).toEqual([]);
      expect(reparsed.graph?.interaction?.messageOrder).toEqual(['msg_1', 'msg_2', 'msg_3', 'msg_4']);
      const portable = verifyPortableSuccessorSource028(source);
      expect(portable.diagnostics).toEqual([]);
      expect(portable.graph?.interaction?.fragments?.[0]?.operands.map((operand) => operand.items))
        .toEqual([[{ kind: 'message', id: 'msg_2' }], [{ kind: 'message', id: 'msg_3' }]]);
      expect(portable.graph?.interaction?.items).toEqual([
        { kind: 'message', id: 'msg_1' }, { kind: 'fragment', id: 'fragment-1' },
        { kind: 'message', id: 'msg_4' },
      ]);
      const importedGraph = parseMermaid(imported).graph!;
      expect(portable.graph?.edges.map(({ id, first, second, type, label, direction }) =>
        ({ id, first: first.node, second: second.node, type, label, direction })))
        .toEqual(importedGraph.edges.map(({ id, source: first, target: second, type, label }) =>
          ({ id, first, second, type, label, direction: 'first-to-second' })));
      expect(portable.graph?.interaction?.fragments?.[0]?.operands.map((operand) => operand.guard?.text))
        .toEqual(importedGraph.interaction?.fragments?.[0]?.operands.map((operand) => operand.guard?.text));
    });

    it('writes a pre-message Mermaid participant note in timeline order', async () => {
      const imported = 'sequenceDiagram\nparticipant A\nparticipant B\n' +
        'Note over A,B: shared\nA->>B: hi';
      const r = await handleConvert({ content: imported, from: 'mermaid', to: 'coral', strict: true });
      expect(r.isError).toBe(false);
      const source = textOf(r).slice(textOf(r).indexOf('@diagram'));
      expect(source).toContain('note "shared" on A, B\nmsg_1 = A -#> B as "hi"');
      const portable = verifyPortableSuccessorSource028(source);
      expect(portable.diagnostics).toEqual([]);
      expect(portable.graph?.interaction?.items).toEqual([
        { kind: 'note', id: 'note-1' }, { kind: 'message', id: 'msg_1' },
      ]);
      expect(portable.graph?.interaction?.notes).toEqual([
        { id: 'note-1', text: 'shared', participantIds: ['A', 'B'] },
      ]);
    });

    it('escapes an imported note line break without changing its text', async () => {
      const imported = 'sequenceDiagram\nparticipant A\nNote over A: first<br/>second\nA->>A: check';
      const r = await handleConvert({ content: imported, from: 'mermaid', to: 'coral', strict: true });
      expect(r.isError).toBe(false);
      const source = textOf(r).slice(textOf(r).indexOf('@diagram'));
      expect(source).toContain('note "first\\nsecond" on A');
      expect(verifyPortableSuccessorSource028(source).graph?.interaction?.notes?.[0]?.text)
        .toBe('first\nsecond');
    });

    it('accepts a participant note without inventing a message', async () => {
      const r = await handleConvert({ content: 'sequenceDiagram\nparticipant A\nNote over A: ready',
        from: 'mermaid', to: 'coral', strict: true });
      expect(r.isError).toBe(false);
      const source = textOf(r).slice(textOf(r).indexOf('@diagram'));
      expect(source).toContain('note "ready" on A');
      expect(verifyPortableSuccessorSource028(source).graph?.interaction?.items)
        .toEqual([{ kind: 'note', id: 'note-1' }]);
    });

    it.each([
      ['loop without guard', 'loop', 'loop {', undefined],
      ['guarded opt', 'opt cache miss', 'opt "cache miss" {', 'cache miss'],
    ])('writes a flat Mermaid %s with its message in one Coral operand',
      async (_name, head, spelling, guard) => {
        const imported = `sequenceDiagram\nparticipant A\nparticipant B\n${head}\nA->>B: try\nend`;
        const r = await handleConvert({ content: imported, from: 'mermaid', to: 'coral', strict: true });
        expect(r.isError).toBe(false);
        const source = textOf(r).slice(textOf(r).indexOf('@diagram'));
        expect(source).toContain(`${spelling}\n  msg_1 = A -#> B as "try"\n}`);
        const portable = verifyPortableSuccessorSource028(source);
        expect(portable.diagnostics).toEqual([]);
        expect(portable.graph?.interaction?.fragments?.[0]).toMatchObject({
          id: 'fragment-1', kind: head.startsWith('opt') ? 'opt' : 'loop',
          operands: [{ ...(guard ? { guard: { text: guard } } : {}),
            items: [{ kind: 'message', id: 'msg_1' }] }],
        });
      });

    it('writes successive flat fragments in their original timeline order', async () => {
      const imported = 'sequenceDiagram\nparticipant A\nparticipant B\n' +
        'alt accepted\nA->>B: yes\nelse rejected\nB-->>A: no\nend\n' +
        'A-)B: between\nloop retry\nA->>B: again\nend';
      const r = await handleConvert({ content: imported, from: 'mermaid', to: 'coral', strict: true });
      expect(r.isError).toBe(false);
      const source = textOf(r).slice(textOf(r).indexOf('@diagram'));
      expect(source).toContain('} else "rejected" {\n  msg_2 = B -.-> A as "no"\n}' +
        '\nmsg_3 = A -> B as "between"\nloop "retry" {\n  msg_4 = A -#> B as "again"\n}');
      const portable = verifyPortableSuccessorSource028(source);
      expect(portable.diagnostics).toEqual([]);
      expect(portable.graph?.interaction?.items).toEqual([
        { kind: 'fragment', id: 'fragment-1' }, { kind: 'message', id: 'msg_3' },
        { kind: 'fragment', id: 'fragment-2' },
      ]);
      expect(portable.graph?.interaction?.fragments?.map((fragment) => fragment.kind))
        .toEqual(['alt', 'loop']);
    });

    it('writes a Mermaid sequence activation into verified Coral 0.2.14 activation blocks', async () => {
      const imported = 'sequenceDiagram\nparticipant A\nparticipant B\nA->>+B: hi\nB-->>-A: done';
      const r = await handleConvert({ content: imported, from: 'mermaid', to: 'coral', strict: true });
      expect(r.isError).toBe(false);
      const source = textOf(r).slice(textOf(r).indexOf('@diagram'));
      expect(source).toContain('@diagram uml-sequence');
      expect(source).toContain('activation B {');
      expect(source).toContain('msg_1 = A -#> B as "hi"');
      expect(source).toContain('msg_2 = B -.-> A as "done"');
      expect(verifyPortableSuccessorSource028(source).diagnostics).toEqual([]);
    });

    it('writes a mid-timeline Mermaid note after messages into verified Coral 0.2.14', async () => {
      const r = await handleConvert({
        content: 'sequenceDiagram\nA->>B: hi\nNote over A,B: late',
        from: 'mermaid',
        to: 'coral',
        strict: true,
      });
      expect(r.isError).toBe(false);
      const source = textOf(r).slice(textOf(r).indexOf('@diagram'));
      expect(source).toContain('msg_1 = A -#> B as "hi"\nnote "late" on A, B');
      expect(verifyPortableSuccessorSource028(source).diagnostics).toEqual([]);
    });

    it('refuses an unguarded Mermaid opt in strict mode without fabricating a Coral guard', async () => {
      const r = await handleConvert({
        content: 'sequenceDiagram\nA->>B: before\nopt\nA->>B: try\nend',
        from: 'mermaid',
        to: 'coral',
        strict: true,
      });
      expect(r.isError).toBe(true);
      expect(r.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
        code: 'coral.transpile.strict.refused',
      }));
      expect(r.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
        code: 'mermaid.sequence.guard.defaulted',
      }));
      expect(textOf(r)).not.toContain('@diagram');
    });

    it('reports rather than returning an empty diagram for an unsupported kind', async () => {
      const r = await handleConvert({
        content: '@startuml\nparticipant Alice\nAlice -> Bob: hi\n@enduml',
      });

      expect(r.isError).toBe(true);
      expect(textOf(r)).toMatch(/could not convert|sequence/i);
    });
  });

  describe('SPEC-17: Mermaid-to-Coral Top-5 transpiler contract', () => {
    it('declares additive flowchartTarget, edgeStyleMode, and stateTargetEdition schema properties', () => {
      expect(convertTool.name).toBe('coral_convert');
      expect(convertTool.inputSchema.properties.strict).toBeDefined();
      expect(convertTool.inputSchema.properties.flowchartTarget).toMatchObject({
        type: 'string',
        enum: ['flowchart', 'block', 'architecture'],
        default: 'flowchart',
      });
      expect(convertTool.inputSchema.properties.edgeStyleMode).toMatchObject({
        type: 'string',
        enum: ['visual-safe', 'portable'],
        default: 'visual-safe',
      });
      expect(convertTool.inputSchema.properties.stateTargetEdition).toMatchObject({
        type: 'string',
        enum: ['0.2.17', '0.2.8'],
        default: '0.2.17',
      });
    });

    it('converts Mermaid flowchart with subgraphs and returns backward-compatible + additive structuredContent', async () => {
      const mermaid = [
        'flowchart LR',
        '  start([Start]) --> check{Valid?}',
        '  subgraph backend [Backend]',
        '    api[API Call] --> sub[[Auth Check]]',
        '  end',
        '  check -->|Yes| api',
        '  check -.->|No| done([Done])',
        '  sub --> done',
      ].join('\n');
      const r = await handleConvert({ content: mermaid, from: 'auto', to: 'coral', strict: true });
      expect(r.isError).toBe(false);
      expect(r.structuredContent).toMatchObject({
        from: 'mermaid',
        to: 'coral',
        candidateVersion: '4.0.0',
        detectedKind: 'flowchart',
        targetNotation: 'flowchart',
        targetEdition: '0.2.14',
        visualRenderable: true,
        lossSummary: { lossy: false, errorCount: 0, warningCount: 0 },
      });
      expect(r.structuredContent.nodeCount).toBeGreaterThanOrEqual(5);
      expect(r.structuredContent.edgeCount).toBe(5);
      expect((r.structuredContent as Record<string, unknown>).idMap).toMatchObject({
        'backend.api': 'api',
        'backend.sub': 'sub',
      });
      expect(textOf(r)).toContain('@diagram flowchart');
      expect(textOf(r)).toContain('@coralVersion "0.2.14"');
      expect(textOf(r)).toContain('backend.api -> backend.sub');
      expect(textOf(r)).not.toContain('## Conversion notes');
    });

    it('supports flowchartTarget: block and architecture for database cylinders', async () => {
      const mermaid = 'flowchart TD\n  api[Orders API] --> db[(Orders DB)]';

      const asDefault = await handleConvert({ content: mermaid, to: 'coral' });
      expect(asDefault.isError).toBe(false);
      expect(asDefault.structuredContent).toMatchObject({
        targetNotation: 'flowchart',
        targetEdition: '0.2.14',
        visualRenderable: true,
        lossSummary: { lossy: true, warningCount: 1 },
      });
      expect(textOf(asDefault)).toContain('## Conversion notes');
      expect(textOf(asDefault)).toContain('mermaid.flowchart.shape.degraded');

      const asBlock = await handleConvert({ content: mermaid, to: 'coral', flowchartTarget: 'block', strict: true });
      expect(asBlock.isError).toBe(false);
      expect(asBlock.structuredContent).toMatchObject({
        targetNotation: 'block',
        targetEdition: '0.2.14',
        visualRenderable: true,
        nodeCount: 2,
        edgeCount: 1,
        lossSummary: { lossy: false },
      });
      expect(textOf(asBlock)).toContain('@diagram block');
      expect(textOf(asBlock)).toContain('layout [direction: DOWN]');
      expect(textOf(asBlock)).toContain('db cylinder as "Orders DB"');

      const asArch = await handleConvert({ content: mermaid, to: 'coral', flowchartTarget: 'architecture', strict: true });
      expect(asArch.isError).toBe(false);
      expect(asArch.structuredContent).toMatchObject({
        targetNotation: 'architecture',
        targetEdition: '0.2.14',
        visualRenderable: true,
        nodeCount: 2,
        edgeCount: 1,
        lossSummary: { lossy: false },
      });
      expect(textOf(asArch)).toContain('@diagram architecture');
      expect(textOf(asArch)).toContain('db database as "Orders DB"');
    });

    it('supports edgeStyleMode: visual-safe vs portable', async () => {
      const mermaid = 'flowchart LR\n  A ==> B';

      const safe = await handleConvert({ content: mermaid, to: 'coral', edgeStyleMode: 'visual-safe' });
      expect(safe.isError).toBe(false);
      expect(safe.structuredContent).toMatchObject({
        visualRenderable: true,
        lossSummary: { lossy: true },
      });
      expect(textOf(safe)).toContain('mermaid.flowchart.edge-weight.degraded');
      expect(textOf(safe)).toContain('## Conversion notes');

      const portable = await handleConvert({ content: mermaid, to: 'coral', edgeStyleMode: 'portable' });
      expect(portable.isError).toBe(false);
      expect(portable.structuredContent).toMatchObject({
        visualRenderable: false,
      });
      expect(textOf(portable)).toContain('[style: "thick"]');
      expect(textOf(portable)).toContain('coral.edge-style.visual-unavailable');
    });

    it('converts Mermaid classDiagram to verified @diagram uml-class 0.2.14', async () => {
      const mermaid = [
        'classDiagram',
        '  namespace Banking {',
        '    class Account["Bank Account"] {',
        '      +String owner',
        '      -Decimal balance',
        '      +deposit(Decimal amount) Boolean',
        '    }',
        '    class SavingsAccount',
        '  }',
        '  Account <|-- SavingsAccount',
        '  Customer "1" --> "0..*" Account : owns',
      ].join('\n');
      const r = await handleConvert({ content: mermaid, from: 'auto', to: 'coral', strict: true });
      expect(r.isError).toBe(false);
      expect(r.structuredContent).toMatchObject({
        from: 'mermaid',
        to: 'coral',
        candidateVersion: '4.0.0',
        detectedKind: 'class',
        targetNotation: 'uml-class',
        targetEdition: '0.2.14',
        visualRenderable: true,
        lossSummary: { lossy: false },
      });
      expect(r.structuredContent.edgeCount).toBe(2);
      expect(textOf(r)).toContain('@diagram uml-class');
      expect(textOf(r)).toContain('Banking.SavingsAccount -|> Banking.Account [inheritance]');
    });

    it('converts Mermaid erDiagram to verified @diagram erd 0.2.14', async () => {
      const mermaid = [
        'erDiagram',
        '  CUSTOMER {',
        '    uuid id PK',
        '    varchar(255) email UK',
        '  }',
        '  ORDER {',
        '    uuid id PK',
        '    uuid customer_id FK',
        '  }',
        '  CUSTOMER ||--o{ ORDER : places',
        '  ORDER ||..|{ LINE-ITEM : contains',
      ].join('\n');
      const r = await handleConvert({ content: mermaid, from: 'auto', to: 'coral', strict: true });
      expect(r.isError).toBe(false);
      expect(r.structuredContent).toMatchObject({
        from: 'mermaid',
        to: 'coral',
        candidateVersion: '4.0.0',
        detectedKind: 'er',
        targetNotation: 'erd',
        targetEdition: '0.2.14',
        visualRenderable: true,
        nodeCount: 3,
        edgeCount: 2,
        lossSummary: { lossy: false },
      });
      expect((r.structuredContent as Record<string, unknown>).idMap).toMatchObject({
        LINE_ITEM: 'LINE-ITEM',
      });
      expect(textOf(r)).toContain('@diagram erd');
      expect(textOf(r)).toContain('CUSTOMER ||--o{ ORDER as "places"');
      expect(textOf(r)).toContain('## Conversion notes');
    });

    it('converts Mermaid stateDiagram-v2 to visual 0.2.17 by default and supports legacy 0.2.8', async () => {
      const mermaid = [
        'stateDiagram-v2',
        '  [*] --> Idle',
        '  Idle --> Checking : submit',
        '  state "Validating Order" as Checking',
        '  Checking --> Done : valid',
        '  Done --> [*]',
      ].join('\n');

      const v0217 = await handleConvert({ content: mermaid, from: 'auto', to: 'coral', strict: true });
      expect(v0217.isError).toBe(false);
      expect(v0217.structuredContent).toMatchObject({
        from: 'mermaid',
        to: 'coral',
        candidateVersion: '4.0.0',
        detectedKind: 'state',
        targetNotation: 'uml-state',
        targetEdition: '0.2.17',
        visualRenderable: true,
        nodeCount: 5,
        edgeCount: 4,
        lossSummary: { lossy: false },
      });
      expect(textOf(v0217)).toContain('@diagram uml-state');
      expect(textOf(v0217)).toContain('@coralVersion "0.2.17"');

      const v028 = await handleConvert({
        content: mermaid,
        from: 'auto',
        to: 'coral',
        strict: true,
        stateTargetEdition: '0.2.8',
      });
      expect(v028.isError).toBe(false);
      expect(v028.structuredContent).toMatchObject({
        from: 'mermaid',
        to: 'coral',
        candidateVersion: '4.0.0',
        detectedKind: 'state',
        targetNotation: 'uml-state',
        targetEdition: '0.2.8',
        visualRenderable: false,
        characterRenderable: true,
        nodeCount: 5,
        edgeCount: 4,
        lossSummary: { lossy: false },
      });
      expect(textOf(v028)).toContain('@diagram uml-state');
      expect(textOf(v028)).not.toContain('@coralVersion');
      expect(textOf(v028)).toContain('coral.uml-state.visual-unavailable');
    });

    it('refuses lossy Mermaid conversion in strict mode and accepts info-only normalizations', async () => {
      const lossy = await handleConvert({
        content: 'flowchart TD\n  api[API] --> db[(DB)]',
        to: 'coral',
        strict: true,
      });
      expect(lossy.isError).toBe(true);
      expect(lossy.structuredContent).toMatchObject({
        from: 'mermaid',
        to: 'coral',
        nodeCount: 0,
        edgeCount: 0,
        candidateVersion: '4.0.0',
        detectedKind: 'flowchart',
        visualRenderable: false,
      });
      expect(lossy.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
        code: 'coral.transpile.strict.refused',
        severity: 'error',
      }));
      expect(textOf(lossy)).not.toContain('@diagram');

      const infoOnly = await handleConvert({
        content: 'flowchart TD\n  accTitle: Billing\n  order-api[Orders API] --> checkout[Checkout]',
        to: 'coral',
        strict: true,
      });
      expect(infoOnly.isError).toBe(false);
      expect(infoOnly.structuredContent).toMatchObject({
        lossSummary: { lossy: false },
      });
    });

    it.each([
      ['gantt', 'gantt\n  title Roadmap\n  section Core\n  Task A :a1, 2026-01-01, 5d'],
      ['radar-beta', 'radar-beta\n  axis A, B, C\n  curve c1{1, 2, 3}'],
    ])('refuses unsupported Mermaid %s cleanly in auto mode', async (kind, content) => {
      const r = await handleConvert({ content, from: 'auto', to: 'coral' });
      expect(r.isError).toBe(true);
      expect(r.structuredContent).toMatchObject({
        from: 'mermaid',
        to: 'coral',
        nodeCount: 0,
        edgeCount: 0,
        candidateVersion: '4.0.0',
        detectedKind: kind,
        targetNotation: null,
        targetEdition: null,
        visualRenderable: false,
      });
      expect(r.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
        code: 'mermaid.diagram.unsupported',
        severity: 'error',
      }));
      expect(textOf(r)).not.toContain('@diagram');
    });
  });
});
