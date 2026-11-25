import { describe, expect, it } from 'vitest';
import { resolveNodeInterpretation028, type CatalogSnapshot028 } from '../src/interpretation028.js';
import type { SymbolDefinition } from '../src/types.js';
import { notationRegistry, resolveNotationNode028 } from '../src/notations/index.js';
import { symbolRegistry } from '../src/symbols/index.js';
import { checkGraphConformance028 } from '../src/graphConformance028.js';
import { resolveRenderScene } from '../src/scene.js';
import { renderSvg } from '../src/svg/serialize.js';

const service: SymbolDefinition = {
  id: 'arch-service', name: 'Service', shape: 'rounded-rectangle', tags: [],
  ports: [{ id: 'in', label: 'Requests', direction: 'in', anchor: 'WEST' }],
  variants: { critical: { name: 'Critical', ports: [{ id: 'in', direction: 'in', anchor: 'WEST' }] } },
};
const database: SymbolDefinition = {
  id: 'arch-database', name: 'Database', shape: 'cylinder', tags: [],
};
const catalog: CatalogSnapshot028 = {
  identity: { id: 'architecture', version: '1.0', digest: 'fixture-digest' },
  profileId: 'architecture',
  symbols: new Map([[service.id, service], [database.id, database]]),
  allowedSymbolIds: new Set([service.id]),
  typeSymbols: new Map([['service', service.id]]),
};

