import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { runRuleset028 } from '../src/conformance028.js';
import { checkGraphConformance028 } from '../src/graphConformance028.js';
import { bpmnRuleset028 } from '../src/rulesets/bpmn028.js';
import { resolveBpmnConnector028 } from '../src/bpmnConnector028.js';
import { checkInstalledDocumentConformance028 } from '../src/installedDocument028.js';

const graph: GraphIR = {
  version: '3.0.0', id: 'draft-bpmn', nodes: [
    { id: 'received', type: 'event', label: 'received' },
    { id: 'finished', type: 'endEvent', label: 'finished' },
  ], edges: [],
};

describe('approved generic BPMN event rule', () => {
  it('keeps the generic event unchanged at none, typical, and strict', () => {
    const none = runRuleset028('bpmn', graph, bpmnRuleset028, { savedLevel: 'none' });
    const typical = runRuleset028('bpmn', graph, bpmnRuleset028, { savedLevel: 'typical' });
    const strict = runRuleset028('bpmn', graph, bpmnRuleset028, { savedLevel: 'strict' });
    expect(none.findings).toEqual([]);
    expect(typical.findings).toEqual([]);
    expect(strict.findings.filter((finding) => finding.id === 'BPMN.EVENT.CONCRETE_KIND_REQUIRED')).toMatchObject([{
      id: 'BPMN.EVENT.CONCRETE_KIND_REQUIRED', category: 'notation', severity: 'error',
      subject: { kind: 'node', id: 'received' }, evidenceScope: 'node',
      remediation: expect.stringContaining('concrete'),
    }]);
    expect(graph.nodes[0]?.type).toBe('event');
    expect(graph.nodes[1]?.type).toBe('endEvent');
  });

  it('lets a one-off strict check inspect a typical draft without changing its setting', () => {
    const request = { savedLevel: 'typical' as const, requestedLevel: 'strict' as const, operation: 'save' as const };
    const report = runRuleset028('bpmn', graph, bpmnRuleset028, request);
    expect(report.evaluatedLevel).toBe('strict');
    expect(request.savedLevel).toBe('typical');
    expect(report.findings.filter((finding) => finding.id === 'BPMN.EVENT.CONCRETE_KIND_REQUIRED'))
      .toHaveLength(1);
    expect(report.notices).toEqual([]);
  });

  it('checks a generic event nested in a container', () => {
    const nested: GraphIR = { ...graph, nodes: [{ id: 'team', type: 'group', children: [
      { id: 'received', type: 'event', parent: 'team' },
    ] }] };
    const report = runRuleset028('bpmn', nested, bpmnRuleset028,
      { requestedLevel: 'strict' });
    expect(report.findings).toContainEqual(expect.objectContaining({
      id: 'BPMN.EVENT.CONCRETE_KIND_REQUIRED',
      subject: { kind: 'node', id: 'received' },
    }));
  });

  it('does not infer a concrete event kind from the selected glyph', () => {
    const explicit: GraphIR = { ...graph, nodes: [
      { id: 'started', type: 'event', symbol: 'bpmn-start-event' },
      { id: 'waiting', type: 'event', symbol: 'bpmn-intermediate-event' },
      { id: 'ended', type: 'event', symbol: 'bpmn-end-event' },
      { id: 'still-generic', type: 'event', symbol: 'bpmn-task' },
    ] };
    const report = runRuleset028('bpmn', explicit, bpmnRuleset028,
      { requestedLevel: 'strict', operation: 'check' });
    expect(report.findings.filter((finding) => finding.id === 'BPMN.EVENT.CONCRETE_KIND_REQUIRED')
      .map((finding) => finding.subject?.id)).toEqual(['started', 'waiting', 'ended', 'still-generic']);
    const integrated = checkGraphConformance028({ ...explicit,
      metadata: { notation: 'bpmn' } }, { requestedLevel: 'strict', operation: 'check' });
    expect(integrated.findings.filter((finding) => finding.id === 'BPMN.EVENT.CONCRETE_KIND_REQUIRED')
      .map((finding) => finding.subject?.id)).toEqual(['started', 'waiting', 'ended', 'still-generic']);
    expect(integrated.claimStatus).toBe('failed');
    const glyphOnly = checkGraphConformance028({ ...explicit,
      metadata: { notation: 'bpmn' }, nodes: explicit.nodes.slice(0, 3) },
    { requestedLevel: 'strict', operation: 'check' });
    expect(glyphOnly.findings.filter((finding) => finding.id === 'BPMN.EVENT.CONCRETE_KIND_REQUIRED'))
      .toHaveLength(3);
    expect(glyphOnly.claimStatus).toBe('failed');
    expect(explicit.nodes[0]?.type).toBe('event');
  });
});

