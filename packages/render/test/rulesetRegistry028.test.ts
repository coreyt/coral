import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { runRuleset028 } from '../src/conformance028.js';
import { getAvailableNotations028, getAllNotations } from '../src/notations/index.js';
import { checkGraphConformance028 } from '../src/graphConformance028.js';
import { profileRuleCard028, registeredProfileRuleCardIds028 } from '../src/rulesets/index028.js';

const graph = (profile: string, nodes: GraphIR['nodes'], edges: GraphIR['edges'] = []): GraphIR => ({
  version: '3.0.0', id: `rule-evidence-${profile}`, metadata: { notation: profile }, nodes, edges,
});

const passingDecision = graph('flowchart', [
  { id: 'entry', type: 'process' }, { id: 'decision', type: 'decision' },
  { id: 'yes', type: 'process' }, { id: 'no', type: 'process' },
], [
  { id: 'enter', source: 'entry', target: 'decision' },
  { id: 'yes-path', source: 'decision', target: 'yes' },
  { id: 'no-path', source: 'decision', target: 'no' },
]);

const passingSequence: GraphIR = {
  ...graph('uml-sequence', [
    { id: 'client', type: 'participant' }, { id: 'server', type: 'participant' },
  ], [{ id: 'request', source: 'client', target: 'server', type: 'sync' }]),
  profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
  interaction: {
    participants: [{ id: 'client', nodeId: 'client' }, { id: 'server', nodeId: 'server' }],
    participantOrder: ['client', 'server'],
    messages: [{ id: 'request', edgeId: 'request', sourceParticipantId: 'client',
      targetParticipantId: 'server', kind: 'synchronous' }],
    messageOrder: ['request'],
  },
};

/** Every card-defined rule needs positive and negative evidence before it joins a card. */
const ruleEvidence: Readonly<Record<string, {
  profile: string; positive: GraphIR; negative: GraphIR;
}>> = {
  'CORAL.FLOWCHART.DECISION.SINGLE_ENTRY': {
    profile: 'flowchart', positive: passingDecision,
    negative: { ...passingDecision, edges: passingDecision.edges.filter((edge) => edge.id !== 'enter') },
  },
  'CORAL.FLOWCHART.DECISION.ALTERNATIVES': {
    profile: 'flowchart', positive: passingDecision,
    negative: { ...passingDecision, edges: passingDecision.edges.filter((edge) => edge.id !== 'no-path') },
  },
  'BPMN.EVENT.CONCRETE_KIND_REQUIRED': {
    profile: 'bpmn', positive: graph('bpmn', [{ id: 'started', type: 'startEvent' }]),
    negative: graph('bpmn', [{ id: 'started', type: 'event' }]),
  },
  'BPMN.CONNECTOR.EXPLICIT_RELATION_REQUIRED': {
    profile: 'bpmn',
    positive: graph('bpmn', [{ id: 'begin', type: 'startEvent' }, { id: 'work', type: 'task' }],
      [{ id: 'flow', source: 'begin', target: 'work', type: 'sequence' }]),
    negative: graph('bpmn', [{ id: 'begin', type: 'startEvent' }, { id: 'work', type: 'task' }],
      [{ id: 'flow', source: 'begin', target: 'work',
        sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'arrow', fill: 'open' } } }]),
  },
  'BPMN.CONNECTOR.RELATION_UNREGISTERED': {
    profile: 'bpmn',
    positive: graph('bpmn', [{ id: 'begin', type: 'startEvent' }, { id: 'work', type: 'task' }],
      [{ id: 'flow', source: 'begin', target: 'work', type: 'sequence' }]),
    negative: graph('bpmn', [{ id: 'begin', type: 'startEvent' }, { id: 'work', type: 'task' }],
      [{ id: 'flow', source: 'begin', target: 'work', type: 'reads' }]),
  },
  'BPMN.SEQUENCE.FLOW_OBJECT_ENDPOINTS': {
    profile: 'bpmn',
    positive: graph('bpmn', [{ id: 'begin', type: 'startEvent' }, { id: 'work', type: 'task' }],
      [{ id: 'flow', source: 'begin', target: 'work', type: 'sequence' }]),
    negative: graph('bpmn', [{ id: 'begin', type: 'startEvent' },
      { id: 'data', type: 'bpmn-data-object' }],
    [{ id: 'flow', source: 'begin', target: 'data', type: 'sequence' }]),
  },
  'BPMN.EVENT.TOP_LEVEL.START_INCOMING_SEQUENCE': {
    profile: 'bpmn',
    positive: graph('bpmn', [{ id: 'begin', type: 'startEvent' }, { id: 'work', type: 'task' }],
      [{ id: 'forward', source: 'begin', target: 'work', type: 'sequence' }]),
    negative: graph('bpmn', [{ id: 'begin', type: 'startEvent' }, { id: 'work', type: 'task' }],
      [{ id: 'backward', source: 'work', target: 'begin', type: 'sequence' }]),
  },
  'BPMN.EVENT.TOP_LEVEL.END_OUTGOING_SEQUENCE': {
    profile: 'bpmn',
    positive: graph('bpmn', [{ id: 'work', type: 'task' }, { id: 'done', type: 'endEvent' }],
      [{ id: 'forward', source: 'work', target: 'done', type: 'sequence' }]),
    negative: graph('bpmn', [{ id: 'work', type: 'task' }, { id: 'done', type: 'endEvent' }],
      [{ id: 'backward', source: 'done', target: 'work', type: 'sequence' }]),
  },
  'BPMN.EVENT.TOP_LEVEL.START_OUTGOING_SEQUENCE_REQUIRED': {
    profile: 'bpmn',
    positive: graph('bpmn', [{ id: 'begin', type: 'startEvent' }, { id: 'work', type: 'task' }],
      [{ id: 'forward', source: 'begin', target: 'work', type: 'sequence' }]),
    negative: graph('bpmn', [{ id: 'begin', type: 'startEvent' }]),
  },
  'BPMN.EVENT.TOP_LEVEL.END_INCOMING_SEQUENCE_REQUIRED': {
    profile: 'bpmn',
    positive: graph('bpmn', [{ id: 'work', type: 'task' }, { id: 'done', type: 'endEvent' }],
      [{ id: 'forward', source: 'work', target: 'done', type: 'sequence' }]),
    negative: graph('bpmn', [{ id: 'done', type: 'endEvent' }]),
  },
  'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT': {
    profile: 'uml-sequence', positive: passingSequence,
    negative: { ...passingSequence,
      edges: [{ id: 'request', source: 'client', target: 'server', type: 'async' }] },
  },
  'CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE': {
    profile: 'uml-class',
    positive: graph('uml-class', [{ id: 'Child', type: 'class' }, { id: 'Base', type: 'class' }],
      [{ id: 'generalizes', source: 'Child', target: 'Base', type: 'inheritance',
        targetEnd: { marker: { kind: 'triangle', fill: 'open' } } }]),
    negative: graph('uml-class', [{ id: 'Child', type: 'class' }, { id: 'Base', type: 'class' }],
      [{ id: 'generalizes', source: 'Child', target: 'Base', type: 'inheritance',
        targetEnd: { marker: { kind: 'arrow', fill: 'open' } } }]),
  },
  'CORAL.UML.SEQUENCE.TYPE_UNRECOGNIZED': {
    profile: 'uml-sequence', positive: passingSequence,
    negative: { ...passingSequence,
      edges: [{ id: 'request', source: 'client', target: 'server', type: 'reads' }] },
  },
};

