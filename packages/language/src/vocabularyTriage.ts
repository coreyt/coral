/** Deterministic suggestions for human vocabulary review, never Coral diagnostics. */

import type { CollisionFinding, VocabularyReview } from './vocabularyReview.js';

export type TriageRule = 'C0' | 'C1' | 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6';
export interface TriageProposal {
  readonly rule: TriageRule;
  readonly priority: number;
  readonly kind: 'accepted' | 'change-requested' | 'deferred';
  readonly conditional: true;
  readonly question: string;
}
export interface TriageItem {
  readonly finding: CollisionFinding;
  readonly proposal: TriageProposal;
}
export interface VocabularyTriage {
  readonly pending: readonly TriageItem[];
  readonly recorded: readonly CollisionFinding[];
}

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

function proposal(finding: CollisionFinding): TriageProposal {
  const missingCanonical = finding.claims.filter(claim => !claim.canonicalReview || claim.canonicalReview.kind === 'pending');
  if (missingCanonical.length > 0) {
    return {
      rule: 'C0', priority: -1, kind: 'deferred', conditional: true,
      question: `Check canonical or profile-defining documentation for ${missingCanonical.map(claim => claim.id).join(', ')} before proposing a disposition.`,
    };
  }
  const unresolvedCanonical = finding.claims.filter(claim => {
    const review = claim.canonicalReview;
    return review?.kind === 'checked' && !['direct', 'profile-defined'].includes(review.assessment) && !review.handlingRef;
  });
  if (unresolvedCanonical.length > 0) {
    return {
      rule: 'C1', priority: 0, kind: 'deferred', conditional: true,
      question: `Review the canonical mismatch or abstraction for ${unresolvedCanonical.map(claim => claim.id).join(', ')} and record its handling before proposing a disposition.`,
    };
  }
  if (finding.withinProfile && finding.grammaticalOverlap) {
    if (finding.claims[0].conceptId !== finding.claims[1].conceptId) {
      return {
        rule: 'H1', priority: 1, kind: 'change-requested', conditional: true,
        question: 'How will an author or parser distinguish these meanings in the same profile and slot?',
      };
    }
    return {
      rule: 'H2', priority: 2, kind: 'change-requested', conditional: true,
      question: 'Should these entries be consolidated or their scopes narrowed, without necessarily changing the word?',
    };
  }
  if (finding.withinProfile) {
    return {
      rule: 'H3', priority: 3, kind: 'deferred', conditional: true,
      question: 'Can the approved grammar distinguish these roles, or is an explicit construct needed?',
    };
  }
  if (finding.claims[0].role === finding.claims[1].role && finding.claims[0].conceptId !== finding.claims[1].conceptId) {
    return {
      rule: 'H4', priority: 4, kind: 'accepted', conditional: true,
      question: 'Does the diagram type give enough context to keep both meanings, including on profile switch?',
    };
  }
  if (finding.claims[0].role !== finding.claims[1].role) {
    return {
      rule: 'H5', priority: 5, kind: 'accepted', conditional: true,
      question: 'Is each use clear in its diagram type and syntactic position?',
    };
  }
  return {
    rule: 'H6', priority: 6, kind: 'accepted', conditional: true,
    question: 'Is the concept truly stable across these profiles?',
  };
}

/** Keep human decisions intact; only unreviewed findings receive suggestions. */
export function triageVocabulary(review: VocabularyReview): VocabularyTriage {
  const pending: TriageItem[] = [];
  const recorded: CollisionFinding[] = [];
  const claimIdsBySpelling = new Map<string, Set<string>>();
  for (const finding of review.findings) {
    const claimIds = claimIdsBySpelling.get(finding.spelling) ?? new Set<string>();
    for (const claim of finding.claims) claimIds.add(claim.id);
    claimIdsBySpelling.set(finding.spelling, claimIds);
    if (finding.disposition.kind !== 'unreviewed') recorded.push(finding);
    else pending.push({ finding, proposal: proposal(finding) });
  }
  pending.sort((a, b) => a.proposal.priority - b.proposal.priority
    || (claimIdsBySpelling.get(b.finding.spelling)?.size ?? 0) - (claimIdsBySpelling.get(a.finding.spelling)?.size ?? 0)
    || compare(a.finding.spelling, b.finding.spelling)
    || compare(a.finding.id, b.finding.id));
  recorded.sort((a, b) => compare(a.spelling, b.spelling) || compare(a.id, b.id));
  return { pending, recorded };
}
