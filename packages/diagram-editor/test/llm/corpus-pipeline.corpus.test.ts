/**
 * Runs the full real-corpus pipeline (Slice 49, R-049.5/R-049.6) as three
 * sequential steps in ONE test file: (1) `buildCorpus` — convert every raw
 * diagram and write `manifest.json`; (2) inject every applicable syntax defect
 * catalog and verify the safe repair/unresolved dispositions, merging into
 * `manifest.json`'s `knownDefects.syntax`; (3) validate the Fable-5.1-authored
 * semantic defects and merge into `knownDefects.semantic`.
 *
 * **Why one file, not three** (an earlier version of this suite split these
 * into `build-corpus.corpus.test.ts`/`inject-corpus-defects.corpus.test.ts`/
 * `validate-semantic-corpus.corpus.test.ts`, each independently reading,
 * mutating, and overwriting the same `manifest.json`): vitest runs `it()`
 * blocks within one file/worker sequentially, but different *files* can run
 * concurrently across workers by default. Three separate files each doing a
 * read-modify-write on the same `manifest.json` is a real, observed race —
 * running the full suite (not just these files individually and in order)
 * non-deterministically clobbered `knownDefects.syntax`/`.semantic` back to
 * empty, because `buildCorpus`'s own output always sets `knownDefects` fresh
 * and a later file's write could land after an earlier file's merge rather
 * than before it. Consolidating into one file's `it()` sequence — which
 * vitest guarantees runs in declaration order — removes the race entirely.
 *
 * Other corpus test files still read these committed fixtures from parallel
 * workers, so the steps never expose an intermediate state: the manifest is
 * merged in memory across steps 1-3 and written once, and every write goes
 * through `writeCorpusFile`, which leaves unchanged content untouched and
 * replaces changed content atomically.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCorpus, type CorpusManifest } from './build-corpus';
import { writeCorpusFile } from './corpus-fs';
import { injectDefectsForCorpus } from './inject-corpus-defects';
import { verifyCorpusRepairs } from './verify-corpus-repairs';
import { validateSemanticCorpus } from './validate-semantic-corpus';

const CORPUS_DIR = join(__dirname, 'fixtures/corpus');
const MANIFEST_PATH = join(CORPUS_DIR, 'manifest.json');

/** The manifest being assembled by steps 1-3, written once by step 3. */
let assembled: CorpusManifest | undefined;

// The current derived Mermaid corpus has no JSON `data` clauses now that
// branch labels no longer manufacture ports. Missing/trailing JSON commas
// remain covered by focused injector/repair tests, not by this corpus.
const CORPUS_INJECTABLE_DEFECT_TYPES = [
  'missing-closing-quote', 'missing-opening-quote',
  'missing-closing-brace', 'missing-opening-brace',
  'line-break-in-label', 'unicode-lookalike-quote', 'stray-character',
];

