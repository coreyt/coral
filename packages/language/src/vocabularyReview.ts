/** Candidate-word review only. This module is not a Coral grammar or resolver. */

export const DIAGRAM_PROFILES = [
  'block', 'flowchart', 'uml-sequence', 'uml-use-case', 'uml-class', 'uml-state',
  'bpmn', 'erd', 'system-architecture', 'infrastructure', 'gitgraph',
  'user-journey', 'timeline', 'ishikawa', 'mindmap', 'event-modeling',
] as const;
export type DiagramProfile = typeof DIAGRAM_PROFILES[number];
export type VocabularyRole = 'element-kind' | 'relation-kind' | 'statement' | 'annotation' | 'modifier-property';
export type VocabularyScope =
  | { readonly kind: 'common' }
  | { readonly kind: 'family'; readonly familyId: string; readonly profiles: readonly DiagramProfile[] }
  | { readonly kind: 'profile'; readonly profile: DiagramProfile };
export type EvidenceKind = 'survey' | 'profile-card' | 'standard' | 'example' | 'human-decision';
export type CanonicalReview =
  | { readonly kind: 'pending'; readonly reason: string }
  | {
    readonly kind: 'checked';
    readonly authority: 'normative-standard' | 'profile-definition' | 'no-single-standard';
    readonly reference: string;
    readonly edition: string;
    readonly locator: string;
    readonly checkedAt: string;
    readonly assessment: 'direct' | 'abstract' | 'profile-defined' | 'extension' | 'absent';
    readonly summary: string;
    readonly handlingRef?: string;
  };
export interface VocabularyClaim {
  readonly id: string;
  readonly conceptId: string;
  readonly spelling: string;
  readonly role: VocabularyRole;
  readonly scope: VocabularyScope;
  readonly definition: string;
  readonly provenance: readonly { readonly kind: EvidenceKind; readonly reference: string }[];
  readonly status: 'proposed' | 'approved' | 'deferred';
  /** Evidence checked for this term; absence is valid review data, not approval. */
  readonly canonicalReview?: CanonicalReview;
}
export interface ConceptRelationship {
  readonly conceptIds: readonly [string, string];
  readonly rationale: string;
  readonly decisionRef: string;
}
export interface Interpretation {
  readonly claimId: string;
  readonly profile: DiagramProfile;
  readonly meaning: string;
}
export type ReviewDisposition =
  | { readonly claimIds: readonly [string, string]; readonly kind: 'unreviewed' }
  | { readonly claimIds: readonly [string, string]; readonly kind: 'accepted'; readonly rationale: string; readonly decisionRef: string; readonly interpretations: readonly Interpretation[] }
  | { readonly claimIds: readonly [string, string]; readonly kind: 'change-requested' | 'deferred'; readonly rationale: string; readonly decisionRef: string };
export type FindingDisposition =
  | { readonly kind: 'unreviewed' }
  | { readonly kind: 'accepted'; readonly rationale: string; readonly decisionRef: string; readonly interpretations: readonly Interpretation[] }
  | { readonly kind: 'change-requested' | 'deferred'; readonly rationale: string; readonly decisionRef: string };
export interface VocabularyRegistry {
  readonly claims: readonly VocabularyClaim[];
  readonly relationships?: readonly ConceptRelationship[];
  readonly dispositions?: readonly ReviewDisposition[];
}
export interface EffectiveClaim extends VocabularyClaim {
  readonly effectiveProfiles: readonly DiagramProfile[];
}
export interface CollisionFinding {
  readonly id: string;
  readonly spelling: string;
  readonly claims: readonly [EffectiveClaim, EffectiveClaim];
  readonly conceptRelation: 'same' | 'related' | 'undecided';
  readonly conceptRelationship?: ConceptRelationship;
  readonly grammaticalOverlap: boolean;
  readonly overlapProfiles: readonly DiagramProfile[];
  readonly withinProfile: boolean;
  readonly crossProfile: boolean;
  readonly inSlotAmbiguity: boolean;
  readonly disposition: FindingDisposition;
}
export interface VocabularyReview {
  readonly claims: readonly EffectiveClaim[];
  readonly findings: readonly CollisionFinding[];
  readonly lookup: (spelling: string, role: VocabularyRole, profile: DiagramProfile) => readonly EffectiveClaim[];
}
export interface ProfileSwitchPreview {
  readonly source: readonly EffectiveClaim[];
  readonly target: readonly EffectiveClaim[];
  readonly identity: 'same' | 'changed' | 'unavailable' | 'ambiguous';
  readonly dispositions: readonly FindingDisposition[];
}

const roles = new Set<VocabularyRole>(['element-kind', 'relation-kind', 'statement', 'annotation', 'modifier-property']);
const profiles = new Set<string>(DIAGRAM_PROFILES);
const statuses = new Set(['proposed', 'approved', 'deferred']);
const evidenceKinds = new Set<EvidenceKind>(['survey', 'profile-card', 'standard', 'example', 'human-decision']);
const authorities = new Set(['normative-standard', 'profile-definition', 'no-single-standard']);
const assessments = new Set(['direct', 'abstract', 'profile-defined', 'extension', 'absent']);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const pairKey = (a: string, b: string): string => JSON.stringify([a, b].sort(compare));
const collisionId = (a: string, b: string): string => `collision:${[a, b].sort(compare).map(encodeURIComponent).join('|')}`;

