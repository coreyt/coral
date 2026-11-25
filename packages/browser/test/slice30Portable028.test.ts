import { describe, expect, it } from 'vitest';
import { render } from '../src/index.js';
import { handleRender } from '../../mcp-server/src/tools/render.js';

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

describe('Slice30 browser portable behavior', () => {
  it('renders the combined recursive successor fixture with shared IDs and accessible descriptions', async () => {
    const result = await render(recursiveSource);
    expect(result.sourceGraph?.interaction?.items).toEqual([
      { kind: 'message', id: 'spawn' }, { kind: 'region', id: 'phase' },
      { kind: 'message', id: 'close' },
    ]);
    expect(result.sourceGraph?.interaction?.messages.map(({ id }) => id))
      .toEqual(['spawn', 'call', 'reply', 'close']);
    for (const id of ['phase', 'choice', 'work', 'call', 'team']) expect(result.svg).toContain(id);
    expect(result.svg).toContain('Recorded');

    const mcp = await handleRender({ content: recursiveSource });
    expect(mcp.isError).toBeUndefined();
    const svg = (mcp.content[0] as { text: string }).text.slice(
      (mcp.content[0] as { text: string }).text.indexOf('<svg'));
    for (const id of ['data-coral-sequence-region="phase"', 'data-coral-sequence-fragment="choice"']) {
      expect(svg).toContain(id);
      expect(result.svg).toContain(id);
    }
  });

  it('preserves written anchor endpoints and distinguishes empty from omitted connector labels', async () => {
    const result = await render(anchoredLabels);
    const source = result.sourceGraph!;
    expect(source.edges).toMatchObject([
      { id: 'reply', first: { node: 'api', port: 'inbound' }, second: { node: 'store', port: 'outbound' },
        direction: 'second-to-first', label: '' },
      { id: 'request', first: { node: 'api', port: 'automatic' }, second: { node: 'store', port: 'inbound' },
        direction: 'first-to-second' },
    ]);
    expect(source.edges[1]).not.toHaveProperty('label');
    expect(source.nodes.find(({ id }) => id === 'api')?.semanticPorts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'inbound', anchor: { kind: 'exact', position: 'NW' } }),
      expect.objectContaining({ id: 'automatic', anchor: { kind: 'auto' } }),
    ]));
    expect(result.svg).toContain('data-coral-edge="reply"');
    expect(result.svg).toContain('data-coral-edge="request"');
  });

  it('refuses source-authored lost/found with the explicit sequence capability, without rendering a normal message', async () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'lost = client -> server [lost]\nfound = client -> server [found]\n';
    await expect(render(source)).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'render.capability.sequence-message-kind' }),
      ]),
    });
  });
});
