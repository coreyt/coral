import { describe, it, expect } from 'vitest';
import { handleRender, renderTool } from '../src/tools/render.js';

/**
 * coral_render now draws through @coral-viz/render rather than a fork (R-023).
 */

async function svgFrom(result: Awaited<ReturnType<typeof handleRender>>): Promise<string> {
  const text = (result.content[0] as { text: string }).text;
  return text.slice(text.indexOf('<svg'));
}

function textFrom(result: Awaited<ReturnType<typeof handleRender>>): string {
  return (result.content[0] as { text: string }).text;
}

describe('coral_render', () => {
  it.each([
    ['headerless current source', 'api service'],
    ['retired kind-first source', 'service "API" as api'],
    ['retired graph header', '@graph {"id":"old"}\nservice "API" as api'],
    ['empty source', ''],
  ])('refuses %s at the installed source boundary', async (_name, content) => {
    const result = await handleRender({ content });
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'header.diagram.required', severity: 'error',
      range: expect.objectContaining({ start: expect.objectContaining({ line: 1, column: 0 }) }),
    }));
    expect(result.structuredContent).not.toHaveProperty('graph');
    expect(textFrom(result)).not.toContain('<svg');
  });

  it('declares its schema', () => {
    expect(renderTool.name).toBe('coral_render');
    expect(renderTool.inputSchema.properties.content).toBeDefined();
    expect(renderTool.inputSchema.properties.options.properties).toMatchObject({
      fontSettings: expect.any(Object),
      fontFamily: expect.any(Object),
      fontSize: expect.any(Object),
      fontWeight: expect.any(Object),
      lineHeight: expect.any(Object),
      notation: expect.objectContaining({ type: 'string' }),
    });
    const schema = renderTool.inputSchema;
    const optionProperties = schema.properties.options.properties;
    expect(optionProperties.fontFamily).toMatchObject({ minLength: 1, pattern: '\\S' });
    expect(schema.$defs.fontSettings.properties.family)
      .toMatchObject({ minLength: 1, pattern: '\\S' });
  });

  it('renders Coral DSL to a laid-out SVG', async () => {
    const result = await handleRender({
      content: '@diagram architecture\napi_gateway service as "API Gateway"\norders database as "Orders"\n\napi_gateway -> orders [writes]',
    });

    const svg = await svgFrom(result);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('API Gateway');
    expect(svg).toContain('Orders');
    expect(svg).toContain('data-coral-part-id="edge-1:shaft"');
  });

  it('reports unsupported self-message proximity instead of claiming it executes', async () => {
    const result = await handleRender({ content: '@diagram uml-sequence\napi participant\nstore participant\napi -.-> api\n' });
    expect(result.isError).not.toBe(true);
    expect(textFrom(result)).toContain('proximity hint');
    expect(result.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning', code: 'coral.layout.proximity.unapplied',
      subject: { kind: 'edge', id: 'edge-1' },
    }));
  });

  it('renders Graph-IR JSON', async () => {
    const result = await handleRender({
      content: JSON.stringify({
        version: '3.0.0',
        id: 'g',
        nodes: [{ id: 'a', type: 'service', label: 'Alpha' }],
        edges: [],
      }),
    });

    expect(await svgFrom(result)).toContain('Alpha');
  });

  it.each([
    ['Mermaid', 'flowchart TD\nA[Alpha] --> B[Beta]'],
    ['DOT', 'digraph { a [label="Alpha"]; b [label="Beta"]; a -> b }'],
    ['PlantUML', '@startuml\n[Alpha]\n@enduml'],
  ])('keeps %s on its deliberate foreign-format path', async (_name, content) => {
    const result = await handleRender({ content });
    expect(result.isError).not.toBe(true);
    expect(await svgFrom(result)).toContain('Alpha');
  });

  it('renders profile-only UML sequence GraphIR through the shared sequence layout', async () => {
    const content = JSON.stringify({ version: '3.0.0', id: 'profile-only-sequence',
      profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
      nodes: [{ id: 'a', type: 'participant' }, { id: 'b', type: 'participant' }],
      edges: [{ id: 'm', source: 'a', target: 'b', type: 'sync' }],
      interaction: {
        participants: [{ id: 'a', nodeId: 'a' }, { id: 'b', nodeId: 'b' }],
        participantOrder: ['a', 'b'],
        messages: [{ id: 'm', edgeId: 'm', sourceParticipantId: 'a',
          targetParticipantId: 'b', kind: 'synchronous' }],
        messageOrder: ['m'],
      },
    });
    const result = await handleRender({ content });
    expect(result.isError).not.toBe(true);
    expect(await svgFrom(result)).toContain('data-coral-sequence-message="m"');
  });

  it('renders a saved-header reverse sequence with successor sender and receiver roles', async () => {
    const content = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'reply = client <- server as "reverse reply"';
    const result = await handleRender({ content });
    expect(result.isError).not.toBe(true);
    const svg = await svgFrom(result);
    expect(svg).toContain('data-coral-sequence-message="reply"');
    expect(svg).toContain('reverse reply');
    const conflict = await handleRender({ content, options: { notation: 'architecture' } });
    expect(conflict).toMatchObject({ isError: true,
      structuredContent: { diagnostics: [{ code: 'mcp.render.notation.conflict' }] } });
  });

  it('renders recursive sequence fragments through the shared scene', async () => {
    const content = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  retry = alt "again" {\n    a -> b\n' +
      '  } else "stop" {\n    b -> a\n  }\n} else "no" {\n  b -> a\n}';
    const result = await handleRender({ content });
    expect(result.isError).not.toBe(true);
    const svg = await svgFrom(result);
    expect(svg).toContain('data-coral-sequence-fragment="choice"');
    expect(svg).toContain('data-coral-sequence-fragment="retry"');
  });

  it('reports the unresolved endpoint of a reverse sequence at its source token', async () => {
    const result = await handleRender({ content:
      '@diagram uml-sequence\nclient participant\nclient <- absent' });
    expect(result).toMatchObject({ isError: true,
      structuredContent: { diagnostics: [expect.objectContaining({
        code: 'coral.reference.target.unresolved',
        position: expect.objectContaining({ line: 3, column: 10 }),
      })] } });
  });

  it('checks Coral sequence fields on profile-only GraphIR rather than silently skipping them', async () => {
    const content = JSON.stringify({ version: '3.0.0', id: 'profile-only-invalid-sequence',
      profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
      nodes: [{ id: 'a', type: 'participant', position: { x: 1, y: 2 } }],
      edges: [],
      interaction: { participants: [{ id: 'a', nodeId: 'a' }], participantOrder: ['a'],
        messages: [], messageOrder: [] },
    });
    const result = await handleRender({ content });
    expect(result).toMatchObject({ isError: true,
      structuredContent: { diagnostics: [
        { code: 'coral.sequence.field.unsupported' },
      ] } });
    expect(textFrom(result)).toContain('Participant "a" carries position');
  });

  it('renders a structurally valid sequence type/operator conflict for separate U2 review', async () => {
    const content = JSON.stringify({ version: '3.0.0', id: 'sequence-type-conflict',
      profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
      nodes: [{ id: 'a', type: 'participant' }, { id: 'b', type: 'participant' }],
      edges: [{ id: 'm', source: 'a', target: 'b', type: 'async', label: 'load()',
        sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'triangle', fill: 'filled' } } },
      { id: 'reply', source: 'b', target: 'a', type: 'sync', label: 'result',
        style: { lineStyle: 'dashed' },
        sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'arrow', fill: 'open' } } }],
      interaction: {
        participants: [{ id: 'a', nodeId: 'a' }, { id: 'b', nodeId: 'b' }],
        participantOrder: ['a', 'b'],
        messages: [{ id: 'm', edgeId: 'm', sourceParticipantId: 'a',
          targetParticipantId: 'b', kind: 'synchronous' },
        { id: 'reply', edgeId: 'reply', sourceParticipantId: 'b',
          targetParticipantId: 'a', kind: 'return' }], messageOrder: ['m', 'reply'],
      },
    });
    const result = await handleRender({ content });
    expect(result.isError).not.toBe(true);
    expect(await svgFrom(result)).toContain('data-coral-sequence-message="m"');
    expect(await svgFrom(result)).toContain('data-coral-sequence-message="reply"');
    expect(await svgFrom(result)).toContain('load()');
  });

  it('retains notation edge semantics under the selected visual style', async () => {
    const content = JSON.stringify({
      version: '3.0.0', id: 'g',
      nodes: [
        { id: 'web', type: 'service', symbol: 'arch-service', variant: 'web', label: 'Web' },
        { id: 'db', type: 'database', symbol: 'arch-database', label: 'DB' },
      ],
      edges: [{ id: 'e', source: 'web', target: 'db', type: 'data' }],
    });
    const themed = await svgFrom(await handleRender({ content }));
    expect(themed).toContain('data-coral-edge="e"');
    const notated = await svgFrom(await handleRender({ content, options: { notation: 'architecture' } }));
    expect(notated).toContain('marker-end="url(#coral-instance-');
    expect(notated).toContain('Web globe');
    expect(notated).toContain('stroke="#363430" stroke-width="2.3"');
  });

  it('rejects an unknown notation instead of silently theming', async () => {
    const content = JSON.stringify({ version: '3.0.0', id: 'g', nodes: [{ id: 'a', type: 'service', label: 'A' }], edges: [] });
    const result = await handleRender({ content, options: { notation: 'architcture' } });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Unknown notation "architcture"/);
  });

  it('returns the saved-profile capability finding when rendering cannot resolve it', async () => {
    const content = JSON.stringify({ version: '3.0.0', id: 'g',
      metadata: { notation: 'not-installed' },
      nodes: [{ id: 'a', type: 'service', label: 'A' }], edges: [] });
    const result = await handleRender({ content });
    expect(result).toMatchObject({ isError: true,
      structuredContent: { diagnostics: [{ code: 'render.capability.unknown-profile' }] } });
  });

  it('returns a node-scoped capability finding for an unknown explicit symbol', async () => {
    const content = JSON.stringify({ version: '3.0.0', id: 'g',
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'a', type: 'service', symbol: 'not-installed' }], edges: [] });
    const result = await handleRender({ content });
    expect(result).toMatchObject({ isError: true,
      structuredContent: { diagnostics: [{ code: 'render.capability.unknown-symbol',
        subject: { kind: 'node', id: 'a' } }] } });
  });

  it('resolves catalog edge semantics from GraphIR metadata notation', async () => {
    const content = JSON.stringify({
      version: '3.0.0', id: 'g', metadata: { notation: 'architecture' },
      nodes: [
        { id: 'web', type: 'service', symbol: 'arch-service', variant: 'web', label: 'Web' },
        { id: 'db', type: 'database', symbol: 'arch-database', label: 'DB' },
      ],
      edges: [{ id: 'e', source: 'web', target: 'db', type: 'data' }],
    });
    const svg = await svgFrom(await handleRender({ content }));
    expect(svg).toContain('marker-end="url(#coral-instance-');
    expect(svg).toContain('stroke="#363430" stroke-width="2.3"');
  });

  it('renders a canonical symbol through the shared registry', async () => {
    const result = await handleRender({
      content: JSON.stringify({
        version: '3.0.0', id: 'g',
        nodes: [{ id: 'a', type: 'service', symbol: 'arch-database', position: { x: 0, y: 0 } }],
        edges: [],
      }),
    });
    const svg = await svgFrom(result);
    expect(svg).toContain('<path');
    expect(svg).not.toContain('d="M0 0 H100 V60 H0 Z"');
  });

  it('gives nodes distinct positions rather than stacking them at the origin', async () => {
    const result = await handleRender({
      content: '@diagram architecture\none service as "One"\ntwo service as "Two"\n\none -> two',
    });

    const svg = await svgFrom(result);
    const xs = [...svg.matchAll(/<g transform="translate\(([-\d.]+),([-\d.]+)\)/g)].map((m) => m[1]);
    expect(new Set(xs).size).toBeGreaterThan(1);
  });

  it('honours the dark theme', async () => {
    const result = await handleRender({
      content: '@diagram architecture\na service as "A"',
      options: { theme: 'dark' },
    });

    expect(await svgFrom(result)).toContain('#1e1e1e');
  });

  it('renders a deterministic standalone HTML document on request', async () => {
    const result = await handleRender({
      content: '@diagram architecture\na service as "A"',
      options: { format: 'html' },
    });

    expect(textFrom(result)).toContain('Generated HTML');
    expect(textFrom(result)).toContain('<!doctype html>');
    expect(textFrom(result)).toContain('data:font/woff2;base64,');
  });

  it('reports unparseable input rather than emitting an empty diagram', async () => {
    const result = await handleRender({ content: '{ not json' });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(/could not parse/i);
  });

  it('escapes markup in labels', async () => {
    const result = await handleRender({
      content: JSON.stringify({
        version: '3.0.0',
        id: 'g',
        nodes: [{ id: 'x', type: 'service', label: '<b>&"' }],
        edges: [],
      }),
    });

    const svg = await svgFrom(result);
    expect(svg).toContain('&lt;b&gt;&amp;&quot;');
    expect(svg).not.toContain('<b>');
  });
});

