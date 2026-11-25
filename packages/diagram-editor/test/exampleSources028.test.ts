import { describe, expect, it } from 'vitest';
import { getAvailableNotations028, projectInstalledSourceToSuccessor028,
  resolveSuccessorGraphNodes028 } from '@coral-viz/render';
import { bundledSourceExamples028, exampleCatalog } from '../src/exampleSources028';

describe('Coral-authored bundled example sources', () => {
  it('covers every enabled 0.2.8 profile with accepted, source-owned text', () => {
    expect([...new Set(bundledSourceExamples028.map(({ notation }) => notation))].sort())
      .toEqual(getAvailableNotations028().map(({ id }) => id).sort());
    for (const example of bundledSourceExamples028) {
      expect(Object.keys(example).sort(), example.id)
        .toEqual(['description', 'id', 'name', 'notation', 'source']);
      expect(example.source.startsWith(`@diagram ${example.notation}\n`)).toBe(true);
      const projected = projectInstalledSourceToSuccessor028(example.source);
      expect(projected.diagnostics, example.id).toEqual([]);
      expect(projected.graph?.nodes.length, example.id).toBeGreaterThan(0);
      expect(projected.graph?.edges.length, example.id).toBeGreaterThan(0);
      expect(projected.graph?.profile?.id, example.id)
        .toBe(example.notation.startsWith('uml-') ? 'uml' : example.notation);
      const resolved = resolveSuccessorGraphNodes028(projected.graph!);
      for (const [id, node] of resolved) {
        expect(node.effectiveSymbolId, `${example.id}.${id}`).toBeTruthy();
      }
    }
  });

  it('preserves the Order example attribute visibility in authored Coral', () => {
    const example = bundledSourceExamples028.find(({ id }) => id === 'uml-class')!;
    const projected = projectInstalledSourceToSuccessor028(example.source);
    expect(projected.diagnostics).toEqual([]);
    const order = projected.graph?.nodes.find(({ id }) => id === 'order');
    expect(order?.classifier?.compartments.find(({ kind }) => kind === 'attributes'))
      .toMatchObject({ items: [{ kind: 'attribute', name: 'id', type: 'UUID', visibility: 'private' }] });
  });
});


it('retains the approved data-engineering relation fidelity in the authored example', () => {
  const example = bundledSourceExamples028.find(({ id }) => id === 'data-engineering')!;
  expect(example.source.match(/\[batchFlow\]/g)).toHaveLength(2);
  const projected = projectInstalledSourceToSuccessor028(example.source);
  expect(projected.diagnostics).toEqual([]);
  expect(projected.graph?.edges.map(({ id, type }) => ({ id, type }))).toEqual([
    { id: 'sourceTransform', type: 'batch-flow' },
    { id: 'transformQuality', type: 'batch-flow' },
    { id: 'qualityWarehouse', type: 'quality' },
    { id: 'qualitySink', type: 'quality' },
  ]);
});

it('preserves the migrated order-service identities, labels, and authored positions', () => {
  const example = bundledSourceExamples028.find(({ id }) => id === 'order-service')!;
  const projected = projectInstalledSourceToSuccessor028(example.source);
  expect(projected.diagnostics).toEqual([]);
  expect(projected.graph?.nodes.map(({ id, type, label, position }) => ({ id, type, label, position }))).toEqual([
    { id: 'client', type: 'service', label: 'Web app', position: { x: 0, y: 90 } },
    { id: 'api', type: 'service', label: 'Orders API', position: { x: 240, y: 90 } },
    { id: 'orders', type: 'database', label: 'Orders', position: { x: 480, y: 0 } },
    { id: 'worker', type: 'service', label: 'Order worker', position: { x: 480, y: 180 } },
  ]);
  expect(projected.graph?.edges.map(({ id, first, second, label }) => ({ id, source: first.node, target: second.node, label }))).toEqual([
    { id: 'request', source: 'client', target: 'api', label: 'request' },
    { id: 'save', source: 'api', target: 'orders', label: 'write' },
    { id: 'work', source: 'api', target: 'worker', label: 'dispatch' },
    { id: 'update', source: 'worker', target: 'orders', label: 'update' },
  ]);
});

it('freezes catalog metadata and source adapters', () => {
  expect(Object.isFrozen(exampleCatalog)).toBe(true);
  expect(Object.isFrozen(exampleCatalog.entries[0]?.preview)).toBe(true);
  expect(Object.isFrozen(exampleCatalog.entries[0]?.capabilities)).toBe(true);
  expect(Object.isFrozen(bundledSourceExamples028[0])).toBe(true);
});
