import { describe, expect, it } from 'vitest';
import {
  reviewVocabulary,
  previewProfileSwitch,
  type VocabularyClaim,
  type VocabularyRegistry,
} from '../src/vocabularyReview.js';

// These are review candidates, not a Coral parser allowlist or approved glossary.
const survey = { kind: 'survey' as const, reference: 'notation-vocabulary-scope-survey.md' };
const eventModel: VocabularyClaim = {
  id: 'event-model-event', conceptId: 'recorded-fact', spelling: 'event',
  role: 'element-kind', scope: { kind: 'profile', profile: 'event-modeling' },
  definition: 'A recorded domain fact.', provenance: [survey], status: 'proposed',
};
const timelineEvent: VocabularyClaim = {
  id: 'timeline-event', conceptId: 'scheduled-occurrence', spelling: 'event',
  role: 'element-kind', scope: { kind: 'profile', profile: 'timeline' },
  definition: 'An occurrence located in project time.', provenance: [survey], status: 'deferred',
};
const gitBranch: VocabularyClaim = {
  id: 'git-branch', conceptId: 'git-branch-object', spelling: 'branch',
  role: 'element-kind', scope: { kind: 'profile', profile: 'gitgraph' },
  definition: 'Named Git history line.', provenance: [survey], status: 'proposed',
};
const mindmapBranch: VocabularyClaim = {
  id: 'mindmap-branch', conceptId: 'topic-branch', spelling: 'branch',
  role: 'relation-kind', scope: { kind: 'profile', profile: 'mindmap' },
  definition: 'Parent-child topic relation.', provenance: [survey], status: 'proposed',
};

