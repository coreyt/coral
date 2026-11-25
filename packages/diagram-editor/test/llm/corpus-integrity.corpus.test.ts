import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseMermaid } from '@coral-viz/language';
import { parseCoralDSL } from '../../src/parsers';
import { writeCorpusSource028 } from './corpus-source-028';
import type { DescriptionReview, SourceMeta } from './build-corpus';
import { validateSemanticCorpus } from './validate-semantic-corpus';

const CORPUS_DIR = join(__dirname, 'fixtures/corpus');
const RAW_DIR = join(CORPUS_DIR, 'raw');
const DESCRIPTION_DIR = join(CORPUS_DIR, 'descriptions');
const CORAL_DIR = join(CORPUS_DIR, 'coral');

describe('the real Slice 49 corpus integrity audit', () => {
  const sources = readdirSync(RAW_DIR).filter((file) => file.endsWith('.source.json')).sort();

  it('audits all 27 retained corpus sources', () => {
    expect(sources).toHaveLength(27);
  });

  it.each(sources)('proves %s provenance, exact counts, reviews and derived Coral freshness', (sourceFile) => {
    const slug = sourceFile.replace(/\.source\.json$/, '');
    const source: SourceMeta = JSON.parse(readFileSync(join(RAW_DIR, sourceFile), 'utf8'));
    const review: DescriptionReview = JSON.parse(
      readFileSync(join(DESCRIPTION_DIR, `${slug}.description-review.json`), 'utf8'),
    );
    const mermaid = readFileSync(join(RAW_DIR, `${slug}.mmd`), 'utf8');
    const parsed = parseMermaid(mermaid);

    expect(source).toMatchObject({
      slug,
      sourceUrl: 'synthetic-original',
      license: 'synthetic-original',
    });
    expect(source.attribution?.trim().length, `${slug}: attribution`).toBeGreaterThan(0);
    expect(parsed.graph, `${slug}: Mermaid graph`).toBeDefined();
    expect(parsed.graph!.nodes).toHaveLength(source.nodeCount);
    expect(parsed.graph!.edges).toHaveLength(source.edgeCount);

    expect(review.slug).toBe(slug);
    expect(review.reviews).toHaveLength(3);
    for (const entry of review.reviews) {
      expect(entry).toMatchObject({ accurate: true, complete: true });
      expect(entry.notes.trim().length, `${slug}: review notes`).toBeGreaterThan(0);
      expect(readFileSync(join(DESCRIPTION_DIR, entry.descriptionFile), 'utf8').trim().length).toBeGreaterThan(0);
    }

    const sourceText = writeCorpusSource028(parsed.graph!);
    expect(sourceText).toMatch(/^@diagram /);
    expect(sourceText).not.toContain('@graph');
    expect(readFileSync(join(CORAL_DIR, `${slug}.coral`), 'utf8')).toBe(sourceText);
  });

  it('keeps deliberate syntax defects separate and rejected by the production source reader', () => {
    const syntaxDir = join(CORPUS_DIR, 'defects/syntax');
    for (const file of readdirSync(syntaxDir).filter(file => file.endsWith('.coral'))) {
      const text = readFileSync(join(syntaxDir, file), 'utf8');
      expect(parseCoralDSL(text).errors.length, file).toBeGreaterThan(0);
    }
  });

  it('keeps all retained reviewed semantic mutations non-empty and structurally valid', () => {
    const result = validateSemanticCorpus(CORPUS_DIR);
    expect(result.failures).toEqual([]);
    expect(Object.values(result.recordsBySlug).flat()).toHaveLength(27);
  });
});