describe('top-level BPMN sequence-flow event restrictions', () => {
  const rooted: GraphIR = { version: '3.0.0', id: 'bpmn-flow', metadata: { notation: 'bpmn' },
    nodes: [{ id: 'begin', type: 'startEvent' }, { id: 'work', type: 'task' },
      { id: 'done', type: 'endEvent' }],
    edges: [{ id: 'to-start', source: 'work', target: 'begin', type: 'sequence' },
      { id: 'from-end', source: 'done', target: 'work', type: 'sequence' }] };

  it('checks an authored reverse Sequence Flow even when a rare end hides its arrow', () => {
    const source = '@diagram bpmn\n@conformanceLevel strict\n' +
      'begin startEvent\ndone endEvent\n' +
      'begin <- done [sequence, firstEnd: zeroOrOne]';
    const checked = checkInstalledDocumentConformance028(source);
    expect(checked.report?.findings.map((finding) => finding.id)).toEqual(expect.arrayContaining([
      'BPMN.EVENT.TOP_LEVEL.START_INCOMING_SEQUENCE',
      'BPMN.EVENT.TOP_LEVEL.END_OUTGOING_SEQUENCE',
    ]));
    expect(checked.report?.unverifiedObligations).toContainEqual(expect.objectContaining({
      id: 'CORAL.DIRECTION.DISPLAY_UNVERIFIED',
    }));
  });

  it('infers Sequence Flow only from eligible solid single-arrow Flow Object connectors', () => {
    const kinds = new Map([['begin', { type: 'startEvent' }], ['work', { type: 'task' }],
      ['data', { type: 'bpmn-data-object' }]]);
    const edge: GraphIR['edges'][number] = { id: 'plain', source: 'begin', target: 'work',
      sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
      targetEnd: { marker: { kind: 'arrow', fill: 'open' } } };
    expect(resolveBpmnConnector028(edge, kinds)).toMatchObject({ effectiveRelation: 'sequence',
      origin: 'profile-default', direction: 'first-to-second', canonicalSequenceArrow: true });
    expect(resolveBpmnConnector028({ ...edge, type: 'sequence' }, kinds)).toMatchObject({
      effectiveRelation: 'sequence', origin: 'authored' });
    const reverse = { ...edge, sourceEnd: edge.targetEnd, targetEnd: edge.sourceEnd };
    expect(resolveBpmnConnector028(reverse, kinds)).toMatchObject({
      effectiveRelation: 'sequence', origin: 'profile-default', direction: 'second-to-first',
      canonicalSequenceArrow: true });
    for (const other of [
      { ...edge, sourceEnd: { marker: { kind: 'none' as const, fill: 'unspecified' as const } },
        targetEnd: { marker: { kind: 'none' as const, fill: 'unspecified' as const } } },
      { ...edge, style: { lineStyle: 'dashed' as const } },
      { ...edge, target: 'data' },
      { ...edge, type: 'message' },
    ]) {
      expect(resolveBpmnConnector028(other, kinds).effectiveRelation).not.toBe('sequence');
    }
  });

  it('reports unspecified BPMN connector relations without calling them Sequence Flow', () => {
    const draft: GraphIR = { ...rooted, nodes: [...rooted.nodes,
      { id: 'data', type: 'bpmn-data-object' }], edges: [
      { id: 'neutral', source: 'begin', target: 'work',
        sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'none', fill: 'unspecified' } } },
      { id: 'dashed', source: 'work', target: 'done', style: { lineStyle: 'dashed' },
        sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'arrow', fill: 'open' } } },
      { id: 'data', source: 'work', target: 'data',
        sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'arrow', fill: 'open' } } },
    ] };
    const typical = checkGraphConformance028(draft, { requestedLevel: 'typical', operation: 'check' });
    expect(typical.findings.filter((finding) =>
      finding.id === 'BPMN.CONNECTOR.EXPLICIT_RELATION_REQUIRED')).toEqual([]);
    const strict = checkGraphConformance028(draft, { requestedLevel: 'strict', operation: 'check' });
    const missing = strict.findings.filter((finding) =>
      finding.id === 'BPMN.CONNECTOR.EXPLICIT_RELATION_REQUIRED');
    expect(missing.map((finding) => finding.subject?.id)).toEqual(['neutral', 'dashed', 'data']);
    expect(missing.every((finding) => !finding.message.includes('is inferred'))).toBe(true);
    expect(strict.findings.map((finding) => finding.id))
      .toContain('BPMN.EVENT.TOP_LEVEL.START_OUTGOING_SEQUENCE_REQUIRED');
  });

  it('keeps an explicit but invalid Sequence Flow while rejecting non-Flow-Object endpoints', () => {
    const invalid: GraphIR = { ...rooted, nodes: [
      { id: 'begin', type: 'startEvent' }, { id: 'done', type: 'endEvent' },
      { id: 'data', type: 'bpmn-data-object', symbol: 'bpmn-task' },
    ], edges: [
      { id: 'start-data', source: 'begin', target: 'data', type: 'sequence' },
      { id: 'data-end', source: 'data', target: 'done', type: 'sequence' },
    ] };
    const none = checkGraphConformance028(invalid, { requestedLevel: 'none', operation: 'check' });
    expect(none.findings.filter((finding) => finding.id === 'BPMN.SEQUENCE.FLOW_OBJECT_ENDPOINTS'))
      .toEqual([]);
    const typical = checkGraphConformance028(invalid, { requestedLevel: 'typical', operation: 'check' });
    const errorsAtTypical = typical.findings.filter((finding) =>
      finding.id === 'BPMN.SEQUENCE.FLOW_OBJECT_ENDPOINTS');
    expect(errorsAtTypical.map((finding) => [finding.subject?.id, finding.severity]))
      .toEqual([['start-data', 'error'], ['data-end', 'error']]);
    expect(typical.notices).toEqual(expect.arrayContaining(errorsAtTypical));
    const saved = checkGraphConformance028(invalid, { requestedLevel: 'typical', operation: 'save' });
    expect(saved.notices.filter((finding) => finding.id === 'BPMN.SEQUENCE.FLOW_OBJECT_ENDPOINTS'))
      .toEqual([]);
    const strict = checkGraphConformance028(invalid, { requestedLevel: 'strict', operation: 'check' });
    const errors = strict.findings.filter((finding) => finding.id === 'BPMN.SEQUENCE.FLOW_OBJECT_ENDPOINTS');
    expect(errors.map((finding) => [finding.subject?.id, finding.severity]))
      .toEqual([['start-data', 'error'], ['data-end', 'error']]);
    expect(strict.findings.map((finding) => finding.id)).toEqual(expect.arrayContaining([
      'BPMN.EVENT.TOP_LEVEL.START_OUTGOING_SEQUENCE_REQUIRED',
      'BPMN.EVENT.TOP_LEVEL.END_INCOMING_SEQUENCE_REQUIRED',
    ]));
    expect(invalid.edges.map((edge) => edge.type)).toEqual(['sequence', 'sequence']);
  });

  it('reports definite incoming Start and outgoing End sequence flows only in strict', () => {
    const typical = checkGraphConformance028(rooted, { requestedLevel: 'typical', operation: 'check' });
    expect(typical.findings.filter((finding) => finding.id.startsWith('BPMN.EVENT.TOP_LEVEL.'))).toEqual([]);
    const strict = checkGraphConformance028(rooted, { requestedLevel: 'strict', operation: 'check' });
    expect(strict.findings.filter((finding) => [
      'BPMN.EVENT.TOP_LEVEL.START_INCOMING_SEQUENCE',
      'BPMN.EVENT.TOP_LEVEL.END_OUTGOING_SEQUENCE',
    ].includes(finding.id))).toMatchObject([
        { id: 'BPMN.EVENT.TOP_LEVEL.START_INCOMING_SEQUENCE', severity: 'error',
          subject: { kind: 'node', id: 'begin' } },
        { id: 'BPMN.EVENT.TOP_LEVEL.END_OUTGOING_SEQUENCE', severity: 'error',
          subject: { kind: 'node', id: 'done' } },
      ]);
  });

  it('accepts a top-level Start to Task to End sequence-flow path', () => {
    const valid: GraphIR = { ...rooted, edges: [
      { id: 'start-work', source: 'begin', target: 'work', type: 'sequence' },
      { id: 'work-end', source: 'work', target: 'done', type: 'sequence' },
    ] };
    const strict = checkGraphConformance028(valid, { requestedLevel: 'strict', operation: 'check' });
    expect(strict.findings.filter((finding) => finding.id.startsWith('BPMN.EVENT.TOP_LEVEL.'))).toEqual([]);
    expect(strict.unverifiedObligations).toEqual([]);
    expect(strict.ruleset).toMatchObject({ scope: 'coral-bounded-profile' });
  });

  it('requires a certain outgoing Start and incoming End sequence flow only in strict', () => {
    const isolated: GraphIR = { ...rooted, edges: [] };
    const typical = checkGraphConformance028(isolated, { requestedLevel: 'typical', operation: 'check' });
    expect(typical.findings.filter((finding) => finding.id.endsWith('_REQUIRED'))).toEqual([]);
    const strict = checkGraphConformance028(isolated, { requestedLevel: 'strict', operation: 'check' });
    expect(strict.findings.filter((finding) => finding.id.endsWith('_REQUIRED'))).toMatchObject([
      { id: 'BPMN.EVENT.TOP_LEVEL.START_OUTGOING_SEQUENCE_REQUIRED',
        subject: { kind: 'node', id: 'begin' } },
      { id: 'BPMN.EVENT.TOP_LEVEL.END_INCOMING_SEQUENCE_REQUIRED',
        subject: { kind: 'node', id: 'done' } },
    ]);
  });

  it('does not turn an explicitly neutral sequence connector into a fabricated missing-flow error', () => {
    const neutral: GraphIR = { ...rooted, edges: [{ id: 'undirected', source: 'begin', target: 'done',
      type: 'sequence', sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
      targetEnd: { marker: { kind: 'none', fill: 'unspecified' } } }] };
    const strict = checkGraphConformance028(neutral, { requestedLevel: 'strict', operation: 'check' });
    expect(strict.findings.filter((finding) => finding.id.endsWith('_REQUIRED'))).toEqual([]);
    expect(strict.claimStatus).toBe('unverified');
    expect(strict.unverifiedObligations).toContainEqual({
      id: 'BPMN.SEQUENCE.DIRECTION.UNVERIFIED',
      message: 'Sequence Flow undirected has no settled direction',
    });
    const sourceOwned = checkGraphConformance028({ ...neutral, edges: [{
      id: 'undirected', source: 'begin', target: 'done', type: 'sequence',
    }] }, { requestedLevel: 'strict', operation: 'check' }, [], undefined,
    { sourceDirections: new Map([['undirected', 'none']]) });
    expect(sourceOwned.findings.filter((finding) => finding.id.endsWith('_REQUIRED'))).toEqual([]);
    expect(sourceOwned.unverifiedObligations).toContainEqual({
      id: 'BPMN.SEQUENCE.DIRECTION.UNVERIFIED',
      message: 'Sequence Flow undirected has no settled direction',
    });
  });

  it('retains a source-authored neutral Sequence Flow and names its direction obligation', () => {
    const source = '@diagram bpmn\n@conformanceLevel strict\n' +
      'begin startEvent\ndone endEvent\nbegin -- done [sequence]';
    const checked = checkInstalledDocumentConformance028(source);
    expect(checked.document.graph?.edges[0]?.type).toBe('sequence');
    expect(checked.report?.findings.filter((finding) => finding.id.endsWith('_REQUIRED'))).toEqual([]);
    expect(checked.report?.unverifiedObligations).toContainEqual({
      id: 'BPMN.SEQUENCE.DIRECTION.UNVERIFIED',
      message: expect.stringMatching(/^Sequence Flow .+ has no settled direction$/),
    });
  });

  it('distinguishes two-ended Sequence Flow from directed Sequence Flow and Message Flow', () => {
    const source = '@diagram bpmn\n@conformanceLevel strict\n' +
      'begin startEvent\nwork task\ndone endEvent\n' +
      'begin <-> work [sequence]\nwork -> done [sequence]\nwork -- done [message]';
    const checked = checkInstalledDocumentConformance028(source);
    expect(checked.document.graph?.edges.map((edge) => edge.type))
      .toEqual(['sequence', 'sequence', 'message']);
    const obligations = checked.report?.unverifiedObligations.filter((item) =>
      item.id === 'BPMN.SEQUENCE.DIRECTION.UNVERIFIED');
    expect(obligations).toHaveLength(1);
    expect(obligations?.[0]?.message).toContain(checked.document.graph!.edges[0]!.id);
  });

  it('respects reversed arrow direction, excludes message flow, and leaves nested boundary cases unclaimed', () => {
    const scoped: GraphIR = { ...rooted,
      nodes: [{ id: 'begin', type: 'startEvent' }, { id: 'work', type: 'task' },
        { id: 'done', type: 'endEvent' }, { id: 'sub', type: 'subprocess', children: [
          { id: 'nestedStart', type: 'startEvent', parent: 'sub' },
          { id: 'nestedEnd', type: 'endEvent', parent: 'sub' },
        ] }],
      edges: [{ id: 'reverse', source: 'begin', target: 'work', type: 'sequence',
        sourceEnd: { marker: { kind: 'arrow', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'none', fill: 'unspecified' } } },
      { id: 'message', source: 'work', target: 'begin', type: 'message' },
      { id: 'neutral', source: 'done', target: 'work', type: 'sequence',
        sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'none', fill: 'unspecified' } } },
      { id: 'nested-in', source: 'work', target: 'nestedStart', type: 'sequence' },
      { id: 'nested-out', source: 'nestedEnd', target: 'work', type: 'sequence' }],
    };
    const strict = checkGraphConformance028(scoped, { requestedLevel: 'strict', operation: 'check' });
    expect(strict.findings.filter((finding) => finding.id.startsWith('GRAPHIR.'))
      .map((finding) => finding.message)).toEqual([]);
    const restricted = strict.findings.filter((finding) => [
      'BPMN.EVENT.TOP_LEVEL.START_INCOMING_SEQUENCE',
      'BPMN.EVENT.TOP_LEVEL.END_OUTGOING_SEQUENCE',
    ].includes(finding.id));
    expect(restricted).toMatchObject([{ id: 'BPMN.EVENT.TOP_LEVEL.START_INCOMING_SEQUENCE',
      subject: { kind: 'node', id: 'begin' } }]);
  });
});