function checkProfile(profile: string): void {
  if (!profiles.has(profile)) throw new Error(`Unknown profile: ${profile}`);
}

function effectiveProfiles(scope: VocabularyScope): readonly DiagramProfile[] {
  switch (scope.kind) {
    case 'common': return [...DIAGRAM_PROFILES];
    case 'profile':
      checkProfile(scope.profile);
      return [scope.profile];
    case 'family': {
      if (!nonempty(scope.familyId) || !Array.isArray(scope.profiles) || !scope.profiles.length) throw new Error('Empty family scope');
      for (const profile of scope.profiles) checkProfile(profile);
      if (new Set(scope.profiles).size !== scope.profiles.length) throw new Error(`Duplicate profile in family ${scope.familyId}`);
      return [...scope.profiles].sort(compare);
    }
    default: throw new Error('Invalid vocabulary scope');
  }
}

function checkClaim(claim: VocabularyClaim): EffectiveClaim {
  if (!nonempty(claim.id) || !nonempty(claim.conceptId) || !nonempty(claim.spelling) || !nonempty(claim.definition)) throw new Error('Claim requires id, conceptId, spelling, and definition');
  if (!roles.has(claim.role)) throw new Error(`Invalid vocabulary role: ${claim.role}`);
  if (!statuses.has(claim.status)) throw new Error(`Invalid claim status: ${claim.status}`);
  if (!claim.scope || !Array.isArray(claim.provenance) || claim.provenance.length === 0) throw new Error('Claim requires scope and provenance');
  for (const evidence of claim.provenance) {
    if (!evidenceKinds.has(evidence.kind) || !nonempty(evidence.reference)) throw new Error(`Invalid provenance for ${claim.id}`);
  }
  if (claim.status === 'approved' && !claim.provenance.some(e => e.kind === 'human-decision')) throw new Error(`Approved claim ${claim.id} requires a human-decision reference`);
  const canonical = claim.canonicalReview;
  if (canonical?.kind === 'pending') {
    if (!nonempty(canonical.reason)) throw new Error(`Pending canonical review for ${claim.id} requires a reason`);
  } else if (canonical?.kind === 'checked') {
    if (!authorities.has(canonical.authority) || !assessments.has(canonical.assessment)
      || !nonempty(canonical.reference) || !nonempty(canonical.edition)
      || !nonempty(canonical.locator) || !nonempty(canonical.checkedAt)
      || !nonempty(canonical.summary)
      || (canonical.handlingRef !== undefined && !nonempty(canonical.handlingRef))) {
      throw new Error(`Invalid canonical review for ${claim.id}`);
    }
  } else if (canonical !== undefined) throw new Error(`Invalid canonical review for ${claim.id}`);
  const scope = claim.scope.kind === 'family'
    ? { ...claim.scope, profiles: effectiveProfiles(claim.scope) } as VocabularyScope
    : claim.scope;
  return {
    ...claim,
    scope,
    provenance: [...claim.provenance].sort((a, b) => compare(`${a.kind}:${a.reference}`, `${b.kind}:${b.reference}`)),
    effectiveProfiles: effectiveProfiles(scope),
  };
}

function validateRelationships(relationships: readonly ConceptRelationship[], conceptIds: Set<string>): Map<string, ConceptRelationship> {
  const related = new Map<string, ConceptRelationship>();
  for (const relationship of relationships) {
    const [a, b] = relationship.conceptIds;
    if (!nonempty(a) || !nonempty(b) || a === b || !conceptIds.has(a) || !conceptIds.has(b)) throw new Error('Invalid concept relationship');
    if (!nonempty(relationship.rationale) || !nonempty(relationship.decisionRef)) throw new Error('Related concepts require rationale and decision reference');
    const key = pairKey(a, b);
    if (related.has(key)) throw new Error(`Duplicate concept relationship: ${key}`);
    related.set(key, { ...relationship, conceptIds: [...relationship.conceptIds].sort(compare) as [string, string] });
  }
  return related;
}