describe('candidate vocabulary review, not Coral diagnostics', () => {
  it('has closed role, scope, and disposition shapes at compile time', () => {
    const invalidRole: VocabularyClaim = {
      ...eventModel,
      // @ts-expect-error Unreviewed grammatical roles are not registry roles.
      role: 'node',
    };
    const invalidScope: VocabularyClaim = {
      ...eventModel,
      // @ts-expect-error A profile claim needs an explicit named profile.
      scope: { kind: 'profile' },
    };
    const invalidDisposition: VocabularyRegistry = {
      claims: [eventModel, timelineEvent],
      dispositions: [
        // @ts-expect-error Accepted reuse needs interpretations and decision evidence.
        { claimIds: ['event-model-event', 'timeline-event'], kind: 'accepted' },
      ],
    };
    const invalidU2Input: VocabularyRegistry = {
      claims: [eventModel],
      // @ts-expect-error U2 policy cannot change lexical interpretation here.
      conformanceLevel: 'strict',
    };
    expect([invalidRole.role, invalidScope.scope.kind, invalidDisposition.dispositions?.length, invalidU2Input.claims.length]).toEqual(['node', 'profile', 1, 1]);
  });

  it('reports cross-profile exact spelling, distinct meaning, and role without forcing a rename', () => {
    const result = reviewVocabulary({ claims: [eventModel, timelineEvent, gitBranch, mindmapBranch] });
    expect(result.findings.map(f => f.spelling)).toEqual(['branch', 'event']);
    expect(result.findings[1]).toMatchObject({
      id: 'collision:event-model-event|timeline-event', spelling: 'event',
      conceptRelation: 'undecided', grammaticalOverlap: true,
      withinProfile: false, crossProfile: true, inSlotAmbiguity: false,
      disposition: { kind: 'unreviewed' },
    });
    expect(result.findings[1].claims).toEqual([
      expect.objectContaining({ id: 'event-model-event', effectiveProfiles: ['event-modeling'], status: 'proposed', provenance: [survey] }),
      expect.objectContaining({ id: 'timeline-event', effectiveProfiles: ['timeline'], status: 'deferred', provenance: [survey] }),
    ]);
    expect(result.findings[0]).toMatchObject({ grammaticalOverlap: false, inSlotAmbiguity: false });
  });

  it('keeps exact spelling, with unique words and alternate spellings not colliding', () => {
    const result = reviewVocabulary({ claims: [
      eventModel,
      { ...timelineEvent, id: 'timeline-milestone', spelling: 'milestone', conceptId: 'recorded-fact' },
      { ...gitBranch, id: 'bpmn-gateway', spelling: 'exclusiveGateway', scope: { kind: 'profile', profile: 'bpmn' } },
    ] });
    expect(result.findings).toEqual([]);
  });

  it('expands common and family scopes without manufacturing multiple concepts', () => {
    const group: VocabularyClaim = { ...eventModel, id: 'ordinary-group', conceptId: 'ordinary-grouping', spelling: 'group', scope: { kind: 'common' } };
    const service: VocabularyClaim = { ...eventModel, id: 'family-service', conceptId: 'software-service', spelling: 'service', scope: { kind: 'family', familyId: 'software-deployment', profiles: ['infrastructure', 'system-architecture'] } };
    const architectureService: VocabularyClaim = { ...service, id: 'architecture-service', scope: { kind: 'profile', profile: 'system-architecture' } };
    const result = reviewVocabulary({ claims: [group, service, architectureService] });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ spelling: 'service', conceptRelation: 'same', withinProfile: true, inSlotAmbiguity: false });
    expect(result.findings[0].claims.find(c => c.id === 'family-service')?.effectiveProfiles).toEqual(['infrastructure', 'system-architecture']);
    expect(result.lookup('group', 'element-kind', 'bpmn').map(c => c.id)).toEqual(['ordinary-group']);
  });

  it('does not choose an in-slot ambiguous meaning by insertion order', () => {
    const second = { ...eventModel, id: 'event-model-event-other', conceptId: 'event-stream', definition: 'Stream boundary.' };
    const result = reviewVocabulary({ claims: [second, eventModel] });
    expect(result.findings[0]).toMatchObject({ withinProfile: true, grammaticalOverlap: true, conceptRelation: 'undecided', inSlotAmbiguity: true });
    expect(result.lookup('event', 'element-kind', 'event-modeling').map(c => c.id)).toEqual(['event-model-event', 'event-model-event-other']);
    expect(previewProfileSwitch(result, 'event', 'element-kind', 'event-modeling', 'timeline').identity).toBe('ambiguous');
  });

  it('does not treat an accepted review as a resolver for same-slot ambiguity', () => {
    const second = { ...eventModel, id: 'event-model-event-other', conceptId: 'event-stream', definition: 'Stream boundary.' };
    const result = reviewVocabulary({
      claims: [eventModel, second],
      dispositions: [{
        claimIds: [eventModel.id, second.id], kind: 'accepted',
        rationale: 'Retain both candidates for a later syntax decision.', decisionRef: 'review/event-2',
        interpretations: [
          { claimId: eventModel.id, profile: 'event-modeling', meaning: 'Recorded domain fact' },
          { claimId: second.id, profile: 'event-modeling', meaning: 'Stream boundary' },
        ],
      }],
    });
    expect(result.findings[0]).toMatchObject({ inSlotAmbiguity: true, disposition: { kind: 'accepted' } });
    expect(result.lookup('event', 'element-kind', 'event-modeling')).toHaveLength(2);
    expect(previewProfileSwitch(result, 'event', 'element-kind', 'event-modeling', 'timeline').identity).toBe('ambiguous');
  });

  it('uses only explicitly reviewed relationships for related distinct concepts', () => {
    const registry: VocabularyRegistry = {
      claims: [eventModel, timelineEvent],
      relationships: [{ conceptIds: ['recorded-fact', 'scheduled-occurrence'], rationale: 'Both refer to occurrences, but have different time semantics.', decisionRef: 'review/related-1' }],
    };
    expect(reviewVocabulary(registry).findings[0]).toMatchObject({
      conceptRelation: 'related', conceptRelationship: {
        conceptIds: ['recorded-fact', 'scheduled-occurrence'], decisionRef: 'review/related-1',
      },
    });
  });

  it('keeps an accepted same-spelling, different-meaning reuse visible and previews switch', () => {
    const registry: VocabularyRegistry = {
      claims: [eventModel, timelineEvent],
      dispositions: [{ claimIds: ['timeline-event', 'event-model-event'], kind: 'accepted', rationale: 'The profile header provides context.', decisionRef: 'review/event-1', interpretations: [
        { claimId: 'event-model-event', profile: 'event-modeling', meaning: 'Recorded domain fact' },
        { claimId: 'timeline-event', profile: 'timeline', meaning: 'Scheduled occurrence' },
      ] }],
    };
    const result = reviewVocabulary(registry);
    expect(result.findings[0]).toMatchObject({ spelling: 'event', conceptRelation: 'undecided', disposition: { kind: 'accepted', decisionRef: 'review/event-1' } });
    expect(previewProfileSwitch(result, 'event', 'element-kind', 'event-modeling', 'timeline')).toMatchObject({
      identity: 'changed', source: [expect.objectContaining({ conceptId: 'recorded-fact' })],
      target: [expect.objectContaining({ conceptId: 'scheduled-occurrence' })],
      dispositions: [expect.objectContaining({ kind: 'accepted' })],
    });
    expect(previewProfileSwitch(result, 'event', 'element-kind', 'event-modeling', 'flowchart')).toMatchObject({ identity: 'unavailable', target: [] });
    expect(result.findings[0].claims.map(c => c.spelling)).toEqual(['event', 'event']);
  });

  it('rejects malformed registry data, not valid unresolved collisions', () => {
    expect(() => reviewVocabulary({ claims: [eventModel, eventModel] })).toThrow(/duplicate claim id/i);
    expect(() => reviewVocabulary({ claims: [{ ...eventModel, scope: { kind: 'profile', profile: 'not-a-profile' as never } }] })).toThrow(/unknown profile/i);
    expect(() => reviewVocabulary({ claims: [{ ...eventModel, scope: { kind: 'family', familyId: 'x', profiles: [] } }] })).toThrow(/empty family/i);
    expect(() => reviewVocabulary({ claims: [eventModel, timelineEvent], dispositions: [{ claimIds: ['event-model-event', 'timeline-event'], kind: 'deferred', rationale: '', decisionRef: 'review/1' }] })).toThrow(/rationale/i);
    expect(() => reviewVocabulary({ claims: [eventModel, timelineEvent], dispositions: [{ claimIds: ['event-model-event', 'timeline-event'], kind: 'accepted', rationale: 'Reviewed', decisionRef: 'review/1', interpretations: [] }] })).toThrow(/interpretation/i);
    expect(() => reviewVocabulary({ claims: [eventModel, timelineEvent], dispositions: [{ claimIds: ['event-model-event', 'timeline-event'], kind: 'change-requested', rationale: 'Needs discussion', decisionRef: '' }] })).toThrow(/decision reference/i);
    expect(() => reviewVocabulary({ claims: [{ ...eventModel, status: 'approved' }] })).toThrow(/human-decision/i);
    expect(() => reviewVocabulary({ claims: [{ ...eventModel, canonicalReview: { kind: 'pending', reason: '' } }] })).toThrow(/canonical review/i);
    expect(() => reviewVocabulary({ claims: [{ ...eventModel, canonicalReview: {
      kind: 'checked', authority: 'normative-standard', reference: 'https://example.test/standard',
      edition: '', locator: 'section 1', checkedAt: '2026-10-10', assessment: 'direct', summary: 'Test.',
    } }] })).toThrow(/canonical review/i);
  });

  it('has stable findings under registry permutation and ignores U2 settings', () => {
    const claims = [eventModel, timelineEvent, gitBranch, mindmapBranch];
    const a = reviewVocabulary({ claims });
    const b = reviewVocabulary({ claims: [...claims].reverse() });
    expect(a.findings).toEqual(b.findings);
    expect(a.findings.map(f => f.id)).toEqual(['collision:git-branch|mindmap-branch', 'collision:event-model-event|timeline-event']);
    for (const conformanceLevel of ['none', 'typical', 'strict']) {
      for (const notificationLevel of ['error', 'warning', 'info', 'debug']) {
        // U2 settings are deliberately not accepted by the review API.
        void conformanceLevel;
        void notificationLevel;
        expect(reviewVocabulary({ claims }).findings).toEqual(a.findings);
      }
    }
  });
});
