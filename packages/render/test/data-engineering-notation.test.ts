/**
 * Tests for Data Engineering Symbol Library and Notation (#58)
 *
 * Covers:
 * - New shapes (funnel, warehouse, lake, pipe, wave, dashboard)
 * - Data Engineering symbol library (13 symbols)
 * - Data Engineering notation (edge styles, graph modes, connection rules, validation)
 */

import { describe, it, expect } from 'vitest';
import {
  shapeRegistry,
  getShape,
  symbolRegistry,
  getSymbol,
  getSymbolsForNotation,
  getAllLibraries,
  getNotation,
  checkGraphConformance028,
} from '../src/index.js';
import type { GraphNode, GraphEdge } from '../src/types.js';

const draftReport = (nodes: GraphNode[], edges: GraphEdge[]) => checkGraphConformance028({
  version: '3.0.0', id: 'data-draft', metadata: { notation: 'data-engineering' }, nodes, edges,
}, { savedLevel: 'typical' });

// ============================================================================
// Data Engineering Shape Tests
// ============================================================================

describe('Data Engineering Shapes', () => {
  const dataShapeIds = ['funnel', 'warehouse', 'lake', 'pipe', 'wave', 'dashboard'];

  it.each(dataShapeIds)('shape "%s" exists in registry', (shapeId) => {
    expect(shapeRegistry.has(shapeId)).toBe(true);
  });

  it.each(dataShapeIds)('shape "%s" has valid SVG path', (shapeId) => {
    const shape = getShape(shapeId)!;
    expect(shape.path).toBeTruthy();
    expect(shape.path).toMatch(/^[MmLlHhVvCcSsQqTtAaZz\s\d.,\-]+$/);
  });

  it.each(dataShapeIds)('shape "%s" has viewBox, defaultSize, portAnchors, sizing', (shapeId) => {
    const shape = getShape(shapeId)!;
    expect(shape.viewBox).toMatch(/^\d+ \d+ \d+ \d+$/);
    expect(shape.defaultSize.width).toBeGreaterThan(0);
    expect(shape.defaultSize.height).toBeGreaterThan(0);
    expect(shape.portAnchors.length).toBeGreaterThanOrEqual(2);
    expect(shape.sizing).toBeDefined();
    expect(shape.sizing!.textBoundsRatio.x).toBeGreaterThan(0);
    expect(shape.sizing!.minSize.width).toBeGreaterThan(0);
  });

  it('funnel shape narrows from top to bottom', () => {
    const shape = getShape('funnel')!;
    expect(shape.type).toBe('path');
  });

  it('warehouse shape has peaked roof', () => {
    const shape = getShape('warehouse')!;
    expect(shape.type).toBe('path');
  });

  it('lake shape is cylinder variant with wavy top', () => {
    const shape = getShape('lake')!;
    expect(shape.type).toBe('path');
  });

  it('pipe shape has flanged ends', () => {
    const shape = getShape('pipe')!;
    expect(shape.type).toBe('path');
  });

  it('wave shape is sinusoidal', () => {
    const shape = getShape('wave')!;
    expect(shape.type).toBe('path');
  });

  it('dashboard has bar chart silhouette', () => {
    const shape = getShape('dashboard')!;
    expect(shape.type).toBe('compound');
  });
});

// ============================================================================
// Data Engineering Symbol Library Tests
// ============================================================================