function validateDisposition(disposition: ReviewDisposition, claims: readonly [EffectiveClaim, EffectiveClaim]): FindingDisposition {
  if (disposition.kind === 'unreviewed') return { kind: 'unreviewed' };
  if (!['accepted', 'change-requested', 'deferred'].includes(disposition.kind)) throw new Error('Invalid review disposition');
  if (!nonempty(disposition.rationale)) throw new Error('Review disposition requires rationale');
  if (!nonempty(disposition.decisionRef)) throw new Error('Review disposition requires decision reference');
  if (disposition.kind !== 'accepted') return { kind: disposition.kind, rationale: disposition.rationale, decisionRef: disposition.decisionRef };
  if (!Array.isArray(disposition.interpretations) || disposition.interpretations.length === 0) throw new Error('Accepted reuse requires profile-explicit interpretation');
  const required = new Set(claims.flatMap(c => c.effectiveProfiles.map(profile => `${c.id}|${profile}`)));
  const seen = new Set<string>();
  for (const interpretation of disposition.interpretations) {
    checkProfile(interpretation.profile);
    const key = `${interpretation.claimId}|${interpretation.profile}`;
    if (!required.has(key) || seen.has(key) || !nonempty(interpretation.meaning)) throw new Error('Invalid or duplicate accepted interpretation');
    seen.add(key);
  }
  if (seen.size !== required.size) throw new Error('Accepted reuse requires an interpretation for each claim and effective profile');
  return {
    kind: 'accepted', rationale: disposition.rationale, decisionRef: disposition.decisionRef,
    interpretations: [...disposition.interpretations].sort((a, b) => compare(`${a.claimId}|${a.profile}`, `${b.claimId}|${b.profile}`)),
  };
}

/** Inventory candidate lexical reuse; no finding is a parser/conformance diagnostic. */
export function reviewVocabulary(registry: VocabularyRegistry): VocabularyReview {
  if (!registry || !Array.isArray(registry.claims)) throw new Error('Vocabulary registry requires claims');
  const claims = registry.claims.map(checkClaim).sort((a, b) => compare(a.id, b.id));
  const ids = new Set<string>();
  for (const claim of claims) {
    if (ids.has(claim.id)) throw new Error(`Duplicate claim id: ${claim.id}`);
    ids.add(claim.id);
  }
  const related = validateRelationships(registry.relationships ?? [], new Set(claims.map(c => c.conceptId)));
  const dispositions = new Map<string, ReviewDisposition>();
  for (const disposition of registry.dispositions ?? []) {
    if (!disposition.claimIds || disposition.claimIds.length !== 2 || disposition.claimIds[0] === disposition.claimIds[1]) throw new Error('Review disposition requires two distinct claim IDs');
    const key = pairKey(...disposition.claimIds);
    if (dispositions.has(key)) throw new Error(`Duplicate review disposition: ${key}`);
    dispositions.set(key, disposition);
  }
  const findings: CollisionFinding[] = [];
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i], b = claims[j];
      if (a.spelling !== b.spelling) continue;
      const claimPair: [EffectiveClaim, EffectiveClaim] = [a, b];
      const overlapProfiles = a.effectiveProfiles.filter(p => b.effectiveProfiles.includes(p)).sort(compare);
      const grammaticalOverlap = a.role === b.role;
      const conceptRelation = a.conceptId === b.conceptId ? 'same'
        : related.has(pairKey(a.conceptId, b.conceptId)) ? 'related' : 'undecided';
      const conceptRelationship = related.get(pairKey(a.conceptId, b.conceptId));
      const disposition = dispositions.get(pairKey(a.id, b.id));
      findings.push({
        id: collisionId(a.id, b.id), spelling: a.spelling, claims: claimPair,
        conceptRelation, ...(conceptRelationship ? { conceptRelationship } : {}), grammaticalOverlap, overlapProfiles,
        withinProfile: overlapProfiles.length > 0,
        crossProfile: a.effectiveProfiles.some(pa => b.effectiveProfiles.some(pb => pa !== pb)),
        inSlotAmbiguity: overlapProfiles.length > 0 && grammaticalOverlap && a.conceptId !== b.conceptId,
        disposition: disposition ? validateDisposition(disposition, claimPair) : { kind: 'unreviewed' },
      });
    }
  }
  for (const key of dispositions.keys()) {
    if (!findings.some(f => pairKey(f.claims[0].id, f.claims[1].id) === key)) throw new Error(`Disposition has no collision: ${key}`);
  }
  findings.sort((a, b) => compare(a.spelling, b.spelling) || compare(a.id, b.id));
  return {
    claims,
    findings,
    lookup(spelling, role, profile) {
      checkProfile(profile);
      if (!roles.has(role)) throw new Error(`Invalid vocabulary role: ${role}`);
      return claims.filter(c => c.spelling === spelling && c.role === role && c.effectiveProfiles.includes(profile));
    },
  };
}

/** Read-only comparison; unavailable and ambiguous meanings are never guessed. */
export function previewProfileSwitch(review: VocabularyReview, spelling: string, role: VocabularyRole, sourceProfile: DiagramProfile, targetProfile: DiagramProfile): ProfileSwitchPreview {
  const source = review.lookup(spelling, role, sourceProfile);
  const target = review.lookup(spelling, role, targetProfile);
  const identity = source.length !== 1 ? (source.length === 0 ? 'unavailable' : 'ambiguous')
    : target.length === 0 ? 'unavailable'
      : target.length !== 1 ? 'ambiguous'
        : source[0].conceptId === target[0].conceptId ? 'same' : 'changed';
  const ids = new Set([...source, ...target].map(c => c.id));
  const dispositions = review.findings
    .filter(f => ids.has(f.claims[0].id) && ids.has(f.claims[1].id))
    .map(f => f.disposition);
  return { source, target, identity, dispositions };
}