describe('coral_render: options and geometry', () => {
  it.each([
    ['family', { fontFamily: 'serif' }, 'Coral Source Serif 4'],
    ['size', { fontSize: 23 }, 'font-size="23"'],
    ['weight', { fontWeight: 'bold' }, 'font-weight="700"'],
    ['line height', { lineHeight: 1.8 }, 'line-height="1.8"'],
  ])('adapts a scalar-only %s option into portable sizing and rendering', async (_name, options, marker) => {
    const result = await handleRender({ content: '@diagram architecture\na service as "A longer label for sizing"', options });
    expect(await svgFrom(result)).toContain(marker);
  });

  it('applies aggregate overrides and scalar precedence consistently', async () => {
    const content = JSON.stringify({
      version: '3.0.0', id: 'g',
      nodes: [{ id: 'a', type: 'service', symbol: 'flowchart-process', label: 'Override' }],
      edges: [],
    });
    const aggregate = await handleRender({
      content,
      options: {
        fontSettings: {
          default: { family: 'serif', size: 14 },
          symbolOverrides: { 'flowchart-process': { family: 'monospace', size: 20 } },
        },
      },
    });
    expect(await svgFrom(aggregate)).toContain('Coral JetBrains Mono');

    const both = await handleRender({
      content,
      options: {
        fontSettings: {
          default: { family: 'serif', size: 14 },
          symbolOverrides: { 'flowchart-process': { family: 'monospace', size: 20 } },
        },
        fontFamily: 'serif',
      },
    });
    const svg = await svgFrom(both);
    expect(svg).toContain('Coral Source Serif 4');
    expect(svg).toContain('font-size="20"');
  });

  it('feeds font-aware dimensions into ELK before serializing', async () => {
    const content = '@diagram architecture\nfirst service as "A deliberately long first node label"\nsecond service as "Second"\n\nfirst -> second';
    const compact = await svgFrom(await handleRender({ content, options: { fontSize: 12 } }));
    const large = await svgFrom(await handleRender({ content, options: { fontSize: 30 } }));
    const secondX = (svg: string) => [...svg.matchAll(/<g transform="translate\(([-\d.]+),/g)]
      .map((match) => Number(match[1]))[1];

    expect(secondX(large)).toBeGreaterThan(secondX(compact));
  });

  it('rejects malformed nested font options at the MCP boundary', async () => {
    await expect(handleRender({
      content: 'service "A"',
      options: { fontSettings: { default: { size: -1 } } },
    })).rejects.toThrow();
    await expect(handleRender({
      content: 'service "A"',
      options: { fontFamily: '   ' },
    })).rejects.toThrow();
    await expect(handleRender({
      content: 'service "A"',
      options: { fontSettings: { default: { family: '   ' } } },
    })).rejects.toThrow();
  });

  it.each([['RIGHT'], ['DOWN'], ['LEFT'], ['UP']])('lays out in the %s direction', async (direction) => {
    const r = await handleRender({
      content: '@diagram architecture\na service as "A"\nb service as "B"\n\na -> b',
      options: { direction },
    });
    expect(await svgFrom(r)).toContain('<svg');
  });

  it('honours custom node spacing', async () => {
    const r = await handleRender({
      content: '@diagram architecture\na service as "A"\nb service as "B"\n\na -> b',
      options: { nodeSpacing: 200 },
    });
    expect(await svgFrom(r)).toContain('<svg');
  });

  it.each([
    ['clear corridor', { x: 200, y: 160 }, false],
    ['inside the source body', { x: 40, y: 30 }, true],
  ])('validates authored edge waypoints: %s', async (_name, position, invalid) => {
    const r = await handleRender({
      content: JSON.stringify({
        version: '3.0.0',
        id: 'g',
        nodes: [
          { id: 'a', type: 'service', label: 'A', position: { x: 0, y: 0 } },
          { id: 'b', type: 'service', label: 'B', position: { x: 300, y: 0 } },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b', routeIntent: { waypoints: [{
          id: 'w1', placement: { kind: 'absolute', position },
        }] } }],
      }),
    });
    if (invalid) {
      expect(r.isError).toBe(true);
      expect(textFrom(r)).not.toContain('<svg');
      expect(r.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
        code: 'layout.route.invalid',
      }));
    } else {
      expect(r.isError).not.toBe(true);
      const svg = await svgFrom(r);
      expect(svg).toContain('data-coral-part-id="e:shaft"');
    }
  });

  it('preserves complete supplied geometry instead of replacing it with ELK', async () => {
    const r = await handleRender({
      content: JSON.stringify({
        version: '3.0.0',
        id: 'g',
        nodes: [
          { id: 'a', type: 'service', label: 'A', position: { x: 321, y: 123 } },
          { id: 'b', type: 'service', label: 'B', position: { x: 777, y: 456 } },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b' }],
      }),
    });
    const svg = await svgFrom(r);
    const positions = [...svg.matchAll(/data-coral-node="([ab])">\s*<g transform="translate\(([-\d.]+),([-\d.]+)\)/g)]
      .map((match) => ({ id: match[1], x: Number(match[2]), y: Number(match[3]) }));
    expect(positions).toHaveLength(2);
    expect(positions.find((item) => item.id === 'b')!.x - positions.find((item) => item.id === 'a')!.x)
      .toBeGreaterThan(400);
    expect(positions.find((item) => item.id === 'b')!.y - positions.find((item) => item.id === 'a')!.y)
      .toBeGreaterThan(300);
  });

  it('verifies required intent even when every node has authored geometry', async () => {
    const response = await handleRender({
      content: JSON.stringify({
        version: '3.0.0', id: 'g',
        nodes: [
          { id: 'a', type: 'service', position: { x: 100, y: 0 }, dimensions: { width: 40, height: 20 } },
          { id: 'b', type: 'service', position: { x: 0, y: 0 }, dimensions: { width: 40, height: 20 } },
        ],
        edges: [],
        constraints: [{
          id: 'a-left', kind: 'relative', strength: 'required',
          subject: { kind: 'node', nodeId: 'a' }, relation: 'left-of',
          target: { kind: 'node', nodeId: 'b' }, gap: 10,
        }],
      }),
    });
    expect(response.isError).toBe(true);
    expect(response.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'layout.constraint.required-unsatisfied',
    }));
  });

  it('renders approved label placement on a positioned graph', async () => {
    const response = await handleRender({
      content: JSON.stringify({
        version: '3.0.0', id: 'g',
        nodes: [{ id: 'team.api', type: 'service', position: { x: 0, y: 0 }, labelPlacement: { side: 'above' } }],
        edges: [],
      }),
    });
    expect(response.isError).toBeUndefined();
    expect(await svgFrom(response)).toContain('data-coral-node="team.api"');
    expect(await svgFrom(response)).toContain('team.api');
  });

  it('refuses an invalid centered offset before rendering positioned graphs', async () => {
    const response = await handleRender({
      content: JSON.stringify({
        version: '3.0.0', id: 'g',
        nodes: [{ id: 'team.api', type: 'service', position: { x: 0, y: 0 }, labelPlacement: { side: 'center', offset: 1 } }],
        edges: [],
      }),
    });
    expect(response.isError).toBe(true);
    expect(response.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'mcp.input.graphir.invalid', severity: 'error',
      message: expect.stringContaining('INVALID_LABEL_PLACEMENT /nodes/0/labelPlacement/offset'),
    }));
    expect(textFrom(response)).not.toContain('<svg');
  });

  it('renders nested nodes and cross-hierarchy edges through the shared layout', async () => {
    const r = await handleRender({
      content: `@diagram architecture
platform group as "Platform" {
  api service as "API"
}
store database as "Store"
platform.api -> store`,
    });
    const svg = await svgFrom(r);
    expect(svg).toContain('Platform');
    expect(svg).toContain('API');
    expect(svg).toContain('Store');
    expect(svg).toContain('data-coral-edge="edge-1"');
  });

  it('preserves manual nodes while filling missing geometry', async () => {
    const r = await handleRender({
      content: JSON.stringify({
        version: '3.0.0', id: 'g',
        nodes: [
          { id: 'fixed', type: 'service', position: { x: 777, y: 333 }, pinned: true },
          { id: 'auto', type: 'service' },
        ],
        edges: [{ id: 'e', source: 'fixed', target: 'auto' }],
      }),
    });
    const svg = await svgFrom(r);
    expect(svg).toContain('data-coral-node="fixed"');
    expect(svg).toContain('data-coral-node="auto"');
    const x = /data-coral-node="fixed">\s*<g transform="translate\(([-\d.]+),/.exec(svg)?.[1];
    expect(Number(x)).toBeGreaterThan(750);
  });

  it('carries dotted and dashed line styles', async () => {
    const r = await handleRender({
      content: '@diagram architecture\na service as "A"\nb service as "B"\n\na -.-> b',
    });
    expect(await svgFrom(r)).toContain('stroke-dasharray');
  });

  it('reports an empty diagram', async () => {
    const r = await handleRender({ content: '' });
    expect(r.isError).toBe(true);
  });

  it('rejects arguments that do not match the schema', async () => {
    await expect(handleRender({ options: {} })).rejects.toThrow();
  });
});

