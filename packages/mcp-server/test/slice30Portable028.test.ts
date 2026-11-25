import { describe, expect, it } from 'vitest';
import { handleConvert } from '../src/tools/convert.js';
import { handleRender } from '../src/tools/render.js';
import { handleValidate } from '../src/tools/validate.js';

const recursiveSource = '@diagram uml-sequence\nclient participant\nserver participant\nworker participant\n' +
  'team = participants worker, server [label: "Operations"]\n' +
  'spawn = client -.-> worker [create]\n' +
  'phase = region "Review" {\n  choice = alt "approved" {\n' +
  '    work = activation worker {\n      call = worker -> server as "check"\n' +
  '      note "Recorded" on call\n    }\n  } else "retry" {\n' +
  '    reply = server -> worker as "retry"\n  }\n}\n' +
  'close = worker -> server [destroy]\n';

const anchoredLabels = '@diagram architecture\napi service {\n' +
  '  inbound port [direction: in, anchor: NW]\n  automatic port [direction: out, anchor: auto]\n}\n' +
  'store database {\n  outbound port [direction: out, anchor: SE]\n  inbound port [direction: in, anchor: SE]\n}\n' +
  'reply = api:inbound <- store:outbound [reads] as ""\n' +
  'request = api:automatic -> store:inbound [reads]\n';

function graphFrom(converted: Awaited<ReturnType<typeof handleConvert>>) {
  const text = (converted.content[0] as { text: string }).text;
  return JSON.parse(text.slice(text.indexOf('{')));
}

describe('Slice30 MCP portable behavior', () => {
  it('validates, renders, and exports the combined recursive fixture without flattening its timeline', async () => {
    const validated = await handleValidate({ content: recursiveSource });
    expect(validated.isError, validated.content[0]?.text).toBeUndefined();
    const converted = await handleConvert({ content: recursiveSource, to: 'json' });
    expect(converted.isError, converted.content[0]?.text).toBeUndefined();
    const graph = graphFrom(converted);
    expect(graph.interaction.items).toEqual([
      { kind: 'message', id: 'spawn' }, { kind: 'region', id: 'phase' },
      { kind: 'message', id: 'close' },
    ]);
    expect(graph.interaction.fragments[0].operands[0].items).toEqual([
      { kind: 'activation-start', id: 'work' }, { kind: 'message', id: 'call' },
      { kind: 'note', id: 'note-1' }, { kind: 'activation-end', id: 'work' },
    ]);
    const rendered = await handleRender({ content: recursiveSource });
    expect(rendered.isError, rendered.content[0]?.text).toBeUndefined();
    const svg = (rendered.content[0] as { text: string }).text;
    expect(svg).toContain('data-coral-sequence-region="phase"');
    expect(svg).toContain('data-coral-sequence-fragment="choice"');
    expect(svg).toContain('Recorded');
  });

  it('retains written endpoints, explicit auto, and empty-versus-omitted labels in portable JSON', async () => {
    const validated = await handleValidate({ content: anchoredLabels });
    expect(validated.isError, validated.content[0]?.text).toBeUndefined();
    const converted = await handleConvert({ content: anchoredLabels, to: 'json' });
    expect(converted.isError, converted.content[0]?.text).toBeUndefined();
    const graph = graphFrom(converted);
    expect(graph.edges).toMatchObject([
      { id: 'reply', first: { node: 'api', port: 'inbound' }, second: { node: 'store', port: 'outbound' },
        direction: 'second-to-first', label: '' },
      { id: 'request', first: { node: 'api', port: 'automatic' }, second: { node: 'store', port: 'inbound' },
        direction: 'first-to-second' },
    ]);
    expect(graph.edges[1]).not.toHaveProperty('label');
    expect(graph.nodes.find((node: { id: string }) => node.id === 'api').semanticPorts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'inbound', anchor: { kind: 'exact', position: 'NW' } }),
      expect.objectContaining({ id: 'automatic', anchor: { kind: 'auto' } }),
    ]));
  });

  it('reports reserved lost/found as explicit non-renderable source capability, retaining draft source', async () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'lost = client -> server [lost]\nfound = client -> server [found]\n';
    const checked = await handleValidate({ content: source });
    expect(checked.isError).toBe(true);
    expect(checked.structuredContent.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'render.capability.sequence-message-kind' }),
    ]));
    const roundTrip = await handleConvert({ content: source, from: 'coral', to: 'coral' });
    expect(roundTrip.isError).toBe(true);
    expect(roundTrip.structuredContent.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'render.capability.sequence-message-kind' }),
    ]));
  });
});
