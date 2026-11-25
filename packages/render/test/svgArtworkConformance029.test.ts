import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { admitSvgArtwork029 } from '../src/index.js';

// Runs the coral.svg-artwork profile 1 admitter over every conformance vector
// (profile §14). The structure test checks vector shape; this test checks
// outcomes. A mismatch is resolved in the profile and vectors, never by
// special-casing the admitter (profile §15 item 2).

const vectorsUrl = new URL('../spec/svg-artwork-1/vectors/', import.meta.url);

type Part = string | { repeat: string; count: number };
type Expect =
  | { result: 'admitted'; tier: 'standard' | 'detailed'; inputIsCanonical: boolean; canonical?: string;
    canonicalParts?: Part[]; bytes?: number }
  | { result: 'refused'; codes: string[]; budgets?: string[] };
interface Vector { id: string; input?: string; inputParts?: Part[]; expect: Expect }

const readJson = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, vectorsUrl), 'utf8')) as T;
const expand = (text: string | undefined, parts: Part[] | undefined): string =>
  text ?? parts!.map((part) => typeof part === 'string' ? part : part.repeat.repeat(part.count)).join('');

const manifest = readJson<{ files: string[] }>('manifest.json');
const vectors = manifest.files.flatMap((file) =>
  readJson<{ vectors: Vector[] }>(file).vectors.map((vector) => ({ file, vector })));

// Stages enable vectors as the admitter grows: ingress and parse (P1, P2),
// then vocabulary through geometry (P3-P6), then admission and budgets (P7).
const INGRESS_PARSE_BUDGETS = new Set(['input.bytes', 'input.elements', 'nesting']);
const P7_BUDGETS = new Set(['bytes', 'elements', 'segments']);
function stage(expected: Expect): 'parse' | 'refusal' | 'admission' {
  if (expected.result === 'admitted') return 'admission';
  if (expected.budgets?.every((name) => P7_BUDGETS.has(name))) return 'admission';
  if (expected.codes.every((code) => code === 'coral.artwork.svg.parse') ||
    expected.budgets?.every((name) => INGRESS_PARSE_BUDGETS.has(name))) return 'parse';
  return 'refusal';
}
const ENABLED_STAGES = new Set(['parse', 'refusal', 'admission']);

describe('coral.svg-artwork 1 conformance vectors', () => {
  it('has every vector', () => {
    expect(vectors.length).toBeGreaterThan(200);
  });

  for (const { file, vector } of vectors) {
    if (!ENABLED_STAGES.has(stage(vector.expect))) continue;
    it(`${file} ${vector.id}`, () => {
      const input = expand(vector.input, vector.inputParts);
      const result = admitSvgArtwork029(input);
      const expected = vector.expect;
      if (expected.result === 'refused') {
        expect(result.ok, JSON.stringify(result.ok ? result.artwork.canonicalText.slice(0, 400) : null)).toBe(false);
        if (result.ok) return;
        const codes = [...new Set(result.failures.map((failure) => failure.code))];
        expect(codes, JSON.stringify(result.failures.slice(0, 5))).toEqual(expected.codes);
        const budgets = result.failures.flatMap((failure) => failure.budgets?.map((budget) => budget.name) ?? []);
        expect(budgets).toEqual(expected.budgets ?? []);
        for (const failure of result.failures) {
          expect(failure.start).toBeGreaterThanOrEqual(0);
          expect(failure.end).toBeLessThanOrEqual(input.length);
          expect(failure.start).toBeLessThanOrEqual(failure.end);
        }
        return;
      }
      expect(result.ok, JSON.stringify(result.ok ? null : result.failures.slice(0, 5))).toBe(true);
      if (!result.ok) return;
      const canonical = expand(expected.canonical, expected.canonicalParts);
      expect(result.artwork.canonicalText).toBe(canonical);
      expect(result.artwork.tier).toBe(expected.tier);
      expect(result.artwork.inputIsCanonical).toBe(expected.inputIsCanonical);
      expect(result.artwork.measures.bytes).toBe(new TextEncoder().encode(canonical).length);
      if (expected.bytes !== undefined) expect(result.artwork.measures.bytes).toBe(expected.bytes);
      // Canonical text is admissible and is its own canonical form (profile §1 item 5).
      const again = admitSvgArtwork029(canonical);
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(again.artwork.canonicalText).toBe(canonical);
      expect(again.artwork.inputIsCanonical).toBe(true);
      expect(again.artwork.tier).toBe(expected.tier);
    });
  }
});
