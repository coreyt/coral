import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256Hex028 } from '../src/catalogDigest028.js';
import { glyphRegistry } from '../src/glyphs/index.js';
import { HEADER_MANIFEST_028 } from '../../language/src/parser/header-manifest028.js';
import { getNotation, notationCatalogIdentity028, notationCatalogIdentity0214, notationRegistry } from '../src/notations/index.js';
import { getAllShapes } from '../src/shapes/index.js';
import { getAllSymbols } from '../src/symbols/index.js';
import { symbolRegistry } from '../src/symbols/index.js';

describe('installed 0.2.8 catalog identity', () => {
  it('matches every source-header catalog pin to the exact installed snapshot', () => {
    expect(Object.keys(HEADER_MANIFEST_028['0.2.8']!).sort()).toEqual(
      notationRegistry.getAll().filter((notation) => notation.id !== 'infrastructure').map((notation) => notation.id).sort());
    for (const [diagramType, edition] of Object.entries(HEADER_MANIFEST_028['0.2.8']!)) {
      const identity = notationCatalogIdentity028(diagramType);
      expect(identity, diagramType).toBeDefined();
      expect(identity).toEqual(edition.catalogs.find((item) => item.version === edition.defaults[1]));
    }
    for (const [diagramType, edition] of Object.entries(HEADER_MANIFEST_028['0.2.14']!)) {
      const identity = notationCatalogIdentity0214(diagramType);
      expect(identity, `0.2.14:${diagramType}`).toBeDefined();
      expect(identity).toEqual(edition.catalogs.find((item) => item.version === edition.defaults[1]));
    }
    expect(Object.isFrozen(HEADER_MANIFEST_028)).toBe(true);
    expect(Object.isFrozen(HEADER_MANIFEST_028['0.2.8']!.flowchart!.catalogs[0])).toBe(true);
  });
  it.each(['', 'abc', 'Coral 🪸', 'a'.repeat(56), 'a'.repeat(120)])(
    'matches the platform SHA-256 implementation for %j', (value) => {
      expect(sha256Hex028(value)).toBe(createHash('sha256').update(value).digest('hex'));
    });

  it('uses a full content digest rather than a 32-bit collision-prone fingerprint', () => {
    const identity = notationCatalogIdentity028('architecture');
    expect(identity?.digest).toMatch(/^sha256-[0-9a-f]{64}$/);
    expect(notationCatalogIdentity028('architecture')).toEqual(identity);
  });

  it('binds the identity to the shapes and glyphs used by the installed stencil catalog', () => {
    const notation = getNotation('sketch')!;
    const symbols = [...getAllSymbols()].filter((s) => !s.addedInEdition).sort((a, b) => a.id.localeCompare(b.id));
    const shapes = [...getAllShapes()].filter((s) => !s.addedInEdition).sort((a, b) => a.id.localeCompare(b.id));
    const glyphs = glyphRegistry.getAll().filter((g) => !g.addedInEdition).sort((a, b) => a.id.localeCompare(b.id));
    const typeSymbols = notation.symbols.map((id) => [id, id]).sort(([a], [b]) => a.localeCompare(b));
    const expected = `sha256-${createHash('sha256').update(JSON.stringify({ notation, symbols,
      shapes, glyphs, typeSymbols })).digest('hex')}`;
    expect(notationCatalogIdentity028('sketch')?.digest).toBe(expected);
  });

  it('changes the exact catalog digest when a named stencil anchor changes', () => {
    const notation = { ...getNotation('sketch')! };
    const symbols = getAllSymbols();
    const first = symbols[0]!;
    vi.spyOn(notationRegistry, 'get').mockReturnValue(notation);
    const getAll = vi.spyOn(symbolRegistry, 'getAll');
    try {
      getAll.mockReturnValue(symbols.map((symbol) => symbol === first
        ? { ...symbol, namedAnchors: [{ id: 'rim', side: 'EAST', position: 0.25 }] } : symbol));
      const pinned = notationCatalogIdentity028('sketch')?.digest;
      expect(notationCatalogIdentity028('sketch')?.digest).toBe(pinned);
      getAll.mockReturnValue(symbols.map((symbol) => symbol === first
        ? { ...symbol, namedAnchors: [{ id: 'rim', side: 'EAST', position: 0.75 }] } : symbol));
      expect(notationCatalogIdentity028('sketch')?.digest).not.toBe(pinned);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('keeps stencil and glyph contents immutable after their digest is cached', () => {
    const shape = getAllShapes()[0]!;
    const glyph = glyphRegistry.getAll()[0]!;
    expect(Object.isFrozen(getAllShapes())).toBe(true);
    expect(Object.isFrozen(shape)).toBe(true);
    expect(Object.isFrozen(shape.portAnchors)).toBe(true);
    expect(Object.isFrozen(shape.portAnchors[0])).toBe(true);
    expect(Object.isFrozen(glyph)).toBe(true);
    expect(Object.isFrozen(glyph.paths)).toBe(true);
    expect(Object.isFrozen(glyph.paths[0])).toBe(true);
  });
});
