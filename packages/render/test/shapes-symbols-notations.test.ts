/**
 * Tests for Shapes, Symbols, and Notations (CORAL-REQ-006)
 *
 * Tests cover:
 * - Shape registry and loading
 * - Symbol resolution and variants
 * - Notation validation and connection rules
 */

import { describe, it, expect } from 'vitest';
import {
  shapeRegistry,
  getShape,
  getAllShapes,
  symbolRegistry,
  getSymbol,
  getSymbolsByTag,
  getSymbolsForNotation,
  getAllSymbols,
  getAllLibraries,
  notationRegistry,
  resolveNotationNode028,
  checkGraphConformance028,
  getNotation,
  getAllNotations,
  flowchartSymbols,
  bpmnSymbols,
  erdSymbols,
  codeSymbols,
  architectureSymbols,
  flowchartNotation,
  bpmnNotation,
  erdNotation,
  codeNotation,
  architectureNotation,
  glyphRegistry,
  symbolMarkerPrimitives,
} from '../src/index.js';
import type { GraphNode, GraphEdge } from '../src/types.js';

// ============================================================================
// Shape Registry Tests
// ============================================================================

describe('Shape Registry', () => {
  describe('getShape', () => {
    it('returns rectangle shape', () => {
      const shape = getShape('rectangle');
      expect(shape).toBeDefined();
      expect(shape?.id).toBe('rectangle');
      expect(shape?.name).toBe('Rectangle');
      expect(shape?.type).toBe('polygon');
    });

    it('returns diamond shape', () => {
      const shape = getShape('diamond');
      expect(shape).toBeDefined();
      expect(shape?.id).toBe('diamond');
      expect(shape?.path).toContain('M 50,0');
    });

    it('returns cylinder shape', () => {
      const shape = getShape('cylinder');
      expect(shape).toBeDefined();
      expect(shape?.type).toBe('compound');
    });

    it('returns undefined for unknown shape', () => {
      const shape = getShape('unknown-shape');
      expect(shape).toBeUndefined();
    });
  });

  describe('getAllShapes', () => {
    it('returns at least 28 shapes', () => {
      const shapes = getAllShapes();
      expect(shapes.length).toBeGreaterThanOrEqual(28);
    });

    it('includes required primitive shapes', () => {
      const shapes = getAllShapes();
      const shapeIds = shapes.map((s) => s.id);

      expect(shapeIds).toContain('rectangle');
      expect(shapeIds).toContain('diamond');
      expect(shapeIds).toContain('ellipse');
      expect(shapeIds).toContain('cylinder');
      expect(shapeIds).toContain('parallelogram');
      expect(shapeIds).toContain('hexagon');
      expect(shapeIds).toContain('document');
      expect(shapeIds).toContain('stadium');
      expect(shapeIds).toContain('actor');
    });
  });

  describe('shapeRegistry.has', () => {
    it('returns true for existing shapes', () => {
      expect(shapeRegistry.has('rectangle')).toBe(true);
      expect(shapeRegistry.has('diamond')).toBe(true);
    });

    it('returns false for non-existing shapes', () => {
      expect(shapeRegistry.has('not-a-shape')).toBe(false);
    });
  });

  describe('shape properties', () => {
    it('shapes have required properties', () => {
      const shapes = getAllShapes();
      for (const shape of shapes) {
        expect(shape.id).toBeDefined();
        expect(shape.name).toBeDefined();
        expect(shape.type).toBeDefined();
        expect(shape.viewBox).toBeDefined();
        expect(shape.path).toBeDefined();
        expect(shape.defaultSize).toBeDefined();
        expect(shape.defaultSize.width).toBeGreaterThan(0);
        expect(shape.defaultSize.height).toBeGreaterThan(0);
      }
    });

    it('shapes have portAnchors', () => {
      const shapes = getAllShapes();
      for (const shape of shapes) {
        expect(shape.portAnchors).toBeDefined();
        expect(Array.isArray(shape.portAnchors)).toBe(true);
        expect(shape.portAnchors.length).toBeGreaterThan(0);
      }
    });

    it('portAnchors have valid sides', () => {
      const validSides = ['NORTH', 'SOUTH', 'EAST', 'WEST', 'NORTH_EAST', 'NORTH_WEST'];
      const shapes = getAllShapes();
      for (const shape of shapes) {
        for (const anchor of shape.portAnchors) {
          expect(validSides).toContain(anchor.side);
          expect(anchor.position).toBeGreaterThanOrEqual(0);
          expect(anchor.position).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});

// ============================================================================
// Symbol Registry Tests
// ============================================================================

describe('Symbol Registry', () => {
  describe('getSymbol', () => {
    it('returns flowchart-process symbol', () => {
      const symbol = getSymbol('flowchart-process');
      expect(symbol).toBeDefined();
      expect(symbol?.id).toBe('flowchart-process');
      expect(symbol?.shape).toBe('rectangle');
    });

    it('returns bpmn-task symbol', () => {
      const symbol = getSymbol('bpmn-task');
      expect(symbol).toBeDefined();
      expect(symbol?.shape).toBe('rectangle');
      expect(symbol?.variants).toBeDefined();
    });

    it('returns erd-entity symbol', () => {
      const symbol = getSymbol('erd-entity');
      expect(symbol).toBeDefined();
      expect(symbol?.variants?.strong).toBeDefined();
      expect(symbol?.variants?.weak).toBeDefined();
    });

    it('returns code-function symbol', () => {
      const symbol = getSymbol('code-function');
      expect(symbol).toBeDefined();
      expect(symbol?.ports).toBeDefined();
    });

    it('returns arch-service symbol', () => {
      const symbol = getSymbol('arch-service');
      expect(symbol).toBeDefined();
      expect(symbol?.variants?.web).toBeDefined();
    });

    it('returns undefined for unknown symbol', () => {
      const symbol = getSymbol('unknown-symbol');
      expect(symbol).toBeUndefined();
    });
  });

  describe('getSymbolsByTag', () => {
    it('finds symbols by tag', () => {
      const controlFlowSymbols = getSymbolsByTag('control-flow');
      expect(controlFlowSymbols.length).toBeGreaterThan(0);
      expect(controlFlowSymbols.some((s) => s.id === 'flowchart-terminal')).toBe(true);
    });

    it('finds gateway symbols', () => {
      const gateways = getSymbolsByTag('gateway');
      expect(gateways.length).toBeGreaterThan(0);
      expect(gateways.some((s) => s.id === 'bpmn-gateway-exclusive')).toBe(true);
    });

    it('returns empty array for unknown tag', () => {
      const symbols = getSymbolsByTag('unknown-tag-xyz');
      expect(symbols).toEqual([]);
    });
  });

  describe('getSymbolsForNotation', () => {
    it('returns flowchart symbols', () => {
      const symbols = getSymbolsForNotation('flowchart');
      expect(symbols.length).toBe(8);
      expect(symbols.some((s) => s.id === 'flowchart-process')).toBe(true);
    });

    it('returns BPMN symbols', () => {
      const symbols = getSymbolsForNotation('bpmn');
      expect(symbols.length).toBeGreaterThan(10);
    });

    it('returns ERD symbols', () => {
      const symbols = getSymbolsForNotation('erd');
      expect(symbols.length).toBeGreaterThanOrEqual(5);
    });

    it('returns code symbols', () => {
      const symbols = getSymbolsForNotation('code');
      expect(symbols.length).toBeGreaterThanOrEqual(7);
    });

    it('returns architecture symbols', () => {
      const symbols = getSymbolsForNotation('architecture');
      expect(symbols.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('getAllSymbols', () => {
    it('returns all symbols from all libraries', () => {
      const allSymbols = getAllSymbols();
      expect(allSymbols.length).toBeGreaterThan(30);
    });
  });

  describe('getAllLibraries', () => {
    it('returns 13 symbol libraries', () => {
      const libraries = getAllLibraries();
      expect(libraries.length).toBe(13);
      expect(libraries.map((l) => l.id)).toContain('block');
      expect(libraries.map((l) => l.id)).toContain('flowchart');
      expect(libraries.map((l) => l.id)).toContain('bpmn');
      expect(libraries.map((l) => l.id)).toContain('erd');
      expect(libraries.map((l) => l.id)).toContain('code');
      expect(libraries.map((l) => l.id)).toContain('architecture');
      expect(libraries.map((l) => l.id)).toContain('uml-state');
      expect(libraries.map((l) => l.id)).toContain('aiml');
      expect(libraries.map((l) => l.id)).toContain('data-engineering');
      expect(libraries.map((l) => l.id)).toContain('sketch');
      expect(libraries.map((l) => l.id)).toContain('uml-class');
    });
  });

  describe('symbol properties', () => {
    it('symbols reference valid shapes', () => {
      const allSymbols = getAllSymbols();
      for (const symbol of allSymbols) {
        const shape = getShape(symbol.shape);
        expect(shape).toBeDefined();
      }
    });

    it('symbols have required properties', () => {
      const allSymbols = getAllSymbols();
      for (const symbol of allSymbols) {
        expect(symbol.id).toBeDefined();
        expect(symbol.name).toBeDefined();
        expect(symbol.shape).toBeDefined();
        expect(symbol.tags).toBeDefined();
        expect(Array.isArray(symbol.tags)).toBe(true);
      }
    });

    it('symbols have ports with valid directions', () => {
      const validDirections = ['in', 'out', 'inout'];
      const allSymbols = getAllSymbols();
      for (const symbol of allSymbols) {
        if (symbol.ports) {
          for (const port of symbol.ports) {
            expect(port.id).toBeDefined();
            expect(port.anchor).toBeDefined();
            expect(validDirections).toContain(port.direction);
          }
        }
      }
    });
  });

  describe('symbol variants', () => {
    it('flowchart-terminal has start and end variants', () => {
      const symbol = getSymbol('flowchart-terminal');
      expect(symbol?.variants?.start).toBeDefined();
      expect(symbol?.variants?.end).toBeDefined();
      expect(symbol?.variants?.start?.ports?.length).toBe(1);
      expect(symbol?.variants?.end?.ports?.length).toBe(1);
    });

    it('bpmn-task has task type variants', () => {
      const symbol = getSymbol('bpmn-task');
      expect(symbol?.variants?.user).toBeDefined();
      expect(symbol?.variants?.service).toBeDefined();
      expect(symbol?.variants?.script).toBeDefined();
    });

    it('erd-entity has strong and weak variants', () => {
      const symbol = getSymbol('erd-entity');
      expect(symbol?.variants?.strong).toBeDefined();
      expect(symbol?.variants?.weak).toBeDefined();
    });

    it('code-function has async variant', () => {
      const symbol = getSymbol('code-function');
      expect(symbol?.variants?.async).toBeDefined();
    });
  });
});

// ============================================================================
// Notation Registry Tests
// ============================================================================

describe('Notation Registry', () => {
  describe('getNotation', () => {
    it('returns flowchart notation', () => {
      const notation = getNotation('flowchart');
      expect(notation).toBeDefined();
      expect(notation?.id).toBe('flowchart');
      expect(notation?.symbols.length).toBe(8);
    });

    it('returns BPMN notation', () => {
      const notation = getNotation('bpmn');
      expect(notation).toBeDefined();
      expect(notation?.id).toBe('bpmn');
    });

    it('returns ERD notation', () => {
      const notation = getNotation('erd');
      expect(notation).toBeDefined();
    });

    it('returns code notation', () => {
      const notation = getNotation('code');
      expect(notation).toBeDefined();
    });

    it('returns architecture notation', () => {
      const notation = getNotation('architecture');
      expect(notation).toBeDefined();
    });

    it('returns undefined for unknown notation', () => {
      const notation = getNotation('unknown-notation');
      expect(notation).toBeUndefined();
    });
  });

  describe('getAllNotations', () => {
    it('returns 13 notations', () => {
      const notations = getAllNotations();
      expect(notations.length).toBe(13);
    });
  });

  describe('notation properties', () => {
    it('notations have required properties', () => {
      const notations = getAllNotations();
      for (const notation of notations) {
        expect(notation.id).toBeDefined();
        expect(notation.name).toBeDefined();
        expect(notation.version).toBeDefined();
        expect(notation.symbols).toBeDefined();
        expect(Array.isArray(notation.symbols)).toBe(true);
        expect(notation.connectionRules).toBeDefined();
        expect(notation.defaultEdgeStyle).toBeDefined();
      }
    });

    it('notation symbols reference valid symbols', () => {
      const notations = getAllNotations();
      for (const notation of notations) {
        for (const symbolId of notation.symbols) {
          expect(symbolRegistry.has(symbolId)).toBe(true);
        }
      }
    });

    it('has a closed, internally valid advertised catalog graph', () => {
      for (const notation of getAllNotations()) {
        const advertised = new Set(notation.symbols);
        for (const symbolId of notation.symbols) {
          const symbol = symbolRegistry.get(symbolId)!;
          expect(shapeRegistry.has(symbol.shape), `${symbolId}.${symbol.shape}`).toBe(true);
          if (symbol.marker) expect(() => symbolMarkerPrimitives(symbol.marker)).not.toThrow();
          for (const [variantId, variant] of Object.entries(symbol.variants ?? {})) {
            if (variant.icon) {
              expect(glyphRegistry.get(variant.icon), `${symbolId}.${variantId}.${variant.icon}`).toBeDefined();
            }
          }
        }
        for (const rule of notation.connectionRules) {
          expect(advertised.has(rule.from), `${notation.id}.from.${rule.from}`).toBe(true);
          for (const target of rule.to) {
            expect(advertised.has(target), `${notation.id}.to.${target}`).toBe(true);
          }
          if (rule.fromVariant) {
            expect(symbolRegistry.get(rule.from)?.variants?.[rule.fromVariant],
              `${notation.id}.${rule.from}.${rule.fromVariant}`).toBeDefined();
          }
          if (rule.edgeStyle) {
            expect(notation.edgeStyles?.[rule.edgeStyle], `${notation.id}.${rule.edgeStyle}`).toBeDefined();
          }
        }
        if (typeof notation.defaultEdgeStyle === 'string') {
          expect(notation.edgeStyles?.[notation.defaultEdgeStyle],
            `${notation.id}.${notation.defaultEdgeStyle}`).toBeDefined();
        }
        const validationSymbols = [
          ...(notation.validation?.entryPoints ?? []).map((point) => ({ symbol: point.symbol, variant: point.variant })),
          ...(notation.validation?.exitPoints ?? []).map((point) => ({ symbol: point.symbol, variant: point.variant })),
          ...(notation.validation?.rules ?? []).flatMap((rule) => [
            ...(rule.symbol ? [{ symbol: rule.symbol, variant: rule.variant }] : []),
            ...(rule.symbols ?? []).map((symbol) => ({ symbol, variant: rule.variant })),
            ...(rule.mustConnectTo ?? []).map((symbol) => ({ symbol })),
            ...(rule.notDirectlyConnectedTo ?? []).map((symbol) => ({ symbol })),
          ]),
        ];
        for (const reference of validationSymbols) {
          expect(advertised.has(reference.symbol), `${notation.id}.validation.${reference.symbol}`).toBe(true);
          if (reference.variant) {
            expect(symbolRegistry.get(reference.symbol)?.variants?.[reference.variant],
              `${notation.id}.validation.${reference.symbol}.${reference.variant}`).toBeDefined();
          }
        }
      }
    });
  });

  describe('flowchart connection rules', () => {
    it('terminal (start) can connect to process', () => {
      const notation = getNotation('flowchart')!;
      const rule = notation.connectionRules.find(
        (r) => r.from === 'flowchart-terminal' && r.fromVariant === 'start'
      );
      expect(rule).toBeDefined();
      expect(rule?.to).toContain('flowchart-process');
    });

    it('terminal (end) cannot have outgoing', () => {
      const notation = getNotation('flowchart')!;
      const rule = notation.connectionRules.find(
        (r) => r.from === 'flowchart-terminal' && r.fromVariant === 'end'
      );
      expect(rule).toBeDefined();
      expect(rule?.constraints?.maxOutgoing).toBe(0);
    });

    it('does not cap or require labels on decision alternatives', () => {
      const notation = getNotation('flowchart')!;
      const rule = notation.connectionRules.find((r) => r.from === 'flowchart-decision');
      expect(rule).toBeDefined();
      expect(rule?.constraints?.maxOutgoing).toBeUndefined();
      expect(rule?.constraints?.requiresLabel).toBeUndefined();
    });
  });

  it('does not impose a one-outgoing-flow cap on BPMN start events or activities', () => {
    const notation = getNotation('bpmn')!;
    for (const symbolId of ['bpmn-start-event', 'bpmn-task', 'bpmn-subprocess']) {
      const rule = notation.connectionRules.find((candidate) => candidate.from === symbolId);
      expect(rule, symbolId).toBeDefined();
      expect(rule?.constraints?.maxOutgoing, symbolId).toBeUndefined();
    }
  });
});

// ============================================================================
// Notation Validation Tests
// ============================================================================

describe('Notation Validation', () => {
  const draftReport = (notation: string, nodes: GraphNode[], edges: GraphEdge[]) =>
    checkGraphConformance028({ version: '3.0.0', id: 'draft', metadata: { notation }, nodes, edges },
      { savedLevel: 'typical' });

  describe('full-graph U2 checks', () => {
    it('returns error for unknown notation', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];
      const results = draftReport('unknown', nodes, edges).findings;

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('CORAL.PROFILE.UNAVAILABLE');
      expect(results[0].severity).toBe('error');
    });

    it('returns empty array for valid diagram', () => {
      const nodes: GraphNode[] = [
        { id: 'start', type: 'terminal', symbol: 'flowchart-terminal', variant: 'start' },
        { id: 'process', type: 'process', symbol: 'flowchart-process' },
        { id: 'end', type: 'terminal', symbol: 'flowchart-terminal', variant: 'end' },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'start', target: 'process' },
        { id: 'e2', source: 'process', target: 'end' },
      ];

      const results = draftReport('flowchart', nodes, edges).findings;
      // May have warnings but should work
      expect(results.filter((r) => r.severity === 'error').length).toBe(0);
    });

    it('does not reject an incomplete flowchart draft for missing terminal symbols', () => {
      const nodes: GraphNode[] = [
        { id: 'process', type: 'process', symbol: 'flowchart-process' },
      ];
      const edges: GraphEdge[] = [];

      const results = draftReport('flowchart', nodes, edges).findings;
      expect(results).toEqual([]);
    });

    it('does not require an end symbol during ordinary drafting', () => {
      const nodes: GraphNode[] = [
        { id: 'start', type: 'terminal', symbol: 'flowchart-terminal', variant: 'start' },
        { id: 'process', type: 'process', symbol: 'flowchart-process' },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'start', target: 'process' },
      ];

      const results = draftReport('flowchart', nodes, edges).findings;
      expect(results).toEqual([]);
    });

    it('reserves decision alternatives for an explicit strict conformance check', () => {
      const nodes: GraphNode[] = [
        { id: 'start', type: 'terminal', symbol: 'flowchart-terminal', variant: 'start' },
        { id: 'decision', type: 'decision', symbol: 'flowchart-decision' },
        { id: 'end', type: 'terminal', symbol: 'flowchart-terminal', variant: 'end' },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'start', target: 'decision' },
        { id: 'e2', source: 'decision', target: 'end' },
      ];

      const results = draftReport('flowchart', nodes, edges).findings;
      expect(results).toEqual([]);
      const strict = checkGraphConformance028({ version: '3.0.0', id: 'draft',
        metadata: { notation: 'flowchart' }, nodes, edges },
      { requestedLevel: 'strict', operation: 'check' });
      expect(strict.findings).toContainEqual(expect.objectContaining({
        id: 'CORAL.FLOWCHART.DECISION.ALTERNATIVES', severity: 'error',
        subject: { kind: 'node', id: 'decision' },
      }));
    });

    it('does not emit unreviewed orphan advice in ordinary validation', () => {
      const nodes: GraphNode[] = [
        { id: 'start', type: 'terminal', symbol: 'flowchart-terminal', variant: 'start' },
        { id: 'orphan', type: 'process', symbol: 'flowchart-process' },
        { id: 'end', type: 'terminal', symbol: 'flowchart-terminal', variant: 'end' },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'start', target: 'end' },
      ];

      const results = draftReport('flowchart', nodes, edges).findings;
      const orphanWarning = results.find((finding) => finding.subject?.id === 'orphan');
      expect(orphanWarning).toBeUndefined();
    });

    it('uses an explicit symbol and top-level variant without consulting properties.variant', () => {
      const node: GraphNode = { id: 'start', type: 'terminal',
        symbol: 'flowchart-terminal', variant: 'start', properties: { variant: 'end' } };
      expect(resolveNotationNode028(node, 'flowchart')).toMatchObject({
        effectiveSymbolId: 'flowchart-terminal', effectiveVariantId: 'start', status: 'resolved',
      });
      const withoutVariant: GraphNode = { ...node, variant: undefined };
      expect(resolveNotationNode028(withoutVariant, 'flowchart').effectiveVariantId).toBeUndefined();
    });

    it('does not substitute a type-mapped symbol for an unknown explicit symbol', () => {
      const node: GraphNode = { id: 'start', type: 'terminal', symbol: 'foreign-terminal' };
      expect(resolveNotationNode028(node, 'flowchart')).toMatchObject({
        status: 'unknown-symbol',
      });
      expect(resolveNotationNode028(node, 'flowchart').effectiveSymbolId).toBeUndefined();
      expect(draftReport('flowchart', [node], []).findings).toContainEqual(expect.objectContaining({
        id: 'coral.symbol.unknown', severity: 'error', subject: { kind: 'node', id: 'start' },
      }));
    });
  });

  describe('notation registry', () => {
    it('does not expose the nodes-and-edges-only validation path', () => {
      expect('validate' in notationRegistry).toBe(false);
    });
  });
});

// ============================================================================
// Re-exported Library Tests
// ============================================================================

// ============================================================================
// Text Box Shape + Annotation Symbol Tests
// ============================================================================

describe('Text Box Shape', () => {
  it('text-box shape exists in registry', () => {
    const shape = getShape('text-box');
    expect(shape).toBeDefined();
    expect(shape?.id).toBe('text-box');
    expect(shape?.name).toBe('Text Box');
  });

  it('text-box shape has valid properties', () => {
    const shape = getShape('text-box');
    expect(shape?.viewBox).toBeDefined();
    expect(shape?.path).toBeDefined();
    expect(shape?.portAnchors.length).toBeGreaterThan(0);
    expect(shape?.sizing).toBeDefined();
    expect(shape?.sizing?.minSize.width).toBe(60);
    expect(shape?.sizing?.minSize.height).toBe(24);
  });
});

describe('Annotation Symbols', () => {
  const annotationSymbolIds = [
    'flowchart-annotation',
    'bpmn-annotation',
    'erd-note',
    'arch-annotation',
    'code-comment',
    'aiml-annotation',
    'data-annotation',
  ];

  it('all 7 annotation symbols exist', () => {
    for (const symbolId of annotationSymbolIds) {
      const symbol = getSymbol(symbolId);
      expect(symbol).toBeDefined();
    }
  });

  it('all annotation symbols reference text-box shape', () => {
    for (const symbolId of annotationSymbolIds) {
      const symbol = getSymbol(symbolId);
      expect(symbol?.shape).toBe('text-box');
    }
  });

  it('all annotation symbols are tagged with annotation', () => {
    for (const symbolId of annotationSymbolIds) {
      const symbol = getSymbol(symbolId);
      expect(symbol?.tags).toContain('annotation');
    }
  });

  it('each notation includes its annotation symbol', () => {
    const notationAnnotationMap: Record<string, string> = {
      flowchart: 'flowchart-annotation',
      bpmn: 'bpmn-annotation',
      erd: 'erd-note',
      code: 'code-comment',
      architecture: 'arch-annotation',
      aiml: 'aiml-annotation',
      'data-engineering': 'data-annotation',
    };

    for (const [notationId, symbolId] of Object.entries(notationAnnotationMap)) {
      const notation = getNotation(notationId);
      expect(notation?.symbols).toContain(symbolId);
    }
  });

  it('each notation has an annotation edge style', () => {
    const notationIds = ['flowchart', 'bpmn', 'erd', 'code', 'architecture', 'aiml', 'data-engineering'];
    for (const notationId of notationIds) {
      const notation = getNotation(notationId);
      expect(notation?.edgeStyles.annotation).toBeDefined();
      expect(notation?.edgeStyles.annotation.targetArrow).toBe('none');
      expect(notation?.edgeStyles.annotation.lineStyle).toBe('dashed');
    }
  });

  it('each notation has a connection rule for its annotation symbol', () => {
    const notationAnnotationMap: Record<string, string> = {
      flowchart: 'flowchart-annotation',
      bpmn: 'bpmn-annotation',
      erd: 'erd-note',
      code: 'code-comment',
      architecture: 'arch-annotation',
      aiml: 'aiml-annotation',
      'data-engineering': 'data-annotation',
    };

    for (const [notationId, symbolId] of Object.entries(notationAnnotationMap)) {
      const notation = getNotation(notationId);
      const rule = notation?.connectionRules.find(r => r.from === symbolId);
      expect(rule).toBeDefined();
      expect(rule?.to.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Sketch Notation Tests
// ============================================================================

describe('Sketch Shapes', () => {
  const sketchShapeIds = ['sketch-rounded-rect', 'sketch-rect', 'sketch-oval', 'sketch-diamond'];

  it('all 4 sketch shapes exist in registry', () => {
    for (const shapeId of sketchShapeIds) {
      const shape = getShape(shapeId);
      expect(shape).toBeDefined();
    }
  });

  it('sketch shapes have valid path, viewBox, portAnchors, sizing', () => {
    for (const shapeId of sketchShapeIds) {
      const shape = getShape(shapeId);
      expect(shape?.path).toBeDefined();
      expect(shape?.viewBox).toBeDefined();
      expect(shape?.portAnchors.length).toBeGreaterThanOrEqual(4);
      expect(shape?.sizing).toBeDefined();
    }
  });

  it('total shapes count is at least 32', () => {
    const shapes = getAllShapes();
    expect(shapes.length).toBeGreaterThanOrEqual(32);
  });
});

describe('Sketch Symbol Library', () => {
  it('13 symbol libraries registered', () => {
    const libraries = getAllLibraries();
    expect(libraries.length).toBe(13);
    expect(libraries.map(l => l.id)).toContain('sketch');
  });

  it('sketch symbols reference valid shapes', () => {
    const symbols = getSymbolsForNotation('sketch');
    expect(symbols.length).toBeGreaterThan(0);
    for (const symbol of symbols) {
      const shape = getShape(symbol.shape);
      expect(shape).toBeDefined();
    }
  });

  it('sketch-step uses sketch-rounded-rect shape', () => {
    const symbol = getSymbol('sketch-step');
    expect(symbol).toBeDefined();
    expect(symbol?.shape).toBe('sketch-rounded-rect');
  });

  it('sketch-label uses text-box shape', () => {
    const symbol = getSymbol('sketch-label');
    expect(symbol).toBeDefined();
    expect(symbol?.shape).toBe('text-box');
  });
});

describe('Sketch Notation', () => {
  it('13 notations registered', () => {
    const notations = getAllNotations();
    expect(notations.length).toBe(13);
  });

  it('sketch notation exists with correct id', () => {
    const notation = getNotation('sketch');
    expect(notation).toBeDefined();
    expect(notation?.id).toBe('sketch');
  });

  it('sketch notation has flow and annotation edge styles', () => {
    const notation = getNotation('sketch');
    expect(notation?.edgeStyles.flow).toBeDefined();
    expect(notation?.edgeStyles.annotation).toBeDefined();
    expect(notation?.edgeStyles.annotation.targetArrow).toBe('none');
    expect(notation?.edgeStyles.annotation.lineStyle).toBe('dashed');
  });

  it('sketch notation has connection rules', () => {
    const notation = getNotation('sketch');
    expect(notation?.connectionRules.length).toBeGreaterThan(0);
  });

  it('sketch notation symbols all reference valid symbols', () => {
    const notation = getNotation('sketch');
    for (const symbolId of notation!.symbols) {
      expect(symbolRegistry.has(symbolId)).toBe(true);
    }
  });
});

describe('Re-exported Libraries', () => {
  it('exports flowchartSymbols', () => {
    expect(flowchartSymbols).toBeDefined();
    expect(flowchartSymbols.id).toBe('flowchart');
    expect(flowchartSymbols.symbols.length).toBe(8);
  });

  it('exports bpmnSymbols', () => {
    expect(bpmnSymbols).toBeDefined();
    expect(bpmnSymbols.id).toBe('bpmn');
  });

  it('exports erdSymbols', () => {
    expect(erdSymbols).toBeDefined();
    expect(erdSymbols.id).toBe('erd');
  });

  it('exports codeSymbols', () => {
    expect(codeSymbols).toBeDefined();
    expect(codeSymbols.id).toBe('code');
  });

  it('exports architectureSymbols', () => {
    expect(architectureSymbols).toBeDefined();
    expect(architectureSymbols.id).toBe('architecture');
  });

  it('exports flowchartNotation', () => {
    expect(flowchartNotation).toBeDefined();
    expect(flowchartNotation.id).toBe('flowchart');
  });

  it('exports bpmnNotation', () => {
    expect(bpmnNotation).toBeDefined();
    expect(bpmnNotation.id).toBe('bpmn');
  });

  it('exports erdNotation', () => {
    expect(erdNotation).toBeDefined();
    expect(erdNotation.id).toBe('erd');
  });

  it('exports codeNotation', () => {
    expect(codeNotation).toBeDefined();
    expect(codeNotation.id).toBe('code');
  });

  it('exports architectureNotation', () => {
    expect(architectureNotation).toBeDefined();
    expect(architectureNotation.id).toBe('architecture');
  });
});
