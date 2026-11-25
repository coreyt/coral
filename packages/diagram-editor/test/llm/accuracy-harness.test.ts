/**
 * TDD coverage for accuracy-harness.ts's testable core (Slice 49, aspect c,
 * Phase 3). `runHarness`'s `generateFn` is injected so these tests never
 * make a live provider call or need an API key -- see
 * dev/designs/llm-accuracy-harness.md's "Phase 3 implementation contract".
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFixture } from './accuracy-scoring';
import type { AccuracyFixtureMeta } from './accuracy-scoring';
import type { GenerateRequest, GenerateResult, LLMConfig } from '../../src/llm/types';
import {
  corpusToGenerateFixtures,
  fixtureToRequest,
  loadAllFixtures,
  loadFixtureFromDirectory,
  runHarness,
  type RunMatrixEntry,
} from './accuracy-harness';

const config: LLMConfig = { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', apiKey: 'sk-test' };

function baseMeta(overrides: Partial<AccuracyFixtureMeta>): AccuracyFixtureMeta {
  return {
    caseId: 'x',
    caseType: 'generate',
    outputFormat: 'coral',
    provenance: 'test',
    limitations: 'test',
    ...overrides,
  };
}

describe('fixtureToRequest', () => {
  it('populates prompt/config/outputFormat for a fresh generate fixture', () => {
    const fixture = loadFixture(baseMeta({}), 'Make a diagram');
    const request = fixtureToRequest(fixture, config);
    expect(request).toEqual({ prompt: 'Make a diagram', config, outputFormat: 'coral' });
  });

  it('adds existingDsl for a local-edit fixture', () => {
    const fixture = loadFixture(baseMeta({ caseType: 'local-edit' }), 'Rename it', 'service "A" as a');
    const request = fixtureToRequest(fixture, config);
    expect(request.existingDsl).toBe('service "A" as a');
  });

  it('adds notationId for a notation fixture', () => {
    const fixture = loadFixture(baseMeta({ caseType: 'notation', notationId: 'aiml' }), 'Make an AI pipeline');
    const request = fixtureToRequest(fixture, config);
    expect(request.notationId).toBe('aiml');
  });

  it('adds diagnostics and layout when the fixture has them', () => {
    const layout: GenerateRequest['layout'] = { nodes: [{ id: 'a', x: 0, y: 0 }], edges: [] };
    const fixture = loadFixture(baseMeta({ caseType: 'spatial' }), 'Move it', 'service "A" as a', undefined, layout);
    const request = fixtureToRequest(fixture, config);
    expect(request.layout).toEqual(layout);
  });

  it('never sets intent -- fixtures rely on generate()\'s default generate/modify inference', () => {
    const fixture = loadFixture(baseMeta({}), 'Make a diagram');
    const request = fixtureToRequest(fixture, config);
    expect(request.intent).toBeUndefined();
  });
});

describe('loadFixtureFromDirectory', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'accuracy-fixture-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads a minimal fixture (meta.json + prompt.txt only)', () => {
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(baseMeta({ caseId: '001' })));
    writeFileSync(join(dir, 'prompt.txt'), 'Do the thing.\n');

    const fixture = loadFixtureFromDirectory(dir);

    expect(fixture.meta.caseId).toBe('001');
    expect(fixture.prompt).toBe('Do the thing.');
    expect(fixture.existingDsl).toBeUndefined();
  });

  it('loads existing.txt, diagnostics.txt, and layout.json when present', () => {
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(baseMeta({ caseId: '007', caseType: 'spatial' })));
    writeFileSync(join(dir, 'prompt.txt'), 'Move it.\n');
    writeFileSync(join(dir, 'existing.txt'), 'service "A" as "a"\n');
    writeFileSync(join(dir, 'diagnostics.txt'), 'WARNING: x\n');
    writeFileSync(join(dir, 'layout.json'), JSON.stringify({ nodes: [{ id: 'a', x: 0, y: 0 }], edges: [] }));

    const fixture = loadFixtureFromDirectory(dir);

    expect(fixture.existingDsl).toBe('service "A" as "a"');
    expect(fixture.diagnostics).toBe('WARNING: x');
    expect(fixture.layout).toEqual({ nodes: [{ id: 'a', x: 0, y: 0 }], edges: [] });
    expect(fixture.originalNodeIds).toEqual(['a']);
  });
});

describe('loadAllFixtures', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'accuracy-all-fixtures-test-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('loads every fixture directory under the accuracy dir plus corpus-adapter fixtures', () => {
    const accuracyDir = join(root, 'accuracy');
    const corpusDir = join(root, 'corpus');
    mkdirSync(join(accuracyDir, '001-a'), { recursive: true });
    mkdirSync(join(corpusDir, 'descriptions'), { recursive: true });
    mkdirSync(join(corpusDir, 'coral'), { recursive: true });

    writeFileSync(join(accuracyDir, '001-a', 'meta.json'), JSON.stringify(baseMeta({ caseId: '001-a' })));
    writeFileSync(join(accuracyDir, '001-a', 'prompt.txt'), 'Hand-authored prompt.\n');

    writeFileSync(
      join(corpusDir, 'manifest.json'),
      JSON.stringify({
        'sample-diagram': {
          source: { sourceUrl: 'synthetic-original' },
          descriptions: {
            review: { slug: 'sample-diagram', reviews: [{ descriptionFile: 'sample-diagram.description-1.txt', accurate: true, complete: true, notes: 'ok' }] },
            files: ['sample-diagram.description-1.txt'],
          },
          coral: { file: 'sample-diagram.coral', conversionNotes: [] },
          knownDefects: { syntax: [], semantic: [] },
        },
      }),
    );
    writeFileSync(join(corpusDir, 'descriptions', 'sample-diagram.description-1.txt'), 'A corpus-derived prompt.\n');

    const fixtures = loadAllFixtures(accuracyDir, corpusDir);
    const caseIds = fixtures.map((f) => f.meta.caseId).sort();

    expect(caseIds).toEqual(['001-a', 'sample-diagram-generate-d1']);
  });

  it.each(['flowchart', 'sequenceDiagram', 'classDiagram', undefined])('gates Mermaid type %s against the approved flowchart scope', (mermaidDiagramType) => {
    const accuracyDir = join(root, 'accuracy');
    const corpusDir = join(root, 'corpus');
    mkdirSync(join(accuracyDir, '099-mermaid'), { recursive: true });
    mkdirSync(corpusDir, { recursive: true });

    writeFileSync(
      join(accuracyDir, '099-mermaid', 'meta.json'),
      JSON.stringify(baseMeta({ caseId: '099-mermaid', outputFormat: 'mermaid', mermaidDiagramType })),
    );
    writeFileSync(join(accuracyDir, '099-mermaid', 'prompt.txt'), 'A mermaid prompt.\n');

    const fixtures = loadAllFixtures(accuracyDir, corpusDir);

    expect(fixtures.some((f) => f.meta.caseId === '099-mermaid')).toBe(mermaidDiagramType === 'flowchart');
  });
});

describe('corpusToGenerateFixtures', () => {
  let corpusDir: string;

  beforeEach(() => {
    corpusDir = mkdtempSync(join(tmpdir(), 'accuracy-corpus-adapter-test-'));
    mkdirSync(join(corpusDir, 'descriptions'), { recursive: true });
  });

  afterEach(() => {
    rmSync(corpusDir, { recursive: true, force: true });
  });

  it('emits one fixture per description file, never a notation fixture', () => {
    writeFileSync(
      join(corpusDir, 'manifest.json'),
      JSON.stringify({
        'my-diagram': {
          source: { sourceUrl: 'synthetic-original' },
          descriptions: {
            review: {
              slug: 'my-diagram',
              reviews: [
                { descriptionFile: 'my-diagram.description-1.txt', accurate: true, complete: true, notes: 'note 1' },
                { descriptionFile: 'my-diagram.description-2.txt', accurate: true, complete: true, notes: 'note 2' },
                { descriptionFile: 'my-diagram.description-3.txt', accurate: true, complete: true, notes: 'note 3' },
              ],
            },
            files: ['my-diagram.description-1.txt', 'my-diagram.description-2.txt', 'my-diagram.description-3.txt'],
          },
          coral: { file: 'my-diagram.coral', conversionNotes: [] },
          knownDefects: { syntax: [], semantic: [] },
        },
      }),
    );
    writeFileSync(join(corpusDir, 'descriptions', 'my-diagram.description-1.txt'), 'Description one.\n');
    writeFileSync(join(corpusDir, 'descriptions', 'my-diagram.description-2.txt'), 'Description two.\n');
    writeFileSync(join(corpusDir, 'descriptions', 'my-diagram.description-3.txt'), 'Description three.\n');

    const fixtures = corpusToGenerateFixtures(corpusDir);

    expect(fixtures).toHaveLength(3);
    expect(fixtures.map((f) => f.meta.caseId)).toEqual([
      'my-diagram-generate-d1',
      'my-diagram-generate-d2',
      'my-diagram-generate-d3',
    ]);
    expect(fixtures.every((f) => f.meta.caseType === 'generate')).toBe(true);
    expect(fixtures[0].prompt).toBe('Description one.');
    expect(fixtures[0].meta.provenance).toBe('synthetic-original');
    expect(fixtures[0].meta.limitations).toBe('note 1');
  });

  it('returns an empty array when the corpus has no manifest.json yet', () => {
    expect(corpusToGenerateFixtures(join(corpusDir, 'does-not-exist'))).toEqual([]);
  });
});

describe('runHarness', () => {
  const matrix: RunMatrixEntry[] = [
    { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', samplingLabel: 'default' },
  ];

  function fakeResult(overrides: Partial<GenerateResult> = {}): GenerateResult {
    return { success: true, dsl: 'service "A" as a', retries: 0, driftDetected: false, ...overrides };
  }

  it('scores every fixture against every matrix entry with a configured key, filling in provider/model/samplingProfile', async () => {
    const fixture = loadFixture(baseMeta({ caseId: 'c1' }), 'Make a diagram');
    const generateFn = async () => fakeResult();

    const { scores, skipped, candidates } = await runHarness([fixture], matrix, { anthropic: 'sk-test' }, generateFn);

    expect(skipped).toEqual([]);
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({
      caseId: 'c1',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
      samplingProfile: 'default',
      valid: true,
    });
    expect(candidates).toEqual([expect.objectContaining({
      caseId: 'c1',
      provider: 'anthropic',
      candidateDsl: 'service "A" as a',
    })]);
  });

  it('skips a (fixture, matrix entry) pair with no configured API key, recording why', async () => {
    const fixture = loadFixture(baseMeta({ caseId: 'c1' }), 'Make a diagram');
    const generateFn = async () => fakeResult();

    const { scores, skipped, candidates } = await runHarness([fixture], matrix, {}, generateFn);

    expect(scores).toEqual([]);
    expect(candidates).toEqual([]);
    expect(skipped).toEqual([
      { caseId: 'c1', provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', samplingLabel: 'default', reason: 'no-api-key' },
    ]);
  });

  it('passes the run-matrix entry\'s sampling profile into the request config', async () => {
    const fixture = loadFixture(baseMeta({ caseId: 'c1' }), 'Make a diagram');
    let capturedConfig: LLMConfig | undefined;
    const generateFn = async (request: GenerateRequest) => {
      capturedConfig = request.config;
      return fakeResult();
    };
    const samplingMatrix: RunMatrixEntry[] = [
      { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', samplingLabel: 'high-temp', sampling: { temperature: 1 } },
    ];

    await runHarness([fixture], samplingMatrix, { anthropic: 'sk-test' }, generateFn);

    expect(capturedConfig?.sampling).toEqual({ temperature: 1 });
  });
});
