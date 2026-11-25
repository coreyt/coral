import { describe, expect, it } from 'vitest';
import { validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import { layoutSequence, prepareSequenceScene028, projectInstalledSourceToSuccessor028,
  renderSvg, successorSourceDisplay028, successorCatalogSnapshot028, type SequenceGraph } from '../src/index.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';

function fixture() {
  const graph = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na participant\nb participant\n' +
    'before = a -> b\ninside = b -> a\nafter = a -> b').graph!;
  const interaction = graph.interaction!;
  interaction.regions = [
    { id: 'outer', label: 'Review\nrequest', items: [{ kind: 'message', id: 'inside' },
      { kind: 'note', id: 'annotation' }, { kind: 'region', id: 'empty' }] },
    { id: 'empty', items: [] },
  ];
  interaction.notes = [{ id: 'annotation', text: 'Timeline annotation' }];
  interaction.fragments = [{ id: 'retry', kind: 'loop', operands: [{ id: 'body',
    items: [{ kind: 'region', id: 'outer' }] }] }];
  interaction.items = [{ kind: 'message', id: 'before' }, { kind: 'fragment', id: 'retry' },
    { kind: 'message', id: 'after' }];
  return graph;
}

describe('typed successor sequence regions', () => {
  it.each(['lowfi', 'hifi'] as const)('preserves recursive ordering, identity and empty regions in %s', async (style) => {
    const graph = fixture();
    expect(validateGraphIRSuccessorWithCatalog(graph, successorCatalogSnapshot028(graph)).errors).toEqual([]);
    const bytes = JSON.stringify(graph);
    const display = successorSourceDisplay028(graph);
    const prepared = prepareSequenceScene028(display, { style, successorSource: graph });
    const { scene } = prepared;
    expect(scene.messages.map((message) => message.id)).toEqual(['before', 'inside', 'after']);
    expect(scene.regions!.map((region) => region.id)).toEqual(['outer', 'empty']);
    const [outer, empty] = scene.regions!;
    const frame = scene.fragments[0];
    const inside = scene.messages[1].points[0].y;
    expect(outer.y).toBeGreaterThan(frame.y + frame.tab.height);
    expect(outer.y + outer.height).toBeLessThan(frame.y + frame.height);
    expect(inside).toBeGreaterThan(outer.y + outer.headingHeight);
    expect(inside).toBeLessThan(scene.notes[0].y);
    expect(scene.notes[0].y + scene.notes[0].height).toBeLessThan(empty.y);
    expect(empty.height).toBeGreaterThan(16);
    expect(empty.y + empty.height).toBeLessThan(outer.y + outer.height);
    expect(scene.messages[2].points[0].y).toBeGreaterThan(frame.y + frame.height);
    expect(outer.label?.lines).toEqual(['Review', 'request']);
    expect(empty.label).toBeUndefined();
    expect(outer.accessibleName).toContain('Review');
    expect(prepared.ownerLookup.hitBounds['region:outer']).toMatchObject({ x: outer.x, y: outer.y,
      width: outer.width, height: outer.height });
    expect(JSON.stringify(prepared.parts)).toContain('data-coral-sequence-region');
    const laid = await layoutGraphForSvg(display, { svgOptions: { style } });
    const svg = renderSvg(laid, { style, successorSource: graph });
    expect(svg).toContain('data-coral-sequence-region="outer"');
    expect(svg).toContain('data-coral-sequence-region="empty"');
    expect(svg).toContain('Timeline annotation');
    expect(JSON.stringify(graph)).toBe(bytes);
    expect(JSON.stringify(display)).not.toContain('sourceTimeline028');
  });

  it('keeps a nested fragment inside a region and measures a long region label', () => {
    const graph = fixture();
    graph.interaction!.items = [{ kind: 'region', id: 'wrapper' }];
    graph.interaction!.regions!.push({ id: 'wrapper', label: 'Long region label '.repeat(20),
      items: [{ kind: 'message', id: 'before' }, { kind: 'fragment', id: 'retry' },
        { kind: 'message', id: 'after' }] });
    const { scene } = prepareSequenceScene028(successorSourceDisplay028(graph));
    const wrapper = scene.regions!.find((region) => region.id === 'wrapper')!;
    const inner = scene.fragments[0];
    expect(inner.x).toBeGreaterThan(wrapper.x);
    expect(inner.y).toBeGreaterThan(wrapper.y + wrapper.headingHeight);
    expect(inner.y + inner.height).toBeLessThan(wrapper.y + wrapper.height);
    expect(wrapper.width).toBeGreaterThan(1000);
    expect(wrapper.label!.x).toBeGreaterThan(wrapper.x);
  });

  it('keeps overlapping activations on different participants while enforcing per-lane nesting', () => {
    const graph = fixture();
    const interaction = graph.interaction!;
    interaction.activations = [{ id: 'work-a', participantId: 'a' }, { id: 'work-b', participantId: 'b' }];
    interaction.regions![0].items = [{ kind: 'activation-start', id: 'work-a' },
      { kind: 'activation-start', id: 'work-b' }, ...interaction.regions![0].items,
      { kind: 'activation-end', id: 'work-a' }, { kind: 'activation-end', id: 'work-b' }];
    expect(validateGraphIRSuccessorWithCatalog(graph, successorCatalogSnapshot028(graph)).errors).toEqual([]);
    const display = successorSourceDisplay028(graph);
    const { scene } = prepareSequenceScene028(display);
    const [a, b] = scene.activations;
    expect(a.y).toBeLessThan(b.y);
    expect(a.y + a.height).toBeLessThan(b.y + b.height);
    const corrupt = display as SequenceGraph;
    corrupt.sourceTimeline028!.activations![1].participantId = 'a';
    expect(() => layoutSequence(corrupt)).toThrow(/activation/);
  });

  it('paints a containing fragment before its region, and outer regions before inner storage entries', () => {
    const graph = fixture();
    graph.interaction!.regions!.reverse();
    const { parts } = prepareSequenceScene028(successorSourceDisplay028(graph));
    const frames = parts.filter((part) => 'data-coral-sequence-fragment' in part.attrs || 'data-coral-sequence-region' in part.attrs);
    expect(frames.map((part) => part.attrs['data-coral-sequence-fragment'] ?? part.attrs['data-coral-sequence-region']))
      .toEqual(['retry', 'outer', 'empty']);
  });

  it('contains a large-font fragment tab in an empty region without participants', () => {
    const graph = fixture();
    graph.nodes = []; graph.edges = [];
    graph.interaction = { participants: [], participantOrder: [], messages: [],
      fragments: [{ id: 'lock', kind: 'critical', operands: [{ id: 'empty-body', items: [] }] }],
      regions: [{ id: 'wrapper', items: [{ kind: 'fragment', id: 'lock' }] }],
      items: [{ kind: 'region', id: 'wrapper' }] };
    const { scene } = prepareSequenceScene028(successorSourceDisplay028(graph), { style: 'lowfi', fontSize: 36 });
    const frame = scene.fragments[0];
    expect(frame.tab.width).toBeLessThan(frame.width);
    expect(frame.tab.x + frame.tab.width).toBeLessThan(scene.width);
    expect(frame.x).toBeGreaterThan(scene.regions![0].x);
  });

  it('places participant group headings without changing lane order', () => {
    const graph = fixture();
    graph.interaction!.groups = [{ id: 'service', label: 'Service', participantIds: ['b', 'a'] }];
    const before = JSON.stringify(graph);
    const { scene } = prepareSequenceScene028(successorSourceDisplay028(graph));
    expect(scene.groups![0].participantIds).toEqual(['b', 'a']);
    expect(scene.participants.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it.each(['orphan', 'repeated', 'cycle', 'unknown', 'scope', 'lifecycle'])(
    'refuses invalid region containment: %s', (mutation) => {
      const graph = fixture();
      const interaction = graph.interaction!;
      if (mutation === 'orphan') interaction.regions!.push({ id: 'orphan', items: [] });
      if (mutation === 'repeated') interaction.items.push({ kind: 'region', id: 'outer' });
      if (mutation === 'cycle') interaction.regions![1].items.push({ kind: 'region', id: 'outer' });
      if (mutation === 'unknown') interaction.regions![1].items.push({ kind: 'region', id: 'missing' });
      if (mutation === 'scope') interaction.notes![0].messageIds = ['before'];
      if (mutation === 'lifecycle') interaction.messages[1].kind = 'destroy';
      expect(() => prepareSequenceScene028(successorSourceDisplay028(graph))).toThrow();
    });

  it('rejects a region ID colliding with a message ID at the production adapter boundary', () => {
    const graph = fixture();
    graph.interaction!.regions![1].id = 'inside';
    graph.interaction!.regions![0].items[2].id = 'inside';
    expect(() => successorSourceDisplay028(graph)).toThrow(/Invalid successor sequence/);
  });

  it('rejects region-contained uses before root creation at adapter and derived layout boundaries', () => {
    const graph = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na participant\nworker participant\n' +
      'spawn = a -.-> worker [create]\ncall = worker -> a').graph!;
    expect(graph.interaction!.participants[1].createdByMessageId).toBe('spawn');
    graph.interaction!.regions = [{ id: 'work', items: [{ kind: 'message', id: 'call' }] }];
    graph.interaction!.items = [{ kind: 'message', id: 'spawn' }, { kind: 'region', id: 'work' }];
    const display = successorSourceDisplay028(graph) as SequenceGraph;
    graph.interaction!.items.reverse();
    expect(() => successorSourceDisplay028(graph)).toThrow(/Invalid successor sequence/);
    display.sourceTimeline028!.items.reverse();
    expect(() => layoutSequence(display)).toThrow(/outside its lifetime/);
  });

  it('refuses a corrupt derived region tree without recursing indefinitely', () => {
    const display = successorSourceDisplay028(fixture()) as SequenceGraph;
    display.sourceTimeline028!.regions![1].items.push({ kind: 'region', id: 'outer' });
    expect(() => layoutSequence(display)).toThrow(/coral.sequence.layout.invalid/);
  });
});
