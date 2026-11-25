import { describe, expect, it } from 'vitest';
import { assessPortReferences028, validatePortReferences028 } from '../src/portReferences028.js';
import { resolveNodeInterpretation028, type CatalogSnapshot028 } from '../src/interpretation028.js';
import type { NodeInterpretation028 } from '../src/interpretation028.js';
import type { GraphIR } from '@graph-ir/core';
import { assessGraphPortReferences028 } from '../src/graphPortReferences028.js';
import { notationCatalogIdentity028 } from '../src/notations/index.js';
import { resolveSuccessorGraphNodes028 } from '../src/successorInterpretation028.js';

const resolved = (nodeId: string, ports: { id: string; direction: 'in' | 'out' | 'inout' }[]): NodeInterpretation028 => ({
  nodeId, authoredType: 'service', status: 'resolved', diagnostics: [], provenance: [], portCollisions: [],
  invalidAnchorPortIds: [],
  catalogIdentity: { id: 'test', version: '1', digest: 'test' },
  semanticPorts: ports.map((port) => ({ ...port, anchor: 'auto', origin: 'catalog', anchorWasExplicit: false })),
});
const source = resolved('source', [{ id: 'out', direction: 'out' }, { id: 'in', direction: 'in' }]);
const target = resolved('target', [{ id: 'in', direction: 'in' }, { id: 'out', direction: 'out' }]);

