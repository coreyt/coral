/**
 * TDD coverage for `injectDefectsForCorpus` (Slice 49, R-049.5 AC-4) using a
 * small synthetic temp corpus, independent of the retained diagram corpus.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '@coral-viz/language/parser';
import { injectDefectsForCorpus } from './inject-corpus-defects';

let dir: string;

const RICH_DSL =
  'service "API Gateway" as gw\n' +
  'database "Orders DB" as db data { "description": "us-east", "variant": "hot" }\n' +
  'gw -> db [dashed, label: "writes"]\n';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'coral-inject-test-'));
  mkdirSync(join(dir, 'coral'), { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('injectDefectsForCorpus', () => {
  it('starts from a base diagram that parses clean, so every error is an injected defect', () => {
    expect(parse(RICH_DSL).diagnostics).toEqual([]);
  });

  it('injects every available catalog type for a rich diagram and writes .coral + .meta.json pairs', () => {
    writeFileSync(join(dir, 'coral', 'rich.coral'), RICH_DSL, 'utf8');

    const { recordsBySlug, lowInjectableCount } = injectDefectsForCorpus(dir);

    expect(recordsBySlug.rich.length).toBeGreaterThanOrEqual(3);
    expect(lowInjectableCount).toEqual([]);

    for (const record of recordsBySlug.rich) {
      const coralPath = join(dir, 'defects', 'syntax', record.outputFile);
      const metaPath = coralPath.replace(/\.coral$/, '.meta.json');
      expect(existsSync(coralPath)).toBe(true);
      expect(existsSync(metaPath)).toBe(true);

      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      expect(meta.originalFilename).toBe('rich.coral');
      expect(meta.originalDsl).toBe(RICH_DSL);
      expect(meta.injectedDefects).toHaveLength(1);
      expect(meta.injectedDefects[0].defectType).toBe(record.defectType);
      expect(meta.outputFilename).toBe(record.outputFile);
      expect(meta.outputText).toBeUndefined();

      const outputText = readFileSync(coralPath, 'utf8');
      expect(outputText).not.toBe(RICH_DSL);
    }
  });

  it('records slugs with fewer than three injectable types instead of forcing an injection', () => {
    // A file with no matchable node/edge declarations at all (an edge case
    // no real corpus diagram should hit, but the fallback must still be
    // correct rather than throwing) has zero candidates in either pool.
    writeFileSync(join(dir, 'coral', 'bare.coral'), '\n', 'utf8');

    const { recordsBySlug, lowInjectableCount } = injectDefectsForCorpus(dir);

    expect(recordsBySlug.bare).toEqual([]);
    expect(lowInjectableCount).toEqual([{ slug: 'bare', availableCount: 0 }]);
  });

  it('is deterministic: re-running over the same corpus produces byte-identical output', () => {
    writeFileSync(join(dir, 'coral', 'rich.coral'), RICH_DSL, 'utf8');

    const first = injectDefectsForCorpus(dir);
    const firstFiles = first.recordsBySlug.rich.map((r) => readFileSync(join(dir, 'defects', 'syntax', r.outputFile), 'utf8'));
    const second = injectDefectsForCorpus(dir);
    const secondFiles = second.recordsBySlug.rich.map((r) => readFileSync(join(dir, 'defects', 'syntax', r.outputFile), 'utf8'));

    expect(second).toEqual(first);
    expect(secondFiles).toEqual(firstFiles);
  });

  it('does not rewrite unchanged defect files and replaces changed ones by rename', () => {
    writeFileSync(join(dir, 'coral', 'rich.coral'), RICH_DSL, 'utf8');
    const { recordsBySlug } = injectDefectsForCorpus(dir);
    const syntaxDir = join(dir, 'defects', 'syntax');
    const [unchanged, changed] = recordsBySlug.rich.map((record) => join(syntaxDir, record.outputFile));
    const past = new Date('2020-01-01T00:00:00Z');
    utimesSync(unchanged, past, past);
    utimesSync(unchanged.replace(/\.coral$/, '.meta.json'), past, past);
    writeFileSync(changed, 'stale\n', 'utf8');
    const staleInode = statSync(changed).ino;
    const before = readdirSync(syntaxDir).sort();

    injectDefectsForCorpus(dir);

    expect(statSync(unchanged).mtimeMs).toBe(past.getTime());
    expect(statSync(unchanged.replace(/\.coral$/, '.meta.json')).mtimeMs).toBe(past.getTime());
    expect(readFileSync(changed, 'utf8')).not.toBe('stale\n');
    expect(statSync(changed).ino).not.toBe(staleInode);
    expect(readdirSync(syntaxDir).sort()).toEqual(before);
  });
});
