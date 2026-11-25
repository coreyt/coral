import { describe, expect, it } from 'vitest';
import * as symbols from '../src/symbols/index.js';
import type { SymbolLibrary } from '../src/types.js';

const normalize = (name: string) => name.trim().toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

describe('current renderer name-tag contract', () => {
  it('indexes every installed definition by full name without changing its pinned tags', () => {
    const definitions = symbols.getAllLibraries().flatMap((library) => library.symbols);
    const catalog = symbols.getSymbolCatalog();
    expect(symbols.getAllSymbols()).toEqual(definitions);
    expect(new Set(definitions.map((symbol) => symbol.id)).size).toBe(definitions.length);
    for (const symbol of definitions) {
      expect(new Set(symbol.tags).size, symbol.id).toBe(symbol.tags.length);
      for (const tag of symbol.tags) expect(tag, symbol.id).toBe(tag.trim().toLowerCase());
      expect(symbols.getSymbol(symbol.id)).toBe(symbol);
      const base = catalog.find((entry) => entry.symbolId === symbol.id && entry.variantKey === undefined);
      expect(base?.tags, symbol.id).toContain(normalize(symbol.name));
      expect(symbols.searchSymbols(symbol.name)).toContainEqual({ symbolId: symbol.id, variantKey: undefined });
    }
  });

  it('rejects duplicate symbol IDs within and across libraries', () => {
    const original = symbols.getAllLibraries()[0];
    const duplicate = { ...original.symbols[0], name: 'Conflicting Name' };
    expect(() => symbols.createSymbolRegistry([
      { ...original, symbols: [original.symbols[0], duplicate] },
    ])).toThrow(/duplicate symbol id/i);
    expect(() => symbols.createSymbolRegistry([
      original, { ...original, id: 'other-library', symbols: [duplicate] },
    ])).toThrow(/duplicate symbol id/i);
  });

  it('catalogs every named variant as a selectable reference without changing keys', () => {
    const catalog = symbols.getSymbolCatalog();
    const definitions = symbols.getAllSymbols();
    const variantCount = definitions.reduce((total, symbol) =>
      total + Object.keys(symbol.variants ?? {}).length, 0);
    expect(catalog).toHaveLength(definitions.length + variantCount);
    for (const entry of catalog) {
      expect(new Set(entry.tags).size).toBe(entry.tags.length);
      for (const tag of entry.tags) expect(tag).toBe(tag.trim().toLowerCase());
    }
    for (const symbol of definitions) {
      for (const [variantKey, variant] of Object.entries(symbol.variants ?? {})) {
        const entry = catalog.find((candidate) =>
          candidate.symbolId === symbol.id && candidate.variantKey === variantKey);
        expect(entry?.name).toBe(variant.name);
        expect(entry?.tags).toContain(normalize(variant.name));
        expect(symbols.searchSymbols(variant.name)).toContainEqual({ symbolId: symbol.id, variantKey });
        expect(symbols.getSymbol(entry!.symbolId)?.variants?.[entry!.variantKey!]).toBe(variant);
      }
    }
  });

  it('preserves colliding name matches in stable ID/key order', () => {
    const expected = symbols.getAllSymbols().flatMap((symbol) =>
      Object.entries(symbol.variants ?? {}).filter(([, variant]) => normalize(variant.name) === 'annotation')
        .map(([variantKey]) => ({ symbolId: symbol.id, variantKey })));
    // A current base-name collision also exercises the shared-name search path.
    const annotationBases = symbols.getAllSymbols().filter((symbol) => symbol.tags.includes('annotation'))
      .map((symbol) => ({ symbolId: symbol.id, variantKey: undefined }));
    expect(annotationBases.length).toBeGreaterThan(1);
    const results = symbols.searchSymbols('  ANNOTATION!!! ');
    for (const match of [...expected, ...annotationBases]) expect(results).toContainEqual(match);
    const keys = results.map((entry) => `${entry.symbolId}\0${entry.variantKey ?? ''}`);
    expect(keys).toEqual([...keys].sort());
    expect(symbols.searchSymbols('annotation')).toEqual(results);
    expect(new Set(keys).size).toBe(keys.length);
    expect(symbols.searchSymbols('not-a-real-symbol-name')).toEqual([]);
    expect(symbols.searchSymbols(' !!! ')).toEqual([]);
  });

  it('preserves every colliding variant name without leaking it into base tags', () => {
    const matches = symbols.getAllSymbols().flatMap((symbol) =>
      Object.entries(symbol.variants ?? {}).filter(([, variant]) => normalize(variant.name) === 'stream')
        .map(([variantKey]) => ({ symbolId: symbol.id, variantKey })));
    expect(matches.length).toBeGreaterThan(1);
    const results = symbols.searchSymbols(' STREAM ');
    for (const match of matches) {
      expect(results).toContainEqual(match);
      expect(symbols.getSymbol(match.symbolId)?.tags).not.toContain('stream');
      expect(symbols.getSymbolsByTag('stream')).not.toContain(symbols.getSymbol(match.symbolId));
    }
    const inherited = symbols.getAllSymbols().filter((symbol) => symbol.tags.includes('stream'))
      .flatMap((symbol) => [
        { symbolId: symbol.id, variantKey: undefined as string | undefined },
        ...Object.keys(symbol.variants ?? {}).map((variantKey) => ({ symbolId: symbol.id, variantKey })),
      ]);
    const expected = [...matches, ...inherited].sort((a, b) => {
      const left = `${a.symbolId}\0${a.variantKey ?? ''}`;
      const right = `${b.symbolId}\0${b.variantKey ?? ''}`;
      return left < right ? -1 : left > right ? 1 : 0;
    });
    expect(results).toEqual(expected);
  });

  it('keeps catalog metadata isolated from callers', () => {
    const catalog = symbols.getSymbolCatalog();
    catalog[0].tags.push('caller-only');
    catalog[0].name = 'Caller Rename';
    expect(symbols.searchSymbols('caller-only')).toEqual([]);
    expect(symbols.getSymbolCatalog()[0].name).not.toBe('Caller Rename');
  });

  it('uses explicit library membership even when a discovery tag names another notation', () => {
    const candidate = { ...symbols.getAllSymbols()[0], id: 'fixture-discovery', tags: ['bpmn'] };
    const fixture: SymbolLibrary = { id: 'fixture', name: 'Fixture', version: '1', symbols: [candidate] };
    const registry = symbols.createSymbolRegistry([fixture]);
    expect(registry.getByTag('bpmn')).toEqual([candidate]);
    expect(registry.getByNotation('bpmn')).toEqual([]);
    expect(registry.getByNotation('fixture')).toEqual([candidate]);
    expect(registry.getByTag(' BPMN ')).toEqual([]);
    for (const library of symbols.getAllLibraries()) {
      expect(symbols.getSymbolsForNotation(library.id)).toBe(library.symbols);
    }
  });
});
