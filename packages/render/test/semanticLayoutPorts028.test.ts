import { describe, expect, it } from 'vitest';
import { resolveNotationNode028 } from '../src/notations/index.js';
import { resolveNodeInterpretation028, type CatalogSnapshot028 } from '../src/interpretation028.js';
import { semanticLayoutPorts028 } from '../src/semanticLayoutPorts028.js';
import { symbolRegistry } from '../src/symbols/index.js';
import { resolveSpatialLayout } from '../src/layout/spatial.js';
import { shapeRegistry } from '../src/shapes/index.js';
import { stencilFitPoint028 } from '../src/stencilAnchorGeometry028.js';
import type { GraphIR } from '@graph-ir/core';

describe('shared 0.2.8 catalog-port layout projection', () => {
  it('changes derived sides with flow while retaining semantic IDs and defaults', () => {
    const interpreted = resolveNotationNode028({ id: 'api', type: 'service' }, 'architecture');
    const symbol = symbolRegistry.get(interpreted.effectiveSymbolId!);
    const right = semanticLayoutPorts028(interpreted, symbol, undefined, 'RIGHT');
    const down = semanticLayoutPorts028(interpreted, symbol, undefined, 'DOWN');
    expect(right).toMatchObject({ sourceDefault: 'out', targetDefault: 'in' });
    expect(right.ports.find((port) => port.id === 'out')?.side).toBe('EAST');
    expect(right.ports.find((port) => port.id === 'in')?.side).toBe('WEST');
    expect(right.ports.every((port) => port.attachment === 'free')).toBe(true);
    expect(down.ports.find((port) => port.id === 'out')?.side).toBe('SOUTH');
    expect(down.ports.find((port) => port.id === 'in')?.side).toBe('NORTH');
    expect(interpreted.semanticPorts.every((port) => port.anchor === 'auto')).toBe(true);
  });

  it('refuses to project ports with a symbol or variant different from the U1 interpretation', () => {
    const interpreted = resolveNotationNode028({ id: 'api', type: 'service' }, 'architecture');
    const selected = symbolRegistry.get(interpreted.effectiveSymbolId!);
    const other = symbolRegistry.get('arch-database');
    expect(() => semanticLayoutPorts028(interpreted, other, undefined, 'RIGHT'))
      .toThrow(/render\.capability\.catalog-mismatch.*api/);
    expect(() => semanticLayoutPorts028(interpreted, selected, 'unselected', 'RIGHT'))
      .toThrow(/render\.capability\.catalog-mismatch.*api/);
  });

  it('keeps an exact authored anchor fixed while an unpinned authored port remains free', () => {
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map(), allowedSymbolIds: new Set(), typeSymbols: new Map() };
    const fixed = resolveNodeInterpretation028({ id: 'fixed', type: 'generic',
      authoredPorts: [{ id: 'out', direction: 'out', anchor: 'N' }] }, catalog);
    const free = resolveNodeInterpretation028({ id: 'free', type: 'generic',
      authoredPorts: [{ id: 'out', direction: 'out', anchor: 'side' }] }, catalog);
    expect(semanticLayoutPorts028(fixed, undefined, undefined, 'RIGHT').ports)
      .toMatchObject([{ id: 'out', side: 'NORTH', attachment: 'fixed' }]);
    expect(semanticLayoutPorts028(free, undefined, undefined, 'RIGHT').ports)
      .toMatchObject([{ id: 'out', side: 'EAST', attachment: 'free', attachmentClass: 'side' }]);
  });

  it('projects a named symbol pin to a fixed diamond-contour point across flow directions', () => {
    const diamond = { id: 'decision', name: 'Decision', shape: 'diamond', tags: [], ports: [],
      namedAnchors: [{ id: 'reviewRim', side: 'EAST' as const, position: 0.25 }] };
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map([['decision', diamond]]),
      allowedSymbolIds: new Set(['decision']), typeSymbols: new Map([['decision', 'decision']]) };
    const interpreted = resolveNodeInterpretation028({ id: 'a', type: 'decision',
      authoredPorts: [{ id: 'out', direction: 'out', anchor: { kind: 'symbol', id: 'reviewRim' } }] }, catalog);
    expect(interpreted.diagnostics).toEqual([]);
    for (const flow of ['RIGHT', 'DOWN'] as const) {
      const port = semanticLayoutPorts028(interpreted, diamond, undefined, flow).ports[0]!;
      expect(port).toMatchObject({ id: 'out', attachment: 'fixed', side: 'EAST' });
      expect(port.outlinePoint?.x).toBeCloseTo(5 / 6);
      expect(port.outlinePoint?.y).toBeCloseTo(1 / 3);
      expect(port.position).toBeCloseTo(1 / 3);
    }
    expect(interpreted.semanticPorts[0]?.anchor).toEqual({ kind: 'symbol', id: 'reviewRim' });
  });

  it('routes a named symbol pin to one exact stencil point under RIGHT and DOWN reflow', async () => {
    const diamond = { id: 'decision', name: 'Decision', shape: 'diamond', tags: [], ports: [],
      namedAnchors: [{ id: 'reviewRim', side: 'EAST' as const, position: 0.25 }] };
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map([['decision', diamond]]),
      allowedSymbolIds: new Set(['decision']), typeSymbols: new Map([['decision', 'decision']]) };
    const interpreted = resolveNodeInterpretation028({ id: 'a', type: 'decision',
      authoredPorts: [{ id: 'out', direction: 'out', anchor: { kind: 'symbol', id: 'reviewRim' } }] }, catalog);
    for (const direction of ['RIGHT', 'DOWN'] as const) for (const dimensions of [
      { width: 120, height: 120 }, { width: 240, height: 80 }, { width: 80, height: 240 },
    ]) {
      const graph = { version: '3.0.0', id: `named-${direction}-${dimensions.width}-${dimensions.height}`, nodes: [
        { id: 'a', type: 'decision', symbol: 'flowchart-decision', dimensions,
          position: { x: 50, y: 50 }, pinned: true,
          ports: semanticLayoutPorts028(interpreted, diamond, undefined, direction).ports },
        { id: 'b', type: 'generic', dimensions: { width: 100, height: 60 },
          position: direction === 'RIGHT' ? { x: 350, y: 50 } : { x: 50, y: 350 }, pinned: true },
      ], edges: [{ id: 'edge', source: 'a', target: 'b', sourcePort: 'out' }] } as GraphIR;
      const result = await resolveSpatialLayout({ revision: graph.id, graph,
        operation: 'reflow', defaults: { algorithm: 'layered', direction } });
      const a = result.nodes.find((node) => node.id === 'a')!;
      const fitted = stencilFitPoint028(shapeRegistry.get('diamond')!, { x: 5 / 6, y: 1 / 3 },
        dimensions.width, dimensions.height);
      expect(result.edges[0]!.sections[0]!.startPoint.x).toBeCloseTo(a.absolutePosition.x + dimensions.width * fitted.x);
      expect(result.edges[0]!.sections[0]!.startPoint.y).toBeCloseTo(a.absolutePosition.y + dimensions.height * fitted.y);
      expect(graph.nodes[0]!.ports?.[0]?.outlinePoint?.x).toBeCloseTo(5 / 6);
      expect(graph.nodes[0]!.ports?.[0]?.outlinePoint?.y).toBeCloseTo(1 / 3);
    }
  });

  it('refuses a named pin on a stroke-only stencil without exact point geometry', () => {
    const actor = { id: 'actor', name: 'Actor', shape: 'actor', tags: [],
      namedAnchors: [{ id: 'arm', side: 'EAST' as const, position: 0.35 }] };
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map([['actor', actor]]),
      allowedSymbolIds: new Set(['actor']), typeSymbols: new Map([['actor', 'actor']]) };
    const interpreted = resolveNodeInterpretation028({ id: 'a', type: 'actor',
      authoredPorts: [{ id: 'out', direction: 'out', anchor: { kind: 'symbol', id: 'arm' } }] }, catalog);
    expect(() => semanticLayoutPorts028(interpreted, actor, undefined, 'RIGHT'))
      .toThrow(/coral\.port\.anchor\.geometry-unsupported.*actor/);
  });

  it('keeps an actor port on its unstretched outline in a wide node', async () => {
    const interpreted = resolveNotationNode028({ id: 'person', type: 'actor',
      authoredPorts: [{ id: 'exit', direction: 'out', anchor: 'E' }] }, 'architecture');
    const symbol = symbolRegistry.get(interpreted.effectiveSymbolId!);
    const port = semanticLayoutPorts028(interpreted, symbol, undefined, 'RIGHT').ports.find((item) => item.id === 'exit')!;
    const dimensions = { width: 240, height: 80 };
    const graph = { version: '3.0.0', id: 'wide-actor', nodes: [
      { id: 'person', type: 'actor', symbol: 'arch-actor', dimensions, position: { x: 50, y: 50 }, pinned: true, ports: [port] },
      { id: 'next', type: 'service', dimensions: { width: 100, height: 60 },
        position: { x: 400, y: 50 }, pinned: true },
    ], edges: [{ id: 'edge', source: 'person', target: 'next', sourcePort: 'exit' }] } as GraphIR;
    const result = await resolveSpatialLayout({ revision: graph.id, graph,
      operation: 'reflow', defaults: { algorithm: 'layered', direction: 'RIGHT' } });
    const actor = result.nodes.find((node) => node.id === 'person')!;
    const fitted = stencilFitPoint028(shapeRegistry.get('actor')!, port.outlinePoint!,
      dimensions.width, dimensions.height);
    expect(result.edges[0]!.sections[0]!.startPoint).toEqual({
      x: actor.absolutePosition.x + dimensions.width * fitted.x,
      y: actor.absolutePosition.y + dimensions.height * fitted.y,
    });
    expect(fitted.x).toBeLessThan(0.65);
  });

  it.each(['NE', 'NW', 'SE', 'SW'] as const)('keeps an exact %s corner pinned across reflow direction', (anchor) => {
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map(), allowedSymbolIds: new Set(), typeSymbols: new Map() };
    const interpreted = resolveNodeInterpretation028({ id: 'api', type: 'generic',
      authoredPorts: [{ id: 'out', direction: 'out', anchor }] }, catalog);
    const right = semanticLayoutPorts028(interpreted, undefined, undefined, 'RIGHT').ports[0]!;
    const down = semanticLayoutPorts028(interpreted, undefined, undefined, 'DOWN').ports[0]!;
    const x = anchor.endsWith('E') ? 1 : 0;
    const y = anchor.startsWith('S') ? 1 : 0;
    expect(right).toMatchObject({ attachment: 'fixed',
      side: x === 1 ? 'EAST' : 'WEST', position: y });
    expect(down).toMatchObject({ attachment: 'fixed',
      side: y === 1 ? 'SOUTH' : 'NORTH', position: x });
  });

  it('projects a corner hint as a free but corner-constrained attachment', () => {
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map(), allowedSymbolIds: new Set(), typeSymbols: new Map() };
    const interpreted = resolveNodeInterpretation028({ id: 'api', type: 'generic',
      authoredPorts: [{ id: 'out', direction: 'out', anchor: 'corner' }] }, catalog);
    expect(semanticLayoutPorts028(interpreted, undefined, undefined, 'RIGHT').ports)
      .toMatchObject([{ id: 'out', attachment: 'free', attachmentClass: 'corner' }]);
  });

  it('moves a free diamond corner hint to its visible contour after layout chooses a corner', async () => {
    const diamond = { id: 'decision', name: 'Decision', shape: 'diamond', tags: [], ports: [] };
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map([['decision', diamond]]),
      allowedSymbolIds: new Set(['decision']), typeSymbols: new Map([['decision', 'decision']]) };
    const interpreted = resolveNodeInterpretation028({ id: 'a', type: 'decision',
      authoredPorts: [{ id: 'out', direction: 'out', anchor: 'corner' }] }, catalog);
    const ports = semanticLayoutPorts028(interpreted, diamond, undefined, 'RIGHT').ports;
    const graph = { version: '3.0.0', id: 'corner-hint-diamond', nodes: [
      { id: 'a', type: 'decision', symbol: 'flowchart-decision', dimensions: { width: 100, height: 100 },
        position: { x: 50, y: 50 }, pinned: true, ports },
      { id: 'b', type: 'generic', dimensions: { width: 100, height: 60 },
        position: { x: 350, y: -200 }, pinned: true },
    ], edges: [{ id: 'edge', source: 'a', target: 'b', sourcePort: 'out' }] } as GraphIR;
    const result = await resolveSpatialLayout({ revision: 'corner-hint-diamond', graph, operation: 'load',
      defaults: { algorithm: 'layered', direction: 'RIGHT' } });
    const a = result.nodes.find((node) => node.id === 'a')!;
    expect(result.edges[0]!.sections[0]!.startPoint).toEqual({
      x: a.absolutePosition.x + 75, y: a.absolutePosition.y + 25,
    });
  });

  it('snaps a mixed-node free side attachment to the diamond outline after reflow', async () => {
    const diamond = { id: 'decision', name: 'Decision', shape: 'diamond', tags: [], ports: [] };
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map([['decision', diamond]]),
      allowedSymbolIds: new Set(['decision']), typeSymbols: new Map([['decision', 'decision']]) };
    const interpreted = resolveNodeInterpretation028({ id: 'a', type: 'decision', authoredPorts: [
      { id: 'fixed', direction: 'out', anchor: 'N' },
      { id: 'free', direction: 'out', anchor: 'side' },
    ] }, catalog);
    const graph = { version: '3.0.0', id: 'mixed-diamond', nodes: [
      { id: 'a', type: 'decision', symbol: 'flowchart-decision', dimensions: { width: 100, height: 100 },
        position: { x: 50, y: 50 }, pinned: true,
        ports: semanticLayoutPorts028(interpreted, diamond, undefined, 'RIGHT').ports },
      { id: 'b', type: 'generic', dimensions: { width: 100, height: 60 },
        position: { x: 350, y: -200 }, pinned: true },
    ], edges: [{ id: 'edge', source: 'a', target: 'b', sourcePort: 'free' }] } as GraphIR;
    const original = structuredClone(graph);
    const result = await resolveSpatialLayout({ revision: 'mixed-diamond', graph, operation: 'reflow',
      defaults: { algorithm: 'layered', direction: 'RIGHT' } });
    const a = result.nodes.find((node) => node.id === 'a')!;
    const start = result.edges[0]!.sections[0]!.startPoint;
    const x = (start.x - a.absolutePosition.x) / a.width;
    const y = (start.y - a.absolutePosition.y) / a.height;
    expect(x).toBeLessThan(1);
    expect(y).toBeLessThan(0.5);
    expect(Math.abs(x - 0.5) + Math.abs(y - 0.5)).toBeCloseTo(0.5);
    expect(graph).toEqual(original);
  });

  it('does not project a free corner hint when the stencil is missing', () => {
    const document = { id: 'document', name: 'Document', shape: 'missing-outline', tags: [], ports: [] };
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map([['document', document]]),
      allowedSymbolIds: new Set(['document']), typeSymbols: new Map([['document', 'document']]) };
    const interpreted = resolveNodeInterpretation028({ id: 'a', type: 'document',
      authoredPorts: [{ id: 'out', direction: 'out', anchor: 'corner' }] }, catalog);
    expect(() => semanticLayoutPorts028(interpreted, document, undefined, 'RIGHT'))
      .toThrow(/coral\.port\.anchor\.geometry-unsupported.*missing-outline/);
  });

  it('routes exact authored corners to the same stencil positions across layout directions', async () => {
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map(), allowedSymbolIds: new Set(), typeSymbols: new Map() };
    for (const direction of ['RIGHT', 'DOWN'] as const) {
      const source = resolveNodeInterpretation028({ id: 'a', type: 'generic',
        authoredPorts: [{ id: 'out', direction: 'out', anchor: 'NE' }] }, catalog);
      const target = resolveNodeInterpretation028({ id: 'b', type: 'generic',
        authoredPorts: [{ id: 'in', direction: 'in', anchor: 'SW' }] }, catalog);
      const graph = { version: '3.0.0', id: `corners-${direction}`, nodes: [
        { id: 'a', type: 'generic', dimensions: { width: 100, height: 60 },
          position: { x: 50, y: 50 }, pinned: true,
          ports: semanticLayoutPorts028(source, undefined, undefined, direction).ports },
        { id: 'b', type: 'generic', dimensions: { width: 100, height: 60 },
          position: direction === 'RIGHT' ? { x: 350, y: 50 } : { x: 50, y: 350 }, pinned: true,
          ports: semanticLayoutPorts028(target, undefined, undefined, direction).ports },
      ], edges: [{ id: 'edge', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in' }] } as GraphIR;
      const result = await resolveSpatialLayout({ revision: direction, graph, operation: 'reflow',
        defaults: { algorithm: 'layered', direction } });
      const a = result.nodes.find((node) => node.id === 'a')!;
      const b = result.nodes.find((node) => node.id === 'b')!;
      const route = result.edges[0]!.sections[0]!;
      expect(route.startPoint).toEqual({ x: a.absolutePosition.x + a.width, y: a.absolutePosition.y });
      expect(route.endPoint).toEqual({ x: b.absolutePosition.x, y: b.absolutePosition.y + b.height });
    }
  });

  it('routes a hard-pinned diamond anchor to its outline rather than the bounding rectangle', async () => {
    const diamond = { id: 'decision', name: 'Decision', shape: 'diamond', tags: [], ports: [] };
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map([['decision', diamond]]),
      allowedSymbolIds: new Set(['decision']), typeSymbols: new Map([['decision', 'decision']]) };
    const interpreted = resolveNodeInterpretation028({ id: 'a', type: 'decision',
      authoredPorts: [{ id: 'out', direction: 'out', anchor: 'NE' }] }, catalog);
    const ports = semanticLayoutPorts028(interpreted, diamond, undefined, 'RIGHT').ports;
    expect(ports[0]).toMatchObject({ side: 'EAST', attachment: 'fixed',
      outlinePoint: { x: 0.75, y: 0.25 } });
    const graph = { version: '3.0.0', id: 'diamond-pin', nodes: [
      { id: 'a', type: 'decision', symbol: 'flowchart-decision', dimensions: { width: 100, height: 100 },
        position: { x: 50, y: 50 }, pinned: true, ports },
      { id: 'b', type: 'generic', dimensions: { width: 100, height: 60 },
        position: { x: 350, y: 50 }, pinned: true },
    ], edges: [{ id: 'edge', source: 'a', target: 'b', sourcePort: 'out' }] } as GraphIR;
    const result = await resolveSpatialLayout({ revision: 'diamond', graph, operation: 'load',
      defaults: { algorithm: 'layered', direction: 'RIGHT' } });
    const a = result.nodes.find((node) => node.id === 'a')!;
    expect(result.edges[0]!.sections[0]!.startPoint).toEqual({
      x: a.absolutePosition.x + 75, y: a.absolutePosition.y + 25,
    });
  });

  it('projects an exact pin on the curved document contour', () => {
    const document = { id: 'document', name: 'Document', shape: 'document', tags: [], ports: [] };
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map([['document', document]]),
      allowedSymbolIds: new Set(['document']), typeSymbols: new Map([['document', 'document']]) };
    const interpreted = resolveNodeInterpretation028({ id: 'a', type: 'document',
      authoredPorts: [{ id: 'out', direction: 'out', anchor: 'SE' }] }, catalog);
    const port = semanticLayoutPorts028(interpreted, document, undefined, 'RIGHT').ports[0]!;
    expect(port.outlinePoint!.x).toBeLessThan(1);
    expect(port.outlinePoint!.y).toBeGreaterThan(0.5);
  });

  it('keeps a cloud outline pin outside an undersized view box instead of clipping it to the node box', async () => {
    const cloud = { id: 'cloud', name: 'Cloud', shape: 'cloud', tags: [], ports: [] };
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map([['cloud', cloud]]),
      allowedSymbolIds: new Set(['cloud']), typeSymbols: new Map([['cloud', 'cloud']]) };
    const interpreted = resolveNodeInterpretation028({ id: 'a', type: 'cloud',
      authoredPorts: [{ id: 'out', direction: 'out', anchor: 'W' }] }, catalog);
    const ports = semanticLayoutPorts028(interpreted, cloud, undefined, 'LEFT').ports;
    expect(ports[0]!.outlinePoint!.x).toBeLessThan(0);
    const graph = { version: '3.0.0', id: 'cloud-outline', nodes: [
      { id: 'a', type: 'cloud', dimensions: { width: 120, height: 80 },
        position: { x: 50, y: 50 }, pinned: true, ports },
      { id: 'b', type: 'generic', dimensions: { width: 100, height: 60 },
        position: { x: -250, y: 50 }, pinned: true },
    ], edges: [{ id: 'edge', source: 'a', target: 'b', sourcePort: 'out' }] } as GraphIR;
    const result = await resolveSpatialLayout({ revision: 'cloud-outline', graph, operation: 'load',
      defaults: { algorithm: 'layered', direction: 'LEFT' } });
    const a = result.nodes.find((node) => node.id === 'a')!;
    const start = result.edges[0]!.sections[0]!.startPoint;
    expect(start.x).toBeCloseTo(a.absolutePosition.x + 120 * ports[0]!.outlinePoint!.x);
    expect(start.y).toBeCloseTo(a.absolutePosition.y + 80 * ports[0]!.outlinePoint!.y);
  });

  it('projects and routes an exact rounded-rectangle diagonal to the renderer curve', async () => {
    const interpreted = resolveNotationNode028({ id: 'api', type: 'service',
      authoredPorts: [{ id: 'audit', direction: 'out', anchor: 'NE' }] }, 'architecture');
    const symbol = symbolRegistry.get(interpreted.effectiveSymbolId!);
    const port = semanticLayoutPorts028(interpreted, symbol, undefined, 'RIGHT').ports.find((item) => item.id === 'audit')!;
    expect(port.outlinePoint!.x).toBeLessThan(1);
    expect(port.outlinePoint!.y).toBeGreaterThan(0);
    expect(port.outlinePoint!.x + port.outlinePoint!.y).toBeCloseTo(1);
    const graph = { version: '3.0.0', id: 'rounded-pin', nodes: [
      { id: 'api', type: 'service', symbol: 'arch-service', dimensions: { width: 200, height: 120 },
        position: { x: 50, y: 50 }, pinned: true, ports: semanticLayoutPorts028(interpreted, symbol, undefined, 'RIGHT').ports },
      { id: 'b', type: 'generic', dimensions: { width: 100, height: 60 },
        position: { x: 400, y: 50 }, pinned: true },
    ], edges: [{ id: 'edge', source: 'api', target: 'b', sourcePort: 'audit' }] } as GraphIR;
    const result = await resolveSpatialLayout({ revision: 'rounded-pin', graph, operation: 'load',
      defaults: { algorithm: 'layered', direction: 'RIGHT' } });
    const api = result.nodes.find((node) => node.id === 'api')!;
    const attachment = result.edges[0]!.sections[0]!.startPoint;
    expect(attachment.x).toBeCloseTo(api.absolutePosition.x + 200 * port.outlinePoint!.x);
    expect(attachment.y).toBeCloseTo(api.absolutePosition.y + 120 * port.outlinePoint!.y);
  });

  it('does not project a colliding authored port as if the catalog choice were unambiguous', () => {
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map([['service', {
        id: 'service', name: 'Service', shape: 'rectangle', tags: [],
        ports: [{ id: 'out', direction: 'out', anchor: 'EAST' }],
      }]]), allowedSymbolIds: new Set(['service']), typeSymbols: new Map([['service', 'service']]) };
    const interpreted = resolveNodeInterpretation028({ id: 'api', type: 'service',
      authoredPorts: [{ id: 'out', direction: 'in', anchor: 'W' }] }, catalog);
    expect(interpreted.diagnostics.map((item) => item.code)).toContain('coral.port.duplicate');
    expect(interpreted.portCollisions).toEqual(['out']);
    expect(() => semanticLayoutPorts028(interpreted, catalog.symbols.get('service'), undefined, 'RIGHT'))
      .toThrow(/coral\.port\.duplicate.*api.*out/);
  });

  it('retains authored ports for repair but cannot lay out an unknown explicit symbol', () => {
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map(), allowedSymbolIds: new Set(), typeSymbols: new Map() };
    const interpreted = resolveNodeInterpretation028({ id: 'api', type: 'service', symbol: 'missing',
      authoredPorts: [{ id: 'audit', direction: 'out', anchor: 'side' }] }, catalog);
    expect(interpreted.semanticPorts).toMatchObject([{ id: 'audit', origin: 'authored' }]);
    expect(() => semanticLayoutPorts028(interpreted, undefined, undefined, 'RIGHT'))
      .toThrow(/render\.capability\.unknown-symbol.*api/);
  });

  it('does not attach a named anchor without a resolved symbol', () => {
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map(), allowedSymbolIds: new Set(), typeSymbols: new Map() };
    const interpreted = resolveNodeInterpretation028({ id: 'api', type: 'generic',
      authoredPorts: [{ id: 'out', direction: 'out',
        anchor: { kind: 'symbol', id: 'tip' } }] }, catalog);
    expect(() => semanticLayoutPorts028(interpreted, undefined, undefined, 'RIGHT'))
      .toThrow(/render\.capability\.unknown-symbol/);
  });

  it('rebinds a free port around a hard-pinned port as neighboring geometry changes', async () => {
    const run = async (neighbor: { x: number; y: number }) => {
      const graph = { version: '3.0.0', id: 'mixed-attachments', nodes: [
        { id: 'a', type: 'generic', dimensions: { width: 100, height: 60 },
          position: { x: 50, y: 50 }, pinned: true, ports: [
            { id: 'fixed', side: 'NORTH', position: 0.5, attachment: 'fixed' },
            { id: 'free', side: 'EAST', attachment: 'free' },
          ] },
        { id: 'b', type: 'generic', dimensions: { width: 100, height: 60 },
          position: neighbor, pinned: true },
        { id: 'c', type: 'generic', dimensions: { width: 100, height: 60 },
          position: { x: 350, y: 350 }, pinned: true },
      ], edges: [
        { id: 'auto-edge', source: 'a', target: 'b', sourcePort: 'free' },
        { id: 'fixed-edge', source: 'a', target: 'c', sourcePort: 'fixed' },
      ] } as unknown as GraphIR;
      const result = await resolveSpatialLayout({ revision: 'mixed', graph, operation: 'load',
        defaults: { algorithm: 'layered', direction: 'RIGHT' } });
      const a = result.nodes.find((node) => node.id === 'a')!;
      const free = result.edges.find((edge) => edge.id === 'auto-edge')!.sections[0]!.startPoint;
      const fixed = result.edges.find((edge) => edge.id === 'fixed-edge')!.sections[0]!.startPoint;
      expect(fixed.x).toBeCloseTo(a.absolutePosition.x + a.width / 2);
      expect(fixed.y).toBeCloseTo(a.absolutePosition.y);
      expect(graph.nodes[0]?.ports?.[1]).toMatchObject({ side: 'EAST' });
      return { a, free };
    };
    const right = await run({ x: 350, y: 50 });
    expect(right.free.x).toBeCloseTo(right.a.absolutePosition.x + right.a.width);
    const down = await run({ x: 50, y: 350 });
    expect(down.free.y).toBeCloseTo(down.a.absolutePosition.y + down.a.height);
  });

  it('keeps a corner-hinted attachment on a corner as neighboring geometry changes', async () => {
    const run = async (neighbor: { x: number; y: number }) => {
      const graph = { version: '3.0.0', id: 'corner-attachments', nodes: [
        { id: 'a', type: 'generic', dimensions: { width: 100, height: 60 },
          position: { x: 50, y: 50 }, pinned: true, ports: [
            { id: 'corner', side: 'EAST', attachment: 'free', attachmentClass: 'corner' },
          ] },
        { id: 'b', type: 'generic', dimensions: { width: 100, height: 60 },
          position: neighbor, pinned: true },
      ], edges: [{ id: 'edge', source: 'a', target: 'b', sourcePort: 'corner' }] } as unknown as GraphIR;
      const result = await resolveSpatialLayout({ revision: 'corner', graph, operation: 'load',
        defaults: { algorithm: 'layered', direction: 'RIGHT' } });
      const a = result.nodes.find((node) => node.id === 'a')!;
      const point = result.edges[0]!.sections[0]!.startPoint;
      expect([a.absolutePosition.x, a.absolutePosition.x + a.width]).toContain(point.x);
      expect([a.absolutePosition.y, a.absolutePosition.y + a.height]).toContain(point.y);
      expect(graph.nodes[0]?.ports?.[0]).toMatchObject({ attachmentClass: 'corner' });
      return point;
    };
    const right = await run({ x: 350, y: 50 });
    const down = await run({ x: 50, y: 350 });
    expect(right).not.toEqual(down);
  });

  it('keeps a side-hinted free port off the corner even when ELK proposes a corner', async () => {
    const graph = { version: '3.0.0', id: 'side-not-corner', nodes: [
      { id: 'a', type: 'generic', dimensions: { width: 100, height: 60 },
        position: { x: 50, y: 50 }, pinned: true, ports: [
          { id: 'side', side: 'EAST', attachment: 'free', attachmentClass: 'side' },
        ] },
      { id: 'b', type: 'generic', dimensions: { width: 100, height: 60 },
        position: { x: 350, y: 350 }, pinned: true },
    ], edges: [{ id: 'edge', source: 'a', target: 'b', sourcePort: 'side' }] } as unknown as GraphIR;
    const result = await resolveSpatialLayout({ revision: 'side', graph, operation: 'load',
      candidateLayout: { nodes: [
        { id: 'a', position: { x: 50, y: 50 }, absolutePosition: { x: 50, y: 50 }, width: 100, height: 60 },
        { id: 'b', position: { x: 350, y: 350 }, absolutePosition: { x: 350, y: 350 }, width: 100, height: 60 },
      ], edges: [{ id: 'edge', sections: [{ startPoint: { x: 150, y: 110 }, bendPoints: [],
        endPoint: { x: 350, y: 350 } }] }], width: 450, height: 410,
      effectiveOptions: {}, diagnostics: [] } });
    const point = result.edges[0]!.sections[0]!.startPoint;
    expect(point.x).toBe(150);
    expect(point.y).toBeGreaterThan(50);
    expect(point.y).toBeLessThan(110);
  });
});
