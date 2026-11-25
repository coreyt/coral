import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GraphEdge, GraphNode, NotationDefinition, SymbolDefinition } from '../src/types.js';
import {
  glyphRegistry, markerDomId028, markerId, markerPrimitives, notationRegistry, placeEndpointLabels, symbolRegistry,
  resolveEdgeAppearance, resolveNodeAppearance, resolveRenderScene, resolveShapePath, resolveSymbolIndex,
  renderSvg, renderSymbolId,
  shapeRegistry, symbolMarkerName, symbolMarkerPrimitives, visualStyle028,
} from '../src/index.js';

const theme = { fill: '#fff', stroke: '#111', text: '#222', edge: '#333' };
const nodes = [
  { id: 'web', type: 'service', symbol: 'arch-service', variant: 'web', label: 'Web', position: { x: 0, y: 0 } },
  { id: 'db', type: 'database', symbol: 'arch-database', label: 'DB', position: { x: 200, y: 0 } },
] as GraphNode[];

describe('Slice 40 notation render scene', () => {
  it('keeps installed symbols bound to a real stencil and refuses a missing resolved shape', () => {
    for (const symbol of symbolRegistry.getAll()) {
      expect(shapeRegistry.get(symbol.shape), symbol.id).toBeDefined();
    }
    const lookup = shapeRegistry.get.bind(shapeRegistry);
    const stub = vi.spyOn(shapeRegistry, 'get').mockImplementation((id) =>
      id === 'diamond' ? undefined : lookup(id));
    try {
      const graph = { nodes: [{ id: 'review', type: 'decision' }] as GraphNode[],
        edges: [] as GraphEdge[], metadata: { notation: 'flowchart' } };
      expect(() => resolveRenderScene(graph)).toThrow(/render\.capability\.unknown-shape.*review/);
      expect(() => renderSvg(graph)).toThrow(/render\.capability\.unknown-shape.*review/);
      expect(() => resolveNodeAppearance(graph.nodes[0]!, theme, 'flowchart'))
        .toThrow(/render\.capability\.unknown-shape.*review/);
    } finally {
      stub.mockRestore();
    }
  });

  it('refuses unknown explicit symbols and variants instead of substituting a rectangle', () => {
    const unknownSymbol = { nodes: [{ id: 'api', type: 'service', symbol: 'missing-symbol' }] as GraphNode[],
      edges: [] as GraphEdge[], metadata: { notation: 'architecture' } };
    expect(() => resolveRenderScene(unknownSymbol)).toThrow(/render\.capability\.unknown-symbol.*api/);
    expect(() => renderSvg(unknownSymbol)).toThrow(/render\.capability\.unknown-symbol.*api/);

    const unknownVariant = { nodes: [{ id: 'api', type: 'service', symbol: 'arch-service',
      variant: 'missing-variant' }] as GraphNode[], edges: [] as GraphEdge[],
      metadata: { notation: 'architecture' } };
    expect(() => resolveRenderScene(unknownVariant)).toThrow(/render\.capability\.unknown-variant.*api/);
    expect(() => renderSvg(unknownVariant)).toThrow(/render\.capability\.unknown-variant.*api/);
    const genericVariant = { nodes: [{ id: 'generic', type: 'unmapped', variant: 'special' }] as GraphNode[],
      edges: [] as GraphEdge[], metadata: { notation: 'architecture' } };
    expect(() => resolveRenderScene(genericVariant)).toThrow(/render\.capability\.unknown-variant.*generic/);
    expect(() => renderSvg(genericVariant)).toThrow(/render\.capability\.unknown-variant.*generic/);
    try {
      resolveRenderScene(unknownVariant);
      throw new Error('Expected a capability diagnostic');
    } catch (error) {
      expect(error).toMatchObject({ diagnostics: [{
        code: 'render.capability.unknown-variant', nodeId: 'api',
      }] });
    }

    const nested = { nodes: [{ id: 'group', type: 'group', children: [
      { id: 'child', type: 'service', symbol: 'missing-symbol' },
    ] }] as GraphNode[], edges: [] as GraphEdge[], metadata: { notation: 'architecture' } };
    expect(() => resolveRenderScene(nested)).toThrow(/render\.capability\.unknown-symbol.*child/);

    const foreignKnown = { nodes: [{ id: 'api', type: 'service', symbol: 'flowchart-process' }] as GraphNode[],
      edges: [] as GraphEdge[], metadata: { notation: 'architecture' } };
    expect(resolveRenderScene(foreignKnown).nodes[0]?.symbolId).toBe('flowchart-process');
    expect(renderSvg(foreignKnown)).toContain('<svg');

    expect(() => renderSvg({ ...foreignKnown, metadata: { notation: 'missing-profile' } }))
      .toThrow(/render\.capability\.unknown-profile/);
  });
  it('refuses an unknown explicit symbol or variant even without a notation profile', () => {
    const unknownSymbol = { nodes: [{ id: 'api', type: 'service', symbol: 'not-a-symbol' }] as GraphNode[],
      edges: [] as GraphEdge[] };
    expect(() => resolveRenderScene(unknownSymbol)).toThrow(/render\.capability\.unknown-symbol.*api/);
    expect(() => renderSvg(unknownSymbol)).toThrow(/render\.capability\.unknown-symbol.*api/);

    const unknownVariant = { nodes: [{ id: 'api', type: 'service', symbol: 'arch-service',
      variant: 'not-a-variant' }] as GraphNode[], edges: [] as GraphEdge[] };
    expect(() => resolveRenderScene(unknownVariant)).toThrow(/render\.capability\.unknown-variant.*api/);
    expect(() => renderSvg(unknownVariant)).toThrow(/render\.capability\.unknown-variant.*api/);
    expect(resolveRenderScene({ nodes: [{ id: 'plain', type: 'service' }], edges: [] }).nodes[0]?.symbolId)
      .toBeUndefined();
  });
  it('uses profile-scoped words and does not infer architecture from an unprofiled type', () => {
    const node = { id: 'api', type: 'service' } as GraphNode;
    expect(resolveRenderScene({ nodes: [node], edges: [], metadata: { notation: 'architecture' } }).nodes[0].symbolId)
      .toBe('arch-service');
    expect(resolveRenderScene({ nodes: [node], edges: [], metadata: { notation: 'bpmn' } }).nodes[0].symbolId)
      .toBeUndefined();
    expect(resolveRenderScene({ nodes: [node], edges: [] }).nodes[0].symbolId)
      .toBeUndefined();
    expect(() => resolveRenderScene({ nodes: [{ ...node, symbol: '' }], edges: [],
      metadata: { notation: 'architecture' } })).toThrow(/render\.capability\.unknown-symbol/);
  });

  it('does not render through a notation that contradicts the portable UML family profile', () => {
    const graph = { nodes: [{ id: 'Order', type: 'class' }] as GraphNode[],
      edges: [] as GraphEdge[], metadata: { notation: 'uml-sequence' },
      profile: { id: 'uml' as const, kind: 'class' as const, version: '1.0.0' as const } };
    expect(() => resolveRenderScene(graph)).toThrow(/render\.capability\.profile-contradiction/);
    expect(() => renderSvg(graph)).toThrow(/render\.capability\.profile-contradiction/);
  });

  it('resolves a profile-only UML sequence participant through its family catalog', () => {
    const graph = { nodes: [{ id: 'Client', type: 'participant' }] as GraphNode[],
      edges: [] as GraphEdge[], profile: { id: 'uml' as const,
        kind: 'sequence' as const, version: '1.0.0' as const } };
    expect(resolveRenderScene(graph).nodes[0]?.symbolId).toBe('uml-participant');
  });

  it('keeps the approved glyph registry finite, named, and fail-closed', () => {
    expect(glyphRegistry.getAll().map((glyph) => glyph.id)).toEqual([
      'globe', 'api', 'cog', 'shield', 'user', 'gear', 'code', 'hand',
    ]);
    expect(glyphRegistry.get('globe')?.name).toBe('Web globe');
    expect(() => glyphRegistry.require('missing')).toThrow(/render\.catalog\.unsupported-glyph/);
  });

  it('resolves node variant visuals and decorations once', () => {
    expect(resolveNodeAppearance(nodes[0], theme)).toMatchObject({
      symbolId: 'arch-service', shapeId: 'rectangle',
      style: { fill: '#e3f2fd', stroke: '#1976d2', strokeWidth: 2 },
      glyph: { id: 'globe', name: 'Web globe' },
    });
    expect(resolveNodeAppearance({ id: 'abstract', type: 'class', symbol: 'code-class', variant: 'abstract' } as GraphNode, theme))
      .toMatchObject({ text: { fontStyle: 'italic' } });
    expect(resolveNodeAppearance({ id: 'static', type: 'property', symbol: 'code-variable', variant: 'static' } as GraphNode, theme))
      .toMatchObject({ text: { textDecoration: 'underline' } });
  });

  it('resolves every finite BPMN symbol marker and shared rounded geometry', () => {
    for (const marker of ['X', '+', 'O', 'pentagon']) {
      expect(symbolMarkerPrimitives(marker)).toEqual(expect.arrayContaining([
        expect.objectContaining({ d: expect.any(String) }),
      ]));
    }
    expect(() => symbolMarkerPrimitives('word')).toThrow(/invalid-symbol-marker/);
    expect(resolveShapePath(shapeRegistry.get('rectangle')!, { cornerRadius: 8 }))
      .toContain('Q 100,0 100,8');
  });

  it('names every finite BPMN symbol marker for assistive technology', () => {
    expect(['X', '+', 'O', 'pentagon'].map(symbolMarkerName)).toEqual([
      'Exclusive gateway marker', 'Parallel gateway marker', 'Inclusive gateway marker', 'Event-based gateway marker',
    ]);
    expect(() => symbolMarkerName('word')).toThrow('render.catalog.invalid-symbol-marker: word');
  });

  it('renders only eligible BPMN solid arrows as filled Sequence Flow without mutating source geometry', () => {
    const bpmnNodes = [{ id: 'begin', type: 'startEvent' }, { id: 'work', type: 'task' },
      { id: 'data', type: 'bpmn-data-object' }] as GraphNode[];
    const arrow = { id: 'flow', source: 'begin', target: 'work',
      sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
      targetEnd: { marker: { kind: 'arrow', fill: 'open' } },
    } as GraphEdge;
    const graph = { nodes: bpmnNodes, edges: [arrow], metadata: { notation: 'bpmn' } };
    const scene = resolveRenderScene(graph);
    expect(scene.edges[0].target.marker).toEqual({ kind: 'triangle', fill: 'filled' });
    expect(scene.edges[0].style.lineStyle).toBe('solid');
    expect(arrow.targetEnd?.marker).toEqual({ kind: 'arrow', fill: 'open' });
    const svg = renderSvg(graph);
    expect(svg).toContain(`marker-end="url(#${markerDomId028({ kind: 'triangle', fill: 'filled' },
      visualStyle028('lowfi').ink, 'standalone')})"`);

    const neutral = resolveEdgeAppearance({ ...arrow, id: 'neutral',
      sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
      targetEnd: { marker: { kind: 'none', fill: 'unspecified' } },
    }, bpmnNodes, 'bpmn', '#999');
    expect(neutral.target.marker).toEqual({ kind: 'none', fill: 'unspecified' });
    expect(neutral.style.stroke).toBe('#999');
    const unspecified = resolveEdgeAppearance({ id: 'graph-only', source: 'begin', target: 'work' },
      bpmnNodes, 'bpmn', '#999');
    expect(unspecified.target.marker).toBeUndefined();
    const dashed = resolveEdgeAppearance({ ...arrow, id: 'dashed',
      style: { lineStyle: 'dashed' } }, bpmnNodes, 'bpmn', '#999');
    expect(dashed.target.marker).toEqual({ kind: 'arrow', fill: 'open' });
    const data = resolveEdgeAppearance({ ...arrow, id: 'data', source: 'work', target: 'data' },
      bpmnNodes, 'bpmn', '#999');
    expect(data.target.marker).toEqual({ kind: 'arrow', fill: 'open' });
  });

  it('resolves catalog styles before authored line and endpoint overrides', () => {
    const edge = {
      id: 'data', source: 'web', target: 'db', type: 'data', style: { lineStyle: 'dotted' },
      sourceEnd: { role: 'writer', multiplicity: { lower: 1, upper: 1 }, navigability: 'non-navigable', marker: { kind: 'diamond', fill: 'open' } },
      targetEnd: { role: 'store', multiplicity: { lower: 0, upper: '*' }, navigability: 'navigable', marker: { kind: 'triangle', fill: 'filled' } },
    } as GraphEdge;
    const resolved = resolveEdgeAppearance(edge, nodes, 'architecture', '#999');
    expect(resolved.style).toEqual({ stroke: '#4caf50', strokeWidth: 2, lineStyle: 'dotted', strokeDasharray: '2,4' });
    expect(resolved.source).toMatchObject({ role: 'writer', multiplicity: '1', navigability: 'non-navigable', marker: { kind: 'diamond', fill: 'open' } });
    expect(resolved.target).toMatchObject({ role: 'store', multiplicity: '0..*', navigability: 'navigable', marker: { kind: 'triangle', fill: 'filled' } });
  });

  it('renders an end formerly written as a legacy arrow the same on canvas and in SVG (L1, R-063 AC-5)', () => {
    // Coral 0.2.5 read `data {"style":{"targetArrow":"diamond"}}` as this end;
    // Language 1.1.0 writes it compactly after the target reference,
    // `a -> b (diamond)`, which parses to this GraphIR, so both adapters draw
    // one marker.
    const marker = { kind: 'diamond', fill: 'unspecified' } as const;
    const edge = { id: 'e', source: 'web', target: 'db', targetEnd: { marker }, sourceEnd: { marker: { kind: 'circle', fill: 'unspecified' } } } as GraphEdge;
    const canvas = resolveEdgeAppearance(edge, nodes, undefined, '#333');
    expect(canvas.target.marker).toEqual(marker);
    expect(canvas.source.marker).toEqual({ kind: 'circle', fill: 'unspecified' });
    const svg = renderSvg({ nodes, edges: [edge] });
    // The SVG adapter resolves its own theme stroke; the marker kind and fill match.
    const strokes = [...new Set([...svg.matchAll(/stroke="([^"]+)"/g)].map((match) => match[1]))];
    expect(strokes.some((stroke) => svg.includes(`marker-end="url(#${markerDomId028(marker, stroke, 'standalone')})"`))).toBe(true);
    expect(strokes.some((stroke) =>
      svg.includes(`marker-start="url(#${markerDomId028({ kind: 'circle', fill: 'unspecified' }, stroke, 'standalone')})"`))).toBe(true);
  });

  it('resolves the line-style dash pattern once for every adapter', () => {
    const dash = (lineStyle: 'solid' | 'dashed' | 'dotted') => resolveEdgeAppearance(
      { id: 'e', source: 'web', target: 'db', style: { lineStyle } }, nodes, undefined, '#000').style;
    expect(dash('dashed').strokeDasharray).toBe('6,4');
    expect(dash('dotted').strokeDasharray).toBe('2,4');
    expect(dash('solid')).not.toHaveProperty('strokeDasharray');
  });

  it('advertises only catalog icon tokens that resolve in the glyph registry', () => {
    const icons = notationRegistry.getAll().flatMap((notation) => notation.symbols.flatMap((id) =>
      Object.entries(symbolRegistry.get(id)?.variants ?? {}).flatMap(([variant, value]) =>
        value.icon ? [{ at: `${notation.id}/${id}/${variant}`, icon: value.icon }] : [])));
    expect(icons.length).toBeGreaterThan(0);
    for (const { at, icon } of icons) expect(glyphRegistry.get(icon), `${at} -> ${icon}`).toBeDefined();
    expect(new Set(icons.map(({ icon }) => icon))).toEqual(new Set(glyphRegistry.getAll().map((glyph) => glyph.id)));
  });

  it('selects the first matching connection rule before the notation default', () => {
    const matched = resolveEdgeAppearance({ id: 'rule', source: 'web', target: 'db' }, nodes, 'architecture', '#999');
    expect(matched.style).toMatchObject({ stroke: '#4caf50', strokeWidth: 2 });
    const defaulted = resolveEdgeAppearance({ id: 'default', source: 'db', target: 'web' }, nodes, 'architecture', '#999');
    expect(defaulted.style).toMatchObject({ stroke: '#424242', strokeWidth: 1.5 });
  });

  it('retains same-marker endpoints with different navigability', () => {
    const edge = {
      id: 'nav', source: 'web', target: 'db',
      sourceEnd: { navigability: 'non-navigable', marker: { kind: 'circle', fill: 'open' } },
      targetEnd: { navigability: 'navigable', marker: { kind: 'circle', fill: 'open' } },
    } as GraphEdge;
    const resolved = resolveEdgeAppearance(edge, nodes, 'architecture', '#999');
    expect(resolved.source.marker).toEqual(resolved.target.marker);
    expect(resolved.source.navigability).toBe('non-navigable');
    expect(resolved.target.navigability).toBe('navigable');
  });

  it('projects navigability only when no authored or catalog marker exists', () => {
    const navigable = resolveEdgeAppearance({
      id: 'nav', source: 'web', target: 'db', sourceEnd: { navigability: 'navigable' },
    }, nodes, undefined, '#000');
    expect(navigable.source.marker).toEqual({ kind: 'arrow', fill: 'open' });
    const explicitNone = resolveEdgeAppearance({
      id: 'none', source: 'web', target: 'db',
      sourceEnd: { navigability: 'navigable', marker: { kind: 'none', fill: 'unspecified' } },
    }, nodes, undefined, '#000');
    expect(explicitNone.source.marker).toEqual({ kind: 'none', fill: 'unspecified' });
  });

  it('defines finite geometry for every marker kind and fill', () => {
    const kinds = ['none', 'arrow', 'triangle', 'diamond', 'circle', 'bar', 'crow-foot', 'zero-or-one', 'one', 'zero-or-many', 'one-or-many'] as const;
    const fills = ['open', 'filled', 'unspecified'] as const;
    for (const kind of kinds) for (const fill of fills) {
      const primitives = markerPrimitives({ kind, fill });
      expect(primitives.every((item) => !/NaN|Infinity/.test(item.d))).toBe(true);
      if (kind === 'none') expect(primitives).toHaveLength(0);
      else expect(primitives.length).toBeGreaterThan(0);
    }
    expect(markerPrimitives({ kind: 'triangle', fill: 'unspecified' })[0]?.filled).toBe(false);
    expect(markerPrimitives({ kind: 'diamond', fill: 'filled' })[0]?.filled).toBe(true);
  });

  it('places endpoint labels deterministically for normal and degenerate routes', () => {
    expect(placeEndpointLabels(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { role: 'source', multiplicity: '1', navigability: 'unspecified' },
      { role: 'target', multiplicity: '0..*', navigability: 'unspecified' },
      { x: 0, y: 0 }, { x: 100, y: 0 },
    )).toEqual([
      { endpoint: 'source', kind: 'role', text: 'source', x: 14, y: -10 },
      { endpoint: 'source', kind: 'multiplicity', text: '1', x: 14, y: 10 },
      { endpoint: 'target', kind: 'role', text: 'target', x: 86, y: -10 },
      { endpoint: 'target', kind: 'multiplicity', text: '0..*', x: 86, y: 10 },
    ]);
    expect(placeEndpointLabels(
      [{ x: 3, y: 3 }, { x: 3, y: 3 }],
      { role: 'same', navigability: 'unspecified' }, {},
      { x: 3, y: 3 }, { x: 3, y: 3 },
    )).toEqual([{ endpoint: 'source', kind: 'role', text: 'same', x: 17, y: -7 }]);
    expect(placeEndpointLabels(
      [{ x: 0, y: 100 }, { x: 0, y: 0 }],
      { role: 'down' }, { role: 'up' }, { x: 0, y: 100 }, { x: 0, y: 0 },
    )).toEqual([
      { endpoint: 'source', kind: 'role', text: 'down', x: -10, y: 86 },
      { endpoint: 'target', kind: 'role', text: 'up', x: -10, y: 14 },
    ]);
  });

  it('builds a serializable byte-stable scene', () => {
    const graph = { nodes, edges: [{ id: 'e', source: 'web', target: 'db', type: 'data' }] as GraphEdge[], metadata: { notation: 'architecture' } };
    const first = resolveRenderScene(graph);
    expect(JSON.stringify(first)).toBe(JSON.stringify(resolveRenderScene(graph)));
    expect(first.nodes[0]).toMatchObject({ glyph: { id: 'globe' } });
    expect(first.edges[0]).toMatchObject({ style: { stroke: '#4caf50', strokeWidth: 2 } });
  });

  it('pins exact marker geometry and fill for every kind', () => {
    const geometry = {
      arrow: 'M2 2 L14 8 L2 14',
      triangle: 'M2 2 L14 8 L2 14 Z',
      diamond: 'M1 8 L8 2 L15 8 L8 14 Z',
      circle: 'M8 2 A6 6 0 1 1 8 14 A6 6 0 1 1 8 2',
      bar: 'M10 2 L10 14',
      'crow-foot': 'M3 8 L14 2 M3 8 L14 8 M3 8 L14 14',
      'zero-or-one': 'M5 5 A3 3 0 1 1 5 11 A3 3 0 1 1 5 5 M11 2 L11 14',
      one: 'M7 2 L7 14 M12 2 L12 14',
      'zero-or-many': 'M4 5 A3 3 0 1 1 4 11 A3 3 0 1 1 4 5 M8 8 L14 2 M8 8 L14 8 M8 8 L14 14',
      'one-or-many': 'M5 2 L5 14 M8 8 L14 2 M8 8 L14 8 M8 8 L14 14',
    } as const;
    const fillable = new Set(['arrow', 'triangle', 'diamond', 'circle']);
    expect(new Set(Object.values(geometry)).size).toBe(Object.keys(geometry).length);
    for (const [kind, d] of Object.entries(geometry) as [keyof typeof geometry, string][]) {
      for (const fill of ['open', 'filled', 'unspecified'] as const) {
        expect(markerPrimitives({ kind, fill }), `${kind}/${fill}`)
          .toEqual([{ d, filled: fillable.has(kind) && fill === 'filled' }]);
      }
    }
  });

  it('keys marker definitions by descriptor and stroke', () => {
    const marker = { kind: 'arrow', fill: 'filled' } as const;
    expect(markerId(marker, '#111')).not.toBe(markerId(marker, '#222'));
    expect(markerId(marker, '#111')).toBe(markerId({ ...marker }, '#111'));
  });

  it('projects the catalog source arrow of a bidirectional style', () => {
    const resolved = resolveEdgeAppearance({ id: 'bi', source: 'web', target: 'db', type: 'bidirectional' }, nodes, 'architecture', '#999');
    expect(resolved.style.stroke).toBe('#2196f3');
    expect(resolved.source.marker).toEqual({ kind: 'arrow', fill: 'unspecified' });
    expect(resolved.target.marker).toEqual({ kind: 'arrow', fill: 'unspecified' });
  });
});

describe('Slice 40 resolver precedence and failure', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  const style = (stroke: string, strokeWidth = 1) => ({ name: stroke, targetArrow: 'arrow' as const, lineStyle: 'solid' as const, stroke, strokeWidth });
  const withNotation = (notation: Partial<NotationDefinition>) => {
    const original = notationRegistry.get;
    vi.spyOn(notationRegistry, 'get').mockImplementation((id) => id === 'synthetic'
      ? { id: 'synthetic', name: 'Synthetic', version: '1', symbols: [], connectionRules: [], defaultEdgeStyle: 'base', ...notation }
      : original(id));
  };
  const withSymbol = (symbol: Partial<SymbolDefinition>) => {
    const original = symbolRegistry.get;
    vi.spyOn(symbolRegistry, 'get').mockImplementation((id) => id === 'synthetic-symbol'
      ? { id: 'synthetic-symbol', name: 'Synthetic', shape: 'rectangle', tags: [], ...symbol }
      : original(id));
  };
  const edge = { id: 'e', source: 'web', target: 'db' } as GraphEdge;

  it('fails closed when a connection rule names a missing style', () => {
    withNotation({ edgeStyles: { base: style('#000') }, connectionRules: [{ from: 'arch-service', to: ['arch-database'], edgeStyle: 'ghost' }] });
    expect(() => resolveEdgeAppearance(edge, nodes, 'synthetic', '#999')).toThrow('render.catalog.invalid: synthetic.ghost');
  });

  it('fails closed when the default style is missing', () => {
    withNotation({ edgeStyles: {}, defaultEdgeStyle: 'ghost' });
    expect(() => resolveEdgeAppearance(edge, nodes, 'synthetic', '#999')).toThrow('render.catalog.invalid: synthetic.ghost');
  });

  it('matches a connection rule only for its source variant', () => {
    withNotation({
      edgeStyles: { base: style('#000'), hot: style('#f00') },
      connectionRules: [{ from: 'arch-service', fromVariant: 'web', to: ['arch-database'], edgeStyle: 'hot' }],
    });
    expect(resolveEdgeAppearance(edge, nodes, 'synthetic', '#999').style.stroke).toBe('#f00');
    const other = [{ ...nodes[0], variant: 'api' }, nodes[1]] as GraphNode[];
    expect(resolveEdgeAppearance(edge, other, 'synthetic', '#999').style.stroke).toBe('#000');
  });

  it('lets an unknown edge type fall through to rules and the default', () => {
    expect(resolveEdgeAppearance({ ...edge, type: 'nope' }, nodes, 'architecture', '#999').style.stroke).toBe('#4caf50');
    expect(resolveEdgeAppearance({ id: 'r', source: 'db', target: 'web', type: 'nope' }, nodes, 'architecture', '#999').style.stroke).toBe('#424242');
  });

  it('uses the theme edge and a default arrow when no catalog applies', () => {
    const resolved = resolveEdgeAppearance(edge, nodes, undefined, '#abcdef');
    expect(resolved.style).toEqual({ stroke: '#abcdef', strokeWidth: 2, lineStyle: 'solid' });
    expect(resolved.target.marker).toEqual({ kind: 'arrow', fill: 'unspecified' });
    expect(resolved.source).toEqual({});
  });

  it('treats an unknown notation as absent', () => {
    expect(resolveEdgeAppearance(edge, nodes, 'no-such-notation', '#abcdef'))
      .toEqual(resolveEdgeAppearance(edge, nodes, undefined, '#abcdef'));
  });

  it('preserves a zero catalog stroke width', () => {
    withSymbol({ defaults: { strokeWidth: 0 } });
    expect(resolveNodeAppearance({ id: 'n', type: 'service', symbol: 'synthetic-symbol' } as GraphNode, theme).style.strokeWidth).toBe(0);
    withNotation({ edgeStyles: { base: style('#000', 0) } });
    expect(resolveEdgeAppearance(edge, nodes, 'synthetic', '#999').style.strokeWidth).toBe(0);
  });

  it('retains an authored none target marker over the catalog arrow', () => {
    const resolved = resolveEdgeAppearance({ ...edge, type: 'data', targetEnd: { marker: { kind: 'none', fill: 'unspecified' } } }, nodes, 'architecture', '#999');
    expect(resolved.target.marker).toEqual({ kind: 'none', fill: 'unspecified' });
  });

  it('does not mutate a deep-frozen input graph', () => {
    const freeze = <T>(value: T): T => {
      if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
      return value;
    };
    const graph = freeze({
      nodes: structuredClone(nodes),
      edges: [{ id: 'e', source: 'web', target: 'db', type: 'bidirectional',
        sourceEnd: { role: 'writer', multiplicity: { lower: 1, upper: 1 } } }] as GraphEdge[],
      metadata: { notation: 'architecture' },
    });
    const before = JSON.stringify(graph);
    expect(() => resolveRenderScene(graph)).not.toThrow();
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('resolves a catalog double outline', () => {
    withSymbol({ defaults: { doubleOutline: true } });
    expect(resolveNodeAppearance({ id: 'n', type: 'service', symbol: 'synthetic-symbol' } as GraphNode, theme).style.doubleOutline).toBe(true);
  });

  it('builds the endpoint symbol index once per scene, not per edge', () => {
    const counted = (edgeCount: number) => {
      let reads = 0;
      const graphNodes = nodes.map((node) => {
        const copy = { ...node } as GraphNode & { symbol?: string };
        const symbol = copy.symbol; delete copy.symbol;
        Object.defineProperty(copy, 'symbol', { get: () => { reads += 1; return symbol; }, enumerable: true });
        return copy;
      });
      const edges = Array.from({ length: edgeCount }, (_, i) => ({ id: `e${i}`, source: 'web', target: 'db' })) as GraphEdge[];
      resolveRenderScene({ nodes: graphNodes, edges, metadata: { notation: 'architecture' } });
      return reads;
    };
    expect(counted(20)).toBe(counted(1));
  });

  it('resolves identical edge appearance from node arrays and symbol indexes', () => {
    const index = resolveSymbolIndex(nodes);
    expect(index.get('web')).toEqual({ id: 'arch-service', variant: 'web', type: 'service' });
    for (const edge of [{ id: 'a', source: 'web', target: 'db' }, { id: 'b', source: 'db', target: 'web' },
      { id: 'c', source: 'web', target: 'db', type: 'data' }] as GraphEdge[]) {
      expect(resolveEdgeAppearance(edge, index, 'architecture', '#999'))
        .toEqual(resolveEdgeAppearance(edge, nodes, 'architecture', '#999'));
    }
  });

  it('resolves flowchart io and document symbols only within their profile', () => {
    expect(renderSymbolId({ id: 'i', type: 'io' } as GraphNode)).toBeUndefined();
    expect(renderSymbolId({ id: 'i', type: 'io' } as GraphNode, 'flowchart')).toBe('flowchart-io');
    expect(renderSymbolId({ id: 'd', type: 'document' } as GraphNode, 'flowchart')).toBe('flowchart-document');
    expect(resolveNodeAppearance({ id: 'i', type: 'io' } as GraphNode, theme, 'flowchart').shapeId)
      .toBe(symbolRegistry.get('flowchart-io')!.shape);
  });
});
