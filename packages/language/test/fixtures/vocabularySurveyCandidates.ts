import type { DiagramProfile, VocabularyClaim, VocabularyRegistry, VocabularyRole } from '../../src/vocabularyReview.js';

/** Exploratory survey candidates, not an approved glossary or parser allowlist. */
const survey = { kind: 'survey' as const, reference: 'dev/releases/0.2.8/notation-vocabulary-scope-survey.md' };

function candidate(
  id: string, spelling: string, conceptId: string, role: VocabularyRole,
  profile: DiagramProfile, definition: string,
): VocabularyClaim {
  return {
    id, spelling, conceptId, role, scope: { kind: 'profile', profile },
    definition, provenance: [survey], status: 'proposed',
  };
}

export const surveyCandidates: readonly VocabularyClaim[] = [
  {
    ...candidate('event-modeling-event', 'event', 'recorded-domain-fact', 'element-kind', 'event-modeling', 'A stored state-changing domain fact.'),
    canonicalReview: {
      kind: 'checked', authority: 'profile-definition',
      reference: 'https://eventmodeling.org/posts/what-is-event-modeling/',
      edition: '2019-06-23 article', locator: 'Events; Workshop Format step 1',
      checkedAt: '2026-10-10', assessment: 'direct',
      summary: 'The method places stored facts on a timeline and restricts modeled events to state-changing events.',
    },
  },
  candidate('timeline-event', 'event', 'scheduled-occurrence', 'element-kind', 'timeline', 'An occurrence located in project time.'),
  {
    ...candidate('bpmn-event', 'event', 'bpmn-event-unspecified-kind', 'element-kind', 'bpmn', 'A BPMN event whose concrete kind is not yet specified.'),
    provenance: [survey, { kind: 'human-decision', reference: 'dev/releases/0.2.8/bpmn-event-vocabulary-rule-card.md#author-decision-and-coral-interpretation' }],
    status: 'approved',
    canonicalReview: {
      kind: 'checked', authority: 'normative-standard',
      reference: 'https://www.omg.org/spec/BPMN/2.0.2/PDF', edition: '2.0.2',
      locator: '§10.5, Table 10.110', checkedAt: '2026-10-10',
      assessment: 'abstract', summary: 'BPMN Event is a general abstract model type; concrete event kind is required for strict checks.',
      handlingRef: 'dev/releases/0.2.8/bpmn-event-vocabulary-rule-card.md',
    },
  },
  candidate('gitgraph-branch', 'branch', 'git-branch-object', 'element-kind', 'gitgraph', 'A named line of Git history.'),
  candidate('mindmap-branch', 'branch', 'topic-parent-child-relation', 'relation-kind', 'mindmap', 'A topic hierarchy relation.'),
  candidate('bpmn-task', 'task', 'bpmn-unit-of-work', 'element-kind', 'bpmn', 'A BPMN activity unit.'),
  candidate('journey-task', 'task', 'journey-user-action', 'element-kind', 'user-journey', 'An action in a user journey.'),
  candidate('journey-phase', 'phase', 'journey-stage', 'element-kind', 'user-journey', 'A stage of a user journey.'),
  candidate('timeline-phase', 'phase', 'project-time-span', 'element-kind', 'timeline', 'A project time span or phase.'),
  candidate('uml-class-attribute', 'attribute', 'class-structural-feature', 'element-kind', 'uml-class', 'A UML class structural feature.'),
  candidate('erd-attribute', 'attribute', 'entity-property', 'element-kind', 'erd', 'A property of an ER entity.'),
  candidate('architecture-service', 'service', 'logical-software-service', 'element-kind', 'system-architecture', 'A logical software service.'),
  candidate('infrastructure-service', 'service', 'deployed-service', 'element-kind', 'infrastructure', 'A deployed service resource.'),
  candidate('architecture-database', 'database', 'logical-database', 'element-kind', 'system-architecture', 'A logical database system.'),
  candidate('infrastructure-database', 'database', 'deployed-database', 'element-kind', 'infrastructure', 'A deployed database resource.'),
  candidate('uml-sequence-actor', 'actor', 'uml-external-role', 'element-kind', 'uml-sequence', 'An external role in a UML interaction.'),
  candidate('uml-use-case-actor', 'actor', 'uml-external-role', 'element-kind', 'uml-use-case', 'An external role in a UML use case.'),
  { id: 'common-group', spelling: 'group', conceptId: 'ordinary-grouping', role: 'element-kind', scope: { kind: 'common' }, definition: 'Ordinary Coral grouping or membership, not a BPMN pool or trust boundary.', provenance: [survey], status: 'proposed' },
  { id: 'common-note', spelling: 'note', conceptId: 'annotation-note', role: 'annotation', scope: { kind: 'common' }, definition: 'An annotation, not a domain element kind.', provenance: [survey], status: 'proposed' },
  candidate('bpmn-exclusive-gateway', 'exclusiveGateway', 'bpmn-exclusive-gateway', 'element-kind', 'bpmn', 'A BPMN exclusive gateway.'),
  candidate('event-modeling-read-model', 'readModel', 'event-modeling-read-model', 'element-kind', 'event-modeling', 'A query projection in event modeling.'),
  candidate('infrastructure-trust-boundary', 'trustBoundary', 'trust-boundary', 'element-kind', 'infrastructure', 'A security/trust boundary.'),
  candidate('erd-entity', 'entity', 'erd-entity', 'element-kind', 'erd', 'An ER modeled entity.'),
  candidate('timeline-milestone', 'milestone', 'project-milestone', 'element-kind', 'timeline', 'A project time point.'),
];

/** Author-approved collision reuse; source-gated findings remain unreviewed. */
export const reviewedSurveyRegistry: VocabularyRegistry = {
  claims: surveyCandidates,
  dispositions: [{
    claimIds: ['bpmn-event', 'event-modeling-event'],
    kind: 'accepted',
    rationale: 'Keep the same spelling in distinct diagram profiles, with no implicit conversion when a profile changes.',
    decisionRef: 'dev/releases/0.2.8/vocabulary-collision-initial-triage.md#author-readback-2026-10-10',
    interpretations: [
      { claimId: 'bpmn-event', profile: 'bpmn', meaning: 'A BPMN event with concrete kind unspecified; allowed in none and typical, but insufficient for strict conformance.' },
      { claimId: 'event-modeling-event', profile: 'event-modeling', meaning: 'A stored state-changing domain fact in event modeling.' },
    ],
  }],
};
