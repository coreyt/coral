import { describe, expect, it } from 'vitest';
import { notationCatalogIdentity028 } from '../src/notations/index.js';
import { projectSuccessorNodeInput028, resolveSuccessorGraphNodes028, successorCatalogSnapshot028,
  type SuccessorGraphView028 } from '../src/successorInterpretation028.js';

function graph(profileId: string, nodes: SuccessorGraphView028['nodes']): SuccessorGraphView028 {
  const catalog = notationCatalogIdentity028(profileId);
  if (!catalog) throw new Error(`Missing test catalog ${profileId}`);
  return { version: '4.0.0', profile: { id: profileId, version: '1.0.0' }, catalog, nodes };
}

describe('local GraphIR successor interpretation bridge', () => {
  it('uses successor semantic ports without a package dependency or geometric port projection', () => {
    const source = graph('architecture', [{ id: 'api', type: 'service', semanticPorts: [
      { id: 'audit', direction: 'out', anchor: { kind: 'side' } },
      { id: 'fixed', direction: 'out', anchor: { kind: 'exact', position: 'E' } },
      { id: 'free', direction: 'out' },
      { id: 'chosenAuto', direction: 'out', anchor: { kind: 'auto' } },
    ] }]);
    const input = projectSuccessorNodeInput028(source.nodes[0]!);
    expect(input.authoredPorts).toEqual([
      { id: 'audit', direction: 'out', anchor: 'side' },
      { id: 'fixed', direction: 'out', anchor: 'E' },
      { id: 'free', direction: 'out' },
      { id: 'chosenAuto', direction: 'out', anchor: 'auto' },
    ]);
    const resolved = resolveSuccessorGraphNodes028(source).get('api')!;
    expect(resolved.semanticPorts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'in', origin: 'catalog' }),
      expect.objectContaining({ id: 'audit', origin: 'authored', anchor: 'side' }),
      expect.objectContaining({ id: 'fixed', origin: 'authored', anchor: 'E' }),
      expect.objectContaining({ id: 'free', anchor: 'auto', anchorWasExplicit: false }),
      expect.objectContaining({ id: 'chosenAuto', anchor: 'auto', anchorWasExplicit: true }),
    ]));
  });

  it('keeps catalog-port collisions visible instead of overriding them', () => {
    const result = resolveSuccessorGraphNodes028(graph('architecture', [
      { id: 'api', type: 'service', semanticPorts: [{ id: 'in', direction: 'out' }] },
    ])).get('api')!;
    expect(result.portCollisions).toEqual(['in']);
    expect(result.semanticPorts.find((port) => port.id === 'in')?.origin).toBe('catalog');
  });

  it('checks the exact installed catalog before interpretation', () => {
    const source = graph('architecture', [{ id: 'api', type: 'service' }]);
    expect(() => resolveSuccessorGraphNodes028({ ...source,
      catalog: { ...source.catalog!, digest: 'stale' } })).toThrow('catalog pin mismatch');
  });

  it('rejects disabled Chen ERD meaning even with a pinned catalog', () => {
    const source = graph('erd', [{ id: 'entity', type: 'entity' }]);
    expect(() => resolveSuccessorGraphNodes028(source)).toThrow('disabled');
    expect(() => successorCatalogSnapshot028(source)).toThrow('disabled');
  });

  it('rejects an uninstalled profile version or family discriminator despite an exact catalog digest', () => {
    const source = graph('architecture', [{ id: 'api', type: 'service' }]);
    expect(() => resolveSuccessorGraphNodes028({ ...source,
      profile: { id: 'architecture', version: '9.9.9' } })).toThrow('profile pin mismatch');
    expect(() => resolveSuccessorGraphNodes028({ ...source,
      profile: { id: 'architecture', kind: 'class', version: '1.0.0' } })).toThrow('profile pin mismatch');
    expect(() => successorCatalogSnapshot028({ ...source,
      profile: { id: 'architecture', version: '9.9.9' } })).toThrow('profile pin mismatch');
  });

  it('does not mistake BPMN profile 1.0.0 for its updated catalog 1.0.1', () => {
    const source = graph('bpmn', [{ id: 'work', type: 'task' }]);
    expect(source.catalog?.version).toBe('1.0.1');
    expect(resolveSuccessorGraphNodes028(source).get('work')?.status).toBe('resolved');
  });

  it('provides the local validator the same installed type words and inherited ports', () => {
    const snapshot = successorCatalogSnapshot028(graph('architecture', []));
    expect(snapshot.typeSymbols.service).toBe('arch-service');
    expect(snapshot.allowedSymbolIds).toContain('arch-service');
    expect(snapshot.symbols['arch-service']?.ports).toEqual(expect.arrayContaining([
      { id: 'in', direction: 'in' }, { id: 'out', direction: 'out' },
    ]));
  });

  it('maps the UML family discriminator and nested nodes', () => {
    const catalog = notationCatalogIdentity028('uml-class')!;
    const source: SuccessorGraphView028 = { version: '4.0.0',
      profile: { id: 'uml', kind: 'class', version: '1.0.0' }, catalog,
      nodes: [{ id: 'outer', type: 'group', children: [{ id: 'Order', type: 'class' }] }] };
    const nodes = resolveSuccessorGraphNodes028(source);
    expect(nodes.get('Order')?.effectiveSymbolId).toBe('uml-class');
    expect(nodes.get('outer')?.status).toBe('generic');
  });
});
