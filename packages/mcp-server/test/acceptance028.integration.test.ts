import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render as browserRender } from '../../browser/src/render.js';
import { getAvailableNotations028, projectInstalledSourceToSuccessor028 } from '@coral-viz/render';
import { handleConvert } from '../src/tools/convert.js';
import { handleRender } from '../src/tools/render.js';
import { handleValidate } from '../src/tools/validate.js';

const fixture = (name: string): string => readFileSync(resolve(import.meta.dirname,
  '../../browser/test/fixtures/acceptance028', name), 'utf8');
const digest = (value: string): string => createHash('sha256').update(value.replace(
  /coral-instance-(?:[0-9a-f]+-)+coral-marker/g,
  'coral-instance-SCOPED-coral-marker')).digest('hex');

describe('CR-100 actual sequence capability attribution', () => {
  for (const note of [false, true]) it.each([
    ['#FF0000', 'edge-rgb'], ['thick', 'edge-stroke-weight'],
    ['animated:reverse', 'edge-motion'],
  ])('attributes grouped sequence %s failure to its edge (note='+note+')', async (style, capability) => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'team = participants a, b [label: "Operations"]\n' +
      (note ? 'memo = note "Review" on b\n' : '') +
      'okay = a -> b\ncall = b -> a [style: "'+style+'"]\n';
    const expected = { code: 'render.capability.'+capability,
      subject: { kind: 'edge', id: 'call' },
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('"'+style+'"'),
      }) }) };
    const result = await handleRender({ content: source });
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.diagnostics).toContainEqual(expect.objectContaining(expected));
  });

});

