import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { printSuccessorSource028 } from '../src/successorSourceWriter028.js';

const corpus = join(import.meta.dirname, '../../language/spec/conformance');
const manifest = JSON.parse(readFileSync(join(corpus, 'manifest.json'), 'utf8')) as {
  cases: Array<{ id: string; entryPoint: string; category: string; source: string; successorCanonical?: string }>;
};
const editionCases = manifest.cases.filter(({ entryPoint }) => entryPoint === 'saved-source-029');

describe('Edition 0.2.9 language conformance through the successor projection and writer', () => {
  it('has writer-canonical goldens to check', () => {
    expect(editionCases.filter(({ successorCanonical }) => successorCanonical).length).toBeGreaterThan(0);
  });

  it.each(editionCases.filter(({ category }) => category !== 'invalid').map(({ id, source }) => [id, source]))(
    '%s projects every definition without loss', (_id, path) => {
      const projected = projectInstalledSourceToSuccessor028(readFileSync(join(corpus, path), 'utf8'));
      expect(projected.diagnostics).toEqual([]);
      expect(projected.graph?.userSymbols029?.length).toBeGreaterThan(0);
    });

  it.each(editionCases.filter(({ successorCanonical }) => successorCanonical)
    .map(({ id, source, successorCanonical }) => [id, source, successorCanonical!]))(
    '%s prints its canonical golden and replays it unchanged', (_id, path, golden) => {
      const expected = readFileSync(join(corpus, golden), 'utf8');
      const graph = projectInstalledSourceToSuccessor028(readFileSync(join(corpus, path), 'utf8')).graph!;
      const printed = printSuccessorSource028(graph);
      expect(printed.diagnostics).toEqual([]);
      expect(printed.text).toBe(expected);
      const replayed = projectInstalledSourceToSuccessor028(expected);
      expect(replayed.graph).toEqual(graph);
      expect(printSuccessorSource028(replayed.graph!).text).toBe(expected);
    });
});