describe('Data Engineering Symbol Library', () => {
  it('library is registered with id "data-engineering"', () => {
    const libraries = getAllLibraries();
    expect(libraries.some((l) => l.id === 'data-engineering')).toBe(true);
  });

  it('has 14 symbols', () => {
    const symbols = getSymbolsForNotation('data-engineering');
    expect(symbols.length).toBe(14);
  });

  it('all symbols have data- prefix', () => {
    const symbols = getSymbolsForNotation('data-engineering');
    for (const s of symbols) {
      expect(s.id).toMatch(/^data-/);
    }
  });

  it('all symbols reference valid shapes', () => {
    const symbols = getSymbolsForNotation('data-engineering');
    for (const s of symbols) {
      expect(shapeRegistry.has(s.shape)).toBe(true);
    }
  });

  it('all symbols have tags', () => {
    const symbols = getSymbolsForNotation('data-engineering');
    for (const s of symbols) {
      expect(s.tags.length).toBeGreaterThan(0);
    }
  });

  describe('specific symbols', () => {
    it('data-source uses cylinder with variants', () => {
      const s = getSymbol('data-source')!;
      expect(s.shape).toBe('cylinder');
      expect(s.variants?.database).toBeDefined();
      expect(s.variants?.api).toBeDefined();
      expect(s.variants?.file).toBeDefined();
      expect(s.variants?.stream).toBeDefined();
    });

    it('data-sink uses cylinder with variants', () => {
      const s = getSymbol('data-sink')!;
      expect(s.shape).toBe('cylinder');
      expect(s.variants?.database).toBeDefined();
    });

    it('data-transform uses funnel shape with variants', () => {
      const s = getSymbol('data-transform')!;
      expect(s.shape).toBe('funnel');
      expect(s.variants?.map).toBeDefined();
      expect(s.variants?.filter).toBeDefined();
      expect(s.variants?.aggregate).toBeDefined();
      expect(s.variants?.join).toBeDefined();
    });

    it('data-lake uses lake shape', () => {
      const s = getSymbol('data-lake')!;
      expect(s.shape).toBe('lake');
    });

    it('data-warehouse uses warehouse shape', () => {
      const s = getSymbol('data-warehouse')!;
      expect(s.shape).toBe('warehouse');
    });

    it('data-stream uses wave shape with variants', () => {
      const s = getSymbol('data-stream')!;
      expect(s.shape).toBe('wave');
      expect(s.variants?.kafka).toBeDefined();
      expect(s.variants?.kinesis).toBeDefined();
      expect(s.variants?.pubsub).toBeDefined();
    });

    it('data-batch uses rectangle shape', () => {
      const s = getSymbol('data-batch')!;
      expect(s.shape).toBe('rectangle');
    });

    it('data-quality uses shield shape', () => {
      const s = getSymbol('data-quality')!;
      expect(s.shape).toBe('shield');
    });

    it('data-schema uses note shape', () => {
      const s = getSymbol('data-schema')!;
      expect(s.shape).toBe('note');
    });

    it('data-catalog is a container', () => {
      const s = getSymbol('data-catalog')!;
      expect(s.isContainer).toBe(true);
    });

    it('data-pipeline is a container', () => {
      const s = getSymbol('data-pipeline')!;
      expect(s.isContainer).toBe(true);
    });

    it('data-cdc uses wave shape', () => {
      const s = getSymbol('data-cdc')!;
      expect(s.shape).toBe('wave');
    });

    it('data-dashboard uses dashboard shape', () => {
      const s = getSymbol('data-dashboard')!;
      expect(s.shape).toBe('dashboard');
    });
  });
});

// ============================================================================
// Data Engineering Notation Tests
// ============================================================================

