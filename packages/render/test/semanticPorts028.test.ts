import { describe, expect, it } from 'vitest';
import { mergeSemanticPorts028 } from '../src/semanticPorts028.js';

describe('0.2.8 additive semantic ports', () => {
  const catalog = [
    { id: 'request', direction: 'in' as const, anchor: 'W' as const },
    { id: 'response', direction: 'out' as const },
  ];

  it('keeps catalog ports when the authored list is empty', () => {
    const result = mergeSemanticPorts028(catalog, []);
    expect(result.ports.map((port) => port.id)).toEqual(['request', 'response']);
    expect(result.collisions).toEqual([]);
  });

  it('adds a non-colliding authored port without changing defaults', () => {
    const result = mergeSemanticPorts028(catalog, [{ id: 'audit', direction: 'out', anchor: 'side' }]);
    expect(result.ports).toMatchObject([
      { id: 'request', origin: 'catalog', anchor: 'W', anchorWasExplicit: true },
      { id: 'response', origin: 'catalog', anchor: 'auto', anchorWasExplicit: false },
      { id: 'audit', origin: 'authored', anchor: 'side', anchorWasExplicit: true },
    ]);
  });

  it('reports same-name collision and never overwrites the catalog port', () => {
    const result = mergeSemanticPorts028(catalog, [{ id: 'request', direction: 'out', anchor: 'E' }]);
    expect(result.collisions).toEqual(['request']);
    expect(result.ports.find((port) => port.id === 'request')).toMatchObject({
      direction: 'in', anchor: 'W', origin: 'catalog',
    });
  });

  it('normalizes omitted and explicit auto while retaining presence', () => {
    const result = mergeSemanticPorts028([], [
      { id: 'implicit', direction: 'inout' },
      { id: 'explicit', direction: 'inout', anchor: 'auto' },
    ]);
    expect(result.ports).toMatchObject([
      { id: 'implicit', anchor: 'auto', anchorWasExplicit: false },
      { id: 'explicit', anchor: 'auto', anchorWasExplicit: true },
    ]);
  });
});
