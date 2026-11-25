import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutSequence, notationRegistry, parseInstalledDocument028,
  projectInstalledSourceToSuccessor028, renderSvg,
  resolveSuccessorGraphNodes028, successorSourceDisplay028, symbolRegistry } from '../src/index.js';

interface SourceCase {
  id: string;
  notation: string;
  symbol: string;
  variant?: string;
  source: string;
}
const fixture = JSON.parse(readFileSync(new URL('./fixtures/catalog-explicit-source028.json', import.meta.url),
  'utf8')) as { schemaVersion: number; cases: SourceCase[] };

describe('pinned explicit-symbol source smoke inventory', () => {
  it('draws the selected UML actor or participant stencil when source type differs', () => {
    const actor = projectInstalledSourceToSuccessor028('@diagram uml-sequence\nprobe participant [symbol: "uml-actor"]\n');
    const participant = projectInstalledSourceToSuccessor028('@diagram uml-sequence\nprobe actor [symbol: "uml-participant"]\n');
    expect(actor.diagnostics).toEqual([]);
    expect(participant.diagnostics).toEqual([]);
    expect(renderSvg(successorSourceDisplay028(actor.graph!))).toContain('<circle');
    expect(renderSvg(successorSourceDisplay028(participant.graph!))).not.toContain('<circle');
    const actorDisplay = successorSourceDisplay028(actor.graph!);
    expect(layoutSequence(actorDisplay, { fontSettings: {
      default: { family: 'Inter', size: 12 },
      symbolOverrides: { participant: { size: 24 } },
    } }).participants[0].font.size).toBe(24);
    expect(layoutSequence(actorDisplay, { fontSettings: {
      default: { family: 'Inter', size: 12 },
      symbolOverrides: { 'uml-actor': { size: 20 }, participant: { size: 24 } },
    } }).participants[0].font.size).toBe(20);
  });

  it('names every installed base and variant exactly once', () => {
    const expected = symbolRegistry.getAll().filter((symbol) => !symbol.addedInEdition).flatMap((symbol) => [
      symbol.id, ...Object.keys(symbol.variants ?? {}).map((variant) => `${symbol.id}/${variant}`),
    ]).sort();
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.cases.map((candidate) => candidate.id).sort()).toEqual(expected);
    expect(new Set(fixture.cases.map((candidate) => candidate.id)).size).toBe(expected.length);
  });

  it.each(fixture.cases.filter((candidate) => candidate.notation !== 'erd'))(
    '$id parses, retains its explicit choice, and renders a production stencil',
    ({ notation, symbol, variant, source }) => {
      expect(notationRegistry.get(notation)?.symbols).toContain(symbol);
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      expect(projected.graph?.nodes).toMatchObject([{ id: 'probe', symbol,
        ...(variant ? { variant } : {}) }]);
      const interpreted = resolveSuccessorGraphNodes028(projected.graph!).get('probe');
      expect(interpreted).toMatchObject({ status: 'resolved', authoredSymbol: symbol,
        effectiveSymbolId: symbol,
        ...(variant ? { authoredVariant: variant, effectiveVariantId: variant } : {}) });
      const svg = renderSvg(successorSourceDisplay028(projected.graph!));
      if (notation === 'uml-sequence') {
        expect(svg).toContain('data-coral-sequence-participant="probe"');
        if (symbol === 'uml-actor') expect(svg).toContain('<circle');
      } else expect(svg).toContain('data-coral-part-id="probe:outline"');
    });

  it.each(fixture.cases.filter((candidate) => candidate.notation === 'erd'))(
    '$id remains exact saveable Chen text without semantic projection', ({ notation, symbol, source }) => {
      // Retained catalog inventory is distinct from an enabled document type.
      expect(notationRegistry.get(notation)?.symbols).toContain(symbol);
      const parsed = parseInstalledDocument028(source);
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(parsed.header.source).toBe(source);
      expect(parsed.header.diagnostics.map((item) => item.code))
        .toEqual(['header.diagram.disabled']);
      expect(projected.diagnostics.map((item) => item.code))
        .toEqual(['header.diagram.disabled']);
      expect(projected.graph).toBeUndefined();
    });
});