describe('the real Slice 49 corpus pipeline (build -> inject/verify -> semantic-validate)', () => {
  // This correctness batch builds all 27 entries before the in-memory merges;
  // it takes 7.7 s under coverage. Its local bound preserves the atomic pipeline
  // and is independent of the product performance acceptance thresholds.
  it('step 1: converts every raw diagram to a known-good, verified Coral file and assembles manifest.json', () => {
    const { manifest, errors } = buildCorpus(CORPUS_DIR);

    if (errors.length > 0) {
      throw new Error(`Corpus build errors:\n${errors.map((e) => `${e.slug} [${e.stage}]: ${e.message}`).join('\n')}`);
    }

    const slugs = Object.keys(manifest).sort();
    expect(slugs).toHaveLength(27);

    // R-049.5 AC-1: spread across the three retained Mermaid diagram types.
    const typeCounts = new Map<string, number>();
    for (const slug of slugs) {
      const type = manifest[slug].source.diagramType;
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    }
    for (const type of ['flowchart', 'sequenceDiagram', 'classDiagram']) {
      expect(typeCounts.get(type) ?? 0).toBeGreaterThan(0);
    }

    assembled = manifest;
  }, 15_000);

  it('step 2: injects every applicable category and preserves repair dispositions', () => {
    const { recordsBySlug, lowInjectableCount } = injectDefectsForCorpus(CORPUS_DIR);

    const totalInjected = Object.values(recordsBySlug).reduce((sum, records) => sum + records.length, 0);
    expect(totalInjected).toBeGreaterThan(0);

    const typesSeen = new Set<string>();
    for (const records of Object.values(recordsBySlug)) {
      for (const record of records) typesSeen.add(record.defectType);
    }
    // Every syntax shape still present in the retained corpus must have an
    // injection site. JSON comma defects are not fabricated for coverage.
    const missingTypes = CORPUS_INJECTABLE_DEFECT_TYPES.filter((t) => !typesSeen.has(t));
    expect(missingTypes).toEqual([]);
    expect(typesSeen.has('missing-comma')).toBe(false);
    expect(typesSeen.has('trailing-comma')).toBe(false);

    // Merge into manifest.json's knownDefects.syntax (Step 4), in the
    // manifest step 1 assembled in this file/worker, guaranteed to run first.
    const manifest = assembled!;
    for (const [slug, records] of Object.entries(recordsBySlug)) {
      if (manifest[slug]) manifest[slug].knownDefects.syntax = records;
    }

    // Release acceptance separates deterministic injection coverage from
    // safe repair. The JSON-only comma categories retain separate unit tests.
    const verification = verifyCorpusRepairs(CORPUS_DIR);
    expect(verification.failures).toEqual([]);
    expect(verification.totalFiles).toBe(totalInjected);
    expect(verification.resolvedFiles + verification.intentionallyUnresolved.length).toBe(totalInjected);
    expect([...new Set(verification.intentionallyUnresolved.map((entry) => entry.defectType))].sort())
      .toEqual([...CORPUS_INJECTABLE_DEFECT_TYPES].sort());
    if (verification.failures.length > 0) {
      throw new Error(
        `${verification.failures.length}/${verification.totalFiles} defect files were not fully resolved:\n` +
          verification.failures
            .map((f) => `${f.file}: ${f.reparseErrors.map((e) => e.message).join('; ')}`)
            .join('\n'),
      );
    }

    // Not a hard failure -- the design explicitly allows and asks for this
    // to be recorded rather than forced -- but worth seeing if it happens.
    if (lowInjectableCount.length > 0) {
      console.log('Diagrams with fewer than three injectable defect types:', lowInjectableCount);
    }
  });

  it('step 3: accepts every Fable-5.1-authored semantic defect and merges it into manifest.json (R-049.6 AC-2/AC-3)', () => {
    const { recordsBySlug, failures } = validateSemanticCorpus(CORPUS_DIR);

    if (failures.length > 0) {
      throw new Error(
        `${failures.length} semantic defect file(s) failed validation and need a per-diagram retry:\n` +
          failures.map((f) => `${f.file} (${f.slug}): ${f.reasons.join('; ')}`).join('\n'),
      );
    }

    const slugsWithDefects = Object.keys(recordsBySlug);
    expect(slugsWithDefects.length).toBeGreaterThan(0);

    // Merges into the manifest steps 1 and 2 assembled (in this file/worker)
    // and writes it once, so no reader sees a partial merge.
    const manifest = assembled!;
    for (const [slug, records] of Object.entries(recordsBySlug)) {
      expect(manifest[slug]).toBeDefined();
      manifest[slug].knownDefects.semantic = records;
    }
    writeCorpusFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  });

  it('step 4 (sanity check): the final manifest.json on disk carries both syntax and semantic defect merges together', () => {
    const manifest: CorpusManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const syntaxTotal = Object.values(manifest).reduce((sum, entry) => sum + entry.knownDefects.syntax.length, 0);
    const semanticTotal = Object.values(manifest).reduce((sum, entry) => sum + entry.knownDefects.semantic.length, 0);

    // Guards against exactly the race this file's consolidation was written
    // to eliminate: if either merge step's output were ever clobbered by
    // another step running out of order, one of these would silently be 0.
    expect(syntaxTotal).toBeGreaterThan(0);
    expect(semanticTotal).toBeGreaterThan(0);
  });
});