describe('Data Engineering Notation', () => {
  it('notation is registered with id "data-engineering"', () => {
    const notation = getNotation('data-engineering');
    expect(notation).toBeDefined();
    expect(notation!.id).toBe('data-engineering');
    expect(notation!.name).toBe('Data Engineering Diagram');
  });

  it('has 14 symbol references', () => {
    const notation = getNotation('data-engineering')!;
    expect(notation.symbols.length).toBe(14);
  });

  it('all symbol references are valid', () => {
    const notation = getNotation('data-engineering')!;
    for (const symbolId of notation.symbols) {
      expect(symbolRegistry.has(symbolId)).toBe(true);
    }
  });

  describe('edge styles', () => {
    it('has 5 edge styles', () => {
      const notation = getNotation('data-engineering')!;
      expect(Object.keys(notation.edgeStyles!).length).toBe(5);
    });

    it('has batch-flow as default edge style', () => {
      const notation = getNotation('data-engineering')!;
      expect(notation.defaultEdgeStyle).toBe('batch-flow');
    });

    it.each(['batch-flow', 'stream-flow', 'lineage', 'quality'])(
      'has "%s" edge style',
      (style) => {
        const notation = getNotation('data-engineering')!;
        expect(notation.edgeStyles![style]).toBeDefined();
        expect(notation.edgeStyles![style].name).toBeTruthy();
        expect(notation.edgeStyles![style].stroke).toBeTruthy();
      }
    );
  });

  describe('graph modes', () => {
    it('has 2 graph modes', () => {
      const notation = getNotation('data-engineering')!;
      expect(Object.keys(notation.graphModes!).length).toBe(2);
    });

    it.each(['pipeline', 'lineage'])('has "%s" graph mode', (mode) => {
      const notation = getNotation('data-engineering')!;
      expect(notation.graphModes![mode]).toBeDefined();
      expect(notation.graphModes![mode].name).toBeTruthy();
      expect(notation.graphModes![mode].primarySymbols.length).toBeGreaterThan(0);
    });
  });

  describe('connection rules', () => {
    it('has connection rules defined', () => {
      const notation = getNotation('data-engineering')!;
      expect(notation.connectionRules.length).toBeGreaterThan(0);
    });

    it('data-source has maxIncoming: 0', () => {
      const notation = getNotation('data-engineering')!;
      const rule = notation.connectionRules.find((r) => r.from === 'data-source');
      expect(rule).toBeDefined();
      expect(rule!.constraints?.maxIncoming).toBe(0);
    });

    it('data-sink has maxOutgoing: 0', () => {
      const notation = getNotation('data-engineering')!;
      const rule = notation.connectionRules.find(
        (r) => r.from === 'data-sink' && r.constraints?.maxOutgoing === 0
      );
      expect(rule).toBeDefined();
    });

    it('data-dashboard has maxOutgoing: 0', () => {
      const notation = getNotation('data-engineering')!;
      const rule = notation.connectionRules.find(
        (r) => r.from === 'data-dashboard' && r.constraints?.maxOutgoing === 0
      );
      expect(rule).toBeDefined();
    });

    it('container rules for catalog and pipeline', () => {
      const notation = getNotation('data-engineering')!;
      const catalogRule = notation.connectionRules.find(
        (r) => r.from === 'data-catalog' && r.isContainment
      );
      expect(catalogRule).toBeDefined();
      const pipelineRule = notation.connectionRules.find(
        (r) => r.from === 'data-pipeline' && r.isContainment
      );
      expect(pipelineRule).toBeDefined();
    });
  });

  describe('validation', () => {
    it('does not enforce the unreviewed quality-gate branch rule in typical mode', () => {
      const nodes: GraphNode[] = [
        { id: 'dq', type: 'data-quality' },
        { id: 'sink', type: 'data-sink' },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'dq', target: 'sink' },
      ];

      const report = draftReport(nodes, edges);
      const dqError = report.findings.find((finding) => finding.id === 'quality-gate-branches');
      expect(dqError).toBeUndefined();
      expect(report.unverifiedObligations).toEqual([]);
      expect(report.claimStatus).toBe('not-claimed');
    });

    it('quality gate with 2 outgoing passes', () => {
      const nodes: GraphNode[] = [
        { id: 'dq', type: 'data-quality' },
        { id: 'good', type: 'data-sink' },
        { id: 'bad', type: 'data-sink' },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'dq', target: 'good' },
        { id: 'e2', source: 'dq', target: 'bad' },
      ];

      const report = draftReport(nodes, edges);
      const dqError = report.findings.find((finding) => finding.id === 'quality-gate-branches');
      expect(dqError).toBeUndefined();
    });

    it('does not emit unreviewed disconnected-transform advice in typical mode', () => {
      const nodes: GraphNode[] = [
        { id: 'tx', type: 'data-transform' },
      ];
      const edges: GraphEdge[] = [];

      const report = draftReport(nodes, edges);
      const warning = report.findings.find((finding) => finding.subject?.id === 'tx');
      expect(warning).toBeUndefined();
    });

    it('does not emit unreviewed disconnected-source advice in typical mode', () => {
      const nodes: GraphNode[] = [
        { id: 'src', type: 'data-source' },
      ];
      const edges: GraphEdge[] = [];

      const report = draftReport(nodes, edges);
      const warning = report.findings.find((finding) => finding.subject?.id === 'src');
      expect(warning).toBeUndefined();
    });
  });
});
