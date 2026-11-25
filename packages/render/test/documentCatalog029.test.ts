import { describe, expect, it } from 'vitest';
import { computeDocumentSymbolDigest, validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import { documentCatalog029 } from '../src/documentCatalog029.js';
import { resolveNodeInterpretation028, type CatalogSnapshot028 } from '../src/interpretation028.js';
import { notationCatalogIdentity028, resolveNotationNode028 } from '../src/notations/index.js';
import { mergeSemanticPorts028 } from '../src/semanticPorts028.js';
import { shapeRegistry } from '../src/shapes/index.js';
import { checkInstalledSuccessorSourceConformance028 } from '../src/successorSourceConformance028.js';
import { projectSuccessorNodeInput028, resolveSuccessorGraphNodes028,
  successorCatalogSnapshot028, successorCoreValidationInput029 } from '../src/successorInterpretation028.js';
import { projectInstalledSourceToSuccessor028,
  type SuccessorUserSymbol029 } from '../src/successorSourceProjection028.js';
import { symbolRegistry } from '../src/symbols/index.js';
import { verifyPortableSuccessorSource028 } from '../src/successorPortableExport028.js';

const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', '', '@symbol shield {', '  name "Shield"',
  '  description "Policy point"', '  tags "security"', '  size 48 x 56', '  outline rounded',
  '  anchor crest [side: N, at: 0.5]', '  anchor keyhole [x: 0.5, y: 0.55, exit: S]',
  '  login port [direction: in, anchor: W, label: "Sign-in", maxConnections: 1]',
  '  token port [direction: out, anchor: E, label: "Token"]', '  audit port [direction: out, anchor: keyhole]',
  '  free port [direction: inout]', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28"><path d="M0 0 L24 0 L24 28 Z" fill="#2f6f4f"/></svg>',
  '"""', '}', '', 'gate service [symbol: "local.shield"] as "Auth gateway"',
  'vault database as "Secrets" {', '  ingest port [direction: in, anchor: W, label: "Writes", maxConnections: 2]',
  '}', 'gate:token -> vault [reads]', 'gate:audit -> vault:ingest [type: writes, secondEnd: arrow]', ''].join('\n');
const graph = () => projectInstalledSourceToSuccessor028(SOURCE).graph!;
const definitions = (): SuccessorUserSymbol029[] => graph().userSymbols029!;

describe('U1 connection limits', () => {
  it('carries maxConnections through the port union', () => {
    expect(mergeSemanticPorts028([{ id: 'in', direction: 'in', maxConnections: 1 }],
      [{ id: 'x', direction: 'out', maxConnections: 3 }]).ports).toMatchObject([
      { id: 'in', maxConnections: 1, origin: 'catalog' }, { id: 'x', maxConnections: 3, origin: 'authored' }]);
  });

  it('carries bundled and variant catalog limits as it carries labels', () => {
    const decision = resolveNotationNode028({ id: 'd', type: 'decision' }, 'flowchart');
    expect(decision.semanticPorts.find((port) => port.id === 'in')).toMatchObject({ maxConnections: 1 });
    const symbols = new Map([['s', { id: 's', name: 'S', shape: 'rectangle', tags: [],
      ports: [{ id: 'p', anchor: 'NORTH' as const, direction: 'in' as const, maxConnections: 4 }],
      variants: { v: { name: 'V', ports: [{ id: 'p', anchor: 'NORTH' as const, direction: 'in' as const,
        maxConnections: 2 }] } } }]]);
    const catalog: CatalogSnapshot028 = { identity: { id: 'x', version: '1', digest: 'd' }, profileId: 'x',
      symbols, allowedSymbolIds: new Set(['s']), typeSymbols: new Map() };
    expect(resolveNodeInterpretation028({ id: 'n', type: 't', symbol: 's' }, catalog).semanticPorts[0])
      .toMatchObject({ maxConnections: 4 });
    expect(resolveNodeInterpretation028({ id: 'n', type: 't', symbol: 's', variant: 'v' }, catalog).semanticPorts[0])
      .toMatchObject({ maxConnections: 2, anchor: 'auto' });
  });

  it('projects an authored successor port limit into U1 input', () => {
    expect(projectSuccessorNodeInput028({ id: 'n', type: 'database', semanticPorts: [
      { id: 'p', direction: 'in', maxConnections: 2 }] }).authoredPorts).toEqual([
      { id: 'p', direction: 'in', maxConnections: 2 }]);
  });
});

describe('document catalog overlay', () => {
  it('reuses the frozen bundled snapshot when a document has no definitions', () => {
    const catalog = documentCatalog029('architecture', []);
    expect(catalog).toBe(documentCatalog029('architecture', []));
    expect(catalog.userSymbols.size).toBe(0);
    expect(catalog.identity).toEqual(notationCatalogIdentity028('architecture'));
  });

  it('overlays user symbols without touching the bundled registries', () => {
    const before = { symbols: symbolRegistry.getAll().length, shapes: shapeRegistry.getAll().length };
    const list = definitions();
    const catalog = documentCatalog029('architecture', list);
    expect(documentCatalog029('architecture', list)).toBe(catalog);
    expect(catalog.allowedSymbolIds.has('local.shield')).toBe(true);
    expect(catalog.allowedSymbolIds.has('arch-service')).toBe(true);
    expect(catalog.symbols.get('local.shield')).toMatchObject({ id: 'local.shield', name: 'Shield',
      shape: 'local.shield', description: 'Policy point', tags: ['security'] });
    expect(catalog.shapes.get('local.shield')).toMatchObject({ id: 'local.shield', viewBox: '0 0 48 56' });
    const user = catalog.userSymbols.get('local.shield')!;
    expect(user.outline).toEqual({ symbolId: 'local.shield', outline: 'rounded', width: 48, height: 56 });
    expect(user.anchors.get('keyhole')).toEqual({ id: 'keyhole', kind: 'interior', side: 'S',
      attachment: { x: 0.5, y: 1 }, interior: { x: 0.5, y: 0.55 } });
    expect(catalog.identity).toEqual(notationCatalogIdentity028('architecture'));
    expect(symbolRegistry.getAll().length).toBe(before.symbols);
    expect(shapeRegistry.getAll().length).toBe(before.shapes);
    expect(symbolRegistry.get('local.shield')).toBeUndefined();
    expect(Object.isFrozen(catalog)).toBe(true);
  });
});

describe('U1 user-symbol branch', () => {
  const catalog = () => documentCatalog029('architecture', definitions());

  it('keeps user-symbol port anchors, labels and limits as catalog ports', () => {
    const resolved = resolveNotationNode028({ id: 'gate', type: 'service', symbol: 'local.shield' },
      'architecture', catalog());
    expect(resolved).toMatchObject({ status: 'resolved', effectiveSymbolId: 'local.shield',
      effectiveShapeId: 'local.shield', diagnostics: [], catalogIdentity: notationCatalogIdentity028('architecture') });
    expect(resolved.semanticPorts).toEqual([
      { id: 'login', direction: 'in', label: 'Sign-in', maxConnections: 1, anchor: 'W', anchorWasExplicit: true, origin: 'catalog' },
      { id: 'token', direction: 'out', label: 'Token', anchor: 'E', anchorWasExplicit: true, origin: 'catalog' },
      { id: 'audit', direction: 'out', anchor: { kind: 'symbol', id: 'keyhole' }, anchorWasExplicit: true, origin: 'catalog' },
      { id: 'free', direction: 'inout', anchor: 'auto', anchorWasExplicit: false, origin: 'catalog' },
    ]);
    expect(resolved.userSymbol029?.definition.id).toBe('shield');
  });

  it('checks authored port anchors against the definition anchors', () => {
    const resolved = resolveNotationNode028({ id: 'gate', type: 'service', symbol: 'local.shield', authoredPorts: [
      { id: 'side', direction: 'in', anchor: { kind: 'symbol', id: 'crest' } },
      { id: 'lost', direction: 'in', anchor: { kind: 'symbol', id: 'missing' } }] }, 'architecture', catalog());
    expect(resolved.diagnostics).toEqual([expect.objectContaining({
      code: 'coral.port.anchor.symbol-unknown', portId: 'lost' })]);
    expect(resolved.invalidAnchorPortIds).toEqual(['lost']);
  });

  it('reports an unknown variant on a user symbol', () => {
    expect(resolveNotationNode028({ id: 'gate', type: 'service', symbol: 'local.shield', variant: 'x' },
      'architecture', catalog()).diagnostics).toEqual([expect.objectContaining({ code: 'coral.variant.unknown' })]);
  });

  it('leaves an undefined local reference unresolved with or without a catalog', () => {
    for (const resolved of [
      resolveNotationNode028({ id: 'n', type: 'service', symbol: 'local.nothing' }, 'architecture', catalog()),
      resolveNotationNode028({ id: 'n', type: 'service', symbol: 'local.shield' }, 'architecture')]) {
      expect(resolved.status).toBe('unknown-symbol');
      expect(resolved.diagnostics).toEqual([expect.objectContaining({ code: 'coral.symbol.unknown' })]);
      expect(resolved.userSymbol029).toBeUndefined();
    }
  });
});

describe('successor graph resolution and core validation', () => {
  it('resolves successor nodes against the document catalog', () => {
    const resolved = resolveSuccessorGraphNodes028(graph());
    expect(resolved.get('gate')).toMatchObject({ status: 'resolved', effectiveSymbolId: 'local.shield' });
    expect(resolved.get('vault')!.semanticPorts.find((port) => port.id === 'ingest')).toMatchObject({
      label: 'Writes', maxConnections: 2, origin: 'authored' });
  });

  it('validates the GraphIR form: a document catalog with core\'s digest, no local IDs in the snapshot', () => {
    const snapshot = successorCatalogSnapshot028(graph());
    expect(snapshot.allowedSymbolIds.some((id) => id.startsWith('local.'))).toBe(false);
    expect(Object.keys(snapshot.symbols).some((id) => id.startsWith('local.'))).toBe(false);
    const input = successorCoreValidationInput029(graph());
    expect('userSymbols029' in input.graph).toBe(false);
    const [definition] = input.graph.documentCatalog!;
    expect(definition).toMatchObject({ id: 'local.shield', name: 'Shield', description: 'Policy point',
      tags: ['security'], size: { width: 48, height: 56 }, outline: 'rounded',
      artwork: { mediaType: 'image/svg+xml', profile: { id: 'coral.svg-artwork', version: '1' } },
      anchors: [{ id: 'crest', kind: 'boundary', side: 'N', at: 0.5 },
        { id: 'keyhole', kind: 'interior', x: 0.5, y: 0.55, exit: 'S' }] });
    expect(definition!.ports![0]).toEqual({ id: 'login', direction: 'in', anchor: { kind: 'exact', position: 'W' },
      label: 'Sign-in', maxConnections: 1 });
    expect(definition).not.toHaveProperty('labelSide');
    expect(definition).not.toHaveProperty('tint');
    expect(definition!.digest).toBe((computeDocumentSymbolDigest(definition!) as { digest: string }).digest);
    expect(input.options.artworkAdmission).toHaveLength(1);
    const checked = validateGraphIRSuccessorWithCatalog(input.graph, input.snapshot, input.options);
    expect(checked.errors).toEqual([]);
    expect(checked.verification).toMatchObject({ complete: true, scope: 'full', obligations: [] });
  });

  it('carries an unused definition and leaves a document without definitions unchanged', () => {
    const unused = projectInstalledSourceToSuccessor028(SOURCE.replace('[symbol: "local.shield"] ', '')).graph!;
    expect(successorCoreValidationInput029(unused).graph.documentCatalog?.map(({ id }) => id)).toEqual(['local.shield']);
    const plain = projectInstalledSourceToSuccessor028('@diagram architecture\na service\n').graph!;
    expect(successorCoreValidationInput029(plain).graph).toEqual(plain);
  });

  it('lets source conformance and portable verification read a user-symbol document', () => {
    expect(checkInstalledSuccessorSourceConformance028(SOURCE, { requestedLevel: 'none' }).diagnostics
      .map((item) => item.code)).not.toContain('coral.symbol.unknown');
    expect(verifyPortableSuccessorSource028(SOURCE).diagnostics).toEqual([]);
  });
});
