import { describe, expect, it } from 'vitest';
import { resolveNodeInterpretation028, type CatalogSnapshot028,
  type SymbolDefinition } from '@coral-viz/render';
import { effectiveInterpretedPorts028 } from '../src/compatibility/effectivePorts.js';

describe('canvas projection of a named semantic-port pin', () => {
  it('uses the same fixed visible-contour point as layout under RIGHT and DOWN flow', () => {
    const symbol: SymbolDefinition = { id: 'decision', name: 'Decision', shape: 'diamond', tags: [],
      namedAnchors: [{ id: 'reviewRim', side: 'EAST', position: 0.25 }] };
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map([[symbol.id, symbol]]),
      allowedSymbolIds: new Set([symbol.id]), typeSymbols: new Map([['decision', symbol.id]]) };
    const interpretation = resolveNodeInterpretation028({ id: 'a', type: 'decision',
      authoredPorts: [{ id: 'out', direction: 'out', anchor: { kind: 'symbol', id: 'reviewRim' } }] }, catalog);
    for (const direction of ['RIGHT', 'DOWN'] as const) {
      const port = effectiveInterpretedPorts028(interpretation, symbol, undefined, direction)[0]!;
      expect(port).toMatchObject({ id: 'out', anchor: 'EAST', direction: 'out' });
      expect(port.outlinePoint?.x).toBeCloseTo(5 / 6);
      expect(port.outlinePoint?.y).toBeCloseTo(1 / 3);
      expect(port.position).toBeCloseTo(1 / 3);
    }
    expect(interpretation.semanticPorts[0]?.anchor).toEqual({ kind: 'symbol', id: 'reviewRim' });
  });
});
