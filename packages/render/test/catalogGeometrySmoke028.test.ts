import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { notationRegistry, symbolRegistry } from '../src/index.js';
import { prepareSpatialScene028 } from '../src/svg/serialize.js';

/** Geometry coverage only. Source-language acceptance has separate fixtures. */
describe('installed 0.2.8 catalog geometry', () => {
  const notations = notationRegistry.getAll();
  const cases = symbolRegistry.getAll().flatMap((symbol) => {
    const notation = notations.find((candidate) => candidate.symbols.includes(symbol.id))?.id;
    return [undefined, ...Object.keys(symbol.variants ?? {})].map((variant) => ({
      symbol: symbol.id, notation, variant,
    }));
  });

  it('projects every installed base symbol and variant as finite scene parts in both styles and themes', () => {
    expect(cases.length).toBeGreaterThan(150);
    for (const entry of cases) {
      const graph = { version: '3.0.0', id: 'catalog-geometry-probe',
        ...(entry.notation ? { metadata: { notation: entry.notation } } : {}),
        nodes: [{ id: 'probe', type: entry.symbol, symbol: entry.symbol,
          ...(entry.variant ? { variant: entry.variant } : {}),
          label: 'Probe', position: { x: 20, y: 20 },
          dimensions: { width: 240, height: 240 } }], edges: [],
      } as GraphIR;
      for (const style of ['lowfi', 'hifi'] as const) {
        for (const theme of ['light', 'dark'] as const) {
          const subject = `${entry.symbol}${entry.variant ? `/${entry.variant}` : ''} ${style}/${theme}`;
          const scene = prepareSpatialScene028(graph, { style, theme });
          const parts = scene.parts.filter((part) => part.owner.kind === 'node' &&
            part.owner.id === 'probe');
          expect(parts.length, subject).toBeGreaterThan(0);
          expect(parts.some((part) => part.geometry.kind === 'stencil-path'), subject).toBe(true);
          expect(parts.every((part) => [part.bounds.x, part.bounds.y,
            part.bounds.width, part.bounds.height].every(Number.isFinite)), subject).toBe(true);
          expect(scene.ownerLookup.partIds['node:probe']?.length, subject).toBe(parts.length);
        }
      }
    }
  });
});