describe('0.2.8 semantic port-reference validation', () => {
  it('checks authored references against the source-owned port union, not a GraphIR 3 display node', () => {
    const graph: GraphIR = { version: '3.0.0', id: 'authored-refs', metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service' }, { id: 'store', type: 'database' }],
      edges: [{ id: 'read', source: 'api', target: 'store', sourcePort: 'audit', targetPort: 'receive',
        sourceEnd: { marker: { kind: 'none' } }, targetEnd: { marker: { kind: 'arrow' } } }],
    };
    const semanticInterpretations = resolveSuccessorGraphNodes028({ version: '4.0.0',
      profile: { id: 'architecture', version: '1.0.0' }, catalog: notationCatalogIdentity028('architecture')!,
      nodes: [{ id: 'api', type: 'service', semanticPorts: [{ id: 'audit', direction: 'out' }] },
        { id: 'store', type: 'database', semanticPorts: [{ id: 'receive', direction: 'in' }] }],
    });
    expect(assessGraphPortReferences028(graph, 'architecture').assessments[0]?.assessment.diagnostics)
      .toMatchObject([{ code: 'coral.port.reference.missing', portId: 'audit' },
        { code: 'coral.port.reference.missing', portId: 'receive' }]);
    const checked = assessGraphPortReferences028(graph, 'architecture', undefined, semanticInterpretations);
    expect(checked.assessments[0]?.assessment).toEqual({ diagnostics: [], obligations: [] });
    expect([...checked.supersededGraphIrPaths]).toEqual(['/edges/0/sourcePort', '/edges/0/targetPort']);
    expect(graph.nodes.every((node) => node.ports === undefined)).toBe(true);
    const changedDisplay: GraphIR = { ...graph, nodes: [
      { ...graph.nodes[0]!, symbol: 'arch-database' }, graph.nodes[1]!,
    ] };
    expect(() => assessGraphPortReferences028(changedDisplay, 'architecture', undefined,
      semanticInterpretations)).toThrow(/render\.capability\.semantic-port-sidecar.*api/);
  });
  it('accepts a referenced output and input regardless of their geometric anchor', () => {
    expect(validatePortReferences028({ edgeId: 'e', source, target,
      sourcePort: 'out', targetPort: 'in', edgeDirection: 'first-to-second' })).toEqual([]);
  });

  it('locates missing and direction-incompatible references at their authored tokens', () => {
    const sourceRange = { start: { line: 3, column: 10, offset: 35 }, end: { line: 3, column: 17, offset: 42 } };
    const targetRange = { start: { line: 3, column: 31, offset: 56 }, end: { line: 3, column: 38, offset: 63 } };
    const diagnostics = validatePortReferences028({ edgeId: 'e', source, target,
      sourcePort: 'missing', targetPort: 'out', sourceRange, targetRange,
      edgeDirection: 'first-to-second' });
    expect(diagnostics).toMatchObject([
      { code: 'coral.port.reference.missing', role: 'source', portId: 'missing', range: sourceRange },
      { code: 'coral.port.reference.direction', role: 'target', portId: 'out', range: targetRange },
    ]);
  });

  it('checks reversed directed roles without changing written endpoint order', () => {
    const assessment = assessPortReferences028({ edgeId: 'reverse', source, target,
      sourcePort: 'in', targetPort: 'out', edgeDirection: 'second-to-first' });
    expect(assessment).toEqual({ diagnostics: [], obligations: [] });
    const wrong = assessPortReferences028({ edgeId: 'reverse', source, target,
      sourcePort: 'out', targetPort: 'in', edgeDirection: 'second-to-first' });
    expect(wrong.diagnostics.map((item) => [item.role, item.code])).toEqual([
      ['source', 'coral.port.reference.direction'], ['target', 'coral.port.reference.direction'],
    ]);
  });

  it('checks port existence but leaves neutral and ambiguous port roles unverified', () => {
    for (const edgeDirection of [undefined, 'none', 'both', 'unverified'] as const) {
      const assessment = assessPortReferences028({ edgeId: 'neutral', source, target,
        sourcePort: 'in', targetPort: 'missing', edgeDirection });
      expect(assessment.diagnostics).toMatchObject([
        { role: 'target', code: 'coral.port.reference.missing', portId: 'missing' },
      ]);
      expect(assessment.obligations).toContainEqual(expect.objectContaining({
        id: 'CORAL.PORT.REFERENCE.UNVERIFIED', message: expect.stringContaining('direction'),
      }));
    }
  });

  it('does not infer or alter an omitted reference', () => {
    expect(validatePortReferences028({ edgeId: 'e', source, target })).toEqual([]);
  });

  it('does not call a port missing when its authored symbol or variant cannot be resolved', () => {
    const unresolved: NodeInterpretation028 = { ...source, status: 'unknown-variant',
      authoredVariant: 'special', semanticPorts: [],
      diagnostics: [{ code: 'coral.variant.unknown', message: 'Unknown variant special' }] };
    expect(validatePortReferences028({ edgeId: 'e', source: unresolved, target,
      sourcePort: 'out', targetPort: 'in', edgeDirection: 'first-to-second' })).toEqual([]);
    expect(assessPortReferences028({ edgeId: 'e', source: unresolved, target,
      sourcePort: 'out', targetPort: 'in', edgeDirection: 'first-to-second' })).toMatchObject({
      diagnostics: [], obligations: [{ id: 'CORAL.PORT.REFERENCE.UNVERIFIED',
        message: expect.stringContaining('source port out') }],
    });
  });

  it('keeps an unresolved catalog reference unverified even when an authored port is known', () => {
    const unresolved: NodeInterpretation028 = { ...source, status: 'unknown-variant',
      authoredVariant: 'missing', semanticPorts: [{ id: 'audit', direction: 'out', anchor: 'side',
        origin: 'authored', anchorWasExplicit: true }],
      diagnostics: [{ code: 'coral.variant.unknown', message: 'Unknown variant missing' }] };
    const assessment = assessPortReferences028({ edgeId: 'e', source: unresolved, target,
      sourcePort: 'audit', targetPort: 'in', edgeDirection: 'first-to-second' });
    expect(assessment.diagnostics).toEqual([]);
    expect(assessment.obligations).toContainEqual(expect.objectContaining({
      id: 'CORAL.PORT.REFERENCE.UNVERIFIED', message: expect.stringContaining('audit'),
    }));
  });

  it('does not certify a reference to a colliding authored/catalog port ID', () => {
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map([['service', {
        id: 'service', name: 'Service', shape: 'rectangle', tags: [],
        ports: [{ id: 'out', direction: 'out', anchor: 'EAST' }],
      }]]), allowedSymbolIds: new Set(['service']), typeSymbols: new Map([['service', 'service']]) };
    const conflicting = resolveNodeInterpretation028({ id: 'source', type: 'service',
      authoredPorts: [{ id: 'out', direction: 'in' }] }, catalog);
    const assessment = assessPortReferences028({ edgeId: 'edge', source: conflicting, target,
      sourcePort: 'out', targetPort: 'in', edgeDirection: 'first-to-second' });
    expect(assessment.diagnostics).toEqual([]);
    expect(assessment.obligations).toContainEqual(expect.objectContaining({
      id: 'CORAL.PORT.REFERENCE.UNVERIFIED', message: expect.stringContaining('colliding'),
    }));
  });

  it('does not certify a referenced port whose selected named anchor is invalid', () => {
    const invalid: NodeInterpretation028 = { ...source, invalidAnchorPortIds: ['out'],
      diagnostics: [{ code: 'coral.port.anchor.symbol-unknown', message: 'No such named anchor' }] };
    const assessment = assessPortReferences028({ edgeId: 'edge', source: invalid, target,
      sourcePort: 'out', targetPort: 'in', edgeDirection: 'first-to-second' });
    expect(assessment.diagnostics).toEqual([]);
    expect(assessment.obligations).toContainEqual(expect.objectContaining({
      id: 'CORAL.PORT.REFERENCE.UNVERIFIED', message: expect.stringContaining('named anchor'),
    }));
  });
});
