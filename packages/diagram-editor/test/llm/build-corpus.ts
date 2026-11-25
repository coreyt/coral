/**
 * Corpus builder for the Coral defect corpus (Slice 49, R-049.5 AC-3/AC-1).
 *
 * Converts reviewed raw Mermaid through the installed source writers and the
 * bounded corpus adapter. Any importer diagnostic or unsupported field rejects
 * the diagram. The production source reader verifies each retained @diagram
 * before it is written; graph-only parser acceptance is insufficient.
 * Existing descriptions and defect metadata remain in the corpus manifest.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseMermaid, type Diagnostic } from '@coral-viz/language';
import { parseCoralDSL } from '../../src/parsers';
import { writeCorpusSource028 } from './corpus-source-028';
import { writeCorpusFile } from './corpus-fs';

export interface SourceMeta {
  slug: string;
  sourceUrl: string;
  license: string;
  attribution?: string;
  collectedDate: string;
  diagramType: string;
  complexity: 'simple' | 'moderate' | 'complex';
  nodeCount: number;
  edgeCount: number;
}

export interface DescriptionReviewEntry {
  descriptionFile: string;
  accurate: boolean;
  complete: boolean;
  notes: string;
}

export interface DescriptionReview {
  slug: string;
  reviews: DescriptionReviewEntry[];
}

export interface CorpusManifestEntry {
  source: SourceMeta;
  descriptions: { review: DescriptionReview; files: string[] };
  coral: { file: string; conversionNotes: Diagnostic[] };
  knownDefects: { syntax: unknown[]; semantic: unknown[] };
}

export type CorpusManifest = Record<string, CorpusManifestEntry>;

export interface CorpusBuildError {
  slug: string;
  stage: 'mermaid-parse' | 'coral-verify' | 'missing-metadata' | 'metadata-integrity';
  message: string;
}

export interface CorpusBuildResult {
  manifest: CorpusManifest;
  errors: CorpusBuildError[];
}

/**
 * Builds the corpus manifest by scanning `<corpusDir>/raw/*.mmd`, converting
 * each through the canonical pipeline, verifying with `parseCoralDSL`, and
 * writing `<corpusDir>/coral/<slug>.coral` for every diagram that verifies
 * cleanly. Pure with respect to inputs -- given the same `raw/`/`descriptions/`
 * contents, produces byte-identical `coral/*.coral` output and an identical
 * manifest every time (the only filesystem writes are the derived `.coral`
 * files, never `manifest.json` itself -- callers decide whether/where to
 * persist that). A `.coral` file is rewritten only when its content changed,
 * and then atomically (see `corpus-fs.ts`).
 */
export function buildCorpus(corpusDir: string): CorpusBuildResult {
  const rawDir = join(corpusDir, 'raw');
  const descDir = join(corpusDir, 'descriptions');
  const coralDir = join(corpusDir, 'coral');
  if (!existsSync(coralDir)) mkdirSync(coralDir, { recursive: true });

  const slugs = readdirSync(rawDir)
    .filter((f) => f.endsWith('.mmd'))
    .map((f) => f.slice(0, -'.mmd'.length))
    .sort();

  const manifest: CorpusManifest = {};
  const errors: CorpusBuildError[] = [];

  for (const slug of slugs) {
    const mmdPath = join(rawDir, `${slug}.mmd`);
    const sourceMetaPath = join(rawDir, `${slug}.source.json`);
    const reviewPath = join(descDir, `${slug}.description-review.json`);

    if (!existsSync(sourceMetaPath) || !existsSync(reviewPath)) {
      errors.push({
        slug,
        stage: 'missing-metadata',
        message: `Missing ${!existsSync(sourceMetaPath) ? sourceMetaPath : reviewPath}`,
      });
      continue;
    }

    const sourceMeta: SourceMeta = JSON.parse(readFileSync(sourceMetaPath, 'utf8'));
    const review: DescriptionReview = JSON.parse(readFileSync(reviewPath, 'utf8'));
    if (sourceMeta.slug !== slug || review.slug !== slug || review.reviews.length !== 3) {
      errors.push({
        slug,
        stage: 'metadata-integrity',
        message: 'source/review slug must match and exactly three description reviews are required',
      });
      continue;
    }
    const invalidDescription = review.reviews.find(
      (entry) => !entry.descriptionFile
        || basename(entry.descriptionFile) !== entry.descriptionFile
        || !existsSync(join(descDir, entry.descriptionFile)),
    );
    const reviewFiles = review.reviews.map((entry) => entry.descriptionFile);
    if (invalidDescription || new Set(reviewFiles).size !== reviewFiles.length) {
      errors.push({
        slug,
        stage: 'metadata-integrity',
        message: `Invalid, missing, or duplicate reviewed description ${invalidDescription?.descriptionFile ?? ''}`.trim(),
      });
      continue;
    }
    const incompleteReview = review.reviews.find((r) => !r.accurate || !r.complete);
    if (incompleteReview) {
      errors.push({
        slug,
        stage: 'missing-metadata',
        message: `${incompleteReview.descriptionFile} is not marked accurate+complete: ${incompleteReview.notes}`,
      });
      continue;
    }

    const mmdText = readFileSync(mmdPath, 'utf8');
    let conversionNotes: Diagnostic[] = [];
    let coralText: string;
    try {
      const parsed = parseMermaid(mmdText);
      if (!parsed.graph || parsed.diagnostics.length) {
        errors.push({
          slug,
          stage: 'mermaid-parse',
          message: `parseMermaid rejected the positive source: ${parsed.diagnostics.map((d) => d.message).join('; ')}`,
        });
        continue;
      }
      if (parsed.graph.nodes.length !== sourceMeta.nodeCount || parsed.graph.edges.length !== sourceMeta.edgeCount) {
        errors.push({
          slug,
          stage: 'metadata-integrity',
          message: `Metadata counts ${sourceMeta.nodeCount}/${sourceMeta.edgeCount} do not match parsed counts ${parsed.graph.nodes.length}/${parsed.graph.edges.length}`,
        });
        continue;
      }
      coralText = writeCorpusSource028(parsed.graph);
      conversionNotes = parsed.diagnostics;
    } catch (err) {
      errors.push({ slug, stage: 'coral-verify', message: err instanceof Error ? err.message : String(err) });
      continue;
    }

    const verified = parseCoralDSL(coralText);
    if (verified.errors.length > 0 || verified.nodes.length === 0) {
      errors.push({
        slug,
        stage: 'coral-verify',
        message:
          verified.nodes.length === 0
            ? 'parseCoralDSL produced zero nodes'
            : `parseCoralDSL reported ${verified.errors.length} error(s): ${verified.errors.map((e) => e.message).join('; ')}`,
      });
      continue;
    }

    writeCorpusFile(join(coralDir, `${slug}.coral`), coralText);

    manifest[slug] = {
      source: sourceMeta,
      descriptions: {
        review,
        files: reviewFiles,
      },
      coral: { file: `${slug}.coral`, conversionNotes },
      knownDefects: { syntax: [], semantic: [] },
    };
  }

  return { manifest, errors };
}