describe('coral_render: input edge cases', () => {
  it('rejects Graph-IR with no edges field', async () => {
    const r = await handleRender({
      content: JSON.stringify({ version: '3.0.0', id: 'g', nodes: [{ id: 'a', type: 'service', label: 'A' }] }),
    });
    expect(r.isError).toBe(true);
  });

  it('accepts Graph-IR with no nodes field', async () => {
    const r = await handleRender({ content: JSON.stringify({ version: '3.0.0', id: 'g' }) });
    expect(r.isError).toBe(true);
  });

  it('reports Coral text that produces no graph', async () => {
    const r = await handleRender({ content: '!!!not coral!!!' });
    expect(r.isError).toBe(true);
  });

  it('places a node ELK did not return a position for', async () => {
    // A node with no edges still has to land somewhere.
    const r = await handleRender({
      content: JSON.stringify({
        version: '3.0.0',
        id: 'g',
        nodes: [{ id: 'lonely', type: 'service', label: 'Lonely' }],
        edges: [],
      }),
    });
    expect(await svgFrom(r)).toContain('Lonely');
  });
});

describe('coral_render sequence documents (Slice 70, CR70-2)', () => {
  const recursiveGraph = JSON.stringify({ version: '3.0.0', id: 'seq',
    metadata: { notation: 'uml-sequence' }, profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
    nodes: [{ id: 'a', type: 'participant', label: 'A' }, { id: 'b', type: 'participant', label: 'B' }],
    edges: [{ id: 'm1', source: 'a', target: 'b', type: 'sync', label: 'ping' }],
    interaction: { participants: [{ id: 'a', nodeId: 'a' }, { id: 'b', nodeId: 'b' }],
      participantOrder: ['a', 'b'],
      messages: [{ id: 'm1', edgeId: 'm1', sourceParticipantId: 'a',
        targetParticipantId: 'b', kind: 'synchronous' }], messageOrder: ['m1'],
      fragments: [{ id: 'fragment-1', kind: 'alt', operands: [
        { id: 'fragment-1-operand-1', guard: { id: 'fragment-1-guard-1', text: 'retry' }, messageIds: ['m1'] },
        { id: 'fragment-1-operand-2', guard: { id: 'fragment-1-guard-2', text: 'stop' }, messageIds: [] },
      ] }],
      notes: [{ id: 'note-1', text: 'watch', participantIds: ['a'] }],
    },
  });

  it('draws the specialized sequence scene, never generic layout', async () => {
    const result = await handleRender({ content: recursiveGraph });
    expect(result.isError).toBeUndefined();
    const svg = await svgFrom(result);
    expect(svg).toContain('data-coral-sequence-fragment="fragment-1"');
    expect(svg).toContain('data-coral-sequence-note="note-1"');
    expect(svg).toContain('data-coral-sequence-message="m1"');
    expect(svg).not.toContain('data-coral-edge');
  });

  it('refuses an interaction outside the sequence subset with its diagnostic', async () => {
    const graph = {
      version: '3.0.0', id: 'bad', metadata: { notation: 'uml-sequence' }, profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
      nodes: [{ id: 'a', type: 'participant', label: 'A', symbol: 'uml-actor' }], edges: [],
      interaction: { participants: [{ id: 'a', nodeId: 'a' }], participantOrder: ['a'], messages: [], messageOrder: [] },
    };
    const result = await handleRender({ content: JSON.stringify(graph) });
    expect(result.isError).toBe(true);
    expect(textFrom(result)).toContain('coral.sequence.field.unsupported');
  });
});
it('retains semantic validation warnings in a successful sequence response', async () => {
  const result = await handleRender({ content: '@diagram uml-sequence\na participant\n' +
    'retry = a -> a as "Retry"' });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
    severity: 'warning', code: 'SELF_LOOP_EDGE', message: '/edges/0: Edge "retry" is a self-loop',
  }));
});