describe('0.2.8 unified node interpretation seam', () => {
  it('uses explicit known symbol over profile type mapping and retains provenance', () => {
    const result = resolveNodeInterpretation028({ id: 'a', type: 'service', symbol: 'arch-database' }, catalog);
    expect(result).toMatchObject({
      status: 'foreign-profile', effectiveSymbolId: 'arch-database', effectiveShapeId: 'cylinder',
      authoredSymbol: 'arch-database',
    });
    expect(result.provenance).toContainEqual({ field: 'symbol', origin: 'authored', value: 'arch-database' });
  });

  it('never substitutes a type mapping for an unknown explicit symbol', () => {
    const result = resolveNodeInterpretation028({ id: 'a', type: 'service', symbol: 'missing' }, catalog);
    expect(result.status).toBe('unknown-symbol');
    expect(result.effectiveSymbolId).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.symbol.unknown');
  });

  it('keeps an explicitly blank symbol unresolved under a profile', () => {
    const result = resolveNodeInterpretation028({ id: 'a', type: 'service', symbol: '' }, catalog);
    expect(result).toMatchObject({ status: 'unknown-symbol', authoredSymbol: '', semanticPorts: [] });
    expect(result.effectiveSymbolId).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.symbol.unknown');
  });

  it('resolves an approved profile word and leaves an unmapped open type generic', () => {
    const mapped = resolveNodeInterpretation028({ id: 'a', type: 'service' }, catalog);
    const generic = resolveNodeInterpretation028({ id: 'b', type: 'unmapped' }, catalog);
    expect(mapped).toMatchObject({ status: 'resolved', effectiveSymbolId: 'arch-service' });
    expect(mapped.provenance).toContainEqual({ field: 'symbol', origin: 'profile', value: 'arch-service' });
    expect(generic).toMatchObject({ status: 'generic', semanticPorts: [] });
    expect(generic.effectiveSymbolId).toBeUndefined();
  });

  it('resolves UML class-family declaration words and their inherited ports', () => {
    for (const type of ['class', 'interface', 'enum'] as const) {
      const symbol = `uml-${type}`;
      const result = resolveNotationNode028({ id: 'Order', type }, 'uml-class');
      expect(result).toMatchObject({ status: 'resolved', effectiveSymbolId: symbol });
      expect(result.provenance).toContainEqual({ field: 'symbol', origin: 'profile', value: symbol });
      expect(result.semanticPorts.map((port) => port.id)).toEqual(['north', 'south', 'east', 'west']);
    }
  });

  it('keeps common group containment independent of a profile-specific container symbol', () => {
    for (const notation of notationRegistry.getAll()) {
      const plain = resolveNotationNode028({ id: 'team', type: 'group' }, notation.id);
      expect(plain.status, notation.id).toBe('generic');
      expect(plain.effectiveSymbolId, notation.id).toBeUndefined();
      expect(plain.semanticPorts, notation.id).toEqual([]);
    }
    const explicit = resolveNotationNode028({ id: 'vpc', type: 'group',
      symbol: 'arch-container' }, 'architecture');
    expect(explicit).toMatchObject({ status: 'resolved', effectiveSymbolId: 'arch-container',
      authoredSymbol: 'arch-container' });
    const scene = resolveRenderScene({ version: '3.0.0', id: 'groups',
      metadata: { notation: 'architecture' }, nodes: [
        { id: 'team', type: 'group', children: [] },
        { id: 'vpc', type: 'group', symbol: 'arch-container', children: [] },
      ], edges: [] });
    expect(scene.nodes.find((node) => node.id === 'team')?.symbolId).toBeUndefined();
    expect(scene.nodes.find((node) => node.id === 'vpc')?.symbolId).toBe('arch-container');
  });

  it('passes staged authored ports through the installed-profile adapter without replacing catalog ports', () => {
    const interpreted = resolveNotationNode028({ id: 'api', type: 'service',
      authoredPorts: [{ id: 'audit', direction: 'out', anchor: 'side' }] }, 'architecture');
    expect(interpreted.semanticPorts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'in', origin: 'catalog' }),
      expect.objectContaining({ id: 'audit', origin: 'authored', anchor: 'side', anchorWasExplicit: true }),
    ]));
    expect(interpreted.diagnostics).toEqual([]);
    const collision = resolveNotationNode028({ id: 'api', type: 'service',
      authoredPorts: [{ id: 'in', direction: 'out' }] }, 'architecture');
    expect(collision.portCollisions).toContain('in');
    expect(collision.semanticPorts.find((port) => port.id === 'in'))
      .toMatchObject({ origin: 'catalog', direction: 'in' });
  });

  it('diagnoses an unknown explicit variant without changing the authored value', () => {
    const result = resolveNodeInterpretation028({ id: 'a', type: 'service', variant: 'missing' }, catalog);
    expect(result).toMatchObject({ status: 'unknown-variant', authoredVariant: 'missing' });
    expect(result.effectiveVariantId).toBeUndefined();
    expect(result.semanticPorts).toEqual([]);
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.variant.unknown');
  });

  it('retains authored semantic ports but does not borrow base ports for an unknown variant', () => {
    const result = resolveNodeInterpretation028({ id: 'a', type: 'service', variant: 'missing',
      authoredPorts: [{ id: 'audit', direction: 'out', anchor: 'side' }] }, catalog);
    expect(result.status).toBe('unknown-variant');
    expect(result.semanticPorts).toMatchObject([{ id: 'audit', origin: 'authored', anchor: 'side' }]);
    expect(result.semanticPorts.map((port) => port.id)).not.toContain('in');
    expect(result.diagnostics.map((item) => item.code)).not.toContain('coral.port.duplicate');
  });

  it('does not treat a variant on an unmapped generic type as renderable generic', () => {
    const result = resolveNodeInterpretation028({ id: 'a', type: 'unmapped', variant: 'special' }, catalog);
    expect(result).toMatchObject({ status: 'unknown-variant', authoredVariant: 'special' });
    expect(result.effectiveSymbolId).toBeUndefined();
    expect(result.semanticPorts).toEqual([]);
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.variant.unknown');
  });

  it('reports an unresolved generic variant as capability without inventing a missing-port finding', () => {
    const report = checkGraphConformance028({ version: '3.0.0', id: 'draft',
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'source', type: 'unmapped', variant: 'special' },
        { id: 'target', type: 'service' }],
      edges: [{ id: 'connection', source: 'source', target: 'target', sourcePort: 'out' }],
    }, { savedLevel: 'typical' });
    expect(report.findings).toContainEqual(expect.objectContaining({
      id: 'coral.variant.unknown', category: 'capability',
      subject: { kind: 'node', id: 'source' },
    }));
    expect(report.findings.map((finding) => finding.id)).not.toContain('coral.port.reference.missing');
    expect(report.unverifiedObligations).toContainEqual(expect.objectContaining({
      id: 'CORAL.PORT.REFERENCE.UNVERIFIED',
      message: expect.stringContaining('connection'),
    }));
  });

  it('retains both foreign-symbol and unknown-variant findings when they coexist', () => {
    const result = resolveNodeInterpretation028({ id: 'a', type: 'service',
      symbol: 'arch-database', variant: 'missing' }, catalog);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'coral.symbol.foreign-profile', 'coral.variant.unknown',
    ]);
    expect(result.effectiveSymbolId).toBe('arch-database');
    expect(result.authoredVariant).toBe('missing');
  });

  it('adds authored semantic ports and reports same-name collisions', () => {
    const good = resolveNodeInterpretation028({ id: 'a', type: 'service',
      authoredPorts: [{ id: 'audit', label: 'Audit events', direction: 'out', anchor: 'side' }] }, catalog);
    expect(good.semanticPorts.map((port) => port.id)).toEqual(['in', 'audit']);
    expect(good.semanticPorts.find((port) => port.id === 'in')).toMatchObject({
      label: 'Requests', anchor: 'auto', anchorWasExplicit: false,
    });
    expect(good.semanticPorts.find((port) => port.id === 'audit')).toMatchObject({
      label: 'Audit events', origin: 'authored',
    });
    const collision = resolveNodeInterpretation028({ id: 'a', type: 'service',
      authoredPorts: [{ id: 'in', direction: 'out', anchor: 'E' }] }, catalog);
    expect(collision.semanticPorts.find((port) => port.id === 'in')).toMatchObject({
      direction: 'in', origin: 'catalog',
    });
    expect(collision.diagnostics.map((item) => item.code)).toContain('coral.port.duplicate');
  });

  it('reports a named anchor absent from the selected variant without changing authored intent', () => {
    const anchored: SymbolDefinition = { id: 'decision', name: 'Decision', shape: 'diamond', tags: [],
      namedAnchors: [{ id: 'base', side: 'EAST', position: 0.25 }],
      variants: { empty: { name: 'Empty', namedAnchors: [] } } };
    const selected: CatalogSnapshot028 = { ...catalog, symbols: new Map([[anchored.id, anchored]]),
      allowedSymbolIds: new Set([anchored.id]), typeSymbols: new Map([['decision', anchored.id]]) };
    const result = resolveNodeInterpretation028({ id: 'a', type: 'decision', variant: 'empty',
      authoredPorts: [{ id: 'out', direction: 'out', anchor: { kind: 'symbol', id: 'base' } }] }, selected);
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.port.anchor.symbol-unknown');
    expect(result.semanticPorts[0]?.anchor).toEqual({ kind: 'symbol', id: 'base' });
  });

  it('does not certify a named symbol anchor on a generic node without a symbol', () => {
    const result = resolveNodeInterpretation028({ id: 'plain', type: 'generic',
      authoredPorts: [{ id: 'out', direction: 'out', anchor: { kind: 'symbol', id: 'rim' } }] }, catalog);
    expect(result.status).toBe('generic');
    expect(result.invalidAnchorPortIds).toEqual(['out']);
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.port.anchor.symbol-unavailable');
    expect(result.semanticPorts[0]?.anchor).toEqual({ kind: 'symbol', id: 'rim' });
  });

  it('adds authored ports to the selected catalog variant without borrowing another variant', () => {
    const terminal: SymbolDefinition = { id: 'terminal', name: 'Terminal', shape: 'stadium', tags: [],
      variants: {
        start: { name: 'Start', ports: [{ id: 'out', direction: 'out', anchor: 'SOUTH' }] },
        end: { name: 'End', ports: [{ id: 'in', direction: 'in', anchor: 'NORTH' }] },
      } };
    const variants: CatalogSnapshot028 = { ...catalog,
      symbols: new Map([[terminal.id, terminal]]),
      allowedSymbolIds: new Set([terminal.id]),
      typeSymbols: new Map([['terminal', terminal.id]]) };
    const start = resolveNodeInterpretation028({ id: 's', type: 'terminal', variant: 'start',
      authoredPorts: [{ id: 'audit', direction: 'out' }] }, variants);
    expect(start.semanticPorts.map((port) => [port.id, port.origin])).toEqual([
      ['out', 'catalog'], ['audit', 'authored'],
    ]);
    const end = resolveNodeInterpretation028({ id: 'e', type: 'terminal', variant: 'end' }, variants);
    expect(end.semanticPorts.map((port) => port.id)).toEqual(['in']);
    const collision = resolveNodeInterpretation028({ id: 's', type: 'terminal', variant: 'start',
      authoredPorts: [{ id: 'out', direction: 'in' }] }, variants);
    expect(collision.diagnostics.map((item) => item.code)).toContain('coral.port.duplicate');
    expect(collision.semanticPorts).toMatchObject([{ id: 'out', direction: 'out', origin: 'catalog' }]);
  });

  it('uses the installed catalog for notation validation without substituting foreign symbols', () => {
    const node = { id: 'a', type: 'service', symbol: 'arch-service' };
    const first = resolveNotationNode028(node, 'flowchart');
    const second = resolveNotationNode028(node, 'flowchart');
    expect(first).toMatchObject({ status: 'foreign-profile', effectiveSymbolId: 'arch-service' });
    expect(first.catalogIdentity.digest).toBe(second.catalogIdentity.digest);
    const report = checkGraphConformance028({ version: '3.0.0', id: 'draft',
      metadata: { notation: 'flowchart' }, nodes: [node], edges: [] }, { savedLevel: 'typical' });
    expect(report.notices).toEqual([]);
    expect(report.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning',
    }));
  });

  it('validates nested node symbols with the same shared interpretation', () => {
    const parent = { id: 'group', type: 'group', children: [
      { id: 'child', type: 'service', symbol: 'arch-service' },
    ] };
    const report = checkGraphConformance028({ version: '3.0.0', id: 'draft',
      metadata: { notation: 'flowchart' }, nodes: [parent], edges: [] }, { savedLevel: 'typical' });
    expect(report.notices).toEqual([]);
    expect(report.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.SYMBOL.OUT_OF_PROFILE', subject: { kind: 'node', id: 'child' },
    }));
  });

  it('maps approved words by profile without inventing a BPMN event subtype', () => {
    const architecture = resolveNotationNode028({ id: 'api', type: 'service' }, 'architecture');
    const bpmn = resolveNotationNode028({ id: 'received', type: 'event' }, 'bpmn');
    expect(architecture).toMatchObject({ status: 'resolved', effectiveSymbolId: 'arch-service' });
    expect(bpmn).toMatchObject({ status: 'generic', authoredType: 'event' });
    expect(bpmn.effectiveSymbolId).toBeUndefined();
  });

  it('keeps ordinary U2 notices quiet without promoting old catalog rule declarations', () => {
    const plain = checkGraphConformance028({ version: '3.0.0', id: 'draft',
      metadata: { notation: 'flowchart' }, nodes: [{ id: 'draft', type: 'process' }], edges: [] },
    { savedLevel: 'typical' });
    expect(plain.findings).toEqual([]);
    expect(plain.notices).toEqual([]);
  });

  it('keeps installed symbol and notation catalogs deeply immutable after pinning', () => {
    const before = resolveNotationNode028({ id: 'api', type: 'service' }, 'architecture');
    const symbol = symbolRegistry.get('arch-service')!;
    const notation = notationRegistry.get('architecture')!;
    expect(Object.isFrozen(symbolRegistry.getAll())).toBe(true);
    expect(Object.isFrozen(symbol)).toBe(true);
    expect(Object.isFrozen(symbol.ports)).toBe(true);
    expect(Object.isFrozen(symbol.ports![0])).toBe(true);
    expect(Object.isFrozen(symbol.variants)).toBe(true);
    expect(Object.isFrozen(notationRegistry.getAll())).toBe(true);
    expect(Object.isFrozen(notation)).toBe(true);
    expect(Object.isFrozen(notation.symbols)).toBe(true);
    expect(Object.isFrozen(notation.connectionRules)).toBe(true);
    expect(resolveNotationNode028({ id: 'api', type: 'service' }, 'architecture').catalogIdentity)
      .toEqual(before.catalogIdentity);
  });

  it('keeps explicit symbol interpretation aligned across all installed profiles', () => {
    expect(notationRegistry.getAll()).toHaveLength(13);
    for (const notation of notationRegistry.getAll()) {
      if (notation.id === 'uml-state') {
        expect(notation.symbols).toEqual([]);
        continue;
      }
      const symbol = notation.symbols[0]!;
      const node = { id: 'subject', type: 'unmapped', symbol, label: 'Subject' };
      const graph = { version: '3.0.0' as const, id: `fixture-${notation.id}`,
        metadata: { notation: notation.id }, nodes: [node], edges: [] };
      const interpreted = resolveNotationNode028(node, notation.id);
      expect(interpreted.status, notation.id).toBe('resolved');
      expect(interpreted.effectiveSymbolId, notation.id).toBe(symbol);
      expect(resolveRenderScene(graph).nodes[0]?.symbolId, notation.id).toBe(symbol);
      expect(renderSvg(graph).includes('>Subject</text>'), notation.id).toBe(true);
      const report = checkGraphConformance028(graph, { savedLevel: 'typical' });
      expect(report.catalog?.id, notation.id).toBe(notation.id);
      expect(report.findings.filter((finding) => finding.category === 'capability'), notation.id).toEqual([]);
    }
  });

  it('preserves a known foreign symbol and reports it at strict level in every profile', () => {
    for (const notation of notationRegistry.getAll()) {
      const foreign = notation.id === 'architecture' ? 'flowchart-process' : 'arch-service';
      const node = { id: 'subject', type: 'unmapped', symbol: foreign };
      const graph = { version: '3.0.0' as const, id: `foreign-${notation.id}`,
        metadata: { notation: notation.id }, nodes: [node], edges: [] };
      expect(resolveNotationNode028(node, notation.id), notation.id).toMatchObject({
        status: 'foreign-profile', effectiveSymbolId: foreign,
        authoredSymbol: foreign,
      });
      if (notation.id === 'uml-state') {
        expect(() => resolveRenderScene(graph)).toThrow('render.capability.character-only-edition');
      } else {
        expect(resolveRenderScene(graph).nodes[0]?.symbolId, notation.id).toBe(foreign);
      }
      expect(checkGraphConformance028(graph, { requestedLevel: 'strict', operation: 'check' }).findings,
        notation.id).toContainEqual(expect.objectContaining({
        id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'error',
        subject: { kind: 'node', id: 'subject' },
      }));
    }
  });
});
