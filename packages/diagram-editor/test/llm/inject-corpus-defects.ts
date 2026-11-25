/**
 * Corpus-scale defect injection runner (Slice 49, R-049.5 AC-4). This is
 * "select-and-inject-defects.ts" from `dev/designs/coral-defect-corpus.md`
 * Step 5: for every known-good `coral/<slug>.coral` file, it computes which
 * of the 17 catalog types (15 grammar-level via `inject-syntax-defects.ts`,
 * 2 vocabulary-level via `inject-vocabulary-defects.ts`) have a verified
 * injection site, injects one instance of *every* available type (not just
 * one) -- maximizing this assessment slice's ability to actually prove the
 * fix-mode 100%-resolution bar (R-049.5 AC-5) across the full corpus, per
 * the design's "N defect types (default one, configurable)" -- and writes
 * each result under `defects/syntax/` plus the `InjectedDefectRecord`s
 * destined for `manifest.json`'s `knownDefects.syntax`.
 *
 * Determinism: the seed for each `(slug, defectType)` pair is derived from a
 * pure string hash, not `Math.random()` or wall-clock -- re-running this
 * over an unchanged corpus reproduces byte-identical `defects/syntax/*`
 * output.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeCorpusFile } from './corpus-fs';
import { availableDefectTypes, injectSyntaxDefect, type SyntaxDefectType } from './inject-syntax-defects';
import {
  availableVocabularyDefectTypes,
  injectVocabularyDefect,
  type VocabularyDefectType,
} from './inject-vocabulary-defects';

export interface InjectedDefectRecord {
  defectType: string;
  location: { line: number; column: number; charOffset: number };
  outputFile: string;
  seed: number;
}

export interface CorpusInjectionResult {
  recordsBySlug: Record<string, InjectedDefectRecord[]>;
  /** Slugs with fewer than three injectable catalog types, per the design's fallback note. */
  lowInjectableCount: Array<{ slug: string; availableCount: number }>;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small, pure, deterministic string hash (FNV-1a) -- no Math.random(), no wall clock. */
function seedFor(slug: string, defectType: string): number {
  let hash = 0x811c9dc5;
  for (const ch of `${slug}:${defectType}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function injectDefectsForCorpus(corpusDir: string): CorpusInjectionResult {
  const coralDir = join(corpusDir, 'coral');
  const syntaxDir = join(corpusDir, 'defects', 'syntax');
  if (!existsSync(syntaxDir)) mkdirSync(syntaxDir, { recursive: true });

  const slugs = readdirSync(coralDir)
    .filter((f) => f.endsWith('.coral'))
    .map((f) => f.slice(0, -'.coral'.length))
    .sort();

  const recordsBySlug: Record<string, InjectedDefectRecord[]> = {};
  const lowInjectableCount: Array<{ slug: string; availableCount: number }> = [];

  for (const slug of slugs) {
    const dsl = readFileSync(join(coralDir, `${slug}.coral`), 'utf8');
    const grammarTypes = availableDefectTypes(dsl);
    const vocabTypes = availableVocabularyDefectTypes(dsl);

    if (grammarTypes.length + vocabTypes.length < 3) {
      lowInjectableCount.push({ slug, availableCount: grammarTypes.length + vocabTypes.length });
    }

    const records: InjectedDefectRecord[] = [];

    for (const defectType of grammarTypes) {
      const seed = seedFor(slug, defectType);
      const result = injectSyntaxDefect(`${slug}.coral`, dsl, defectType as SyntaxDefectType, mulberry32(seed));
      records.push(writeDefect(syntaxDir, slug, defectType, seed, result));
    }
    for (const defectType of vocabTypes) {
      const seed = seedFor(slug, defectType);
      const result = injectVocabularyDefect(`${slug}.coral`, dsl, defectType as VocabularyDefectType, mulberry32(seed));
      records.push(writeDefect(syntaxDir, slug, defectType, seed, result));
    }

    recordsBySlug[slug] = records;
  }

  return { recordsBySlug, lowInjectableCount };
}

function writeDefect(
  syntaxDir: string,
  slug: string,
  defectType: string,
  seed: number,
  result: { originalFilename: string; originalDsl: string; injectedDefects: Array<{ defectType: string; location: { line: number; column: number; charOffset: number }; description: string }>; outputFilename: string; outputText: string },
): InjectedDefectRecord {
  const baseName = `${slug}-${defectType}-1`;
  const coralFile = `${baseName}.coral`;
  const metaFile = `${baseName}.meta.json`;

  writeCorpusFile(join(syntaxDir, coralFile), result.outputText);
  writeCorpusFile(
    join(syntaxDir, metaFile),
    JSON.stringify(
      {
        originalFilename: result.originalFilename,
        originalDsl: result.originalDsl,
        injectedDefects: result.injectedDefects,
        outputFilename: coralFile,
      },
      null,
      2,
    ) + '\n',
  );

  return {
    defectType,
    location: result.injectedDefects[0].location,
    outputFile: coralFile,
    seed,
  };
}
