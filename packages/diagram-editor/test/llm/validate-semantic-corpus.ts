/**
 * Corpus-scale validation + manifest merge for Fable-5.1-authored semantic
 * defect test data (Slice 49, R-049.6 AC-2/AC-3). Implements the design's
 * "Output validation and retry" step over whatever
 * `defects/semantic/<slug>-<type>-<n>.{coral,meta.json}` pairs already
 * exist on disk -- it does not call any model itself (Call 2's actual
 * generation happens in `Agent` calls run separately); this is the
 * deterministic acceptance gate those calls' output must clear before being
 * merged into `manifest.json`.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateSemanticDefect, type SemanticDefectMeta } from './semantic-defects';

export interface SemanticCorpusValidationFailure {
  file: string;
  slug: string;
  reasons: string[];
}

export interface SemanticDefectManifestRecord {
  defectType: string;
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  explanation: string;
  outputFile: string;
}

export interface SemanticCorpusValidationResult {
  recordsBySlug: Record<string, SemanticDefectManifestRecord[]>;
  failures: SemanticCorpusValidationFailure[];
}

/**
 * Validates every `defects/semantic/*.meta.json` against its diagram's
 * known-good `coral/<slug>.coral`, returning accepted records grouped by
 * slug (ready to merge into `manifest.json`'s `knownDefects.semantic`) plus
 * any rejected files with the specific reason(s) they failed -- the coordinating
 * step then knows exactly which (slug, defectType) pairs need a retry.
 */
export function validateSemanticCorpus(corpusDir: string): SemanticCorpusValidationResult {
  const semanticDir = join(corpusDir, 'defects', 'semantic');
  const coralDir = join(corpusDir, 'coral');

  const metaFiles = existsSync(semanticDir)
    ? readdirSync(semanticDir)
        .filter((f) => f.endsWith('.meta.json'))
        .sort()
    : [];

  const recordsBySlug: Record<string, SemanticDefectManifestRecord[]> = {};
  const failures: SemanticCorpusValidationFailure[] = [];

  for (const metaFile of metaFiles) {
    const reasons: string[] = [];
    let meta: SemanticDefectMeta;
    try {
      meta = JSON.parse(readFileSync(join(semanticDir, metaFile), 'utf8'));
    } catch (err) {
      failures.push({ file: metaFile, slug: 'unknown', reasons: [`invalid JSON: ${err instanceof Error ? err.message : String(err)}`] });
      continue;
    }

    const slug = meta.originalFilename?.replace(/\.coral$/, '');
    if (!slug) {
      failures.push({ file: metaFile, slug: 'unknown', reasons: ['missing or malformed originalFilename'] });
      continue;
    }

    const knownGoodPath = join(coralDir, `${slug}.coral`);
    const outputPath = join(semanticDir, meta.outputFilename ?? '');
    if (!existsSync(knownGoodPath)) reasons.push(`no known-good file at coral/${slug}.coral`);
    if (!meta.outputFilename || !existsSync(outputPath)) reasons.push(`missing output file ${meta.outputFilename}`);
    if (!meta.defectType) reasons.push('missing defectType');
    if (!Array.isArray(meta.affectedNodeIds)) reasons.push('affectedNodeIds is not an array');
    if (!meta.explanation) reasons.push('missing explanation');

    if (reasons.length > 0) {
      failures.push({ file: metaFile, slug, reasons });
      continue;
    }

    const knownGoodDsl = readFileSync(knownGoodPath, 'utf8');
    const outputDsl = readFileSync(outputPath, 'utf8');
    const validation = validateSemanticDefect(meta, knownGoodDsl, outputDsl);

    if (!validation.valid) {
      const validationReasons = [
        ...validation.unknownNodeIds.map((id) => `unknown node id "${id}"`),
        ...validation.unknownEdgeIds.map((id) => `unknown edge id "${id}"`),
        ...validation.outputParseErrors.map((m) => `output DSL parse error: ${m}`),
        ...(validation.outputUnchanged ? ['output DSL is unchanged from known-good source'] : []),
        ...(!validation.outputUnchanged && validation.outputGraphUnchanged
          ? ['output graph is unchanged from known-good source'] : []),
        ...(!validation.affectedChangeObserved
          ? ['no declared affected entity changed'] : []),
      ];
      failures.push({ file: metaFile, slug, reasons: validationReasons });
      continue;
    }

    const record: SemanticDefectManifestRecord = {
      defectType: meta.defectType,
      affectedNodeIds: meta.affectedNodeIds,
      affectedEdgeIds: meta.affectedEdgeIds ?? [],
      explanation: meta.explanation,
      outputFile: meta.outputFilename,
    };
    (recordsBySlug[slug] ??= []).push(record);
  }

  return { recordsBySlug, failures };
}