describe('U2 profile rule-card registry', () => {
  it('has executable positive and negative evidence for every card-defined rule', () => {
    const installedRuleIds = new Set<string>();
    for (const profileId of registeredProfileRuleCardIds028()) {
      for (const rule of profileRuleCard028(profileId).rules) {
        expect(installedRuleIds.has(rule.id), `duplicate global rule ID ${rule.id}`).toBe(false);
        installedRuleIds.add(rule.id);
        const evidence = ruleEvidence[rule.id];
        expect(evidence, `missing rule evidence for ${rule.id}`).toBeDefined();
        expect(evidence?.profile).toBe(profileId);
        expect(rule.check(evidence!.positive), `positive evidence for ${rule.id}`).toEqual([]);
        expect(rule.check(evidence!.negative).length, `negative evidence for ${rule.id}`).toBeGreaterThan(0);
      }
    }
    expect([...installedRuleIds].sort()).toEqual(Object.keys(ruleEvidence).sort());
  });

  it('names every installed diagram profile explicitly', () => {
    const installed = getAllNotations().map((notation) => notation.id).sort();
    expect(registeredProfileRuleCardIds028().sort()).toEqual(installed);
    for (const notation of getAllNotations()) {
      const card = profileRuleCard028(notation.id);
      expect(card.profileId).toBe(notation.id);
      expect(card.coverage).toBe(['erd', 'uml-state'].includes(notation.id) ? 'partial' : 'complete');
      if (!['erd', 'uml-state'].includes(notation.id)) {
        expect(card.version).toBe('0.2.8-bounded.1');
        expect(card).toHaveProperty('scope', 'coral-bounded-profile');
        expect(card.obligations).toEqual([]);
      }
    }
  });

  it('keeps installed coverage and rule evidence immutable after lookup', () => {
    for (const profileId of registeredProfileRuleCardIds028()) {
      const card = profileRuleCard028(profileId);
      expect(Object.isFrozen(card), profileId).toBe(true);
      expect(Object.isFrozen(card.rules), profileId).toBe(true);
      expect(Object.isFrozen(card.obligations), profileId).toBe(true);
      for (const obligation of card.obligations ?? []) {
        expect(Object.isFrozen(obligation), profileId).toBe(true);
      }
      for (const rule of card.rules) {
        expect(Object.isFrozen(rule), profileId).toBe(true);
        expect(Object.isFrozen(rule.provenance), profileId).toBe(true);
      }
      const coverage = card.coverage;
      expect(Reflect.set(card, 'coverage', 'partial'), profileId).toBe(false);
      expect(profileRuleCard028(profileId).coverage).toBe(coverage);
    }
  });

  it('retains the reviewed flowchart, BPMN, and sequence rules', () => {
    expect(profileRuleCard028('flowchart').rules.map((rule) => rule.id))
      .toContain('CORAL.FLOWCHART.DECISION.SINGLE_ENTRY');
    expect(profileRuleCard028('bpmn').rules.map((rule) => rule.id))
      .toContain('BPMN.EVENT.CONCRETE_KIND_REQUIRED');
    expect(profileRuleCard028('uml-sequence').rules.map((rule) => rule.id))
      .toContain('CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT');
  });

  it('does not make an unknown profile look like a generic approved ruleset', () => {
    for (const profile of ['uninstalled', '__proto__', 'constructor', 'toString']) {
      expect(() => profileRuleCard028(profile)).toThrow(/Unreviewed conformance profile/);
    }
  });

  it('offers a bounded notation inventory to certify', () => {
    expect(getAvailableNotations028().length).toBeGreaterThan(0);
  });

  it.each(getAvailableNotations028().map(({ id }) => id))(
    'certifies only the reviewed bounded %s inventory on an explicit strict check', (id) => {
      const input = id === 'uml-sequence' ? passingSequence : graph(id, []);
      const report = checkGraphConformance028(input, { requestedLevel: 'strict', operation: 'check' });
      expect(report.ruleset).toMatchObject({ profileId: id, version: '0.2.8-bounded.1',
        scope: 'coral-bounded-profile' });
      expect(report.unverifiedObligations).toEqual([]);
      expect(report.claimStatus, id + ': ' + JSON.stringify(report.findings)).toBe('conformant');
      for (const operation of ['edit', 'save', 'close'] as const) {
        expect(checkGraphConformance028(input, { requestedLevel: 'strict', operation }).claimStatus)
          .toBe('not-claimed');
      }
      for (const requestedLevel of ['none', 'typical'] as const) {
        expect(checkGraphConformance028(input, { requestedLevel, operation: 'check' }).claimStatus)
          .toBe('not-claimed');
      }
    });

  it('retains the installed character-only state edition as a partial U2 card', () => {
    expect(getAllNotations().some(({ id }) => id === 'uml-state')).toBe(true);
    expect(getAvailableNotations028().some(({ id }) => id === 'uml-state')).toBe(false);
    const card = profileRuleCard028('uml-state');
    expect(card.coverage).toBe('partial');
    expect(card).not.toHaveProperty('scope');
    expect(card.rules).toEqual([]);
    expect(card.obligations).toEqual([expect.objectContaining({ id: 'UML.STATE.PROFILE_RULES.UNVERIFIED' })]);
    const report = checkGraphConformance028(graph('uml-state', []),
      { requestedLevel: 'strict', operation: 'check' });
    expect(report.claimStatus).toBe('unverified');
    expect(report.unverifiedObligations).toEqual(card.obligations);
  });

  it.each(['flowchart', 'bpmn'])('keeps %s source-direction factory scope identical to static lookup', (profile) => {
    const dynamic = profileRuleCard028(profile, new Map());
    const plain = profileRuleCard028(profile);
    expect({ ...dynamic, rules: [] }).toEqual({ ...plain, rules: [] });
    expect(dynamic.rules.map(({ id }) => id)).toEqual(plain.rules.map(({ id }) => id));
    expect(Object.isFrozen(dynamic)).toBe(true);
    expect(Object.isFrozen(dynamic.obligations)).toBe(true);
  });

  it('executes both signs of every approved rule at each level without changing evidence', () => {
    for (const [id, evidence] of Object.entries(ruleEvidence)) {
      const { profile } = evidence;
      const card = profileRuleCard028(profile);
      const rule = card.rules.find((item) => item.id === id)!;
      for (const level of ['none', 'typical', 'strict'] as const) {
        for (const [sign, input] of [['positive', evidence.positive], ['negative', evidence.negative]] as const) {
          const before = structuredClone(input);
          const report = runRuleset028(profile, input, { ...card, rules: [rule] },
            { requestedLevel: level, notificationLevel: 'debug', operation: 'check' });
          const active = level === 'strict' || level === 'typical' && rule.minimumLevel === 'typical';
          expect(report.findings.length, id + '/' + level + '/' + sign)
            .toBe(active && sign === 'negative' ? rule.check(input).length : 0);
          for (const finding of report.findings) expect(finding).toMatchObject({ id,
            severity: level === 'strict' ? rule.strictSeverity ?? rule.severity : rule.severity,
            provenance: rule.provenance, evidenceScope: rule.evidenceScope, remediation: rule.remediation });
          expect(input).toEqual(before);
        }
      }
    }
  });
});
