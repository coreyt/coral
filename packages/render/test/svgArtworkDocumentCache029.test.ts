import { describe, expect, it } from 'vitest';
import { admitSvgArtwork029 } from '../src/artwork/svgArtworkAdmission029.js';
import { BoundedCache029 } from '../src/artwork/svgArtworkCache029.js';
import { parseInstalledDocument028 } from '../src/installedDocument028.js';
import { documentCatalog029 } from '../src/documentCatalog029.js';
import { CALIBRATION_ARTWORKS_029, calibrationDocument029 } from './fixtures/svgArtworkCalibration029.js';

// G-40: a legal document must retain its admitted results while source and
// canonical forms are visited, rather than thrash on every editor phase.
describe('admission reuse at GraphIR document limits', () => {
  it.each([
    ['definition count', 256, CALIBRATION_ARTWORKS_029.typical],
    ['artwork bytes', 19, CALIBRATION_ARTWORKS_029.detailed],
  ] as const)('retains the %s document through canonical visits', (_name, count, artwork) => {
    const texts = Array.from({ length: count }, (_, index) => artwork(index));
    const results = texts.map((text) => admitSvgArtwork029(text));
    expect(results.every((result) => result.ok)).toBe(true);
    const canonical = results.map((result) => {
      if (!result.ok) throw new Error('Fixture artwork must be admitted');
      return result.artwork.canonicalText;
    });
    expect(canonical.reduce((bytes, text) => bytes + Buffer.byteLength(text), 0)).toBeLessThanOrEqual(4_194_304);
    const canonicalResults = canonical.map((text) => admitSvgArtwork029(text));
    for (const [index, text] of texts.entries()) expect(admitSvgArtwork029(text) === results[index]).toBe(true);
    for (const [index, text] of canonical.entries()) expect(admitSvgArtwork029(text) === canonicalResults[index]).toBe(true);
    const source = calibrationDocument029(texts, count);
    const first = parseInstalledDocument028(source);
    const second = parseInstalledDocument028(source);
    expect(first.definitions).toHaveLength(count);
    expect(second.definitions).toHaveLength(count);
    for (const document of [first, second]) {
      const catalog = documentCatalog029('architecture', document.definitions!);
      for (const definition of document.definitions!) {
        const admitted = first.artwork!.get(definition.id);
        expect(admitted).toBeDefined();
        expect(document.artwork!.get(definition.id) === admitted).toBe(true);
        expect(catalog.userSymbols.get(definition.symbolId)?.artwork029 === admitted).toBe(true);
      }
    }
  });
});

describe('admission cache bounds', () => {
  it('refreshes hits and evicts the least recently used entry at the count bound', () => {
    const cache = new BoundedCache029<string>(2, 10);
    cache.set('a', 'A', 1); cache.set('b', 'B', 1);
    expect(cache.get('a')).toBe('A');
    cache.set('c', 'C', 1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('A');
    expect(cache.get('c')).toBe('C');
  });
  it('enforces retained bytes, updates existing costs and refuses oversized entries', () => {
    const cache = new BoundedCache029<string>(10, 3);
    cache.set('a', 'A', 2); cache.set('b', 'B', 2);
    expect(cache.get('a')).toBeUndefined();
    cache.set('b', 'small', 1); cache.set('c', 'C', 2);
    cache.set('huge', 'huge', 4);
    expect(cache.get('b')).toBe('small');
    expect(cache.get('c')).toBe('C');
    expect(cache.get('huge')).toBeUndefined();
  });
});
