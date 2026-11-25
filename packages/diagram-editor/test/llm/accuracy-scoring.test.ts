/**
 * Accuracy Scoring Tests
 *
 * TDD coverage for `scoreResult`/`loadFixture`, the pure scoring core of the
 * LLM accuracy harness (Slice 49, aspect c). See
 * dev/designs/llm-accuracy-harness.md's "Scoring model" section (plus its
 * round 2 and round 3 amendments) for the normative spec these tests check.
 */

import { describe, it, expect } from 'vitest';
import { loadFixture, scoreResult } from './accuracy-scoring';
import type { AccuracyFixtureMeta } from './accuracy-scoring';
import type { GenerateResult } from '../../src/llm/types';

function baseMeta(overrides: Partial<AccuracyFixtureMeta>): AccuracyFixtureMeta {
  return {
    caseId: 'case-under-test',
    caseType: 'generate',
    outputFormat: 'coral',
    provenance: 'hand-authored for accuracy-scoring.test.ts',
    limitations: 'synthetic, exercises one scoring rule at a time',
    ...overrides,
  };
}

function result(overrides: Partial<GenerateResult>): GenerateResult {
  return {
    success: true,
    retries: 0,
    driftDetected: false,
    ...overrides,
  };
}

describe('loadFixture', () => {
  it('produces empty original node/edge state for a fresh-generate fixture (no existingDsl)', () => {
    const meta = baseMeta({ caseType: 'generate' });
    const fixture = loadFixture(meta, 'Generate a login flow');

    expect(fixture.originalNodeIds).toEqual([]);
    expect(fixture.originalNodes).toEqual([]);
    expect(fixture.originalEdges).toEqual([]);
    expect(fixture.existingDsl).toBeUndefined();
  });

  it('parses existingDsl into originalNodeIds/originalNodes/originalEdges', () => {
    const meta = baseMeta({ caseType: 'local-edit', expectedChangedNodeIds: ['b'] });
    const existingDsl = 'service "A" as a\nservice "B" as b\na -> b';
    const fixture = loadFixture(meta, 'Rename B', existingDsl);

    expect(fixture.originalNodeIds.slice().sort()).toEqual(['a', 'b']);
    expect(fixture.originalNodes).toHaveLength(2);
    expect(fixture.originalEdges).toHaveLength(1);
    expect(fixture.originalEdges[0]).toMatchObject({ source: 'a', target: 'b' });
  });
});

