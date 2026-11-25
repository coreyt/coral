/**
 * Safe Fix-mode verification for the Coral defect corpus (Slice 49 local
 * S49-AC4). The four-type lexical allowlist must reparse to the known-good
 * supported graph; every other catalog category is preserved byte-for-byte.
 * The vocabulary
 * typo helper remains development evidence and is not production preflight.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { repairCoralDsl, type Diagnostic } from '@coral-viz/language';
import { type EditorParseError } from '../../src/parsers';
import { parseGraphFixture } from './graph-interchange-fixture';

const SAFE_REPAIR_TYPES = new Set([
  'missing-space-after-type',
  'colon-to-equals-node-property',
  'missing-comma',
  'trailing-comma',
]);

export interface CorpusRepairFailure {
  file: string;
  reason: string;
  unresolvedFromRepairCoralDsl: Diagnostic[];
  unresolvedTypes: string[];
  reparseErrors: EditorParseError[];
}

export interface CorpusRepairVerificationResult {
  totalFiles: number;
  resolvedFiles: number;
  intentionallyUnresolved: Array<{ file: string; defectType: string }>;
  failures: CorpusRepairFailure[];
}

function canonicalGraph(result: ReturnType<typeof parseGraphFixture>): string {
  return JSON.stringify({
    envelope: result.envelope,
    nodes: [...result.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...result.edges].sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function verifyCorpusRepairs(corpusDir: string): CorpusRepairVerificationResult {
  const syntaxDir = join(corpusDir, 'defects', 'syntax');
  const files = readdirSync(syntaxDir)
    .filter((f) => f.endsWith('.coral'))
    .sort();

  const failures: CorpusRepairFailure[] = [];
  const intentionallyUnresolved: Array<{ file: string; defectType: string }> = [];
  let resolvedFiles = 0;

  for (const file of files) {
    const defective = readFileSync(join(syntaxDir, file), 'utf8');
    const step1 = repairCoralDsl(defective);
    const metaPath = join(syntaxDir, file.replace(/\.coral$/, '.meta.json'));
    const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : undefined;
    const defectType = meta?.injectedDefects?.[0]?.defectType as string | undefined;

    if (!defectType) {
      const final = parseGraphFixture(step1.fixed);
      failures.push({
        file,
        reason: 'missing defect metadata',
        unresolvedFromRepairCoralDsl: step1.unresolved,
        unresolvedTypes: [],
        reparseErrors: final.errors,
      });
      continue;
    }

    if (!SAFE_REPAIR_TYPES.has(defectType)) {
      if (step1.fixed !== defective || step1.appliedFixes.length > 0) {
        const final = parseGraphFixture(step1.fixed);
        failures.push({
          file,
          reason: `intentionally unresolved ${defectType} was modified`,
          unresolvedFromRepairCoralDsl: step1.unresolved,
          unresolvedTypes: [defectType],
          reparseErrors: final.errors,
        });
        continue;
      }
      intentionallyUnresolved.push({ file, defectType });
      continue;
    }

    const final = parseGraphFixture(step1.fixed);
    const knownGood = typeof meta.originalDsl === 'string' ? parseGraphFixture(meta.originalDsl) : undefined;
    const wrongGraph = !knownGood || knownGood.errors.length > 0
      || canonicalGraph(final) !== canonicalGraph(knownGood);
    if (final.errors.length > 0 || step1.unresolved.length > 0 || wrongGraph) {
      failures.push({
        file,
        reason: wrongGraph ? 'repaired graph does not match known-good source' : 'safe repair remains invalid',
        unresolvedFromRepairCoralDsl: step1.unresolved,
        unresolvedTypes: step1.unresolved.length > 0 ? [defectType] : [],
        reparseErrors: final.errors,
      });
    } else {
      resolvedFiles++;
    }
  }

  return { totalFiles: files.length, resolvedFiles, intentionallyUnresolved, failures };
}
