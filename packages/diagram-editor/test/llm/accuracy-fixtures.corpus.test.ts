/**
 * Validates the real 18-fixture hand-authored accuracy corpus (Slice 49,
 * R-049.2 AC-2, Phase 3): every fixture loads via the real
 * `loadAllFixtures`/`loadFixtureFromDirectory`, every `existing.txt` parses
 * as valid Coral DSL with zero errors, every `expectedChangedNodeIds` entry
 * references a real node id, every notation fixture's `notationId` resolves
 * to a real, non-empty valid-type set (the exact class of bug an earlier
 * draft's `data-engineering` notation id typo was caught by, in the design
 * review before this corpus was authored), and every `layout.json` node id
 * exists in its fixture's `existing.txt`.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { loadAllFixtures } from './accuracy-harness';
import { parseGraphFixture } from './graph-interchange-fixture';
import { HEADER_MANIFEST_028 } from '@coral-viz/language';
import { getValidTypesForNotation } from '../../src/llm/notationRef';

describe('the real Slice 49 accuracy fixture corpus', () => {
  it('loads all 18 hand-authored fixtures cleanly and validates their internal consistency', () => {
    const accuracyDir = join(__dirname, 'fixtures/accuracy');
    const corpusDir = join(__dirname, 'fixtures/corpus');
    const fixtures = loadAllFixtures(accuracyDir, corpusDir);
    const handAuthored = fixtures.filter((f) => !f.meta.caseId.includes('-generate-d'));

    expect(handAuthored).toHaveLength(18);

    for (const f of handAuthored) {
      if (f.existingDsl) {
        const parsed = parseGraphFixture(f.existingDsl);
        expect(parsed.errors, `${f.meta.caseId}: existing.txt must parse with zero errors`).toEqual([]);

        for (const id of f.meta.expectedChangedNodeIds ?? []) {
          expect(f.originalNodeIds, `${f.meta.caseId}: expectedChangedNodeIds references unknown id "${id}"`).toContain(id);
        }
      }

      if (f.meta.notationId) {
        const validTypes = getValidTypesForNotation(f.meta.notationId);
        if (f.meta.notationId === 'erd') {
          // Retain this historical GraphIR fixture without advertising disabled Chen source.
          expect(HEADER_MANIFEST_028['0.2.8'].erd.enabled).toBe(false);
          expect(validTypes.size).toBe(0);
        } else {
          expect(validTypes.size, `${f.meta.caseId}: notationId "${f.meta.notationId}" must resolve to a non-empty valid-type set`).toBeGreaterThan(0);
        }
      }

      if (f.layout && f.existingDsl) {
        const nodeIds = new Set(parseGraphFixture(f.existingDsl).nodes.map((n) => n.id));
        for (const n of f.layout.nodes) {
          expect(nodeIds.has(n.id), `${f.meta.caseId}: layout.json references unknown node id "${n.id}"`).toBe(true);
        }
      }
    }
  });

  it('covers the five required case types from ai-editing-exploration.md plus ambiguous/spatial/notation/adversarial-label', () => {
    const accuracyDir = join(__dirname, 'fixtures/accuracy');
    const corpusDir = join(__dirname, 'fixtures/corpus');
    const fixtures = loadAllFixtures(accuracyDir, corpusDir).filter((f) => !f.meta.caseId.includes('-generate-d'));
    const caseTypes = new Set(fixtures.map((f) => f.meta.caseType));

    for (const required of [
      'generate', 'local-edit', 'add-subgraph', 'restructure', 'injected-mistake',
      'ambiguous', 'spatial', 'notation', 'adversarial-label',
    ]) {
      expect(caseTypes.has(required), `missing a fixture with caseType "${required}"`).toBe(true);
    }
  });

  it('covers all eight bundled notation libraries', () => {
    const accuracyDir = join(__dirname, 'fixtures/accuracy');
    const corpusDir = join(__dirname, 'fixtures/corpus');
    const fixtures = loadAllFixtures(accuracyDir, corpusDir);
    const notationIds = new Set(
      fixtures.filter((f) => f.meta.caseType === 'notation').map((f) => f.meta.notationId),
    );

    expect([...notationIds].sort()).toEqual(
      ['aiml', 'architecture', 'bpmn', 'code', 'data-engineering', 'erd', 'flowchart', 'sketch'].sort(),
    );
  });

  it('records complete edge permissions, escaped content checks, and manual-review needs', () => {
    const accuracyDir = join(__dirname, 'fixtures/accuracy');
    const corpusDir = join(__dirname, 'fixtures/corpus');
    const fixtures = loadAllFixtures(accuracyDir, corpusDir);
    const byId = new Map(fixtures.map((fixture) => [fixture.meta.caseId, fixture.meta]));

    expect(byId.get('003-add-connected-subgraph')?.expectedNewEdges).toEqual([
      { source: 'gateway', target: 'cache' },
      { source: 'cache', target: 'cache_store' },
    ]);
    expect(byId.get('004-broad-restructure-deletion')?.expectedRemovedEdges).toHaveLength(3);
    expect(byId.get('004-broad-restructure-deletion')?.expectedChangedNodeIds).toEqual([]);
    expect(byId.get('004-broad-restructure-deletion')?.expectedNewEdges).toEqual([
      { source: 'ingestion', target: 'warehouse' },
    ]);
    expect(byId.get('016-adversarial-quote-in-label')?.expectedSubstrings).toEqual([
      'Say \\"Hello\\" to the user',
    ]);
    for (const id of [
      '002-rename-node-local-edit',
      '003-add-connected-subgraph',
      '004-broad-restructure-deletion',
      '007-spatial-move-node-below',
      '018-adversarial-near-duplicate-names',
    ]) {
      expect(byId.get(id)?.requiresManualReview, `${id} must retain a fulfillment/manual-review signal`).toBe(true);
    }
  });
});
