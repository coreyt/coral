/**
 * LLM Accuracy Harness (Slice 49, aspect c) — Phase 3.
 *
 * Implements `dev/designs/llm-accuracy-harness.md`'s "Phase 3 implementation
 * contract": a testable core (`fixtureToRequest`, `runHarness`, fixture
 * loading) plus a thin CLI shell (`main`) that performs the only two impure
 * things this harness needs — reading fixture files and calling the real
 * network `generate`. The CLI shell is a manual, live-key script in the same
 * family as `test-e2e.ts`/`test-live.ts`: not part of `npm run verify` or CI.
 *
 * Usage: `npx tsx packages/diagram-editor/test/llm/accuracy-harness.ts`.
 * Runs are skipped, not failed, for providers with no configured key; a
 * no-key run is a supported smoke check and records the skipped matrix.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from '../../src/llm/generate';
import type { GenerateRequest, LLMConfig, LLMProviderId, SamplingProfile } from '../../src/llm/types';
import { loadFixture, scoreResult, type AccuracyFixtureMeta, type AccuracyScore, type LoadedFixture } from './accuracy-scoring';
import { MERMAID_ALLOWLIST } from './fixtures/accuracy/mermaid-allowlist';
import type { CorpusManifest } from './build-corpus';

// ============================================================================
// Pure — no filesystem, no network.
// ============================================================================

/** Builds the request per llm-accuracy-harness.md's "Case-type to request/scoring treatment" table. */
export function fixtureToRequest(fixture: LoadedFixture, config: LLMConfig): GenerateRequest {
  const request: GenerateRequest = {
    prompt: fixture.prompt,
    config,
    outputFormat: fixture.meta.outputFormat,
  };
  if (fixture.existingDsl !== undefined) request.existingDsl = fixture.existingDsl;
  if (fixture.meta.notationId !== undefined) request.notationId = fixture.meta.notationId;
  if (fixture.diagnostics !== undefined) request.diagnostics = fixture.diagnostics;
  if (fixture.layout !== undefined) request.layout = fixture.layout;
  return request;
}

export interface RunMatrixEntry {
  provider: LLMProviderId;
  model: string;
  samplingLabel: string;
  sampling?: SamplingProfile;
}

export interface SkippedRun {
  caseId: string;
  provider: LLMProviderId;
  model: string;
  samplingLabel: string;
  reason: 'no-api-key';
}

export interface HarnessRun {
  scores: AccuracyScore[];
  skipped: SkippedRun[];
  candidates: Array<{
    caseId: string;
    provider: LLMProviderId;
    model: string;
    samplingLabel: string;
    candidateDsl: string;
  }>;
}

/**
 * Runs every fixture against every run-matrix entry with a configured API
 * key, scoring each result. `generateFn` is injected so tests can pass a
 * scripted fake instead of the real network `generate` — the same
 * "inject the effectful boundary" pattern `generation-retry-transport.md`
 * already established for `RetryRuntime`.
 */
export async function runHarness(
  fixtures: LoadedFixture[],
  matrix: RunMatrixEntry[],
  apiKeys: Partial<Record<LLMProviderId, string>>,
  generateFn: typeof generate,
): Promise<HarnessRun> {
  const scores: AccuracyScore[] = [];
  const skipped: SkippedRun[] = [];
  const candidates: HarnessRun['candidates'] = [];

  for (const fixture of fixtures) {
    for (const entry of matrix) {
      const apiKey = apiKeys[entry.provider];
      if (!apiKey) {
        skipped.push({
          caseId: fixture.meta.caseId,
          provider: entry.provider,
          model: entry.model,
          samplingLabel: entry.samplingLabel,
          reason: 'no-api-key',
        });
        continue;
      }

      const config: LLMConfig = {
        provider: entry.provider,
        model: entry.model,
        apiKey,
        ...(entry.sampling ? { sampling: entry.sampling } : {}),
      };
      const request = fixtureToRequest(fixture, config);
      const result = await generateFn(request);
      const score = scoreResult(fixture, result);
      candidates.push({
        caseId: fixture.meta.caseId,
        provider: entry.provider,
        model: entry.model,
        samplingLabel: entry.samplingLabel,
        candidateDsl: result.dsl ?? '',
      });
      // scoreResult deliberately leaves provider/model/samplingProfile as
      // empty-string placeholders (see accuracy-scoring.ts's own doc
      // comment) for exactly this call site to fill in from the run-matrix
      // entry it already has -- stated explicitly per design review, which
      // found an earlier draft's pseudocode omitted this step entirely.
      scores.push({ ...score, provider: entry.provider, model: entry.model, samplingProfile: entry.samplingLabel });
    }
  }

  return { scores, skipped, candidates };
}

// ============================================================================
// Filesystem — reads fixture content into LoadedFixture. Thin: all the
// actual logic (parsing existingDsl, computing originalNodeIds/Nodes/Edges)
// stays in the already-tested, pure `loadFixture`.
// ============================================================================

function readIfExists(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, 'utf8').replace(/\n$/, '');
}

