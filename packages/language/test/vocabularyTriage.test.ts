import { describe, expect, it } from 'vitest';
import { previewProfileSwitch, reviewVocabulary, type VocabularyClaim } from '../src/vocabularyReview.js';
import { triageVocabulary } from '../src/vocabularyTriage.js';
import { reviewedSurveyRegistry, surveyCandidates } from './fixtures/vocabularySurveyCandidates.js';

const provenance = [{ kind: 'survey' as const, reference: 'notation-vocabulary-scope-survey.md' }];
const claim = (
  id: string, spelling: string, conceptId: string,
  role: VocabularyClaim['role'], profile: 'flowchart' | 'bpmn' | 'mindmap' | 'gitgraph' | 'timeline',
): VocabularyClaim => ({
  id, spelling, conceptId, role, scope: { kind: 'profile', profile },
  definition: `${id} candidate meaning`, provenance, status: 'proposed',
  canonicalReview: {
    kind: 'checked', authority: 'profile-definition', reference: 'synthetic-test-profile',
    edition: 'test', locator: id, checkedAt: '2026-10-10', assessment: 'direct',
    summary: 'Synthetic test evidence only.',
  },
});

describe('candidate vocabulary triage heuristics', () => {
  it('defers disposition when canonical evidence is absent or unresolved', () => {
    const direct = claim('a', 'event', 'one', 'element-kind', 'bpmn');
    const missing: VocabularyClaim = { ...claim('b', 'event', 'two', 'element-kind', 'timeline'), canonicalReview: undefined };
    const absent = triageVocabulary(reviewVocabulary({ claims: [direct, missing] })).pending[0];
    expect(absent.proposal).toMatchObject({ rule: 'C0', kind: 'deferred' });
    expect(absent.proposal.question).toMatch(/canonical|profile-defining/i);

    const abstractReview = {
      kind: 'checked', authority: 'normative-standard', reference: 'https://example.test/standard',
      edition: 'test', locator: 'section 1', checkedAt: '2026-10-10',
      assessment: 'abstract', summary: 'Generic concept only.',
    } as const;
    const abstract: VocabularyClaim = { ...missing, canonicalReview: abstractReview };
    expect(triageVocabulary(reviewVocabulary({ claims: [direct, abstract] })).pending[0].proposal).toMatchObject({ rule: 'C1', kind: 'deferred' });
    const handled: VocabularyClaim = { ...abstract, canonicalReview: { ...abstractReview, handlingRef: 'review/abstract-1' } };
    expect(triageVocabulary(reviewVocabulary({ claims: [direct, handled] })).pending[0].proposal).toMatchObject({ rule: 'H4', kind: 'accepted' });
  });

  it('sorts representative survey candidates without turning them into a glossary', () => {
    const review = reviewVocabulary({ claims: surveyCandidates });
    const queue = triageVocabulary(review);
    expect(surveyCandidates).toHaveLength(24);
    expect(queue.pending).toHaveLength(10);
    expect(queue.pending.map(item => item.proposal.rule)).toEqual([...Array(9).fill('C0'), 'H4']);
    expect(queue.pending.map(item => item.finding.spelling)).toEqual([
      'event', 'event', 'actor', 'attribute', 'branch', 'database', 'phase', 'service', 'task', 'event',
    ]);
    expect(queue.recorded).toEqual([]);
    for (const control of ['group', 'note', 'exclusiveGateway', 'readModel', 'trustBoundary', 'entity', 'milestone']) {
      expect(review.findings.some(finding => finding.spelling === control)).toBe(false);
    }
    expect(review.claims.filter(item => item.status === 'approved').map(item => item.id)).toEqual(['bpmn-event']);
    expect(queue.pending.filter(item => item.finding.spelling === 'event')).toHaveLength(3);
  });

  it('records author-approved event reuse without clearing nine source gates', () => {
    const review = reviewVocabulary(reviewedSurveyRegistry);
    const queue = triageVocabulary(review);
    expect(queue.recorded).toHaveLength(1);
    expect(queue.recorded[0].claims.map(item => item.id)).toEqual(['bpmn-event', 'event-modeling-event']);
    expect(queue.recorded[0].disposition.kind).toBe('accepted');
    expect(queue.pending).toHaveLength(9);
    expect(queue.pending.every(item => item.proposal.rule === 'C0')).toBe(true);
    expect(previewProfileSwitch(review, 'event', 'element-kind', 'bpmn', 'event-modeling').identity).toBe('changed');
  });

  it('ranks within-profile ambiguity above reuse and does not demand a rename', () => {
    const review = reviewVocabulary({ claims: [
      claim('a', 'event', 'one', 'element-kind', 'bpmn'),
      claim('b', 'event', 'two', 'element-kind', 'bpmn'),
      claim('c', 'branch', 'git-branch', 'element-kind', 'gitgraph'),
      claim('d', 'branch', 'topic-branch', 'element-kind', 'mindmap'),
    ] });
    const result = triageVocabulary(review);
    expect(result.pending.map(item => [item.finding.spelling, item.proposal.rule, item.proposal.kind])).toEqual([
      ['event', 'H1', 'change-requested'],
      ['branch', 'H4', 'accepted'],
    ]);
    expect(result.pending[0].proposal.question).toMatch(/distinguish/i);
    expect(result.pending[0].proposal).not.toHaveProperty('replacementSpelling');
    expect(result.pending[1].proposal.conditional).toBe(true);
  });

  it('distinguishes duplicate registration, grammar-role overlap, and three scoped reuse patterns', () => {
    const review = reviewVocabulary({ claims: [
      claim('a', 'same', 'one', 'element-kind', 'bpmn'),
      claim('b', 'same', 'one', 'element-kind', 'bpmn'),
      claim('c', 'mixed', 'one', 'element-kind', 'bpmn'),
      claim('d', 'mixed', 'two', 'statement', 'bpmn'),
      claim('e', 'role', 'one', 'element-kind', 'bpmn'),
      claim('f', 'role', 'two', 'relation-kind', 'gitgraph'),
      claim('g', 'shared', 'one', 'element-kind', 'bpmn'),
      claim('h', 'shared', 'one', 'element-kind', 'timeline'),
    ] });
    expect(triageVocabulary(review).pending.map(item => item.proposal.rule)).toEqual(['H2', 'H3', 'H5', 'H6']);
    expect(triageVocabulary(review).pending.map(item => item.proposal.kind)).toEqual([
      'change-requested', 'deferred', 'accepted', 'accepted',
    ]);
  });

  it('keeps recorded human decisions separate from suggestions and sorts stably', () => {
    const a = claim('a', 'event', 'one', 'element-kind', 'bpmn');
    const b = claim('b', 'event', 'two', 'element-kind', 'timeline');
    const c = claim('c', 'branch', 'three', 'element-kind', 'gitgraph');
    const d = claim('d', 'branch', 'four', 'element-kind', 'mindmap');
    const registry = {
      claims: [a, b, c, d],
      dispositions: [{
        claimIds: ['a', 'b'] as [string, string], kind: 'deferred' as const,
        rationale: 'Need an author trial.', decisionRef: 'review/1',
      }],
    };
    const first = triageVocabulary(reviewVocabulary(registry));
    const second = triageVocabulary(reviewVocabulary({ ...registry, claims: [...registry.claims].reverse() }));
    expect(first).toEqual(second);
    expect(first.pending.map(item => item.finding.spelling)).toEqual(['branch']);
    expect(first.recorded.map(finding => [finding.spelling, finding.disposition.kind])).toEqual([['event', 'deferred']]);
  });
});