describe('0.2.8 authored-source consumer parity', () => {
  it('keeps long dashed creation identity and proximity across conversion and browser/MCP SVG', async () => {
    const source = '@diagram uml-sequence\nclient participant\n' +
      'spawn = client -.----> worker [create]';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBeFalsy();
    const graph = JSON.parse(converted.content[0]!.text.slice(
      converted.content[0]!.text.indexOf('{')));
    expect(graph.edges[0]).toMatchObject({ id: 'spawn', proximityHint: 6 });
    expect(graph.interaction.messages[0]).toMatchObject({ id: 'spawn', kind: 'create' });
    expect(graph.interaction.participants).toContainEqual({
      id: 'worker', nodeId: 'worker', createdByMessageId: 'spawn',
    });
    const browser = await browserRender(source);
    const mcp = await handleRender({ content: source });
    expect(mcp.isError).toBeUndefined();
    const svg = mcp.content[0]?.text ?? '';
    expect(digest(svg.slice(svg.indexOf('<svg')))).toBe(digest(browser.svg));
    expect(svg).toContain('data-coral-sequence-message="spawn"');
  });

  it('returns a structured node-scoped open-triangle capacity refusal', async () => {
    const response = await handleRender({ content: fixture('uml-class-crowded.coral') });
    expect(response.isError).toBe(true);
    expect(response.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'layout.capability.unsupported', path: 'nodes.Document',
      subject: { kind: 'node', id: 'Document' },
    }));
  });

  it('exports distinct grouped UML classifiers with same local member names', async () => {
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
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBeFalsy();
    const graph = JSON.parse(converted.content[0]!.text.slice(
      converted.content[0]!.text.indexOf('{')));
    expect(graph.nodes.map((group: { children: Array<{ id: string }> }) => group.children[0]?.id))
      .toEqual(['left.Order', 'right.Order']);
    for (const group of graph.nodes) {
      expect(group.children[0].classifier.compartments[1].items)
        .toMatchObject([{ id: 'orderId', name: 'id' }]);
    }
    expect(graph.edges[0]).toMatchObject({
      first: { node: 'left.Order' }, second: { node: 'right.Order' }, direction: 'none',
    });
    const browser = await browserRender(source);
    const mcp = await handleRender({ content: source });
    expect(mcp.isError).toBeUndefined();
    const svg = mcp.content[0]?.text ?? '';
    expect(digest(svg.slice(svg.indexOf('<svg')))).toBe(digest(browser.svg));
  });

  it('locates a duplicate port assignment without losing the first authored assignment', async () => {
    const source = '@diagram architecture\napi service {\n' +
      '  send port [direction: out, direction: in]\n}\n';
    const checked = await handleValidate({ content: source });
    expect(checked.isError).toBe(true);
    const duplicate = (checked.structuredContent?.diagnostics as Array<{
      code: string; range?: { start: { offset: number }; end: { offset: number } };
      related?: Array<{ range: { start: { offset: number } } }>;
    }>).find((item) => item.code === 'coral.syntax.port.direction.duplicate');
    expect(duplicate?.range).toMatchObject({
      start: { offset: source.indexOf('direction: in') },
      end: { offset: source.indexOf('direction: in') + 'direction: in'.length },
    });
    expect(duplicate?.related?.[0]?.range?.start.offset).toBe(source.indexOf('direction: out'));
  });

  it('exports typed RGB meaning while browser and MCP rendering fail closed', async () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'paint = a -> b [style: #FF0000]';
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBeFalsy();
    expect(JSON.parse(converted.content[0]!.text.slice(
      converted.content[0]!.text.indexOf('{'))).edges[0]).toMatchObject({
      id: 'paint', style: { strokeColor: '#FF0000' },
    });
    await expect(browserRender(source)).rejects.toMatchObject({
      code: 'coral.browser.input.invalid',
    });
    const mcp = await handleRender({ content: source });
    expect(mcp.isError).toBe(true);
    expect(mcp.content[0]?.text).toContain('stroke color');
    const validated = await handleValidate({ content: source });
    expect(validated.isError).toBe(true);
    expect(validated.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'render.capability.edge-rgb',
    }));
  });
  it('exports an approved named color as exact RGB with its source token intact', async () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'paint = a -> b [style: green]';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.edges[0]?.style?.strokeColor).toBe('#008000');
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBeFalsy();
    const graph = JSON.parse(converted.content[0]!.text.slice(
      converted.content[0]!.text.indexOf('{')));
    expect(graph.edges[0]).toMatchObject({ id: 'paint',
      style: { strokeColor: '#008000' } });
    const validated = await handleValidate({ content: source });
    expect(validated.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'render.capability.edge-rgb',
    }));
    expect(source).toContain('[style: green]');
  });
  it('exports typed destruction and displays its terminal marker with browser/MCP parity', async () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'close = client -> server [destroy]';
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBeFalsy();
    const graph = JSON.parse(converted.content[0]!.text.slice(
      converted.content[0]!.text.indexOf('{')));
    expect(graph.interaction.participants).toContainEqual({
      id: 'server', nodeId: 'server', destroyedByMessageId: 'close',
    });
    expect(graph.interaction.messages).toContainEqual(expect.objectContaining({
      id: 'close', kind: 'destroy', receiverParticipantId: 'server',
    }));
    const browser = await browserRender(source);
    expect(browser.svg.includes('data-coral-destruction="server"')).toBe(true);
    const mcp = await handleRender({ content: source });
    expect(mcp.isError).toBeUndefined();
    const svg = mcp.content[0]!.text.slice(mcp.content[0]!.text.indexOf('<svg'));
    expect(digest(svg)).toBe(digest(browser.svg));
    const checked = await handleValidate({ content: source });
    expect(checked.isError).toBeUndefined();
    expect(checked.structuredContent?.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'render.capability.sequence-destroy',
    }));
  });
  it('exports typed weight and motion while browser and MCP rendering fail closed', async () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'paint = a -> b [style: "dotted, thick, animated:reverse"]';
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBeFalsy();
    expect(JSON.parse(converted.content[0]!.text.slice(
      converted.content[0]!.text.indexOf('{'))).edges[0]).toMatchObject({
      id: 'paint', style: { lineStyle: 'dotted', strokeWeight: 'thick',
        motion: { kind: 'animated', direction: 'second-to-first' } },
    });
    await expect(browserRender(source)).rejects.toMatchObject({
      code: 'coral.browser.input.invalid', diagnostics: [expect.objectContaining({
        code: 'render.capability.edge-stroke-weight',
      })],
    });
    const mcp = await handleRender({ content: source });
    expect(mcp.isError).toBe(true);
    expect(mcp.content[0]?.text).toContain('stroke weight');
    const validated = await handleValidate({ content: source });
    expect(validated.isError).toBe(true);
    expect(validated.structuredContent?.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'render.capability.edge-stroke-weight' }),
      expect.objectContaining({ code: 'render.capability.edge-motion' }),
    ]));
  });
  it('exports and displays an ordered sequence note with browser/MCP parity', async () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'call = api -> worker\ncheck = note "Check\\nRecord" on worker';
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBeFalsy();
    expect(JSON.parse(converted.content[0]!.text.slice(
      converted.content[0]!.text.indexOf('{'))).interaction).toMatchObject({
      notes: [{ id: 'check', text: 'Check\nRecord', participantIds: ['worker'] }],
      items: [{ kind: 'message', id: 'call' }, { kind: 'note', id: 'check' }],
    });
    const browser = await browserRender(source);
    expect(browser.svg).toContain('data-coral-sequence-note="check"');
    expect(browser.svg).toContain('Check');
    expect(browser.svg).toContain('Record');
    const mcp = await handleRender({ content: source });
    expect(mcp.isError).toBeUndefined();
    const svg = mcp.content[0]!.text.slice(mcp.content[0]!.text.indexOf('<svg'));
    expect(digest(svg)).toBe(digest(browser.svg));
    const checked = await handleValidate({ content: source });
    expect(checked.isError).toBeUndefined();
    expect(checked.structuredContent?.diagnostics).toEqual([]);
  });
  it('withholds a cross-operand named-message note from export and reports its target', async () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'choice = alt "yes" {\n  call = api -> worker\n' +
      '} else "no" {\n  note "Review" on call\n}';
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBe(true);
    const checked = await handleValidate({ content: source });
    expect(checked.isError).toBe(true);
    expect(checked.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.note.message-scope',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.lastIndexOf('call'),
      }) }),
    }));
    await expect(browserRender(source)).rejects.toMatchObject({
      code: 'coral.browser.input.invalid',
      diagnostics: [expect.objectContaining({ code: 'coral.sequence.note.message-scope' })],
    });
  });
  it.each([
    ['parallel operands', 'path = par {\n  api -> worker\n' +
      '} and "reply" {\n  worker -> api\n}', 'par', 'fragment', 'path'],
    ['activation', 'work = activation api {\n  api -> worker\n}', 'activation-start', 'activation', 'work'],
    ['region', 'phase = region "Review" {\n  api -> worker\n}', 'region', 'region', 'phase'],
  ] as const)('exports and displays %s with browser/MCP parity',
    async (_name, body, expected, sceneKind, sceneId) => {
      const source = `@diagram uml-sequence\napi participant\nworker participant\n${body}`;
      const converted = await handleConvert({ content: source, to: 'json' });
      expect(converted.isError).toBeFalsy();
      const graph = JSON.parse(converted.content[0]!.text.slice(
        converted.content[0]!.text.indexOf('{')));
      if (expected === 'par') expect(graph.interaction.fragments[0].kind).toBe('par');
      else expect(graph.interaction.items[0]).toEqual({ kind: expected, id: sceneId });
      const browser = await browserRender(source);
      expect(browser.svg).toContain(`data-coral-sequence-${sceneKind}="${sceneId}"`);
      const rendered = await handleRender({ content: source });
      expect(rendered.isError).toBeUndefined();
      const svg = rendered.content[0]!.text.slice(rendered.content[0]!.text.indexOf('<svg'));
      expect(digest(svg)).toBe(digest(browser.svg));
      const checked = await handleValidate({ content: source });
      expect(checked.isError).toBeUndefined();
      expect(checked.structuredContent?.diagnostics).toEqual([]);
    });
  it('renders and exports participant-group meaning through browser and MCP', async () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'team = participants worker, api [label: "Operations"]\napi -> worker';
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBeFalsy();
    const graph = JSON.parse(converted.content[0]!.text.slice(
      converted.content[0]!.text.indexOf('{')));
    expect(graph.interaction.groups).toEqual([{ id: 'team', label: 'Operations',
      participantIds: ['worker', 'api'] }]);
    expect(graph.interaction.participantOrder).toEqual(['api', 'worker']);
    const roundTrip = await handleConvert({ content: source, to: 'coral' });
    expect(roundTrip.isError).toBeFalsy();
    expect(roundTrip.content[0]!.text).toContain(source);
    const browser = await browserRender(source);
    expect(browser.svg).toContain('data-coral-sequence-group="team"');
    expect(browser.svg).toContain('data-coral-group-member="worker"');
    expect(browser.svg).toContain('data-coral-group-member="api"');
    const rendered = await handleRender({ content: source });
    expect(rendered.isError).toBeUndefined();
    const svg = rendered.content[0]!.text.slice(rendered.content[0]!.text.indexOf('<svg'));
    expect(digest(svg)).toBe(digest(browser.svg));
  });
  it('refuses an unresolved group member with the same source location in browser and MCP', async () => {
    const source = '@diagram uml-sequence\napi participant\n' +
      'team = participants api, missing\napi -> api';
    const offset = source.indexOf('missing');
    const located = expect.objectContaining({ code: 'coral.sequence.group.participant-unresolved',
      range: expect.objectContaining({ start: expect.objectContaining({ offset }) }) });
    expect(projectInstalledSourceToSuccessor028(source).graph).toBeUndefined();
    await expect(browserRender(source)).rejects.toMatchObject({ diagnostics: [located] });
    const rendered = await handleRender({ content: source });
    expect(rendered.isError).toBe(true);
    expect(rendered.structuredContent?.diagnostics).toContainEqual(located);
    expect(rendered.content.some((item) => item.type === 'text' && item.text.includes('<svg'))).toBe(false);
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBe(true);
    expect(converted.structuredContent?.diagnostics).toContainEqual(located);
    expect(converted.content.some((item) => item.type === 'text' &&
      item.text.includes('"version": "4.0.0"'))).toBe(false);
  });
  it.each(getAvailableNotations028().map((item) => item.id))(
    '%s keeps a relation-omitted connector in MCP and browser output', async (profile) => {
      const type = profile === 'uml-sequence' ? 'participant' : 'group';
      const source = `@diagram ${profile}\nfirst ${type}\nsecond ${type}\nlink = first -> second\n`;
      const browser = await browserRender(source);
      const mcp = await handleRender({ content: source });
      expect(mcp.isError).toBeUndefined();
      const text = mcp.content[0]?.text ?? '';
      expect(digest(text.slice(text.indexOf('<svg')))).toBe(digest(browser.svg));
      const checked = await handleValidate({ content: source });
      expect(checked.isError).toBeUndefined();
      const converted = await handleConvert({ content: source, to: 'json' });
      expect(converted.isError).toBeFalsy();
      const graph = JSON.parse(converted.content[0]!.text.slice(
        converted.content[0]!.text.indexOf('{')));
      expect(graph).toEqual(projectInstalledSourceToSuccessor028(source).graph);
      expect(graph.edges).toMatchObject([{ id: 'link', direction: 'first-to-second' }]);
    });

  it.each([
    'architecture-ports.coral', 'block-ports.coral', 'flowchart-draft.coral',
    'bpmn-event.coral', 'uml-sequence-flat.coral',
    'uml-class-named.coral',
  ])('%s renders the same SVG in browser and MCP', async (filename) => {
    const source = fixture(filename);
    const browser = await browserRender(source);
    const mcp = await handleRender({ content: source });
    expect(mcp.isError).toBeUndefined();
    const text = mcp.content[0]?.text ?? '';
    expect(digest(text.slice(text.indexOf('<svg')))).toBe(digest(browser.svg));
    const checked = await handleValidate({ content: source });
    expect(checked.isError).toBeUndefined();
  });

  it('keeps keyed rare end marks identical in browser and MCP output', async () => {
    const source = '@diagram architecture\na service\nz service\n' +
      'link = a -> z [firstEnd: zeroOrOne, secondEnd: zeroOrMany]\n';
    const browser = await browserRender(source);
    const mcp = await handleRender({ content: source });
    expect(mcp.isError).toBeUndefined();
    const text = mcp.content[0]?.text ?? '';
    expect(digest(text.slice(text.indexOf('<svg')))).toBe(digest(browser.svg));
    expect(browser.sourceGraph?.edges[0]).toMatchObject({ direction: 'first-to-second',
      firstEnd: { marker: { kind: 'zero-or-one' } },
      secondEnd: { marker: { kind: 'zero-or-many' } } });
    const checked = await handleValidate({ content: source });
    expect(checked.isError).toBeUndefined();
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBeFalsy();
    const json = converted.content[0]!.text;
    const graph = JSON.parse(json.slice(json.indexOf('{')));
    expect(graph.edges[0]).toMatchObject({ direction: 'first-to-second',
      firstEnd: { marker: { kind: 'zero-or-one' } },
      secondEnd: { marker: { kind: 'zero-or-many' } } });
  });

  it.each([
    'architecture-ports.coral', 'block-ports.coral', 'flowchart-draft.coral',
    'bpmn-event.coral', 'uml-sequence-flat.coral',
    'uml-class-named.coral',
  ])('%s converts to the exact source-owned successor model', async (filename) => {
    const source = fixture(filename);
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBeFalsy();
    const text = converted.content[0]!.text;
    const graph = JSON.parse(text.slice(text.indexOf('{')));
    expect(graph).toEqual(projectInstalledSourceToSuccessor028(source).graph);
    expect(graph.version).toBe('4.0.0');
  });

  it('refuses Chen ERD conversion without publishing a candidate graph', async () => {
    const source = fixture('erd-relationship.coral');
    const converted = await handleConvert({ content: source, to: 'json' });
    expect(converted.isError).toBe(true);
    expect(converted.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'header.diagram.disabled',
    }));
  });
});