export function loadFixtureFromDirectory(dir: string): LoadedFixture {
  const meta: AccuracyFixtureMeta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const prompt = readIfExists(join(dir, 'prompt.txt')) ?? '';
  const existingDsl = readIfExists(join(dir, 'existing.txt'));
  const diagnostics = readIfExists(join(dir, 'diagnostics.txt'));
  const layoutPath = join(dir, 'layout.json');
  const layout = existsSync(layoutPath) ? JSON.parse(readFileSync(layoutPath, 'utf8')) : undefined;
  return loadFixture(meta, prompt, existingDsl, diagnostics, layout);
}

/**
 * Draws `generate` fixtures from `coral-defect-corpus.md`'s corpus (Step 4's
 * `manifest.json`), per llm-accuracy-harness.md's "Corpus adapter" section:
 * one fixture per description file (three per diagram), never `notation`
 * fixtures (the corpus has no Coral-notation field, only a Mermaid
 * `diagramType`). Reads description text directly, since `CorpusManifest`
 * alone only records file *names*, not their content.
 */
export function corpusToGenerateFixtures(corpusDir: string): LoadedFixture[] {
  const manifestPath = join(corpusDir, 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  const manifest: CorpusManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const descriptionsDir = join(corpusDir, 'descriptions');

  const fixtures: LoadedFixture[] = [];
  for (const [slug, entry] of Object.entries(manifest)) {
    entry.descriptions.review.reviews.forEach((review, index) => {
      const n = index + 1;
      const descriptionPath = join(descriptionsDir, review.descriptionFile);
      if (!existsSync(descriptionPath)) return;
      const prompt = readFileSync(descriptionPath, 'utf8').replace(/\n$/, '');
      const meta: AccuracyFixtureMeta = {
        caseId: `${slug}-generate-d${n}`,
        caseType: 'generate',
        outputFormat: 'coral',
        provenance: entry.source.sourceUrl,
        limitations: review.notes,
      };
      fixtures.push(loadFixture(meta, prompt));
    });
  }
  return fixtures;
}

/**
 * Reads every `fixtures/accuracy/*\/` directory plus draws corpus-adapter
 * fixtures from `coral-defect-corpus.md`'s `manifest.json`, skipping any
 * Mermaid fixture not on `MERMAID_ALLOWLIST` and printing what was skipped
 * and why.
 */
export function loadAllFixtures(accuracyDir: string, corpusDir: string): LoadedFixture[] {
  const fixtures: LoadedFixture[] = [];

  for (const name of readdirSync(accuracyDir).sort()) {
    const dir = join(accuracyDir, name);
    if (!existsSync(join(dir, 'meta.json'))) continue;
    const fixture = loadFixtureFromDirectory(dir);
    if (fixture.meta.outputFormat === 'mermaid') {
      const allowed = MERMAID_ALLOWLIST !== null
        && fixture.meta.mermaidDiagramType !== undefined
        && MERMAID_ALLOWLIST.includes(fixture.meta.mermaidDiagramType);
      if (!allowed) {
        console.log(`Skipping Mermaid fixture "${fixture.meta.caseId}": not on MERMAID_ALLOWLIST (currently ${MERMAID_ALLOWLIST === null ? 'unset' : JSON.stringify(MERMAID_ALLOWLIST)}).`);
        continue;
      }
    }
    fixtures.push(fixture);
  }

  fixtures.push(...corpusToGenerateFixtures(corpusDir));
  return fixtures;
}

// ============================================================================
// CLI shell — the only impure entry point, not unit-tested (nothing to
// assert beyond "calls the real function"), matching test-e2e.ts's existing
// precedent of a manual, live-key script outside `npm run verify`.
// ============================================================================

const RUN_MATRIX: RunMatrixEntry[] = [
  { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', samplingLabel: 'default' },
  { provider: 'openai', model: 'gpt-4o', samplingLabel: 'default' },
];

const moduleDir = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const accuracyDir = join(moduleDir, 'fixtures/accuracy');
  const corpusDir = join(moduleDir, 'fixtures/corpus');
  const fixtures = loadAllFixtures(accuracyDir, corpusDir);

  const apiKeys: Partial<Record<LLMProviderId, string>> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    mistral: process.env.MISTRAL_API_KEY,
  };

  const { scores, skipped, candidates } = await runHarness(fixtures, RUN_MATRIX, apiKeys, generate);

  const outDir = join(moduleDir, 'accuracy-harness-output', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'scorecard.json'), JSON.stringify({ scores, skipped, candidates }, null, 2));

  console.log(`\n${scores.length} run(s) scored, ${skipped.length} skipped (no API key). Scorecard: ${outDir}/scorecard.json\n`);
  for (const score of scores) {
    const flag = score.requiresManualReview ? ' [MANUAL REVIEW]' : '';
    console.log(
      `${score.caseId} | ${score.provider}/${score.model}/${score.samplingProfile} | ` +
      `valid=${score.valid} drift=${score.driftPct ?? 'n/a'}% lintErrors=${score.lintErrorCount} ` +
      `unintended=${score.unintendedChangeCount}${flag}`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
