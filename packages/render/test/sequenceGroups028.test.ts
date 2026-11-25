import { describe, expect, it } from 'vitest';
import { validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import { layoutSequence, prepareSequenceScene028, projectInstalledSourceToSuccessor028,
  renderSvg, successorSourceDisplay028, successorCatalogSnapshot028, type SequenceGraph } from '../src/index.js';

function fixture() {
  const result = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na actor\nb participant\nc participant\nd participant\ncall = a -> b\nreply = b --> a');
  expect(result.diagnostics).toEqual([]);
  return result.graph!;
}

describe('typed participant-group scene placement', () => {
  for (const style of ['lowfi', 'hifi'] as const) {
    it('marks only exact noncontiguous members without reordering lanes in '+style, () => {
      const source = fixture();
      source.interaction!.groups = [
        { id: 'odd', label: 'Client\nroles', participantIds: ['c', 'a'] },
        { id: 'even', label: 'Service roles', participantIds: ['d', 'b'] },
      ];
      expect(validateGraphIRSuccessorWithCatalog(source, successorCatalogSnapshot028(source)).errors).toEqual([]);
      const before = JSON.stringify(source);
      const display = successorSourceDisplay028(source);
      const prepared = prepareSequenceScene028(display, { style, successorSource: source });
      const { scene } = prepared;
      expect(scene.participants.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd']);
      for (const input of source.interaction!.groups) {
        const group = scene.groups!.find(({ id }) => id === input.id)!;
        expect(group.participantIds).toEqual(input.participantIds);
        expect(group.label?.lines).toEqual(input.label!.split('\n'));
        expect(group.spans).toHaveLength(2);
        expect(group.members.map(({ id }) => id)).toEqual(input.participantIds);
        for (const member of group.members)
          expect(member.x).toBe(scene.participants.find(({ id }) => id === member.id)!.lifeline.x);
        expect(group.y + group.height).toBeLessThan(Math.min(...scene.participants.map(({ header }) => header.y)));
        expect(prepared.ownerLookup.hitBounds[`group:${group.id}`]).toEqual({ x: group.x, y: group.y, width: group.width, height: group.height });
        expect(group.x + group.width).toBeLessThanOrEqual(scene.width);
      }
      const svg = renderSvg(display, { style, successorSource: source });
      expect(svg).toContain('data-coral-sequence-group="odd"');
      expect(svg).toContain('data-coral-group-member="a"');
      expect(prepared.semantic.successorSource).toEqual(source);
      expect(JSON.stringify(source)).toBe(before);
      expect(JSON.stringify(display)).not.toContain('sourceTimeline028');
      const reversed = structuredClone(source);
      reversed.interaction!.groups!.reverse().forEach((group) => group.participantIds.reverse());
      const again = prepareSequenceScene028(successorSourceDisplay028(reversed), { style }).scene;
      expect(again.participants).toEqual(scene.participants);
      expect(again.groups!.map(({ id, x, y, width, height, spans }) => ({ id, x, y, width, height, spans })))
        .toEqual(scene.groups!.map(({ id, x, y, width, height, spans }) => ({ id, x, y, width, height, spans })));
    });

    it('reserves empty and long group labels without inventing members in '+style, () => {
      const source = fixture(); source.nodes = []; source.edges = [];
      source.interaction = { participants: [], participantOrder: [], messages: [], items: [], groups: [
        { id: 'empty', participantIds: [] },
        { id: 'blank', label: '', participantIds: [] },
        { id: 'long', label: 'Exact long label '.repeat(40), participantIds: [] },
      ] };
      expect(validateGraphIRSuccessorWithCatalog(source, successorCatalogSnapshot028(source)).errors).toEqual([]);
      const { scene } = prepareSequenceScene028(successorSourceDisplay028(source), { style, fontSize: 36 });
      expect(scene.participants).toEqual([]);
      expect(scene.messages).toEqual([]);
      expect(scene.groups).toHaveLength(3);
      for (const group of scene.groups!) {
        expect(group.members).toEqual([]);
        expect(group.spans).toEqual([]);
        expect(group.width).toBeGreaterThan(0);
        expect(group.height).toBeGreaterThan(0);
        expect(group.x + group.width).toBeLessThanOrEqual(scene.width);
        expect(group.y + group.height).toBeLessThan(scene.height);
      }
      expect(scene.groups!.find(({ id }) => id === 'empty')!.label).toBeUndefined();
      expect(scene.groups!.find(({ id }) => id === 'long')!.label!.lines.join('\n'))
        .toBe(source.interaction.groups![2].label);
    });

    it('keeps authored label placement and translated group contacts aligned in '+style, () => {
      const source = fixture();
      source.edges[0].label = 'Authored request';
      source.edges[0].labelPlacement = { side: 'above', at: 0.5, offset: 12 };
      source.interaction!.groups = [{ id: 'team', label: 'Exact group', participantIds: ['a', 'b'] }];
      const before = JSON.stringify(source);
      const prepared = prepareSequenceScene028(successorSourceDisplay028(source), { style });
      const { scene } = prepared;
      const group = scene.groups![0];
      const label = scene.messages[0].labelBounds!;
      expect(scene.messages[0].label!.lines.join(' ')).toBe('Authored request');
      expect(label.y).toBeGreaterThan(group.y + group.height);
      for (const member of group.members)
        expect(member.x).toBe(scene.participants.find(({ id }) => id === member.id)!.lifeline.x);
      expect(JSON.stringify(source)).toBe(before);
    });

    it('keeps kind-qualified ownership and lifecycle geometry in '+style, () => {
      const source = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na actor\nb participant\n' +
        'spawn = a -.-> b [create]\nwork = region "Work" {\ncall = b -> a\n}\nclose = a -> b [destroy]').graph!;
      const baseline = prepareSequenceScene028(successorSourceDisplay028(source), { style }).scene;
      source.interaction!.groups = [{ id: 'a', participantIds: ['a'], label: 'Initiator' },
        { id: 'call', participantIds: ['b'], label: 'Created later' }];
      const prepared = prepareSequenceScene028(successorSourceDisplay028(source), { style });
      const { scene } = prepared;
      const dy = scene.participants[0].header.y - baseline.participants[0].header.y;
      expect(dy).toBeGreaterThan(0);
      for (const [index, message] of scene.messages.entries())
        expect(message.points).toEqual(baseline.messages[index].points.map(({ x, y }) => ({ x, y: y + dy })));
      for (const [index, participant] of scene.participants.entries()) {
        expect(participant.header.y).toBe(baseline.participants[index].header.y + dy);
        expect(participant.lifeline.y2).toBe(baseline.participants[index].lifeline.y2 + dy);
      }
      expect(scene.regions![0].y).toBe(baseline.regions![0].y + dy);
      expect(prepared.ownerLookup.partIds['group:a'].length).toBeGreaterThan(0);
      expect(prepared.ownerLookup.partIds['participant:a'].length).toBeGreaterThan(0);
      expect(prepared.ownerLookup.partIds['group:call'].length).toBeGreaterThan(0);
      expect(prepared.ownerLookup.partIds['message:call'].length).toBeGreaterThan(0);
      expect(Object.keys(prepared.partIndex).length).toBe(new Set(Object.keys(prepared.partIndex)).size);
    });
  }

  it.each(['duplicate id', 'unknown', 'repeated', 'multiple groups', 'label'])(
    'refuses corrupt typed and derived group membership: %s', (mutation) => {
      const source = fixture();
      source.interaction!.groups = [{ id: 'team', participantIds: ['a', 'b'] }];
      const display = successorSourceDisplay028(source) as SequenceGraph;
      for (const interaction of [source.interaction!, display.sourceTimeline028!]) {
        if (mutation === 'duplicate id') interaction.groups!.push({ id: 'team', participantIds: [] });
        if (mutation === 'unknown') interaction.groups![0].participantIds.push('missing');
        if (mutation === 'repeated') interaction.groups![0].participantIds.push('a');
        if (mutation === 'multiple groups') interaction.groups!.push({ id: 'other', participantIds: ['a'] });
        if (mutation === 'label') Object.assign(interaction.groups![0], { label: 42 });
      }
      expect(() => successorSourceDisplay028(source)).toThrow();
      expect(() => layoutSequence(display)).toThrow(/group/);
    });

  it('defaults to shaded sequence group/region mode and supports bordered mode with tight lifeline scoping', () => {
    const dsl = [
      '@diagram uml-sequence',
      'a participant',
      'b participant',
      'c participant',
      'd participant',
      'e participant',
      'r1 = region "Intake" {',
      '  m1 = a -> b',
      '  m2 = b -> c',
      '}',
      'r2 = region "Fulfillment" {',
      '  m3 = c -> d',
      '  m4 = d -> e',
      '}',
    ].join('\n');
    const projected = projectInstalledSourceToSuccessor028(dsl);
    expect(projected.diagnostics).toEqual([]);
    const source = projected.graph!;
    source.interaction!.groups = [{ id: 'backend', label: 'Backend Tier', participantIds: ['c', 'd'] }];
    const display = successorSourceDisplay028(source);

    const shadedPrepared = prepareSequenceScene028(display, { style: 'hifi' });
    expect(shadedPrepared.scene.groupStyle).toBe('shaded');
    const shadedSvg = renderSvg(display, { style: 'hifi' });
    const borderedPrepared = prepareSequenceScene028(display, { style: 'hifi', sequenceGroupStyle: 'bordered' });
    expect(borderedPrepared.scene.groupStyle).toBe('bordered');
    const borderedSvg = renderSvg(display, { style: 'hifi', sequenceGroupStyle: 'bordered' });

    // Tight horizontal scoping: Intake covers a..c (excludes d, e); Fulfillment covers c..e (excludes a, b).
    const byId = new Map(shadedPrepared.scene.participants.map((p) => [p.id, p]));
    const r1 = shadedPrepared.scene.regions!.find((r) => r.id === 'r1')!;
    const r2 = shadedPrepared.scene.regions!.find((r) => r.id === 'r2')!;
    expect(r1.x).toBeLessThan(byId.get('a')!.lifeline.x);
    expect(r1.x + r1.width).toBeGreaterThan(byId.get('c')!.lifeline.x);
    expect(r1.x + r1.width).toBeLessThan(byId.get('d')!.lifeline.x);
    expect(r2.x).toBeGreaterThan(byId.get('b')!.lifeline.x);
    expect(r2.x).toBeLessThan(byId.get('c')!.lifeline.x);
    expect(r2.x + r2.width).toBeGreaterThan(byId.get('e')!.lifeline.x);

    // Paint order: groups and regions appear BEFORE participant lifelines so vertical lines stay uninterrupted.
    expect(shadedSvg.indexOf('data-coral-sequence-group="backend"')).toBeLessThan(
      shadedSvg.indexOf('data-coral-sequence-participant="a"'),
    );
    expect(shadedSvg.indexOf('data-coral-sequence-region="r1"')).toBeLessThan(
      shadedSvg.indexOf('data-coral-sequence-participant="a"'),
    );

    // Shaded mode fills group & region backgrounds; bordered mode uses fill="none" frames.
    const shadedGroupChunk = shadedSvg.slice(
      shadedSvg.indexOf('data-coral-sequence-group="backend"'),
      shadedSvg.indexOf('data-coral-sequence-region="r1"'),
    );
    expect(shadedGroupChunk).toContain('fill="#edf2f7"');
    const borderedGroupChunk = borderedSvg.slice(
      borderedSvg.indexOf('data-coral-sequence-group="backend"'),
      borderedSvg.indexOf('data-coral-sequence-region="r1"'),
    );
    expect(borderedGroupChunk).toContain('fill="none"');
    expect(borderedGroupChunk).toContain('data-coral-group-member="c"');
    expect(borderedGroupChunk).toContain('stroke="none"');
  });

  it('tightly scopes combined fragments that do not involve the leftmost participant', () => {
    const dsl = [
      '@diagram uml-sequence',
      'p0 participant',
      'p1 participant',
      'p2 participant',
      'p3 participant',
      'm0 = p0 -> p1',
      'f1 = alt "Outage" {',
      '  m1 = p1 -> p2',
      '  m2 = p1 -> p3',
      '} else "Blip" {',
      '  m3 = p1 -> p3',
      '}',
    ].join('\n');
    const projected = projectInstalledSourceToSuccessor028(dsl);
    expect(projected.diagnostics).toEqual([]);
    const source = projected.graph!;
    source.interaction!.groups = [{ id: 'db', label: 'Database Tier', participantIds: ['p2'] }];
    const scene = prepareSequenceScene028(successorSourceDisplay028(source), { style: 'hifi' }).scene;
    const byId = new Map(scene.participants.map((p) => [p.id, p]));
    const frag = scene.fragments[0]!;
    // Fragment excludes p0 (Prober) on the left and encloses p1..p3 cleanly.
    expect(frag.x).toBeGreaterThan(byId.get('p0')!.lifeline.x);
    expect(frag.x).toBeLessThan(byId.get('p1')!.lifeline.x);
    expect(frag.x + frag.width).toBeGreaterThan(byId.get('p3')!.lifeline.x);
    // Guards sit cleanly to the right of p1's lifeline without overlapping p0.
    for (const op of frag.operands) {
      expect(op.guard).toBeDefined();
      expect(op.guard!.x).toBeGreaterThan(byId.get('p1')!.lifeline.x);
    }
  });
});