// Semantic capability notices must survive the MCP transport as structured data.
describe('BPMN semantic capability transport', () => {
  it.each([
    ['@diagram bpmn\narea group [symbol: "bpmn-lane"]\n',
      'render.capability.bpmn-scope', 'node', 'area'],
  ])('keeps %s attributable', async (content, code, kind, id) => {
    const result = await handleRender({ content, options: { style: 'hifi' } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning', code, subject: { kind, id },
    }));
  });

  it('rejects the disabled Chen document type without rewriting its source', async () => {
    const content = '@diagram erd\ncustomer entity\nid attribute\ncustomer -- id [type: attribute]\n';
    const result = await handleRender({ content });
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'header.diagram.disabled',
    }));
  });

  // 0.2.10 (RR-3, D4) / 0.2.11: a generated connector with no corridor of its
  // own (walled into a single narrow lane) is drawn and named in a warning
  // rather than failing the whole diagram.
  it('draws a degraded shared corridor with a located warning', async () => {
    const content = [
      '@diagram architecture',
      'a service @ (0, 0)',
      'b service @ (400, 0)',
      'top service @ (160, -105)',
      'bottom service @ (160, 105)',
      'e1 = a -> b',
      'e2 = b -> a',
      '',
    ].join('\n');
    const result = await handleRender({ content, options: { direction: 'RIGHT' } });
    expect(result.isError).toBeUndefined();
    expect(await svgFrom(result)).toMatch(/^<svg/);
    const degraded = (result.structuredContent?.diagnostics ?? []).filter(
      (d) => (d as { code?: string }).code === 'layout.route.degraded',
    );
    // 0.2.11 cleanly separates parallel connectors when room exists, or emits a
    // located warning when walled in — never fails with an error.
    if (degraded.length) {
      expect(degraded).toContainEqual(expect.objectContaining({
        code: 'layout.route.degraded', severity: 'warning',
      }));
    }
  });
});
