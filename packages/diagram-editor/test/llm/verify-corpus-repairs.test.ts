/**
 * TDD coverage for `verifyCorpusRepairs` (Slice 49, R-049.5 AC-5). Exercises
 * the full injector -> repair -> reparse loop end to end on a small
 * synthetic temp corpus, independent of the retained diagram corpus.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { injectDefectsForCorpus } from './inject-corpus-defects';
import { verifyCorpusRepairs } from './verify-corpus-repairs';

let dir: string;

// Modeled on what the real Mermaid->Coral pipeline actually produces at
// corpus scale: a plain node, a node with a `{}` property body (the shape
// `classDiagram`/`erDiagram` members/attributes print as), and an edge
// carrying a `data{}` clause. Scalar cardinalities are attributes (R-063 AC-5),
// and `data.properties` keeps a non-scalar property.
const RICH_DSL =
  'service "API Gateway" as gw\n' +
  'database "Orders DB" as db\n' +
  'module "Router" as r {\n' +
  '  members: ["route(path): string", "upstreamHost: string"]\n' +
  '}\n' +
  'gw -> r [label: "routes"]\n' +
  'r -> db [dashed, label: "writes", sourceCardinality: "||", targetCardinality: "o{"] data { "properties": { "keys": ["id", "orderId"] } }\n';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'coral-repair-verify-test-'));
  mkdirSync(join(dir, 'coral'), { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('verifyCorpusRepairs', () => {
  it('repairs the safe subset and classifies every ambiguous category without changing it', () => {
    writeFileSync(join(dir, 'coral', 'rich.coral'), RICH_DSL, 'utf8');
    const { recordsBySlug } = injectDefectsForCorpus(dir);
    expect(recordsBySlug.rich.length).toBeGreaterThanOrEqual(10);

    const result = verifyCorpusRepairs(dir);

    expect(result.totalFiles).toBe(recordsBySlug.rich.length);
    expect(result.resolvedFiles + result.intentionallyUnresolved.length).toBe(result.totalFiles);
    expect([...new Set(result.intentionallyUnresolved.map((entry) => entry.defectType))].sort()).toEqual([
      'bare-bracket-attribute',
      'keyword-case-mutation',
      'line-break-in-label',
      'missing-closing-brace',
      'missing-closing-quote',
      'missing-edge-target',
      'missing-opening-brace',
      'missing-opening-quote',
      'misspelled-keyword',
      'stray-character',
      'unbalanced-bracket',
      'unicode-lookalike-quote',
      'wrong-arrow',
    ]);
    expect(result.failures).toEqual([]);
  });

  it('does not silently count an ambiguous brace rewrite as resolved', () => {
    mkdirSync(join(dir, 'defects', 'syntax'), { recursive: true });
    const source = 'service "A" as a {\nservice "B" as b';
    const file = 'ambiguous-missing-closing-brace-1.coral';
    writeFileSync(join(dir, 'defects', 'syntax', file), source, 'utf8');
    writeFileSync(join(dir, 'defects', 'syntax', file.replace('.coral', '.meta.json')), JSON.stringify({
      originalDsl: 'service "A" as a\nservice "B" as b',
      injectedDefects: [{ defectType: 'missing-closing-brace' }],
    }));

    const result = verifyCorpusRepairs(dir);

    expect(result.resolvedFiles).toBe(0);
    expect(result.intentionallyUnresolved).toEqual([{ file, defectType: 'missing-closing-brace' }]);
    expect(result.failures).toEqual([]);
  });

  it('rejects a safely repaired file whose graph does not match its known-good source', () => {
    mkdirSync(join(dir, 'defects', 'syntax'), { recursive: true });
    const file = 'mismatch-missing-space-after-type-1.coral';
    writeFileSync(join(dir, 'defects', 'syntax', file), 'service"A" as a', 'utf8');
    writeFileSync(join(dir, 'defects', 'syntax', file.replace('.coral', '.meta.json')), JSON.stringify({
      originalDsl: 'service "Different" as different',
      injectedDefects: [{ defectType: 'missing-space-after-type' }],
    }));

    const result = verifyCorpusRepairs(dir);

    expect(result.resolvedFiles).toBe(0);
    expect(result.failures).toHaveLength(1);
  });

  it('reports a failure for a defect the repair layer genuinely cannot resolve, rather than silently passing', () => {
    // A defect type outside the whole 17-type catalog (a completely
    // malformed, non-catalog corruption) must surface as a real failure --
    // this is the RED half proving the GREEN result above isn't vacuous.
    mkdirSync(join(dir, 'defects', 'syntax'), { recursive: true });
    writeFileSync(join(dir, 'defects', 'syntax', 'garbage-unknown-1.coral'), '§§§ not coral at all §§§\n', 'utf8');

    const result = verifyCorpusRepairs(dir);

    expect(result.totalFiles).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].file).toBe('garbage-unknown-1.coral');
    expect(result.failures[0].reparseErrors.length).toBeGreaterThan(0);
  });
});
