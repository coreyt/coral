import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeDocumentSymbolDigest as computeUserSymbolDigest029,
  type DocumentSymbolDefinition as DocumentSymbolDefinition029 } from '@graph-ir/core';

interface DigestVector {
  name: string;
  covers: string[];
  description: string;
  sameDigestAs?: string;
  differentDigestFrom?: string;
  definition: DocumentSymbolDefinition029;
  canonicalInput?: string;
  digest?: string;
  error?: 'DOCUMENT_SYMBOL_DIGEST_UNCOMPUTABLE' | 'DOCUMENT_SYMBOL_DIGEST_INPUT_INVALID';
  path?: string;
}

// JSON.parse keeps -0 and lone surrogates, which the vectors rely on.
const fixtureUrl = new URL('./fixtures/user-symbol-digest-vectors.json', import.meta.url);
const readFixture = () => JSON.parse(readFileSync(fixtureUrl, 'utf8')) as { format: string; vectors: DigestVector[] };
const fixture = readFixture();
const vectors = fixture.vectors;
const computable = vectors.filter((vector) => vector.error === undefined);
const uncomputable = vectors.filter((vector) => vector.error === 'DOCUMENT_SYMBOL_DIGEST_UNCOMPUTABLE');
const refused = vectors.filter((vector) => vector.error === 'DOCUMENT_SYMBOL_DIGEST_INPUT_INVALID');
const byName = new Map(vectors.map((vector) => [vector.name, vector]));

describe('user-symbol digest vectors', () => {
  it('are uniquely named and each expects a digest or an error, never both', () => {
    expect(fixture.format).toBe('coral.user-symbol-digest-vectors');
    expect(byName.size).toBe(vectors.length);
    for (const vector of vectors) {
      expect(vector.error === undefined, vector.name).toBe(vector.digest !== undefined);
      expect(vector.canonicalInput === undefined, vector.name).toBe(vector.digest === undefined);
      if (vector.error !== undefined) {
        expect(['DOCUMENT_SYMBOL_DIGEST_UNCOMPUTABLE', 'DOCUMENT_SYMBOL_DIGEST_INPUT_INVALID']).toContain(vector.error);
      }
      expect(vector.path !== undefined, vector.name).toBe(vector.error === 'DOCUMENT_SYMBOL_DIGEST_INPUT_INVALID');
    }
  });

  it('cover every case the GraphIR digest rules call for', () => {
    const covered = new Set(vectors.flatMap((vector) => vector.covers));
    for (const category of [
      'baseline', 'digest-member', 'default-labelSide', 'default-outline', 'default-tint',
      'non-default-labelSide', 'non-default-tint', 'outline-rectangle', 'outline-rounded',
      'outline-ellipse', 'outline-diamond', 'port-anchor-omitted', 'port-anchor-explicit-auto',
      'port-properties', 'permutation-members', 'permutation-tags', 'permutation-anchors',
      'permutation-ports', 'tag-code-point-order', 'id-code-point-order', 'key-order',
      'unicode-non-bmp', 'unicode-combining', 'unicode-normalization', 'string-escapes',
      'numbers-integer', 'numbers-fraction', 'numbers-exponent', 'numbers-negative-zero',
      'numbers-extreme', 'anchor-boundary', 'anchor-interior', 'provenance', 'lone-surrogate',
      'control-characters', 'refused-empty-tags', 'refused-empty-anchors', 'refused-empty-ports',
      'refused-empty-provenance',
    ]) {
      expect(covered, category).toContain(category);
    }
  });

  it('keep the authored spellings that JSON reformatting would lose', () => {
    const anchors = byName.get('numbers-anchors')!.definition.anchors!;
    expect(Object.is(anchors[0]!.kind === 'boundary' && anchors[0]!.at, -0)).toBe(true);
    expect(byName.get('lone-high-surrogate-in-name')!.definition.name.isWellFormed()).toBe(false);
  });

  it.each(computable.map((vector) => [vector.name, vector] as const))(
    '%s: the expected digest is SHA-256 of the canonical input (node:crypto cross-check)', (_name, vector) => {
      const input = vector.canonicalInput!;
      expect(input.isWellFormed()).toBe(true);
      expect(vector.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(vector.digest).toBe(`sha256:${createHash('sha256').update(input, 'utf8').digest('hex')}`);
    });

  it('relate digests exactly as each vector declares', () => {
    for (const vector of computable) {
      if (vector.sameDigestAs) expect(vector.digest, vector.name).toBe(byName.get(vector.sameDigestAs)!.digest);
      if (vector.differentDigestFrom) {
        const other = byName.get(vector.differentDigestFrom)!;
        expect(other.digest, vector.name).toBeDefined();
        expect(vector.digest, vector.name).not.toBe(other.digest);
      }
    }
    expect(new Set(computable.filter((vector) => !vector.sameDigestAs).map((vector) => vector.digest)).size)
      .toBe(computable.filter((vector) => !vector.sameDigestAs).length);
  });
});

describe('core computeDocumentSymbolDigest, the only digest Coral uses', () => {
  it.each(computable.map((vector) => [vector.name, vector] as const))(
    '%s: reproduces the canonical input and digest', (_name, vector) => {
      expect(computeUserSymbolDigest029(vector.definition)).toEqual({
        ok: true,
        input: vector.canonicalInput,
        digest: vector.digest,
      });
    });

  it.each(uncomputable.map((vector) => [vector.name, vector] as const))(
    '%s: reports DOCUMENT_SYMBOL_DIGEST_UNCOMPUTABLE', (_name, vector) => {
      const result = computeUserSymbolDigest029(vector.definition);
      expect(result).toMatchObject({ ok: false, code: 'DOCUMENT_SYMBOL_DIGEST_UNCOMPUTABLE' });
      expect(result.ok === false && result.detail).toMatch(/surrogate/i);
    });

  it.each(refused.map((vector) => [vector.name, vector] as const))(
    '%s: refuses the schema-invalid input before computing a digest', (_name, vector) => {
      const result = computeUserSymbolDigest029(vector.definition);
      expect(result).toMatchObject({ ok: false, code: 'DOCUMENT_SYMBOL_DIGEST_INPUT_INVALID', path: vector.path });
      expect(result).not.toHaveProperty('digest');
    });

  it('accepts a definition without its digest member', () => {
    const { digest, ...withoutDigest } = byName.get('full')!.definition;
    expect(computeUserSymbolDigest029(withoutDigest)).toMatchObject({ ok: true, digest });
  });

  it('never mutates the definition it hashes', () => {
    // A fresh parse, so that no earlier test can have hidden a mutation.
    for (const vector of readFixture().vectors) {
      const before = structuredClone(vector.definition);
      computeUserSymbolDigest029(vector.definition);
      expect(vector.definition, vector.name).toEqual(before);
    }
  });
});
