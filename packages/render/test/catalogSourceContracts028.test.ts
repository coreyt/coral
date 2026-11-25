import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSequenceScene028, prepareSpatialScene028 } from '../src/svg/serialize.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplayWithSemanticPorts028, successorSourceDisplay028 }
  from '../src/successorSourceDisplay028.js';
import { resolveSuccessorGraphNodes028 } from '../src/successorInterpretation028.js';
import { symbolRegistry } from '../src/symbols/index.js';
import { approvedNotationTypeWords028 } from '../src/notations/index.js';
import { parseInstalledDocument028 } from '../src/installedDocument028.js';
import { sourceSemanticCapabilityNotices028 } from '../src/sourceSemanticCapabilities028.js';

interface SourceContract {
  id: string; notation: string; symbol: string; variant?: string;
  sourceType: string; explicitSymbol: boolean; source: string;
  expectedCapabilityNotice?: string;
}
const fixture = JSON.parse(readFileSync(new URL(
  './fixtures/catalog-source-contracts028.json', import.meta.url), 'utf8')) as {
  schemaVersion: number; cases: SourceContract[];
};

describe('installed catalog source and scene contracts', () => {
  it('covers every installed base and variant without inventing author type words', () => {
    const installed = symbolRegistry.getAll().filter((symbol) => !symbol.addedInEdition).flatMap((symbol) => [symbol.id,
      ...Object.keys(symbol.variants ?? {}).map((variant) => `${symbol.id}/${variant}`)]).sort();
    expect(fixture.cases.map(({ id }) => id).sort()).toEqual(installed);
    expect(new Set(fixture.cases.map(({ id }) => id)).size).toBe(installed.length);
    for (const row of fixture.cases) {
      if (row.explicitSymbol) expect(row.sourceType).toBe('group');
      else expect(approvedNotationTypeWords028(row.notation)).toContain(row.sourceType);
    }
  });

  it.each(fixture.cases)('$id preserves its active or research-only source contract', async (row) => {
    const projected = projectInstalledSourceToSuccessor028(row.source);
    if (row.notation === 'erd') {
      // Keep the installed research inventory complete without advertising a
      // disabled source profile as a supported production scene.
      const document = parseInstalledDocument028(row.source);
      expect(document.header.source).toBe(row.source);
      expect(document.graph).toBeUndefined();
      expect(projected.graph).toBeUndefined();
      expect(projected.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'header.diagram.disabled' }),
      ]));
      const disabled = document.header.diagnostics.find((item) => item.code === 'header.diagram.disabled')!;
      expect(row.source.slice(disabled.range!.start.offset, disabled.range!.end.offset)).toBe('erd');
      return;
    }
    expect(projected.diagnostics).toEqual([]);
    const source = projected.graph!;
    const syntax = parseInstalledDocument028(row.source).syntax;
    const notices = sourceSemanticCapabilityNotices028(source,
      syntax.statements.filter((item) => item.kind === 'node'),
      syntax.statements.filter((item) => item.kind === 'edge'));
    if (row.expectedCapabilityNotice) {
      expect(notices).toMatchObject([{ severity: 'warning', code: row.expectedCapabilityNotice,
        subject: { kind: 'node', id: 'probe' } }]);
      const range = notices[0]!.range!;
      const token = row.explicitSymbol ? JSON.stringify(row.symbol) : row.sourceType;
      expect(row.source.slice(range.start.offset, range.end.offset)).toBe(token);
      expect(range.start.line).toBe(2);
      expect(range.start.offset).toBe(row.source.indexOf(token));
    } else expect(notices).toEqual([]);
    expect(source.nodes).toHaveLength(1);
    expect(source.nodes[0]).toMatchObject({ id: 'probe', type: row.sourceType,
      label: 'Contract probe', ...(row.explicitSymbol ? { symbol: row.symbol } : {}),
      ...(row.variant ? { variant: row.variant } : {}) });
    expect(source.nodes[0]!.symbol).toBe(row.explicitSymbol ? row.symbol : undefined);
    expect(source.nodes[0]!.variant).toBe(row.variant);
    expect(source.nodes[0]!.semanticPorts).toBeUndefined();
    expect(source.edges).toEqual([]);
    const before = JSON.stringify(source);
    const interpreted = resolveSuccessorGraphNodes028(source).get('probe')!;
    expect(interpreted).toMatchObject({ status: 'resolved', effectiveSymbolId: row.symbol });
    expect(interpreted.effectiveVariantId).toBe(row.variant);
    for (const style of ['lowfi', 'hifi'] as const) for (const theme of ['light', 'dark'] as const) {
      const options = { style, theme, notation: row.notation, successorSource: source };
      const scene = row.notation === 'uml-sequence'
        ? prepareSequenceScene028(successorSourceDisplay028(source), options)
        : await (async () => {
          const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(source);
          const laid = await layoutGraphForSvg(display, { svgOptions: options, semanticInterpretations });
          return prepareSpatialScene028(laid, { ...options, semanticGraph: display,
            edgeRoutes: laid.edgeRoutes });
        })();
      expect(scene.status).toBe('complete');
      expect(scene.semantic.sourceKind).toBe('successor-source');
      expect(scene.semantic.successorSource).toEqual(source);
      expect(scene.semantic.successorSource?.nodes[0]!.type).toBe(row.sourceType);
      expect(JSON.stringify(source)).toBe(before);
    }
  });
});
