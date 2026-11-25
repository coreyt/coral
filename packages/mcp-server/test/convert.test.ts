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
      const r = await handleConvert({ content: 'graph TD\n A[Alpha] --> B[Beta]' });
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
      }).toEqual(importedGraph);
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

    it.each([
      ['activation', 'A->>+B: hi\nB-->>-A: done'],
    ])('refuses an unspelled Mermaid %s without returning partial Coral', async (_name, body) => {
      const imported = `sequenceDiagram\nparticipant A\nparticipant B\n${body}`;
      const r = await handleConvert({ content: imported, from: 'mermaid', to: 'coral' });
      expect(r.isError).toBe(true);
      expect(JSON.stringify(r.structuredContent.diagnostics)).toContain('mcp.coral028.import.unsupported');
      expect(textOf(r)).not.toContain('@diagram');
    });

    it('refuses a Mermaid note after its first message without partial Coral', async () => {
      const r = await handleConvert({ content: 'sequenceDiagram\nA->>B: hi\nNote over A,B: late',
        from: 'mermaid', to: 'coral', strict: true });
      expect(r.isError).toBe(true);
      expect(r.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
        code: 'mermaid.sequence.note.placement',
      }));
      expect(textOf(r)).not.toContain('@diagram');
    });

    it('refuses an unguarded Mermaid opt without fabricating a Coral guard', async () => {
      const r = await handleConvert({ content: 'sequenceDiagram\nA->>B: before\nopt\nA->>B: try\nend',
        from: 'mermaid', to: 'coral', strict: true });
      expect(r.isError).toBe(true);
      expect(r.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
        code: 'mcp.coral028.import.unsupported',
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

  it('declares its schema', () => {
    expect(convertTool.name).toBe('coral_convert');
    expect(convertTool.inputSchema.properties.strict).toBeDefined();
  });
});
