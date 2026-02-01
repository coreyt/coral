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
  getNotation,
  getAllNotations,
  validateDiagram,
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
    it('returns at least 14 shapes', () => {
      const shapes = getAllShapes();
      expect(shapes.length).toBeGreaterThanOrEqual(14);
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
      expect(symbols.length).toBe(7);
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
    it('returns 5 symbol libraries', () => {
      const libraries = getAllLibraries();
      expect(libraries.length).toBe(5);
      expect(libraries.map((l) => l.id)).toContain('flowchart');
      expect(libraries.map((l) => l.id)).toContain('bpmn');
      expect(libraries.map((l) => l.id)).toContain('erd');
      expect(libraries.map((l) => l.id)).toContain('code');
      expect(libraries.map((l) => l.id)).toContain('architecture');
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
      expect(notation?.symbols.length).toBe(7);
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
    it('returns 5 notations', () => {
      const notations = getAllNotations();
      expect(notations.length).toBe(5);
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

    it('decision can have multiple outgoing', () => {
      const notation = getNotation('flowchart')!;
      const rule = notation.connectionRules.find((r) => r.from === 'flowchart-decision');
      expect(rule).toBeDefined();
      expect(rule?.constraints?.maxOutgoing).toBe(3);
    });
  });
});

// ============================================================================
// Notation Validation Tests
// ============================================================================

describe('Notation Validation', () => {
  describe('validateDiagram', () => {
    it('returns error for unknown notation', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];
      const results = validateDiagram('unknown', nodes, edges);

      expect(results.length).toBe(1);
      expect(results[0].ruleId).toBe('unknown-notation');
      expect(results[0].severity).toBe('error');
    });

    it('returns empty array for valid diagram', () => {
      const nodes: GraphNode[] = [
        { id: 'start', type: 'flowchart-terminal', properties: { variant: 'start' } },
        { id: 'process', type: 'flowchart-process' },
        { id: 'end', type: 'flowchart-terminal', properties: { variant: 'end' } },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'start', target: 'process' },
        { id: 'e2', source: 'process', target: 'end' },
      ];

      const results = validateDiagram('flowchart', nodes, edges);
      // May have warnings but should work
      expect(results.filter((r) => r.severity === 'error').length).toBe(0);
    });

    it('validates entry point requirements', () => {
      const nodes: GraphNode[] = [
        { id: 'process', type: 'flowchart-process' },
      ];
      const edges: GraphEdge[] = [];

      const results = validateDiagram('flowchart', nodes, edges);
      const entryPointError = results.find((r) => r.ruleId === 'entry-point-min');
      expect(entryPointError).toBeDefined();
    });

    it('validates exit point requirements', () => {
      const nodes: GraphNode[] = [
        { id: 'start', type: 'flowchart-terminal', properties: { variant: 'start' } },
        { id: 'process', type: 'flowchart-process' },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'start', target: 'process' },
      ];

      const results = validateDiagram('flowchart', nodes, edges);
      const exitPointError = results.find((r) => r.ruleId === 'exit-point-min');
      expect(exitPointError).toBeDefined();
    });

    it('validates decision must have multiple outgoing', () => {
      const nodes: GraphNode[] = [
        { id: 'start', type: 'flowchart-terminal', properties: { variant: 'start' } },
        { id: 'decision', type: 'flowchart-decision' },
        { id: 'end', type: 'flowchart-terminal', properties: { variant: 'end' } },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'start', target: 'decision' },
        { id: 'e2', source: 'decision', target: 'end' },
      ];

      const results = validateDiagram('flowchart', nodes, edges);
      const decisionError = results.find((r) => r.ruleId === 'decision-branches');
      expect(decisionError).toBeDefined();
      expect(decisionError?.nodeId).toBe('decision');
    });

    it('warns about orphaned nodes', () => {
      const nodes: GraphNode[] = [
        { id: 'start', type: 'flowchart-terminal', properties: { variant: 'start' } },
        { id: 'orphan', type: 'flowchart-process' },
        { id: 'end', type: 'flowchart-terminal', properties: { variant: 'end' } },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'start', target: 'end' },
      ];

      const results = validateDiagram('flowchart', nodes, edges);
      const orphanWarning = results.find((r) => r.nodeId === 'orphan');
      expect(orphanWarning).toBeDefined();
      expect(orphanWarning?.severity).toBe('warning');
    });
  });

  describe('notationRegistry.validate', () => {
    it('validates through registry', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];
      const results = notationRegistry.validate('flowchart', nodes, edges);

      // Should have entry/exit point errors
      expect(results.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Re-exported Library Tests
// ============================================================================

describe('Re-exported Libraries', () => {
  it('exports flowchartSymbols', () => {
    expect(flowchartSymbols).toBeDefined();
    expect(flowchartSymbols.id).toBe('flowchart');
    expect(flowchartSymbols.symbols.length).toBe(7);
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