describe('scoreResult', () => {
  it('scores a fresh-generate fixture with driftPct null and no unintended changes', () => {
    const meta = baseMeta({ caseType: 'generate' });
    const fixture = loadFixture(meta, 'Generate a login flow');
    const candidate = result({ dsl: 'service "API" as api\nservice "DB" as db\napi -> db' });

    const score = scoreResult(fixture, candidate);

    expect(score.caseId).toBe('case-under-test');
    expect(score.valid).toBe(true);
    expect(score.driftPct).toBeNull();
    expect(score.unintendedChangeCount).toBe(0);
    expect(score.unintendedChanges).toEqual([]);
    expect(score.lintErrorCount).toBe(0);
    expect(score.lintWarningCount).toBe(0);
    expect(score.contentCheckPassed).toBeNull();
    expect(score.requiresManualReview).toBe(false);
    expect(score.retries).toBe(0);
    expect(score.succeeded).toBe(true);
  });

  it('scores a local-edit fixture where the intended change is the only change', () => {
    const meta = baseMeta({
      caseType: 'local-edit',
      expectedChangedNodeIds: ['b'],
    });
    const existingDsl = 'service "A" as a\nservice "B" as b\na -> b';
    const fixture = loadFixture(meta, 'Rename B to Bee', existingDsl);
    // Only 'b' (the declared expected-change target) has its label edited;
    // 'a' and the a->b edge are copied through unchanged.
    const candidate = result({ dsl: 'service "A" as a\nservice "Bee" as b\na -> b' });

    const score = scoreResult(fixture, candidate);

    expect(score.driftPct).toBe(0);
    expect(score.unintendedChangeCount).toBe(0);
    expect(score.unintendedChanges).toEqual([]);
  });

  it('detects a silently altered label on a node outside expectedChangedNodeIds', () => {
    const meta = baseMeta({
      caseType: 'local-edit',
      expectedChangedNodeIds: ['b'],
    });
    const existingDsl = 'service "A" as a\nservice "B" as b\na -> b';
    const fixture = loadFixture(meta, 'Rename B to Bee', existingDsl);
    // 'b' changes as requested, but 'a' (not in expectedChangedNodeIds) is
    // silently relabeled too -- this must be flagged.
    const candidate = result({ dsl: 'service "Alpha" as a\nservice "Bee" as b\na -> b' });

    const score = scoreResult(fixture, candidate);

    expect(score.unintendedChangeCount).toBe(1);
    expect(score.unintendedChanges).toEqual([
      { kind: 'node-field', id: 'a', field: 'label', before: 'A', after: 'Alpha' },
    ]);
  });

  it('reports a redirected edge between two untouched nodes as removed+added, not silently missed', () => {
    const meta = baseMeta({
      caseType: 'restructure',
      expectedChangedNodeIds: [],
    });
    const existingDsl = 'service "A" as a\nservice "B" as b\nservice "C" as c\na -> b';
    const fixture = loadFixture(meta, 'No edge changes requested', existingDsl);
    // a->b silently redirected to a->c; neither a, b, nor c is declared as an
    // expected-change target, so both halves of the redirect must surface.
    const candidate = result({ dsl: 'service "A" as a\nservice "B" as b\nservice "C" as c\na -> c' });

    const score = scoreResult(fixture, candidate);

    expect(score.unintendedChangeCount).toBe(2);
    expect(score.unintendedChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'edge-removed', id: 'a->b' }),
        expect.objectContaining({ kind: 'edge-added', id: 'a->c' }),
      ]),
    );
  });

  it('detects a relabeled edge among parallel edges between the same node pair, not just a collision', () => {
    // Regression test for a bug independent code review found by direct
    // execution: keying a single-edge Map by (source, target) alone silently
    // dropped all but the last parallel edge in a group. Coral legally allows
    // multiple edges between the same two nodes.
    const meta = baseMeta({ caseType: 'restructure', expectedChangedNodeIds: [] });
    const existingDsl =
      'service "A" as a\nservice "B" as b\na -> b [label: "reads"]\na -> b [label: "writes"]';
    const fixture = loadFixture(meta, 'No edge changes requested', existingDsl);
    // "writes" silently relabeled to "deletes"; "reads" is untouched.
    const candidate = result({
      dsl: 'service "A" as a\nservice "B" as b\na -> b [label: "reads"]\na -> b [label: "deletes"]',
    });

    const score = scoreResult(fixture, candidate);

    expect(score.unintendedChangeCount).toBe(1);
    expect(score.unintendedChanges).toEqual([
      expect.objectContaining({ kind: 'edge-label', id: 'a->b', before: 'writes', after: 'deletes' }),
    ]);
  });

  it('requires explicit edge permissions for an intended redirect', () => {
    const meta = baseMeta({
      caseType: 'restructure',
      // Both the old (b) and new (c) endpoint are declared touched by the
      // requested edit, so the redirect between them is fully expected.
      expectedChangedNodeIds: ['b', 'c'],
      expectedChangedEdgeIds: ['a_to_b'],
      expectedNewEdges: [{ source: 'a', target: 'c' }],
    });
    const existingDsl = 'service "A" as a\nservice "B" as b\nservice "C" as c\na -> b';
    const fixture = loadFixture(meta, 'Point A at C instead of B', existingDsl);
    const candidate = result({ dsl: 'service "A" as a\nservice "B" as b\nservice "C" as c\na -> c' });

    const score = scoreResult(fixture, candidate);

    expect(score.unintendedChangeCount).toBe(0);
    expect(score.unintendedChanges).toEqual([]);
  });

  it('does not grant incident-edge permissions to a renamed node', () => {
    const fixture = loadFixture(baseMeta({ expectedChangedNodeIds: ['b'] }), 'Rename B',
      'service "A" as a\nservice "B" as b\na -> b [label: "reads"]');
    const score = scoreResult(fixture, result({ dsl:
      'service "A" as a\nservice "Bee" as b\na -> b [label: "deletes"]' }));
    expect(score.unintendedChanges).toEqual([
      expect.objectContaining({ kind: 'edge-label', before: 'reads', after: 'deletes' }),
    ]);
  });

  it('allows only the declared number of added parallel edges', () => {
    const fixture = loadFixture(baseMeta({ expectedNewEdges: [{ source: 'a', target: 'b' }] }), 'Add one edge',
      'service "A" as a\nservice "B" as b');
    const score = scoreResult(fixture, result({ dsl:
      'service "A" as a\nservice "B" as b\na -> b\na -> b' }));
    expect(score.unintendedChanges).toEqual([expect.objectContaining({ kind: 'edge-added' })]);
  });

  it('allows only the declared number of removed parallel edges', () => {
    const fixture = loadFixture(baseMeta({ expectedRemovedEdges: [{ source: 'a', target: 'b' }] }), 'Remove one edge',
      'service "A" as a\nservice "B" as b\na -> b [label: "one"]\na -> b [label: "two"]');
    const score = scoreResult(fixture, result({ dsl: 'service "A" as a\nservice "B" as b' }));
    expect(score.unintendedChanges).toEqual([expect.objectContaining({ kind: 'edge-removed' })]);
  });

  it('a label-only permission does not exempt a type change on the same node', () => {
    const fixture = loadFixture(baseMeta({ expectedChangedNodeFields: { b: ['label'] } }), 'Rename B',
      'service "B" as b');
    const score = scoreResult(fixture, result({ dsl: 'database "Bee" as b' }));
    expect(score.unintendedChanges).toEqual([expect.objectContaining({ kind: 'node-field', field: 'type' })]);
  });

  it('an explicit parallel-edge permission does not exempt its sibling', () => {
    const fixture = loadFixture(baseMeta({}), 'Change one edge',
      'service "A" as a\nservice "B" as b\na -> b [label: "reads"]\na -> b [label: "writes"]');
    fixture.meta.expectedChangedEdgeIds = [fixture.originalEdges[0].id];
    const score = scoreResult(fixture, result({ dsl:
      'service "A" as a\nservice "B" as b\na -> b [label: "reads"]\na -> b [label: "deletes"]' }));
    expect(score.unintendedChanges).toEqual([expect.objectContaining({ kind: 'edge-label', before: 'writes' })]);
  });

  it('exempts a declared expectedNewEdges pair without exempting the rest of that node\'s edges', () => {
    // Regression test for a gap independent code review found by direct
    // execution: an "add-subgraph" fixture that legitimately adds one new
    // edge from an existing node (e.g. "gateway -> cache") had no way to
    // declare that single new edge as expected without putting "gateway" in
    // expectedChangedNodeIds -- which, because isExpectedPair matches by
    // node membership, silently exempted every OTHER edge touching that
    // node too, including one the fixture's own prompt explicitly said to
    // keep unchanged (a dropped "gateway -> products" fallback edge went
    // completely undetected).
    const meta = baseMeta({
      caseType: 'add-subgraph',
      expectedNewEdges: [{ source: 'gateway', target: 'cache' }],
    });
    const existingDsl =
      'service "Gateway" as gateway\nservice "Products" as products\ngateway -> products [label: "fetch"]';
    const fixture = loadFixture(meta, 'Add a cache in front of Products, keep the direct fallback', existingDsl);
    // The model adds the requested new edge correctly, but silently drops
    // the existing fallback edge the prompt explicitly said to keep.
    const candidate = result({
      dsl: 'service "Gateway" as gateway\nservice "Products" as products\nservice "Cache" as cache\ngateway -> cache [label: "check"]',
    });

    const score = scoreResult(fixture, candidate);

    expect(score.unintendedChangeCount).toBe(1);
    expect(score.unintendedChanges).toEqual([
      expect.objectContaining({ kind: 'edge-removed', id: 'gateway->products' }),
    ]);
  });

  it('passes an adversarial-label fixture whose expected substring survives verbatim', () => {
    const meta = baseMeta({
      caseType: 'adversarial-label',
      expectedSubstrings: ['Robert\'); DROP TABLE Students;--'],
    });
    const fixture = loadFixture(meta, 'Create a user node with this exact name');
    const candidate = result({
      dsl: 'service "Robert\'); DROP TABLE Students;--" as user',
    });

    const score = scoreResult(fixture, candidate);

    expect(score.contentCheckPassed).toBe(true);
  });

  it('fails an adversarial-label fixture whose expected substring was altered or dropped', () => {
    const meta = baseMeta({
      caseType: 'adversarial-label',
      expectedSubstrings: ['Robert\'); DROP TABLE Students;--'],
    });
    const fixture = loadFixture(meta, 'Create a user node with this exact name');
    const candidate = result({ dsl: 'service "Robert" as user' });

    const score = scoreResult(fixture, candidate);

    expect(score.contentCheckPassed).toBe(false);
  });

  it('sets requiresManualReview true for ambiguous and injected-mistake case types', () => {
    for (const caseType of ['ambiguous', 'injected-mistake'] as const) {
      const meta = baseMeta({ caseType });
      const fixture = loadFixture(meta, 'An underspecified prompt');
      const candidate = result({ dsl: 'service "A" as a' });

      expect(scoreResult(fixture, candidate).requiresManualReview).toBe(true);
    }
  });

  it('honors an explicit manual-review flag for otherwise mechanical case types', () => {
    const fixture = loadFixture(baseMeta({ caseType: 'spatial', requiresManualReview: true }), 'Move it');
    expect(scoreResult(fixture, result()).requiresManualReview).toBe(true);
  });

  it('sets requiresManualReview false for every other case type', () => {
    for (const caseType of ['generate', 'local-edit', 'add-subgraph', 'restructure', 'spatial', 'notation', 'adversarial-label'] as const) {
      const meta = baseMeta({ caseType });
      const fixture = loadFixture(meta, 'A well-specified prompt');
      const candidate = result({ dsl: 'service "A" as a' });

      expect(scoreResult(fixture, candidate).requiresManualReview).toBe(false);
    }
  });

  it('reports lintErrorCount/lintWarningCount as 0 when the fixture sets no notationId', () => {
    const meta = baseMeta({ caseType: 'generate' });
    const fixture = loadFixture(meta, 'Generate something');
    // 'server' is not a valid architecture/aiml/etc type, but with no
    // notationId set, no notation to lint against.
    const candidate = result({ dsl: 'service "A" as a' });

    const score = scoreResult(fixture, candidate);

    expect(score.lintErrorCount).toBe(0);
    expect(score.lintWarningCount).toBe(0);
  });

  it('reports a lint error for a node type invalid under the fixture notationId', () => {
    const meta = baseMeta({ caseType: 'notation', notationId: 'aiml' });
    const fixture = loadFixture(meta, 'Generate an AI/ML pipeline');
    // 'decision' is a flowchart type, not part of the aiml valid-type set
    // (base types like 'group'/'service' are valid under every notation).
    const candidate = result({ dsl: 'decision "Something" as thing' });

    const score = scoreResult(fixture, candidate);

    expect(score.lintErrorCount).toBeGreaterThan(0);
  });

  it('reports valid: false when the candidate DSL fails to parse into any nodes', () => {
    const meta = baseMeta({ caseType: 'generate' });
    const fixture = loadFixture(meta, 'Generate something');
    const candidate = result({ dsl: '', success: false });

    const score = scoreResult(fixture, candidate);

    expect(score.valid).toBe(false);
  });

  it('copies retries and succeeded straight from the GenerateResult', () => {
    const meta = baseMeta({ caseType: 'generate' });
    const fixture = loadFixture(meta, 'Generate something');
    const candidate = result({ dsl: 'service "A" as a', retries: 2, success: true });

    const score = scoreResult(fixture, candidate);

    expect(score.retries).toBe(2);
    expect(score.succeeded).toBe(true);
  });
});
